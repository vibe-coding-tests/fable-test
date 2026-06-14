import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { TUNING } from '../data/tuning';
import { REG } from '../core/registry';
import { applyDamage } from '../core/combat';
import { itemStateFromSave } from '../core/items';
import { buildHero } from '../core/hero-setup';
import { Game, newGameSave } from '../systems/game';
import type { Unit } from '../core/unit';
import type { ItemSave, Vec2 } from '../core/types';

beforeAll(() => registerAllContent());

function moveUnit(u: Unit, pos: Vec2): void {
  u.pos = { ...pos };
  u.prevPos = { ...pos };
}

describe('gameplay overhaul: locomotion and discovery', () => {
  it('persists stamina/exploration fields and sprint drains stamina without changing run baseline', () => {
    const save = newGameSave('juggernaut');
    const game = Game.headless(save);
    const u = game.activeUnit()!;
    const runSpeed = u.stats.moveSpeed;

    game.orderMove({ x: u.pos.x + 1200, y: u.pos.y });
    game.setSprintHeld(true);
    game.update(0.2);

    expect(game.stamina).toBeLessThan(TUNING.traversal.staminaMax);
    expect(u.stats.moveSpeed).toBeGreaterThan(runSpeed);

    game.setSprintHeld(false);
    game.update(0.2);
    expect(u.stats.moveSpeed).toBe(runSpeed);

    const roundTrip = game.buildSave();
    expect(roundTrip.stamina).toBeCloseTo(game.stamina);
    expect(roundTrip.discovered).toContain('tv-waypoint-dawnshade');
    expect(Game.validateSave(roundTrip)).toBe(true);
  });

  it('item stamina bonuses raise the active traversal cap', () => {
    const game = Game.headless(newGameSave('juggernaut'));
    const u = game.activeUnit()!;
    u.items[0] = itemStateFromSave({ id: 'wanderer-wraps' }, game.sim.time);
    u.markStatsDirty();
    u.refresh(game.sim.time);

    expect(game.staminaMax()).toBe(TUNING.traversal.staminaMax + 60);
    game.stamina = game.staminaMax();
    expect(Game.validateSave(game.buildSave())).toBe(true);
  });

  it('projects move orders out of tree and rock obstacle circles', () => {
    const game = Game.headless(newGameSave('juggernaut'));
    const hero = game.activeUnit()!;
    const obstacle = { pos: { x: hero.pos.x + 240, y: hero.pos.y }, radius: 120 };
    game.sim.obstacles = [obstacle];

    game.orderMove({ ...obstacle.pos });

    expect(hero.order.kind).toBe('move');
    if (hero.order.kind !== 'move') return;
    const d = Math.hypot(hero.order.point.x - obstacle.pos.x, hero.order.point.y - obstacle.pos.y);
    expect(d).toBeGreaterThanOrEqual(obstacle.radius + hero.radius + 9.9);
  });

  it('tag-in items reduce swap cooldown and apply an entrance burst', () => {
    const save = newGameSave('juggernaut');
    const axeSave = newGameSave('axe').roster[0];
    axeSave.items[0] = { id: 'breacher-cloak' };
    save.recruited.push('axe');
    save.party.push('axe');
    save.roster.push(axeSave);
    const game = Game.headless(save);

    expect(game.trySwap(1)).toBe(true);
    const axe = game.activeUnit()!;
    const baseCd = game.settings.resonance ? TUNING.resonanceSwapCooldownSec : TUNING.swapCooldownSec;
    expect(game.swapReadyAt - game.sim.time).toBeLessThan(baseCd);
    expect(axe.statuses.some((s) => s.tag === 'swap-in-burst')).toBe(true);
  });

  it('Aghanim augments patch real hero ability payloads', () => {
    const base = buildHero(REG.hero('juggernaut'));
    const upgraded = buildHero(REG.hero('juggernaut'), [null, null, null, null], 0, undefined, { scepter: true, shard: true });
    const baseOmni = base.def.abilities.find((a) => a.id === 'jug-omnislash')!;
    const upOmni = upgraded.def.abilities.find((a) => a.id === 'jug-omnislash')!;
    const baseBladeFury = base.def.abilities.find((a) => a.id === 'jug-blade-fury')!;
    const upBladeFury = upgraded.def.abilities.find((a) => a.id === 'jug-blade-fury')!;

    expect(upOmni.values!.slashes[0]).toBeGreaterThan(baseOmni.values!.slashes[0]);
    expect(upOmni.cooldown![0]).toBeLessThan(baseOmni.cooldown![0]);
    expect(upBladeFury.values!.radius[0]).toBeGreaterThan(baseBladeFury.values!.radius[0]);
    expect(upgraded.externalMods.moveSpeed).toBeGreaterThan(0);
  });

  it('high rolled loot emits a loot-drop presentation event', () => {
    const game = Game.headless(newGameSave('juggernaut'));
    const presenter = game as unknown as { lootMoment(items: ItemSave[]): void };
    presenter.lootMoment([{ id: 'daedalus', grade: 'pristine', gradeRoll: 1, bound: true }]);
    game.update(0.05);
    expect(game.frameEvents.some((ev) => ev.t === 'loot-drop')).toBe(true);
  });

  it('dash is root-stopped and does not disjoint homing projectiles', () => {
    const game = Game.headless(newGameSave('juggernaut'));
    const hero = game.activeUnit()!;

    hero.addStatus({ status: 'root', tag: 'test-root', sourceUid: hero.uid, sourceTeam: 1, until: game.sim.time + 2, isDebuff: true }, true);
    hero.refresh(game.sim.time);
    expect(game.tryDash({ x: hero.pos.x + 300, y: hero.pos.y })).toBe(false);

    hero.removeStatusWhere((s) => s.tag === 'test-root');
    hero.refresh(game.sim.time);
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: hero.pos.x + 900, y: hero.pos.y } });
    game.sim.spawnProjectile(enemy, {
      defId: 'dash-test',
      level: 1,
      vfx: { archetype: 'projectile', color: '#ff8844' }
    }, {
      model: 'homing',
      speed: 900,
      disjointable: true,
      onHit: [{ kind: 'damage', dtype: 'magical', amount: 5, target: 'target' }]
    }, { targetUid: hero.uid });

    expect(game.sim.projectiles.length).toBe(1);
    expect(game.tryDash({ x: hero.pos.x + 350, y: hero.pos.y })).toBe(true);
    expect(game.sim.projectiles.length).toBe(1);

    let hit = false;
    for (let i = 0; i < 90 && !hit; i++) {
      game.update(1 / 30);
      hit = game.frameEvents.some((ev) => ev.t === 'projectile-hit' && ev.targetUid === hero.uid);
    }
    expect(hit).toBe(true);
  });

  it('discovers waypoints, shards, elemental puzzles, and puzzle-gated chests', () => {
    const game = Game.headless(newGameSave('juggernaut'));
    const hero = game.activeUnit()!;

    moveUnit(hero, { x: 6120, y: 1880 });
    game.update(0.1);
    expect(game.collectedShards.has('tv-shard-north-spark')).toBe(true);

    moveUnit(hero, { x: 5950, y: 1400 });
    game.update(0.1);
    expect(game.discovered.has('tv-waypoint-north-pass')).toBe(true);

    moveUnit(hero, { x: 3300, y: 3260 });
    game.update(0.1);
    moveUnit(hero, { x: 3560, y: 3160 });
    game.update(0.1);
    moveUnit(hero, { x: 3800, y: 3140 });
    game.update(0.1);
    expect(game.solvedPuzzles.has('tv-brazier-chain')).toBe(true);

    const goldBefore = game.gold;
    moveUnit(hero, { x: 3550, y: 3020 });
    expect(game.tryInteract()).toBe(true);
    expect(game.openedChests.has('tv-chest-dawn-ridge')).toBe(true);
    expect(game.gold).toBeGreaterThan(goldBefore);
    expect(game.groundItemDrops.some((drop) => drop.item.id === 'magic-wand')).toBe(true);
    expect(game.explorationFor()).toBeGreaterThan(0);
  });

  it('routes damage through elemental shields with weak elements only in Resonance mode', () => {
    const game = Game.headless(newGameSave('juggernaut'));
    const hero = game.activeUnit()!;
    const shielded = game.sim.spawnCreep(REG.creep('harpy-stormcrafter'), { team: 1, pos: { x: hero.pos.x + 500, y: hero.pos.y } });
    expect(shielded.elementalShield?.hp).toBeGreaterThan(0);

    game.sim.resonanceEnabled = false;
    const shieldBefore = shielded.elementalShield!.hp;
    const hpBefore = shielded.hp;
    applyDamage(game.sim, hero, shielded, 40, 'magical', { element: 'cryo' });
    expect(shielded.hp).toBe(hpBefore);
    expect(shielded.elementalShield!.hp).toBeCloseTo(shieldBefore - 36); // harpy 10% magic resist

    shielded.elementalShield!.hp = shieldBefore;
    game.sim.resonanceEnabled = true;
    applyDamage(game.sim, hero, shielded, 40, 'magical', { element: 'cryo' });
    expect(shielded.elementalShield!.hp).toBeLessThan(shieldBefore - 36);
  });
});
