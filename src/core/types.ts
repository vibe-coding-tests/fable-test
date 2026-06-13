// ============================================================
// ANCIENTS core type vocabulary.
// /src/core/ never imports three and never touches the DOM.
// All content (heroes, items, creeps, regions) is data built
// from these closed vocabularies; systems are interpreters.
// ============================================================

export type Vec2 = { x: number; y: number };

export type Team = number; // 0 = player, 1 = wild/enemy, arbitrary in arenas

export type Attribute = 'str' | 'agi' | 'int' | 'uni';
export type DamageType = 'physical' | 'magical' | 'pure';
export type ElementId = 'pyro' | 'hydro' | 'electro' | 'cryo' | 'geo' | 'dendro' | 'anemo' | 'neutral';

export type UnitKind = 'hero' | 'creep' | 'summon' | 'ward' | 'npc';

// ---------- Targeting (closed list, SPEC §2) ----------
export type BaseTargeting =
  | 'no-target'
  | 'unit-target'
  | 'point-target'
  | 'skillshot'
  | 'ground-aoe'
  | 'toggle'
  | 'passive'
  | 'aura'
  | 'attack-modifier';
// 'channel' combines with castable base types via AbilityDef.channel.

// ---------- Statuses (one shared list, SPEC §2) ----------
export type StatusId =
  | 'stun'
  | 'root'
  | 'silence'
  | 'hex'
  | 'slow'        // move and/or attack slow via params
  | 'disarm'
  | 'blind'
  | 'fear'
  | 'taunt'
  | 'invis'
  | 'magic-immune'
  | 'break'
  | 'cyclone'
  | 'sleep'
  | 'frozen'
  | 'buff';       // generic carrier for stat mods / DoT / periodic effects

// ---------- Stat modifier keys (closed list) ----------
export interface StatMods {
  str: number;
  agi: number;
  int: number;
  damage: number;            // flat attack damage
  damagePct: number;         // % bonus attack damage
  armor: number;
  attackSpeed: number;       // flat IAS
  moveSpeed: number;         // flat
  moveSpeedPct: number;
  hpRegen: number;
  manaRegen: number;
  maxHp: number;
  maxMana: number;
  magicResistPct: number;
  spellAmpPct: number;
  statusResistPct: number;
  evasionPct: number;
  lifestealPct: number;
  attackRange: number;
  hpRegenPctMax: number;          // % of max HP per second (Healing Ward)
  damageTakenReductionPct: number;        // all damage
  attackDamageTakenReductionPct: number;  // damage from attacks only (Frost Shield)
  castRange: number;
  visionPct: number;
}
export type StatModMap = Partial<StatMods>;

// ---------- Values ----------
// Numeric fields in ability data are either a literal or a key into
// AbilityDef.values, which holds a per-level array.
export type ValueRef = number | string;

// ---------- Target selectors (closed list) ----------
export type TargetSel =
  | 'target'                  // unit the ability was cast on / projectile hit
  | 'self'
  | 'point'                   // cast point (for zones/aoe centers)
  | 'enemies-in-radius'
  | 'allies-in-radius'        // includes self
  | 'units-in-radius'
  | 'random-enemy-in-radius'
  | 'lowest-hp-ally-in-radius';

