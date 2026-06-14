import type { ActiveElement, EffectNode, HeroDef, StatusId, StatusParams, TagArchetype, TagBoonDef, VfxSpec } from '../core/types';

// SWAP_COMBAT_OVERHAUL §6 — every hero carries a *signature* combo tag, authored
// here as a list of plain EffectNodes the existing resolver interprets (§3). The
// inverse-power law (§4) is enforced by the budget data-lint at the bottom: a
// hypercarry's tag is a small selfish crumb, a hard support's is the team's
// biggest swing. Soak tags lay a lingering element field (a `zone` whose damage
// tick re-applies the hero's element) so a benched soaker leaves the element on
// the ground for the next hero to detonate (§5).

const R = 300; // standard tag radius
const NEAR = 230; // "nearest foe" reach for single-target crumbs

const LEGACY_SWAP_EFFECTS: EffectNode[] = [
  {
    kind: 'heal',
    amount: 'swapInHealPct',
    target: 'self',
    pctMaxHp: true
  },
  {
    kind: 'status',
    status: 'buff',
    duration: 'tagDuration',
    target: 'self',
    params: {
      tag: 'swap-in-burst',
      mods: { damagePct: 'swapInDamagePct', spellAmpPct: 'swapInDamagePct' }
    }
  }
];

function isActiveElement(element: HeroDef['element']): element is ActiveElement {
  return element !== undefined && element !== 'neutral';
}

function tagVfx(element: ActiveElement | undefined, fallback: string): VfxSpec {
  const colors: Partial<Record<ActiveElement, string>> = {
    pyro: '#ff7043',
    hydro: '#4fc3f7',
    electro: '#ce93d8',
    cryo: '#b3e5fc',
    geo: '#d7b56d',
    dendro: '#7ec850',
    anemo: '#9be7c5'
  };
  return { archetype: 'ground-aoe', color: element ? colors[element] ?? fallback : fallback };
}

// A tiny instant element application appended to every elemental hero's tag so the
// arrival itself soaks the cluster; Soak heroes pair it with a lingering field.
function elementalPulse(element: ActiveElement | undefined): EffectNode[] {
  if (!element) return [];
  return [{
    kind: 'damage',
    dtype: 'magical',
    amount: 1,
    target: 'enemies-in-radius',
    radius: R
  }];
}

// ---------- effect builders (the §6 vocabulary, in shorthand) ----------

function selfMod(mods: Record<string, number>, duration = 3): EffectNode {
  return { kind: 'statmod', mods, duration, target: 'self' };
}
function teamMod(mods: Record<string, number>, duration = 3): EffectNode {
  return { kind: 'statmod', mods, duration, target: 'allies-in-radius', radius: R };
}
function enemyMod(mods: Record<string, number>, duration = 3, radius = R): EffectNode {
  return { kind: 'statmod', mods, duration, target: 'enemies-in-radius', radius };
}
function selfHeal(pct: number): EffectNode {
  return { kind: 'heal', amount: pct, pctMaxHp: true, target: 'self' };
}
function teamHeal(pct: number): EffectNode {
  return { kind: 'heal', amount: pct, pctMaxHp: true, target: 'allies-in-radius', radius: R };
}
function lowHeal(pct: number): EffectNode {
  return { kind: 'heal', amount: pct, pctMaxHp: true, target: 'lowest-hp-ally-in-radius', radius: R };
}
function ccAoe(status: StatusId, duration: number, params?: StatusParams, radius = R): EffectNode {
  return { kind: 'status', status, duration, target: 'enemies-in-radius', radius, params };
}
function ccOne(status: StatusId, duration: number, params?: StatusParams, radius = NEAR): EffectNode {
  return { kind: 'status', status, duration, target: 'random-enemy-in-radius', radius, params };
}
function slowAoe(duration: number, moveSlowPct: number, attackSlowPct?: number, radius = R): EffectNode {
  return ccAoe('slow', duration, attackSlowPct ? { moveSlowPct, attackSlowPct } : { moveSlowPct }, radius);
}
function pullAoe(speed = 900, radius = R): EffectNode {
  return { kind: 'displace', mode: 'pull', target: 'enemies-in-radius', radius, speed };
}
function pullOne(speed = 950, radius = NEAR): EffectNode {
  return { kind: 'displace', mode: 'pull', target: 'random-enemy-in-radius', radius, speed };
}
function knockAoe(distance = 260, radius = R): EffectNode {
  return { kind: 'displace', mode: 'knockback', target: 'enemies-in-radius', radius, distance, toward: 'away-from-caster' };
}
function strike(amount: number, radius = R): EffectNode {
  return { kind: 'damage', dtype: 'magical', amount, target: 'enemies-in-radius', radius };
}
function manaBurnOne(amount = 120, radius = NEAR): EffectNode {
  return { kind: 'mana', op: 'burn', amount, target: 'random-enemy-in-radius', radius };
}
function purgeAllies(): EffectNode {
  return { kind: 'purge', target: 'allies-in-radius' };
}

