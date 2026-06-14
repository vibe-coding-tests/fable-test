import { Sim } from '../core/sim';
import type { Unit } from '../core/unit';
import { REG } from '../core/registry';
import type { EffectNode, GameSave, ProjectileSpec, SoundArchetype, VfxSpec } from '../core/types';
import { VfxManager } from './vfx';
import { buildUnitRig, type UnitRig } from './models';
import { animateRig, newAnimState, type AnimState } from './animator';
import { lodForDistance, shouldAnimateAtLod, type LodTier } from './lod';
import { ProceduralAudio } from './audio';
import { WORLD_SCALE } from './scale';
import { TUNING } from '../data/tuning';

// ------------------------------------------------------------------
// Visual performance harness (Phase 6 §3.16). The headless budget test
// proves the sim core is cheap; this proves the *render-side* layer —
// the VFX projectile pool, the skeletal animator under LOD, and the
// capped voice pool — holds up at the target load: 30 animating units +
// ~200 live projectiles. It runs without a GL context by driving the
// GL-free systems (VfxManager / rigs / animateRig / ProceduralAudio)
// exactly as GameScene.update would, minus renderer.render.
//
// The scene is deliberately *stable*: the two teams sit out of aggro
// range and projectiles fly outward into empty space, so the load stays
// at 30 units / 200 projectiles for the whole run rather than decaying
// as a real fight resolves. Stable load is what makes recorded frame
// numbers comparable across runs.
// ------------------------------------------------------------------

const HERO_POOL = [
  'juggernaut', 'crystal-maiden', 'pudge', 'earthshaker', 'sniper', 'lich',
  'luna', 'sven', 'axe', 'jakiro', 'omniknight', 'windranger'
];

const STRESS_VFX: VfxSpec = { archetype: 'projectile', color: '#88ccff', scale: 0.45 };

// Short range/high speed → ~1s lifetime, so the pool churns continuously
// (spawn ≈ expire every frame) instead of one slow 200-projectile wave.
const PROJ_SPEC: ProjectileSpec = (() => {
  const onHit: EffectNode[] = [{ kind: 'damage', dtype: 'magical', amount: 1, target: 'target' }];
  return { model: 'linear', speed: 1800, width: 40, range: 1800, onHit, disjointable: false };
})();

const VOICE_SOUNDS: SoundArchetype[] = ['blade', 'bow', 'impact', 'frost', 'fire', 'storm', 'void', 'heal', 'summon', 'item', 'roar', 'lightning'];
const VOICE_TIMBRES = ['sharp', 'bright', 'cold', 'warm', 'deep', 'booming', 'gravel', 'ethereal'];

export interface PerfHarnessOpts {
  units?: number;
  projectiles?: number;
  voiceCap?: number;
  seed?: number;
}

export interface PerfReport {
  units: number;
  projectiles: number;
  frames: number;
  simTicks: number;
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  estFps: number;
  /** Total projectile objects ever constructed by the VFX layer. */
  projectileAllocations: number;
  /** Projectile objects constructed during the measured (post-warmup) window — should be 0. */
  steadyStateAllocations: number;
  pooledProjectiles: number;
  liveProjectiles: number;
  lod: { full: number; reduced: number; culled: number };
  peakVoices: number;
  voiceCap: number;
  hash: string;
}

interface RigView {
  rig: UnitRig;
  anim: AnimState;
}

export class PerfHarness {
  readonly sim: Sim;
  readonly vfx: VfxManager;
  readonly audio: ProceduralAudio;
  readonly targetProjectiles: number;
  readonly voiceCap: number;

  private views = new Map<number, RigView>();
  private team0: Unit[] = [];
  private team1: Unit[] = [];
  private camX = 0;
  private camZ = 0;
  private frameParity = 0;
  private projCursor = 0;
  private voiceCursor = 0;
  private accumulator = 0;
  private lastLod = { full: 0, reduced: 0, culled: 0 };

