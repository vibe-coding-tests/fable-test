import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { TUNING } from '../data/tuning';
import { REG } from '../core/registry';
import { applyDamage, applyElementAura } from '../core/combat';
import { itemStateFromSave } from '../core/items';
import { buildHero } from '../core/hero-setup';
import { normalizeCollisionObstacle, staticCircleObstacle } from '../core/collision';
import { resolveCastPreview } from '../core/cast-preview';
import { Game, newGameSave } from '../systems/game';
import { tagBoonTeamValue } from '../data/tag-boons';
import type { Unit } from '../core/unit';
import type { ItemSave, Vec2 } from '../core/types';

beforeAll(() => registerAllContent());

function moveUnit(u: Unit, pos: Vec2): void {
  u.pos = { ...pos };
  u.prevPos = { ...pos };
}

function advance(game: Game, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) game.update(Math.min(0.1, seconds - t));
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
    const obstacle = staticCircleObstacle({ pos: { x: hero.pos.x + 240, y: hero.pos.y }, radius: 120, id: 'test-obstacle' });
    game.sim.obstacles = [normalizeCollisionObstacle(obstacle)];

    game.orderMove({ ...obstacle.pos });

    expect(hero.order.kind).toBe('move');
    if (hero.order.kind !== 'move') return;
    const d = Math.hypot(hero.order.point.x - obstacle.pos.x, hero.order.point.y - obstacle.pos.y);
    expect(d).toBeGreaterThanOrEqual(obstacle.radius + hero.radius + 9.9);
  });

  it('resolves invalid ability targets and line-of-sight blockers before cast issue', () => {
    const game = Game.headless(newGameSave('juggernaut'));
    const sim = game.sim;
    const caster = sim.spawnHero(REG.hero('lich'), { team: 0, pos: { x: 400, y: 500 }, level: 1, ctrl: { kind: 'none' } });
    const enemy = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 900, y: 500 }, level: 1, ctrl: { kind: 'none' } });
    const ally = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 700, y: 650 }, level: 1, ctrl: { kind: 'none' } });
    const ability = caster.abilities.find((a) => a.def.targeting === 'unit-target' && a.def.affects === 'enemy')!;

    expect(resolveCastPreview(sim, caster, ability.def, ability.level, { uid: ally.uid }).reason).toBe('wrong-target');

    sim.obstacles = [normalizeCollisionObstacle(staticCircleObstacle({
      pos: { x: 650, y: 500 },
      radius: 55,
      id: 'sight-wall',
      blocksVision: true,
      blocksProjectiles: true
    }))];
    const blocked = resolveCastPreview(sim, caster, ability.def, ability.level, { uid: enemy.uid });

    expect(blocked.reason).toBe('no-line');
    expect(blocked.lineBlockedAt?.x).toBeLessThan(enemy.pos.x);
    expect(blocked.shapes.length).toBeGreaterThan(0);
  });

  it('tag-in items reduce swap cooldown and apply an entrance burst', () => {
    const save = newGameSave('juggernaut');
    const axeSave = newGameSave('axe').roster[0];
    axeSave.items[0] = { id: 'breacher-cloak' };
    save.recruited.push('axe');
    save.party.push('axe');
    save.roster.push(axeSave);
    const game = Game.headless(save);
    game.activeUnit()!.lastEnemyDamageAt = game.sim.time;

    expect(game.trySwap(1)).toBe(true);
    const axe = game.activeUnit()!;
    const baseCd = game.settings.resonance ? TUNING.resonanceSwapFloorSec : TUNING.swapFloorSec;
    expect(game.swapReadyAt - game.sim.time).toBeLessThan(baseCd);
    expect(axe.statuses.some((s) => s.tag === 'swap-in-burst')).toBe(true);
    expect(game.party[1].tagGaugeReadyAt).toBeGreaterThan(game.sim.time);
  });

  it('spent tag gauges still allow reposition swaps without replaying the boon', () => {
    const save = newGameSave('juggernaut');
    const axeSave = newGameSave('axe').roster[0];
    axeSave.items[0] = { id: 'breacher-cloak' };
    save.recruited.push('axe');
    save.party.push('axe');
    save.roster.push(axeSave);
    const game = Game.headless(save);
    game.activeUnit()!.lastEnemyDamageAt = game.sim.time;

    expect(game.trySwap(1)).toBe(true);
    expect(game.activeUnit()!.statuses.some((s) => s.tag === 'swap-in-burst')).toBe(true);

    advance(game, TUNING.resonanceSwapFloorSec + 0.1);
    expect(game.trySwap(0)).toBe(true);
    advance(game, TUNING.resonanceSwapFloorSec + 0.1);
    expect(game.trySwap(1)).toBe(true);
    expect(game.activeUnit()!.statuses.some((s) => s.tag === 'swap-in-burst')).toBe(false);
  });

  it('tag boon archetypes resolve as ordinary EffectNodes on swap', () => {
    const swapInto = (heroId: string, hpPct = 1) => {
      const save = newGameSave('juggernaut');
      const heroSave = newGameSave(heroId).roster[0];
      heroSave.hpPct = hpPct;
      save.recruited.push(heroId);
      save.party.push(heroId);
      save.roster.push(heroSave);
      const game = Game.headless(save);
      const active = game.activeUnit()!;
      active.lastEnemyDamageAt = game.sim.time;
      const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: active.pos.x + 120, y: active.pos.y } });
      expect(game.trySwap(1)).toBe(true);
      return { game, hero: game.activeUnit()!, enemy };
    };

    const earthshaker = swapInto('earthshaker');
    expect(earthshaker.enemy.statuses.some((s) => s.status === 'stun')).toBe(true);

    const pudge = swapInto('pudge');
    expect(pudge.enemy.forced.some((f) => f.kind === 'pull')).toBe(true);

    const cm = swapInto('crystal-maiden', 0.5);
    expect(cm.hero.hp / cm.hero.stats.maxHp).toBeGreaterThan(0.5);
    expect(cm.enemy.elementAuras.cryo).toBeDefined();

    const luna = swapInto('luna');
    expect(luna.enemy.hp).toBeLessThan(luna.enemy.stats.maxHp);
  });

  it('ready elemental tag boons preview reactions against nearby auras', () => {
    const save = newGameSave('juggernaut');
    const cmSave = newGameSave('crystal-maiden').roster[0];
    save.recruited.push('crystal-maiden');
    save.party.push('crystal-maiden');
    save.roster.push(cmSave);
    const game = Game.headless(save);
    const active = game.activeUnit()!;
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: active.pos.x + 120, y: active.pos.y } });
    applyElementAura(game.sim, active, enemy, 'pyro', 1, false);

    const preview = game.tagReactionPreview(1);
    expect(preview?.reaction).toBe('melt');
    expect(preview?.targetName).toBe(enemy.name);

    game.party[1].tagGaugeReadyAt = game.sim.time + 1;
    expect(game.tagReactionPreview(1)).toBeNull();
  });

  it('Tag Chain amplifies chained tag-in effects inside the window', () => {
    const damageFromLunaTag = (chainFirst: boolean): number => {
      const save = newGameSave('juggernaut');
      const sniperSave = newGameSave('sniper').roster[0];
      const lunaSave = newGameSave('luna').roster[0];
      save.recruited.push('sniper', 'luna');
      save.party.push('sniper', 'luna');
      save.roster.push(sniperSave, lunaSave);
      const game = Game.headless(save);
      const active = game.activeUnit()!;
      active.lastEnemyDamageAt = game.sim.time;
      const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: active.pos.x + 120, y: active.pos.y } });
      if (chainFirst) {
        expect(game.trySwap(1)).toBe(true);
        advance(game, TUNING.resonanceSwapFloorSec + 0.05);
        expect(game.trySwap(2)).toBe(true);
      } else {
        expect(game.trySwap(2)).toBe(true);
      }
      return enemy.stats.maxHp - enemy.hp;
    };

    const baseline = damageFromLunaTag(false);
    const chained = damageFromLunaTag(true);
    expect(chained).toBeGreaterThan(baseline * 1.1);
  });

  it('Resonance keeps off-field tag zones ticking long enough to set up reactions', () => {
    const save = newGameSave('natures-prophet');
    const sniperSave = newGameSave('sniper').roster[0];
    const linaSave = newGameSave('lina').roster[0];
    save.recruited.push('sniper', 'lina');
    save.party.push('sniper', 'lina');
    save.roster.push(sniperSave, linaSave);
    const game = Game.headless(save);
    const active = game.activeUnit()!;
    active.lastEnemyDamageAt = game.sim.time;
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: active.pos.x + 120, y: active.pos.y } });

    expect(game.trySwap(1)).toBe(true);
    game.update(0);
    expect(game.party[0].unit?.offFieldUntil).toBeGreaterThan(game.sim.time);
    expect(game.frameEvents.some((ev) => ev.t === 'off-field' && ev.heroId === 'natures-prophet')).toBe(true);
    advance(game, 1.15);
    expect(enemy.elementAuras.dendro).toBeDefined();
    expect(game.trySwap(2)).toBe(true);
    game.update(0);
    expect(game.frameEvents.some((ev) => ev.t === 'reaction' && ev.reaction === 'burning')).toBe(true);
  });

  it('Imprint tag-out leaves a legacy field while the owner is off-field', () => {
    const save = newGameSave('warlock');
    const jugSave = newGameSave('juggernaut').roster[0];
    save.recruited.push('juggernaut');
    save.party.push('juggernaut');
    save.roster.push(jugSave);
    const game = Game.headless(save);
    const active = game.activeUnit()!;
    active.lastEnemyDamageAt = game.sim.time;
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: active.pos.x + 120, y: active.pos.y } });

    expect(game.trySwap(1)).toBe(true);
    expect(game.sim.zones.length).toBeGreaterThan(0);
    expect(game.party[0].unit?.offFieldUntil).toBeGreaterThan(game.sim.time);
    const hp = enemy.hp;
    advance(game, 1.1);
    expect(enemy.hp).toBeLessThan(hp);
    advance(game, TUNING.resonanceOffFieldPersistenceSec);
    expect(game.party[0].unit).toBeNull();
  });

  it('an offField-flagged channel keeps ticking while its caster is benched (§8.2)', () => {
    const save = newGameSave('drow-ranger');
    const jugSave = newGameSave('juggernaut').roster[0];
    save.recruited.push('juggernaut');
    save.party.push('juggernaut');
    save.roster.push(jugSave);
    const game = Game.headless(save);
    const drow = game.activeUnit()!;
    drow.lastEnemyDamageAt = game.sim.time;
    drow.mana = drow.stats.maxMana;
    const slot = drow.abilities.findIndex((a) => a.def.id === 'drow-multishot');
    drow.abilities[slot].level = 1;
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: drow.pos.x + 120, y: drow.pos.y } });

    game.sim.order(drow.uid, { kind: 'cast', slot });
    advance(game, 0.35); // through the cast point — the channel is now running
    expect(drow.channel).not.toBeNull();
    const hpAtSwap = enemy.hp;

    expect(game.trySwap(1)).toBe(true); // bench Drow mid-channel
    game.update(0);
    const benched = game.party[0].unit!;
    expect(benched.offFieldUntil).toBeGreaterThan(game.sim.time);
    expect(benched.channel).not.toBeNull(); // the turret survived the swap-out

    advance(game, 1.0); // off-field ticks keep raining arrows
    expect(enemy.hp).toBeLessThan(hpAtSwap);
  });

  it('a non-offField channel is still torn down on swap-out', () => {
    // Pudge's Dismember is a plain channel (no offField flag): swapping should drop it.
    const save = newGameSave('pudge');
    const jugSave = newGameSave('juggernaut').roster[0];
    save.recruited.push('juggernaut');
    save.party.push('juggernaut');
    save.roster.push(jugSave);
    const game = Game.headless(save);
    const pudge = game.activeUnit()!;
    pudge.lastEnemyDamageAt = game.sim.time;
    pudge.mana = pudge.stats.maxMana;
    const slot = pudge.abilities.findIndex((a) => a.def.channel && !a.def.channel.offField);
    expect(slot).toBeGreaterThanOrEqual(0);
    pudge.abilities[slot].level = 1;
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: pudge.pos.x + 80, y: pudge.pos.y } });

    game.sim.order(pudge.uid, { kind: 'cast', slot, uid: enemy.uid });
    advance(game, 0.45);
    expect(pudge.channel).not.toBeNull();

    expect(game.trySwap(1)).toBe(true);
    game.update(0);
    const benched = game.party[0].unit;
    // either reaped or kept off-field, but the channel must be gone
    expect(benched?.channel ?? null).toBeNull();
  });

  it('a swap pressed during a cast point queues until the cast fires, never eating it (§8.3)', () => {
    const save = newGameSave('drow-ranger');
    const jugSave = newGameSave('juggernaut').roster[0];
    save.recruited.push('juggernaut');
    save.party.push('juggernaut');
    save.roster.push(jugSave);
    const game = Game.headless(save);
    const drow = game.activeUnit()!;
    drow.mana = drow.stats.maxMana;
    const slot = drow.abilities.findIndex((a) => a.def.id === 'drow-gust');
    drow.abilities[slot].level = 1;

    game.sim.order(drow.uid, { kind: 'cast', slot, point: { x: drow.pos.x + 400, y: drow.pos.y } });
    advance(game, 0.1); // inside the cast point (Gust castPoint 0.25)
    expect(drow.cast).not.toBeNull();

    const projBefore = game.sim.projectiles.length;
    expect(game.trySwap(1)).toBe(true); // accepted, but queued
    expect(game.activeIdx).toBe(0); // not swapped yet — the cast is still resolving

    advance(game, 0.3); // cast fires, then the queued swap flushes
    expect(game.sim.projectiles.length).toBeGreaterThan(projBefore); // the cast was NOT lost
    expect(game.activeIdx).toBe(1); // queued swap executed once the cast point resolved
  });

  it('tag-focused items expose S4 stats through normal item stat derivation', () => {
    const game = Game.headless(newGameSave('crystal-maiden'));
    const hero = game.activeUnit()!;
    hero.items[0] = itemStateFromSave({ id: 'relay-standard' }, game.sim.time);
    hero.items[1] = itemStateFromSave({ id: 'chainweaver-band' }, game.sim.time);
    hero.markStatsDirty();
    hero.refresh(game.sim.time);

    expect(REG.item('relay-standard').passiveMods?.tagBoonAmpPct).toBe(30);
    expect(hero.stats.tagBoonAmpPct).toBeGreaterThanOrEqual(42);
    expect(hero.stats.tagGaugeReductionPct).toBeGreaterThanOrEqual(25);
    expect(hero.stats.tagChainWindowBonusSec).toBeGreaterThanOrEqual(1);
  });

  // SWAP_COMBAT_OVERHAUL §4 acceptance: a two-support rotation out-tempos a
  // three-carry line. A self-buff is wasted the moment you tag out, so a carry's
  // tag-in contributes almost nothing to a rotation, while a support's team buffs,
  // heals, and enemy debuffs keep paying off. The harness greedily rotates each
  // line over a fixed window on the real swap floor + per-hero gauges and sums the
  // team value delivered — fully deterministic, no RNG.
  it('a two-support rotation out-tempos a three-carry line over a fixed window', () => {
    const rotationTeamValue = (benchIds: string[], windowSec: number): number => {
      const floor = TUNING.resonanceSwapFloorSec;
      const heroes = benchIds.map((id) => ({ boon: REG.hero(id).tagBoon!, readyAt: 0 }));
      let t = 0;
      let lastSwap = -Infinity;
      let total = 0;
      while (t < windowSec) {
        if (t - lastSwap >= floor) {
          const ready = heroes
            .filter((h) => h.readyAt <= t)
            .sort((a, b) => tagBoonTeamValue(b.boon) - tagBoonTeamValue(a.boon));
          if (ready.length > 0) {
            const h = ready[0];
            total += tagBoonTeamValue(h.boon);
            h.readyAt = t + h.boon.gaugeSec;
            lastSwap = t;
          }
        }
        t += 0.1;
      }
      return total;
    };

    const WINDOW = 24;
    const supports = rotationTeamValue(['crystal-maiden', 'omniknight'], WINDOW);
    const carries = rotationTeamValue(['sniper', 'juggernaut', 'phantom-assassin'], WINDOW);

    // even outnumbered, the support rotation delivers far more team tempo.
    expect(supports).toBeGreaterThan(carries * 1.5);
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

  it('a dash issued mid-windup cancels the strike and deals no free damage (G0)', () => {
    const game = Game.headless(newGameSave('juggernaut'));
    const hero = game.activeUnit()!;
    const creep = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: hero.pos.x + 120, y: hero.pos.y } });
    const fullHp = creep.hp;

    // order the melee attack and step until the strike is winding up but has not landed
    game.sim.order(hero.uid, { kind: 'attack-unit', uid: creep.uid });
    let windingUp = false;
    for (let i = 0; i < 240 && !windingUp; i++) {
      game.update(1 / 60);
      windingUp = hero.windupUntil > game.sim.time;
    }
    expect(windingUp, 'hero should reach an attack windup').toBe(true);
    expect(creep.hp).toBe(fullHp); // damage lands at the END of the windup, not yet

    // dash mid-windup: the forced move cancels the pending strike (no "swing, dash, keep the hit")
    game.stamina = game.staminaMax();
    expect(game.tryDash({ x: hero.pos.x - 600, y: hero.pos.y })).toBe(true);

    for (let i = 0; i < 20; i++) game.update(1 / 60);
    expect(hero.windupUntil).toBe(-1);   // the windup was cancelled, not resolved
    expect(creep.hp).toBe(fullHp);       // the cancelled strike never dealt its damage
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