// A lingering enemy field: each tick deals a little damage (which carries the
// boon's element, so it re-soaks the ground) and the aura slows whoever stands in
// it. This is the Soak/Drop body — it keeps ticking while the owner is benched.
function field(opts: { radius?: number; duration?: number; dps?: number; slowPct?: number } = {}): EffectNode {
  const { radius = 240, duration = 4, dps = 8, slowPct = 18 } = opts;
  return {
    kind: 'zone',
    at: 'self',
    zone: {
      shape: 'circle',
      radius,
      duration,
      tick: { interval: 1, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: dps, target: 'target' }] },
      auraMods: slowPct ? { affects: 'enemies', mods: { moveSpeedPct: -slowPct } } : undefined
    }
  };
}

// A lingering ally field: a heal-over-time patch (Treant/Dazzle off-field sustain).
function healField(opts: { radius?: number; duration?: number; hps?: number } = {}): EffectNode {
  const { radius = 260, duration = 4, hps = 28 } = opts;
  return {
    kind: 'zone',
    at: 'self',
    zone: {
      shape: 'circle',
      radius,
      duration,
      tick: { interval: 1, affects: 'allies', effects: [{ kind: 'heal', amount: hps, target: 'target' }] }
    }
  };
}

function boon(
  hero: HeroDef,
  archetype: TagArchetype,
  gaugeSec: number,
  text: string,
  effects: EffectNode[],
  opts: { fire?: TagBoonDef['fire']; outEffects?: EffectNode[] } = {}
): TagBoonDef {
  const element = isActiveElement(hero.element) ? hero.element : undefined;
  const prefix = opts.fire === 'tag-out' ? 'TAG-OUT' : opts.fire === 'both' ? 'TAG' : 'TAG-IN';
  const elementText = element ? ` + ${element}` : '';
  return {
    id: `${hero.id}-tag-boon`,
    fire: opts.fire ?? 'tag-in',
    effects: [...effects, ...elementalPulse(element), ...LEGACY_SWAP_EFFECTS],
    outEffects: opts.outEffects,
    gaugeSec,
    archetype,
    element,
    tooltip: `${prefix}: ${text}${elementText} · ${gaugeSec}s`
  };
}

function roleSet(hero: HeroDef): Set<string> {
  return new Set(hero.roles.map((r) => r.toLowerCase()));
}

// An off-field hero: the tag-in pays a small crumb, the tag-out leaves a field
// that keeps ticking while the hero is benched (§5). Element rides the field tick.
function offField(
  hero: HeroDef,
  gaugeSec: number,
  text: string,
  inEffects: EffectNode[],
  outField: EffectNode[]
): TagBoonDef {
  return boon(hero, 'Drop', gaugeSec, text, inEffects, { fire: 'both', outEffects: outField });
}

// ---------- the §6 signature table ----------
// Keyed by hero id. Magnitudes are bounded by the §4 budget bands (see the
// data-lint at the bottom); the inverse-power law holds (carries small & selfish,
// supports large & team-wide). Elements only bite with Resonance on.

