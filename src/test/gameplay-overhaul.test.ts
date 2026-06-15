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
import type { GameSave, ItemSave, Vec2 } from '../core/types';

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

  it('off-field summoners leave real summon bodies that fight while benched (§5/§6)', () => {
    const save = newGameSave('enigma');
    const jugSave = newGameSave('juggernaut').roster[0];
    save.recruited.push('juggernaut');
    save.party.push('juggernaut');
    save.roster.push(jugSave);
    const game = Game.headless(save);
    const enigma = game.activeUnit()!;
    enigma.lastEnemyDamageAt = game.sim.time;
    const enemy = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: enigma.pos.x + 140, y: enigma.pos.y } });

    expect(game.sim.unitsArr.some((u) => u.creepId === 'enigma-tag-eidolon')).toBe(false);

    expect(game.trySwap(1)).toBe(true); // bench Enigma → tag-out spawns real eidolon bodies
    game.update(0);
    const eidolons = game.sim.unitsArr.filter((u) => u.alive && u.creepId === 'enigma-tag-eidolon');
    expect(eidolons.length).toBeGreaterThanOrEqual(2);
    expect(game.party[0].unit?.offFieldUntil).toBeGreaterThan(game.sim.time);

    const hp = enemy.hp;
    advance(game, 2.0); // the benched hero's eidolons keep attacking on their own
    expect(enemy.hp).toBeLessThan(hp);
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

// ============================================================
// SWAP_COMBAT_OVERHAUL S4 item tag lines, §3.3 aim cursor, §9 next-link + dull
// beat, and the under-tested acceptance corners (Resonance-off remove-on-swap,
// bench-time gauge rearm, WD's off-field Death Ward channel).
// ============================================================

interface PartyEntry { id: string; items?: string[]; hpPct?: number }

function partySave(entries: PartyEntry[]): GameSave {
  const [first, ...rest] = entries;
  const save = newGameSave(first.id);
  const equip = (roster: GameSave['roster'][number], items?: string[]) =>
    items?.forEach((id, i) => { roster.items[i] = { id }; });
  equip(save.roster[0], first.items);
  if (first.hpPct !== undefined) save.roster[0].hpPct = first.hpPct;
  for (const e of rest) {
    const r = newGameSave(e.id).roster[0];
    equip(r, e.items);
    if (e.hpPct !== undefined) r.hpPct = e.hpPct;
    save.recruited.push(e.id);
    save.party.push(e.id);
    save.roster.push(r);
  }
  return save;
}

function enemyAt(game: Game, x: number, y: number): Unit {
  const e = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x, y } });
  e.ctrl = { kind: 'none' };
  return e;
}

describe('swap overhaul S4: item-granted tag lines', () => {
  it('Mekansm adds a tag-in team heal to a boon that has none (Earthshaker)', () => {
    const game = Game.headless(partySave([{ id: 'juggernaut' }, { id: 'earthshaker', items: ['mekansm'], hpPct: 0.5 }]));
    game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
    enemyAt(game, game.activeUnit()!.pos.x + 120, game.activeUnit()!.pos.y);

    expect(game.trySwap(1)).toBe(true);
    const es = game.activeUnit()!;
    expect(es.hp / es.stats.maxHp).toBeGreaterThan(0.5); // the item heal fired; Earthshaker's own boon heals nothing
  });

  it('Force Staff grants a Gather crumb (shoves the nearest foe) on tag-in', () => {
    const game = Game.headless(partySave([{ id: 'juggernaut' }, { id: 'sniper', items: ['force-staff'] }]));
    const active = game.activeUnit()!;
    active.lastEnemyDamageAt = game.sim.time;
    const enemy = enemyAt(game, active.pos.x + 120, active.pos.y);

    expect(game.trySwap(1)).toBe(true);
    expect(enemy.forced.length).toBeGreaterThan(0); // Sniper's Onslaught never displaces — the staff did
  });

  it('Echo Conduit leaves an extra lingering field on a Soak tag', () => {
    const zonesAfterSwap = (items: string[]): number => {
      const game = Game.headless(partySave([{ id: 'juggernaut' }, { id: 'morphling', items }]));
      const active = game.activeUnit()!;
      active.lastEnemyDamageAt = game.sim.time;
      enemyAt(game, active.pos.x + 120, active.pos.y);
      game.setResonanceEnabled(true);
      expect(game.trySwap(1)).toBe(true);
      return game.sim.zones.length;
    };
    expect(zonesAfterSwap(['echo-conduit'])).toBeGreaterThan(zonesAfterSwap([]));
  });

  it('Vanguard Sigil grants a Bulwark tag-in (self DR) only when the boon fires', () => {
    const drFromSwap = (inCombat: boolean): number => {
      const game = Game.headless(partySave([{ id: 'juggernaut' }, { id: 'earthshaker', items: ['vanguard-sigil'] }]));
      if (inCombat) game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
      expect(game.trySwap(1)).toBe(true);
      return game.activeUnit()!.stats.damageTakenReductionPct;
    };
    // out of combat the boon does not fire (only the passive +6 DR applies); in combat the
    // Bulwark tag-in stacks its +14 on top.
    expect(drFromSwap(true)).toBeGreaterThan(drFromSwap(false));
  });
});

