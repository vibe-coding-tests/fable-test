import * as THREE from 'three';
import type { AttackVisualSpec, SimEvent, Vec2, VfxSpec } from '../core/types';
import { WORLD_SCALE } from './scale';
import { PERFORMANCE_BUDGET } from './performance';
import { loadTex } from './asset-loaders';

// ------------------------------------------------------------------
// Procedural VFX (SPEC §3): ~12 archetypes parameterized by color,
// scale, and duration. Sim events drive everything; no per-spell art.
// ------------------------------------------------------------------

interface Transient {
  obj: THREE.Object3D;
  until: number;
  update?: (t: number, lifeT: number) => void; // lifeT 0..1
  release?: () => void;
}

type ProjKind = 'hook' | 'orb';

/** A reusable projectile object. Pooled so spawns don't allocate per cast (§3.16). */
interface PooledProjectile {
  obj: THREE.Group;
  kind: ProjKind;
  core: THREE.MeshBasicMaterial;
  halo?: THREE.MeshBasicMaterial;
  trail: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  trailPos: Float32Array;
  trailVerts: Float32Array;
  trailCol: Float32Array;
}

interface PooledBurstRing {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  material: THREE.MeshBasicMaterial;
}

interface PooledBurstSparks {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  material: THREE.PointsMaterial;
  positions: Float32Array;
  dirs: Float32Array;
}

const TRAIL_LEN = 12;
const BURST_SPARKS = 14;

const geometryCache = new Map<string, THREE.BufferGeometry>();
let beamRampTex: THREE.DataTexture | null = null;
let beamRampAssetTex: THREE.Texture | null = null;
export const VFX_BEAM_RAMP_URL = '/assets/vfx/beam_ramp.webp';

function sharedGeometry<T extends THREE.BufferGeometry>(geo: T): T {
  const key = `${geo.type}:${JSON.stringify((geo as T & { parameters?: unknown }).parameters ?? {})}`;
  const cached = geometryCache.get(key);
  if (cached) {
    geo.dispose();
    return cached as T;
  }
  geometryCache.set(key, geo);
  return geo;
}

export function vfxGeometryCacheSize(): number {
  return geometryCache.size;
}

function beamRampTexture(): THREE.Texture {
  // A shipped ramp asset (WS-E) wins on medium+ tiers; the procedural DataTexture
  // below stays the guaranteed fallback (boot floor / headless / missing file).
  if (beamRampAssetTex) return beamRampAssetTex;
  if (beamRampTex) return beamRampTex;
  const w = 32;
  const h = 2;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const endFade = Math.sin(Math.PI * u);
      const core = 0.28 + endFade * 0.72;
      const i = (y * w + x) * 4;
      // alphaMap reads luminance/green; keep RGB as the soft beam profile.
      data[i] = data[i + 1] = data[i + 2] = Math.floor(255 * core);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  beamRampTex = tex;
  return tex;
}

/** Install a loaded beam/trail ramp (WS-E). The procedural ramp stays the fallback if absent. */
export function installVfxBeamRamp(texture: THREE.Texture): void {
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  beamRampAssetTex = texture;
}

/** Best-effort medium+ enhancement. Resolves false when the asset is absent/headless. */
export async function loadVfxBeamRamp(url = VFX_BEAM_RAMP_URL): Promise<boolean> {
  const texture = await loadTex(url, { srgb: false });
  if (!texture) return false;
  installVfxBeamRamp(texture);
  return true;
}

// Numerically-built sprite textures (GRAPHICS_SPEC §7). DataTexture needs no DOM
// or GL context, so the headless VFX/perf tests keep working. WS-H adds a small
// family so fire/frost/storm bursts throw shaped particles (ember/snow/shard)
// instead of all sharing one round dot. White luminance; the material tints it.
export type SpriteKind = 'soft' | 'ember' | 'snow' | 'shard';
export type TelegraphKind = 'ring' | 'spiked' | 'hatched' | 'dotted';

interface AtlasRegion { x: number; y: number; w: number; h: number }

export const VFX_ATLAS_URL = '/assets/vfx/vfx_atlas.webp';
export const VFX_ATLAS_REGIONS: {
  sprites: Record<SpriteKind, AtlasRegion>;
  telegraphs: Record<TelegraphKind, AtlasRegion>;
} = {
  sprites: {
    soft: { x: 0, y: 0.5, w: 0.25, h: 0.5 },
    ember: { x: 0.25, y: 0.5, w: 0.25, h: 0.5 },
    snow: { x: 0.5, y: 0.5, w: 0.25, h: 0.5 },
    shard: { x: 0.75, y: 0.5, w: 0.25, h: 0.5 }
  },
  telegraphs: {
    ring: { x: 0, y: 0, w: 0.25, h: 0.5 },
    spiked: { x: 0.25, y: 0, w: 0.25, h: 0.5 },
    hatched: { x: 0.5, y: 0, w: 0.25, h: 0.5 },
    dotted: { x: 0.75, y: 0, w: 0.25, h: 0.5 }
  }
};

const SPRITE_TEX: Partial<Record<SpriteKind, THREE.Texture>> = {};
const TELEGRAPH_TEX: Partial<Record<TelegraphKind, THREE.Texture>> = {};
const SPRITE_ASSET_TEX: Partial<Record<SpriteKind, THREE.Texture>> = {};
const TELEGRAPH_ASSET_TEX: Partial<Record<TelegraphKind, THREE.Texture>> = {};

function atlasFrame(base: THREE.Texture, region: AtlasRegion): THREE.Texture {
  const tex = base.clone();
  tex.offset.set(region.x, region.y);
  tex.repeat.set(region.w, region.h);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Install a loaded VFX atlas. Procedural DataTextures remain the fallback if absent. */
export function installVfxTextureAtlas(texture: THREE.Texture): void {
  texture.colorSpace = THREE.NoColorSpace;
  for (const kind of Object.keys(VFX_ATLAS_REGIONS.sprites) as SpriteKind[]) {
    SPRITE_ASSET_TEX[kind] = atlasFrame(texture, VFX_ATLAS_REGIONS.sprites[kind]);
  }
  for (const kind of Object.keys(VFX_ATLAS_REGIONS.telegraphs) as TelegraphKind[]) {
    TELEGRAPH_ASSET_TEX[kind] = atlasFrame(texture, VFX_ATLAS_REGIONS.telegraphs[kind]);
  }
}

/** Best-effort medium+ enhancement. Resolves false when assets are absent/headless. */
export async function loadVfxTextureAtlas(url = VFX_ATLAS_URL): Promise<boolean> {
  const texture = await loadTex(url, { srgb: false, anisotropy: 2 });
  if (!texture) return false;
  installVfxTextureAtlas(texture);
  return true;
}

export function vfxTextureAssetState(): { sprites: number; telegraphs: number; beamRamp: number; proceduralSprites: number; proceduralTelegraphs: number; proceduralBeamRamp: number } {
  return {
    sprites: Object.keys(SPRITE_ASSET_TEX).length,
    telegraphs: Object.keys(TELEGRAPH_ASSET_TEX).length,
    beamRamp: beamRampAssetTex ? 1 : 0,
    proceduralSprites: Object.keys(SPRITE_TEX).length,
    proceduralTelegraphs: Object.keys(TELEGRAPH_TEX).length,
    proceduralBeamRamp: beamRampTex ? 1 : 0
  };
}

function spriteAlpha(kind: SpriteKind, nx: number, ny: number): number {
  const d = Math.hypot(nx, ny); // 0 at center, 1 at edge
  switch (kind) {
    case 'ember': {
      // Hot tight core with a soft falloff — reads as a spark.
      const core = Math.max(0, 1 - d * 1.4);
      return Math.min(1, core * core * 1.3);
    }
    case 'snow': {
      // Six-point flake: radial falloff modulated by an angular star.
      const ang = Math.atan2(ny, nx);
      const star = 0.55 + 0.45 * Math.cos(ang * 6);
      return Math.max(0, 1 - d) * star;
    }
    case 'shard': {
      // Diamond: alpha by Manhattan distance, so the sprite is angular.
      const m = Math.abs(nx) + Math.abs(ny);
      return Math.max(0, 1 - m);
    }
    default: {
      const a = Math.max(0, 1 - d);
      return a * a;
    }
  }
}
function particleSprite(kind: SpriteKind = 'soft'): THREE.Texture {
  const asset = SPRITE_ASSET_TEX[kind];
  if (asset) return asset;
  const hit = SPRITE_TEX[kind];
  if (hit) return hit;
  const s = 32;
  const data = new Uint8Array(s * s * 4);
  const c = (s - 1) / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const a = spriteAlpha(kind, (x - c) / c, (y - c) / c);
      const i = (y * s + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.floor(255 * Math.max(0, Math.min(1, a)));
    }
  }
  const tex = new THREE.DataTexture(data, s, s);
  tex.needsUpdate = true;
  return (SPRITE_TEX[kind] = tex);
}