// ---------- Effect primitives (closed vocabulary, SPEC §2) ----------
export type EffectNode =
  | {
      kind: 'damage';
      dtype: DamageType;
      amount: ValueRef;
      target: TargetSel;
      radius?: ValueRef;          // for *-in-radius selectors
      perUnitBonus?: ValueRef;    // Echo Slam: extra per unit within radius
      attackDamagePct?: ValueRef; // % of caster attack damage added (Omnislash strikes)
      offsetRing?: { min: ValueRef; max: ValueRef }; // Freezing Field: center offset random in ring
    }
  | { kind: 'heal'; amount: ValueRef; target: TargetSel; radius?: ValueRef; pctMaxHp?: boolean; perCharge?: boolean }
  | {
      kind: 'mana';
      op: 'burn' | 'restore';
      amount: ValueRef;
      target: TargetSel;
      radius?: ValueRef;
      burnedAsDamagePct?: number; // mana burned also dealt as physical (Diffusal/Mana Break)
      perCharge?: boolean;        // scale by charges consumed (Magic Wand)
    }
  | {
      kind: 'status';
      status: StatusId;
      duration: ValueRef;
      target: TargetSel;
      radius?: ValueRef;
      params?: StatusParams;
    }
  | {
      kind: 'displace';
      mode: 'knockback' | 'pull' | 'forced' | 'blink';
      target: TargetSel;
      distance?: ValueRef;
      speed?: ValueRef;            // units/sec for non-blink
      toward?: 'caster' | 'point' | 'facing' | 'away-from-caster' | 'target-unit';
      radius?: ValueRef;
    }
  | { kind: 'zone'; zone: ZoneSpec; at: 'point' | 'self' | 'target' | 'line-to-point'; follow?: boolean }
  | { kind: 'summon'; summon: SummonSpec; count?: ValueRef; at: 'point' | 'self' }
  | { kind: 'statmod'; mods: Record<string, ValueRef>; duration: ValueRef; target: TargetSel; radius?: ValueRef }
  | { kind: 'projectile'; proj: ProjectileSpec; to: 'target' | 'point' }
  | { kind: 'repeat'; count: ValueRef; interval: number; effects: EffectNode[]; retarget?: TargetSel; radius?: ValueRef }
  | { kind: 'capture-channel' }          // Binding Totem (player innate)
  | { kind: 'purge'; target: TargetSel } // remove purgeable (buffs from enemies, debuffs from allies)
  | { kind: 'exotic'; id: string; params?: Record<string, unknown> };

export interface StatusParams {
  mods?: Record<string, ValueRef>;
  dotDps?: ValueRef;
  dotType?: DamageType;
  moveSlowPct?: ValueRef;
  attackSlowPct?: ValueRef;
  fadeTime?: number;          // invis
  breakOnDamage?: boolean;    // sleep, salve-style buffs
  periodic?: { interval: number; effects: EffectNode[] }; // runs centered on the carrier
  attackMod?: AttackModSpec;  // temp attack buffs (Enchant Totem)
  consumeOnAttack?: boolean;
  basicDispelOnApply?: boolean; // BKB
  tag?: string;               // stacking key override
}

export interface ZoneSpec {
  shape: 'circle' | 'line';
  radius?: ValueRef;          // circle
  length?: ValueRef;          // line
  width?: ValueRef;           // line
  duration: ValueRef;
  wall?: boolean;             // impassable (Fissure)
  tick?: { interval: number; effects: EffectNode[]; affects: 'enemies' | 'allies' | 'all' };
  auraMods?: { affects: 'enemies' | 'allies'; mods: Record<string, ValueRef> };
  onEnter?: { effects: EffectNode[]; affects: 'enemies' | 'allies'; windowSec?: number };
}

export interface ProjectileSpec {
  model: 'homing' | 'linear';
  speed: ValueRef;
  width?: ValueRef;           // linear collision width
  range?: ValueRef;           // linear max travel
  bounces?: { count: ValueRef; radius: ValueRef };  // Chain Frost
  onHit: EffectNode[];
  disjointable?: boolean;     // default true for homing
  hitsAllies?: boolean;
}

export interface SummonSpec {
  id: string;
  name: string;
  lifetime: ValueRef;
  stats: SummonStats;
  abilities?: AbilityDef[];
  cannotAttack?: boolean;     // Healing Ward
  silhouette: SilhouetteSpec;
  palette: [string, string, string];
}
export interface SummonStats {
  maxHp: number;
  damage: number;
  armor: number;
  moveSpeed: number;
  attackRange: number;
  baseAttackTime: number;
  magicResistPct?: number;
}

export interface AttackModSpec {
  critChance?: ValueRef;
  critMult?: ValueRef;
  procChance?: ValueRef;
  procDamage?: ValueRef;
  procStatus?: { status: StatusId; duration: ValueRef; params?: StatusParams };
  manaBurnPerHit?: ValueRef;
  manaBurnAsDamagePct?: number;
  bonusDamage?: ValueRef;
  bonusDamagePct?: ValueRef;
  lifestealPct?: ValueRef;
  cleave?: { pct: ValueRef; radius: ValueRef };
}

