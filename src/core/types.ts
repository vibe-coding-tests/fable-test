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
export type ActiveElement = Exclude<ElementId, 'neutral'>;

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
  manaRegenPctMax: number;
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
  swapCdReductionPct: number;
  swapInDamagePct: number;
  swapInHealPct: number;
  reactionAmpPct: number;
  elementalGaugeSec: number;
  staminaBonus: number;
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
  threatDropPct?: number;     // reduce this unit's active threat-table entries on apply
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
  | 'storm'
  // WS-G additions (VFX_OVERHAUL §11): shapes the 12 base archetypes cannot read.
  | 'vortex'   // inward-spiraling pull: Black Hole, Reverse Polarity, Vacuum, Maelstrom
  | 'dome'     // hemispherical containment: Chronosphere, Arena of Blood, Static Storm
  | 'mine'     // small armed ground charge w/ proximity telegraph: Techies/Remote/Land mines
  | 'cyclone'; // vertical wind column: Eul's, Wind Waker, phase-out lifts

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
  | 'global-cast'
  | 'toggle-stance';

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
  | 'roar'
  | 'lightning';

export interface AnimProfile {
  rig: string;
  castStyle: string;
  voiceTimbre: string;
}

// ---------- Audio channels (Phase 4 §3.7, save v4) ----------
export interface AudioSettings {
  master: number;
  sfx: number;
  voice: number;
  stinger: number;
  muted: boolean;
}

// Quality tier mirrors engine/performance QualityTier; kept as a local string union
// so core stays free of any engine/render import (boundary guard).
export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high' | 'ultra';

export interface GraphicsSettings {
  quality: GraphicsQuality;
  exposure: number;      // tonemapping exposure, 0.5..1.5 (default 0.92)
  grade: number;         // color-grade strength, 0..1.5 (default 1)
  reducedMotion: boolean; // freezes ambient particle/water motion
}

// Cut-scene controls (STORY §3.4): the player is always in charge of staging.
export interface CutsceneSettings {
  length: 'full' | 'short' | 'off'; // tier degrade matrix (§4.3): setpiece→stinger→toast
  defaultSpeed: 1 | 2 | 4;          // start fast-forwarded by default for impatient players
  alwaysSkip: boolean;              // one switch: route the line as a toast, never stage
  photosensitive: boolean;           // cap flashes/shakes and use instant overlay transitions
  tieIns: boolean;                   // seasonal/legend homages can be fully suppressed
}

export type StingerId = 'capture' | 'merge' | 'levelup' | 'badge' | 'raid-clear' | 'loot' | 'loot-signature';

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
  glyph?: string;   // optional icon hint (WS-F); falls back to the archetype glyph
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
export interface HeroAbilityPatch {
  abilityId: string;
  patch: Partial<Pick<AbilityDef, 'name' | 'lore' | 'targeting' | 'affects' | 'castRange' | 'manaCost' | 'cooldown' | 'values' | 'effects' | 'channel' | 'attackMod' | 'aura' | 'triggers' | 'vfx' | 'anim' | 'sound'>>;
}
export interface AghanimPayload {
  mods?: StatModMap;
  abilityValueOverrides?: { abilityId: string; valueKey: string; mode: 'add' | 'mul' | 'set'; amount: number }[];
  cooldownAdds?: { abilityId: string; amount: number }[];
  abilityPatches?: HeroAbilityPatch[];
}
export interface AghanimDef {
  name: string;
  description: string;
  implemented: boolean;       // ≥15 implemented by Phase 3
  scepter?: AghanimPayload;
  shard?: AghanimPayload;
}

export interface HeroComboRule {
  /** Prefer `after` shortly after `before` lands (e.g. setup stun -> burst). */
  before: string;
  after: string;
  windowSec?: number;
  weight?: number;
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
  | 'hex-sigil'
  | 'cloak'
  | 'halo';

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
  | 'crit-lunge'
  | 'armor-shred-flash';

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
  combo?: HeroComboRule[];
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
  elementalShield?: { element: ActiveElement; hp: number; weakTo: ActiveElement[]; weakMult: number };
  drops?: ItemDropTable;
  animProfile?: AnimProfile;
  lore?: string;
}

