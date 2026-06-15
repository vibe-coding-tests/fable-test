import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { abilityCtx } from '../core/actions';
import { execEffects } from '../core/effects';
import { buildHero } from '../core/hero-setup';
import { deriveMasteryTrees, masteryNodeIndex, masteryPointsForLevel, masterySpent } from '../core/mastery';
import { Sim } from '../core/sim';
import { xpForLevel } from '../core/stats';
import { TUNING } from '../data/tuning';
import { Game, newGameSave } from '../systems/game';

beforeAll(() => registerAllContent());

// Strip any authored masteryTrees so these tests always exercise the template
// builder (§4), independent of which heroes have bespoke trees authored yet.
function derivedHero(id: string) {
  return { ...REG.hero(id), masteryTrees: undefined };
}

describe('mastery tree derivation', () => {
  it('derives four four-node branches from a hero kit', () => {
    const hero = derivedHero('juggernaut');
    const trees = deriveMasteryTrees(hero);

    expect(trees).toHaveLength(4);
    expect(trees.flatMap((branch) => branch.nodes)).toHaveLength(16);
    expect(trees[0].abilityId).toBe(hero.abilities[0].id);
    expect(trees[0].nodes.map((node) => node.tier)).toEqual([1, 2, 3, 4]);
    expect(trees[0].nodes[1].mechanic).toBeTruthy();
    expect(trees[0].nodes[3].mechanic).toBeTruthy();
  });

  it('awards fourteen mastery points by level thirty', () => {
    expect(masteryPointsForLevel(1)).toBe(0);
    expect(masteryPointsForLevel(2)).toBe(1);
    expect(masteryPointsForLevel(10)).toBe(5);
    expect(masteryPointsForLevel(28)).toBe(14);
    expect(masteryPointsForLevel(30)).toBe(14);
    expect(masteryPointsForLevel(30)).toBe(TUNING.mastery.pointLevels.length);
  });

  it('uses tuning values for derived growth and capstone power', () => {
    const trees = deriveMasteryTrees(derivedHero('juggernaut'));
    const firstBranch = trees[0];

    expect(firstBranch.nodes[0].abilityOverride?.amount).toBe(TUNING.mastery.growthValueMult.tier1);
    expect(firstBranch.nodes[2].abilityOverride?.amount).toBe(TUNING.mastery.growthValueMult.tier3);
    expect(firstBranch.nodes[1].abilityOverride?.amount).toBe(TUNING.mastery.mechanicValueMult.keystone);
    expect(firstBranch.nodes[3].abilityOverride?.amount).toBe(TUNING.mastery.mechanicValueMult.capstone);
  });
});

describe('mastery spending', () => {
  it('uses a separate point pool from ability rank points', () => {
    const save = newGameSave('juggernaut');
    save.roster[0].level = 2;
    save.roster[0].xp = xpForLevel(2);
    save.roster[0].abilityLevels = [1, 0, 0, 0];
    const game = Game.headless(save);
    const rec = game.party[0];

    expect(game.pendingAbilityPoints(rec)).toBe(1);
    expect(game.pendingMasteryPoints(rec)).toBe(1);
    expect(game.buyMasteryNode(0, masteryNodeIndex(0, 1))).toBe(true);
    expect(game.pendingAbilityPoints(rec)).toBe(1);
    expect(game.pendingMasteryPoints(rec)).toBe(0);
  });

  it('gates branch tiers by ability rank and previous node', () => {
    const save = newGameSave('juggernaut');
    save.roster[0].level = 4;
    save.roster[0].xp = xpForLevel(4);
    save.roster[0].abilityLevels = [2, 1, 1, 0];
    const game = Game.headless(save);

    expect(game.canBuyMasteryNode(0, masteryNodeIndex(0, 2))).toBe(false);
    expect(game.buyMasteryNode(0, masteryNodeIndex(0, 1))).toBe(true);
    expect(game.canBuyMasteryNode(0, masteryNodeIndex(0, 2))).toBe(true);
    expect(game.buyMasteryNode(0, masteryNodeIndex(0, 2))).toBe(true);
    expect(game.pendingMasteryPoints(game.party[0])).toBe(0);
  });

  it('refunds mastery ranks outside combat', () => {
    const save = newGameSave('juggernaut');
    save.roster[0].level = 4;
    save.roster[0].xp = xpForLevel(4);
    save.roster[0].abilityLevels = [2, 1, 1, 0];
    const game = Game.headless(save);

    expect(game.buyMasteryNode(0, masteryNodeIndex(0, 1))).toBe(true);
    expect(masterySpent(game.party[0].masteryRanks)).toBe(1);
    expect(game.respecMasteries(0)).toBe(true);
    expect(masterySpent(game.party[0].masteryRanks)).toBe(0);
  });

  it('migrates legacy attribute and talent spend into legal mastery nodes', () => {
    const save = newGameSave('juggernaut');
    save.roster[0].level = 10;
    save.roster[0].xp = xpForLevel(10);
    save.roster[0].abilityLevels = [4, 3, 2, 1];
    save.roster[0].attributePoints = 2;
    save.roster[0].talentPicks = [1, null, null, null];
    delete save.roster[0].masteryRanks;
    const game = Game.headless(save);

    expect(masterySpent(game.party[0].masteryRanks)).toBe(3);
    expect(game.party[0].masteryRanks[masteryNodeIndex(0, 2)]).toBe(1);
    expect(game.pendingMasteryPoints(game.party[0])).toBe(2);
  });
});