// Ground telegraph decals: a small family selected by archetype so a stun ring,
// a wall line, and a mine field each read differently on the ground instead of
// sharing one disc (VFX_OVERHAUL WS-H). White luminance; the material tints it.
function telegraphAlpha(kind: TelegraphKind, d: number, ang: number): number {
  if (d >= 1) return 0;
  const fill = 0.16 * (1 - d * 0.6);
  switch (kind) {
    case 'spiked': {
      // Bright rim with radial spikes pointing inward — the stun/displace read.
      const rim = Math.max(0, 1 - Math.abs(d - 0.9) / 0.12) * 0.95;
      const teeth = (Math.abs((ang * 6 / Math.PI) % 1) < 0.12 && d > 0.55) ? 0.6 * (1 - d) : 0;
      return Math.min(1, fill + rim + teeth);
    }
    case 'hatched': {
      // Diagonal hatching inside a soft rim — the danger-line / wall read.
      const rim = Math.max(0, 1 - Math.abs(d - 0.92) / 0.1) * 0.7;
      const hatch = (Math.abs(((ang * 4 / Math.PI) + d * 6) % 1) < 0.22 && d < 0.92) ? 0.28 : 0;
      return Math.min(1, fill + rim + hatch);
    }
    case 'dotted': {
      // Dashed proximity ring — the mine/trap read.
      const dash = (Math.abs((ang * 7 / Math.PI) % 1) < 0.5) ? 1 : 0;
      const rim = Math.max(0, 1 - Math.abs(d - 0.9) / 0.08) * 0.95 * dash;
      return Math.min(1, fill * 0.6 + rim);
    }
    default: {
      const rim = Math.max(0, 1 - Math.abs(d - 0.9) / 0.1) * 0.9;
      const spoke = (Math.abs((ang * 3) % 1) < 0.06 && d > 0.5) ? 0.25 : 0;
      return Math.min(1, fill + rim + spoke);
    }
  }
}
function telegraphTexture(kind: TelegraphKind = 'ring'): THREE.Texture {
  const asset = TELEGRAPH_ASSET_TEX[kind];
  if (asset) return asset;
  const hit = TELEGRAPH_TEX[kind];
  if (hit) return hit;
  const s = 64;
  const data = new Uint8Array(s * s * 4);
  const c = (s - 1) / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = Math.min(1, Math.hypot(x - c, y - c) / c);
      const ang = Math.atan2(y - c, x - c);
      const a = telegraphAlpha(kind, d, ang);
      const i = (y * s + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.floor(255 * Math.max(0, Math.min(1, a)));
    }
  }
  const tex = new THREE.DataTexture(data, s, s);
  tex.needsUpdate = true;
  return (TELEGRAPH_TEX[kind] = tex);
}

/** Pick the telegraph decal that best reads for a given vfx archetype (WS-H). */
function telegraphKindFor(archetype: string, wall = false): TelegraphKind {
  if (wall) return 'hatched';
  switch (archetype) {
    case 'mine': return 'dotted';
    case 'stun-stars': return 'spiked';
    case 'wall': return 'hatched';
    default: return 'ring';
  }
}

export class VfxManager {
  group = new THREE.Group();
  private transients: Transient[] = [];
  private projectiles = new Map<number, PooledProjectile>();
  private projectilePool: Record<ProjKind, PooledProjectile[]> = { hook: [], orb: [] };
  private burstRingPool: PooledBurstRing[] = [];
  private burstSparksPool: PooledBurstSparks[] = [];
  private projAllocated = 0; // total projectile objects ever constructed (steady-state should plateau)
  private projectileSeen = new Set<number>();
  private zones = new Map<number, Transient>();
  private time = 0;

  constructor(private heightAt: (x: number, y: number) => number, private transientCap: number = PERFORMANCE_BUDGET.transientVfxCap) {}

  setTransientCap(cap: number): void {
    this.transientCap = Math.max(0, Math.floor(cap));
    while (this.transients.length > this.transientCap) {
      const old = this.transients.shift();
      if (old) {
        this.group.remove(old.obj);
        old.release?.();
      }
    }
  }

  private w(x: number, y: number, lift = 0): THREE.Vector3 {
    return new THREE.Vector3(x / WORLD_SCALE, this.heightAt(x, y) + lift, y / WORLD_SCALE);
  }

  attackVisual(visual: AttackVisualSpec, from: Vec2, to: Vec2): void {
    switch (visual.kind) {
      case 'cleave-sweep':
        this.cleaveSweep(from, to, visual);
        break;
      case 'ranged-conversion':
        this.attackBeam(from, to, visual, 0.16);
        break;
      case 'lightning-bounce':
        this.lightning(from, to, visual);
        break;
      case 'tinted-impact':
        this.burst(to.x, to.y, visual.color, 0.7 * (visual.scale ?? 1), 0.28, visual.color2);
        this.impactDecal(to.x, to.y, visual.color, 0.55 * (visual.scale ?? 1), 0.32);
        break;
      case 'crit-lunge':
        this.critSlash(from, to, visual);
        break;
      case 'armor-shred-flash':
        this.armorShredFlash(from, to, visual);
        break;
    }
  }

  orderPing(point: Vec2, kind: 'move' | 'attack-move' | 'attack-unit', queued = false): void {
    const color = kind === 'attack-move' || kind === 'attack-unit' ? '#ff7a3a' : '#7adfff';
    const radius = kind === 'attack-move' ? 0.95 : kind === 'attack-unit' ? 0.7 : 0.78;
    this.impactDecal(point.x, point.y, color, queued ? radius * 0.78 : radius, queued ? 0.42 : 0.34);
    if (kind === 'attack-move') this.pillar(point.x, point.y, color, 0.34);
    else this.blinkMark(point.x, point.y, color);
  }

