import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent, ALL_HEROES } from '../data';
import { ALL_ITEMS } from '../data/items';
import { ALL_CREEPS } from '../data/creeps';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { soundForAbility } from '../core/gestures';
import { ProceduralAudio } from '../engine/audio';
import { SampledAudioBank, MUSIC_BEDS, SFX_KEYS } from '../engine/sampled-audio';
import { TUNING } from '../data/tuning';
import type { GameSave, SimEvent, SoundArchetype } from '../core/types';

beforeAll(() => registerAllContent());

const VALID_SOUNDS: SoundArchetype[] = [
  'blade', 'bow', 'impact', 'frost', 'fire', 'storm', 'void', 'heal', 'summon', 'item', 'roar', 'lightning'
];

function settings(muted = false): GameSave['settings'] {
  return { quickcast: false, audio: { master: 0.8, sfx: 0.8, voice: 0.7, stinger: 0.7, muted } };
}

function castEvent(uid: number): SimEvent {
  return { t: 'cast', uid, abilityId: `a${uid}`, vfx: { archetype: 'projectile', color: '#fff' }, sound: 'blade', timbre: 'sharp' };
}

// ---------- Test 20: audio-coverage + safety ----------

describe('test 20 — audio-coverage + safety', () => {
  it('every ability and item active resolves to a valid sound archetype', () => {
    for (const hero of ALL_HEROES) {
      for (const ab of hero.abilities) {
        expect(VALID_SOUNDS, `${hero.id}/${ab.id}`).toContain(soundForAbility(ab));
      }
    }
    for (const creep of ALL_CREEPS) {
      for (const ab of creep.abilities ?? []) {
        expect(VALID_SOUNDS, `${creep.id}/${ab.id}`).toContain(soundForAbility(ab));
      }
    }
    for (const item of ALL_ITEMS) {
      if (item.active) expect(VALID_SOUNDS, `item:${item.id}`).toContain(soundForAbility(item.active));
    }
  });

  it('uses the lightning archetype for electric chain signatures', () => {
    const leshrac = REG.hero('leshrac');
    const lightningStorm = leshrac.abilities.find((a) => a.id === 'lesh-lightning-storm');
    expect(lightningStorm).toBeDefined();
    expect(soundForAbility(lightningStorm!)).toBe('lightning');
    expect(REG.item('mjollnir').active?.sound).toBe('lightning');
  });

  it('constructs, drives, and tears down without throwing (headless)', () => {
    expect(() => {
      const audio = new ProceduralAudio(settings());
      audio.unlock();
      audio.handleEvent(castEvent(1));
      audio.handleEvent({ t: 'bark', uid: 1, line: 'For the Isle!' });
      audio.playStinger('badge');
      audio.playStinger('raid-clear');
      audio.setCinematicMix('duck');
      audio.playDialogueBlip('Narration');
      audio.setCinematicMix('silence');
      audio.setCinematicMix('normal');
      audio.setSettings(settings(true));
      audio.dispose();
      audio.dispose(); // idempotent
    }).not.toThrow();
  });

  it('global mute fully bypasses synthesis (no context, no voices)', () => {
    const audio = new ProceduralAudio(settings(true));
    audio.unlock();
    for (let i = 0; i < 20; i++) audio.handleEvent(castEvent(i));
    audio.playStinger('merge');
    expect(audio.activeVoiceCount()).toBe(0);
    // muted never opens an AudioContext
    expect((audio as unknown as { ctx: unknown }).ctx).toBeNull();
  });

  it('the voice pool respects its concurrency cap under burst load', () => {
    const audio = new ProceduralAudio(settings());
    audio.unlock();
    for (let i = 0; i < 64; i++) audio.handleEvent(castEvent(i)); // far exceeds the cap
    expect(audio.peakVoiceCount()).toBeLessThanOrEqual(TUNING.audioVoiceCap);
    expect(audio.peakVoiceCount()).toBe(TUNING.audioVoiceCap); // burst saturates the pool
    expect(audio.activeVoiceCount()).toBeLessThanOrEqual(TUNING.audioVoiceCap);
  });

  it('honors a custom (smaller) cap', () => {
    const audio = new ProceduralAudio(settings(), 3);
    audio.unlock();
    for (let i = 0; i < 30; i++) audio.handleEvent(castEvent(i));
    expect(audio.peakVoiceCount()).toBe(3);
  });
});

// ---------- Test 20b: sampled-audio enhancement layer (synth stays the floor) ----------

