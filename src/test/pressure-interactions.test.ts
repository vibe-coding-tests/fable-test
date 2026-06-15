import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { slotToWorld, type Formation } from '../core/board';
import { buildLegalTeam, counterDraft, formatSatisfiable, isLegalDraft, runPickBan } from '../core/draft';
import { runMacroBattle, setupMacroSim } from '../core/macro';
import { REG } from '../core/registry';
import { chooseUtilityOrder } from '../core/utility';
import type { DraftFormat, MacroHeroSetup } from '../core/types';

beforeAll(() => registerAllContent());

const ALL_IDS = (): string[] => [...REG.heroes.keys()].sort();
const team = (ids: string[], level = 24, items?: string[]): MacroHeroSetup[] =>
  ids.map((heroId) => ({ heroId, level, items }));

function roleCount(heroes: MacroHeroSetup[], role: string): number {
  return heroes.filter((h) => REG.hero(h.heroId).roles.includes(role)).length;
}

describe('pressure: board cells feed live combat decisions', () => {
  it('moving a backliner from back to front crosses the engage threshold', () => {
    const frontCell = slotToWorld(0, { col: 2, row: 2 }).pos;
    const rangeProbe = setupMacroSim({
      seed: 202614,
      teamA: [{ heroId: 'sniper', level: 18 }],
      teamB: [{ heroId: 'lich', level: 18 }],
      maxSec: 20
    });
    const sniperProbe = rangeProbe.unitsArr.find((u) => u.team === 0 && u.heroId === 'sniper')!;
    const engageRange = sniperProbe.stats.attackRange + 260;
    const enemyPoint = { x: frontCell.x + engageRange - 120, y: frontCell.y };

    const build = (formationA: Formation) => {
      const sim = setupMacroSim({
        seed: 202614,
        teamA: [{ heroId: 'sven', level: 18 }, { heroId: 'sniper', level: 18 }],
        teamB: [{ heroId: 'lich', level: 18 }],
        formationA,
        maxSec: 20
      });
      const sniper = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sniper')!;
      const enemy = sim.unitsArr.find((u) => u.team === 1)!;
      enemy.pos = { ...enemyPoint };
      sim.rebuildSpatial();
      return { sim, sniper, enemy };
    };

    const back = build({
      placements: {
        sven: { col: 2, row: 2 },
        sniper: { col: 0, row: 2 }
      }
    });
    expect(back.sim.teamMind(0).engaged).toBe(false);
    expect(chooseUtilityOrder(back.sim, back.sniper, back.enemy)?.kind).toBe('hold');

    const front = build({
      placements: {
        sven: { col: 0, row: 2 },
        sniper: { col: 2, row: 2 }
      }
    });
    expect(front.sim.teamMind(0).engaged).toBe(true);
    expect(chooseUtilityOrder(front.sim, front.sniper, front.enemy)?.kind).not.toBe('hold');
  });
});

describe('pressure: draft constraints under adversarial combinations', () => {
  it('builds a full legal five under stacked role, level, and point-budget rules', () => {
    const fmt: DraftFormat = {
      rules: [
        { kind: 'require-role', role: 'support', min: 2 },
        { kind: 'cap-role', role: 'carry', max: 1 },
        { kind: 'level-cap', max: 22 },
        { kind: 'point-budget', total: 7, costByRole: { carry: 3 } }
      ]
    };

    const built = buildLegalTeam(fmt, ALL_IDS(), 8675309, { level: 22 });
    expect(built).toHaveLength(5);
    expect(isLegalDraft(fmt, built)).toBe(true);
    expect(roleCount(built, 'support')).toBeGreaterThanOrEqual(2);
    expect(roleCount(built, 'carry')).toBeLessThanOrEqual(1);
  });

  it('does not pad an impossible unique-attribute format into an illegal five', () => {
    const impossible: DraftFormat = { rules: [{ kind: 'unique-attribute' }] };
    const built = buildLegalTeam(impossible, ALL_IDS(), 13);

    expect(formatSatisfiable(impossible, ALL_IDS())).toBe(false);
    expect(built.length).toBeLessThan(5);
    expect(isLegalDraft(impossible, built)).toBe(true);
  });
});

describe('pressure: counter-draft output must still obey the draft contract', () => {
  const playerDoubleCarry = team(['juggernaut', 'sven', 'sniper', 'pudge', 'crystal-maiden']);
  const baseEnemy = team(['crystal-maiden', 'jakiro', 'ancient-apparition', 'tusk', 'lich'], 17);
  const antiCarryCounters = ['doom', 'axe', 'legion-commander', 'viper', 'slardar', 'bane', 'shadow-demon'];

  it('skips banned counter picks and chooses the next legal pool member', () => {
    const fmt: DraftFormat = {
      counterDraft: 'last-pick',
      rules: [{ kind: 'ban-hero', heroIds: ['doom', 'axe', 'legion-commander'] }]
    };
    const result = counterDraft(fmt, playerDoubleCarry, baseEnemy, ['doom', 'axe', 'legion-commander', 'viper'], 99);

    expect(result.swappedIn).toEqual(['viper']);
    expect(isLegalDraft(fmt, result.enemy)).toBe(true);
  });

  it('leaves the enemy unchanged when every requested counter is banned or unavailable', () => {
    const fmt: DraftFormat = {
      counterDraft: 'last-pick',
      rules: [{ kind: 'ban-hero', heroIds: antiCarryCounters }]
    };
    const result = counterDraft(fmt, playerDoubleCarry, baseEnemy, antiCarryCounters, 99);

    expect(result.swappedIn).toEqual([]);
    expect(result.enemy).toEqual(baseEnemy);
  });
});

describe('pressure: draft results enter the macro sim as real teams', () => {
  it('feeds deterministic pick/ban output into a deterministic battle result', () => {
    const fmt: DraftFormat = {
      rules: [
        { kind: 'require-role', role: 'support', min: 1 },
        { kind: 'cap-role', role: 'carry', max: 2 }
      ]
    };
    const drafted = runPickBan({
      playerPool: ALL_IDS(),
      enemyPool: ALL_IDS(),
      order: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'pick', 'pick', 'pick', 'pick'],
      seed: 424242,
      playerFormat: fmt,
      enemyFormat: fmt,
      level: 28
    });

    expect(isLegalDraft(fmt, drafted.player)).toBe(true);
    expect(isLegalDraft(fmt, drafted.enemy)).toBe(true);

    const first = runMacroBattle({ seed: 5150, teamA: drafted.player, teamB: drafted.enemy, maxSec: 120 });
    const second = runMacroBattle({ seed: 5150, teamA: drafted.player, teamB: drafted.enemy, maxSec: 120 });

    expect(second.hash).toBe(first.hash);
    expect(second.winner).toBe(first.winner);
    expect(first.winner).not.toBe(-1);
  }, 20000);
});