  handleEvent(ev: SimEvent, unitPos: (uid: number) => { x: number; y: number; h: number } | null): void {
    switch (ev.t) {
      case 'projectile-spawn': {
        const entry = this.acquireProjectile(ev.vfx);
        const p = this.w(ev.from.x, ev.from.y, 1.2);
        entry.obj.position.copy(p);
        this.initTrail(entry, p);
        this.group.add(entry.obj, entry.trail);
        this.projectiles.set(ev.pid, entry);
        break;
      }
      case 'projectile-hit':
      case 'projectile-block':
      case 'projectile-expire': {
        const entry = this.projectiles.get(ev.pid);
        if (entry) {
          this.releaseProjectile(entry);
          this.projectiles.delete(ev.pid);
          if (ev.t === 'projectile-hit') {
            this.burst(ev.pos.x, ev.pos.y, '#ffffff', 0.6, 0.25);
            this.impactDecal(ev.pos.x, ev.pos.y, '#ffffff', 0.48, 0.3);
          } else if (ev.t === 'projectile-block') {
            const color = ev.feedback?.impactVfx === 'shield' ? '#bfeaff' : ev.feedback?.impactVfx === 'spark' ? '#ffe27d' : '#c8b08a';
            this.burst(ev.pos.x, ev.pos.y, color, 0.55, 0.22);
            this.impactDecal(ev.pos.x, ev.pos.y, color, 0.42, 0.28);
          } else {
            this.burst(ev.pos.x, ev.pos.y, '#b8c6d8', 0.28, 0.14);
          }
        }
        break;
      }
      case 'zone-spawn': {
        this.spawnZone(ev);
        break;
      }
      case 'zone-expire': {
        const z = this.zones.get(ev.zid);
        if (z) {
          this.group.remove(z.obj);
          this.zones.delete(ev.zid);
        }
        break;
      }
      case 'aoe-burst': {
        this.burst(ev.pos.x, ev.pos.y, ev.vfx.color, (ev.radius / WORLD_SCALE) * 0.9, 0.45, ev.vfx.color2);
        break;
      }
      case 'blink': {
        this.blinkMark(ev.from.x, ev.from.y);
        this.blinkMark(ev.to.x, ev.to.y);
        break;
      }
      case 'cast': {
        const up = unitPos(ev.uid);
        if (up) this.castFlash(up.x, up.y, ev.vfx);
        break;
      }
      case 'capture-start': {
        const a = unitPos(ev.uid);
        const b = unitPos(ev.target);
        if (a && b) this.bindingBeam(a, b, ev.duration);
        break;
      }
      case 'capture-complete': {
        const p = unitPos(ev.target);
        if (p) this.burst(p.x, p.y, '#7adfc4', 2.2, 0.8, '#ffffff');
        break;
      }
      case 'reaction': {
        const p = unitPos(ev.uid);
        if (p) {
          const pal = this.reactionPalette(ev.reaction);
          this.burst(p.x, p.y, pal[0], 1.25, 0.42, pal[1], this.reactionSprite(ev.reaction));
          this.pillar(p.x, p.y, pal[1], 0.34);
        }
        break;
      }
      case 'tag-boon': {
        const p = unitPos(ev.uid);
        if (p) {
          const chained = ev.chain > 1;
          this.burst(p.x, p.y, chained ? '#ffe08a' : '#aee9ff', chained ? 1.35 : 1.0, 0.36, '#ffffff', chained ? 'shard' : 'soft');
          this.pillar(p.x, p.y, chained ? '#ffe08a' : '#aee9ff', 0.28);
        }
        break;
      }
      case 'off-field': {
        const p = unitPos(ev.uid);
        if (p) {
          this.impactDecal(p.x, p.y, '#aee9ff', 0.85, 0.7);
          this.pillar(p.x, p.y, '#aee9ff', 0.24);
        }
        break;
      }
      case 'swap-flat': {
        // §9: a faint, colorless puff for a gauge-down reposition swap — the dull
        // counterpart to the tag-boon arrival beat.
        const p = unitPos(ev.uid);
        if (p) this.burst(p.x, p.y, '#9aa6b2', 0.5, 0.18, '#c8d0d8', 'soft');
        break;
      }
      case 'immune-block': {
        const p = unitPos(ev.uid);
        if (p) this.burst(p.x, p.y, '#ffffff', 0.65, 0.22, '#7adf6a');
        break;
      }
      case 'summon': {
        this.burst(ev.pos.x, ev.pos.y, '#b7ffd9', 1.2, 0.5);
        break;
      }
      case 'death': {
        const p = unitPos(ev.uid);
        if (p) this.burst(p.x, p.y, '#3a3a44', 1.0, 0.6);
        break;
      }
      case 'levelup': {
        const p = unitPos(ev.uid);
        if (p) {
          this.pillar(p.x, p.y, '#ffe27d', 1.2);
          this.burst(p.x, p.y, '#ffd86a', 1.35, 0.55, '#ffffff', 'shard');
          this.impactDecal(p.x, p.y, '#ffd86a', 0.9, 0.8);
        }
        break;
      }
      case 'skill-spend': {
        const p = unitPos(ev.uid);
        if (p) {
          const color = ev.kind === 'attribute' ? '#8adf7a' : ev.kind === 'talent' ? '#d990ff' : ev.kind === 'mastery' ? '#ffd86a' : '#59c0e0';
          const accent = ev.kind === 'attribute' ? '#ffffff' : ev.kind === 'mastery' ? '#7adfc4' : '#ffd86a';
          this.burst(p.x, p.y, color, ev.kind === 'talent' || ev.kind === 'mastery' ? 1.05 : 0.82, 0.34, accent, ev.kind === 'ability' ? 'shard' : 'soft');
          this.pillar(p.x, p.y, accent, ev.kind === 'talent' || ev.kind === 'mastery' ? 0.42 : 0.28);
        }
        break;
      }
      case 'loot-drop': {
        const gradeScale = ev.grade === 'pristine' ? 1.55 : ev.grade === 'refined' ? 1.25 : 1.0;
        const scale = ev.signature ? gradeScale * 1.2 : gradeScale;
        this.pillar(ev.pos.x, ev.pos.y, ev.color, scale);
        this.burst(ev.pos.x, ev.pos.y, ev.color, 1.2 * scale, 0.7, ev.signature ? '#ffd86a' : '#ffffff', ev.signature ? 'shard' : 'soft');
        this.impactDecal(ev.pos.x, ev.pos.y, ev.color, 0.8 * scale, 0.75);
        break;
      }
      default:
        break;
    }
  }

  /** Renderer-only STORY cut-scene staging. This mirrors cast VFX without creating sim events. */
  cinematicStage(pos: Vec2, vfx: VfxSpec): void {
    this.castFlash(pos.x, pos.y, vfx);
    const radius = vfx.archetype === 'global-mark' || vfx.archetype === 'storm' ? 2.1 : 1.25;
    this.burst(pos.x, pos.y, vfx.color, radius, 0.5, vfx.color2);
    if (vfx.archetype === 'shield' || vfx.archetype === 'beam' || vfx.archetype === 'global-mark') {
      this.pillar(pos.x, pos.y, vfx.color2 ?? vfx.color, vfx.archetype === 'shield' ? 0.55 : 0.34);
    }
  }

  /** Track in-flight projectile positions from the sim each frame. */
  syncProjectiles(list: Iterable<{ pid: number; pos: { x: number; y: number } }>): void {
    const seen = this.projectileSeen;
    seen.clear();
    for (const p of list) {
      seen.add(p.pid);
      const entry = this.projectiles.get(p.pid);
      if (entry) {
        const v = this.w(p.pos.x, p.pos.y, 1.2);
        entry.obj.position.lerp(v, 0.6);
        entry.obj.rotation.y += 0.2;
        this.pushTrail(entry);
      }
    }
    for (const [pid, entry] of this.projectiles) {
      if (!seen.has(pid)) {
        this.releaseProjectile(entry);
        this.projectiles.delete(pid);
      }
    }
  }

  /** Remove every live transient, projectile, and zone from the scene graph.
   *  Used when the rendered sim is swapped (live gym fight enter/exit). */
  reset(): void {
    for (const tr of this.transients) {
      this.group.remove(tr.obj);
      tr.release?.();
    }
    this.transients.length = 0;
    for (const [, entry] of this.projectiles) this.releaseProjectile(entry);
    this.projectiles.clear();
    this.projectileSeen.clear();
    for (const [, z] of this.zones) this.group.remove(z.obj);
    this.zones.clear();
  }

  /** Total projectile objects ever constructed. Plateaus once the pool warms (§3.16). */
  projectileAllocations(): number {
    return this.projAllocated;
  }

  /** Free projectile objects currently parked in the pool (test introspection). */
  pooledProjectileCount(): number {
    return this.projectilePool.hook.length + this.projectilePool.orb.length;
  }