const AUTHORED: Record<string, (h: HeroDef) => TagBoonDef> = {
  // ===== Strength — bruisers, tanks, initiators (mostly Setup/Save) =====
  axe: (h) => boon(h, 'Gather', 9, 'taunt-pulse nearby foes, self DR 3s', [
    ccAoe('taunt', 0.8), slowAoe(2, 35), selfMod({ damageTakenReductionPct: 18 })
  ]),
  pudge: (h) => boon(h, 'Gather', 9, 'hook nearby foes in and slow them 2s', [
    pullAoe(950), slowAoe(2, 30)
  ]),
  tidehunter: (h) => boon(h, 'Soak', 9, 'anchor-slam: slow nearby 40% + a wet field', [
    slowAoe(2, 40), field({ dps: 6, slowPct: 18 })
  ]),
  kunkka: (h) => boon(h, 'Soak', 8, 'torrent field that wets and slows the spot', [
    field({ dps: 8, slowPct: 22 }), selfMod({ damagePct: 8 })
  ]),
  slardar: (h) => boon(h, 'Soak', 9, 'corrode nearby armor + leave a wet field', [
    enemyMod({ armor: -5 }), field({ dps: 6, slowPct: 12 }), selfMod({ moveSpeedPct: 8 })
  ]),
  sven: (h) => boon(h, 'Onslaught', 6, 'self +12% damage and mini-stun nearby foes', [
    selfMod({ damagePct: 12 }), ccAoe('stun', 0.6, undefined, 220)
  ]),
  earthshaker: (h) => boon(h, 'Lockdown', 10, 'fissure-stun nearby foes 1s', [
    ccAoe('stun', 1)
  ]),
  mars: (h) => boon(h, 'Gather', 10, 'shove nearby foes inward, allies +DR', [
    pullAoe(850), teamMod({ damageTakenReductionPct: 10 })
  ]),
  tiny: (h) => boon(h, 'Gather', 9, 'toss the nearest foe to your feet, self +damage', [
    pullOne(1000), selfMod({ damagePct: 8 })
  ]),
  'sand-king': (h) => boon(h, 'Soak', 9, 'caustic dust field that slows and primes', [
    field({ dps: 8, slowPct: 20 }), slowAoe(1.5, 15)
  ]),
  'centaur-warrunner': (h) => boon(h, 'Vanguard', 9, 'allies +DR, stomp-slow nearby 1s', [
    teamMod({ damageTakenReductionPct: 12 }), slowAoe(1, 25)
  ]),
  'dragon-knight': (h) => boon(h, 'Vanguard', 8, 'self +DR and attack speed (dragon form) 3s', [
    selfMod({ damageTakenReductionPct: 14, attackSpeed: 20 })
  ]),
  bristleback: (h) => boon(h, 'Vanguard', 8, 'self +18% DR (quill-plated) 3s', [
    selfMod({ damageTakenReductionPct: 18 })
  ]),
  'spirit-breaker': (h) => boon(h, 'Gather', 9, 'charge-bash the nearest foe, self +move & damage', [
    ccOne('stun', 0.6), selfMod({ moveSpeedPct: 14, damagePct: 6 })
  ]),
  'primal-beast': (h) => boon(h, 'Lockdown', 10, 'trample-root nearby foes 1s, self +DR', [
    ccAoe('root', 1), selfMod({ damageTakenReductionPct: 12 })
  ]),
  huskar: (h) => boon(h, 'Onslaught', 8, 'self +20% damage (berserk) 3s', [
    selfMod({ damagePct: 20 })
  ]),
  alchemist: (h) => boon(h, 'Onslaught', 8, 'self +12% damage and regen 3s', [
    selfMod({ damagePct: 12 }), selfHeal(5)
  ]),
  'wraith-king': (h) => boon(h, 'Onslaught', 8, 'self +damage & lifesteal, reincarnation bash nearest', [
    selfMod({ damagePct: 12, lifestealPct: 15 }), ccOne('stun', 0.5)
  ]),
  lifestealer: (h) => boon(h, 'Bloodrush', 8, 'self heal 8% and attack speed (feast) 3s', [
    selfHeal(8), selfMod({ attackSpeed: 30 })
  ]),
  doom: (h) => boon(h, 'Lockdown', 9, 'doom-silence the nearest foe 1.5s', [
    ccOne('silence', 1.5)
  ]),
  'night-stalker': (h) => boon(h, 'Lockdown', 9, 'blind & slow nearby foes 2s', [
    slowAoe(2, 25), ccAoe('blind', 1)
  ]),
  underlord: (h) => boon(h, 'Mend', 11, 'allies +14% DR and a slow field', [
    teamMod({ damageTakenReductionPct: 14 }), field({ dps: 4, slowPct: 18 })
  ]),
  omniknight: (h) => boon(h, 'Mend', 12, 'heal allies 12% + 20% magic resist 3s', [
    teamHeal(12), teamMod({ magicResistPct: 20 })
  ]),
  abaddon: (h) => boon(h, 'Cleanse', 12, 'cleanse allies + aphotic shield (DR) 3s', [
    purgeAllies(), teamMod({ damageTakenReductionPct: 10 })
  ]),
  dawnbreaker: (h) => boon(h, 'Mend', 11, 'celestial heal allies 10% + searing nova nearby', [
    teamHeal(10), strike(30)
  ]),
  'elder-titan': (h) => boon(h, 'Gather', 10, 'echo-stun nearby + sunder armor', [
    ccAoe('stun', 0.8), enemyMod({ armor: -4 })
  ]),
  'treant-protector': (h) => boon(h, 'Mend', 12, 'heal allies 10% + living-armor HoT field', [
    teamHeal(10), healField({ hps: 24 })
  ]),
  'ogre-magi': (h) => boon(h, 'Mend', 11, 'allies +shield (DR) & bloodlust (attack speed) 3s', [
    teamMod({ damageTakenReductionPct: 8, attackSpeed: 20 })
  ]),
  'legion-commander': (h) => boon(h, 'Onslaught', 8, 'duel-arrival: self +14% damage & 0.6s stun nearest', [
    selfMod({ damagePct: 14 }), ccOne('stun', 0.6)
  ]),
  brewmaster: (h) => boon(h, 'Vanguard', 9, 'allies +14% DR, self shrugs magic 3s', [
    teamMod({ damageTakenReductionPct: 14 }), selfMod({ magicResistPct: 20 })
  ]),
  'chaos-knight': (h) => boon(h, 'Onslaught', 9, 'self +12% damage and 0.8s stun nearest', [
    selfMod({ damagePct: 12 }), ccOne('stun', 0.8)
  ]),
  necrophos: (h) => boon(h, 'Mend', 10, 'heal nearby allies 6% + reaper pulse', [
    teamHeal(6), strike(20)
  ]),

  // ===== Agility — carries, nukers, escapes (mostly Payoff/Self) =====
  juggernaut: (h) => boon(h, 'Bloodrush', 6, 'self +damage & move, heal 6%', [
    selfMod({ damagePct: 10, moveSpeedPct: 8 }), selfHeal(6)
  ]),
  luna: (h) => boon(h, 'Strike', 7, 'glaive burst nearby foes, self +12% damage', [
    strike(35), selfMod({ damagePct: 12 })
  ]),
  sniper: (h) => boon(h, 'Onslaught', 6, 'self +10% damage and range 3s', [
    selfMod({ damagePct: 10, attackRange: 90 })
  ]),
  'anti-mage': (h) => boon(h, 'Bloodrush', 6, 'mana-burn nearest, self +damage & move 3s', [
    manaBurnOne(140), selfMod({ damagePct: 8, moveSpeedPct: 14 })
  ]),
  'phantom-assassin': (h) => boon(h, 'Bloodrush', 6, 'self +14% damage & move (crit primer) 3s', [
    selfMod({ damagePct: 14, moveSpeedPct: 8 })
  ]),
  spectre: (h) => boon(h, 'Vanguard', 7, 'self +DR and desolate pulse nearby', [
    selfMod({ damageTakenReductionPct: 14 }), strike(25)
  ]),
  'faceless-void': (h) => boon(h, 'Lockdown', 8, 'chrono-bubble: slow nearby 1.5s, self +damage', [
    slowAoe(1.5, 30), selfMod({ damagePct: 8 })
  ]),
  medusa: (h) => boon(h, 'Vanguard', 8, 'self mana-shield (DR) and split-shot 3s', [
    selfMod({ damageTakenReductionPct: 14, damagePct: 8 })
  ]),
  morphling: (h) => boon(h, 'Soak', 6, 'hydro wave field at your feet, self +damage', [
    field({ dps: 6, slowPct: 12 }), selfMod({ damagePct: 8 })
  ]),
  slark: (h) => boon(h, 'Bloodrush', 6, 'self heal 5% & move, -armor mark on a foe', [
    selfHeal(5), selfMod({ moveSpeedPct: 12 }), ccOne('slow', 1.5, { moveSlowPct: 10 })
  ]),
  'troll-warlord': (h) => boon(h, 'Onslaught', 6, 'self +attack speed dump, slow a foe', [
    selfMod({ attackSpeed: 40 }), ccOne('slow', 1, { moveSlowPct: 20 })
  ]),
  terrorblade: (h) => offField(h, 6, 'self +8% damage; tag-out leaves a reflection field', [
    selfMod({ damagePct: 8 })
  ], [field({ dps: 12, slowPct: 0, duration: 5 })]),
  ursa: (h) => boon(h, 'Onslaught', 6, 'self +14% damage (fury-stacks) & mini-bash nearest', [
    selfMod({ damagePct: 14 }), ccOne('stun', 0.5)
  ]),
  'drow-ranger': (h) => boon(h, 'Lockdown', 8, 'slow nearby foes 28% and -4 armor 2s', [
    slowAoe(2, 28), enemyMod({ armor: -4 }, 2)
  ]),
  clinkz: (h) => boon(h, 'Strike', 7, 'searing arrows nearby + ignite, self +damage', [
    selfMod({ damagePct: 12, attackSpeed: 30 })
  ]),
  gyrocopter: (h) => boon(h, 'Strike', 7, 'rocket barrage nearby, self +10% damage', [
    strike(45), selfMod({ damagePct: 10 })
  ]),
  razor: (h) => boon(h, 'Soak', 8, 'static field (DoT) at your feet, self +damage', [
    field({ dps: 9, slowPct: 14 }), selfMod({ damagePct: 8 })
  ]),
  'templar-assassin': (h) => boon(h, 'Onslaught', 6, 'self +12% damage & evasion (meld) 3s', [
    selfMod({ damagePct: 12, evasionPct: 12 })
  ]),
  weaver: (h) => boon(h, 'Bloodrush', 6, 'self +move & heal 6%, brief untargetable feel', [
    selfMod({ moveSpeedPct: 14 }), selfHeal(6)
  ]),
  riki: (h) => boon(h, 'Drop', 6, 'drop a smoke field that slows foes, self +move', [
    field({ dps: 4, slowPct: 22 }), selfMod({ moveSpeedPct: 10 })
  ]),
  'bounty-hunter': (h) => boon(h, 'Lockdown', 7, 'track-mark nearest foe (-6 armor), self +move', [
    enemyMod({ armor: -6 }, 4, NEAR), selfMod({ moveSpeedPct: 10 })
  ]),
  'naga-siren': (h) => offField(h, 9, 'self +6% damage; tag-out leaves a wet mirror field', [
    selfMod({ damagePct: 6 })
  ], [field({ dps: 6, slowPct: 18 })]),
  bloodseeker: (h) => boon(h, 'Bloodrush', 6, 'self heal & move (blood-fueled), slow a foe', [
    selfHeal(6), selfMod({ moveSpeedPct: 12 }), ccOne('slow', 1, { moveSlowPct: 20 })
  ]),
  'shadow-fiend': (h) => boon(h, 'Strike', 7, 'triple-raze nearby + self spell amp', [
    strike(50), selfMod({ spellAmpPct: 14 })
  ]),
  'ember-spirit': (h) => boon(h, 'Strike', 7, 'flame nova nearby + self spell amp', [
    strike(40), selfMod({ spellAmpPct: 14 })
  ]),
  'arc-warden': (h) => offField(h, 7, 'self +8% damage; tag-out leaves a sparking field', [
    selfMod({ damagePct: 8 })
  ], [field({ dps: 12, slowPct: 0 })]),
  meepo: (h) => boon(h, 'Gather', 6, 'net-pull the nearest foe in, self +6% damage', [
    pullOne(950), selfMod({ damagePct: 6 })
  ]),
  'monkey-king': (h) => boon(h, 'Onslaught', 7, 'leap-in: self +12% damage & 0.6s stun nearest', [
    selfMod({ damagePct: 12 }), ccOne('stun', 0.6)
  ]),
  'phantom-lancer': (h) => offField(h, 6, 'self +move & damage; tag-out leaves illusion pressure', [
    selfMod({ moveSpeedPct: 8, damagePct: 6 })
  ], [field({ dps: 10, slowPct: 0 })]),
  broodmother: (h) => offField(h, 6, 'self +6% damage; tag-out leaves a spiderling web', [
    selfMod({ damagePct: 6 })
  ], [field({ dps: 10, slowPct: 22 })]),
  'nyx-assassin': (h) => boon(h, 'Lockdown', 8, 'impale-stun nearest 0.8s + mana-burn', [
    ccOne('stun', 0.8), manaBurnOne(120)
  ]),
  viper: (h) => boon(h, 'Drop', 9, 'corrosive field: slow, weaken & poison nearby', [
    field({ dps: 10, slowPct: 18 }), slowAoe(2.5, 20, 20)
  ]),

  // ===== Intelligence — nukers, supports, pushers (Setup/Payoff/Save) =====
  'crystal-maiden': (h) => boon(h, 'Mend', 12, 'heal allies 12% + frost nearby foes', [
    teamHeal(12), slowAoe(2.5, 35, 25)
  ]),
  lich: (h) => boon(h, 'Cleanse', 12, 'cleanse self and frost-shield allies 3s', [
    purgeAllies(), teamMod({ armor: 4, magicResistPct: 12 })
  ]),
  lina: (h) => boon(h, 'Warcry', 10, 'scorch nearby foes + allies +spell amp', [
    strike(45), teamMod({ spellAmpPct: 14 })
  ]),
  zeus: (h) => boon(h, 'Strike', 7, 'bolt the strongest foe + self spell amp', [
    strike(45), selfMod({ spellAmpPct: 14 })
  ]),
  jakiro: (h) => boon(h, 'Drop', 10, 'macropyre field (DoT) + allies +spell amp', [
    field({ dps: 14, slowPct: 0 }), teamMod({ spellAmpPct: 14 })
  ]),
  'witch-doctor': (h) => boon(h, 'Mend', 11, 'heal nearby allies 8% + maledict-stun nearest', [
    teamHeal(8), ccOne('stun', 0.5)
  ]),
  disruptor: (h) => offField(h, 10, 'allies +spell amp; tag-out leaves a static field', [
    teamMod({ spellAmpPct: 12 })
  ], [field({ dps: 12, slowPct: 14 })]),
  grimstroke: (h) => boon(h, 'Warcry', 10, 'ink-bind the nearest foe + allies +spell amp', [
    ccOne('root', 1.2), teamMod({ spellAmpPct: 14 })
  ]),
  'keeper-of-the-light': (h) => boon(h, 'Mend', 10, 'refuel allies\u2019 mana + a small heal', [
    { kind: 'mana', op: 'restore', amount: 180, target: 'allies-in-radius', radius: R }, teamHeal(6)
  ]),
  leshrac: (h) => boon(h, 'Drop', 10, 'pulse-nova field (DoT) + self spell amp', [
    field({ dps: 12, slowPct: 0 }), selfMod({ spellAmpPct: 14 })
  ]),
  puck: (h) => boon(h, 'Lockdown', 8, 'silence-orb nearby foes 0.8s, self +spell amp', [
    ccAoe('silence', 0.8), selfMod({ spellAmpPct: 10 })
  ]),
  pugna: (h) => boon(h, 'Drop', 9, 'tear the nearest foe\u2019s magic resist, self +spell amp', [
    enemyMod({ magicResistPct: -25 }, 4, NEAR), selfMod({ spellAmpPct: 12 })
  ]),
  'queen-of-pain': (h) => boon(h, 'Strike', 7, 'sonic scream nearby + self spell amp', [
    strike(45), selfMod({ spellAmpPct: 14 })
  ]),
  'shadow-demon': (h) => boon(h, 'Lockdown', 10, 'disrupt & break the strongest foe', [
    ccOne('stun', 1.5), enemyMod({ magicResistPct: -20 }, 3, NEAR)
  ]),
  'shadow-shaman': (h) => boon(h, 'Lockdown', 11, 'hex the nearest foe 1.7s', [
    ccOne('hex', 1.7)
  ]),
  'death-prophet': (h) => offField(h, 10, 'self +spell amp; tag-out unleashes exorcism spirits', [
    selfMod({ spellAmpPct: 10 })
  ], [field({ dps: 12, slowPct: 0 })]),
  lion: (h) => boon(h, 'Lockdown', 10, 'hex the nearest foe 1.5s + mana-burn', [
    ccOne('hex', 1.5), manaBurnOne(150)
  ]),
  'winter-wyvern': (h) => boon(h, 'Mend', 12, 'cold embrace: big heal lowest ally + frost nearby', [
    lowHeal(20), slowAoe(2, 25)
  ]),
  invoker: (h) => boon(h, 'Strike', 9, 'sunstrike nearby + self spell amp', [
    strike(50), selfMod({ spellAmpPct: 14 })
  ]),
  silencer: (h) => boon(h, 'Cleanse', 12, 'cleanse allies + status resist; silence crumb', [
    purgeAllies(), teamMod({ statusResistPct: 20 }), ccOne('silence', 1)
  ]),
  'outworld-destroyer': (h) => boon(h, 'Lockdown', 8, 'astral-banish the nearest foe 1s, self +spell amp', [
    ccOne('stun', 1), selfMod({ spellAmpPct: 8 })
  ]),
  'skywrath-mage': (h) => boon(h, 'Warcry', 10, 'ancient-seal nearest + allies +spell amp', [
    enemyMod({ magicResistPct: -25 }, 4, NEAR), teamMod({ spellAmpPct: 14 })
  ]),
  tinker: (h) => boon(h, 'Strike', 8, 'laser-blind nearest + self spell amp', [
    strike(35), ccOne('blind', 1.5), selfMod({ spellAmpPct: 12 })
  ]),
  enchantress: (h) => boon(h, 'Soak', 10, 'dendro growth field + allies +attack speed', [
    field({ dps: 6, slowPct: 0 }), teamMod({ attackSpeed: 30 })
  ]),
  chen: (h) => boon(h, 'Mend', 12, 'heal nearby allies 10% (+ holy persuasion)', [
    teamHeal(10), healField({ hps: 18 })
  ]),
  'natures-prophet': (h) => offField(h, 10, 'sprout-root field; tag-out leaves treant pressure', [
    field({ dps: 8, slowPct: 18 })
  ], [field({ dps: 10, slowPct: 18, duration: 5 })]),
  warlock: (h) => boon(h, 'Imprint', 11, 'heal allies; tag-out leaves a Fatal Bond field 5s', [
    teamHeal(9)
  ], {
    fire: 'both',
    outEffects: [{
      kind: 'zone',
      at: 'self',
      zone: {
        shape: 'circle',
        radius: 280,
        duration: 5,
        tick: { interval: 1, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 18, target: 'target' }] },
        auraMods: { affects: 'enemies', mods: { damageTakenReductionPct: -8 } }
      }
    }]
  }),
  visage: (h) => offField(h, 11, 'allies +spell amp & armor; tag-out sends familiars', [
    teamMod({ spellAmpPct: 8, armor: 4 })
  ], [field({ dps: 12, slowPct: 0 })]),
  dazzle: (h) => offField(h, 10, 'heal nearby allies 8%; tag-out leaves a Shadow Wave field', [
    teamHeal(8)
  ], [healField({ hps: 24 })]),
  'dark-willow': (h) => boon(h, 'Lockdown', 10, 'terror-root nearby foes + allies +spell amp', [
    ccAoe('fear', 1), teamMod({ spellAmpPct: 12 })
  ]),
  bane: (h) => boon(h, 'Lockdown', 12, 'nightmare-sleep the strongest foe 3s', [
    ccOne('sleep', 3)
  ]),
  'ancient-apparition': (h) => boon(h, 'Soak', 10, 'frostbite nearby foes + allies +spell amp', [
    slowAoe(2, 25, 25), teamMod({ spellAmpPct: 10 })
  ]),
  snapfire: (h) => boon(h, 'Warcry', 10, 'cookie-blast nearby + allies +damage', [
    strike(40), teamMod({ damagePct: 12 })
  ]),
  rubick: (h) => boon(h, 'Cleanse', 11, 'cleanse allies + spell-shield (magic resist)', [
    purgeAllies(), teamMod({ magicResistPct: 15 })
  ]),
  'storm-spirit': (h) => boon(h, 'Strike', 7, 'overload zap nearby + self spell amp', [
    strike(40), selfMod({ spellAmpPct: 12 })
  ]),

  // ===== Universal — flex, initiators, summoners (Setup/Save/Off-field) =====
  mirana: (h) => boon(h, 'Gather', 9, 'gust-gather nearby foes (swirl primer)', [
    pullAoe(900)
  ]),
  'vengeful-spirit': (h) => boon(h, 'Warcry', 10, 'wave of terror (-armor) + allies +damage', [
    enemyMod({ armor: -5 }, 4), teamMod({ damagePct: 12 })
  ]),
  windranger: (h) => boon(h, 'Lockdown', 8, 'shackle-root the nearest foe 1.4s, self +attack speed', [
    ccOne('root', 1.4), selfMod({ attackSpeed: 30 })
  ]),
  marci: (h) => boon(h, 'Warcry', 10, 'rally: allies +damage & move speed 3s', [
    teamMod({ damagePct: 12, moveSpeedPct: 8 })
  ]),
  magnus: (h) => boon(h, 'Gather', 10, 'reverse-polarity: pull & slow nearby foes', [
    pullAoe(950), slowAoe(2, 20)
  ]),
  tusk: (h) => boon(h, 'Gather', 10, 'shard-slow nearby foes + allies shield', [
    slowAoe(2, 30), teamMod({ damageTakenReductionPct: 6 })
  ]),
  phoenix: (h) => boon(h, 'Mend', 11, 'sun-ray heal allies 10% + ignite nearby', [
    teamHeal(10), strike(20)
  ]),
  io: (h) => boon(h, 'Mend', 11, 'tether & heal the lowest ally, share move speed', [
    lowHeal(16), teamMod({ moveSpeedPct: 10 })
  ]),
  'dark-seer': (h) => boon(h, 'Gather', 10, 'vacuum nearby foes, allies +ion-shield (DR)', [
    pullAoe(900), teamMod({ damageTakenReductionPct: 10 })
  ]),
  enigma: (h) => offField(h, 10, 'self +spell amp; tag-out summons an eidolon swarm', [
    selfMod({ spellAmpPct: 8 })
  ], [field({ dps: 12, slowPct: 0 })]),
  beastmaster: (h) => offField(h, 10, 'self +10% damage; tag-out leaves hawk & boar', [
    selfMod({ damagePct: 10 })
  ], [field({ dps: 8, slowPct: 18 })]),
  undying: (h) => offField(h, 11, 'heal allies 6%; tag-out raises a Tombstone field', [
    teamHeal(6)
  ], [field({ dps: 10, slowPct: 18 })]),
  clockwerk: (h) => boon(h, 'Gather', 10, 'hook the nearest foe in + 0.6s stun', [
    pullOne(1100), ccOne('stun', 0.6)
  ]),
  batrider: (h) => boon(h, 'Drop', 10, 'sticky-napalm: slow nearby + a burning field', [
    slowAoe(2, 30), field({ dps: 10, slowPct: 0 })
  ]),
  'earth-spirit': (h) => boon(h, 'Gather', 10, 'roll-pull nearby foes, self +DR', [
    pullAoe(900), selfMod({ damageTakenReductionPct: 10 })
  ]),
  'lone-druid': (h) => offField(h, 6, 'self +8% damage; tag-out leaves the Spirit Bear', [
    selfMod({ damagePct: 8 })
  ], [field({ dps: 12, slowPct: 0 })]),
  lycan: (h) => offField(h, 6, 'self +move & damage; tag-out leaves the wolves', [
    selfMod({ moveSpeedPct: 12, damagePct: 6 })
  ], [field({ dps: 10, slowPct: 14 })]),
  pangolier: (h) => boon(h, 'Gather', 9, 'roll-knockback nearby foes, self +DR', [
    knockAoe(260), selfMod({ damageTakenReductionPct: 12 })
  ]),
  timbersaw: (h) => boon(h, 'Vanguard', 7, 'self +DR (armor-fueled) & chakram nearby', [
    selfMod({ damageTakenReductionPct: 14 }), strike(35)
  ]),
  'void-spirit': (h) => boon(h, 'Strike', 7, 'aether nova nearby + self spell amp & phase', [
    strike(40), selfMod({ spellAmpPct: 12 })
  ]),
  techies: (h) => offField(h, 9, 'self +spell amp; tag-out arms a mine field', [
    selfMod({ spellAmpPct: 8 })
  ], [field({ dps: 16, slowPct: 0 })]),
  venomancer: (h) => offField(h, 10, 'plague-ward field (poison) + allies +spell amp', [
    field({ dps: 10, slowPct: 18 }), teamMod({ spellAmpPct: 8 })
  ], [field({ dps: 10, slowPct: 18 })]),
  hoodwink: (h) => boon(h, 'Lockdown', 8, 'bushwhack-root the nearest foe 1.2s, self +move', [
    ccOne('root', 1.2), selfMod({ moveSpeedPct: 8 })
  ])
};

