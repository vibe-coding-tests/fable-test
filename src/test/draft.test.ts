import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import {
  BOARD_COLS,
  BOARD_ROWS,
  DOCTRINES,
  defaultFormation,
  doctrineFormation,
  placementHint,
  slotToWorld
} from '../core/board';
import { runGymMatch, type GymMatchHero } from '../systems/macro-session';
import { Game, newGameSave, SAVE_VERSION } from '../systems/game';
import type { DraftTeam, GambitRule, GameSave, HeroDef } from '../core/types';

beforeAll(() => registerAllContent());

const TEAM: GymMatchHero[] = [
  { heroId: 'juggernaut', level: 25, items: ['battlefury'] },
  { heroId: 'sven', level: 25, items: ['crystalys'] },
  { heroId: 'sniper', level: 25, items: ['dragon-lance'] },
  { heroId: 'lich', level: 25, items: ['kaya'] },
  { heroId: 'earthshaker', level: 25, items: ['blink-dagger'] }
];

function defsOf(team: GymMatchHero[]): HeroDef[] {
  return team.map((h) => REG.hero(h.heroId));
}

function cells(formation: { placements: Record<string, { col: number; row: number }> }): string[] {
  return Object.values(formation.placements).map((s) => `${s.col},${s.row}`);
}

describe('AUTOBATTLER §3.2 — placement hints', () => {
  it('every catalog hero gets a legal hint with a reason', () => {
    for (const def of REG.heroes.values()) {
      const h = placementHint(def);
      expect(h.col).toBeGreaterThanOrEqual(0);
      expect(h.col).toBeLessThanOrEqual(BOARD_COLS - 1);
      expect(['center', 'edge', 'any']).toContain(h.rowPref);
      expect(h.reason.length).toBeGreaterThan(0);
    }
  });

  it('a frontline (durable/initiator) hero hints the front column', () => {
    const front = [...REG.heroes.values()].find(
      (d) => d.roles.includes('durable') || d.roles.includes('initiator')
    );
    expect(front, 'catalog has a frontliner').toBeTruthy();
    expect(placementHint(front!).col).toBe(2);
  });
});

describe('AUTOBATTLER §3/§4 — formations are legal boards', () => {
  it('defaultFormation places all five on distinct cells', () => {
    const f = defaultFormation(defsOf(TEAM));
    const c = cells(f);
    expect(Object.keys(f.placements)).toHaveLength(5);
    expect(new Set(c).size).toBe(5); // no two heroes share a cell
    for (const s of Object.values(f.placements)) {
      expect(s.row).toBeGreaterThanOrEqual(0);
      expect(s.row).toBeLessThan(BOARD_ROWS);
      expect(s.col).toBeGreaterThanOrEqual(0);
      expect(s.col).toBeLessThan(BOARD_COLS);
    }
  });

  it('every doctrine stamps a collision-free five', () => {
    for (const d of DOCTRINES) {
      const f = doctrineFormation(d.id, defsOf(TEAM));
      expect(new Set(cells(f)).size, `${d.id} has no overlaps`).toBe(5);
      expect(Object.keys(f.placements)).toHaveLength(5);
    }
  });

  it('turtle hugs the back edge; phalanx pushes frontliners forward', () => {
    const turtle = doctrineFormation('turtle', defsOf(TEAM));
    expect(Object.values(turtle.placements).every((s) => s.col === 0)).toBe(true);

    const phalanx = doctrineFormation('phalanx', defsOf(TEAM));
    for (const h of TEAM) {
      const def = REG.hero(h.heroId);
      const want = def.roles.includes('durable') || def.roles.includes('initiator') ? 2 : 0;
      expect(phalanx.placements[h.heroId].col).toBe(want);
    }
  });
});

const SEED = 9090;

describe('AUTOBATTLER §4 — the draft flows into the gym sim', () => {
  it('a committed formation changes the fight; same formation is deterministic', () => {
    const gym = REG.gym('lunar-gym');
    const defs = defsOf(TEAM);
    const baseline = runGymMatch(gym, TEAM, SEED);
    const placed = runGymMatch(gym, TEAM, SEED, defaultFormation(defs));
    const placedAgain = runGymMatch(gym, TEAM, SEED, defaultFormation(defs));

    expect(placed.rounds[0].result.hash).toBe(placedAgain.rounds[0].result.hash);
    expect(placed.rounds[0].result.hash).not.toBe(baseline.rounds[0].result.hash);
  }, 20000);
});

function saveForTeam(team: GymMatchHero[]): GameSave {
  const save = newGameSave(team[0].heroId);
  const template = structuredClone(save.roster[0]);
  save.party = team.map((h) => h.heroId);
  save.recruited = team.map((h) => h.heroId);
  save.roster = team.map((h) => ({
    ...structuredClone(template),
    heroId: h.heroId,
    level: h.level ?? 20,
    items: [null, null, null, null, null, null]
  }));
  return save;
}