// ---------- Items ----------
export type ItemTier = 'consumable' | 'component' | 'basic' | 't1' | 't2' | 't3' | 't4' | 'special';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'mythical' | 'legendary' | 'immortal' | 'arcana';
export type ItemQuality = 'standard' | 'inscribed' | 'genuine' | 'frozen' | 'corrupted' | 'unusual';
export type ItemGrade = 'broken' | 'worn' | 'standard' | 'sharp' | 'refined' | 'pristine';
export type ItemAffixKind = 'prefix' | 'suffix' | 'signature';
export type AffixPoolId = 'weapon-like' | 'armor-like' | 'caster-like' | 'mobility' | 'any';
export type DropSource = 'shop' | 'creep' | 'echo' | 'boss' | 'raid' | 'special-battle' | 'gamble' | 'dungeon';
export type LootBand = 'early' | 'mid' | 'late';

export interface ItemAffixDef {
  id: string;
  name: string;
  kind: ItemAffixKind;
  tier: 1 | 2 | 3 | 4 | 5;
  pools: AffixPoolId[];
  weight: number;
  regionWeights?: Partial<Record<string, number>>;
  statRanges?: Partial<Record<keyof StatMods, [number, number]>>;
  attack?: Partial<AttackModSpec>;
  trigger?: TriggerSpec;
  aura?: AuraSpec;
}

export interface RolledAffix {
  affixId: string;
  roll: number;
  resolved: StatModMap;
}

export interface LootFilterSave {
  minGrade: ItemGrade;
  minRarity: ItemRarity;
  autoDisenchantBelowGrade?: ItemGrade;
  autoDisenchantBelowRarity?: ItemRarity;
}

export interface ItemSetDef {
  id: string;
  name: string;
  pieces: string[];
  bonuses: { atPieces: number; mods?: StatModMap; aura?: AuraSpec; trigger?: TriggerSpec }[];
}

export interface HeroAugments {
  scepter?: boolean;
  shard?: boolean;
}

export interface DropEntry {
  id: string;
  weight: number;
  quality?: ItemQuality;
  rarity?: ItemRarity;
}

export interface DropSlot {
  id?: string;
  rarity: ItemRarity;
  rolls: number;
  chance: Record<DifficultyTier, number>;
  pool: DropEntry[];
  qualityOdds?: Partial<Record<ItemQuality, number>>;
  qualityOddsByTier?: Partial<Record<DifficultyTier, Partial<Record<ItemQuality, number>>>>;
  pity?: number;
  source?: DropSource;
  raritySplit?: boolean;
}

export interface ItemDropTable {
  guaranteed: string[];
  slots: DropSlot[];
}

export interface ItemDef {
  id: string;
  name: string;
  tier: ItemTier;
  rarity?: ItemRarity;
  exclusiveTo?: DropSource[];
  cost: number;                // total cost (recipe included for assembled)
  components?: string[];       // item ids; repeats allowed
  recipeCost?: number;
  passiveMods?: StatModMap;
  attackMod?: AttackModSpec;
  aura?: AuraSpec;
  active?: AbilityDef;         // item actives reuse the ability engine
  set?: string;
  socketCap?: number;
  levelReq?: number;
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
  assembledRarityPools?: Partial<Record<ItemRarity, string[]>>;
  dropPct: Record<DifficultyTier, number>;
  pity: number;
  /** Optional luck-at-source quality odds for the assembled drop (LOOT L5). */
  qualityOdds?: Partial<Record<ItemQuality, number>>;
}

export interface BossDef {
  id: string;
  heroId: string;
  region: string;
  rank: 'boss' | 'mini-boss';
  phases?: { atHpPct: number; onEnter: EffectNode[]; gambitBias?: string }[];
  loot: LootTable;
  tiers: DifficultyTier[];
  dialogue: string[];
}

export interface RaidDef {
  id: string;
  name: string;
  title: string;               // homage subtitle (§3.13), original
  location: string;
  unlockQuest: string;
  boss: RaidBossSetup;
  addWaves: { atHpPct: number; summon: SummonSpec; count: number }[];
  zones: { atHpPct: number; zone: ZoneSpec }[];
  enrageSec: number;
  loot: LootTable;
  signatureExotic?: string;
  dialogue: string[];          // in-character boss lines (§3.13), original
}

// ---------- Lore codex ----------
export type LoreThreadId = 'loop';
export type LoreUnlock =
  | { kind: 'start' }
  | { kind: 'region'; regionId: string }
  | { kind: 'badge'; badgeId: string }
  | { kind: 'champion' };