// Fallback: a role-templated boon so any hero not yet hand-authored still ships a
// valid tag (kept as a safety net; the §6 table above covers the live roster).
function generatedBoon(hero: HeroDef): TagBoonDef {
  const roles = roleSet(hero);
  const support = roles.has('support');
  const carry = roles.has('carry');
  const nuker = roles.has('nuker');
  const durable = roles.has('durable');
  const disabler = roles.has('disabler');
  const initiator = roles.has('initiator');
  const pusher = roles.has('pusher');
  const escape = roles.has('escape');

  if (support && (roles.has('healer') || durable || !nuker)) {
    return boon(hero, 'Mend', 12, 'heal nearby allies 10% and grant magic resist 3s', [
      teamHeal(10), teamMod({ magicResistPct: 12 })
    ]);
  }
  if (support) {
    return boon(hero, 'Warcry', 10, 'nearby allies +16% spell damage 3s', [
      teamMod({ spellAmpPct: 16 })
    ]);
  }
  if (initiator && disabler) {
    return boon(hero, 'Gather', 10, 'pull nearby foes and slow them 2s', [pullAoe(900), slowAoe(2, 30)]);
  }
  if (disabler) {
    return boon(hero, 'Lockdown', 9, 'root nearby foes 1s', [ccAoe('root', 1)]);
  }
  if (pusher && !carry) {
    return offField(hero, 10, 'drop a lingering slow field 4s', [field()], [field()]);
  }
  if (nuker) {
    return boon(hero, 'Strike', 7, 'burst nearby foes + self spell amp 3s', [strike(45), selfMod({ spellAmpPct: 14 })]);
  }
  if (durable) {
    return boon(hero, 'Vanguard', 8, 'self DR and slow nearby foes 2s', [
      selfMod({ damageTakenReductionPct: 16 }), slowAoe(2, 25)
    ]);
  }
  if (carry && escape) {
    return boon(hero, 'Bloodrush', 6, 'self heal 5% and move speed 3s', [selfHeal(5), selfMod({ moveSpeedPct: 10, damagePct: 8 })]);
  }
  return boon(hero, 'Onslaught', 6, 'self +10% damage 3s and slow nearest foe', [
    selfMod({ damagePct: 10 }), ccOne('slow', 1, { moveSlowPct: 20 })
  ]);
}