describe('AUTOBATTLER §4 — draft → place → fight, end to end', () => {
  it('the default draft is the walking party on a sane board', () => {
    const game = Game.headless(saveForTeam(TEAM));
    const draft = game.defaultGymDraft('lunar-gym');
    expect(draft.heroes.map((h) => h.heroId)).toEqual(TEAM.map((h) => h.heroId));
    expect(new Set(cells(draft.formation)).size).toBe(5);
    expect(game.gymDraft('lunar-gym')).toBeNull(); // nothing committed yet
  });

  it('a committed draft spawns its five on their authored cells', () => {
    const game = Game.headless(saveForTeam(TEAM));
    const draft: DraftTeam = {
      heroes: TEAM.map((h) => ({ heroId: h.heroId, level: h.level, items: h.items })),
      formation: { placements: { [TEAM[0].heroId]: { col: 0, row: 0 } } }
    };
    game.commitGymDraft('lunar-gym', draft);
    expect(game.gymDraft('lunar-gym')).not.toBeNull();

    expect(game.startLiveGym('lunar-gym')).toBe(true);
    const want = slotToWorld(0, { col: 0, row: 0 }).pos;
    const hero = game.liveGym!.sim.unitsArr.find((u) => u.heroId === TEAM[0].heroId && u.team === 0)!;
    expect(hero.pos.x).toBeCloseTo(want.x, 5);
    expect(hero.pos.y).toBeCloseTo(want.y, 5);
  });

  it('the draft can field recruited heroes outside the walking party', () => {
    const game = Game.headless(saveForTeam(TEAM));
    const swapped = ['pudge', 'axe', 'crystal-maiden', 'lich', 'sven'];
    game.commitGymDraft('lunar-gym', {
      heroes: swapped.map((id) => ({ heroId: id, level: 20 })),
      formation: defaultFormation(swapped.map((id) => REG.hero(id)))
    });
    expect(game.startLiveGym('lunar-gym')).toBe(true);
    const fielded = game.liveGym!.playerHeroes().map((u) => u.heroId).sort();
    expect(fielded).toEqual([...swapped].sort());
  });

  it('draft-specific items and gambits feed the gym without mutating the walking party', () => {
    const game = Game.headless(saveForTeam(TEAM));
    const customRules: GambitRule[] = [{ if: [{ k: 'always' }], then: { k: 'hold' } }];
    game.commitGymDraft('lunar-gym', {
      heroes: TEAM.map((h, i) => ({
        heroId: h.heroId,
        level: h.level,
        items: i === 0 ? ['blink-dagger'] : h.items,
        gambits: i === 0 ? customRules : undefined
      })),
      formation: defaultFormation(defsOf(TEAM))
    });

    expect(game.gymPlayerTeam()[0].items).toEqual([]); // party loadout remains untouched
    expect(game.startLiveGym('lunar-gym')).toBe(true);
    const drafted = game.liveGym!.playerHeroes().find((u) => u.heroId === TEAM[0].heroId)!;
    expect(drafted.items.some((it) => it?.defId === 'blink-dagger')).toBe(true);
    expect(drafted.ctrl.kind).toBe('gambit');
    if (drafted.ctrl.kind === 'gambit') expect(drafted.ctrl.rules).toEqual(customRules);
  });

  it('per-gym drafts survive a save round-trip', () => {
    const game = Game.headless(saveForTeam(TEAM));
    const draft: DraftTeam = {
      heroes: TEAM.map((h) => ({ heroId: h.heroId, level: h.level })),
      formation: doctrineFormation('phalanx', defsOf(TEAM))
    };
    game.commitGymDraft('lunar-gym', draft);

    const save = game.buildSave();
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.gymDrafts?.['lunar-gym']).toBeTruthy();

    const reloaded = Game.headless(Game.migrateSave(save)!);
    const back = reloaded.gymDraft('lunar-gym')!;
    expect(back.heroes.map((h) => h.heroId)).toEqual(TEAM.map((h) => h.heroId));
    expect(back.formation).toEqual(draft.formation);
  });

  it('a v8 save (no drafts) loads and plays as the walking party', () => {
    const save = saveForTeam(TEAM) as GameSave & { version: number };
    save.version = 8;
    delete (save as { gymDrafts?: unknown }).gymDrafts;
    const migrated = Game.migrateSave(save);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(SAVE_VERSION);
    const game = Game.headless(migrated!);
    expect(game.gymDraft('lunar-gym')).toBeNull();
  });
});