export interface LoreEntryDef {
  id: string;
  thread: LoreThreadId;
  stage: string;
  title: string;
  summary: string;
  body: string;
  unlock: LoreUnlock;
}

// ---------- Cut-scenes ----------
export type CutsceneTier = 'setpiece' | 'stinger' | 'bark';
export type CutsceneTrigger =
  | { kind: 'new-game' }
  | { kind: 'bind'; first?: boolean }
  | { kind: 'region-arrival'; regionId: string }
  | { kind: 'badge'; badgeId: string }
  | { kind: 'boss-clear' }
  | { kind: 'boss-phase'; bossHeroId?: string }
  | { kind: 'raid-intro'; raidId: string }
  | { kind: 'raid-clear'; raidId?: string }
  | { kind: 'item-first-hold'; itemId: string }
  | { kind: 'echo-milestone' }
  | { kind: 'trial-dialogue' }
  | { kind: 'elite-start' }
  | { kind: 'elite-persona'; index: number }
  | { kind: 'champion-clear' }
  | { kind: 'outworld-first-contact' }
  | { kind: 'outworld-all-clear' }
  | { kind: 'seasonal-event'; eventId: string }
  | { kind: 'legend-callout'; legendId: string };

export type ShotAngle = 'wide' | 'close' | 'low' | 'high' | 'bird-eye' | 'over-shoulder' | 'through-objects' | 'reflection' | 'title-card';
export type ShotMove = 'hold' | 'push-in' | 'pull-back' | 'crane' | 'snap' | 'rack-focus' | 'orbit';

export interface ShotSpec {
  angle: ShotAngle;
  move: ShotMove;
  palette: string;
  mood: string;
}

export type StageAction =
  | { kind: 'title'; text: string }
  | { kind: 'focus'; target: 'player' | 'ally' | 'boss' | 'region' | 'item' | 'tower' }
  | { kind: 'vfx'; archetype: VfxArchetype; color: string }
  | { kind: 'gesture'; target: 'ally' | 'boss' | 'player'; gesture: AnimGesture }
  | { kind: 'describe-environment'; text: string }
  | { kind: 'develop-character'; target: 'ally' | 'boss' | 'player'; text?: string; gesture?: AnimGesture }
  | { kind: 'advance-plot'; text: string; target?: 'ally' | 'boss' | 'player' | 'item' | 'tower' }
  | { kind: 'introduce-conflict'; text: string; target?: 'ally' | 'boss' | 'player' | 'tower' }
  | { kind: 'reveal-mystery'; text: string; target?: 'ally' | 'boss' | 'region' | 'item' | 'tower' }
  | { kind: 'set-tone'; text: string }
  | { kind: 'explore-theme'; text: string }
  | { kind: 'establish-history'; text: string };

export interface DialogueCard {
  speaker: string;
  text: string;
  portraitHeroId?: string;
}

export interface CutsceneBeat {
  shot: ShotSpec;
  stage?: StageAction[];
  line?: DialogueCard;
  hold?: number;
  sound?: SoundArchetype | StingerId;
}

export interface CutsceneDef {
  id: string;
  title: string;
  tier: CutsceneTier;
  trigger: CutsceneTrigger;
  skippable: true;
  letterbox?: boolean;
  music?: SoundArchetype | StingerId | 'duck' | 'silence';
  beats: CutsceneBeat[];
  replayable?: boolean;
  category?: 'Prologue' | 'Binds' | 'Regions' | 'Bosses' | 'Raids' | 'Items' | 'Endgame' | 'Claimants' | 'Festivals' | 'Legends';
}

// ---------- Event tie-ins ----------
export type SeasonalModeKind =
  | 'roshan-candy'
  | 'damage-race'
  | 'wave-defense'
  | 'endless-descent'
  | 'hazard-survival'
  | 'linear-crawl'
  | 'act-trials';

export interface SeasonalEventDef {
  id: string;
  name: string;
  realEvent: string;
  summary: string;
  mode: SeasonalModeKind;
  regionId: string;
  cutsceneId: string;
  codexTitle: string;
  codexBody: string;
  reward: { kind: 'gold' | 'loot-mark' | 'title'; amount?: number; label: string };
}

export interface LegendDef {
  id: string;
  name: string;
  realMoment: string;
  triggerSummary: string;
  cutsceneId: string;
  codexTitle: string;
  codexBody: string;
}

// ---------- Dungeons ----------
export type RoomType = 'entrance' | 'combat' | 'elite' | 'treasure' | 'shrine' | 'rest' | 'boss';
export type MonsterRarity = 'normal' | 'champion' | 'rare';

