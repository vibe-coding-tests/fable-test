import { beforeAll, describe, expect, it } from 'vitest';
import { ALL_HEROES, registerAllContent } from '../data';
import { abilityArchetypes, type AbilityArchetype } from '../core/ability-archetype';
import type { AbilityDef } from '../core/types';

// ============================================================
// AUTOBATTLER_OVERHAUL §2 (Phase 1): the derived AbilityArchetype.
// Pure, deterministic, cached by id — the parallel of ItemArchetype.
// ============================================================

beforeAll(() => registerAllContent());

function allAbilities(): AbilityDef[] {
  const seen = new Map<string, AbilityDef>();
  for (const hero of ALL_HEROES) {
    for (const a of hero.abilities) if (!seen.has(a.id)) seen.set(a.id, a);
  }
  return [...seen.values()];
}

function byId(id: string): AbilityDef {
  const a = allAbilities().find((x) => x.id === id);
  if (!a) throw new Error(`ability ${id} not found`);
  return a;
}

describe('ability archetypes', () => {
  it('is pure and cached: identical defs yield equal, fresh sets', () => {
    const def = byId('enigma-black-hole');
    const a = abilityArchetypes(def);
    const b = abilityArchetypes(def);
    expect(a).not.toBe(b); // a fresh Set each call (no shared mutable state)
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('populates every archetype in the closed vocabulary across the catalog', () => {
    const present = new Set<AbilityArchetype>();
    for (const a of allAbilities()) for (const arch of abilityArchetypes(a)) present.add(arch);
    const expected: AbilityArchetype[] = [
      'teamfight-ult', 'cluster-nuke', 'channel', 'skillshot-line',
      'single-lockdown', 'zone-field', 'team-buff', 'self-steroid'
    ];
    for (const arch of expected) expect(present.has(arch), `no ability classified as ${arch}`).toBe(true);
  });

  it('guarantees structural coverage (channel / aura / ally / skillshot always classify)', () => {
    for (const a of allAbilities()) {
      const set = abilityArchetypes(a);
      if (a.channel) expect(set.has('channel'), `${a.id}`).toBe(true);
      if (a.aura) expect(set.has('zone-field'), `${a.id}`).toBe(true);
      if (a.affects === 'ally') expect(set.has('team-buff'), `${a.id}`).toBe(true);
      if (a.targeting === 'skillshot') expect(set.has('skillshot-line'), `${a.id}`).toBe(true);
    }
  });

  it('classifies signature spells the way the brain plans with them', () => {
    // Tidehunter-style arena ult: an ult + AoE + hard CC is teamfight-ult AND cluster-nuke,
    // and Black Hole roots its caster so it is also a channel (the §2 "reads the set" example).
    expect([...abilityArchetypes(byId('enigma-black-hole'))]).toEqual(
      expect.arrayContaining(['teamfight-ult', 'cluster-nuke', 'channel'])
    );

    // Echo Slam: an arena ult whose value scales with the bodies caught.
    expect([...abilityArchetypes(byId('es-echo-slam'))]).toEqual(
      expect.arrayContaining(['teamfight-ult', 'cluster-nuke'])
    );

    // Light Strike Array: AoE damage that wants a cluster, but is no arena ult.
    const lsa = abilityArchetypes(byId('lina-lsa'));
    expect(lsa.has('cluster-nuke')).toBe(true);
    expect(lsa.has('teamfight-ult')).toBe(false);

    // Dragon Slave: a directional skillshot to angle down a row.
    expect(abilityArchetypes(byId('lina-dragon-slave')).has('skillshot-line')).toBe(true);

    // Hex: hard CC spent on one target — single-lockdown, not an AoE.
    const hex = abilityArchetypes(byId('shaman-hex'));
    expect(hex.has('single-lockdown')).toBe(true);
    expect(hex.has('cluster-nuke')).toBe(false);

    // Freezing Field: a rooted channel.
    expect(abilityArchetypes(byId('cm-freezing-field')).has('channel')).toBe(true);

    // Guardian Angel / Warcry: team buffs timed to the engage.
    expect(abilityArchetypes(byId('omni-guardian-angel')).has('team-buff')).toBe(true);
    expect(abilityArchetypes(byId('sven-warcry')).has('team-buff')).toBe(true);

    // Arcane Aura: a standing field that shapes spacing.
    expect(abilityArchetypes(byId('cm-arcane-aura')).has('zone-field')).toBe(true);

    // A pure single-target nuke (Laguna Blade) carries no *positional* archetype.
    expect(abilityArchetypes(byId('lina-laguna')).size).toBe(0);
  });
});