export type TriggerEvent =
  | 'on-cast'            // self casts an ability (Aftershock)
  | 'on-damage-taken'    // Blink lockout, sleep break
  | 'on-attack-land'
  | 'on-kill'
  | 'on-nearby-death'    // Flesh Heap
  | 'on-nearby-enemy-cast'; // Magic Wand charges

export interface TriggerSpec {
  on: TriggerEvent;
  radius?: ValueRef;
  cooldown?: number;
  effects?: EffectNode[];
  statStack?: { mods: Record<string, ValueRef>; max?: number };  // permanent stacks (Flesh Heap)
  chargeGain?: number;       // item charges (Magic Wand)
}

export interface AuraSpec {
  radius: number | 'global';
  affects: 'allies' | 'enemies';
  mods?: Record<string, ValueRef>;
  excludeSelf?: boolean;
}

// ---------- VFX archetypes (closed list, SPEC §2) ----------
export type VfxArchetype =
  | 'projectile'
  | 'ground-aoe'
  | 'chain'
  | 'beam'
  | 'summon-pop'
  | 'shield'
  | 'stun-stars'
  | 'channel'
  | 'global-mark'
  | 'hook'
  | 'wall'
  | 'storm';

export interface VfxSpec {
  archetype: VfxArchetype;
  color: string;
  color2?: string;
  scale?: number;
}

// ---------- Phase 4-ready animation/audio data hooks ----------
export type AnimGesture =
  | 'melee-swing'
  | 'ranged-shot'
  | 'staff-cast'
  | 'ground-slam'
  | 'dash'
  | 'channel-loop'
  | 'summon-gesture'
  | 'item-use'
  | 'global-cast';

export type SoundArchetype =
  | 'blade'
  | 'bow'
  | 'impact'
  | 'frost'
  | 'fire'
  | 'storm'
  | 'void'
  | 'heal'
  | 'summon'
  | 'item'
  | 'roar';

export interface AnimProfile {
  rig: string;
  castStyle: string;
  voiceTimbre: string;
}

// ---------- Abilities ----------
export interface AbilityDef {
  id: string;
  name: string;
  lore?: string;
  targeting: BaseTargeting;
  affects?: 'enemy' | 'ally' | 'any';   // unit-target filter
  ult?: boolean;
  maxLevel?: number;                     // default: ult 3, basic 4
  castRange?: ValueRef;
  castPoint?: number;                    // seconds, default 0.3
  manaCost?: number[];
  cooldown?: number[];
  values?: Record<string, number[]>;
  effects?: EffectNode[];                // executed on cast / on skillshot hit via projectile
  channel?: {
    duration: ValueRef;
    tick?: { interval: number; effects: EffectNode[] };
    onEnd?: EffectNode[];                // only if channel completes
    selfRootDuringCast?: boolean;
  };
  toggle?: {
    interval: number;                    // tick cadence while on
    effects: EffectNode[];
    selfDamagePerSec?: ValueRef;
    manaPerSec?: ValueRef;
  };
  passiveMods?: Record<string, ValueRef>;
  attackMod?: AttackModSpec;
  aura?: AuraSpec;
  triggers?: TriggerSpec[];
  piercesImmunity?: boolean;
  element?: ElementId;
  vfx: VfxSpec;
  anim?: AnimGesture;
  sound?: SoundArchetype;
}

// ---------- Talents / Facets / Aghs ----------
export interface TalentDef {
  id: string;
  name: string;
  mods?: StatModMap;
  abilityOverride?: { abilityId: string; valueKey: string; mode: 'add' | 'mul' | 'set'; amount: number };
  cooldownAdd?: { abilityId: string; amount: number }; // negative = reduction
}
export interface TalentTier {
  level: number; // 10 | 15 | 20 | 25
  options: [TalentDef, TalentDef];
}
export interface FacetDef {
  id: string;
  name: string;
  description: string;
  mods?: StatModMap;
  abilityValueOverride?: { abilityId: string; valueKey: string; mode: 'add' | 'mul' | 'set'; amount: number };
}
export interface AghanimDef {
  name: string;
  description: string;
  implemented: boolean;       // ≥15 implemented by Phase 3
}