export interface RoomTemplate {
  id: string;
  biome: RegionDef['biome'];
  size: Vec2;
  connectors: { side: 'n' | 's' | 'e' | 'w'; at: Vec2 }[];
  spawnAnchors: Vec2[];
  props?: { treeDensity: number; rockDensity: number };
  allowTypes: RoomType[];
}

export interface SpawnCard {
  creepId: string;
  weight: number;
  cost: number;
  minDepth?: number;
  rarity?: MonsterRarity;
}

export interface AffixDef {
  id: string;
  name: string;
  apply: EffectNode[];
  minTier?: DifficultyTier;
  excludes?: string[];
}

export interface DungeonModifierDef {
  id: string;
  name: string;
  description: string;
  budgetMult?: number;
  packSizeBonus?: number;
  championChanceBonus?: number;
  rareChanceBonus?: number;
  forcedAffix?: string;
  lootChanceMult?: number;
  lootRollBonus?: number;
  roomCountBonus?: number;
  highStakes?: boolean;
}

export interface DungeonGenerationOptions {
  modifiers?: string[];
  /** Optional authored template pool; omitted tests/data get deterministic synthetic rooms. */
  roomTemplates?: RoomTemplate[];
  /** Endless descent (Diablo III greater rift): unbounded escalating depth gated by a progress meter. */
  endless?: boolean;
  /** Endless tier index (0 = first endless level); scales depth, budget, and rarity. */
  endlessLevel?: number;
}

export interface DungeonDef {
  id: string;
  name: string;
  regionId: string;
  biome: RegionDef['biome'];
  templates: string[];
  roomCount: { min: number; max: number };
  spawnPool: SpawnCard[];
  affixPool: string[];
  affixes?: AffixDef[];
  modifiers?: DungeonModifierDef[];
  guardian: string;
  loot: Record<RoomType, ItemDropTable>;
  budget: { base: number; perDepth: number };
  tiers: DifficultyTier[];
  unlockQuest?: string;
}

export interface RoomReward {
  kind: 'none' | 'loot' | 'chest' | 'shrine' | 'rest' | 'guardian';
  roomType: RoomType;
  table?: ItemDropTable;
  guaranteed?: string[];
  rarity?: ItemRarity;
}

export interface PlannedPack {
  cards: { creepId: string; star: 1 | 2 | 3 }[];
  rarity: MonsterRarity;
  affixes: string[];
  anchorIndex: number;
}

export interface DungeonRoom {
  index: number;
  type: RoomType;
  templateId: string;
  exits: number[];
  reward: RoomReward;
  packs: PlannedPack[];
}

export interface DungeonLayout {
  seed: number;
  def: string;
  tier: DifficultyTier;
  modifiers: string[];
  depth: number;
  rooms: DungeonRoom[];
  /** Endless run flag + level; absent on a normal fixed-length run. */
  endless?: boolean;
  endlessLevel?: number;
  /** Rarity-weighted kill total that fills the endless progress meter (summons the guardian at 100%). */
  progressTarget?: number;
}

export interface DraftMember {
  name: string;
  title: string;               // role-persona title (§3.13)
  pool: string[];
  dialogue: string[];          // in-character lines, original
}

export interface DraftDef {
  id: string;
  members: DraftMember[];
  banPickOrder: ('pick' | 'ban')[];
  champion: MacroHeroSetup[] | BossDef;
  championName: string;        // the Champion's original persona name (§3.13)
  championTitle: string;
  championDialogue: string[];
}

/** Route trainers (§3.13): esports-culture archetypes that flavor a region. */
export type TrainerArchetype = 'shoutcaster' | 'analyst' | 'streamer' | 'captain' | 'support';

export interface TrainerDef {
  id: string;
  name: string;                // original homage name
  title: string;               // original homage title
  archetype: TrainerArchetype;
  regionId: string;
  dialogue: string[];          // in-character lines, original
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
  leyLine?: { resinCost: number; bonusGold: number; bonusXp: number };
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
  /** Route opens only after this many heroes have been recruited (Phase 6 §3.4). */
  requiresRecruits?: number;
}
export interface DungeonPortalDef {
  id: string;
  dungeonId: string;
  name: string;
  pos: Vec2;
  radius: number;
  unlockQuest?: string;
}
export type ChestTier = 'common' | 'rich' | 'precious' | 'luxurious';
export type ChestGate =
  | { kind: 'none' }
  | { kind: 'camp'; campId: string }
  | { kind: 'puzzle'; puzzleId: string };
