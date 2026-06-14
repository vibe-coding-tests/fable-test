import type { CutsceneBeat, CutsceneDef, CutsceneTier } from '../core/types';

export type CutsceneContext = Record<string, string | number | undefined>;

// STORY §3.4 — the player is always in control. These mirror GameSave.settings.cutscene
// plus the live reduced-motion flag from GraphicsSettings.
export interface CutsceneRuntimeSettings {
  length: 'full' | 'short' | 'off';
  defaultSpeed: 1 | 2 | 4;
  alwaysSkip: boolean;
  reducedMotion: boolean;
  photosensitive: boolean;
}

export interface CinematicView {
  id: string;
  title: string;
  tier: CutsceneTier;
  beatIndex: number;
  beatCount: number;
  beatKey: string;
  beatElapsed: number;
  beatHold: number;
  letterbox: boolean;
  speed: number;
  seen: boolean;
  shot: CutsceneBeat['shot'];
  stage: NonNullable<CutsceneBeat['stage']>;
  stageText: string;
  sound?: CutsceneBeat['sound'];
  music?: CutsceneDef['music'];
  speaker?: string;
  portraitHeroId?: string;
  text?: string;
  revealedText: string;   // typewriter reveal (STORY §3.4: tap completes the line)
  skipProgress: number;   // 0..1 hold-to-confirm skip fill
  controls: string;
  reducedMotion: boolean;
  photosensitive: boolean;
}

interface Playback {
  def: CutsceneDef;
  beats: CutsceneBeat[];
  ctx: CutsceneContext;
  seen: boolean;
  beatIndex: number;
  elapsed: number;
  baseSpeed: number;
  speed: number;
  ffStep: number;       // index into FF_STEPS while holding fast-forward, -1 when not
  revealed: boolean;
  skipHeld: boolean;
  skipHold: number;
}

const DEFAULT_HOLD_SEC = 2.8;
const SKIP_HOLD_SEC = 0.4;     // hold-to-confirm threshold on a first view
const FF_STEPS = [2, 4, 8] as const;
const REVEAL_CPS = 42;          // typewriter chars/sec at 1×

const DEFAULT_SETTINGS: CutsceneRuntimeSettings = {
  length: 'full',
  defaultSpeed: 1,
  alwaysSkip: false,
  reducedMotion: false,
  photosensitive: false
};

function fillTemplate(text: string, ctx: CutsceneContext): string {
  return text.replace(/\{([a-zA-Z0-9_-]+)\}/g, (_, key: string) => String(ctx[key] ?? ''));
}

function stageText(beat: CutsceneBeat, ctx: CutsceneContext): string {
  const title = beat.stage?.find((s) => s.kind === 'title');
  if (title?.kind === 'title') return fillTemplate(title.text, ctx);
  const narrative = beat.stage?.find((s) =>
    s.kind === 'describe-environment' ||
    s.kind === 'advance-plot' ||
    s.kind === 'introduce-conflict' ||
    s.kind === 'reveal-mystery' ||
    s.kind === 'set-tone' ||
    s.kind === 'explore-theme' ||
    s.kind === 'establish-history' ||
    s.kind === 'develop-character'
  );
  return narrative && 'text' in narrative && narrative.text ? fillTemplate(narrative.text, ctx) : '';
}

export class CinematicDirector {
  private current: Playback | null = null;
  private queue: Playback[] = [];
  private settings: CutsceneRuntimeSettings = { ...DEFAULT_SETTINGS };

  get active(): boolean {
    return !!this.current;
  }

  setSettings(s: Partial<CutsceneRuntimeSettings>): void {
    this.settings = { ...this.settings, ...s };
  }

  /** STORY §4.3 — a beat fully suppressed by settings routes its line as a toast instead. */
  routesToToast(def: CutsceneDef): boolean {
    return this.settings.alwaysSkip || this.settings.length === 'off';
  }

  /** STORY §8 — replay a cut-scene from the gallery at full length, ignoring degrade/skip settings. */
  replay(def: CutsceneDef, ctx: CutsceneContext = {}): void {
    this.play(def, ctx, false, true);
  }

  play(def: CutsceneDef, ctx: CutsceneContext = {}, seen = false, replay = false): void {
    // §4.3 degrade matrix: "short" plays a setpiece as its stinger (fewer beats, tighter holds).
    const degradeSetpiece = !replay && this.settings.length === 'short' && def.tier === 'setpiece';
    const reduced = !replay && this.settings.reducedMotion;
    let beats = def.beats;
    if (degradeSetpiece) beats = beats.slice(0, Math.min(2, beats.length));
    const holdScale = (degradeSetpiece ? 0.6 : 1) * (reduced ? 0.6 : 1);
    beats = beats.map((b) => ({ ...b, hold: (b.hold ?? DEFAULT_HOLD_SEC) * holdScale }));

    const baseSpeed = replay
      ? 1
      : seen
        ? (def.tier === 'setpiece' ? this.settings.defaultSpeed : 4)
        : this.settings.defaultSpeed;
    const playback: Playback = {
      def,
      beats,
      ctx,
      seen,
      beatIndex: 0,
      elapsed: 0,
      baseSpeed,
      speed: baseSpeed,
      ffStep: -1,
      revealed: false,
      skipHeld: false,
      skipHold: 0
    };
    if (this.current) this.queue.push(playback);
    else this.current = playback;
  }