export interface EchoProgress {
  kills: number;                   // owned hero echo kills
  facetSwapUnlocked: boolean;      // first echo kill opens facet swapping
  talentTierUnlocks: boolean[];    // 4 tiers; true means the opposite branch applies too
}

// ---------- Models (procedural, SPEC §3) ----------
export interface SilhouetteSpec {
  build: 'biped' | 'quad' | 'blob' | 'brute' | 'golem' | 'bird' | 'ward';
  scale: number;              // 1.0 = standard hero
  bodyShape?: 'slim' | 'bulky' | 'robed';
  head?: 'bare' | 'helm' | 'hood' | 'mask' | 'skull' | 'horned';
  weapon?: 'none' | 'sword' | 'staff' | 'hook' | 'totem' | 'rifle' | 'cleaver';
  extras?: ('cape' | 'shoulderpads' | 'horns' | 'tusks' | 'crown' | 'quiver' | 'belt' | 'wings')[];
}

export type ItemWeaponVisualKind =
  | NonNullable<SilhouetteSpec['weapon']>
  | 'broad-cleaver'
  | 'glowing-blade'
  | 'long-pole'
  | 'storm-haft';

export type ItemAppearancePart =
  | 'pauldrons'
  | 'heart-core'
  | 'frost-shards'
  | 'boot-trail'
  | 'wing-blades'
  | 'crystal-edge'
  | 'mana-orb'
  | 'hex-sigil';

export interface ItemAppearanceSpec {
  weapon?: { kind: ItemWeaponVisualKind; color?: string; emissive?: string };
  parts?: ItemAppearancePart[];
  tint?: string;
  aura?: { archetype: VfxArchetype; color: string; color2?: string };
}

export type AttackVisualKind =
  | 'cleave-sweep'
  | 'ranged-conversion'
  | 'lightning-bounce'
  | 'tinted-impact'
  | 'crit-lunge';

export interface AttackVisualSpec {
  kind: AttackVisualKind;
  color: string;
  color2?: string;
  scale?: number;
}

// ---------- Heroes ----------
export interface HeroBaseStats {
  str: number; agi: number; int: number;
  strGain: number; agiGain: number; intGain: number;
  baseDamage: number;          // before primary attribute
  baseArmor: number;
  attackRange: number;         // 150 = melee
  attackPoint: number;         // windup seconds
  baseAttackTime: number;
  attackProjectileSpeed?: number; // ranged only
  moveSpeed: number;
  turnRate: number;            // dota-style 0.4–1.0
  hpRegen: number;
  manaRegen: number;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  attribute: Attribute;
  roles: string[];             // 'carry' | 'support' | 'nuker' | 'disabler' | 'durable' | 'escape' | 'pusher' | 'initiator'
  region: string;
  lore: string;
  baseStats: HeroBaseStats;
  abilities: AbilityDef[];     // exactly 4 for roster heroes
  skillOrder?: number[];       // ability slot leveling priority, default [0,1,2]
  talents: TalentTier[];       // exactly 4 tiers x 2 options
  facets: FacetDef[];          // >= 1
  aghanim?: AghanimDef;
  silhouette: SilhouetteSpec;
  palette: [string, string, string];
  barks: string[];             // ~6 original lines, Dota voice, never Valve text
  bounty: { xp: number; gold: number };
  starter?: boolean;
  recruitmentQuestId?: string;
  animProfile?: AnimProfile;
  element?: ElementId;
}

// ---------- Creeps ----------
export type CreepTier = 'small' | 'medium' | 'large' | 'ancient';
export interface CreepDef {
  id: string;
  name: string;
  tier: CreepTier;
  stats: {
    maxHp: number; damage: number; armor: number; magicResistPct: number;
    moveSpeed: number; attackRange: number; baseAttackTime: number;
    attackProjectileSpeed?: number;
  };
  abilities: AbilityDef[];
  bounty: { xp: number; gold: number };
  silhouette: SilhouetteSpec;
  palette: [string, string, string];
  aggroRadius?: number;        // default from tuning
  animProfile?: AnimProfile;
}

