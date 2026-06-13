import type { GameSave, SimEvent } from '../core/types';

type AudioSettings = GameSave['settings'];

export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private lastCoinAt = 0;
  private coinStreak = 0;

  constructor(private settings: AudioSettings) {
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
      this.unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  setSettings(settings: AudioSettings): void {
    this.settings = settings;
  }

  handleEvent(ev: SimEvent): void {
    if (!this.unlocked) return;
    switch (ev.t) {
      case 'cast':
        this.castSound(ev.vfx.archetype);
        break;
      case 'attack-impact':
        this.thump(0.055, 0.2, 520);
        break;
      case 'damage':
        if (ev.crit) this.critImpact(ev.amount);
        else if (ev.amount > 80) this.thump(0.035, 0.08, 900);
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
      case 'levelup':
        this.chime();
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

  private ensure(): AudioContext | null {
    this.ctx ??= new AudioContext();
    return this.ctx;
  }

  private volume(mult = 1): number {
    return (this.settings.masterVolume ?? 0.8) * (this.settings.sfxVolume ?? 0.8) * mult;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(this.volume(vol), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private sweep(start: number, end: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(start, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), ctx.currentTime + dur);
    gain.gain.setValueAtTime(this.volume(vol), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
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
    gain.gain.setValueAtTime(this.volume(vol), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
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
    gain.gain.setValueAtTime(this.volume(vol), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  private chime(): void {
    this.tone(520, 0.08, 'sine', 0.18);
    setTimeout(() => this.tone(780, 0.1, 'sine', 0.16), 80);
    setTimeout(() => this.tone(1040, 0.12, 'sine', 0.14), 160);
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
    gain.gain.exponentialRampToValueAtTime(this.volume(vol), start + 0.012);
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

    gain.connect(filter).connect(ctx.destination);
    filter.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(ctx.destination);
  }

  private critImpact(amount: number): void {
    const weight = Math.min(1, Math.log2(Math.max(8, amount)) / 10);
    this.sweep(2200, 760, 0.08, 'sawtooth', 0.12 + weight * 0.08);
    this.tone(3100, 0.045, 'square', 0.08 + weight * 0.05);
    this.thump(0.04, 0.1 + weight * 0.08, 760);
    setTimeout(() => this.noise(0.04, 0.045 + weight * 0.03), 18);
  }

  private castSound(archetype: string): void {
    switch (archetype) {
      case 'storm':
      case 'chain':
        this.sweep(720, 1180, 0.12, 'sawtooth', 0.12);
        this.noise(0.055, 0.06);
        break;
      case 'ground-aoe':
      case 'wall':
        this.sweep(180, 90, 0.16, 'triangle', 0.16);
        break;
      case 'hook':
      case 'projectile':
        this.sweep(360, 760, 0.08, 'square', 0.1);
        break;
      case 'shield':
        this.sweep(310, 520, 0.14, 'sine', 0.12);
        break;
      default:
        this.tone(420, 0.08, 'triangle', 0.16);
    }
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
