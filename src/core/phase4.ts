import type { AudioSettings, CutsceneSettings, GameSave, GraphicsSettings } from './types';
import type { GameSaveV3, LegacySettings } from './phase3';

// ------------------------------------------------------------------
// Phase 6 save v4 (Phase 4 §4): audio channels, reputation, codex/journal
// arrays. Migrates a v3 save by folding the loose volume fields into the
// channel object and defaulting the rest, so v3/v2 saves load unchanged.
// ------------------------------------------------------------------

export function defaultAudioSettings(): AudioSettings {
  return { master: 0.8, sfx: 0.8, voice: 0.7, stinger: 0.7, music: 0.6, muted: false };
}

export function defaultGraphicsSettings(): GraphicsSettings {
  return {
    quality: 'auto',
    autoAdjustQuality: true,
    frameTarget: 60,
    bloom: 'tier',
    ambientOcclusion: 'tier',
    antiAliasing: 'tier',
    shadows: 'tier',
    drawDistance: 'medium',
    crowdDetail: 'auto',
    vfxDensity: 1,
    battleScale: 1,
    screenShake: 1,
    exposure: 0.92,
    grade: 1,
    reducedMotion: false,
    colorblind: false
  };
}

export function defaultCutsceneSettings(): CutsceneSettings {
  return { length: 'full', defaultSpeed: 1, alwaysSkip: false, photosensitive: false, tieIns: true };
}

/**
 * Fold legacy loose volumes into the v4 audio channel object.
 * masterVolume -> master, sfxVolume -> sfx, musicVolume -> stinger (stingers are
 * the musical layer) and -> music (the biome bed); voice has no v3 analogue, so
 * it defaults. (DECISIONS.md)
 */
export function migrateAudioSettings(old: (LegacySettings & { audio?: AudioSettings; graphics?: GraphicsSettings; cutscene?: CutsceneSettings }) | undefined): GameSave['settings'] {
  const d = defaultAudioSettings();
  const existing = old?.audio;
  const gd = defaultGraphicsSettings();
  const gx = old?.graphics;
  const cd = defaultCutsceneSettings();
  const cx = old?.cutscene;
  return {
    quickcast: old?.quickcast ?? true,
    resonance: old?.resonance ?? false,
    minimap: old?.minimap,
    graphics: {
      quality: gx?.quality ?? gd.quality,
      autoAdjustQuality: gx?.autoAdjustQuality ?? gd.autoAdjustQuality,
      frameTarget: gx?.frameTarget === 30 || gx?.frameTarget === 60 ? gx.frameTarget : gd.frameTarget,
      bloom: gx?.bloom ?? gd.bloom,
      ambientOcclusion: gx?.ambientOcclusion ?? gd.ambientOcclusion,
      antiAliasing: gx?.antiAliasing ?? gd.antiAliasing,
      shadows: gx?.shadows ?? gd.shadows,
      drawDistance: gx?.drawDistance ?? gd.drawDistance,
      crowdDetail: gx?.crowdDetail ?? gd.crowdDetail,
      vfxDensity: gx?.vfxDensity ?? gd.vfxDensity,
      battleScale: gx?.battleScale ?? gd.battleScale,
      screenShake: gx?.screenShake ?? gd.screenShake,
      exposure: gx?.exposure ?? gd.exposure,
      grade: gx?.grade ?? gd.grade,
      reducedMotion: gx?.reducedMotion ?? gd.reducedMotion,
      colorblind: gx?.colorblind ?? gd.colorblind
    },
    cutscene: {
      length: cx?.length ?? cd.length,
      defaultSpeed: cx?.defaultSpeed ?? cd.defaultSpeed,
      alwaysSkip: cx?.alwaysSkip ?? cd.alwaysSkip,
      photosensitive: cx?.photosensitive ?? cd.photosensitive,
      tieIns: cx?.tieIns ?? cd.tieIns
    },
    audio: existing
      ? {
          master: existing.master ?? d.master,
          sfx: existing.sfx ?? d.sfx,
          voice: existing.voice ?? d.voice,
          stinger: existing.stinger ?? d.stinger,
          music: existing.music ?? d.music,
          muted: existing.muted ?? d.muted
        }
      : {
          master: old?.masterVolume ?? d.master,
          sfx: old?.sfxVolume ?? d.sfx,
          voice: d.voice,
          stinger: old?.musicVolume ?? d.stinger,
          music: old?.musicVolume ?? d.music,
          muted: false
        }
  };
}

export function defaultPhase4SaveFields(): Pick<GameSave, 'reputation' | 'codexUnlocks' | 'journalSeen'> {
  return { reputation: 0, codexUnlocks: [], journalSeen: [] };
}

/** v3 (or already-v4) -> v4. Idempotent. */
export function migratePhase4Save(s: GameSaveV3 | GameSave): GameSave {
  const base = s as unknown as GameSave & GameSaveV3;
  const defaults = defaultPhase4SaveFields();
  return {
    ...base,
    version: 4,
    reputation: typeof base.reputation === 'number' ? base.reputation : defaults.reputation,
    codexUnlocks: Array.isArray(base.codexUnlocks) ? [...base.codexUnlocks] : defaults.codexUnlocks,
    journalSeen: Array.isArray(base.journalSeen) ? [...base.journalSeen] : defaults.journalSeen,
    settings: migrateAudioSettings(base.settings as LegacySettings & { audio?: AudioSettings })
  };
}