  /** Free burst objects currently parked in the pool (test introspection). */
  pooledBurstCount(): number {
    return this.burstRingPool.length + this.burstSparksPool.length;
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    let write = 0;
    for (let read = 0; read < this.transients.length; read++) {
      const tr = this.transients[read];
      if (t >= tr.until) {
        this.group.remove(tr.obj);
        tr.release?.();
      } else {
        this.transients[write++] = tr;
      }
    }
    this.transients.length = write;
    for (const tr of this.transients) {
      tr.update?.(t, 1 - (tr.until - t) / ((tr as Transient & { dur?: number }).dur ?? 1));
    }
    for (const [, z] of this.zones) z.update?.(t, 0);
  }

  private push(obj: THREE.Object3D, durSec: number, update?: Transient['update'], release?: Transient['release']): void {
    this.group.add(obj);
    const tr: Transient & { dur: number } = { obj, until: this.time + durSec, update, release, dur: durSec };
    this.transients.push(tr);
    while (this.transients.length > this.transientCap) {
      const old = this.transients.shift();
      if (old) {
        this.group.remove(old.obj);
        old.release?.();
      }
    }
  }

  // ---------- archetype builders ----------

  /** Take a projectile from the pool (or build one), recolored/scaled for this cast. */
  private acquireProjectile(vfx: VfxSpec): PooledProjectile {
    const kind: ProjKind = vfx.archetype === 'hook' ? 'hook' : 'orb';
    const entry = this.projectilePool[kind].pop() ?? this.buildProjectile(kind);
    entry.obj.scale.setScalar(vfx.scale ?? 1);
    entry.obj.visible = true;
    entry.core.color.set(vfx.color);
    if (entry.halo) entry.halo.color.set(vfx.color2 ?? vfx.color);
    // Bake a head-bright → tail-black gradient so the additive trail fades out.
    const col = new THREE.Color(vfx.color);
    for (let i = 0; i < TRAIL_LEN; i++) {
      const f = (i / (TRAIL_LEN - 1)) ** 1.6;
      for (let side = 0; side < 2; side++) {
        const o = (i * 2 + side) * 3;
        entry.trailCol[o] = col.r * f;
        entry.trailCol[o + 1] = col.g * f;
        entry.trailCol[o + 2] = col.b * f;
      }
    }
    entry.trail.geometry.attributes.color.needsUpdate = true;
    return entry;
  }

  /** Park a spent projectile back in the pool — no disposal, ready for reuse. */
  private releaseProjectile(entry: PooledProjectile): void {
    this.group.remove(entry.obj, entry.trail);
    entry.obj.visible = false;
    entry.trail.visible = false;
    this.projectilePool[entry.kind].push(entry);
  }