  update(dt: number): void {
    const p = this.current;
    if (!p) return;
    if (p.skipHeld) {
      p.skipHold += dt;
      if (p.skipHold >= SKIP_HOLD_SEC) {
        this.finishCurrent();
        return;
      }
    }
    const beat = p.beats[p.beatIndex];
    p.elapsed += dt * p.speed;
    if (!p.revealed && p.elapsed * REVEAL_CPS >= this.lineLength(p)) p.revealed = true;
    if (p.elapsed >= (beat?.hold ?? DEFAULT_HOLD_SEC)) this.advance();
  }

  /** Tap to continue: first completes the typewriter, then jumps to the next beat (§3.4). */
  advance(): void {
    const p = this.current;
    if (!p) return;
    if (!p.revealed) {
      p.revealed = true;
      return;
    }
    if (p.beatIndex < p.beats.length - 1) {
      p.beatIndex += 1;
      p.elapsed = 0;
      p.revealed = false;
      return;
    }
    this.finishCurrent();
  }

  /** Begin a hold-to-confirm skip. A seen cut-scene skips instantly on the first call (§3.4). */
  requestSkip(): void {
    const p = this.current;
    if (!p) return;
    if (p.seen) {
      this.finishCurrent();
      return;
    }
    p.skipHeld = true;
  }

  releaseSkip(): void {
    if (!this.current) return;
    this.current.skipHeld = false;
    this.current.skipHold = 0;
  }

  /** Legacy instant skip (used by the on-screen Skip button when the player commits). */
  skip(): void {
    this.finishCurrent();
  }

  /**
   * Hold-to-fast-forward. Each press while held steps 2× → 4× → 8× (§3.4); releasing
   * returns to the base speed (1× or the seen/default auto-speed).
   */
  setFastForward(active: boolean): void {
    const p = this.current;
    if (!p) return;
    if (active) {
      p.ffStep = p.ffStep < 0 ? 1 : (p.ffStep + 1) % FF_STEPS.length;
      p.speed = FF_STEPS[p.ffStep];
    } else {
      p.ffStep = -1;
      p.speed = p.baseSpeed;
    }
  }

  private lineLength(p: Playback): number {
    const line = p.beats[p.beatIndex]?.line;
    return line ? fillTemplate(line.text, p.ctx).length : 0;
  }

  view(): CinematicView | null {
    const p = this.current;
    if (!p) return null;
    const { def, ctx, beats, beatIndex, speed, seen, revealed } = p;
    const beat = beats[beatIndex];
    if (!beat) return null;
    const line = beat.line;
    const fullText = line ? fillTemplate(line.text, ctx) : undefined;
    const revealedText = fullText
      ? revealed
        ? fullText
        : fullText.slice(0, Math.max(1, Math.floor(p.elapsed * REVEAL_CPS)))
      : '';
    return {
      id: def.id,
      title: fillTemplate(def.title, ctx),
      tier: def.tier,
      beatIndex,
      beatCount: beats.length,
      beatKey: `${def.id}:${beatIndex}`,
      beatElapsed: p.elapsed,
      beatHold: beat.hold ?? DEFAULT_HOLD_SEC,
      letterbox: def.letterbox ?? def.tier !== 'bark',
      speed,
      seen,
      shot: beat.shot,
      stage: beat.stage ?? [],
      stageText: stageText(beat, ctx),
      sound: beat.sound,
      music: def.music,
      speaker: line ? fillTemplate(line.speaker, ctx) : undefined,
      portraitHeroId: line?.portraitHeroId ? fillTemplate(line.portraitHeroId, ctx) : undefined,
      text: fullText,
      revealedText,
      skipProgress: p.skipHeld ? Math.min(1, p.skipHold / SKIP_HOLD_SEC) : 0,
      controls: seen
        ? 'Space: next · Tab: fast-forward · Esc: skip'
        : 'Space/click: advance · hold Tab: fast-forward · hold Esc: skip',
      reducedMotion: this.settings.reducedMotion,
      photosensitive: this.settings.photosensitive
    };
  }

  private finishCurrent(): void {
    this.current = this.queue.shift() ?? null;
  }
}
