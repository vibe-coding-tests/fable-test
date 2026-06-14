import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { Game, newGameSave, SAVE_VERSION } from '../systems/game';
import { migratePhase4Save } from '../core/phase4';
import { migratePhase5Save } from '../core/phase5';
import { migratePhase6Save } from '../core/phase6';
import type { GameSave } from '../core/types';

// Save migration coverage. v6 adds Armory loadouts and dungeon progress while preserving the v4
// audio/karma/codex and v5 exploration/stamina migration paths.

beforeAll(() => registerAllContent());

describe('save v6 round-trip and migration', () => {
  it('a fresh save is v6 with audio, karma, exploration, and Armory defaults', () => {
    const save = newGameSave('juggernaut');
    expect(save.version).toBe(6);
    expect(SAVE_VERSION).toBe(6);
    expect(save.loadouts).toEqual({});
    expect(save.dungeonProgress).toEqual({});
    expect(save.reputation).toBe(0);
    expect(save.codexUnlocks).toEqual([]);
    expect(save.journalSeen).toEqual([]);
    expect(save.stamina).toBeGreaterThan(0);
    expect(save.discovered).toContain('tv-waypoint-dawnshade');
    expect(save.openedChests).toEqual([]);
    expect(save.collectedShards).toEqual([]);
    expect(save.solvedPuzzles).toEqual([]);
    expect(save.resin).toBeGreaterThan(0);
    expect(save.settings.resonance).toBe(true);
    expect(save.settings.audio).toEqual({ master: 0.8, sfx: 0.8, voice: 0.7, stinger: 0.7, muted: false });
    expect(save.settings.graphics).toEqual({ quality: 'auto', exposure: 0.92, grade: 1, reducedMotion: false });
    expect(save.settings.cutscene).toEqual({ length: 'full', defaultSpeed: 1, alwaysSkip: false, photosensitive: false, tieIns: true });
    expect(Game.validateSave(save)).toBe(true);
  });

  it('round-trips custom graphics settings and defaults them for older saves', () => {
    const save = newGameSave('lich');
    save.settings.graphics = { quality: 'ultra', exposure: 1.1, grade: 0.6, reducedMotion: true };
    const reloaded = Game.migrateSave(JSON.parse(JSON.stringify(save)) as unknown);
    expect(reloaded!.settings.graphics).toEqual({ quality: 'ultra', exposure: 1.1, grade: 0.6, reducedMotion: true });

    // A save with no graphics block gets the defaults backfilled on migration.
    const legacy = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
    (legacy.settings as Record<string, unknown>).graphics = undefined;
    const migrated = Game.migrateSave(legacy);
    expect(migrated!.settings.graphics).toEqual({ quality: 'auto', exposure: 0.92, grade: 1, reducedMotion: false });
  });

  it('round-trips a v6 save carrying karma, codex/journal, exploration, audio, and loadouts identically', () => {
    const save = newGameSave('crystal-maiden');
    save.loadouts = { 'crystal-maiden': { Default: ['blink-dagger', null, null, null, null, null] } };
    save.dungeonProgress = {
      'frost-hollow': {
        clears: 2,
        wipes: 1,
        bestDepth: 8,
        bestTier: 'nightmare',
        lastTier: 'nightmare',
        lastModifiers: ['deep-map'],
        lastClearedAt: 1234
      }
    };
    save.reputation = 7;
    save.codexUnlocks = ['hero:lich', 'region:icewrack', 'raid:roshan-pit'];
    save.journalSeen = ['quest-lich', 'badge:frost-badge'];
    save.stamina = 123;
    save.discovered = ['tv-waypoint-dawnshade', 'tv-discovery-north-glint'];
    save.openedChests = ['tv-chest-open-meadow'];
    save.collectedShards = ['tv-shard-old-well'];
    save.solvedPuzzles = ['tv-brazier-chain'];
    save.shardsTurnedIn = { 'tranquil-vale': 3 };
    save.explorationPct = { 'tranquil-vale': 42 };
    save.resin = 77;
    save.settings.audio = { master: 0.55, sfx: 0.4, voice: 0.9, stinger: 0.25, muted: true };
    save.settings.minimap = false;

    const json = JSON.stringify(save);
    const reloaded = Game.migrateSave(JSON.parse(json) as unknown);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.version).toBe(6);
    expect(reloaded!.loadouts).toEqual(save.loadouts);
    expect(reloaded!.dungeonProgress).toEqual(save.dungeonProgress);
    expect(reloaded!.reputation).toBe(7);
    expect(reloaded!.codexUnlocks).toEqual(save.codexUnlocks);
    expect(reloaded!.journalSeen).toEqual(save.journalSeen);
    expect(reloaded!.stamina).toBe(123);
    expect(reloaded!.discovered).toEqual(save.discovered);
    expect(reloaded!.openedChests).toEqual(save.openedChests);
    expect(reloaded!.collectedShards).toEqual(save.collectedShards);
    expect(reloaded!.solvedPuzzles).toEqual(save.solvedPuzzles);
    expect(reloaded!.shardsTurnedIn).toEqual(save.shardsTurnedIn);
    expect(reloaded!.explorationPct).toEqual(save.explorationPct);
    expect(reloaded!.resin).toBe(77);
    expect(reloaded!.settings.audio).toEqual(save.settings.audio);
    expect(reloaded!.settings.minimap).toBe(false);
    expect(Game.validateSave(reloaded!)).toBe(true);
  });

  it('migrates a v3 save: folds loose volumes into audio channels, defaults karma', () => {
    const v4 = newGameSave('juggernaut');
    // Build a v3-shaped save: legacy settings, no karma/codex/journal fields.
    const v3 = JSON.parse(JSON.stringify(v4)) as Record<string, unknown>;
    v3.version = 3;
    delete v3.reputation;
    delete v3.codexUnlocks;
    delete v3.journalSeen;
    delete v3.stamina;
    delete v3.discovered;
    delete v3.openedChests;
    delete v3.collectedShards;
    delete v3.solvedPuzzles;
    delete v3.shardsTurnedIn;
    delete v3.explorationPct;
    delete v3.resin;
    delete v3.resinUpdatedAt;
    v3.settings = { quickcast: true, resonance: false, masterVolume: 0.5, sfxVolume: 0.6, musicVolume: 0.3 };

    const migrated = Game.migrateSave(v3);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(6);
    expect(migrated!.loadouts).toEqual({});
    expect(migrated!.dungeonProgress).toEqual({});
    expect(migrated!.reputation).toBe(0);
    expect(migrated!.codexUnlocks).toEqual([]);
    expect(migrated!.journalSeen).toEqual([]);
    expect(migrated!.stamina).toBeGreaterThan(0);
    expect(migrated!.discovered).toEqual([]);
    expect(migrated!.openedChests).toEqual([]);
    expect(migrated!.resin).toBeGreaterThan(0);
    expect(migrated!.settings.audio.master).toBeCloseTo(0.5);
    expect(migrated!.settings.audio.sfx).toBeCloseTo(0.6);
    expect(migrated!.settings.audio.stinger).toBeCloseTo(0.3); // musicVolume -> stinger
    expect(migrated!.settings.audio.voice).toBeCloseTo(0.7); // no v3 analogue -> default
    expect(migrated!.settings.audio.muted).toBe(false);
    expect(Game.validateSave(migrated!)).toBe(true);
  });

  it('migrates a v2-shaped save all the way to v6', () => {
    const v4 = newGameSave('juggernaut');
    const v2 = JSON.parse(JSON.stringify(v4)) as Record<string, unknown>;
    v2.version = 2;
    delete v2.difficulty;
    delete v2.raidProgress;
    delete v2.eliteFive;
    delete v2.reputation;
    delete v2.codexUnlocks;
    delete v2.journalSeen;
    v2.settings = { quickcast: false, resonance: true };

    const migrated = Game.migrateSave(v2);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(6);
    expect(migrated!.loadouts).toEqual({});
    expect(migrated!.dungeonProgress).toEqual({});
    expect(migrated!.difficulty).toEqual({});
    expect(migrated!.raidProgress).toEqual({});
    expect(migrated!.reputation).toBe(0);
    expect(migrated!.settings.quickcast).toBe(false);
    expect(migrated!.settings.resonance).toBe(true);
    // v3 defaults musicVolume to 0.6 when absent, which folds into the stinger channel.
    expect(migrated!.settings.audio).toEqual({ master: 0.8, sfx: 0.8, voice: 0.7, stinger: 0.6, muted: false });
    expect(Game.validateSave(migrated!)).toBe(true);
  });

  it('migratePhase5Save is idempotent on a v5 save', () => {
    const save = newGameSave('juggernaut') as GameSave;
    save.stamina = 111;
    save.openedChests = ['tv-chest-open-meadow'];
    const once = migratePhase5Save(save);
    const twice = migratePhase5Save(once);
    expect(twice).toEqual(once);
  });

  it('migratePhase6Save is idempotent and normalizes loadout slots and dungeon progress', () => {
    const save = newGameSave('juggernaut') as GameSave;
    save.loadouts = { juggernaut: { Default: ['butterfly', null, null, null, null, null] } };
    save.dungeonProgress = { 'frost-hollow': { clears: 1, wipes: 0, bestDepth: 7, bestTier: 'hell', lastTier: 'hell', lastModifiers: ['packed-halls'] } };
    const once = migratePhase6Save(save);
    const twice = migratePhase6Save(once);
    expect(twice).toEqual(once);

    const legacy = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
    legacy.version = 5;
    legacy.loadouts = { juggernaut: { Default: ['butterfly'] } };
    legacy.dungeonProgress = { 'frost-hollow': { clears: 2, wipes: 1, bestDepth: 8, bestTier: 'nightmare', lastModifiers: ['deep-map', 12] } };
    const migrated = Game.migrateSave(legacy);
    expect(migrated?.loadouts.juggernaut.Default).toEqual(['butterfly', null, null, null, null, null]);
    expect(migrated?.dungeonProgress['frost-hollow']).toMatchObject({ clears: 2, wipes: 1, bestDepth: 8, bestTier: 'nightmare', lastModifiers: ['deep-map'] });
  });

  it('migratePhase4Save is idempotent on a v4 save', () => {
    const save = newGameSave('juggernaut') as GameSave;
    save.reputation = 3;
    const once = migratePhase4Save(save);
    const twice = migratePhase4Save(once);
    expect(twice).toEqual(once);
  });
});
