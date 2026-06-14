// Sampled-audio bank (VFX_ASSETS WS-F1). Optional enhancement over the
// procedural synth in `audio.ts`: it fetches + decodes original generated WAV
// beds/SFX plus a small curated CC0 Kenney SFX subset into AudioBuffers, layered
// on top of the synth on medium+ tiers.
//
// Boot floor (§1): everything is best-effort. With no `fetch`/AudioContext
// (headless), a missing file, or a decode failure, every getter returns null
// and the synth stays the guaranteed sound. No asset is `import`ed — URLs are
// plain runtime strings under /assets/audio, keeping the no-asset-import guard
// (audio test 21) green.

import type { SoundArchetype } from '../core/types';

export const SAMPLED_AUDIO_BASE = '/assets/audio';
const GENERATED_AUDIO_EXT = '.wav';

/** Biomes that ship a generated ambient bed (must match generate_audio.mjs). */
export const MUSIC_BEDS = ['grass', 'forest', 'snow', 'desert', 'wasteland', 'coast'] as const;
export type MusicBed = (typeof MUSIC_BEDS)[number];

/** High-impact one-shots that ship generated samples, with optional CC0 variants. */
export const SFX_KEYS = [
  'crit',
  'impact-heavy',
  'fanfare',
  'whoosh',
  'projectile-hit',
  'blade-draw',
  'coin',
  'cast-blade',
  'cast-bow',
  'cast-impact',
  'cast-frost',
  'cast-fire',
  'cast-storm',
  'cast-void',
  'cast-heal',
  'cast-summon',
  'cast-item',
  'cast-roar',
  'cast-lightning'
] as const;
export type SfxKey = (typeof SFX_KEYS)[number];

export const CAST_SFX_BY_SOUND: Record<SoundArchetype, SfxKey> = {
  blade: 'cast-blade',
  bow: 'cast-bow',
  impact: 'cast-impact',
  frost: 'cast-frost',
  fire: 'cast-fire',
  storm: 'cast-storm',
  void: 'cast-void',
  heal: 'cast-heal',
  summon: 'cast-summon',
  item: 'cast-item',
  roar: 'cast-roar',
  lightning: 'cast-lightning'
};

const hasFetch = typeof fetch !== 'undefined';

function musicUrl(bed: MusicBed): string {
  return `${SAMPLED_AUDIO_BASE}/music/${bed}${GENERATED_AUDIO_EXT}`;
}

function generatedSfxUrl(key: SfxKey): string {
  return `${SAMPLED_AUDIO_BASE}/sfx/${key}${GENERATED_AUDIO_EXT}`;
}

const kenneySfxUrl = (file: string): string => `${SAMPLED_AUDIO_BASE}/sfx/kenney/${file}.ogg`;
// A generated rotation variant that isn't itself an SfxKey (e.g. `cast-frost-2`).
const variantUrl = (name: string): string => `${SAMPLED_AUDIO_BASE}/sfx/${name}${GENERATED_AUDIO_EXT}`;