// ---------- Items ----------
export type ItemTier = 'consumable' | 'component' | 'basic' | 'core';
export interface ItemDef {
  id: string;
  name: string;
  tier: ItemTier;
  cost: number;                // total cost (recipe included for assembled)
  components?: string[];       // item ids; repeats allowed
  recipeCost?: number;
  passiveMods?: StatModMap;
  attackMod?: AttackModSpec;
  aura?: AuraSpec;
  active?: AbilityDef;         // item actives reuse the ability engine
  charges?: number;            // consumables / wand
  maxCharges?: number;
  consumesAllCharges?: boolean; // Magic Wand: active spends every charge
  triggers?: TriggerSpec[];
  damageLockoutSec?: number;   // Blink Dagger: unusable after taking enemy damage
  lore: string;
  glyph?: string;              // icon generator hint
  appearance?: ItemAppearanceSpec;
  attackVisual?: AttackVisualSpec[];
  elementOnHit?: Exclude<ElementId, 'neutral'>;
}

// ---------- Phase 3 bosses / raids / draft / economy ----------
export type DifficultyTier = 'normal' | 'nightmare' | 'hell';

export interface LootTable {
  guaranteed: string[];
  assembledPool: string[];
  dropPct: Record<DifficultyTier, number>;
  pity: number;
}

export interface BossDef {
  id: string;
  heroId: string;
  region: string;
  rank: 'boss' | 'mini-boss';
  phases?: { atHpPct: number; onEnter: EffectNode[]; gambitBias?: string }[];
  loot: LootTable;
  tiers: DifficultyTier[];
}

export interface RaidDef {
  id: string;
  name: string;
  location: string;
  unlockQuest: string;
  boss: RaidBossSetup;
  addWaves: { atHpPct: number; summon: SummonSpec; count: number }[];
  zones: { atHpPct: number; zone: ZoneSpec }[];
  enrageSec: number;
  loot: LootTable;
  signatureExotic?: string;
}

export interface DraftDef {
  id: string;
  members: { name: string; pool: string[] }[];
  banPickOrder: ('pick' | 'ban')[];
  champion: MacroHeroSetup[] | BossDef;
}

export interface NeutralItemDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  passiveMods?: StatModMap;
  attackMod?: AttackModSpec;
  aura?: AuraSpec;
  active?: AbilityDef;
  enchantsInto?: string;
  dropFromTier: CreepTier;
  lore: string;
  glyph?: string;
}

// ---------- Regions ----------
export interface CampDef {
  id: string;
  creepId: string;
  count: number;
  pos: Vec2;
  radius: number;
  respawnSec: number;
}
export interface EchoSpawnDef {
  id: string;
  heroId: string;
  pos: Vec2;
  level: number;
  respawnSec: number;
}
export interface GateDef {
  id: string;
  name: string;
  pos: Vec2;
  radius: number;
  toRegionId: string;
  toPos: Vec2;
  requiredBadge?: string;
}
export interface RegionDef {
  id: string;
  name: string;
  biome: 'grass' | 'snow' | 'desert' | 'wasteland' | 'coast' | 'forest';
  size: number;                // square side, dota units
  seed: number;
  lore: string;
  town: { name: string; pos: Vec2; radius: number };
  shrine: { pos: Vec2 };
  shopInventory: string[];
  camps: CampDef[];
  heroSpawns: { heroId: string; pos: Vec2 }[];
  echoSpawns?: EchoSpawnDef[];
  gates?: GateDef[];
  gyms?: { gymId: string; pos: Vec2; radius: number }[];
  secretShop?: { pos: Vec2; inventory: string[] };
  bosses?: string[];
  raids?: string[];
  props: { treeDensity: number; rockDensity: number };
  gateHint?: string;
}

// ---------- Recruitment / gyms ----------
export type TrialKind =
  | 'honor-duel'
  | 'timed-cull'
  | 'relic-fetch'
  | 'survive-night'
  | 'frost-exam'
  | 'skillshot-exam'
  | 'combo-exam'
  | 'persuasion-gauntlet'
  | 'assassination-contract'
  | 'faction-choice'
  | 'lore-riddle'
  | 'raid-recruit'
  | 'roster-legend';