export function tagBoonForHero(hero: HeroDef): TagBoonDef {
  return AUTHORED[hero.id]?.(hero) ?? generatedBoon(hero);
}

export function withDefaultTagBoon(hero: HeroDef): HeroDef {
  return hero.tagBoon ? hero : { ...hero, tagBoon: tagBoonForHero(hero) };
}

export function tagBoonVfx(hero: HeroDef): VfxSpec {
  return tagVfx(isActiveElement(hero.element) ? hero.element : undefined, hero.palette[2] ?? '#ffffff');
}

// ---------- power budget (§4) ----------
// The inverse-power law: the weaker a hero is on the raw-power axis, the stronger
// its tag-in payoff. We bucket each boon by its archetype (descriptive, not
// mechanical) and sum its authored effect magnitudes into a rough power score so a
// data-lint can prove a carry never quietly ships a support-sized boon.

// §4 power tiers, read from roles the way generatedBoon tiers them. The tier sets
// the band a boon's power score must sit inside, so the inverse-power law (weaker
// raw hero → stronger tag-in) is enforced as content grows.
export type TagBudgetTier = 'hypercarry' | 'striker' | 'frontline' | 'support';

export function tagBudgetTier(hero: HeroDef): TagBudgetTier {
  const roles = roleSet(hero);
  if (roles.has('support')) return 'support';
  if (roles.has('durable') || roles.has('initiator')) return 'frontline';
  if (roles.has('nuker') || roles.has('disabler')) return 'striker';
  return 'hypercarry';
}