  constructor(opts: PerfHarnessOpts = {}) {
    const unitCount = opts.units ?? 30;
    this.targetProjectiles = opts.projectiles ?? 200;
    this.voiceCap = opts.voiceCap ?? TUNING.audioVoiceCap;
    this.sim = new Sim({ seed: opts.seed ?? 7777, bounds: { w: 9000, h: 9000 } });
    this.vfx = new VfxManager(() => 0); // flat field; height is irrelevant to perf
    this.audio = new ProceduralAudio(perfSettings(), this.voiceCap);
    this.audio.unlock(); // headless: enables the voice pool without an AudioContext

    // Two teams parked ~5000 units apart — beyond aggro, so nobody engages
    // and the scene holds a stable 30 units for the whole measurement.
    for (let i = 0; i < unitCount; i++) {
      const team = i % 2;
      const sideIdx = Math.floor(i / 2);
      const baseX = team === 0 ? 1500 : 7500;
      const y = 1200 + sideIdx * 460;
      const u = this.sim.spawnHero(REG.hero(HERO_POOL[i % HERO_POOL.length]), {
        team,
        pos: { x: baseX + (sideIdx % 3) * 90, y },
        level: 24,
        ctrl: { kind: 'creep', homePos: { x: baseX, y } }
      });
      (team === 0 ? this.team0 : this.team1).push(u);
    }

    const focus = this.team0[0] ?? this.sim.unitsArr[0];
    this.camX = focus.pos.x / WORLD_SCALE;
    this.camZ = focus.pos.y / WORLD_SCALE;

    this.topUpProjectiles();
    this.drainToLayers();
  }

  /** One render frame: fixed-step the sim, route events, animate under LOD. */
  step(renderDt: number): void {
    this.frameParity ^= 1;

    this.accumulator += renderDt;
    let guard = 0;
    while (this.accumulator >= this.sim.dt && guard < TUNING.maxSimTicksPerFrame) {
      this.sim.tick();
      this.accumulator -= this.sim.dt;
      guard++;
    }

    this.topUpProjectiles();
    this.emitVoices();
    this.drainToLayers();

    // camera eases toward the active unit, like GameScene.updateCamera
    const focus = this.firstAlive(this.team0) ?? this.sim.unitsArr[0];
    if (focus) {
      const k = Math.min(1, renderDt * 6);
      this.camX += (focus.pos.x / WORLD_SCALE - this.camX) * k;
      this.camZ += (focus.pos.y / WORLD_SCALE - this.camZ) * k;
    }

    this.animateUnits(renderDt);

    // Projectile objects carry { pid, pos } already — pass the live array directly
    // (no per-frame mapping/allocation, matching GameScene.update).
    this.vfx.syncProjectiles(this.sim.projectiles);
    this.vfx.syncZoneFollow((uid) => {
      const u = this.sim.unit(uid);
      return u ? { x: u.pos.x, y: u.pos.y, h: 0 } : null;
    });
    this.vfx.update(renderDt);
  }

  report(extra: { frames: number; simTicks: number; avgFrameMs: number; p95FrameMs: number; maxFrameMs: number; steadyStateAllocations: number }): PerfReport {
    return {
      units: this.sim.unitsArr.length,
      projectiles: this.targetProjectiles,
      frames: extra.frames,
      simTicks: extra.simTicks,
      avgFrameMs: extra.avgFrameMs,
      p95FrameMs: extra.p95FrameMs,
      maxFrameMs: extra.maxFrameMs,
      estFps: extra.avgFrameMs > 0 ? 1000 / extra.avgFrameMs : Infinity,
      projectileAllocations: this.vfx.projectileAllocations(),
      steadyStateAllocations: extra.steadyStateAllocations,
      pooledProjectiles: this.vfx.pooledProjectileCount(),
      liveProjectiles: this.sim.projectiles.length,
      lod: { ...this.lastLod },
      peakVoices: this.audio.peakVoiceCount(),
      voiceCap: this.voiceCap,
      hash: this.sim.hash()
    };
  }

  dispose(): void {
    this.audio.dispose();
    this.vfx.reset();
  }

  // ---------- internals ----------

  private animateUnits(dt: number): void {
    const lod = { full: 0, reduced: 0, culled: 0 };
    for (const u of this.sim.unitsArr) {
      if (!u.alive) continue;
      let view = this.views.get(u.uid);
      if (!view) {
        view = this.makeView(u);
        this.views.set(u.uid, view);
      }
      const wx = u.pos.x / WORLD_SCALE;
      const wz = u.pos.y / WORLD_SCALE;
      view.rig.root.position.set(wx, 0, wz);
      const tier: LodTier = lodForDistance(Math.hypot(wx - this.camX, wz - this.camZ));
      lod[tier]++;
      if (shouldAnimateAtLod(tier, this.frameParity)) {
        animateRig(view.rig, u, view.anim, dt, this.sim.time, this.sim.time);
      }
    }
    this.lastLod = lod;
  }