export interface TrialDef {
  id: string;
  heroId: string;
  kind: TrialKind;
  name: string;
  description: string;
  regionId: string;
  pos: Vec2;
  requiredHeroIds?: string[];
}

export interface RecruitmentQuestDef {
  id: string;
  heroId: string;
  trialId: string;
  findText: string;
  trialText: string;
  bindText: string;
}

export type QuestStage = 'unfound' | 'found' | 'trial-complete' | 'bound';
export interface QuestProgress {
  stage: QuestStage;
  attunement: number;
  trialCompletions: number;
}

export interface GymDef {
  id: string;
  name: string;
  badgeId: string;
  regionId: string;
  leader: string;
  theme: string;
  bestOf: 3;
  enemyTeam: MacroHeroSetup[];
  enemyBonusCaptainCalls?: number;
}

// ---------- Gambits (SPEC §7) ----------
export type GambitCondition =
  | { k: 'always' }
  | { k: 'self-hp-below'; pct: number }
  | { k: 'ally-hp-below'; pct: number }
  | { k: 'enemy-hp-below'; pct: number }
  | { k: 'self-mana-above'; pct: number }
  | { k: 'self-mana-below'; pct: number }
  | { k: 'has-status'; status: StatusId; target: 'self' | 'focus' }
  | { k: 'target-role'; role: string }
  | { k: 'target-attribute'; attribute: Attribute }
  | { k: 'enemies-within'; radius: number; count: number }
  | { k: 'allies-alive'; count: number }
  | { k: 'ability-ready'; slot: number }
  | { k: 'fight-time-gt'; sec: number }
  | { k: 'distance-to-focus-gt'; dist: number }
  | { k: 'distance-to-focus-lt'; dist: number };

export type GambitTargetMode = 'lowest-hp-enemy' | 'most-clustered' | 'self' | 'lowest-hp-ally' | 'focus';

export type GambitAction =
  | { k: 'cast'; slot: number; targetMode: GambitTargetMode }
  | { k: 'use-item'; itemId: string; targetMode: GambitTargetMode }
  | { k: 'attack-focus' }
  | { k: 'retreat' }
  | { k: 'hold' };

export interface GambitRule {
  if: GambitCondition[];
  then: GambitAction;
}

export interface MacroHeroSetup {
  heroId: string;
  level?: number;
  items?: string[];
  gambits?: GambitRule[];
}

export interface RaidBossSetup extends MacroHeroSetup {
  hpScale?: number;
  damageScale?: number;
}

// ---------- Orders ----------
export type Order =
  | { kind: 'stop' }
  | { kind: 'hold' }
  | { kind: 'move'; point: Vec2 }
  | { kind: 'attack-move'; point: Vec2 }
  | { kind: 'attack-unit'; uid: number }
  | { kind: 'follow'; uid: number }
  | { kind: 'cast'; slot: number; uid?: number; point?: Vec2 }
  | { kind: 'item'; invSlot: number; uid?: number; point?: Vec2 }
  | { kind: 'capture'; uid: number };