describe('mastery runtime hooks', () => {
  it('appends a registered exotic hook to bought keystone and capstone abilities', () => {
    const ranks = Array(16).fill(0);
    ranks[masteryNodeIndex(0, 1)] = 1;
    ranks[masteryNodeIndex(0, 2)] = 1;
    ranks[masteryNodeIndex(0, 3)] = 1;
    ranks[masteryNodeIndex(0, 4)] = 1;
    const build = buildHero(REG.hero('juggernaut'), [null, null, null, null], 0, undefined, undefined, ranks);
    const effects = build.def.abilities[0].effects ?? [];
    const hooks = effects.filter((effect) => effect.kind === 'exotic' && effect.id === 'mastery-mechanic');

    expect(hooks).toHaveLength(2);
    expect(hooks.map((hook) => hook.kind === 'exotic' ? hook.params?.tier : null)).toEqual([2, 4]);
  });

  it('attaches mastery hooks to passive and attack-modifier branches through triggers', () => {
    const found = [...REG.heroes.values()].flatMap((hero) =>
      hero.abilities.map((ability, branchIdx) => ({ hero, ability, branchIdx }))
    ).find(({ ability }) => ['passive', 'aura', 'attack-modifier'].includes(ability.targeting));
    expect(found).toBeDefined();
    const ranks = Array(16).fill(0);
    ranks[masteryNodeIndex(found!.branchIdx, 1)] = 1;
    ranks[masteryNodeIndex(found!.branchIdx, 2)] = 1;
    const build = buildHero(found!.hero, [null, null, null, null], 0, undefined, undefined, ranks);
    const ability = build.def.abilities[found!.branchIdx];

    expect(ability.triggers?.some((trigger) => trigger.effects?.some((effect) => effect.kind === 'exotic' && effect.id === 'mastery-mechanic'))).toBe(true);
  });

  it('runs the mark verb as a headless combat effect', () => {
    const sim = new Sim({ seed: 7, bounds: { w: 2000, h: 2000 } });
    const caster = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 500, y: 500 }, level: 2, ctrl: { kind: 'none' } });
    const enemy = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 560, y: 500 }, level: 2, ctrl: { kind: 'none' } });
    const ability = REG.hero('juggernaut').abilities[0];

    execEffects(sim, caster, abilityCtx(ability, 1), [
      { kind: 'exotic', id: 'mastery-mechanic', params: { mechanic: 'mark', tier: 2, abilityId: ability.id } }
    ], { target: enemy, point: { ...enemy.pos } });

    expect(enemy.statuses.some((status) => status.tag.startsWith('mastery:mark:'))).toBe(true);
  });
});