  private makeView(u: Unit): RigView {
    const hero = u.heroId ? REG.hero(u.heroId) : undefined;
    const sil = hero?.silhouette ?? { build: 'biped' as const, scale: 1 };
    const palette = hero?.palette ?? (['#888899', '#666677', '#aaaabb'] as [string, string, string]);
    return { rig: buildUnitRig(sil, palette), anim: newAnimState() };
  }

  private firstAlive(list: Unit[]): Unit | null {
    for (const u of list) if (u.alive) return u;
    return null;
  }

  private topUpProjectiles(): void {
    const deficit = this.targetProjectiles - this.sim.projectiles.length;
    for (let i = 0; i < deficit; i++) {
      const fromTeam0 = this.projCursor % 2 === 0;
      const pool = fromTeam0 ? this.team0 : this.team1;
      const caster = pool.length ? pool[(this.projCursor >> 1) % pool.length] : this.sim.unitsArr[0];
      this.projCursor++;
      if (!caster || !caster.alive) continue;
      // fire outward, away from the enemy line, so projectiles expire on range
      const dir = caster.team === 0 ? -1 : 1;
      const offset = ((this.projCursor * 53) % 1200) - 600;
      this.sim.spawnProjectile(
        caster,
        { defId: 'perf-proj', level: 1, vfx: STRESS_VFX },
        PROJ_SPEC,
        { toPoint: { x: caster.pos.x + dir * 3600, y: caster.pos.y + offset } }
      );
    }
  }

  /** Feed the capped voice pool a steady trickle of casts, like a live teamfight. */
  private emitVoices(): void {
    for (let n = 0; n < 3; n++) {
      const u = this.sim.unitsArr[this.voiceCursor % this.sim.unitsArr.length];
      this.voiceCursor++;
      if (!u || !u.alive) continue;
      this.audio.handleEvent({
        t: 'cast',
        uid: u.uid,
        abilityId: 'perf-cast',
        vfx: STRESS_VFX,
        sound: VOICE_SOUNDS[this.voiceCursor % VOICE_SOUNDS.length],
        timbre: VOICE_TIMBRES[this.voiceCursor % VOICE_TIMBRES.length]
      });
    }
  }

  private drainToLayers(): void {
    for (const ev of this.sim.events.drain()) {
      this.vfx.handleEvent(ev, (uid) => {
        const u = this.sim.unit(uid);
        return u ? { x: u.pos.x, y: u.pos.y, h: 0 } : null;
      });
      this.audio.handleEvent(ev);
    }
  }
}

function perfSettings(): GameSave['settings'] {
  return { quickcast: true, audio: { master: 0.8, sfx: 0.8, voice: 0.8, stinger: 0.8, music: 0.8, muted: false } };
}

/**
 * Build + warm + measure the harness. `warmupFrames` lets the projectile pool
 * reach its high-water mark before timing, so `steadyStateAllocations` reflects
 * only the measured window (it should be 0 — the pool reuses every object).
 */
export function runPerfHarness(opts: PerfHarnessOpts & { warmupFrames?: number; measureFrames?: number; renderDt?: number } = {}): PerfReport {
  const renderDt = opts.renderDt ?? 1 / 60;
  // Warm long enough that the ~1s-lifetime projectiles reach full spawn≈expire
  // churn before timing, so the measured window is pure steady state.
  const warmup = opts.warmupFrames ?? 120;
  const measure = opts.measureFrames ?? 150;
  const h = new PerfHarness(opts);

  for (let i = 0; i < warmup; i++) h.step(renderDt);
  const allocAfterWarmup = h.vfx.projectileAllocations();

  const frameMs: number[] = [];
  for (let i = 0; i < measure; i++) {
    const t0 = performance.now();
    h.step(renderDt);
    frameMs.push(performance.now() - t0);
  }
  const steadyStateAllocations = h.vfx.projectileAllocations() - allocAfterWarmup;

  const sorted = [...frameMs].sort((a, b) => a - b);
  const sum = frameMs.reduce((a, b) => a + b, 0);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const report = h.report({
    frames: measure,
    simTicks: Math.round((measure * renderDt) / h.sim.dt),
    avgFrameMs: sum / measure,
    p95FrameMs: p95,
    maxFrameMs: sorted[sorted.length - 1],
    steadyStateAllocations
  });
  h.dispose();
  return report;
}
