import type { DamageType, GameSave, SimEvent, SoundArchetype, StingerId } from '../core/types';
import { TUNING } from '../data/tuning';
import { SampledAudioBank, type SfxKey } from './sampled-audio';

type AudioSettings = GameSave['settings'];
type Channel = 'sfx' | 'voice' | 'stinger' | 'music';
export type CinematicMixMode = 'normal' | 'duck' | 'silence';

export interface AudioEnvironment {
  biome: string;
  dayTime: number;
  inCombat: boolean;
  dt: number;
}

interface MusicNodes {
  biome: string;
  master: GainNode;
  combat: GainNode;
  ambient: GainNode;
  ambientFilter: BiquadFilterNode;
  oscillators: OscillatorNode[];
  combatOscillators: OscillatorNode[];
  ambientSource: AudioBufferSourceNode;
}

/**
 * Procedural WebAudio layer (Phase 6 §3.12). No asset files: every cue is
 * synthesized. Cast voices key off the ability's `sound` archetype and are
 * pitch-shifted per owner timbre; capture/merge/level/badge/raid play stingers
 * on their own channel; a pooled, concurrency-capped set of "voices" keeps the
 * synth cheap under load; a global mute fully bypasses synthesis.
 */
export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private lastCoinAt = 0;
  private coinStreak = 0;

  // Master bus + limiter (PRESENTATION_SPEC §2.1): a teamfight stacks many SFX,
  // so every voice routes master → compressor → destination to stop hard clipping.
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private music: MusicNodes | null = null;
  // Sampled-audio enhancement layer (VFX_ASSETS WS-F1). Off by default + on low
  // tier, so headless/tests and the boot floor only ever hear the synth.
  private samples: SampledAudioBank | null = null;
  private samplesEnabled = false;
  private sampleMusic: { biome: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  // Background music bed is disabled by request: the sustained synth drone +
  // filtered-noise ambience read as a constant "hum" with no way to turn it down
  // (music shares the stinger channel, there is no music slider). Gameplay SFX,
  // cast voices, impacts, and stingers are unaffected — only the continuous bed
  // is gone. Flip to true to restore the procedural/sampled score.
  private musicEnabled = false;
  private combatHotUntil = 0;
  private cinematicMix: CinematicMixMode = 'normal';
  // Damage-impact throttle (§2.4): cap how many hit sounds fire in a short window
  // so a big AoE reads as one crunch instead of a machine-gun wall of mush.
  private damageSoundTimes: number[] = [];
  // Same idea for projectile arrival ticks (piercing / multi-hit shots).
  private projHitTimes: number[] = [];

  // Voice pool (§3.12, §3.16): per-entity cast/bark voices, hard-capped.
  private voiceCap: number;
  private voiceEnds: number[] = [];
  private peakVoices = 0;

  private unlockHandler: (() => void) | null = null;

  constructor(private settings: AudioSettings, voiceCap = TUNING.audioVoiceCap) {
    this.voiceCap = Math.max(1, voiceCap);
    if (typeof window === 'undefined') return; // headless: nothing to unlock
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.unlockHandler = null;
    };
    this.unlockHandler = unlock;
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /** Resume/allow synthesis (autoplay-policy unlock). Safe to call repeatedly + headless. */
  unlock(): void {
    if (this.settings.audio.muted) return;
    this.ensure();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    this.unlocked = true;
    if (this.samplesEnabled) this.initSamples();
  }

  /**
   * Toggle the sampled-audio layer (medium+ tiers). Synth stays the floor: a
   * missing/undecoded file silently leaves the synth playing. No-op headless.
   */
  enableSampledAudio(on: boolean): void {
    this.samplesEnabled = on;
    if (on && this.unlocked) this.initSamples();
    if (!on) this.stopSampleMusic();
  }

  private initSamples(): void {
    if (this.samples || this.settings.audio.muted) return;
    const ctx = this.ensure();
    if (!ctx) return; // headless / unsupported: synth only
    this.samples = new SampledAudioBank(ctx);
    this.samples.prefetch();
  }

  /** Tear down listeners + the AudioContext. Never throws. */
  dispose(): void {
    if (typeof window !== 'undefined' && this.unlockHandler) {
      window.removeEventListener('pointerdown', this.unlockHandler);
      window.removeEventListener('keydown', this.unlockHandler);
      this.unlockHandler = null;
    }
    this.stopSampleMusic();
    this.samples = null;
    this.stopMusic();
    try {
      void this.ctx?.close();
    } catch {
      /* already closed / unsupported */
    }
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.reverb = null;
    this.reverbGain = null;
    this.unlocked = false;
    this.voiceEnds.length = 0;
    this.damageSoundTimes.length = 0;
    this.projHitTimes.length = 0;
  }

  setSettings(settings: AudioSettings): void {
    this.settings = settings;
    if (settings.audio.muted) {
      this.stopMusic();
      this.stopSampleMusic();
    }
  }

  setCinematicMix(mode: CinematicMixMode): void {
    this.cinematicMix = mode;
  }

  /** Live count of active pooled voices (for perf assertions). */
  activeVoiceCount(): number {
    const t = this.now();
    let n = 0;
    for (const end of this.voiceEnds) if (end > t) n++;
    return n;
  }

  /** High-water mark of concurrent voices since construction. */
  peakVoiceCount(): number {
    return this.peakVoices;
  }

  handleEvent(ev: SimEvent): void {
    this.noteCombatEvent(ev);
    if (!this.unlocked || this.settings.audio.muted) return;
    switch (ev.t) {
      case 'cast':
        this.castVoice(ev.sound, ev.vfx.archetype, ev.timbre);
        break;
      case 'bark':
        this.barkBlip(ev.uid);
        break;
      case 'attack-impact':
        // Weapon-contact tick. The body of the hit comes from the `damage` event
        // that fires alongside it, so a melee basic attack reads as clink + thud.
        this.attackTick();
        break;
      case 'attack-launch':
        // Ranged basic attack release (bow twang / gun crack / thrown whoosh).
        // Without this every ranged hero was silent at the moment of attacking —
        // you only heard the delayed impact at the target. Fired for ALL ranged
        // attackers; the projectile's landing still plays its own impact/damage.
        this.attackLaunch(ev.speed);
        break;
      case 'projectile-hit':
        // Light arrival tick for the projectile itself. Damaging projectiles also
        // fire a `damage` impact (throttled), so keep this subtle and pooled so a
        // hit reads as one event, not a double-thwack.
        this.projectileHit();
        break;
      case 'miss':
        this.missWhoosh();
        break;
      case 'damage':
        // Every hit on a unit is audible (§2.4 / §4.7): crits get the flourish,
        // every other hit a damage-type-tinted impact scaled by the amount.
        if (ev.crit) this.critImpact(ev.amount);
        else this.impactSound(ev.amount, ev.dtype);
        break;
      case 'gold':
        this.coin(ev.amount, ev.reason);
        break;
      case 'heal':
        this.sweep(420, 620, 0.12, 'sine', 0.09);
        break;
      case 'reaction':
        this.reactionSound(ev.reaction);
        break;
      case 'capture-complete':
        this.playStinger('capture');
        break;
      case 'levelup':
        this.playStinger('levelup');
        break;
      case 'death':
        this.sweep(140, 48, 0.32, 'sawtooth', 0.2);
        setTimeout(() => this.noise(0.1, 0.08), 70);
        break;
      case 'item-used':
        this.sweep(260, 520, 0.08, 'square', 0.14);
        break;
      default:
        break;
    }
  }

  /** Procedural score + ambient bed (GRAPHICS_SPEC §13.5 Phase 4).
   *  Continuous, file-free, and cheap: a biome drone, a combat layer, filtered
   *  noise ambience, and a generated reverb bus. */
  update(env: AudioEnvironment): void {
    // No background music bed: keep any previously-started drone/bed torn down so
    // the only thing the player hears is gameplay SFX, voices, and stingers.
    if (!this.unlocked || this.settings.audio.muted || !this.musicEnabled) {
      this.stopMusic();
      this.stopSampleMusic();
      return;
    }
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.music || this.music.biome !== env.biome) this.startMusic(env.biome);
    if (!this.music) return;

    const now = ctx.currentTime;
    const night = env.dayTime >= 0.5;
    const combat = env.inCombat || now < this.combatHotUntil;
    // When a sampled ambient bed is playing, duck the synth drone so the real
    // bed leads and the synth just thickens it (synth stays the sole layer
    // whenever the file is absent/undecoded).
    const sampleActive = this.updateSampleMusic(env, ctx, now, night, combat);
    const drone = sampleActive ? 0.28 : 1;
    const cinMult = this.cinematicMix === 'silence' ? 0 : this.cinematicMix === 'duck' ? 0.35 : 1;
    const base = this.volume(0.11, 'music') * cinMult;
    this.music.master.gain.setTargetAtTime(base * (night ? 0.78 : 1) * drone, now, 0.55);
    this.music.combat.gain.setTargetAtTime(base * (combat ? 0.9 : 0.04), now, combat ? 0.08 : 0.9);
    this.music.ambient.gain.setTargetAtTime(this.volume(night ? 0.055 : 0.038, 'music') * cinMult * (sampleActive ? 0.5 : 1), now, 0.8);

    const filterTarget = ({ snow: 1700, desert: 900, wasteland: 720, forest: 1300, grass: 1250, coast: 1800 } as Record<string, number>)[env.biome] ?? 1200;
    this.music.ambientFilter.frequency.setTargetAtTime(filterTarget * (night ? 0.72 : 1), now, 1.2);
    if (this.reverbGain) this.reverbGain.gain.setTargetAtTime(this.volume(combat ? 0.08 : 0.13, 'music') * cinMult, now, 0.8);
    void env.dt;
  }

  private noteCombatEvent(ev: SimEvent): void {
    switch (ev.t) {
      case 'damage':
      case 'attack-impact':
      case 'attack-launch':
      case 'projectile-spawn':
      case 'projectile-hit':
      case 'cast':
      case 'death':
        this.combatHotUntil = Math.max(this.combatHotUntil, this.now() + 5.5);
        break;
      default:
        break;
    }
  }

  // ---------- voice pool ----------

  private now(): number {
    if (this.ctx) return this.ctx.currentTime;
    if (typeof performance !== 'undefined') return performance.now() / 1000;
    return Date.now() / 1000;
  }

  /** Reserve a pooled voice for `durSec`; false if the cap is saturated. */
  private requestVoice(durSec: number): boolean {
    const t = this.now();
    if (this.voiceEnds.length) {
      this.voiceEnds = this.voiceEnds.filter((end) => end > t);
    }
    if (this.voiceEnds.length >= this.voiceCap) return false;
    this.voiceEnds.push(t + durSec);
    if (this.voiceEnds.length > this.peakVoices) this.peakVoices = this.voiceEnds.length;
    return true;
  }

  // ---------- per-owner timbre ----------

  /** Stable pitch multiplier per owner timbre so a kit "sounds like theirs". */
  private timbrePitch(timbre: string | undefined): number {
    if (!timbre) return 1;
    const named: Record<string, number> = {
      sharp: 1.12,
      bright: 1.2,
      cold: 1.08,
      light: 1.15,
      warm: 0.96,
      deep: 0.82,
      booming: 0.76,
      gravel: 0.85,
      dark: 0.8,
      ethereal: 1.26
    };
    if (named[timbre] !== undefined) return named[timbre];
    let h = 0;
    for (let i = 0; i < timbre.length; i++) h = (h * 31 + timbre.charCodeAt(i)) | 0;
    return 0.88 + (Math.abs(h) % 36) / 100; // 0.88..1.23, deterministic
  }

  // ---------- cast voices (keyed off SoundArchetype) ----------

  private castVoice(sound: SoundArchetype | undefined, archetype: string, timbre: string | undefined): void {
    const dur = 0.18;
    if (!this.requestVoice(dur)) return; // pool saturated; drop this voice
    const p = this.timbrePitch(timbre);
    // Big-shape spells (zones, walls, vortices, domes, ground slams) get a
    // sampled air-whoosh on medium+; pooled above so it never machine-guns.
    if (archetype === 'ground-aoe' || archetype === 'wall' || archetype === 'vortex' || archetype === 'dome' || archetype === 'cyclone') {
      this.playSample('whoosh', 0.3, 'voice');
    }
    switch (sound) {
      case 'blade':
        this.sweep(900 * p, 1700 * p, 0.09, 'sawtooth', 0.13, 'voice');
        this.noise(0.04, 0.05);
        break;
      case 'bow':
        this.sweep(520 * p, 940 * p, 0.07, 'square', 0.11, 'voice');
        break;
      case 'impact':
        this.sweep(220 * p, 90, 0.14, 'triangle', 0.16, 'voice');
        this.thump(0.05, 0.12, 420);
        break;
      case 'frost':
        this.sweep(680 * p, 1180 * p, 0.13, 'sine', 0.12, 'voice');
        this.tone(1500 * p, 0.06, 'sine', 0.07, 'voice');
        break;
      case 'fire':
        this.sweep(300 * p, 820 * p, 0.12, 'sawtooth', 0.13, 'voice');
        this.noise(0.06, 0.07);
        break;
      case 'storm':
        this.sweep(720 * p, 1180 * p, 0.12, 'sawtooth', 0.12, 'voice');
        this.noise(0.055, 0.06);
        break;
      case 'lightning':
        this.sweep(980 * p, 2100 * p, 0.07, 'square', 0.11, 'voice');
        this.tone(2600 * p, 0.045, 'sawtooth', 0.06, 'voice');
        this.noise(0.035, 0.045);
        break;
      case 'void':
        this.sweep(300 * p, 90, 0.18, 'sine', 0.16, 'voice');
        this.tone(70, 0.16, 'triangle', 0.1, 'voice');
        break;
      case 'heal':
        this.sweep(420 * p, 720 * p, 0.16, 'sine', 0.12, 'voice');
        break;
      case 'summon':
        this.sweep(200 * p, 540 * p, 0.16, 'triangle', 0.13, 'voice');
        this.tone(540 * p, 0.08, 'sine', 0.08, 'voice');
        break;
      case 'roar':
        this.sweep(300 * p, 120 * p, 0.22, 'sawtooth', 0.2, 'voice');
        this.noise(0.08, 0.08);
        break;
      case 'item':
        this.sweep(260 * p, 520 * p, 0.08, 'square', 0.12, 'voice');
        break;
      default:
        this.castByArchetype(archetype, p);
    }
  }

  /** Fallback when an ability lacks a `sound` tag (should not happen post-lint). */
  private castByArchetype(archetype: string, p: number): void {
    switch (archetype) {
      case 'storm':
      case 'chain':
      case 'cyclone':
        this.sweep(720 * p, 1180 * p, 0.12, 'sawtooth', 0.12, 'voice');
        this.noise(0.055, 0.06);
        break;
      case 'ground-aoe':
      case 'wall':
        this.sweep(180 * p, 90, 0.16, 'triangle', 0.16, 'voice');
        break;
      case 'hook':
      case 'projectile':
        this.sweep(360 * p, 760 * p, 0.08, 'square', 0.1, 'voice');
        break;
      case 'shield':
        this.sweep(310 * p, 520 * p, 0.14, 'sine', 0.12, 'voice');
        break;
      default:
        this.tone(420 * p, 0.08, 'triangle', 0.16, 'voice');
    }
  }

  private barkBlip(uid: number): void {
    if (!this.requestVoice(0.1)) return;
    const p = 0.92 + (Math.abs(uid) % 8) / 24; // 0.92..1.21 per speaker
    this.tone(360 * p, 0.05, 'square', 0.08, 'voice');
    setTimeout(() => this.tone(300 * p, 0.05, 'square', 0.07, 'voice'), 55);
  }

  playDialogueBlip(seed = ''): void {
    if (!this.unlocked || this.settings.audio.muted) return;
    if (!this.requestVoice(0.12)) return;
    const hash = [...seed].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 17);
    const p = 0.92 + (Math.abs(hash) % 10) / 28;
    this.tone(330 * p, 0.045, 'triangle', 0.06, 'voice');
    setTimeout(() => this.tone(410 * p, 0.04, 'sine', 0.045, 'voice'), 48);
  }

  // ---------- stingers (own channel) ----------

  playStinger(id: StingerId): void {
    if (!this.unlocked || this.settings.audio.muted) return;
    // Celebratory stingers get a sampled fanfare on medium+; the synth arpeggio
    // below still plays so the cue survives when the sample is absent.
    if (id === 'levelup' || id === 'merge' || id === 'badge' || id === 'capture' || id === 'raid-clear' || id === 'loot' || id === 'loot-signature') {
      this.playSample('fanfare', id === 'raid-clear' || id === 'badge' || id === 'loot-signature' ? 0.5 : 0.36, 'stinger');
    }
    switch (id) {
      case 'capture':
        this.arp([523, 784, 1047], 0.085, 0.16);
        break;
      case 'levelup':
        this.arp([659, 988, 1319], 0.08, 0.16);
        break;
      case 'merge': // 3-star fanfare: rising, brighter
        this.arp([523, 659, 880, 1175], 0.07, 0.15);
        break;
      case 'badge': // triumphant two-chord
        this.tone(587, 0.14, 'triangle', 0.16, 'stinger');
        this.tone(880, 0.14, 'sine', 0.12, 'stinger');
        setTimeout(() => {
          this.tone(784, 0.2, 'triangle', 0.16, 'stinger');
          this.tone(1175, 0.2, 'sine', 0.12, 'stinger');
        }, 150);
        break;
      case 'raid-clear': // big descending-then-rising motif
        this.arp([392, 523, 659, 784, 1047], 0.1, 0.18);
        setTimeout(() => this.thump(0.12, 0.14, 320), 120);
        break;
      case 'loot': // bright rising cue for a loud (refined+/immortal) drop
        this.arp([587, 740, 988, 1319], 0.075, 0.16);
        setTimeout(() => this.thump(0.08, 0.1, 220), 90);
        break;
      case 'loot-signature': // the godroll beat: taller arp, a sub thump, a shimmer tail
        this.arp([523, 659, 880, 1175, 1568], 0.08, 0.2);
        setTimeout(() => this.thump(0.16, 0.16, 180), 100);
        setTimeout(() => this.tone(1976, 0.45, 'sine', 0.12, 'stinger'), 420);
        break;
      default:
        break;
    }
  }

  private arp(freqs: number[], step: number, vol: number): void {
    freqs.forEach((f, i) => setTimeout(() => this.tone(f, step + 0.04, 'sine', vol, 'stinger'), i * step * 1000));
  }

  // ---------- low-level synth ----------

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === 'undefined') return null; // headless / unsupported
    this.ctx = new AudioContext();
    // Master bus → limiter → speakers. Per-sound gains already fold in the user
    // volume; the compressor only tames stacked peaks so a flurry never clips.
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.master.connect(this.comp).connect(this.ctx.destination);
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.15, 2.7);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.08;
    this.reverb.connect(this.reverbGain).connect(this.master);
    return this.ctx;
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * (1 - t) ** decay;
      }
    }
    return buffer;
  }

  private musicProfile(biome: string): { root: number; color: OscillatorType; combat: OscillatorType; noise: BiquadFilterType } {
    const table: Record<string, { root: number; color: OscillatorType; combat: OscillatorType; noise: BiquadFilterType }> = {
      grass: { root: 110, color: 'triangle', combat: 'sawtooth', noise: 'lowpass' },
      forest: { root: 98, color: 'sine', combat: 'sawtooth', noise: 'bandpass' },
      snow: { root: 146.83, color: 'sine', combat: 'triangle', noise: 'highpass' },
      desert: { root: 92.5, color: 'triangle', combat: 'square', noise: 'bandpass' },
      wasteland: { root: 82.41, color: 'sawtooth', combat: 'sawtooth', noise: 'lowpass' },
      coast: { root: 123.47, color: 'sine', combat: 'triangle', noise: 'lowpass' }
    };
    return table[biome] ?? table.grass;
  }

  private startMusic(biome: string): void {
    this.stopMusic();
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const prof = this.musicProfile(biome);
    const master = ctx.createGain();
    const combat = ctx.createGain();
    const ambient = ctx.createGain();
    master.gain.value = 0;
    combat.gain.value = 0;
    ambient.gain.value = 0;
    master.connect(this.master);
    combat.connect(this.master);
    ambient.connect(this.master);
    if (this.reverb) {
      const send = ctx.createGain();
      send.gain.value = 0.18;
      master.connect(send).connect(this.reverb);
      const combatSend = ctx.createGain();
      combatSend.gain.value = 0.08;
      combat.connect(combatSend).connect(this.reverb);
      const ambientSend = ctx.createGain();
      ambientSend.gain.value = 0.22;
      ambient.connect(ambientSend).connect(this.reverb);
    }

    const oscillators: OscillatorNode[] = [];
    const combatOscillators: OscillatorNode[] = [];
    for (const [mul, gainVal] of [[1, 0.42], [1.5, 0.18], [2, 0.12]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = prof.color;
      osc.frequency.value = prof.root * mul;
      gain.gain.value = gainVal;
      osc.connect(gain).connect(master);
      osc.start();
      oscillators.push(osc);
    }
    for (const [mul, gainVal] of [[0.5, 0.32], [1, 0.2], [2.01, 0.08]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = prof.combat;
      osc.frequency.value = prof.root * mul;
      gain.gain.value = gainVal;
      osc.connect(gain).connect(combat);
      osc.start();
      combatOscillators.push(osc);
    }

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.42;
    const ambientSource = ctx.createBufferSource();
    const ambientFilter = ctx.createBiquadFilter();
    ambientSource.buffer = buffer;
    ambientSource.loop = true;
    ambientFilter.type = prof.noise;
    ambientFilter.frequency.value = 1200;
    ambientFilter.Q.value = 0.9;
    ambientSource.connect(ambientFilter).connect(ambient);
    ambientSource.start();

    this.music = { biome, master, combat, ambient, ambientFilter, oscillators, combatOscillators, ambientSource };
  }

  /** Crossfade the sampled ambient bed for the current biome. Returns true while
   *  a real bed is playing (so the caller ducks the synth drone). */
  private updateSampleMusic(env: AudioEnvironment, ctx: AudioContext, now: number, night: boolean, combat: boolean): boolean {
    if (!this.samplesEnabled || !this.samples) return false;
    const buf = this.samples.music(env.biome);
    if (!buf) {
      // Not decoded yet (or no file): keep an already-playing matching bed,
      // otherwise let the synth own this biome.
      if (this.sampleMusic && this.sampleMusic.biome !== env.biome) this.stopSampleMusic();
      return this.sampleMusic?.biome === env.biome;
    }
    if (!this.sampleMusic || this.sampleMusic.biome !== env.biome) {
      this.stopSampleMusic();
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      src.loop = true;
      gain.gain.value = 0.0001;
      src.connect(gain).connect(this.master ?? ctx.destination);
      src.start();
      this.sampleMusic = { biome: env.biome, src, gain };
    }
    const cinMult = this.cinematicMix === 'silence' ? 0 : this.cinematicMix === 'duck' ? 0.35 : 1;
    const target = this.volume(0.5, 'music') * cinMult * (night ? 0.8 : 1) * (combat ? 0.62 : 1);
    this.sampleMusic.gain.gain.setTargetAtTime(Math.max(0.0001, target), now, 0.7);
    return true;
  }

  private stopSampleMusic(): void {
    if (!this.sampleMusic) return;
    try { this.sampleMusic.src.stop(); } catch { /* already stopped */ }
    this.sampleMusic.src.disconnect();
    this.sampleMusic.gain.disconnect();
    this.sampleMusic = null;
  }

  /** Layer a decoded one-shot over the synth. Returns false (synth covers it)
   *  when samples are off/undecoded or headless. */
  private playSample(key: SfxKey, vol: number, chan: Channel = 'sfx'): boolean {
    if (!this.samplesEnabled || !this.samples) return false;
    const buf = this.samples.sfx(key);
    const ctx = this.ctx;
    if (!buf || !ctx) return false;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.value = this.volume(vol, chan);
    src.connect(gain).connect(this.master ?? ctx.destination);
    src.start();
    return true;
  }

  private stopMusic(): void {
    if (!this.music) return;
    for (const osc of this.music.oscillators) {
      try { osc.stop(); } catch { /* already stopped */ }
      osc.disconnect();
    }
    for (const osc of this.music.combatOscillators) {
      try { osc.stop(); } catch { /* already stopped */ }
      osc.disconnect();
    }
    try { this.music.ambientSource.stop(); } catch { /* already stopped */ }
    this.music.ambientSource.disconnect();
    this.music.master.disconnect();
    this.music.combat.disconnect();
    this.music.ambient.disconnect();
    this.music = null;
  }

  private channelGain(chan: Channel): number {
    const a = this.settings.audio;
    if (a.muted) return 0;
    return a.master * (chan === 'voice' ? a.voice : chan === 'stinger' || chan === 'music' ? a.stinger : a.sfx);
  }

  private volume(mult: number, chan: Channel): number {
    return this.channelGain(chan) * mult;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, chan: Channel = 'sfx'): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(this.volume(vol, chan), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(this.master ?? ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private sweep(start: number, end: number, dur: number, type: OscillatorType, vol: number, chan: Channel = 'sfx'): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(start, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), ctx.currentTime + dur);
    gain.gain.setValueAtTime(this.volume(vol, chan), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(this.master ?? ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private thump(dur: number, vol: number, filterHz: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const decay = 1 - i / data.length;
      data[i] = (Math.sin(i * 0.7) + (i % 5 === 0 ? 0.5 : -0.5)) * decay;
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    src.buffer = buffer;
    gain.gain.setValueAtTime(this.volume(vol, 'sfx'), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(this.master ?? ctx.destination);
    src.start();
  }

  private noise(dur: number, vol: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (i % 2 === 0 ? 1 : -1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.setValueAtTime(this.volume(vol, 'sfx'), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(gain).connect(this.master ?? ctx.destination);
    src.start();
  }

  private coin(amount: number, reason: string): void {
    const ctx = this.ensure();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.coinStreak = now - this.lastCoinAt <= 1.5 ? Math.min(8, this.coinStreak + 1) : 0;
    this.lastCoinAt = now;

    const lastHitLift = reason === 'lasthit' ? 1.09 : 1;
    const streakPitch = 2 ** (this.coinStreak / 12);
    const base = 1850 * lastHitLift * streakPitch;
    const size = Math.min(1, Math.log2(Math.max(2, amount)) / 9);
    const vol = 0.09 + size * 0.12 + (reason === 'lasthit' ? 0.04 : 0);

    this.coinRing(base, vol, 0);
    if (amount >= 45 || reason === 'echo') this.coinRing(base * 1.122, vol * 0.75, 0.075);
    if (amount >= 140 || reason === 'echo') this.coinRing(base * 1.26, vol * 0.65, 0.15);
    if (amount >= 60 || reason === 'lasthit' || reason === 'echo') this.thump(0.045, 0.05 + size * 0.06, 420);
  }

  private coinRing(freq: number, vol: number, delaySec: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const start = ctx.currentTime + delaySec;
    const dur = 0.23;
    const gain = ctx.createGain();
    const delay = ctx.createDelay();
    const feedback = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'highpass';
    filter.frequency.value = 900;
    delay.delayTime.value = 0.045;
    feedback.gain.value = 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(this.volume(vol, 'sfx'), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    const partials: [number, number][] = [
      [1, 1],
      [1.5, 0.58],
      [2.01, 0.38]
    ];
    for (const [mul, mix] of partials) {
      const osc = ctx.createOscillator();
      const partialGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * mul, start);
      osc.frequency.exponentialRampToValueAtTime(freq * mul * 0.985, start + dur);
      partialGain.gain.value = mix;
      osc.connect(partialGain).connect(gain);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }

    const out = this.master ?? ctx.destination;
    gain.connect(filter).connect(out);
    filter.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(out);
  }

  // ---------- per-hit impacts (every hit on a unit is audible) ----------

  /** Light weapon-contact tick for a basic attack; the `damage` event layers the body. */
  private attackTick(): void {
    const j = 0.9 + Math.random() * 0.2;
    this.tone(540 * j, 0.03, 'square', 0.06);
    this.noise(0.02, 0.04);
  }

  /** Ranged release: a quick down-pluck + airy whoosh so every ranged attack is
   *  audible the instant it fires. Faster projectiles read brighter/snappier. */
  private attackLaunch(speed: number): void {
    const j = 0.9 + Math.random() * 0.2;
    // Map projectile speed (~600..1800) to a 0..1 "snap" so a fast bolt cracks
    // brighter than a lobbed throw, without needing per-hero data.
    const snap = Math.min(1, Math.max(0, (speed - 500) / 1300));
    const top = (820 + snap * 520) * j;
    this.sweep(top, top * 0.5, 0.07, 'square', 0.07);
    this.noise(0.03, 0.035 + snap * 0.02);
  }

  /** Subtle projectile arrival tick, throttled so a piercing/multi-hit shot reads
   *  as one arrival rather than a burst. The damage impact carries the body. */
  private projectileHit(): void {
    const t = this.now();
    if (this.projHitTimes.length) {
      this.projHitTimes = this.projHitTimes.filter((at) => t - at < 0.07);
    }
    if (this.projHitTimes.length >= 3) return;
    this.projHitTimes.push(t);
    const j = 0.9 + Math.random() * 0.2;
    this.tone(360 * j, 0.025, 'triangle', 0.04);
  }

  /** Soft airy whiff so a missed swing still reads. */
  private missWhoosh(): void {
    const j = 0.9 + Math.random() * 0.2;
    this.sweep(760 * j, 280 * j, 0.1, 'sine', 0.045);
  }

  /** Impact on a unit, tinted by damage type and scaled by amount (§2.4/§4.7).
   *  Pitch-jittered per hit, and throttled so a wide AoE never machine-guns. */
  private impactSound(amount: number, dtype: DamageType): void {
    const t = this.now();
    if (this.damageSoundTimes.length) {
      this.damageSoundTimes = this.damageSoundTimes.filter((at) => t - at < 0.12);
    }
    if (this.damageSoundTimes.length >= 5) return; // window saturated; drop extras
    this.damageSoundTimes.push(t);

    const w = Math.min(1, Math.max(0.12, Math.log2(Math.max(2, amount)) / 9)); // 0.12..1
    const j = 0.9 + Math.random() * 0.2; // pitch variation (§2.4)
    switch (dtype) {
      case 'magical':
        this.sweep(320 * j, 150 * j, 0.12, 'sine', 0.05 + w * 0.12);
        this.tone(900 * j, 0.05, 'sine', 0.03 + w * 0.04);
        break;
      case 'pure':
        this.tone(1280 * j, 0.05, 'triangle', 0.05 + w * 0.07);
        this.thump(0.04, 0.05 + w * 0.1, 700 * j);
        break;
      default: // physical: punchy body thud + a little grit on bigger hits
        this.thump(0.045 + w * 0.03, 0.07 + w * 0.14, (520 - w * 200) * j);
        if (w > 0.4) this.noise(0.03, 0.03 + w * 0.04);
        if (w > 0.72) this.playSample('impact-heavy', 0.32); // sampled crunch on the big ones
    }
  }

  private critImpact(amount: number): void {
    const weight = Math.min(1, Math.log2(Math.max(8, amount)) / 10);
    // Medium+ tiers get a real sampled crit ring; the synth body still layers
    // under it so a crit reads identically when the sample is absent.
    this.playSample('crit', 0.42 + weight * 0.12);
    this.sweep(2200, 760, 0.08, 'sawtooth', 0.12 + weight * 0.08);
    this.tone(3100, 0.045, 'square', 0.08 + weight * 0.05);
    this.thump(0.04, 0.1 + weight * 0.08, 760);
    setTimeout(() => this.noise(0.04, 0.045 + weight * 0.03), 18);
  }

  private reactionSound(reaction: string): void {
    const palette: Record<string, [number, number]> = {
      vaporize: [360, 940],
      melt: [420, 820],
      overload: [180, 760],
      superconduct: [620, 260],
      freeze: [760, 1180],
      swirl: [540, 1040],
      crystallize: [300, 680],
      burning: [260, 520]
    };
    const [a, b] = palette[reaction] ?? [620, 930];
    this.sweep(a, b, 0.12, reaction === 'overload' ? 'sawtooth' : 'triangle', 0.22);
    setTimeout(() => this.tone(b * 1.25, 0.07, 'sine', 0.12), 70);
  }
}