describe('test 20b — sampled-audio layer', () => {
  it('the bank resolves null buffers headless (no fetch/decoder) without throwing', async () => {
    const fakeCtx = { decodeAudioData: undefined } as unknown as BaseAudioContext;
    const bank = new SampledAudioBank(fakeCtx);
    expect(() => bank.prefetch('grass')).not.toThrow();
    expect(bank.sfx('crit')).toBeNull();
    expect(bank.music('grass')).toBeNull();
    expect(bank.music('not-a-biome')).toBeNull(); // unknown bed → null, never a request
  });

  it('every shipped bed/sfx key is a distinct, non-empty identifier', () => {
    expect(new Set(MUSIC_BEDS).size).toBe(MUSIC_BEDS.length);
    expect(new Set(SFX_KEYS).size).toBe(SFX_KEYS.length);
    expect(MUSIC_BEDS.every((b) => b.length > 0)).toBe(true);
    expect(SFX_KEYS.every((k) => k.length > 0)).toBe(true);
  });

  it('enabling samples headless never opens a context or throws (synth floor intact)', () => {
    const audio = new ProceduralAudio(settings());
    expect(() => {
      audio.enableSampledAudio(true);
      audio.unlock();
      audio.handleEvent({ t: 'damage', uid: 1, from: 2, amount: 600, dtype: 'physical', crit: true });
      audio.handleEvent({ t: 'cast', uid: 1, abilityId: 'a1', vfx: { archetype: 'dome', color: '#fff' }, timbre: 'deep' });
      audio.playStinger('raid-clear');
      audio.update?.({ biome: 'snow', dayTime: 0.7, inCombat: true, dt: 0.05 });
      audio.update?.({ biome: 'desert', dayTime: 0.1, inCombat: false, dt: 0.05 });
      audio.enableSampledAudio(false);
      audio.dispose();
    }).not.toThrow();
    // headless has no AudioContext, so nothing should have been allocated
    expect((audio as unknown as { ctx: unknown }).ctx).toBeNull();
  });
});

// ---------- Test 21: no-asset guard ----------

describe('test 21 — no-asset guard', () => {
  const SRC = fileURLToPath(new URL('..', import.meta.url));
  const ASSET_IMPORT = /\b(?:import|from|require)\b[^;\n]*['"][^'"]+\.(?:png|jpe?g|gif|svg|webp|bmp|mp3|wav|ogg|flac|aac|m4a|glb|gltf|fbx|obj|dae|mp4|webm)['"]/i;
  const ASSET_URL = /new\s+URL\(\s*['"][^'"]+\.(?:png|jpe?g|gif|svg|webp|bmp|mp3|wav|ogg|flac|aac|m4a|glb|gltf|fbx|obj|dae|mp4|webm)['"]/i;

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walk(full));
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('imports no audio/image/model asset files anywhere in src', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split('\n')) {
        if (ASSET_IMPORT.test(line) || ASSET_URL.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, `unexpected asset imports:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the glTF asset loader keeps a procedural fallback and imports nothing but three', () => {
    const text = readFileSync(`${SRC}/engine/assets.ts`, 'utf8');
    expect(text).toContain("fallback: 'procedural'");
    const importLines = text.split('\n').filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      expect(line, line).toMatch(/from\s+['"]three/);
    }
  });
});

// ---------- Test 22: bark-trigger ----------

describe('test 22 — bark-trigger (from the sim core)', () => {
  it('emits a bark when a hero casts its signature (ult) ability', () => {
    const hero = REG.hero('juggernaut');
    const sim = new Sim({ seed: 4242, bounds: { w: 6000, h: 4000 } });
    sim.events.captureAll = true;

    const caster = sim.spawnHero(hero, { team: 0, pos: { x: 1000, y: 2000 }, level: 25, ctrl: { kind: 'player' } });
    const enemy = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 1120, y: 2000 }, level: 20, ctrl: { kind: 'none' } });
    caster.mana = 99999;
    caster.abilities.forEach((a) => { a.level = Math.max(1, a.level); a.cooldownUntil = 0; });

    const ultSlot = caster.abilities.findIndex((a) => a.def.ult);
    expect(ultSlot).toBeGreaterThanOrEqual(0);
    const ult = caster.abilities[ultSlot].def;
    const args = ult.targeting === 'unit-target' ? { uid: enemy.uid } : ult.targeting === 'no-target' ? {} : { point: enemy.pos };

    sim.order(caster.uid, { kind: 'cast', slot: ultSlot, ...args });
    sim.run(0.6);

    const barks = sim.events.history.filter((e): e is Extract<SimEvent, { t: 'bark' }> => e.t === 'bark');
    expect(barks.length).toBeGreaterThanOrEqual(1);
    expect(barks[0].uid).toBe(caster.uid);
    expect(hero.barks).toContain(barks[0].line);
  });
});