  private buildProjectile(kind: ProjKind): PooledProjectile {
    this.projAllocated++;
    const g = new THREE.Group();
    const trailPos = new Float32Array(TRAIL_LEN * 3);
    const trailVerts = new Float32Array(TRAIL_LEN * 2 * 3);
    const trailCol = new Float32Array(TRAIL_LEN * 2 * 3);
    const trailUv = new Float32Array(TRAIL_LEN * 2 * 2);
    const trailIdx: number[] = [];
    for (let i = 0; i < TRAIL_LEN; i++) {
      const u = i / (TRAIL_LEN - 1);
      trailUv[(i * 2) * 2] = u;
      trailUv[(i * 2) * 2 + 1] = 0;
      trailUv[(i * 2 + 1) * 2] = u;
      trailUv[(i * 2 + 1) * 2 + 1] = 1;
      if (i < TRAIL_LEN - 1) {
        const a = i * 2;
        trailIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(trailVerts, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
    tg.setAttribute('uv', new THREE.BufferAttribute(trailUv, 2));
    tg.setIndex(trailIdx);
    const trail = new THREE.Mesh(
      tg,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        alphaMap: beamRampTexture(),
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    trail.frustumCulled = false;
    if (kind === 'hook') {
      const core = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      g.add(new THREE.Mesh(sharedGeometry(new THREE.TorusGeometry(0.35, 0.1, 5, 8, Math.PI * 1.5)), core));
      return { obj: g, kind, core, trail, trailPos, trailVerts, trailCol };
    }
    // Additive core + halo so the orb reads as a glowing magic projectile.
    const core = new THREE.MeshBasicMaterial({ color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    g.add(new THREE.Mesh(sharedGeometry(new THREE.SphereGeometry(0.26, 8, 6)), core));
    g.add(new THREE.Mesh(sharedGeometry(new THREE.SphereGeometry(0.5, 8, 6)), halo));
    return { obj: g, kind, core, halo, trail, trailPos, trailVerts, trailCol };
  }

  /** Reset a projectile's trail to a single point (call on spawn). */
  private initTrail(entry: PooledProjectile, p: THREE.Vector3): void {
    for (let i = 0; i < TRAIL_LEN; i++) {
      entry.trailPos[i * 3] = p.x;
      entry.trailPos[i * 3 + 1] = p.y;
      entry.trailPos[i * 3 + 2] = p.z;
    }
    this.updateTrailRibbon(entry);
    entry.trail.geometry.attributes.position.needsUpdate = true;
    entry.trail.visible = true;
  }

  /** Slide the trail buffer one step and append the projectile's head pos. */
  private pushTrail(entry: PooledProjectile): void {
    const a = entry.trailPos;
    a.copyWithin(0, 3);
    const h = entry.obj.position;
    a[(TRAIL_LEN - 1) * 3] = h.x;
    a[(TRAIL_LEN - 1) * 3 + 1] = h.y;
    a[(TRAIL_LEN - 1) * 3 + 2] = h.z;
    this.updateTrailRibbon(entry);
    entry.trail.geometry.attributes.position.needsUpdate = true;
  }

  private updateTrailRibbon(entry: PooledProjectile): void {
    const centers = entry.trailPos;
    const verts = entry.trailVerts;
    const scale = entry.obj.scale.x || 1;
    for (let i = 0; i < TRAIL_LEN; i++) {
      const prev = Math.max(0, i - 1);
      const next = Math.min(TRAIL_LEN - 1, i + 1);
      const dx = centers[next * 3] - centers[prev * 3];
      const dz = centers[next * 3 + 2] - centers[prev * 3 + 2];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const t = i / (TRAIL_LEN - 1);
      const width = (0.035 + t * 0.16) * scale;
      const cx = centers[i * 3];
      const cy = centers[i * 3 + 1];
      const cz = centers[i * 3 + 2];
      const l = i * 2 * 3;
      verts[l] = cx + nx * width;
      verts[l + 1] = cy;
      verts[l + 2] = cz + nz * width;
      verts[l + 3] = cx - nx * width;
      verts[l + 4] = cy;
      verts[l + 5] = cz - nz * width;
    }
  }

  private buildBurstRing(): PooledBurstRing {
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(sharedGeometry(new THREE.RingGeometry(0.1, 1, 20)), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    return { mesh, material };
  }

  private acquireBurstRing(color: string): PooledBurstRing {
    const entry = this.burstRingPool.pop() ?? this.buildBurstRing();
    entry.material.color.set(color);
    entry.material.opacity = 0.85;
    entry.mesh.scale.set(1, 1, 1);
    entry.mesh.visible = true;
    return entry;
  }

  private releaseBurstRing(entry: PooledBurstRing): void {
    entry.mesh.visible = false;
    this.burstRingPool.push(entry);
  }

  private buildBurstSparks(): PooledBurstSparks {
    const positions = new Float32Array(BURST_SPARKS * 3);
    const dirs = new Float32Array(BURST_SPARKS * 3);
    for (let i = 0; i < BURST_SPARKS; i++) {
      const a = (i / BURST_SPARKS) * Math.PI * 2;
      dirs[i * 3] = Math.cos(a);
      dirs[i * 3 + 1] = 0.6 + (i % 3) * 0.3;
      dirs[i * 3 + 2] = Math.sin(a);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 0.32,
      map: particleSprite('soft'),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    return { points, material, positions, dirs };
  }

  private acquireBurstSparks(color: string, sprite: SpriteKind): PooledBurstSparks {
    const entry = this.burstSparksPool.pop() ?? this.buildBurstSparks();
    entry.positions.fill(0);
    entry.points.geometry.attributes.position.needsUpdate = true;
    entry.material.color.set(color);
    entry.material.size = sprite === 'shard' ? 0.36 : 0.32;
    entry.material.map = particleSprite(sprite);
    entry.material.opacity = 0.9;
    entry.material.needsUpdate = true;
    entry.points.visible = true;
    return entry;
  }

  private releaseBurstSparks(entry: PooledBurstSparks): void {
    entry.points.visible = false;
    this.burstSparksPool.push(entry);
  }

  private burst(x: number, y: number, color: string, radiusW: number, dur: number, color2?: string, sprite: SpriteKind = 'soft'): void {
    const ringEntry = this.acquireBurstRing(color);
    const ring = ringEntry.mesh;
    ring.position.copy(this.w(x, y, 0.15));
    this.push(ring, dur, (_t, lifeT) => {
      const s = 0.2 + lifeT * radiusW;
      ring.scale.set(s, s, 1);
      ringEntry.material.opacity = 0.85 * (1 - lifeT);
    }, () => this.releaseBurstRing(ringEntry));
    // sparks — shaped per element (ember/snow/shard) so the burst reads its type.
    const sparks = this.acquireBurstSparks(color2 ?? color, sprite);
    const pts = sparks.points;
    const positions = sparks.positions;
    const base = this.w(x, y, 0.4);
    pts.position.copy(base);
    this.push(pts, dur, (_t, lifeT) => {
      for (let i = 0; i < BURST_SPARKS; i++) {
        positions[i * 3] = sparks.dirs[i * 3] * lifeT * radiusW * 0.9;
        positions[i * 3 + 1] = sparks.dirs[i * 3 + 1] * lifeT * 1.6 - lifeT * lifeT * 2.2;
        positions[i * 3 + 2] = sparks.dirs[i * 3 + 2] * lifeT * radiusW * 0.9;
      }
      pts.geometry.attributes.position.needsUpdate = true;
      sparks.material.opacity = 0.9 * (1 - lifeT);
    }, () => this.releaseBurstSparks(sparks));
  }

  private impactDecal(x: number, y: number, color: string, radiusW: number, dur: number): void {
    const decal = new THREE.Mesh(
      sharedGeometry(new THREE.PlaneGeometry(1, 1)),
      new THREE.MeshBasicMaterial({
        color,
        map: telegraphTexture('ring'),
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = this.time * 1.7;
    decal.position.copy(this.w(x, y, 0.09));
    const mat = decal.material as THREE.MeshBasicMaterial;
    this.push(decal, dur, (t, lifeT) => {
      const s = radiusW * (0.65 + lifeT * 0.75);
      decal.scale.set(s, s, 1);
      decal.rotation.z = t * 1.7;
      mat.opacity = 0.62 * (1 - lifeT);
    });
  }

  private blinkMark(x: number, y: number, color = '#7adfff'): void {
    const pillar = new THREE.Mesh(
      sharedGeometry(new THREE.CylinderGeometry(0.12, 0.3, 3.2, 6, 1, true)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    pillar.position.copy(this.w(x, y, 1.6));
    const mat = pillar.material as THREE.MeshBasicMaterial;
    this.push(pillar, 0.4, (_t, lifeT) => {
      pillar.scale.y = 1 - lifeT * 0.7;
      pillar.rotation.y += 0.3;
      mat.opacity = 0.7 * (1 - lifeT);
    });
  }

  private pillar(x: number, y: number, color: string, dur: number): void {
    const beam = new THREE.Mesh(
      sharedGeometry(new THREE.CylinderGeometry(0.5, 0.7, 5, 8, 1, true)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    beam.position.copy(this.w(x, y, 2.5));
    const mat = beam.material as THREE.MeshBasicMaterial;
    this.push(beam, dur, (_t, lifeT) => {
      beam.rotation.y += 0.1;
      mat.opacity = 0.5 * (1 - lifeT);
      beam.scale.setScalar(1 + lifeT * 0.3);
    });
  }

  private castFlash(x: number, y: number, vfx: VfxSpec): void {
    if (vfx.archetype === 'global-mark') {
      this.pillar(x, y, vfx.color, 0.6);
      return;
    }
    if (vfx.archetype === 'vortex') {
      this.vortex(x, y, vfx.color, vfx.color2 ?? '#ffffff', (vfx.scale ?? 1) * 2.6, 1.0);
      return;
    }
    if (vfx.archetype === 'dome') {
      this.dome(x, y, vfx.color, vfx.color2 ?? '#ffffff', (vfx.scale ?? 1) * 2.6, 0.9);
      return;
    }
    if (vfx.archetype === 'cyclone') {
      this.cyclone(x, y, vfx.color, vfx.color2 ?? '#ffffff', vfx.scale ?? 1);
      return;
    }
    if (vfx.archetype === 'mine') {
      this.mine(x, y, vfx.color, vfx.color2 ?? '#ffffff', vfx.scale ?? 1);
      return;
    }
    if (vfx.archetype === 'channel') {
      this.channelColumn(x, y, vfx.color, vfx.color2 ?? '#ffffff', vfx.scale ?? 1);
      return;
    }
    const flash = new THREE.Mesh(
      sharedGeometry(new THREE.SphereGeometry(0.5, 8, 6)),
      new THREE.MeshBasicMaterial({ color: vfx.color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    flash.position.copy(this.w(x, y, 1.6));
    const mat = flash.material as THREE.MeshBasicMaterial;
    this.push(flash, 0.3, (_t, lifeT) => {
      flash.scale.setScalar(1 + lifeT * 1.6);
      mat.opacity = 0.7 * (1 - lifeT);
    });
  }

  private channelColumn(x: number, y: number, color: string, color2: string, scale: number): void {
    const g = new THREE.Group();
    g.position.copy(this.w(x, y, 0.12));
    const base = new THREE.Mesh(
      sharedGeometry(new THREE.RingGeometry(0.42 * scale, 0.95 * scale, 36)),
      new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.66, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    base.rotation.x = -Math.PI / 2;
    const column = new THREE.Mesh(
      sharedGeometry(new THREE.CylinderGeometry(0.28 * scale, 0.46 * scale, 2.6 * scale, 8, 1, true)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.36, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    column.position.y = 1.25 * scale;
    const moteMat = new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.78, depthWrite: false, blending: THREE.AdditiveBlending });
    const motes: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const mote = new THREE.Mesh(sharedGeometry(new THREE.TetrahedronGeometry(0.12 * scale)), moteMat);
      mote.userData.phase = (i / 5) * Math.PI * 2;
      g.add(mote);
      motes.push(mote);
    }
    g.add(base, column);
    const baseMat = base.material as THREE.MeshBasicMaterial;
    const colMat = column.material as THREE.MeshBasicMaterial;
    this.push(g, 0.8, (t, lifeT) => {
      base.rotation.z = t * 2.5;
      base.scale.setScalar(0.85 + Math.sin(t * 7) * 0.08);
      baseMat.opacity = 0.66 * (1 - lifeT * 0.45);
      column.rotation.y = t * 1.8;
      colMat.opacity = 0.36 * (1 - lifeT * 0.35);
      for (const mote of motes) {
        const p = mote.userData.phase as number;
        const h = 0.35 + ((p + t * 1.7) % (Math.PI * 2)) / (Math.PI * 2) * 2.1;
        const r = 0.42 * scale;
        const a = p + t * 3.6;
        mote.position.set(Math.cos(a) * r, h * scale, Math.sin(a) * r);
        mote.rotation.y = t * 3;
        (mote.material as THREE.MeshBasicMaterial).opacity = 0.78 * (1 - lifeT);
      }
    });
  }

  // WS-G: inward-spiraling pull. Shards converge on the center while a rim ring
  // contracts — the "everything is being sucked in" read (Black Hole / RP / Vacuum).
  private vortex(x: number, y: number, color: string, color2: string, radiusW: number, dur: number): void {
    const g = new THREE.Group();
    g.position.copy(this.w(x, y, 0.2));
    const core = new THREE.Mesh(
      sharedGeometry(new THREE.SphereGeometry(0.45, 12, 8)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    const rim = new THREE.Mesh(
      sharedGeometry(new THREE.RingGeometry(radiusW * 0.9, radiusW, 40)),
      new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.05;
    g.add(core, rim);
    const shards: THREE.Mesh[] = [];
    for (let i = 0; i < 10; i++) {
      const sh = new THREE.Mesh(
        sharedGeometry(new THREE.TetrahedronGeometry(0.22)),
        new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      sh.userData.a0 = (i / 10) * Math.PI * 2;
      g.add(sh);
      shards.push(sh);
    }
    this.group.add(g);
    const coreMat = core.material as THREE.MeshBasicMaterial;
    const rimMat = rim.material as THREE.MeshBasicMaterial;
    this.push(g, dur, (t, lifeT) => {
      const pull = 1 - lifeT;
      for (const sh of shards) {
        const a = (sh.userData.a0 as number) + t * 6;
        const r = radiusW * pull;
        sh.position.set(Math.cos(a) * r, 0.4 + Math.sin(t * 4) * 0.2, Math.sin(a) * r);
        sh.rotation.x = t * 4;
        (sh.material as THREE.MeshBasicMaterial).opacity = 0.85 * pull;
      }
      core.scale.setScalar(0.6 + Math.sin(t * 8) * 0.15 + lifeT * 0.5);
      coreMat.opacity = 0.85 * (1 - lifeT * 0.6);
      rim.scale.setScalar(Math.max(0.05, pull));
      rimMat.opacity = 0.55 * pull;
    });
  }

  // WS-G: hemispherical containment shell (Chronosphere / Arena / Static Storm).
  private dome(x: number, y: number, color: string, color2: string, radiusW: number, dur: number): void {
    const g = new THREE.Group();
    g.position.copy(this.w(x, y, 0.05));
    const shell = new THREE.Mesh(
      sharedGeometry(new THREE.SphereGeometry(radiusW, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    const base = new THREE.Mesh(
      sharedGeometry(new THREE.RingGeometry(radiusW * 0.92, radiusW, 44)),
      new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.04;
    g.add(shell, base);
    this.group.add(g);
    const shellMat = shell.material as THREE.MeshBasicMaterial;
    const baseMat = base.material as THREE.MeshBasicMaterial;
    this.push(g, dur, (t, lifeT) => {
      const pop = lifeT < 0.25 ? lifeT / 0.25 : 1;
      shell.scale.setScalar(pop);
      shell.rotation.y = t * 0.4;
      shellMat.opacity = 0.32 * (1 - lifeT * 0.5);
      baseMat.opacity = 0.7 * (0.6 + Math.sin(t * 6) * 0.3) * (1 - lifeT * 0.3);
    });
  }

  // WS-D: Eul's/Wind Waker lift. A vertical spiral column is distinct from the
  // broader storm archetype and pairs with the unit's cyclone status lift.
  private cyclone(x: number, y: number, color: string, color2: string, scale: number): void {
    const g = new THREE.Group();
    g.position.copy(this.w(x, y, 0.08));
    const base = new THREE.Mesh(
      sharedGeometry(new THREE.RingGeometry(0.45 * scale, 1.05 * scale, 36)),
      new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    base.rotation.x = -Math.PI / 2;
    g.add(base);
    const wisps: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const wisp = new THREE.Mesh(
        sharedGeometry(new THREE.CylinderGeometry(0.035 * scale, 0.08 * scale, 1.35 * scale, 5, 1, true)),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? color : color2, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      wisp.userData.phase = (i / 7) * Math.PI * 2;
      g.add(wisp);
      wisps.push(wisp);
    }
    const top = new THREE.Mesh(
      sharedGeometry(new THREE.TorusGeometry(0.55 * scale, 0.04 * scale, 6, 28)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.56, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    top.position.y = 2.2 * scale;
    top.rotation.x = Math.PI / 2;
    g.add(top);
    const baseMat = base.material as THREE.MeshBasicMaterial;
    const topMat = top.material as THREE.MeshBasicMaterial;
    this.push(g, 0.85, (t, lifeT) => {
      base.rotation.z = t * 3.4;
      baseMat.opacity = 0.68 * (1 - lifeT * 0.55);
      top.rotation.z = -t * 4.2;
      top.position.y = (1.45 + Math.sin(t * 7) * 0.08) * scale;
      topMat.opacity = 0.56 * (1 - lifeT * 0.35);
      for (const wisp of wisps) {
        const p = wisp.userData.phase as number;
        const a = p + t * 5.2;
        const h = 0.25 + ((p + t * 2.1) % (Math.PI * 2)) / (Math.PI * 2) * 2.1;
        const r = (0.38 + h * 0.14) * scale;
        wisp.position.set(Math.cos(a) * r, h * scale, Math.sin(a) * r);
        wisp.rotation.set(0.45, -a, 0.2);
        (wisp.material as THREE.MeshBasicMaterial).opacity = 0.62 * (1 - lifeT);
      }
    });
  }

  // WS-G: small armed ground charge with a pulsing proximity telegraph ring.
  private mine(x: number, y: number, color: string, color2: string, scale: number): void {
    const g = new THREE.Group();
    g.position.copy(this.w(x, y, 0.0));
    const charge = new THREE.Mesh(
      sharedGeometry(new THREE.IcosahedronGeometry(0.26 * scale, 0)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.NormalBlending })
    );
    charge.position.y = 0.26 * scale;
    const ring = new THREE.Mesh(
      sharedGeometry(new THREE.RingGeometry(0.9 * scale, 1.0 * scale, 32)),
      new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g.add(charge, ring);
    this.group.add(g);
    const ringMat = ring.material as THREE.MeshBasicMaterial;
    // Armed charges linger; the proximity ring blinks faster over its short telegraph.
    this.push(g, 1.4, (t, lifeT) => {
      const blink = 0.4 + Math.abs(Math.sin(t * (3 + lifeT * 8))) * 0.5;
      ringMat.opacity = blink * (1 - lifeT * 0.4);
      ring.scale.setScalar(1 + Math.sin(t * 6) * 0.06);
      charge.rotation.y = t * 2;
    });
  }

  private attackAngle(from: Vec2, to: Vec2): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  private reactionPalette(reaction: string): [string, string] {
    const palette: Record<string, [string, string]> = {
      vaporize: ['#7adfff', '#ff9a4f'],
      melt: ['#ffb45a', '#bfeeff'],
      overload: ['#ff6a3d', '#c882ff'],
      superconduct: ['#8fe6ff', '#b88cff'],
      freeze: ['#bfeeff', '#ffffff'],
      swirl: ['#a8ffd8', '#ffffff'],
      crystallize: ['#ffe27d', '#ffffff'],
      burning: ['#ff7a3d', '#ffd27f']
    };
    return palette[reaction] ?? ['#ffffff', '#b88cff'];
  }

  /** Shaped spark per reaction family: embers for fire, flakes for frost, shards
   *  for shatter/overload, soft glow otherwise (WS-H spark variety). */
  private reactionSprite(reaction: string): SpriteKind {
    switch (reaction) {
      case 'melt': case 'burning': case 'vaporize': return 'ember';
      case 'freeze': case 'superconduct': return 'snow';
      case 'crystallize': case 'overload': return 'shard';
      default: return 'soft';
    }
  }

  private cleaveSweep(from: Vec2, to: Vec2, visual: AttackVisualSpec): void {
    const scale = visual.scale ?? 1;
    const arc = new THREE.Mesh(
      sharedGeometry(new THREE.RingGeometry(0.55 * scale, 1.35 * scale, 28, 1, -0.55 * Math.PI, 1.1 * Math.PI)),
      new THREE.MeshBasicMaterial({ color: visual.color, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    arc.rotation.x = -Math.PI / 2;
    arc.rotation.z = -this.attackAngle(from, to);
    arc.position.copy(this.w(from.x, from.y, 0.8));
    const mat = arc.material as THREE.MeshBasicMaterial;
    this.push(arc, 0.22, (_t, lifeT) => {
      arc.scale.setScalar(0.75 + lifeT * 0.65);
      mat.opacity = 0.62 * (1 - lifeT);
    });
    this.impactDecal(to.x, to.y, visual.color2 ?? visual.color, 0.46 * scale, 0.22);
  }

  private beamMesh(from: THREE.Vector3, to: THREE.Vector3, color: string, radius: number, opacity: number, taper = 0.55): THREE.Mesh {
    const len = Math.max(0.001, from.distanceTo(to));
    const beam = new THREE.Mesh(
      sharedGeometry(new THREE.CylinderGeometry(1, taper, 1, 8, 1, true)),
      new THREE.MeshBasicMaterial({
        color,
        alphaMap: beamRampTexture(),
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    beam.position.copy(from.clone().add(to).multiplyScalar(0.5));
    beam.scale.set(radius, len, radius);
    beam.lookAt(to);
    beam.rotateX(Math.PI / 2);
    return beam;
  }

  private attackBeam(from: Vec2, to: Vec2, visual: AttackVisualSpec, width: number): void {
    const a = this.w(from.x, from.y, 1.2);
    const b = this.w(to.x, to.y, 1.0);
    const baseRadius = width * (visual.scale ?? 1);
    const beam = this.beamMesh(a, b, visual.color, baseRadius, 0.72);
    const mat = beam.material as THREE.MeshBasicMaterial;
    this.push(beam, 0.18, (_t, lifeT) => {
      mat.opacity = 0.72 * (1 - lifeT);
      beam.scale.x = baseRadius * (1 + lifeT * 0.8);
      beam.scale.z = baseRadius * (1 + lifeT * 0.8);
    });
    this.impactDecal(to.x, to.y, visual.color2 ?? visual.color, 0.42 * (visual.scale ?? 1), 0.22);
  }

  private lightningRibbon(points: THREE.Vector3[], color: string, width: number): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    const positions = new Float32Array(points.length * 2 * 3);
    const uvs = new Float32Array(points.length * 2 * 2);
    const indices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const p = points[i];
      const base = i * 2 * 3;
      positions[base] = p.x + nx * width;
      positions[base + 1] = p.y;
      positions[base + 2] = p.z + nz * width;
      positions[base + 3] = p.x - nx * width;
      positions[base + 4] = p.y;
      positions[base + 5] = p.z - nz * width;

      const u = i / (points.length - 1);
      const uv = i * 2 * 2;
      uvs[uv] = u;
      uvs[uv + 1] = 0;
      uvs[uv + 2] = u;
      uvs[uv + 3] = 1;
      if (i < points.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const ribbon = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color,
        alphaMap: beamRampTexture(),
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    ribbon.frustumCulled = false;
    return ribbon;
  }

  private lightning(from: Vec2, to: Vec2, visual: AttackVisualSpec): void {
    const a = this.w(from.x, from.y, 1.25);
    const b = this.w(to.x, to.y, 1.05);
    const points: THREE.Vector3[] = [];
    const side = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const p = a.clone().lerp(b, t);
      const jag = (i === 0 || i === 6) ? 0 : (((i * 17) % 7) - 3) * 0.08 * (visual.scale ?? 1);
      p.addScaledVector(side, jag);
      p.y += Math.sin(t * Math.PI) * 0.25;
      points.push(p);
    }
    const scale = visual.scale ?? 1;
    const ribbon = this.lightningRibbon(points, visual.color, 0.055 * scale);
    const mat = ribbon.material as THREE.MeshBasicMaterial;
    this.push(ribbon, 0.24, (_t, lifeT) => {
      mat.opacity = 0.9 * (1 - lifeT);
    });
    // A short forked branch veers off a midpoint so the bolt reads as electric
    // arc rather than a single clean stroke. Reuses the ribbon builder; no new art.
    const branchAt = 3; // midpoint of the 7-point arc
    const root = points[branchAt];
    const fork: THREE.Vector3[] = [root.clone()];
    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      const p = root.clone().lerp(b, t * 0.5);
      p.addScaledVector(side, (0.18 + t * 0.22) * scale * (i % 2 === 0 ? -1 : 1));
      p.y += (0.12 + t * 0.1) * scale;
      fork.push(p);
    }
    const branch = this.lightningRibbon(fork, visual.color2 ?? visual.color, 0.035 * scale);
    const branchMat = branch.material as THREE.MeshBasicMaterial;
    this.push(branch, 0.18, (_t, lifeT) => {
      branchMat.opacity = 0.7 * (1 - lifeT);
    });
    this.burst(to.x, to.y, visual.color2 ?? visual.color, 0.55 * scale, 0.22, visual.color);
    this.impactDecal(to.x, to.y, visual.color2 ?? visual.color, 0.48 * scale, 0.24);
  }

  private critSlash(from: Vec2, to: Vec2, visual: AttackVisualSpec): void {
    const slash = new THREE.Mesh(
      sharedGeometry(new THREE.ConeGeometry(0.2 * (visual.scale ?? 1), 1.1 * (visual.scale ?? 1), 3)),
      new THREE.MeshBasicMaterial({ color: visual.color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    slash.position.copy(this.w(to.x, to.y, 1.0));
    slash.rotation.z = -this.attackAngle(from, to);
    slash.rotation.y = Math.PI / 2;
    const mat = slash.material as THREE.MeshBasicMaterial;
    this.push(slash, 0.2, (_t, lifeT) => {
      slash.scale.setScalar(1 + lifeT * 0.8);
      mat.opacity = 0.7 * (1 - lifeT);
    });
    this.burst(to.x, to.y, visual.color2 ?? visual.color, 0.5 * (visual.scale ?? 1), 0.18, visual.color);
    this.impactDecal(to.x, to.y, visual.color2 ?? visual.color, 0.42 * (visual.scale ?? 1), 0.24);
  }

  private armorShredFlash(from: Vec2, to: Vec2, visual: AttackVisualSpec): void {
    const scale = visual.scale ?? 1;
    const center = this.w(to.x, to.y, 1.05);
    const ring = new THREE.Mesh(
      sharedGeometry(new THREE.RingGeometry(0.28 * scale, 0.82 * scale, 28)),
      new THREE.MeshBasicMaterial({ color: visual.color, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.position.copy(center);
    ring.rotation.x = -Math.PI / 2;
    const mat = ring.material as THREE.MeshBasicMaterial;
    this.push(ring, 0.24, (_t, lifeT) => {
      ring.scale.setScalar(0.75 + lifeT * 0.7);
      mat.opacity = 0.72 * (1 - lifeT);
    });

    const a = this.attackAngle(from, to);
    for (let i = 0; i < 5; i++) {
      const chip = new THREE.Mesh(
        sharedGeometry(new THREE.BoxGeometry(0.08 * scale, 0.34 * scale, 0.04 * scale)),
        new THREE.MeshBasicMaterial({ color: visual.color2 ?? visual.color, transparent: true, opacity: 0.82, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      const off = (i - 2) * 0.18 * scale;
      chip.position.copy(center);
      chip.position.x += Math.cos(a + Math.PI / 2) * off;
      chip.position.z += Math.sin(a + Math.PI / 2) * off;
      chip.rotation.z = -a + (i - 2) * 0.18;
      const chipMat = chip.material as THREE.MeshBasicMaterial;
      this.push(chip, 0.26, (_t, lifeT) => {
        chip.position.y = center.y + lifeT * 0.45;
        chip.scale.y = 1 + lifeT * 0.9;
        chipMat.opacity = 0.82 * (1 - lifeT);
      });
    }
    this.burst(to.x, to.y, visual.color, 0.42 * scale, 0.18, visual.color2, 'shard');
    this.impactDecal(to.x, to.y, visual.color, 0.44 * scale, 0.24);
  }

  private bindingBeam(a: { x: number; y: number; h: number }, b: { x: number; y: number; h: number }, dur: number): void {
    const from = this.w(a.x, a.y, 1.4);
    const to = this.w(b.x, b.y, 1.0);
    const beam = this.beamMesh(from, to, '#7adfc4', 0.08, 0.8, 1);
    const mat = beam.material as THREE.MeshBasicMaterial;
    this.push(beam, dur, (t) => {
      mat.opacity = 0.5 + Math.sin(t * 12) * 0.3;
    });
    // swirling ring on target
    const ring = new THREE.Mesh(
      sharedGeometry(new THREE.TorusGeometry(0.7, 0.06, 5, 16)),
      new THREE.MeshBasicMaterial({ color: '#b7ffd9', transparent: true, opacity: 0.8, depthWrite: false })
    );
    ring.position.copy(to);
    ring.rotation.x = Math.PI / 2;
    this.push(ring, dur, (t) => {
      ring.rotation.z = t * 4;
      ring.position.y = to.y + 0.4 + Math.sin(t * 6) * 0.2;
    });
  }

  private spawnZone(ev: Extract<SimEvent, { t: 'zone-spawn' }>): void {
    const spec = ev.spec;
    const color = ev.vfx.color;
    const color2 = ev.vfx.color2 ?? '#ffffff';
    const g = new THREE.Group();

    if (spec.shape === 'line') {
      const lenW = spec.length / WORLD_SCALE;
      const widthW = Math.max(0.35, spec.width / WORLD_SCALE);
      // Shaped ground telegraph under wall/line zones. The stretched decal gives
      // Fissure-style spells a clear "this line is dangerous" read before the
      // authored spike wall silhouette finishes the effect.
      const decal = new THREE.Mesh(
        sharedGeometry(new THREE.PlaneGeometry(lenW, widthW)),
        new THREE.MeshBasicMaterial({ color, map: telegraphTexture(telegraphKindFor(ev.vfx.archetype, !!spec.wall)), transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      decal.rotation.x = -Math.PI / 2;
      decal.position.y = 0.11;
      decal.userData.tele = true;
      const rimA = new THREE.Mesh(
        sharedGeometry(new THREE.PlaneGeometry(lenW, 0.08)),
        new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      const rimB = rimA.clone();
      rimA.position.set(0, 0.14, widthW * 0.5);
      rimB.position.set(0, 0.14, -widthW * 0.5);
      rimA.rotation.x = rimB.rotation.x = -Math.PI / 2;
      g.add(decal, rimA, rimB);
      // wall of jagged spikes (Fissure) or glowing line
      const n = Math.max(3, Math.floor(lenW / 0.9));
      for (let i = 0; i < n; i++) {
        const spike = new THREE.Mesh(
          sharedGeometry(new THREE.ConeGeometry(0.34 + ((i * 13) % 5) * 0.05, 1.1 + ((i * 7) % 4) * 0.3, 5)),
          new THREE.MeshBasicMaterial({ color: spec.wall ? color : color2, transparent: true, opacity: spec.wall ? 0.96 : 0.72, depthWrite: false, blending: spec.wall ? THREE.NormalBlending : THREE.AdditiveBlending })
        );
        const t = (i + 0.5) / n - 0.5;
        spike.position.set(t * lenW, 0.42, ((i * 11) % 3 - 1) * Math.min(0.22, widthW * 0.28));
        spike.rotation.z = ((i * 17) % 7 - 3) * 0.06;
        g.add(spike);
      }
      g.position.copy(this.w(ev.pos.x, ev.pos.y, 0));
      g.rotation.y = -spec.angle;
    } else {
      const rW = spec.radius / WORLD_SCALE;
      // Textured ground telegraph: filled disc + bright rim + spokes, additive so it
      // glows on dark ground and feeds bloom (GRAPHICS_SPEC §7 AoE read).
      const disc = new THREE.Mesh(
        sharedGeometry(new THREE.PlaneGeometry(rW * 2, rW * 2)),
        new THREE.MeshBasicMaterial({ color, map: telegraphTexture(telegraphKindFor(ev.vfx.archetype)), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.12;
      disc.userData.tele = true;
      const rim = new THREE.Mesh(
        sharedGeometry(new THREE.RingGeometry(rW * 0.93, rW, 40)),
        new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.14;
      rim.userData.rim = true;
      g.add(disc, rim);
      if (ev.vfx.archetype === 'storm' || ev.vfx.archetype === 'vortex') {
        // slow swirling shards over the area; vortex pulls them toward the center.
        for (let i = 0; i < 8; i++) {
          const shard = new THREE.Mesh(
            sharedGeometry(new THREE.TetrahedronGeometry(0.22)),
            new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
          );
          shard.userData.orbit = { r: rW * (0.3 + (i % 4) * 0.18), a: (i / 8) * Math.PI * 2, h: 0.6 + (i % 3) * 0.5 };
          if (ev.vfx.archetype === 'vortex') shard.userData.pull = true;
          g.add(shard);
        }
        if (ev.vfx.archetype === 'vortex') {
          const core = new THREE.Mesh(
            sharedGeometry(new THREE.SphereGeometry(0.5, 12, 8)),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
          );
          core.position.y = 0.6;
          core.userData.spin = true;
          g.add(core);
        }
      }
      if (ev.vfx.archetype === 'dome') {
        const shell = new THREE.Mesh(
          sharedGeometry(new THREE.SphereGeometry(rW, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        shell.userData.spin = true;
        g.add(shell);
      }
      if (ev.vfx.archetype === 'mine') {
        const charge = new THREE.Mesh(
          sharedGeometry(new THREE.IcosahedronGeometry(0.26, 0)),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })
        );
        charge.position.y = 0.26;
        charge.userData.spin = true;
        g.add(charge);
      }
      g.position.copy(this.w(ev.pos.x, ev.pos.y, 0));
    }

    this.group.add(g);
    const tr: Transient = {
      obj: g,
      until: Infinity,
      update: (t) => {
        for (const child of g.children) {
          const orbit = child.userData.orbit as { r: number; a: number; h: number } | undefined;
          if (orbit) {
            // vortex shards ride a contracting radius for an inward-pull read.
            const pull = child.userData.pull ? 0.35 + (Math.sin(t * 1.6 + orbit.a) * 0.5 + 0.5) * 0.65 : 1;
            const spin = child.userData.pull ? 4.5 : 2.2;
            child.position.set(Math.cos(orbit.a + t * spin) * orbit.r * pull, orbit.h + Math.sin(t * 3 + orbit.a) * 0.2, Math.sin(orbit.a + t * spin) * orbit.r * pull);
            child.rotation.x = t * 3;
          } else if (child.userData.spin) {
            child.rotation.y = t * 0.6;
          } else if (child.userData.tele) {
            child.rotation.z = t * 0.5; // slow charge spin
          } else if (child.userData.rim) {
            const m = child as THREE.Mesh;
            (m.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 4) * 0.2;
          }
        }
      }
    };
    this.zones.set(ev.zid, tr);
    if (spec.followUid !== undefined) g.userData.followUid = spec.followUid;
  }

  /** Zones that follow a unit (Blade Fury, Freezing Field). */
  syncZoneFollow(unitPos: (uid: number) => { x: number; y: number; h: number } | null): void {
    for (const [, z] of this.zones) {
      const fid = z.obj.userData.followUid as number | undefined;
      if (fid === undefined) continue;
      const p = unitPos(fid);
      if (p) z.obj.position.copy(this.w(p.x, p.y, 0));
    }
  }
}