describe('swap overhaul §3.3: aim-cursor tag-ins', () => {
  it('an aim boon (Invoker sunstrike) resolves at the aimed point, not the arrival', () => {
    const game = Game.headless(partySave([{ id: 'juggernaut' }, { id: 'invoker' }]));
    const active = game.activeUnit()!;
    active.lastEnemyDamageAt = game.sim.time;
    const near = enemyAt(game, active.pos.x + 120, active.pos.y);     // by the arrival point
    const far = enemyAt(game, active.pos.x + 800, active.pos.y);       // by the aimed point

    expect(game.swapNeedsAim(1)).toBe(true);
    expect(game.trySwap(1, { aimPoint: { x: far.pos.x, y: far.pos.y } })).toBe(true);

    expect(far.hp).toBeLessThan(far.stats.maxHp);  // the sunstrike landed where it was aimed
    expect(near.hp).toBe(near.stats.maxHp);        // and not back at the arrival point
  });

  it('swapNeedsAim is false for a non-aim boon and when the gauge is down', () => {
    const game = Game.headless(partySave([{ id: 'juggernaut' }, { id: 'earthshaker' }, { id: 'invoker' }]));
    game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
    expect(game.swapNeedsAim(1)).toBe(false);        // Earthshaker has no aim flag
    expect(game.swapNeedsAim(2)).toBe(true);         // Invoker does
    game.party[2].tagGaugeReadyAt = game.sim.time + 5;
    expect(game.swapNeedsAim(2)).toBe(false);        // gauge down → aiming is pointless, just swap
  });
});

describe('swap overhaul §9: next-link hint and the dull beat', () => {
  it('the readout routes an explicit setup before another payoff', () => {
    const game = Game.headless(partySave([{ id: 'lina' }, { id: 'kunkka' }, { id: 'sniper' }]));
    game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
    const link = game.combatReadout().nextLink;
    expect(link?.heroId).toBe('kunkka'); // Lina's payoff wants a Soak/setup link before another selfish payoff
    expect(link?.role).toBe('setup');
  });

  it('the readout routes a payoff when a setup aura is already live', () => {
    const game = Game.headless(partySave([{ id: 'kunkka' }, { id: 'lina' }, { id: 'omniknight' }]));
    const active = game.activeUnit()!;
    active.lastEnemyDamageAt = game.sim.time;
    const enemy = enemyAt(game, active.pos.x + 120, active.pos.y);
    game.sim.teamMind(active.team).focusUid = enemy.uid;
    enemy.elementAuras.hydro = { gauge: 1, until: game.sim.time + 3, sourceUid: active.uid };
    const link = game.combatReadout().nextLink;
    expect(link?.heroId).toBe('lina'); // hydro setup asks for the Pyro payoff/reaction
    expect(link?.role).toBe('payoff');
  });

  it('a gauge-down swap in combat emits the dull swap-flat beat; a ready swap does not', () => {
    const game = Game.headless(partySave([{ id: 'juggernaut' }, { id: 'earthshaker' }]));
    game.sim.events.captureAll = true;
    const active = game.activeUnit()!;
    active.lastEnemyDamageAt = game.sim.time;
    enemyAt(game, active.pos.x + 120, active.pos.y);
    game.party[1].tagGaugeReadyAt = game.sim.time + 30; // gauge down

    expect(game.trySwap(1)).toBe(true);
    expect(game.sim.events.history.some((e) => e.t === 'swap-flat')).toBe(true);
    expect(game.sim.events.history.some((e) => e.t === 'tag-boon')).toBe(false);
  });
});