// ---------- Sim events (renderer + tests consume) ----------
export type SimEvent =
  | { t: 'damage'; uid: number; from: number; amount: number; dtype: DamageType; crit?: boolean }
  | { t: 'heal'; uid: number; amount: number }
  | { t: 'death'; uid: number; killer: number }
  | { t: 'cast'; uid: number; abilityId: string; vfx: VfxSpec; target?: number; point?: Vec2 }
  | { t: 'attack-impact'; uid: number; target: number }
  | { t: 'attack-launch'; uid: number; target: number; speed: number }
  | { t: 'projectile-spawn'; pid: number; from: Vec2; vfx: VfxSpec; targetUid?: number; toPoint?: Vec2 }
  | { t: 'projectile-hit'; pid: number; pos: Vec2; targetUid?: number }
  | { t: 'projectile-expire'; pid: number; pos: Vec2 }
  | { t: 'zone-spawn'; zid: number; pos: Vec2; spec: { shape: 'circle' | 'line'; radius: number; length: number; width: number; angle: number; wall: boolean; duration: number; followUid?: number }; vfx: VfxSpec }
  | { t: 'zone-expire'; zid: number }
  | { t: 'aoe-burst'; pos: Vec2; radius: number; vfx: VfxSpec }
  | { t: 'status-apply'; uid: number; status: StatusId; duration: number }
  | { t: 'status-expire'; uid: number; status: StatusId }
  | { t: 'element-apply'; uid: number; from: number; element: Exclude<ElementId, 'neutral'>; gauge: number }
  | { t: 'reaction'; uid: number; from: number; reaction: string; elements: [Exclude<ElementId, 'neutral'>, Exclude<ElementId, 'neutral'>] }
  | { t: 'immune-block'; uid: number }   // BKB visible spell rejection
  | { t: 'miss'; uid: number; target: number }
  | { t: 'blink'; uid: number; from: Vec2; to: Vec2 }
  | { t: 'levelup'; uid: number; level: number }
  | { t: 'capture-start'; uid: number; target: number; duration: number }
  | { t: 'capture-progress'; target: number; pct: number }
  | { t: 'capture-complete'; target: number; creepId: string }
  | { t: 'capture-interrupt'; target: number }
  | { t: 'summon'; uid: number; pos: Vec2 }
  | { t: 'item-used'; uid: number; itemId: string }
  | { t: 'gold'; amount: number; reason: string; pos?: Vec2 }
  | { t: 'xp'; uid: number; amount: number }
  | { t: 'bark'; uid: number; line: string }
  | { t: 'kill-credit'; victimUid: number; killerUid: number; bounty: { xp: number; gold: number }; lastHitByPlayer: boolean };

// ---------- Saved game ----------
export interface ItemSave { id: string; charges?: number; cooldownLeft?: number }
export interface HeroSave {
  heroId: string;
  level: number;
  xp: number;
  items: (ItemSave | null)[];   // 6 slots
  neutralSlot: ItemSave | null;
  gambits?: GambitRule[];
  talentPicks: (0 | 1 | null)[]; // 4 tiers
  echo?: EchoProgress;
  facetIdx: number;
  hpPct: number;
  manaPct: number;
  abilityCooldowns: number[];   // seconds remaining
  fleshStacks?: Record<string, number>;
}
export interface CreepInstanceSave {
  uid: string;
  creepId: string;
  star: 1 | 2 | 3;
  faintedFor?: number;          // seconds remaining
}
export interface GameSave {
  version: number;
  name: string;
  createdAt: number;
  savedAt: number;
  playtimeSec: number;
  worldSeed: number;
  dayTime: number;              // 0..1
  gold: number;
  regionId: string;
  playerPos: Vec2;
  party: string[];              // hero ids, ≤5, index = key 1..5
  activeIdx: number;
  roster: HeroSave[];
  stash: ItemSave[];
  inventoryStash: ItemSave[];
  caught: CreepInstanceSave[];
  fielded: string[];            // creep instance uids, ≤3
  recruited: string[];
  badges: string[];
  questProgress: Record<string, QuestProgress>;
  defeatedGyms: string[];
  echoRespawn: Record<string, number>; // echo spawn id -> seconds remaining
  campRespawn: Record<string, number>; // camp id -> seconds remaining
  difficulty: Record<string, { tier: DifficultyTier; dryClears: number }>;
  raidProgress: Record<string, { clears: number; dryStreak: number; aegisHeld?: boolean; roshanRespawnAt?: number }>;
  eliteFive: { defeated: number; championDown: boolean };
  factionChoices: Record<string, string>;
  heldUniques: string[];
  neutralStash: { id: string; count: number }[];
  goldSinks: { buybacks: number; tomesUsed: number; respecs: number };
  settings: { quickcast: boolean; resonance?: boolean; masterVolume?: number; sfxVolume?: number; musicVolume?: number };
}

// ---------- Sim interface available to effect interpreters ----------
// (Breaks import cycles: effects.ts depends on this, sim.ts implements it.)
export interface UnitLike {
  uid: number;
  team: Team;
  pos: Vec2;
  facing: number;
  alive: boolean;
  kind: UnitKind;
  radius: number;
}