// A team-wide effect is worth far more than a selfish one — the scope multiplier is
// where supports out-budget carries even at similar raw magnitudes.
function scopeWeight(target: unknown): number {
  const t = String(target);
  if (t.startsWith('allies')) return 2.6;
  if (t === 'self') return 1;
  if (t === 'enemies-in-radius' || t === 'units-in-radius') return 1.4;
  return 1; // single / random target
}

const CC_WEIGHT: Record<string, number> = {
  stun: 30, hex: 28, fear: 26, sleep: 26, cyclone: 26, frozen: 26,
  root: 22, taunt: 20, silence: 18, slow: 8, disarm: 14, break: 16
};

function numeric(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

// Percent-style mods count at face value; raw-unit mods (range, armor, attack
// speed) are normalized so a big absolute number doesn't masquerade as raw power.
const MOD_WEIGHT: Record<string, number> = {
  damageTakenReductionPct: 1.2,
  armor: 2,
  attackRange: 0.05,
  attackSpeed: 0.4,
  moveSpeedPct: 0.7,
  attackSlowPct: 0.6,
  lifestealPct: 0.8,
  hpRegen: 0.5
};

function modScore(mods: Record<string, unknown>): number {
  let m = 0;
  for (const [k, v] of Object.entries(mods)) m += Math.abs(numeric(v)) * (MOD_WEIGHT[k] ?? 1);
  return m;
}

function effectScore(e: EffectNode): number {
  switch (e.kind) {
    case 'statmod':
      return modScore(e.mods) * scopeWeight(e.target);
    case 'heal': {
      const amt = numeric(e.amount);
      const base = e.pctMaxHp ? amt * 2.2 : amt * 0.05;
      return base * scopeWeight(e.target);
    }
    case 'status': {
      const dur = Math.max(0.5, numeric(e.duration));
      const w = CC_WEIGHT[e.status] ?? 10;
      const slow = numeric(e.params?.moveSlowPct) * 0.3 + numeric(e.params?.attackSlowPct) * 0.2;
      return (w * dur + slow) * scopeWeight(e.target);
    }
    case 'displace':
      return 22 * scopeWeight(e.target);
    case 'damage':
      return numeric(e.amount) * 0.25 * scopeWeight(e.target);
    case 'zone':
      return 18;
    case 'summon':
      return 18;
    case 'purge':
      return 14 * scopeWeight(e.target);
    case 'mana':
      return 8 * scopeWeight(e.target);
    default:
      return 6;
  }
}

export function tagBoonPowerScore(boon: TagBoonDef): number {
  let score = 0;
  for (const e of boon.effects) score += effectScore(e);
  for (const e of boon.outEffects ?? []) score += effectScore(e) * 0.6; // tag-out legacy counts, discounted
  return score;
}

// The portion of a boon that keeps paying off after you swap away: team buffs/heals
// and enemy debuffs/damage persist; a selfish self-buff is wasted the instant you
// tag out. This is why a support rotation out-tempos a carry line (§4) — and the
// quantity the rotation-tempo harness sums.
export function tagBoonTeamValue(boon: TagBoonDef): number {
  let value = 0;
  const accrue = (effects: EffectNode[] | undefined, weight: number) => {
    for (const e of effects ?? []) {
      if (e.kind === 'statmod' && e.target === 'self') continue;
      if (e.kind === 'heal' && e.target === 'self') continue;
      value += effectScore(e) * weight;
    }
  };
  accrue(boon.effects, 1);
  accrue(boon.outEffects, 0.6);
  return value;
}