describe('swap overhaul acceptance corners', () => {
  it('with Resonance OFF, a mid-combat swap removes the benched hero (no off-field)', () => {
    const game = Game.headless(partySave([{ id: 'natures-prophet' }, { id: 'juggernaut' }]));
    game.setResonanceEnabled(false);
    const active = game.activeUnit()!;
    active.lastEnemyDamageAt = game.sim.time;
    enemyAt(game, active.pos.x + 120, active.pos.y);

    expect(game.trySwap(1)).toBe(true);
    expect(game.party[0].unit).toBeNull();               // removed, not benched
  });

  it('a benched hero re-arms its Tag Gauge in real time while you play another', () => {
    const game = Game.headless(partySave([{ id: 'juggernaut' }, { id: 'earthshaker' }]));
    const active = game.activeUnit()!;
    active.lastEnemyDamageAt = game.sim.time;
    enemyAt(game, active.pos.x + 120, active.pos.y);

    expect(game.trySwap(1)).toBe(true);                  // Earthshaker tags in, gauge goes on cooldown
    expect(game.party[1].tagGaugeReadyAt).toBeGreaterThan(game.sim.time);

    advance(game, TUNING.resonanceSwapFloorSec + 0.1);
    expect(game.trySwap(0)).toBe(true);                  // back to Juggernaut; Earthshaker is benched

    advance(game, REG.hero('earthshaker').tagBoon!.gaugeSec + 0.5);
    expect(game.party[1].tagGaugeReadyAt).toBeLessThanOrEqual(game.sim.time); // re-armed on the bench
  });

  it("Witch Doctor's Death Ward keeps channelling off-field after a swap-out (§8.2)", () => {
    const game = Game.headless(partySave([{ id: 'witch-doctor' }, { id: 'juggernaut' }]));
    const wd = game.activeUnit()!;
    wd.lastEnemyDamageAt = game.sim.time;
    wd.mana = wd.stats.maxMana;
    const slot = wd.abilities.findIndex((a) => a.def.id === 'wd-death-ward');
    wd.abilities[slot].level = 1;
    const enemy = enemyAt(game, wd.pos.x + 200, wd.pos.y);

    game.sim.order(wd.uid, { kind: 'cast', slot, uid: enemy.uid });
    advance(game, 0.4); // through the cast point — the ward is channelling
    expect(wd.channel).not.toBeNull();
    const hpAtSwap = enemy.hp;

    expect(game.trySwap(1)).toBe(true);
    game.update(0);
    const benched = game.party[0].unit!;
    expect(benched.offFieldUntil).toBeGreaterThan(game.sim.time);
    expect(benched.channel).not.toBeNull();              // the ward survived the swap-out

    advance(game, 1.0);
    expect(enemy.hp).toBeLessThan(hpAtSwap);             // it keeps damaging while WD is benched
  });
});

describe('swap overhaul §2.3: the opt-in charge meter', () => {
  it('is off by default and reports no charge state', () => {
    const game = Game.headless(newGameSave('juggernaut'));
    expect(game.settings.swapCharges ?? false).toBe(false);
    expect(game.swapChargeState()).toBeNull();
  });

  it('lets you swap twice with no floor, then blocks until a charge refills', () => {
    const game = Game.headless(partySave([{ id: 'juggernaut' }, { id: 'earthshaker' }, { id: 'sven' }]));
    game.setSwapChargesEnabled(true);
    expect(game.swapChargeState()?.current).toBeCloseTo(2);

    expect(game.trySwap(1)).toBe(true);                  // 2 -> 1
    expect(game.trySwap(2)).toBe(true);                  // 1 -> 0, no floor wait between them
    expect(Math.floor(game.swapChargeState()!.current)).toBe(0);
    expect(game.trySwap(0)).toBe(false);                 // out of charges

    advance(game, TUNING.resonanceSwapChargeRefillSec + 0.2); // a charge refills (Resonance default)
    expect(game.swapChargeState()!.current).toBeGreaterThanOrEqual(1);
    expect(game.trySwap(0)).toBe(true);                  // re-armed
  });

  it('with the meter off, the swap floor still blocks a second immediate swap', () => {
    const game = Game.headless(partySave([{ id: 'juggernaut' }, { id: 'earthshaker' }, { id: 'sven' }]));
    expect(game.settings.swapCharges ?? false).toBe(false);
    expect(game.trySwap(1)).toBe(true);
    expect(game.trySwap(2)).toBe(false);                 // floored — this is the default behaviour
  });

  it('persists the setting through a save round-trip', () => {
    const game = Game.headless(newGameSave('juggernaut'));
    game.setSwapChargesEnabled(true);
    const save = game.buildSave();
    expect(save.settings.swapCharges).toBe(true);
    expect(Game.validateSave(save)).toBe(true);
    expect(Game.headless(save).settings.swapCharges).toBe(true);
  });
});