export interface ChestDef {
  id: string;
  pos: Vec2;
  tier: ChestTier;
  gate?: ChestGate;
  loot: { gold?: number; items?: string[]; shardCount?: number };
}
export interface WaypointDef {
  id: string;
  name: string;
  pos: Vec2;
  radius?: number;
}
export interface DiscoveryDef {
  id: string;
  pos: Vec2;
  radius: number;
  hint: string;
  reveals: string;
}
export interface ElementSourceDef {
  id: string;
  pos: Vec2;
  radius: number;
  element: ActiveElement;
  carriable?: boolean;
}
export interface ElementPuzzleDef {
  id: string;
  kind: 'brazier-chain' | 'freeze-platform' | 'relay' | 'burn-brush' | 'wind-seed';
  nodes: Vec2[];
  requires: ActiveElement;
  radius?: number;
  timeLimitSec?: number;
  reveals: string;
}
export interface WaterZoneDef {
  id: string;
  poly: Vec2[];
  deep?: boolean;
}
export interface RegionDef {
  id: string;
  name: string;
  biome: 'grass' | 'snow' | 'desert' | 'wasteland' | 'coast' | 'forest';
  size: number;                // square side, dota units
  seed: number;
  lore: string;
  arrivalBeat?: string;         // first-entry cinematic hook; interpreted outside core
  town: { name: string; pos: Vec2; radius: number };
  shrine: { pos: Vec2 };
  shopInventory: string[];
  camps: CampDef[];
  heroSpawns: { heroId: string; pos: Vec2 }[];
  echoSpawns?: EchoSpawnDef[];
  gates?: GateDef[];
  gyms?: { gymId: string; pos: Vec2; radius: number }[];
  dungeons?: DungeonPortalDef[];
  secretShop?: { pos: Vec2; inventory: string[] };
  bosses?: string[];
  raids?: string[];
  elevation?: { tiers: number[] };
  climbPoints?: { id: string; pos: Vec2; fromTier: number; toTier: number }[];
  glidePoints?: { id: string; pos: Vec2; fromTier: number }[];
  waterZones?: WaterZoneDef[];
  chests?: ChestDef[];
  shards?: { id: string; pos: Vec2 }[];
  waypoints?: WaypointDef[];
  discoveries?: DiscoveryDef[];
  elementSources?: ElementSourceDef[];
  elementPuzzles?: ElementPuzzleDef[];
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
  | 'roster-legend'
  | 'souls-pact'
  | 'stealth-hunt';

export interface TrialDef {
  id: string;
  heroId: string;
  kind: TrialKind;
  name: string;
  description: string;
  regionId: string;
  pos: Vec2;
  requiredHeroIds?: string[];
  /** Per-kind tunables consumed by the TrialRunner (radius, count, time, target). */
  params?: Record<string, number | string>;
  /** Trial opens only when reputation is at or above this threshold. */
  reputationGate?: number;
  /** Shard floor after a failed trial (relocation), instead of zero-and-lock. */
  relocationFloor?: number;
  /** Alternate in-region spots the marker relocates to on failure. */
  relocateSpots?: Vec2[];
  dialogue?: string[];
}

export interface RecruitmentQuestDef {
  id: string;
  heroId: string;
  trialId: string;
  findText: string;
  trialText: string;
  bindText: string;
  /** Echo kills required before the trial marker reveals (Find gating, §3.1). */
  findShardsNeeded?: number;
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
  leaderTitle: string;         // homage persona title (§3.13), original
  theme: string;
  bestOf: 3;
  enemyTeam: MacroHeroSetup[];
  enemyBonusCaptainCalls?: number;
  dialogue: string[];          // in-character leader lines (§3.13), original
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
  | { k: 'standing-in-zone' }
  | { k: 'focus-is-role'; role: string }
  | { k: 'distance-to-focus-gt'; dist: number }
  | { k: 'distance-to-focus-lt'; dist: number }
  // reactive reads (AI_OVERHAUL §2): answer what the enemy is doing right now
  | { k: 'enemy-cast-seen'; category: 'blink' | 'ult' | 'channel' | 'any' }
  | { k: 'self-disabled' }
  | { k: 'incoming-disable' };

export type GambitTargetMode =
  | 'lowest-hp-enemy'
  | 'lowest-hp-in-range'
  | 'most-clustered'
  | 'most-dangerous'
  | 'enemy-casting'
  | 'nearest-enemy'
  | 'self'
  | 'lowest-hp-ally'
  | 'focus';

export type GambitAction =
  | { k: 'cast'; slot: number; targetMode: GambitTargetMode }
  | { k: 'use-item'; itemId: string; targetMode: GambitTargetMode }
  | { k: 'attack-focus' }
  | { k: 'focus-fire'; targetMode?: GambitTargetMode }
  | { k: 'kite'; distance?: number }
  | { k: 'dodge-zones' }
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
  armorScale?: number;
  /** Boss-brain opportunism (AI_OVERHAUL §5/§6): 0..1, scales off-threat targeting. */
  aiDepth?: number;
  /** Encounter enrage timer (s); arms the boss phase-FSM enrage phase. */
  enrageSec?: number;
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
  | { t: 'cast'; uid: number; abilityId: string; vfx: VfxSpec; target?: number; point?: Vec2; sound?: SoundArchetype; timbre?: string }
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
  | { t: 'revive'; uid: number; pos: Vec2 }   // Aegis / Reincarnation: stand once
  | { t: 'item-used'; uid: number; itemId: string }
  | { t: 'loot-drop'; pos: Vec2; color: string; grade?: ItemGrade; signature?: boolean }
  | { t: 'gold'; amount: number; reason: string; pos?: Vec2 }
  | { t: 'xp'; uid: number; amount: number }
  | { t: 'bark'; uid: number; line: string }
  | { t: 'kill-credit'; victimUid: number; killerUid: number; bounty: { xp: number; gold: number }; lastHitByPlayer: boolean };

// ---------- Saved game ----------
export interface ItemSave {
  id: string;
  charges?: number;
  cooldownLeft?: number;
  quality?: ItemQuality;
  bound?: boolean;
  inscribedKills?: number;
  grade?: ItemGrade;
  gradeRoll?: number;
  affixes?: RolledAffix[];
  imprintedAffixId?: string;
  sockets?: (string | null)[];
  resolvedMods?: StatModMap;
  locked?: boolean;
}
export type HeroLoadoutSlots = (string | null)[];
export type ArmoryLoadouts = Record<string, Record<string, HeroLoadoutSlots>>;
export interface NeutralStashEntry {
  id: string;
  count: number;
  copies?: ItemSave[];
}
export interface DungeonProgressSave {
  clears: number;
  wipes: number;
  bestDepth: number;
  bestTier: DifficultyTier;
  lastTier?: DifficultyTier;
  lastModifiers?: string[];
  lastClearedAt?: number;
  /** Per-loot-slot dry streaks, persisted across runs so a guardian's pity actually accrues. */
  dryStreaks?: Record<string, number>;
  /** Deepest endless level cleared; gates how far the next endless descent may start. */
  bestEndlessLevel?: number;
}
export interface HeroSave {
  heroId: string;
  level: number;
  xp: number;
  items: (ItemSave | null)[];   // 6 slots
  neutralSlot: ItemSave | null;
  augments?: HeroAugments;
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
  dungeonProgress: Record<string, DungeonProgressSave>;
  eliteFive: { defeated: number; championDown: boolean };
  factionChoices: Record<string, string>;
  heldUniques: string[];
  neutralStash: NeutralStashEntry[];
  lootMarks: Record<LootBand, number>;
  lootFilter?: LootFilterSave;
  goldSinks: { buybacks: number; tomesUsed: number; respecs: number; gambleRolls: number; salvages: number };
  essence: number;
  loadouts: ArmoryLoadouts;
  reputation: number;                     // karma (Phase 6 §3.2), default 0
  codexUnlocks: string[];                 // entry ids revealed on encounter (§3.14)
  journalSeen: string[];                  // acknowledged journal entries (§3.14)
  stamina?: number;
  discovered?: string[];
  openedChests?: string[];
  collectedShards?: string[];
  solvedPuzzles?: string[];
  shardsTurnedIn?: Record<string, number>;
  explorationPct?: Record<string, number>;
  regionVisits?: Record<string, number>;
  resin?: number;
  resinUpdatedAt?: number;
  settings: { quickcast: boolean; resonance?: boolean; minimap?: boolean; audio: AudioSettings; graphics?: GraphicsSettings; cutscene?: CutsceneSettings };
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