const SFX_VARIANTS: Record<SfxKey, readonly string[]> = {
  crit: [kenneySfxUrl('crit-metal-1'), kenneySfxUrl('crit-bell-1'), generatedSfxUrl('crit')],
  'impact-heavy': [kenneySfxUrl('impact-heavy-punch-1'), kenneySfxUrl('impact-heavy-punch-2'), generatedSfxUrl('impact-heavy')],
  fanfare: [kenneySfxUrl('fanfare-steel-1'), kenneySfxUrl('fanfare-steel-2'), kenneySfxUrl('fanfare-hit-1'), generatedSfxUrl('fanfare')],
  whoosh: [kenneySfxUrl('whoosh-blade-1'), kenneySfxUrl('whoosh-blade-2'), generatedSfxUrl('whoosh')],
  'projectile-hit': [kenneySfxUrl('projectile-hit-1'), kenneySfxUrl('projectile-hit-2'), generatedSfxUrl('projectile-hit')],
  'blade-draw': [kenneySfxUrl('blade-draw-1'), generatedSfxUrl('blade-draw')],
  coin: [kenneySfxUrl('coin-1'), kenneySfxUrl('coin-2'), generatedSfxUrl('coin')],
  'cast-blade': [kenneySfxUrl('blade-draw-1'), kenneySfxUrl('whoosh-blade-1'), generatedSfxUrl('cast-blade')],
  'cast-bow': [kenneySfxUrl('whoosh-blade-2'), kenneySfxUrl('projectile-hit-1'), generatedSfxUrl('cast-bow')],
  'cast-impact': [kenneySfxUrl('impact-heavy-punch-1'), kenneySfxUrl('impact-heavy-punch-2'), generatedSfxUrl('cast-impact')],
  'cast-frost': [generatedSfxUrl('cast-frost'), variantUrl('cast-frost-2')],
  'cast-fire': [generatedSfxUrl('cast-fire'), variantUrl('cast-fire-2')],
  'cast-storm': [kenneySfxUrl('storm-zap-up-1'), kenneySfxUrl('storm-phaser-up-1'), generatedSfxUrl('cast-storm')],
  'cast-void': [kenneySfxUrl('void-phase-1'), kenneySfxUrl('void-phase-2'), generatedSfxUrl('cast-void')],
  'cast-heal': [kenneySfxUrl('heal-power-1'), generatedSfxUrl('cast-heal')],
  'cast-summon': [kenneySfxUrl('summon-power-1'), generatedSfxUrl('cast-summon')],
  'cast-item': [kenneySfxUrl('item-tone-1'), generatedSfxUrl('cast-item')],
  'cast-roar': [generatedSfxUrl('cast-roar'), variantUrl('cast-roar-2')],
  'cast-lightning': [kenneySfxUrl('lightning-zap-1'), kenneySfxUrl('lightning-zap-2'), generatedSfxUrl('cast-lightning')]
};

function sfxUrls(key: SfxKey): readonly string[] {
  return SFX_VARIANTS[key] ?? [generatedSfxUrl(key)];
}

/**
 * Decodes + caches sampled audio for one AudioContext. Construction never
 * touches the network; callers `prefetch` what a tier wants and read buffers
 * synchronously once they resolve (null until then, so the synth covers the gap).
 */
export class SampledAudioBank {
  private buffers = new Map<string, AudioBuffer | null>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private sfxCursors = new Map<SfxKey, number>();

  constructor(private ctx: BaseAudioContext) {}

  /** Kick off decoding the common SFX + a biome bed; safe to call repeatedly. */
  prefetch(bed?: MusicBed): void {
    for (const key of SFX_KEYS) for (const url of sfxUrls(key)) void this.load(url);
    if (bed) void this.load(musicUrl(bed));
  }

  /** Decoded SFX buffer, or null until it resolves / on any failure. */
  sfx(key: SfxKey): AudioBuffer | null {
    const urls = sfxUrls(key);
    for (const url of urls) void this.load(url);
    const ready = urls.filter((url) => this.buffers.get(url));
    if (!ready.length) return null;
    const cursor = this.sfxCursors.get(key) ?? 0;
    const url = ready[cursor % ready.length];
    this.sfxCursors.set(key, cursor + 1);
    return this.buffers.get(url) ?? null;
  }

  /** Decoded ambient bed for a biome, or null until it resolves / on any failure. */
  music(bed: string): AudioBuffer | null {
    if (!(MUSIC_BEDS as readonly string[]).includes(bed)) return null;
    const url = musicUrl(bed as MusicBed);
    void this.load(url);
    return this.buffers.get(url) ?? null;
  }

  private load(url: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(url)) return Promise.resolve(this.buffers.get(url) ?? null);
    const existing = this.pending.get(url);
    if (existing) return existing;
    if (!hasFetch || typeof this.ctx.decodeAudioData !== 'function') {
      this.buffers.set(url, null);
      return Promise.resolve(null);
    }
    const p = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`status ${res.status}`))))
      .then((bytes) => this.ctx.decodeAudioData(bytes))
      .then((buf) => {
        this.buffers.set(url, buf);
        this.pending.delete(url);
        return buf;
      })
      .catch(() => {
        this.buffers.set(url, null); // remember the miss so the synth owns it
        this.pending.delete(url);
        return null;
      });
    this.pending.set(url, p);
    return p;
  }
}
