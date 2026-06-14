import { TUNING } from '../data/tuning';
import { DEFAULT_CREEP_DROP_TABLES, qualityOddsByTier } from '../data/creep-drops';
import { GRADE_UP_COSTS, IMPRINT_COSTS, MASTERWORK_COSTS, REFORGE_COSTS, REROLL_AFFIX_COSTS, addSocket, disenchant, gradeUp, imprintAffix, masterwork, reforge, refreshResolvedMods, socketAddCost, socketUnsocketCost } from '../data/forge';
import { affixDef, affixPoolForItem, rollAffixForKind, rollAffixesFor } from '../data/affixes';
import { fuseGems, gemDef, isGemId, socketsForDrop } from '../data/gems';
import { setBonusEffects } from '../data/sets';
import { tagBoonVfx } from '../data/tag-boons';
import { ITEM_GRADES, levelReq, percentileForGrade, rollGrade, statMultiplier, type GradeFloorSource } from '../data/grade';
import { QUALITY_GRADES, nextQuality, rarityColor, setColorblindPalette } from '../data/quality';
import { applyLootFilter, DEFAULT_LOOT_FILTER, type LootFilterRule } from './loot-filter';
import { REG } from '../core/registry';
import { buildAbilityCard } from '../core/describe';
import { Sim } from '../core/sim';
import { Unit } from '../core/unit';
import { applyElementAura } from '../core/combat';
import { execEffects } from '../core/effects';
import { autoPicksForLevel, buildHero } from '../core/hero-setup';
import { spawnHeroEchoUnit } from '../core/echo-unit';
import { TrialRunner, trialGateOpen, type TrialGateCtx, type TrialOutcome } from '../core/trials';
import { freshEchoProgress, normalizeEchoProgress, recordOwnedHeroEchoKill } from '../core/echo';
import { computeKillReward, overflowXpToGold, recruitLevelCap } from '../core/progression';
import {
  bossFightSetupFromDef,
  bossLootSeed,
  bossTierUnlocked,
  buybackCost,
  chooseFaction,
  creepCombatTier,
  dayNightMods,
  defaultPhase3SaveFields,
  draftTeams,
  enchantNeutralItem,
  instantiateDroppedItem,
  migratePhase3Save,
  rerollNeutralItem,
  respecCost,
  rollLoot,
  rollItemDrops,
  rollNeutralDrop,
  scaledBounty,
  stableContentSeed,
  tomePurchase,
  type LootRoll
} from '../core/phase3';
import { Rng } from '../core/rng';
import { defaultAudioSettings, defaultCutsceneSettings, defaultGraphicsSettings, defaultInterfaceSettings, defaultPhase4SaveFields } from '../core/phase4';
import { defaultPhase5SaveFields } from '../core/phase5';
import { higherDungeonTier, migratePhase6Save } from '../core/phase6';
import { dungeonDailySeed, dungeonWeeklySeed } from '../core/dungeon';
import { type QualityTier } from '../engine/performance';
import { mergeCreeps, newCreepInstanceId, validateEntourage } from '../core/capture';
import { computeBuyPlan, executeBuy, itemReady, itemSaveOf, itemStateFromSave, sellValue, sortInventory } from '../core/items';
import { runDomainEncounter, runRaidBattle, runRaidEncounter, runMacroBattle, type RaidEncounterResult } from '../core/macro';
import { ELITE_DRAFT } from '../data/drafts';
import { isActiveElement, reactionFor, resonanceMods, elementForHero } from '../core/resonance';
import { levelFromXp, xpForLevel } from '../core/stats';
import { abilityMaxLevel, abilityRankRequiredHeroLevel, autoAbilityLevels, canLearnAbilityRank, normalizeAbilityLevels } from '../core/values';
import { dist, fromAngle, norm, sub } from '../core/math2d';
import { circleBody, nearestPointOutsideCollisionBody, obstacleBlocksMovement } from '../core/collision';
import type { ActiveElement, ArmoryLoadouts, BossDef, CollisionObstacleInput, CreepTier, CreepInstanceSave, CutsceneDef, DifficultyTier, DishDef, DomainDef, DraftDef, DropSource, DungeonDef, DungeonModifierDef, DungeonProgressSave, DungeonRoom, EchoProgress, EchoSpawnDef, EffectNode, GambitRule, GameSave, GraphicsSettings, GroundItemDrop, HeroAugments, HeroLoadoutSlots, HeroSave, ItemDef, ItemDropTable, ItemGrade, ItemQuality, ItemRarity, ItemSave, ItemTier, LootBand, LoreEntryDef, MacroHeroSetup, NeutralItemDef, NeutralStashEntry, Order, QuestDef, QuestGiverDef, QuestKind, QuestProgress, QuestReward, QuestSave, QuestStatus, RaidDef, RegionDef, RolledAffix, RoomTemplate, RoomType, SeasonalEventDef, SimEvent, StingerId, StatModMap, StatusParams, ValueRef, Vec2, ZoneSpec } from '../core/types';
import { advance as questAdvance, chosenBranch as questChosenBranch, claim as questClaim, normalizeQuestSave, questGiverPos, refreshAvailability, type QuestContext, type QuestEvent } from '../core/quests';
import { migratePhase7Save } from '../core/phase7';
import { GROUND_LOOT_COLLISION } from '../data/world/props';
import { ProceduralAudio, type CinematicMixMode } from '../engine/audio';
import { CinematicDirector, type CinematicView, type CutsceneContext } from '../engine/cinematic';
import { StoryDetector, type StoryObserveCtx, type StoryTrigger } from '../engine/story-detectors';
import { GameScene } from '../engine/scene';
import { LiveGymFight, runGymMatch, type GymMatchHero, type GymMatchResult } from './macro-session';
import { LiveRaid } from './raid-session';
import { DungeonSession } from './dungeon-session';
import { isValidKeyBindings, normalizeKeyBindings } from './keybindings';

/** The Roshan raid — the only one that yields the Aegis, respawns on a timer, and re-drops cheese (§3.9). */
const ROSHAN_RAID_ID = 'roshan-pit';
const OUTWORLD_CLAIMANT_RAIDS = new Set([
  'renegade-marshal',
  'void-prelate',
  'queen-of-blades',
  'lord-of-terror',
  'prime-evil',
  'lord-of-hatred',
  'forsaken-queen'
]);
const CINEMATIC_STINGERS: ReadonlySet<StingerId> = new Set(['capture', 'merge', 'levelup', 'badge', 'raid-clear']);

/** Top-tier power that only drops from bosses/raids/dungeons — never vended by any shop or gold sink (§6). */
export const GATED_TOP_TIER: ReadonlySet<string> = new Set([
  'assault-cuirass', 'divine-rapier', 'butterfly', 'scythe-of-vyse', 'heart-of-tarrasque',
  'eye-of-skadi', 'refresher-orb', 'aghanims-scepter', 'lotus-orb', 'linkens-sphere',
  'manta-style', 'daedalus', 'monkey-king-bar', 'abyssal-blade', 'mjollnir',
  'bloodthorn', 'nullifier', 'radiance', 'satanic', 'helm-of-the-overlord',
  'gleipnir', 'wind-waker', 'octarine-core', 'aghanims-blessing', 'aghanims-shard',
  'aegis-of-the-immortal', 'refresher-shard', 'cheese'
]);

const RECRUIT_INTERACT_RANGE = 350;

const RARITY_RANK: Record<ItemRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  mythical: 3,
  legendary: 4,
  immortal: 5,
  arcana: 6
};
const MAIN_ITEM_TIERS = new Set(['t1', 't2', 't3', 't4']);
const MERCHANT_GRADES = ['worn', 'standard', 'sharp', 'refined'] as const;
type MerchantGrade = typeof MERCHANT_GRADES[number];
const GAMBLE_SLOTS = ['any', 'weapon', 'armor', 'caster', 'mobility'] as const;
type GambleSlot = typeof GAMBLE_SLOTS[number];

function isMainItemTier(tier: string): boolean {
  return MAIN_ITEM_TIERS.has(tier);
}

/** Ray-cast point-in-polygon test for overworld water zones (GAMEPLAY_OVERHAUL §3.3). */
function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function itemAllowedFromSource(itemId: string, source: DropSource): boolean {
  const def = REG.item(itemId);
  return !def.exclusiveTo || def.exclusiveTo.includes(source);
}

function shouldBindDroppedItem(id: string): boolean {
  const def = REG.item(id);
  const rarity = def.rarity ?? 'common';
  return GATED_TOP_TIER.has(id) || isMainItemTier(def.tier) || RARITY_RANK[rarity] >= RARITY_RANK.legendary;
}

function bindIfNeeded(item: ItemSave): ItemSave {
  return shouldBindDroppedItem(item.id) ? { ...item, bound: true } : { ...item };
}

// ------------------------------------------------------------------
// Overworld orchestration (SPEC layout: /src/systems/): party, swap,
// camps, capture/entourage, shop, shrine, day clock, save/load.
// ------------------------------------------------------------------

export const SAVE_VERSION = 8;
const SLOT_KEYS = ['ancients.save.1', 'ancients.save.2', 'ancients.save.3'];
const AUTO_KEY = 'ancients.save.auto';

export interface RosterEntry {
  heroId: string;
  level: number;
  xp: number;
  abilityLevels: number[];
  attributePoints: number;
  talentPicks: (0 | 1 | null)[];
  gambits: GambitRule[];
  echo: EchoProgress;
  facetIdx: number;
  hpPct: number;
  manaPct: number;
  items: (ItemSave | null)[];
  neutralSlot: ItemSave | null;
  augments: HeroAugments;
  abilityCooldowns: number[]; // remaining sec at serialize time
  benchedAt: number;          // game time at swap-out
  tagGaugeReadyAt: number;    // absolute sim time when this hero's Tag Gauge is ready
  respawnAt: number;          // 0 = alive
  lastCombatAt: number;
  fleshStacks?: Record<string, number>;
  dayNightMods: Record<string, number>;
  resonanceMods: Record<string, number>;
  neutralMods?: Record<string, number>; // currently-applied neutral-slot passive mods
  unit: Unit | null;
}

function cloneItemSave(item: ItemSave | null | undefined): ItemSave | null {
  return item
    ? {
        ...item,
        affixes: item.affixes?.map((affix) => ({ ...affix, resolved: { ...affix.resolved } })),
        sockets: item.sockets ? [...item.sockets] : undefined,
        resolvedMods: item.resolvedMods ? { ...item.resolvedMods } : undefined
      }
    : null;
}

function cloneGroundItemDrop(drop: GroundItemDrop): GroundItemDrop {
  return {
    ...drop,
    item: cloneItemSave(drop.item)!,
    pos: { ...drop.pos },
    body: drop.body ?? groundLootBody()
  };
}

function groundLootBody(): GroundItemDrop['body'] {
  return circleBody(GROUND_LOOT_COLLISION.radius, {
    layer: GROUND_LOOT_COLLISION.layer,
    blocksMovement: false,
    blocksProjectiles: GROUND_LOOT_COLLISION.blocksProjectiles,
    interactable: true,
    pickPadding: Math.round(GROUND_LOOT_COLLISION.radius * 0.18),
    feedback: { label: GROUND_LOOT_COLLISION.label, impactVfx: 'spark' }
  });
}

function normalizeSavedItems(items: (ItemSave | null)[] | undefined): (ItemSave | null)[] {
  const out: (ItemSave | null)[] = [null, null, null, null, null, null];
  (items ?? []).slice(0, TUNING.itemSlots).forEach((item, i) => {
    out[i] = cloneItemSave(item);
  });
  return out;
}

function pickedTalentCount(picks: (0 | 1 | null)[]): number {
  return picks.filter((p) => p !== null).length;
}

function defaultAbilityLevels(heroId: string, level: number): number[] {
  const def = REG.hero(heroId);
  return autoAbilityLevels(def, level, def.skillOrder);
}

function defaultAttributePoints(heroId: string, level: number, abilityLevels: number[], talentPicks: (0 | 1 | null)[]): number {
  return Math.max(0, level - abilityLevels.reduce((sum, n) => sum + n, 0) - pickedTalentCount(talentPicks));
}

function normalizeAttributePoints(heroId: string, level: number, abilityLevels: number[], talentPicks: (0 | 1 | null)[], points: number | undefined): number {
  const max = Math.max(0, TUNING.levelCap - REG.hero(heroId).abilities.reduce((sum, a) => sum + abilityMaxLevel(a), 0) - 4);
  const budget = Math.max(0, level - abilityLevels.reduce((sum, n) => sum + n, 0) - pickedTalentCount(talentPicks));
  return Math.min(max, budget, Math.max(0, Math.floor(points ?? defaultAttributePoints(heroId, level, abilityLevels, talentPicks))));
}

function cloneHeroSave(save: HeroSave): HeroSave {
  const talentPicks = [...save.talentPicks];
  const fallbackAbilityLevels = defaultAbilityLevels(save.heroId, save.level);
  const abilityLevels = normalizeAbilityLevels(REG.hero(save.heroId), save.abilityLevels ?? fallbackAbilityLevels, save.level);
  return {
    heroId: save.heroId,
    level: save.level,
    xp: save.xp,
    items: normalizeSavedItems(save.items),
    neutralSlot: cloneItemSave(save.neutralSlot),
    augments: { ...(save.augments ?? {}) },
    gambits: structuredClone(save.gambits ?? []),
    abilityLevels,
    attributePoints: normalizeAttributePoints(save.heroId, save.level, abilityLevels, talentPicks, save.attributePoints),
    talentPicks,
    echo: normalizeEchoProgress(save.echo),
    facetIdx: save.facetIdx,
    hpPct: save.hpPct,
    manaPct: save.manaPct,
    abilityCooldowns: [...save.abilityCooldowns],
    tagGaugeReadyAt: Math.max(0, save.tagGaugeReadyAt ?? 0),
    fleshStacks: save.fleshStacks ? { ...save.fleshStacks } : undefined
  };
}

function heroSaveFromRosterEntry(rec: RosterEntry, now: number): HeroSave {
  return {
    heroId: rec.heroId,
    level: rec.level,
    xp: rec.xp,
    items: rec.items.map(cloneItemSave),
    neutralSlot: cloneItemSave(rec.neutralSlot),
    augments: { ...rec.augments },
    gambits: structuredClone(rec.gambits),
    abilityLevels: [...rec.abilityLevels],
    attributePoints: rec.attributePoints,
    talentPicks: [...rec.talentPicks],
    echo: {
      kills: rec.echo.kills,
      facetSwapUnlocked: rec.echo.facetSwapUnlocked,
      talentTierUnlocks: [...rec.echo.talentTierUnlocks]
    },
    facetIdx: rec.facetIdx,
    hpPct: rec.hpPct,
    manaPct: rec.manaPct,
    abilityCooldowns: [...rec.abilityCooldowns],
    tagGaugeReadyAt: Math.max(0, rec.tagGaugeReadyAt - now),
    fleshStacks: rec.fleshStacks ? { ...rec.fleshStacks } : undefined
  };
}

function freshHeroSave(heroId: string, level = 1): HeroSave {
  const talentPicks: (0 | 1 | null)[] = [null, null, null, null];
  const abilityLevels = defaultAbilityLevels(heroId, level);
  return {
    heroId,
    level,
    xp: xpForLevel(level),
    items: [null, null, null, null, null, null],
    neutralSlot: null,
    augments: {},
    gambits: [],
    abilityLevels,
    attributePoints: defaultAttributePoints(heroId, level, abilityLevels, talentPicks),
    talentPicks,
    echo: freshEchoProgress(),
    facetIdx: 0,
    hpPct: 1,
    manaPct: 1,
    abilityCooldowns: [0, 0, 0, 0],
    tagGaugeReadyAt: 0
  };
}

export interface Toast {
  text: string;
  kind: 'info' | 'good' | 'bad' | 'bark';
  at: number;
  color?: string;   // optional accent (LOOT L6: rarity-tinted loot toasts)
}

/** Combat readability snapshot (COMBAT_OVERHAUL §3.4, C4). */
export interface CombatReadout {
  active: boolean;     // any combat readout is worth showing
  live: boolean;       // a live raid/gym session is running (full overlay)
  castBars: { uid: number; name: string; ability: string; pct: number; isUlt: boolean; enemy: boolean }[];
  bossThreat: { bossName: string; targetName: string | null; taunted: boolean } | null;
  sharedFocus: { uid: number; name: string } | null;
  ultReady: { uid: number; name: string }[];
  tagChain: { count: number; pct: number; ampPct: number } | null;
  offField: { count: number; names: string[] };
}

interface CampState {
  uids: number[];
  respawnAt: number; // 0 = alive/occupied
}

interface EchoState {
  uid: number | null;
  respawnAt: number;
}

function defaultQuestProgress(): QuestProgress {
  return { stage: 'unfound', attunement: 0, trialCompletions: 0 };
}

const NEUTRAL_ROLL_STATS = new Set<keyof StatModMap>([
  'damage',
  'armor',
  'str',
  'agi',
  'int',
  'maxHp',
  'maxMana',
  'attackSpeed',
  'hpRegen',
  'manaRegen',
  'moveSpeed'
]);

/** Neutral-slot passive mods as a flat record (auras/actives apply through their own systems). */
function neutralPassiveMods(neutral: ItemSave | string | null | undefined): Record<string, number> {
  if (!neutral) return {};
  const item = typeof neutral === 'string' ? { id: neutral } : neutral;
  const def = REG.neutralItem(item.id);
  const mods: Record<string, number> = def.passiveMods ? { ...(def.passiveMods as Record<string, number>) } : {};
  for (const [k, v] of Object.entries(item.resolvedMods ?? {})) {
    mods[k] = Math.round(((mods[k] ?? 0) + v) * 10) / 10;
  }
  return mods;
}

function neutralGradeFloor(difficulty: DifficultyTier): ItemGrade {
  if (difficulty === 'hell') return 'standard';
  if (difficulty === 'nightmare') return 'worn';
  return 'broken';
}

function neutralGradeMods(def: NeutralItemDef, grade: ItemGrade, gradeRoll: number): StatModMap {
  const mods: StatModMap = {};
  const mult = statMultiplier(percentileForGrade(grade, gradeRoll));
  for (const [key, value] of Object.entries(def.passiveMods ?? {}) as [keyof StatModMap, number][]) {
    if (!NEUTRAL_ROLL_STATS.has(key)) continue;
    const delta = Math.round(value * (mult - 1) * 10) / 10;
    if (delta !== 0) mods[key] = delta;
  }
  return mods;
}

function hasSignatureAffix(item: ItemSave): boolean {
  return (item.affixes ?? []).some((affix) => affixDef(affix.affixId).kind === 'signature');
}

function augmentMods(augments: HeroAugments | undefined): Record<string, number> {
  const mods: Record<string, number> = {};
  const add = (m: StatModMap) => {
    for (const [k, v] of Object.entries(m)) mods[k] = (mods[k] ?? 0) + v;
  };
  if (augments?.scepter) add({ str: 10, agi: 10, int: 10, maxHp: 175, maxMana: 175 });
  if (augments?.shard) add({ str: 3, agi: 3, int: 3, spellAmpPct: 4 });
  return mods;
}

function itemLevelRequirement(item: ItemDef, grade: ItemGrade = 'standard'): number {
  return item.levelReq ?? levelReq(item, grade);
}

export function newGameSave(starterHeroId: string): GameSave {
  const region = REG.region('tranquil-vale');
  const phase3 = defaultPhase3SaveFields();
  const phase5 = defaultPhase5SaveFields(0);
  return {
    version: SAVE_VERSION,
    name: REG.hero(starterHeroId).name,
    createdAt: Date.now(),
    savedAt: Date.now(),
    playtimeSec: 0,
    worldSeed: region.seed,
    dayTime: 0.06, // just after dawn
    gold: TUNING.startingGold,
    regionId: region.id,
    playerPos: { x: region.town.pos.x, y: region.town.pos.y + 500 },
    party: [starterHeroId],
    activeIdx: 0,
    roster: [
      {
        heroId: starterHeroId,
        level: 1,
        xp: 0,
        items: [null, null, null, null, null, null],
        neutralSlot: null,
        augments: {},
        abilityLevels: defaultAbilityLevels(starterHeroId, 1),
        attributePoints: 0,
        talentPicks: [null, null, null, null],
        gambits: [],
        echo: freshEchoProgress(),
        facetIdx: 0,
        hpPct: 1,
        manaPct: 1,
        abilityCooldowns: [0, 0, 0, 0],
        tagGaugeReadyAt: 0
      }
    ],
    stash: [],
    caught: [],
    fielded: [],
    recruited: [starterHeroId],
    badges: [],
    questProgress: {},
    quests: {},
    defeatedGyms: [],
    echoRespawn: {},
    campRespawn: {},
    loadouts: {},
    dungeonProgress: {},
    ...phase3,
    ...defaultPhase4SaveFields(),
    ...phase5,
    explorationPct: { [region.id]: 0 },
    regionVisits: { [region.id]: 1 },
    discovered: ['tv-waypoint-dawnshade'],
    settings: { quickcast: true, resonance: true, minimap: true, keyBindings: normalizeKeyBindings(undefined), audio: defaultAudioSettings(), graphics: defaultGraphicsSettings(), cutscene: defaultCutsceneSettings(), interface: defaultInterfaceSettings() }
  };
}

function migrateTagGaugeSave(s: GameSave | { version: number; [k: string]: unknown }): GameSave {
  const base = migratePhase7Save(s as GameSave);
  return {
    ...base,
    version: SAVE_VERSION,
    roster: base.roster.map((hero) => ({
      ...hero,
      tagGaugeReadyAt: Math.max(0, typeof hero.tagGaugeReadyAt === 'number' ? hero.tagGaugeReadyAt : 0)
    }))
  };
}

/** Map the user's graphics-quality choice to a concrete render tier. 'auto'
 *  reads the device (cores + DPR); the runtime perf budget can still downshift. */
export function resolveQuality(q: GraphicsSettings['quality'] | undefined): QualityTier {
  if (q && q !== 'auto') return q;
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  if (cores >= 8 && dpr >= 1.5) return 'ultra';
  if (cores >= 4) return 'high';
  return 'medium';
}

/** The slice of GameScene the orchestrator calls; lets tests run headless. */
/** Per-frame view-model for a walking quest giver: where it is now and whether
 *  it has anything to offer, so the renderer can place a marker + indicator. */
export interface QuestGiverView {
  id: string;
  name: string;
  x: number;
  y: number;
  hasClaimable: boolean;   // at least one quest ready to claim (pulse the marker)
  hasActive: boolean;      // at least one active/available quest (show a soft tag)
}

export interface SceneLike {
  selectedUid: number;
  terrain: { obstacles: CollisionObstacleInput[] };
  groundHeightAt?(simX: number, simY: number): number;
  centerOn?(point: Vec2): void;
  pushEvent(ev: SimEvent, sim: Sim): void;
  update(sim: Sim, followUnit: Unit | null, renderDt: number, timeOfDay01: number, cinematicView?: CinematicView | null, groundItems?: readonly GroundItemDrop[]): void;
  pick?(clientX: number, clientY: number, sim: Sim, groundItems?: readonly GroundItemDrop[]): { uid?: number; itemUid?: number; ground?: Vec2 };
  resetUnitViews?(): void;
  setDungeonRoom?(template: RoomTemplate | null, room?: DungeonRoom | null): void;
  showOrderFeedback?(point: Vec2, kind: 'move' | 'attack-move' | 'attack-unit', queued?: boolean): void;
  /** Optional (real GameScene only, §8): a standalone location ping flare. */
  showPing?(point: Vec2): void;
  /** Optional (real GameScene only, §8): recenter the camera on a point. */
  lookAt?(point: Vec2, holdSec?: number): void;
  /** Optional (real GameScene only, §8): cancel an active free-look. */
  clearLook?(): void;
  /** Optional (real GameScene only, §8): current view corners in sim coords. */
  viewBoundsSim?(): Vec2[];
  /** Optional (real GameScene only): place/move the walking quest-giver NPCs (QUEST.md). */
  syncQuestGivers?(givers: readonly QuestGiverView[]): void;
  /** Optional (real GameScene only): live graphics-settings hooks (§6). */
  setQuality?(tier: QualityTier): void;
  setGraphics?(g: Partial<GraphicsSettings>): void;
  /** Optional (real GameScene only): pre-compile shaders behind a loading screen. */
  prewarm?(): void;
  dispose?(): void;
}

/** Resolve the world position a sim event sounds from, for positional audio.
 *  Events that carry a `pos`/`point` use it directly; unit-keyed events look the
 *  unit up in the owning sim. Returns undefined when there's nothing to place
 *  (UI/global cues), which leaves the cue centered at full volume. */
export function eventWorldPos(ev: SimEvent, sim: Sim): Vec2 | undefined {
  switch (ev.t) {
    case 'projectile-hit':
    case 'projectile-block':
    case 'projectile-expire':
    case 'movement-blocked':
    case 'invalid-target':
    case 'aoe-burst':
    case 'summon':
    case 'revive':
    case 'zone-spawn':
      return ev.pos;
    case 'cast':
      return ev.point
        ?? (ev.target != null ? sim.unit(ev.target)?.pos : undefined)
        ?? sim.unit(ev.uid)?.pos;
    case 'attack-impact':
    case 'miss':
      return sim.unit(ev.target)?.pos ?? sim.unit(ev.uid)?.pos;
    case 'blink':
      return ev.to ?? ev.from;
    case 'capture-start':
    case 'capture-complete':
    case 'capture-interrupt':
      return sim.unit(ev.target)?.pos;
    case 'damage':
    case 'attack-launch':
    case 'heal':
    case 'status-apply':
    case 'tag-boon':
    case 'tag-chain':
    case 'off-field':
    case 'immune-block':
    case 'death':
    case 'bark':
      return sim.unit(ev.uid)?.pos;
    default:
      return undefined;
  }
}

function scaleValueRef(ref: ValueRef | undefined, amp: number): ValueRef | undefined {
  return typeof ref === 'number' ? ref * amp : ref;
}

function scaleValueRecord(mods: Record<string, ValueRef> | undefined, amp: number): Record<string, ValueRef> | undefined {
  if (!mods) return undefined;
  return Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, scaleValueRef(v, amp)!]));
}

function scaleStatusParams(params: StatusParams | undefined, amp: number): StatusParams | undefined {
  if (!params) return undefined;
  return {
    ...params,
    mods: scaleValueRecord(params.mods, amp),
    dotDps: scaleValueRef(params.dotDps, amp),
    moveSlowPct: scaleValueRef(params.moveSlowPct, amp),
    attackSlowPct: scaleValueRef(params.attackSlowPct, amp),
    periodic: params.periodic
      ? { ...params.periodic, effects: scaleTagEffects(params.periodic.effects, amp) }
      : undefined
  };
}

function scaleZoneSpec(zone: ZoneSpec, amp: number): ZoneSpec {
  return {
    ...zone,
    tick: zone.tick ? { ...zone.tick, effects: scaleTagEffects(zone.tick.effects, amp) } : undefined,
    auraMods: zone.auraMods ? { ...zone.auraMods, mods: scaleValueRecord(zone.auraMods.mods, amp) ?? {} } : undefined,
    onEnter: zone.onEnter ? { ...zone.onEnter, effects: scaleTagEffects(zone.onEnter.effects, amp) } : undefined
  };
}

function scaleTagEffect(node: EffectNode, amp: number): EffectNode {
  switch (node.kind) {
    case 'damage':
      return {
        ...node,
        amount: scaleValueRef(node.amount, amp)!,
        perUnitBonus: scaleValueRef(node.perUnitBonus, amp),
        attackDamagePct: scaleValueRef(node.attackDamagePct, amp)
      };
    case 'heal':
      return { ...node, amount: scaleValueRef(node.amount, amp)! };
    case 'mana':
      return { ...node, amount: scaleValueRef(node.amount, amp)! };
    case 'status':
      return { ...node, duration: node.duration, params: scaleStatusParams(node.params, amp) };
    case 'statmod':
      return { ...node, mods: scaleValueRecord(node.mods, amp) ?? node.mods };
    case 'zone':
      return { ...node, zone: scaleZoneSpec(node.zone, amp) };
    case 'projectile':
      return { ...node, proj: { ...node.proj, onHit: scaleTagEffects(node.proj.onHit, amp) } };
    case 'repeat':
      return { ...node, effects: scaleTagEffects(node.effects, amp) };
    default:
      return node;
  }
}

function scaleTagEffects(effects: EffectNode[], amp: number): EffectNode[] {
  if (Math.abs(amp - 1) < 0.0001) return effects;
  return effects.map((effect) => scaleTagEffect(effect, amp));
}

/** The slice of ProceduralAudio the orchestrator calls. */
export interface AudioLike {
  setSettings(settings: GameSave['settings']): void;
  handleEvent(ev: SimEvent, at?: Vec2): void;
  playUi?(kind: 'hover' | 'click' | 'open' | 'close' | 'error' | 'ready' | 'heartbeat' | 'tab'): void;
  playStinger(id: StingerId): void;
  setCinematicMix?(mode: CinematicMixMode): void;
  playDialogueBlip?(seed?: string): void;
  update?(env: { biome: string; dayTime: number; inCombat: boolean; dt: number }): void;
  /** Toggle the sampled-audio enhancement layer (medium+ tiers). */
  enableSampledAudio?(on: boolean): void;
  /** Listener (followed hero) world position for positional panning. */
  setListener?(pos: Vec2 | null): void;
  dispose?(): void;
}

/** No-op scene for headless (test/CI) runs — no WebGL, no DOM. */
export class HeadlessScene implements SceneLike {
  selectedUid = -1;
  terrain = { obstacles: [] as CollisionObstacleInput[] };
  groundHeightAt(): number { return 0; }
  pushEvent(): void {}
  update(): void {}
  pick(): { uid?: number; itemUid?: number; ground?: Vec2 } { return {}; }
  resetUnitViews(): void {}
  setDungeonRoom(): void {}
  // Control/camera hooks the InputController calls directly (it is typed against
  // the real GameScene). No-ops keep the ?hud=1 headless control path from
  // throwing when the HUD is mounted over the headless scene for e2e tests.
  clearCastPreview(): void {}
  setCastPreview(): void {}
  showOrderFeedback(): void {}
  zoomBy(): void {}
  toggleCameraMode(): void {}
}

/** No-op audio for headless runs. */
export class HeadlessAudio implements AudioLike {
  setSettings(): void {}
  handleEvent(): void {}
  playUi(): void {}
  playStinger(): void {}
  setCinematicMix(): void {}
  playDialogueBlip(): void {}
  update(): void {}
}

export interface GameDeps {
  scene?: SceneLike;
  audio?: AudioLike;
}

export class Game {
  sim: Sim;
  scene: GameScene;
  audio: ProceduralAudio;
  region: RegionDef;

  gold = 0;
  dayTime = 0.06;
  playtime = 0;

  party: RosterEntry[] = [];
  /** Saved records for recruited heroes outside the fielded party. */
  private benchRoster = new Map<string, HeroSave>();
  activeIdx = 0;
  swapReadyAt = 0;
  // §8.3 swap-cancel grace: a swap pressed during the active hero's cast point is
  // queued here and flushed once the cast fires, so the input never eats a cast.
  private pendingSwapIdx: number | null = null;
  private pendingSwapAt = 0;

  caught: CreepInstanceSave[] = [];
  fielded: string[] = [];
  /** caught instance uid -> live sim uid */
  fieldedUnits = new Map<string, number>();
  recruited = new Set<string>();
  /** npc sim uid -> heroId */
  private npcHeroes = new Map<number, string>();
  /** echo sim uid -> region echo spawn id */
  private echoHeroes = new Map<number, string>();
  /** binding-duel sim uid -> heroId */
  private bindingHeroes = new Map<number, string>();
  private heroDropVictims = new Set<number>();
  /** Pending Reroll Affix preview at the Forge (ITEM_REHAUL §12.2): paid-for candidate the player can keep or reroll again. */
  private rerollPreview: { stashIdx: number; affixIdx: number; itemId: string; baseAffixId: string; candidate: RolledAffix } | null = null;
  badges = new Set<string>();
  questProgress: Record<string, QuestProgress> = {};
  quests: Record<string, QuestSave> = {};
  defeatedGyms = new Set<string>();
  difficulty: GameSave['difficulty'] = {};
  inventoryStash: ItemSave[] = [];
  groundItemDrops: GroundItemDrop[] = [];
  private nextGroundItemUid = 1;
  raidProgress: GameSave['raidProgress'] = {};
  dungeonProgress: GameSave['dungeonProgress'] = {};
  eliteFive: GameSave['eliteFive'] = { defeated: 0, championDown: false };
  factionChoices: Record<string, string> = {};
  heldUniques: string[] = [];
  neutralStash: GameSave['neutralStash'] = [];
  lootMarks: GameSave['lootMarks'] = { early: 0, mid: 0, late: 0 };
  lootFilter: LootFilterRule = { ...DEFAULT_LOOT_FILTER };
  goldSinks: GameSave['goldSinks'] = { buybacks: 0, tomesUsed: 0, respecs: 0, gambleRolls: 0, salvages: 0 };
  essence = 0;
  loadouts: ArmoryLoadouts = {};
  reputation = 0;
  codexUnlocks = new Set<string>();
  journalSeen = new Set<string>();
  stamina = TUNING.traversal.staminaMax;
  discovered = new Set<string>();
  openedChests = new Set<string>();
  collectedShards = new Set<string>();
  solvedPuzzles = new Set<string>();
  shardsTurnedIn: Record<string, number> = {};
  explorationPct: Record<string, number> = {};
  regionVisits: Record<string, number> = {};
  resin = TUNING.resin.max;
  resinUpdatedAt = 0;
  sprintHeld = false;
  private sprintModUid = -1;
  private weatherNextAt = 0;
  // verticality & traversal (GAMEPLAY_OVERHAUL §3.3, G3)
  private heroTier = 0;                 // active hero's current elevation tier (index into region.elevation.tiers)
  private traversal: { kind: 'climb' | 'glide'; t: number; dur: number; fromTier: number; toTier: number } | null = null;
  private swimModUid = -1;
  private lastSafePos: Vec2 | null = null;
  private dashReadyAt = 0;
  private staminaRegenReadyAt = 0;
  private carriedElement: { element: ActiveElement; until: number } | null = null;
  private puzzleProgress = new Map<string, { lit: Set<number>; startedAt: number }>();

  /** active recruitment trial (Phase 6 §3.1) */
  activeTrial: TrialRunner | null = null;
  private activeTrialHeroId: string | null = null;
  private activeTrialNpcUid: number | null = null;
  private pendingRecruitNpcUid: number | null = null;
  /** heroId -> how many times its trial has relocated (cycles relocateSpots) */
  private trialRelocations = new Map<string, number>();

  private camps = new Map<string, CampState>();
  private eliteCreepUids = new Set<number>();
  private echoes = new Map<string, EchoState>();
  private accumulator = 0;
  /** Unscaled real-time clock, used for the loot slow-motion micro-pause window (ITEM_REHAUL §13.2). */
  private realClock = 0;
  private lootSlowmoUntil = 0;
  private autosaveAt = TUNING.autosaveSec;
  private wasInTown = false;
  private faintTickAt = 0;
  private createdAt = 0;
  private queuedOrders: Order[] = [];
  private lastErrorCueAt = 0;
  private tagChainCount = 0;
  private tagChainExpiresAt = 0;
  private tagChainAmpPct = 0;

  /** Active live gym fight (§3.5): when set, update() steps + renders it instead of the overworld. */
  liveGym: LiveGymFight | null = null;
  private liveGymId: string | null = null;
  liveRaid: LiveRaid | null = null;
  private liveRaidId: string | null = null;
  private liveRaidTier: DifficultyTier = 'normal';
  private liveRaidClears = 0;
  private liveRaidAegis = false;
  liveDungeon: DungeonSession | null = null;
  private liveDungeonId: string | null = null;
  private liveDungeonTier: DifficultyTier = 'normal';
  private liveDungeonModifiers: string[] = [];
  cinematic = new CinematicDirector();
  private cinematicSoundBeatKey = '';
  private cinematicDialogueBeatKey = '';
  private cinematicMixMode: CinematicMixMode = 'normal';
  private pendingAfterCinematic: { label: string; run: () => void } | null = null;
  private story = new StoryDetector();
  /** HUD hook: open the gym pre-fight screen (§3.5). Null in headless. */
  onOpenGymPrefight: ((gymId: string) => void) | null = null;
  onOpenDungeonEntry: ((dungeonId: string) => void) | null = null;
  onOpenQuestGiver: ((giverId: string) => void) | null = null;

  toasts: Toast[] = [];
  /** events the HUD wants this frame (damage floaters, gold, barks) */
  frameEvents: SimEvent[] = [];
  private queuedPresentationEvents: SimEvent[] = [];
  private lastBlockedMoveFeedbackAt = -999;
  paused = false;

  /** Headless game for tests/CI: no WebGL scene, no audio. */
  static headless(save: GameSave, opts: { cinematics?: boolean } = {}): Game {
    const headlessSave = opts.cinematics ? save : structuredClone(save);
    if (!opts.cinematics) {
      headlessSave.settings = {
        ...headlessSave.settings,
        cutscene: {
          ...defaultCutsceneSettings(),
          ...headlessSave.settings.cutscene,
          length: 'off',
          alwaysSkip: true
        }
      };
    }
    return new Game(null, headlessSave, { scene: new HeadlessScene(), audio: new HeadlessAudio() });
  }

  constructor(canvas: HTMLCanvasElement | null, save: GameSave, deps?: GameDeps) {
    this.region = REG.region(save.regionId);
    this.scene = (deps?.scene ?? new GameScene(canvas as HTMLCanvasElement, this.region, resolveQuality(save.settings.graphics?.quality))) as unknown as GameScene;
    this.audio = (deps?.audio ?? new ProceduralAudio(this.settings)) as unknown as ProceduralAudio;
    this.sim = new Sim({
      seed: save.worldSeed,
      bounds: { w: this.region.size, h: this.region.size },
      obstacles: this.scene.terrain.obstacles
    });

    this.gold = save.gold;
    this.dayTime = save.dayTime;
    this.playtime = save.playtimeSec;
    this.createdAt = save.createdAt;
    this.caught = save.caught.map((c) => ({ ...c }));
    this.recruited = new Set(save.recruited);
    this.badges = new Set(save.badges);
    this.questProgress = Object.fromEntries(
      Object.entries(save.questProgress).map(([id, q]) => [id, { ...defaultQuestProgress(), ...q }])
    );
    this.quests = {};
    for (const [id, q] of Object.entries(save.quests ?? {})) {
      if (REG.questDefs.has(id)) this.quests[id] = normalizeQuestSave(REG.questDef(id), q);
    }
    this.defeatedGyms = new Set(save.defeatedGyms);
    this.difficulty = structuredClone(save.difficulty);
    this.inventoryStash = save.inventoryStash.map((i) => cloneItemSave(i)!);
    this.groundItemDrops = (save.groundItemDrops ?? []).map(cloneGroundItemDrop);
    this.nextGroundItemUid = this.groundItemDrops.reduce((max, drop) => Math.max(max, drop.uid + 1), 1);
    this.raidProgress = structuredClone(save.raidProgress);
    this.dungeonProgress = structuredClone(save.dungeonProgress ?? {});
    this.eliteFive = { ...save.eliteFive };
    this.factionChoices = { ...save.factionChoices };
    this.heldUniques = [...save.heldUniques];
    this.neutralStash = save.neutralStash.map((n) => ({ ...n, copies: n.copies?.map((item) => cloneItemSave(item)!) }));
    const savedLootMarks = save.lootMarks as Partial<Record<LootBand, number>> | undefined;
    this.lootMarks = {
      early: savedLootMarks?.early ?? 0,
      mid: savedLootMarks?.mid ?? 0,
      late: savedLootMarks?.late ?? 0
    };
    this.lootFilter = { ...DEFAULT_LOOT_FILTER, ...(save.lootFilter ?? {}) };
    this.loadouts = structuredClone(save.loadouts ?? {});
    this.goldSinks = {
      buybacks: save.goldSinks.buybacks ?? 0,
      tomesUsed: save.goldSinks.tomesUsed ?? 0,
      respecs: save.goldSinks.respecs ?? 0,
      gambleRolls: save.goldSinks.gambleRolls ?? 0,
      salvages: save.goldSinks.salvages ?? 0
    };
    this.essence = save.essence ?? 0;
    this.reputation = save.reputation ?? 0;
    this.codexUnlocks = new Set(save.codexUnlocks ?? []);
    this.journalSeen = new Set(save.journalSeen ?? []);
    this.stamina = Math.max(0, Math.min(TUNING.traversal.staminaMax + 1000, save.stamina ?? TUNING.traversal.staminaMax));
    this.discovered = new Set(save.discovered ?? []);
    this.openedChests = new Set(save.openedChests ?? []);
    this.collectedShards = new Set(save.collectedShards ?? []);
    this.solvedPuzzles = new Set(save.solvedPuzzles ?? []);
    this.shardsTurnedIn = { ...(save.shardsTurnedIn ?? {}) };
    this.explorationPct = { ...(save.explorationPct ?? {}) };
    this.regionVisits = { ...(save.regionVisits ?? {}) };
    this.regionVisits[this.region.id] = Math.max(1, this.regionVisits[this.region.id] ?? 1);
    this.resin = Math.max(0, Math.min(TUNING.resin.max, save.resin ?? TUNING.resin.max));
    this.resinUpdatedAt = save.resinUpdatedAt ?? save.playtimeSec;
    this.regenResinToPlaytime();
    this.codexUnlocks.add('region:' + this.region.id); // standing in a region is the encounter (§3.14)

    const partyIds = new Set(save.party);
    this.benchRoster = new Map(
      save.roster
        .filter((hs) => !partyIds.has(hs.heroId))
        .map((hs) => [hs.heroId, cloneHeroSave(hs)])
    );

    this.party = save.party.map((heroId) => {
      const hs = save.roster.find((r) => r.heroId === heroId)!;
      const talentPicks = [...hs.talentPicks];
      const fallbackAbilityLevels = defaultAbilityLevels(heroId, hs.level);
      const abilityLevels = normalizeAbilityLevels(REG.hero(heroId), hs.abilityLevels ?? fallbackAbilityLevels, hs.level);
      return {
        heroId,
        level: hs.level,
        xp: hs.xp,
        abilityLevels,
        attributePoints: normalizeAttributePoints(heroId, hs.level, abilityLevels, talentPicks, hs.attributePoints),
        talentPicks,
        gambits: [...(hs.gambits ?? [])],
        echo: normalizeEchoProgress(hs.echo),
        facetIdx: hs.facetIdx,
        hpPct: hs.hpPct,
        manaPct: hs.manaPct,
        items: hs.items.map(cloneItemSave),
        neutralSlot: cloneItemSave(hs.neutralSlot),
        augments: { ...(hs.augments ?? {}) },
        abilityCooldowns: [...hs.abilityCooldowns],
        benchedAt: 0,
        tagGaugeReadyAt: Math.max(0, hs.tagGaugeReadyAt ?? 0),
        respawnAt: 0,
        lastCombatAt: -999,
        fleshStacks: hs.fleshStacks ? { ...hs.fleshStacks } : undefined,
        dayNightMods: {},
        resonanceMods: {},
        unit: null
      };
    });
    this.activeIdx = Math.min(save.activeIdx, this.party.length - 1);

    // world
    this.spawnCamps(save.campRespawn);
    this.spawnEchoes(save.echoRespawn);
    this.spawnRecruitNpcs();

    // active hero
    const rec = this.party[this.activeIdx];
    const u = this.spawnHeroFromRecord(rec, save.playerPos);
    rec.unit = u;
    this.sim.playerActiveUid = u.uid;
    this.scene.selectedUid = u.uid;
    this.refreshDayNightMods(true);

    // entourage
    for (const instUid of save.fielded) {
      this.fieldCreep(instUid, true);
    }

    this.settings = {
      quickcast: save.settings.quickcast,
      resonance: save.settings.resonance ?? false,
      minimap: save.settings.minimap ?? true,
      keyBindings: normalizeKeyBindings(save.settings.keyBindings),
      audio: { ...defaultAudioSettings(), ...save.settings.audio },
      graphics: { ...defaultGraphicsSettings(), ...save.settings.graphics },
      cutscene: { ...defaultCutsceneSettings(), ...save.settings.cutscene },
      interface: { ...defaultInterfaceSettings(), ...save.settings.interface }
    };
    this.sim.resonanceEnabled = this.settings.resonance ?? false;
    this.audio.setSettings(this.settings);
    this.audio.enableSampledAudio?.(resolveQuality(this.settings.graphics?.quality) !== 'low');
    this.refreshResonanceMods(true);
    this.applyGraphics();
    this.applyCutsceneSettings();
    if (save.playtimeSec === 0 && this.region.id === 'tranquil-vale') this.playCutscene('prologue-moon-breaks');
    this.playRegionArrival();

    // Quests (QUEST.md): unlock anything whose prereq is already met, then count
    // "reach this region" since entering a region constructs a fresh Game.
    this.refreshQuests();
    this.advanceQuests({ kind: 'reach-region', amount: 1, regionId: this.region.id, targetId: this.region.id });
  }

  settings: GameSave['settings'] = { quickcast: true, resonance: true, minimap: true, keyBindings: normalizeKeyBindings(undefined), audio: defaultAudioSettings(), graphics: defaultGraphicsSettings(), cutscene: defaultCutsceneSettings(), interface: defaultInterfaceSettings() };

  // ---------- helpers ----------

  activeUnit(): Unit | null {
    return this.party[this.activeIdx]?.unit ?? null;
  }

  staminaMax(): number {
    const bonus = Math.max(0, this.activeUnit()?.stats.staminaBonus ?? 0);
    return TUNING.traversal.staminaMax + bonus;
  }

  /** Sim currently receiving player input: overworld by default, live sub-sim during live fights. */
  inputSim(): Sim {
    return this.liveGym?.sim ?? this.liveRaid?.sim ?? this.liveDungeon?.sim ?? this.sim;
  }

  /** Unit currently driven by player input. Null in a live gym until a Captain's Call is active. */
  controlledUnit(): Unit | null {
    if (this.liveGym) return this.liveGym.playerDrivenUnit();
    if (this.liveRaid) return this.liveRaid.drivenUnit();
    if (this.liveDungeon) return this.liveDungeon.drivenUnit();
    return this.activeUnit();
  }

  tagReactionPreview(idx: number): { reaction: string; targetName: string; elements: [ActiveElement, ActiveElement] } | null {
    if (!this.settings.resonance) return null;
    const rec = this.party[idx];
    const active = this.activeUnit();
    if (!rec || !active || idx === this.activeIdx) return null;
    if (this.sim.time < rec.tagGaugeReadyAt) return null;
    const element = REG.hero(rec.heroId).tagBoon?.element;
    if (!isActiveElement(element)) return null;
    const enemies = this.sim.unitsInRadius(active.pos, 900, (u) => u.team !== active.team && u.kind !== 'npc' && !u.summary.untargetable);
    for (const enemy of enemies) {
      for (const existing of Object.keys(enemy.elementAuras) as ActiveElement[]) {
        const aura = enemy.elementAuras[existing];
        if (!aura || aura.until <= this.sim.time || existing === element) continue;
        const reaction = reactionFor(existing, element);
        if (reaction) return { reaction: reaction.id, targetName: enemy.name, elements: [existing, element] };
      }
    }
    return null;
  }

  /**
   * Combat readability snapshot (COMBAT_OVERHAUL §3.4, C4): the facts the HUD turns
   * into cast bars, a boss aggro/threat marker, the shared-focus indicator, and the
   * "ult ready → seize" Captain's Call prompt. Pure read over the active sim — it never
   * changes a combat result, so the determinism tests stay green.
   */
  combatReadout(): CombatReadout {
    const sim = this.inputSim();
    const now = sim.time;
    const driven = this.controlledUnit();
    const playerTeam = driven?.team ?? this.activeUnit()?.team ?? 0;

    const castBars: CombatReadout['castBars'] = [];
    let boss: Unit | null = null;
    for (const u of sim.unitsArr) {
      if (!u.alive) continue;
      if (u.team !== playerTeam && u.ctrl.kind === 'boss') boss = u;
      const cast = u.cast;
      if (cast && cast.fireAt > now) {
        const def = u.abilities[cast.slot]?.def;
        const cp = def?.castPoint ?? 0.3;
        const pct = cp > 0 ? Math.max(0, Math.min(1, 1 - (cast.fireAt - now) / cp)) : 1;
        castBars.push({
          uid: u.uid,
          name: u.name,
          ability: def?.name ?? 'Casting',
          pct,
          isUlt: cast.source === 'ability' && cast.slot === 3,
          enemy: u.team !== playerTeam
        });
      }
    }
    // enemy ults first, then enemies, then the rest — the bars the player most needs
    castBars.sort((a, b) => Number(b.enemy && b.isUlt) - Number(a.enemy && a.isUlt) || Number(b.enemy) - Number(a.enemy));

    let bossThreat: CombatReadout['bossThreat'] = null;
    if (boss) {
      let target = boss.attackTargetUid >= 0 ? sim.unit(boss.attackTargetUid) : undefined;
      if ((!target || !target.alive) && boss.windupTargetUid >= 0) target = sim.unit(boss.windupTargetUid);
      bossThreat = {
        bossName: boss.name,
        targetName: target && target.alive ? target.name : null,
        taunted: boss.summary.taunted !== null
      };
    }

    let sharedFocus: CombatReadout['sharedFocus'] = null;
    const focusUid = sim.teamMind(playerTeam).focusUid;
    if (focusUid !== null) {
      const f = sim.unit(focusUid);
      if (f && f.alive) sharedFocus = { uid: f.uid, name: f.name };
    }

    const ultReady: CombatReadout['ultReady'] = [];
    for (const u of sim.unitsArr) {
      if (!u.alive || u.team !== playerTeam || u.kind !== 'hero') continue;
      const ult = u.abilities[3];
      if (ult && ult.level > 0 && u.abilityReady(3, now).ok) {
        ultReady.push({ uid: u.uid, name: u.name });
      }
    }

    const tagRemaining = Math.max(0, this.tagChainExpiresAt - now);
    const tagWindow = Math.max(0.5, TUNING.tagChainWindowSec);
    const tagChain: CombatReadout['tagChain'] = this.tagChainCount > 0 && tagRemaining > 0
      ? { count: this.tagChainCount, pct: Math.min(1, tagRemaining / tagWindow), ampPct: this.tagChainAmpPct }
      : null;
    const offFieldNames = sim.unitsArr
      .filter((u) => u.alive && u.team === playerTeam && u.kind === 'hero' && (u.offFieldUntil ?? 0) > now)
      .map((u) => u.name);

    return {
      active: !!(this.liveRaid || this.liveGym || this.liveDungeon) || this.inCombat(),
      live: !!(this.liveRaid || this.liveGym),
      castBars,
      bossThreat,
      sharedFocus,
      ultReady,
      tagChain,
      offField: { count: offFieldNames.length, names: offFieldNames }
    };
  }

  private partyEntryByHeroId(heroId: string): RosterEntry | undefined {
    return this.party.find((rec) => rec.heroId === heroId);
  }

  private heroSnapshot(heroId: string): HeroSave | null {
    const rec = this.partyEntryByHeroId(heroId);
    if (rec) {
      if (rec.unit) this.serializeHero(rec);
      return heroSaveFromRosterEntry(rec, this.sim.time);
    }
    const saved = this.benchRoster.get(heroId);
    return saved ? cloneHeroSave(saved) : null;
  }

  private allOwnedHeroSaves(): HeroSave[] {
    const fielded = this.party.map((rec) => {
      if (rec.unit) this.serializeHero(rec);
      return heroSaveFromRosterEntry(rec, this.sim.time);
    });
    const fieldedIds = new Set(fielded.map((h) => h.heroId));
    const benched = [...this.benchRoster.values()]
      .filter((h) => !fieldedIds.has(h.heroId))
      .map(cloneHeroSave);
    return [...fielded, ...benched];
  }

  private setHeroItems(heroId: string, items: (ItemSave | null)[]): boolean {
    const next = normalizeSavedItems(items);
    const rec = this.partyEntryByHeroId(heroId);
    if (rec) {
      const states = next.map((it) => (it ? itemStateFromSave(it, this.sim.time) : null));
      const sorted = sortInventory(states);
      if (rec.unit) {
        rec.unit.items = sorted;
        rec.unit.markStatsDirty();
        rec.unit.markVisualDirty();
        rec.unit.refresh(this.sim.time);
        rec.items = rec.unit.items.map((it) => itemSaveOf(it, this.sim.time));
      } else {
        rec.items = sorted.map((it) => itemSaveOf(it, this.sim.time));
      }
      return true;
    }

    const saved = this.benchRoster.get(heroId);
    if (!saved) return false;
    const states = next.map((it) => (it ? itemStateFromSave(it, this.sim.time) : null));
    saved.items = sortInventory(states).map((it) => itemSaveOf(it, this.sim.time));
    this.benchRoster.set(heroId, cloneHeroSave(saved));
    return true;
  }

  private clampDropPos(pos: Vec2): Vec2 {
    const sim = this.inputSim();
    return {
      x: Math.max(0, Math.min(sim.bounds.w, pos.x)),
      y: Math.max(0, Math.min(sim.bounds.h, pos.y))
    };
  }

  private scatterDropPos(origin: Vec2, ordinal: number): Vec2 {
    if (ordinal === 0) return this.clampDropPos(origin);
    const angle = (this.nextGroundItemUid + ordinal) * 2.399963229728653;
    const radius = 55 + (ordinal % 3) * 28;
    const offset = fromAngle(angle, radius);
    return this.clampDropPos({ x: origin.x + offset.x, y: origin.y + offset.y });
  }

  visibleGroundItemDrops(): readonly GroundItemDrop[] {
    const context: GroundItemDrop['context'] = this.liveDungeon ? 'dungeon' : 'overworld';
    return this.groundItemDrops.filter((drop) => (drop.context ?? 'overworld') === context);
  }

  spawnGroundItems(items: ItemSave[], pos: Vec2, opts: { source?: GroundItemDrop['source']; context?: GroundItemDrop['context']; visual?: boolean } = {}): GroundItemDrop[] {
    const context = opts.context ?? (this.liveDungeon ? 'dungeon' : 'overworld');
    const drops = items.map((item, i): GroundItemDrop => ({
      uid: this.nextGroundItemUid++,
      item: bindIfNeeded(cloneItemSave(item)!),
      pos: this.scatterDropPos(pos, i),
      body: groundLootBody(),
      source: opts.source,
      context,
      createdAt: Math.round(this.playtime)
    }));
    this.groundItemDrops.push(...drops);
    if (opts.visual !== false && drops.length > 0) {
      this.emitPresentationEvent({
        t: 'loot-drop',
        pos: { ...drops[0].pos },
        color: this.dropAccent(drops.map((drop) => drop.item)) ?? rarityColor(this.itemRarity(drops[0].item.id)),
        grade: drops[0].item.grade,
        signature: drops.some((drop) => hasSignatureAffix(drop.item))
      });
    }
    return drops.map(cloneGroundItemDrop);
  }

  private recordItemAcquired(item: ItemSave): void {
    this.codexUnlock('item:' + item.id);
    if (GATED_TOP_TIER.has(item.id) && !this.heldUniques.includes(item.id)) this.heldUniques.push(item.id);
    this.playItemFirstHold(item.id);
  }

  private addItemToActiveHero(item: ItemSave): boolean {
    const u = this.activeUnit();
    if (!u) return false;
    const free = u.items.findIndex((slot) => slot === null);
    if (free < 0) {
      this.msg('Inventory full', 'bad');
      return false;
    }
    u.items[free] = itemStateFromSave(item, this.sim.time);
    u.items = sortInventory(u.items);
    u.markStatsDirty();
    u.markVisualDirty();
    u.refresh(this.sim.time);
    const rec = this.party[this.activeIdx];
    if (rec) rec.items = u.items.map((slot) => itemSaveOf(slot, this.sim.time));
    this.recordItemAcquired(item);
    return true;
  }

  pickupGroundItem(uid: number): boolean {
    const idx = this.groundItemDrops.findIndex((drop) => drop.uid === uid);
    if (idx < 0) return false;
    const drop = this.groundItemDrops[idx];
    const u = this.activeUnit();
    if (!u) return false;

    const filtered = drop.source === 'inventory'
      ? { kept: [cloneItemSave(drop.item)!], suppressed: [] as ItemSave[], disenchanted: [] as { item: ItemSave; essence: number }[] }
      : applyLootFilter([bindIfNeeded(cloneItemSave(drop.item)!)], (item) => this.itemRarity(item.id), this.lootFilter);
    const acquired = [...filtered.kept, ...filtered.suppressed];
    const freeSlots = u.items.filter((slot) => slot === null).length;
    if (acquired.length > freeSlots) {
      this.msg('Inventory full', 'bad');
      return false;
    }

    this.groundItemDrops.splice(idx, 1);
    for (const junk of filtered.disenchanted) {
      this.essence += junk.essence;
      this.goldSinks.salvages += 1;
    }
    if (filtered.disenchanted.length > 0) {
      const essence = filtered.disenchanted.reduce((sum, junk) => sum + junk.essence, 0);
      this.msg(`Loot filter disenchanted ${filtered.disenchanted.length} item${filtered.disenchanted.length === 1 ? '' : 's'} (+${essence} essence)`, 'info');
    }

    for (const item of acquired) this.addItemToActiveHero(item);
    if (filtered.kept.length > 0) {
      this.awardLootMarksForItems(filtered.kept);
      this.lootMoment(filtered.kept);
    }
    if (acquired.length > 0) {
      const names = acquired.map((item) => REG.item(item.id).name).join(', ');
      this.msg(`Picked up ${names}`, 'good', this.dropAccent(acquired));
    }
    return acquired.length > 0 || filtered.disenchanted.length > 0;
  }

  dropHeroItemToGround(invSlot: number, pos?: Vec2): boolean {
    const u = this.activeUnit();
    if (!u) return false;
    const it = u.items[invSlot];
    if (!it) return false;
    const saved = itemSaveOf(it, this.sim.time);
    if (!saved) return false;
    u.items[invSlot] = null;
    u.items = sortInventory(u.items);
    u.markStatsDirty();
    u.markVisualDirty();
    u.refresh(this.sim.time);
    const rec = this.party[this.activeIdx];
    if (rec) rec.items = u.items.map((slot) => itemSaveOf(slot, this.sim.time));
    const dropPos = pos ? this.clampDropPos(pos) : this.scatterDropPos(u.pos, 1);
    this.spawnGroundItems([saved], dropPos, { source: 'inventory', visual: false });
    this.msg(`Dropped ${REG.item(saved.id).name}`, 'info', this.dropAccent([saved]));
    return true;
  }

  private setHeroAugments(heroId: string, augments: HeroAugments): boolean {
    const rec = this.partyEntryByHeroId(heroId);
    if (rec) {
      rec.augments = { ...augments };
      if (rec.unit) this.rebuildHeroUnit(this.party.indexOf(rec));
      return true;
    }
    const saved = this.benchRoster.get(heroId);
    if (!saved) return false;
    saved.augments = { ...augments };
    this.benchRoster.set(heroId, cloneHeroSave(saved));
    return true;
  }

  private cleanLoadoutName(name: string): string {
    const trimmed = name.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 32) : 'Default';
  }

  private cloneLoadoutSlots(slots: HeroLoadoutSlots): HeroLoadoutSlots {
    const out: HeroLoadoutSlots = [null, null, null, null, null, null];
    slots.slice(0, TUNING.itemSlots).forEach((id, i) => {
      out[i] = typeof id === 'string' && REG.items.has(id) ? id : null;
    });
    return out;
  }

  heroLoadout(heroId: string, name = 'Default'): HeroLoadoutSlots | null {
    const slots = this.loadouts[heroId]?.[this.cleanLoadoutName(name)];
    return slots ? this.cloneLoadoutSlots(slots) : null;
  }

  saveHeroLoadout(heroId: string, name = 'Default'): boolean {
    const hero = this.heroSnapshot(heroId);
    if (!hero) return false;
    const loadoutName = this.cleanLoadoutName(name);
    this.loadouts[heroId] = { ...(this.loadouts[heroId] ?? {}) };
    this.loadouts[heroId][loadoutName] = normalizeSavedItems(hero.items).map((it) => it?.id ?? null);
    this.msg(`Saved ${REG.hero(heroId).name}'s ${loadoutName} loadout`, 'good');
    return true;
  }

  clearHeroLoadout(heroId: string, name = 'Default'): boolean {
    const loadoutName = this.cleanLoadoutName(name);
    if (!this.loadouts[heroId]?.[loadoutName]) return false;
    delete this.loadouts[heroId][loadoutName];
    if (Object.keys(this.loadouts[heroId]).length === 0) delete this.loadouts[heroId];
    this.msg(`Cleared ${REG.hero(heroId).name}'s ${loadoutName} loadout`, 'info');
    return true;
  }

  loadoutConflicts(name = 'Default'): { itemId: string; requested: number; owned: number; claimedBy: string[] }[] {
    const loadoutName = this.cleanLoadoutName(name);
    const requested = new Map<string, string[]>();
    for (const [heroId, byName] of Object.entries(this.loadouts)) {
      const slots = byName[loadoutName];
      if (!slots) continue;
      for (const id of slots) {
        if (!id) continue;
        const claimants = requested.get(id) ?? [];
        claimants.push(heroId);
        requested.set(id, claimants);
      }
    }

    const owned = new Map<string, number>();
    const count = (it: ItemSave | null) => {
      if (!it?.bound) return;
      owned.set(it.id, (owned.get(it.id) ?? 0) + 1);
    };
    this.inventoryStash.forEach(count);
    this.allOwnedHeroSaves().forEach((hero) => hero.items.forEach(count));

    return [...requested.entries()]
      .filter(([id, claimants]) => claimants.length > (owned.get(id) ?? 0))
      .map(([itemId, claimedBy]) => ({ itemId, requested: claimedBy.length, owned: owned.get(itemId) ?? 0, claimedBy }));
  }

  armoryView(): {
    stash: ItemSave[];
    heroes: { heroId: string; name: string; level: number; fielded: boolean; items: (ItemSave | null)[]; augments: HeroAugments; loadouts: string[]; conflicts: string[] }[];
    conflicts: { itemId: string; requested: number; owned: number; claimedBy: string[] }[];
    essence: number;
    lootFilter: LootFilterRule;
  } {
    const conflicts = this.loadoutConflicts();
    return {
      stash: this.inventoryStash.map((it) => cloneItemSave(it)!),
      heroes: this.allOwnedHeroSaves().map((hero) => ({
        heroId: hero.heroId,
        name: REG.hero(hero.heroId).name,
        level: hero.level,
        fielded: this.party.some((rec) => rec.heroId === hero.heroId),
        items: hero.items.map(cloneItemSave),
        augments: { ...(hero.augments ?? {}) },
        loadouts: Object.keys(this.loadouts[hero.heroId] ?? {}),
        conflicts: conflicts.filter((c) => c.claimedBy.includes(hero.heroId)).map((c) => c.itemId)
      })),
      conflicts,
      essence: this.essence,
      lootFilter: { ...this.lootFilter }
    };
  }

  setLootFilter(next: Partial<LootFilterRule>): void {
    const clean = { ...this.lootFilter, ...next };
    this.lootFilter = {
      minGrade: ITEM_GRADES.includes(clean.minGrade) ? clean.minGrade : DEFAULT_LOOT_FILTER.minGrade,
      minRarity: clean.minRarity in RARITY_RANK ? clean.minRarity : DEFAULT_LOOT_FILTER.minRarity,
      autoDisenchantBelowGrade: clean.autoDisenchantBelowGrade && ITEM_GRADES.includes(clean.autoDisenchantBelowGrade) ? clean.autoDisenchantBelowGrade : undefined,
      autoDisenchantBelowRarity: clean.autoDisenchantBelowRarity && clean.autoDisenchantBelowRarity in RARITY_RANK ? clean.autoDisenchantBelowRarity : undefined
    };
    this.msg('Loot filter updated', 'info');
  }

  /** Select a player-side gym hero by party slot for the next Captain's Call. */
  selectLiveGymHero(idx: number): boolean {
    if (!this.liveGym) return false;
    if (this.liveGym.playerCaptain.activeUid !== null) {
      this.msg('Captain Call already active', 'bad');
      return false;
    }
    const hero = this.liveGym.playerHeroes()[idx];
    if (!hero || !hero.alive) return false;
    this.scene.selectedUid = hero.uid;
    this.liveGym.sim.playerActiveUid = hero.uid;
    this.msg(`${hero.name} primed for Captain Call`, 'info');
    return true;
  }

  /** Select a specific player-side gym unit for the next Captain's Call. */
  selectLiveGymUnit(uid: number): boolean {
    if (!this.liveGym) return false;
    const u = this.liveGym.sim.unit(uid);
    if (!u || !u.alive || u.team !== 0) return false;
    this.scene.selectedUid = u.uid;
    this.liveGym.sim.playerActiveUid = u.uid;
    return true;
  }

  selectLiveRaidHero(idx: number): boolean {
    if (!this.liveRaid) return false;
    const ok = this.liveRaid.selectDriver(idx);
    const u = this.liveRaid.drivenUnit();
    if (ok && u) {
      this.scene.selectedUid = u.uid;
      this.msg(`Driving ${u.name}`, 'info');
    }
    return ok;
  }

  selectLiveDungeonHero(idx: number): boolean {
    if (!this.liveDungeon) return false;
    const ok = this.liveDungeon.selectDriver(idx);
    const u = this.liveDungeon.drivenUnit();
    if (ok && u) {
      this.scene.selectedUid = u.uid;
      this.msg(`Driving ${u.name}`, 'info');
    }
    return ok;
  }

  setSprintHeld(held: boolean): void {
    this.sprintHeld = held;
  }

  private regenResinToPlaytime(): void {
    const elapsed = Math.max(0, this.playtime - this.resinUpdatedAt);
    if (elapsed <= 0) return;
    this.resin = Math.min(TUNING.resin.max, this.resin + elapsed * TUNING.resin.regenPerSec);
    this.resinUpdatedAt = this.playtime;
  }

  private spendResinForLoot(cost: number): boolean {
    if (!TUNING.resin.enabled || cost <= 0) return true;
    this.regenResinToPlaytime();
    if (this.resin < cost) return false;
    this.resin -= cost;
    this.resinUpdatedAt = this.playtime;
    return true;
  }

  private dryLootGold(items: ItemSave[]): number {
    const value = items.reduce((sum, it) => sum + sellValue(REG.item(it.id)), 0);
    return Math.round(value * TUNING.resin.dryLootGoldPct);
  }

  private grantDryLootGold(items: ItemSave[], reason: string, pos?: Vec2): number {
    const gold = this.dryLootGold(items);
    if (gold > 0) this.awardGold(gold, reason, pos, true);
    return gold;
  }

  explorationFor(regionId = this.region.id): number {
    return this.explorationPct[regionId] ?? this.computeExplorationPct(regionId);
  }

  private computeExplorationPct(regionId: string): number {
    const region = REG.region(regionId);
    const total =
      (region.waypoints?.length ?? 0) +
      (region.chests?.length ?? 0) +
      (region.shards?.length ?? 0) +
      (region.discoveries?.length ?? 0) +
      (region.elementPuzzles?.length ?? 0);
    if (total <= 0) return 0;
    let done = 0;
    for (const w of region.waypoints ?? []) if (this.discovered.has(w.id)) done++;
    for (const c of region.chests ?? []) if (this.openedChests.has(c.id)) done++;
    for (const s of region.shards ?? []) if (this.collectedShards.has(s.id)) done++;
    for (const d of region.discoveries ?? []) if (this.discovered.has(d.id)) done++;
    for (const p of region.elementPuzzles ?? []) if (this.solvedPuzzles.has(p.id)) done++;
    const pct = Math.round((done / total) * 100);
    this.explorationPct[regionId] = pct;
    return pct;
  }

  msg(text: string, kind: Toast['kind'] = 'info', color?: string): void {
    this.toasts.push({ text, kind, at: performance.now() / 1000, color });
    if (this.toasts.length > 60) this.toasts.splice(0, this.toasts.length - 60);
    // A blocked/invalid action buzzes (§11). Throttled so a burst of 'bad'
    // toasts (e.g. repeated illegal orders) never machine-guns the UI bus.
    if (kind === 'bad') {
      const now = performance.now();
      if (now - this.lastErrorCueAt > 140) {
        this.lastErrorCueAt = now;
        this.audio.playUi?.('error');
      }
    }
  }

  private cutsceneSeenKey(id: string, ctx: CutsceneContext): string {
    const scoped = (suffix: unknown) => `cinematic:${id}:${String(suffix)}`;
    if (id === 'bind-stinger' && ctx.hero) return scoped(ctx.hero);
    if (id === 'echo-milestone-stinger' && ctx.hero) return scoped(ctx.hero);
    if (id === 'trial-dialogue-stinger' && ctx.trial) return scoped(ctx.trial);
    if ((id === 'boss-phase-stinger' || id === 'boss-clear-stinger') && ctx.boss) return scoped(ctx.boss);
    if (id === 'raid-clear-stinger' && ctx.raid) return scoped(ctx.raid);
    if (id === 'item-chase-first-hold' && ctx.item) return scoped(ctx.item);
    return `cinematic:${id}`;
  }

  private cutsceneToastLine(def: CutsceneDef, ctx: CutsceneContext): string {
    const template = def.beats.find((b) => b.line)?.line?.text ?? def.title;
    return template.replace(/\{([a-zA-Z0-9_-]+)\}/g, (_, key: string) => String(ctx[key] ?? ''));
  }

  playCutscene(id: string, ctx: CutsceneContext = {}): boolean {
    const def = REG.cutscenes.get(id);
    if (!def) return false;
    const seenKey = this.cutsceneSeenKey(id, ctx);
    const seen = this.journalSeen.has(seenKey);
    this.journalSeen.add(seenKey);
    // §4.3: a bark, or any tier fully suppressed by settings, routes its line as a toast so
    // the information still reaches the player; only the staging is withheld.
    if (def.tier === 'bark' || this.cinematic.routesToToast(def)) {
      const line = this.cutsceneToastLine(def, ctx);
      if (line) this.msg(line, 'bark');
      return true;
    }
    // §3.4: repeat views still play, but the director starts them at the repeat speed
    // and Esc skips instantly. Full 1x replay remains available from the gallery.
    this.cinematic.play(def, ctx, seen);
    return true;
  }

  /** Push the live cut-scene controls (length/speed/always-skip + reduced-motion) to the director. */
  applyCutsceneSettings(): void {
    const c = this.settings.cutscene ?? defaultCutsceneSettings();
    const reducedMotion = this.settings.graphics?.reducedMotion ?? false;
    this.cinematic.setSettings({
      length: c.length,
      defaultSpeed: c.defaultSpeed,
      alwaysSkip: c.alwaysSkip,
      reducedMotion,
      photosensitive: c.photosensitive
    });
  }

  cinematicAdvance(): void {
    this.cinematic.advance();
  }

  cinematicRequestSkip(): void {
    this.cinematic.requestSkip();
  }

  cinematicReleaseSkip(): void {
    this.cinematic.releaseSkip();
  }

  cinematicSkip(): void {
    this.cinematic.skip();
  }

  cinematicFastForward(active: boolean): void {
    this.cinematic.setFastForward(active);
  }

  private playPresentationStinger(id: StingerId, opts: { cinematic?: boolean } = {}): void {
    // STORY §4.4: a narrative beat owns the peak while it is active. Gameplay
    // fanfares still surface as toasts/messages; their audio waits for another moment.
    if (this.cinematic.active && !opts.cinematic) return;
    this.audio.playStinger(id);
  }

  private applyCinematicMix(mode: CinematicMixMode): void {
    if (this.cinematicMixMode === mode) return;
    this.cinematicMixMode = mode;
    this.audio.setCinematicMix?.(mode);
  }

  private cinematicPresentationView(): CinematicView | null {
    const view = this.cinematic.view();
    if (!view) {
      this.cinematicSoundBeatKey = '';
      this.cinematicDialogueBeatKey = '';
      this.applyCinematicMix('normal');
      return null;
    }
    const mix = view.music === 'silence' ? 'silence' : view.music ? 'duck' : 'normal';
    this.applyCinematicMix(mix);
    if (view.beatKey !== this.cinematicSoundBeatKey) {
      this.cinematicSoundBeatKey = view.beatKey;
      if (view.sound && CINEMATIC_STINGERS.has(view.sound as StingerId)) {
        this.playPresentationStinger(view.sound as StingerId, { cinematic: true });
      }
    }
    if (view.speaker && view.beatKey !== this.cinematicDialogueBeatKey) {
      this.cinematicDialogueBeatKey = view.beatKey;
      this.audio.playDialogueBlip?.(view.speaker);
    }
    return view;
  }

  private isHeadless(): boolean {
    return this.scene instanceof HeadlessScene;
  }

  private queueAfterCinematic(label: string, run: () => void): boolean {
    if (this.isHeadless() || !this.cinematic.active) return false;
    if (this.pendingAfterCinematic) {
      this.msg(`${this.pendingAfterCinematic.label} is already waiting on a cut-scene`, 'info');
      return true;
    }
    this.pendingAfterCinematic = { label, run };
    this.msg(`${label} will begin when the cut-scene ends.`, 'info');
    return true;
  }

  private runPendingAfterCinematic(): void {
    if (this.cinematic.active || !this.pendingAfterCinematic) return;
    const pending = this.pendingAfterCinematic;
    this.pendingAfterCinematic = null;
    pending.run();
  }

  /**
   * STORY §6.6 + §7.3 — feed a live combat event batch to the story detectors and fire any
   * matched beats. Pure read of the sim; never writes sim state (determinism-safe).
   */
  private observeStory(events: readonly SimEvent[], ctx: Omit<StoryObserveCtx, 'nowSec' | 'playerTeam'>): void {
    const triggers = this.story.observe(events, { ...ctx, nowSec: this.playtime, playerTeam: 0 });
    for (const trig of triggers) this.fireStoryTrigger(trig);
  }

  private fireStoryTrigger(trig: StoryTrigger): void {
    if (trig.kind === 'legend') {
      this.triggerLegendCallout(trig.legendId);
      return;
    }
    if (trig.kind === 'resonance') {
      const seenKey = 'story:first-resonance';
      if (!this.journalSeen.has(seenKey)) {
        this.journalSeen.add(seenKey);
        this.playCutscene('resonance-first-reaction', {
          reaction: trig.reaction,
          echoLine: `${trig.reaction} reaction: the wars you carry have learned to answer each other.`
        });
      }
      return;
    }
    // §6.6 boss phase break. Raid anchors get a directed beat first, then fall back to
    // the generic stinger on repeats or if the encounter is not tied to a raid.
    const bossName = trig.bossHeroId ? REG.hero(trig.bossHeroId).name : 'The boss';
    const bossLine = trig.bossHeroId ? this.bossStoryLine(trig.bossHeroId, 1) : 'You pushed it past something. Now it is serious.';
    if (trig.raidId) {
      const directedId =
        trig.raidId === 'void-prelate' ? 'void-prelate-phase-break' :
        trig.raidId === 'last-eldwurm' ? 'last-eldwurm-phase-break' :
        `raid-phase-${trig.raidId}`;
      if (REG.cutscenes.has(directedId) && !this.journalSeen.has(`cinematic:${directedId}`)) {
        this.playCutscene(directedId, { boss: bossName });
        return;
      }
    }
    this.playCutscene('boss-phase-stinger', { boss: bossName, bossLine });
  }

  private bossStoryLine(heroId: string, index: number): string | undefined {
    return [...REG.bosses.values()].find((b) => b.heroId === heroId)?.dialogue[index];
  }

  private bossPhaseThresholdsForBossId(bossId: string): number[] {
    return REG.bosses.get(bossId)?.phases?.map((phase) => phase.atHpPct) ?? [];
  }

  private raidPhaseThresholds(raidId: string): number[] {
    const raid = REG.raid(raidId);
    const thresholds = [
      ...raid.addWaves.map((wave) => wave.atHpPct),
      ...raid.zones.map((zone) => zone.atHpPct),
      ...(raid.signatureExotic ? [50] : [])
    ];
    return [...new Set(thresholds)].sort((a, b) => b - a);
  }

  private playRegionArrival(): void {
    const id = this.region.arrivalBeat;
    if (!id || this.journalSeen.has(`cinematic:${id}`)) return;
    this.playCutscene(id);
  }

  private playItemFirstHold(itemId: string): void {
    const item = REG.item(itemId);
    const prestige = RARITY_RANK[item.rarity ?? 'common'] >= RARITY_RANK.legendary || GATED_TOP_TIER.has(itemId);
    if (!prestige) return;
    const seenKey = `story:item-first-hold:${itemId}`;
    if (this.journalSeen.has(seenKey)) return;
    this.journalSeen.add(seenKey);
    this.codexUnlock('item:' + itemId);
    const sceneId = itemId === 'aegis-of-the-immortal' || itemId === 'divine-rapier'
      ? `item-${itemId}-first-hold`
      : 'item-chase-first-hold';
    this.playCutscene(sceneId, { item: item.name, itemLore: item.lore });
  }

  private playRaidIntroSetpieces(raidId: string, raidName: string): void {
    if (OUTWORLD_CLAIMANT_RAIDS.has(raidId) && !this.journalSeen.has('story:outworld-first-contact')) {
      this.journalSeen.add('story:outworld-first-contact');
      this.playCutscene('outworld-first-contact', { claimant: raidName });
    }
    this.playCutscene(`raid-intro-${raidId}`, { raid: raidName });
  }

  private recordOutworldClaimantClear(raidId: string): void {
    if (!OUTWORLD_CLAIMANT_RAIDS.has(raidId)) return;
    this.codexUnlock('claimant:' + raidId);
    const allCleared = [...OUTWORLD_CLAIMANT_RAIDS].every((id) => this.codexUnlocks.has('claimant:' + id) || id === raidId);
    if (allCleared && !this.codexUnlocks.has('claimants:all')) {
      this.codexUnlock('claimants:all');
      this.playCutscene('outworld-all-clear');
    }
  }

  private playRaidClearBeat(raidId: string, raidName: string): void {
    const directedId = `raid-clear-${raidId}`;
    if (REG.cutscenes.has(directedId)) this.playCutscene(directedId, { raid: raidName });
    else this.playCutscene('raid-clear-stinger', { raid: raidName });
  }

  private activeFestival: string | null = null;
  private seasonalModeTarget(event: SeasonalEventDef): { kind: 'raid' | 'dungeon'; id: string; mode: SeasonalEventDef['mode']; rules: string; mechanics: string[]; endless?: boolean; maxSec?: number; modifiers?: string[] } {
    switch (event.mode) {
      case 'roshan-candy':
        return { kind: 'raid', id: 'roshan-pit', mode: event.mode, maxSec: 150, mechanics: ['candy tribute timer', 'Roshan pressure', 'Roshling-style add waves'], rules: 'Candy tribute: feed-or-flee pressure around Roshan, with the Pit treated as a hungry clock.' };
      case 'wave-defense':
        return event.id === 'dark-moon-hunt'
          ? { kind: 'raid', id: 'forsaken-queen', mode: event.mode, maxSec: 150, mechanics: ['moonlit pressure timer', 'banshee lane hold'], rules: 'Night defense: survive the moonlit pressure window under a banshee-cold raid clock.' }
          : { kind: 'dungeon', id: 'frost-hollow', mode: event.mode, maxSec: 210, modifiers: ['frozen-oath', 'packed-halls'], mechanics: ['altar timer', 'packed waves', 'forced frozen elites'], rules: 'Wraith-Night altar defense: packed halls, frozen oath, and a hard survival timer stand in for the thirteen-wave siege.' };
      case 'endless-descent':
        return { kind: 'dungeon', id: 'severed-dark', mode: event.mode, endless: true, modifiers: ['deep-map'], mechanics: ['endless room chain', 'deeper routing', 'choice exits'], rules: 'Continuum descent: endless rooms and choice exits make the next room feel beside yesterday.' };
      case 'damage-race':
        return { kind: 'raid', id: 'last-eldwurm', mode: event.mode, maxSec: 90, mechanics: ['short enrage clock', 'single boss burn'], rules: 'Damage race: beat the boss before the cycle closes.' };
      case 'linear-crawl':
        return { kind: 'raid', id: 'renegade-marshal', mode: event.mode, mechanics: ['campaign route', 'single staged boss'], rules: 'Linear crawl: one staged campaign fight, no repeat reward until clear.' };
      case 'hazard-survival':
        return { kind: 'dungeon', id: 'ember-caldera', mode: event.mode, maxSec: event.id === 'nemestice-fall' ? 210 : 180, modifiers: event.id === 'nemestice-fall' ? ['single-life', 'packed-halls'] : ['single-life'], mechanics: event.id === 'nemestice-fall' ? ['falling-shard clock', 'single life', 'packed hazards'] : ['collapsing clock', 'single life'], rules: 'Hazard survival: single-life pressure with a collapsing clock.' };
      case 'act-trials':
        return { kind: 'dungeon', id: 'worldstone-vault', mode: event.mode, modifiers: ['champion-sigil', 'deep-map'], mechanics: ['act-structured rooms', 'champion sigils', 'deeper map'], rules: 'Act trials: deeper map and champion sigils frame the festival as a mini-arc.' };
    }
    return { kind: 'raid', id: 'roshan-pit', mode: event.mode, mechanics: ['fallback rite'], rules: 'Festival rite.' };
  }

  /** True if this festival's underlying mode can launch right now (full party, in region, not busy). */
  festivalLaunchable(eventId: string): boolean {
    const event = REG.seasonalEvents.get(eventId);
    if (!event || this.liveGym || this.liveRaid || this.liveDungeon || this.party.length < 5) return false;
    const map = this.seasonalModeTarget(event);
    if (map.kind === 'raid') return map.id !== ROSHAN_RAID_ID || (this.raidProgress[map.id]?.roshanRespawnAt ?? 0) <= this.playtime;
    return REG.dungeon(map.id).regionId === this.region.id;
  }

  seasonalEventStatus(eventId: string): { launchable: boolean; target: string; detail: string } {
    const event = REG.seasonalEvents.get(eventId);
    if (!event) return { launchable: false, target: 'Unknown', detail: 'Unknown festival.' };
    const map = this.seasonalModeTarget(event);
    const target = map.kind === 'raid'
      ? `Raid · ${REG.raid(map.id).name}${map.maxSec ? ` · ${map.maxSec}s rite` : ''}`
      : `${map.endless ? 'Endless dungeon' : 'Dungeon'} · ${REG.dungeon(map.id).name}${map.maxSec ? ` · ${map.maxSec}s rite` : ''}`;
    if (this.liveGym || this.liveRaid || this.liveDungeon) return { launchable: false, target, detail: 'Finish the current fight first.' };
    if (this.party.length < 5) return { launchable: false, target, detail: 'Requires a full party of 5 heroes.' };
    if (map.kind === 'raid') {
      if (map.id === ROSHAN_RAID_ID) {
        const at = this.raidProgress[map.id]?.roshanRespawnAt ?? 0;
        if (at > this.playtime) return { launchable: false, target, detail: `Roshan returns in ${Math.ceil(at - this.playtime)}s.` };
      }
      return { launchable: true, target, detail: `Ready. ${map.rules} Mechanics: ${map.mechanics.join(', ')}.` };
    }
    const dungeon = REG.dungeon(map.id);
    if (dungeon.regionId !== this.region.id) {
      return { launchable: false, target, detail: `Travel to ${REG.region(dungeon.regionId).name}.` };
    }
    const mods = map.modifiers?.length
      ? ` · ${map.modifiers.map((id) => dungeon.modifiers?.find((m) => m.id === id)?.name ?? id).join(', ')}`
      : '';
    return { launchable: true, target, detail: `Ready${mods}. ${map.rules} Mechanics: ${map.mechanics.join(', ')}.` };
  }

  private grantFestivalReward(event: SeasonalEventDef): void {
    if (event.reward.kind === 'gold') this.awardGold(event.reward.amount ?? 0, 'festival', this.activeUnit()?.pos ?? this.region.town.pos, true);
    else if (event.reward.kind === 'loot-mark') this.awardLootMarks(event.reward.amount ?? 1);
  }

  /** Launch the festival's existing-system session driver (raid/dungeon) when playable. */
  private launchSeasonalMode(event: SeasonalEventDef): boolean {
    const map = this.seasonalModeTarget(event);
    if (!this.festivalLaunchable(event.id)) return false;
    const ok = map.kind === 'raid'
      ? this.startLiveRaid(map.id, 'normal', { maxSec: map.maxSec, festivalMode: map.mode })
      : this.startDungeon(map.id, 'normal', { endless: map.endless, maxSec: map.maxSec, modifiers: map.modifiers, festivalMode: map.mode });
    return ok;
  }

  /** A festival reward pays out on completing its mode; clears the active-festival flag. */
  private completeActiveFestival(cleared: boolean): void {
    if (!this.activeFestival) return;
    const event = REG.seasonalEvents.get(this.activeFestival);
    this.activeFestival = null;
    if (!event || !cleared) return;
    this.grantFestivalReward(event);
    this.msg(`${event.name}: ${event.reward.label} earned`, 'good');
  }

  runSeasonalEvent(eventId: string): boolean {
    const event = REG.seasonalEvents.get(eventId);
    if (!event) return false;
    if (this.settings.cutscene?.tieIns === false) {
      this.msg('Seasonal and esports tie-ins are disabled in cut-scene settings.', 'info');
      return false;
    }
    this.codexUnlock('festival:' + event.id);
    this.playCutscene(event.cutsceneId, { event: event.name });
    // §7.5: festivals are new drivers over the existing raid/dungeon session machinery. Launch
    // the mode when playable. Rewards pay on clear, never merely for invoking the story wrapper.
    if (this.launchSeasonalMode(event)) {
      this.activeFestival = event.id;
      this.msg(`${event.name} begins — clear it to earn the ${event.reward.label}.`, 'info');
    } else {
      this.msg(this.seasonalEventStatus(event.id).detail, 'bad');
    }
    this.autosave('festival');
    return true;
  }

  triggerLegendCallout(legendId: string): boolean {
    const legend = REG.legends.get(legendId);
    if (this.settings.cutscene?.tieIns === false) return false;
    if (!legend || this.codexUnlocks.has('legend:' + legend.id)) return false;
    this.codexUnlock('legend:' + legend.id);
    this.playCutscene(legend.cutsceneId, { legend: legend.name });
    this.msg(`Legend remembered: ${legend.name}`, 'good');
    return true;
  }

  // ---------- STORY §8: the cinematics gallery ----------

  /** Readable fallback tokens so a gallery replay never renders a half-empty `{token}`. */
  private replayContext(def: { id: string }): CutsceneContext {
    const rapier = REG.items.get('divine-rapier');
    return {
      hero: 'Your champion', heroId: undefined, bark: 'It remembers you now.',
      badge: 'an act', boss: 'The guardian', raid: 'The claimant',
      claimant: 'The claimant', item: 'the relic', itemLore: rapier?.lore ?? '',
      echoLine: 'The war you carry deepens.', event: def.id, legend: 'a legend'
    };
  }

  /** Replay a seen, replayable cut-scene at full length from the gallery. */
  replayCutscene(id: string): boolean {
    const def = REG.cutscenes.get(id);
    if (!def || !def.replayable) return false;
    if (!this.journalSeen.has(`cinematic:${id}`)) return false;
    this.cinematic.replay(def, this.replayContext(def));
    return true;
  }

  private cutsceneGalleryCaption(def: CutsceneDef): string {
    if (def.galleryCaption) return def.galleryCaption;
    const stage = def.beats
      .flatMap((beat) => beat.stage ?? [])
      .map((action) => {
        if (action.kind === 'title') return action.text;
        if ('text' in action) return action.text;
        if (action.kind === 'focus') return `Focus: ${action.target}`;
        if (action.kind === 'vfx') return `${action.archetype} VFX`;
        if (action.kind === 'gesture') return `${action.target} ${action.gesture}`;
        return '';
      })
      .filter(Boolean)
      .slice(0, 3)
      .join(' / ');
    const shots = def.beats
      .map((beat) => `${beat.shot.angle}/${beat.shot.move}`)
      .slice(0, 3)
      .join(' -> ');
    const line = def.beats.find((beat) => beat.line)?.line?.text.replace(/\{[^}]+\}/g, '...');
    const parts = [`Director note: ${stage || 'stages the milestone as a directed beat'}`];
    if (shots) parts.push(`Shots: ${shots}.`);
    if (line) parts.push(`Key line: "${line}"`);
    return parts.join(' ');
  }

  /** Spoiler-safe gallery view-model: seen replayable scenes are replayable; the rest show locked. */
  cinematicGallery(): { category: string; entries: { id: string; title: string; tier: string; seen: boolean; caption: string }[] }[] {
    const groups = new Map<string, { id: string; title: string; tier: string; seen: boolean; caption: string }[]>();
    for (const def of REG.cutscenes.values()) {
      if (!def.replayable) continue;
      const category = def.category ?? 'Other';
      const seen = this.journalSeen.has(`cinematic:${def.id}`);
      const caption = seen
        ? this.cutsceneGalleryCaption(def)
        : 'Locked — reach this moment to record it.';
      const title = seen ? def.title.replace(/\{[^}]+\}/g, '…') : `??? (${category})`;
      const list = groups.get(category) ?? [];
      list.push({ id: def.id, title, tier: def.tier, seen, caption });
      groups.set(category, list);
    }
    const order = ['Prologue', 'Binds', 'Regions', 'Bosses', 'Raids', 'Items', 'Endgame', 'Claimants', 'Festivals', 'Legends'];
    return [...groups.entries()]
      .sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
      .map(([category, entries]) => ({ category, entries }));
  }

  /** The Valve rarity color of the richest item in a drop (LOOT L6). */
  private dropAccent(items: ItemSave[]): string | undefined {
    let best: ItemRarity | undefined;
    for (const it of items) {
      const r = REG.item(it.id).rarity;
      if (r && (!best || RARITY_RANK[r] > RARITY_RANK[best])) best = r;
    }
    return best ? rarityColor(best) : undefined;
  }

  private lootMoment(items: ItemSave[]): void {
    if (items.length === 0) return;
    let best = items[0];
    for (const item of items) {
      const gradeRank = ITEM_GRADES.indexOf(item.grade ?? 'standard');
      const bestGradeRank = ITEM_GRADES.indexOf(best.grade ?? 'standard');
      const rarityRank = RARITY_RANK[this.itemRarity(item.id)];
      const bestRarityRank = RARITY_RANK[this.itemRarity(best.id)];
      if (gradeRank > bestGradeRank || (gradeRank === bestGradeRank && rarityRank > bestRarityRank)) best = item;
    }
    const loud = items.some((it) => {
      const gradeRank = ITEM_GRADES.indexOf(it.grade ?? 'standard');
      const rarity = this.itemRarity(it.id);
      return gradeRank >= ITEM_GRADES.indexOf('refined') ||
        RARITY_RANK[rarity] >= RARITY_RANK.immortal ||
        hasSignatureAffix(it);
    });
    const meaningful = loud || items.some((it) => REG.item(it.id).tier !== 'consumable');
    if (!meaningful) return;
    const signature = items.some((it) => hasSignatureAffix(it));
    // The biggest drops (a signature or a Pristine copy) get a brief slow-motion
    // micro-pause plus a dedicated stinger, the Diablo-unique / Borderlands-legendary
    // beat (ITEM_REHAUL §13.2). Lesser-but-still-loud drops get the standard cue.
    const peak = signature || items.some((it) => it.grade === 'pristine');
    if (peak) {
      this.lootSlowmoUntil = this.realClock + TUNING.loot.signatureSlowmoSec;
    }
    this.playPresentationStinger(peak ? 'loot-signature' : 'loot');
    this.emitPresentationEvent({
      t: 'loot-drop',
      pos: this.activeUnit()?.pos ?? this.region.town.pos,
      color: this.dropAccent(items) ?? rarityColor(this.itemRarity(best.id)),
      grade: best.grade,
      signature
    });
  }

  /** Warm the renderer behind a loading screen: build the first unit views and
   *  force the first render so the post stack + PBR programs compile now instead
   *  of hitching the first interactive frame (GRAPHICS_SPEC §9.4). No-op headless. */
  prewarm(): void {
    this.update(0); // creates unit views + forces a full render → compiles programs
    this.scene.prewarm?.(); // compile any in-scene materials not yet drawn
  }

  dispose(): void {
    this.scene.dispose?.();
    this.audio.dispose?.();
  }

  /** Push the live-tunable graphics settings (exposure/grade/reduced-motion) to
   *  the scene. Cheap — safe to call on every slider change. No-op headless. */
  applyGraphics(): void {
    const g = this.settings.graphics ?? defaultGraphicsSettings();
    // Overworld-only battle scale; macro sims (gym/Elite/raid/dungeon) keep their
    // own sims at scale 1, so a perf dial can never change a macro outcome (§E.6).
    this.sim.summonCapScale = g.battleScale;
    setColorblindPalette(g.colorblind);
    this.scene.setGraphics?.({
      exposure: g.exposure,
      grade: g.grade,
      reducedMotion: g.reducedMotion,
      autoAdjustQuality: g.autoAdjustQuality,
      frameTarget: g.frameTarget,
      bloom: g.bloom,
      ambientOcclusion: g.ambientOcclusion,
      antiAliasing: g.antiAliasing,
      shadows: g.shadows,
      drawDistance: g.drawDistance,
      crowdDetail: g.crowdDetail,
      vfxDensity: g.vfxDensity,
      screenShake: g.screenShake
    });
  }

  /** Change the render quality tier at runtime (heavy: rebuilds the post stack,
   *  shadows, weather). Persists the choice in settings. No-op headless. */
  setQualityTier(quality: GraphicsSettings['quality']): void {
    if (this.settings.graphics) this.settings.graphics.quality = quality;
    this.scene.setQuality?.(resolveQuality(quality));
    this.audio.enableSampledAudio?.(resolveQuality(quality) !== 'low');
    this.applyGraphics();
  }

  private emitPresentationEvent(ev: SimEvent, routeNow = false): void {
    if (routeNow) this.frameEvents.push(ev);
    else this.queuedPresentationEvents.push(ev);
  }

  private playPresentationEventNow(ev: SimEvent, sim: Sim = this.sim): void {
    this.scene.pushEvent(ev, sim);
    this.routeEventAudio(ev, sim);
  }

  /** Hand an event to the audio layer with its resolved world position so cues
   *  pan/attenuate relative to the followed hero. */
  private routeEventAudio(ev: SimEvent, sim: Sim): void {
    this.audio.handleEvent(ev, eventWorldPos(ev, sim));
  }

  private awardGold(amount: number, reason: string, pos?: Vec2, routeNow = false): void {
    const rounded = Math.round(amount);
    if (rounded <= 0) return;
    this.gold += rounded;
    this.emitPresentationEvent(
      { t: 'gold', amount: rounded, reason, pos: pos ? { ...pos } : undefined },
      routeNow
    );
  }

  isNight(): boolean {
    return this.dayTime >= 0.5;
  }

  private dayNightState: boolean | null = null;

  private refreshDayNightMods(force = false): void {
    const isNight = this.isNight();
    if (!force && this.dayNightState === isNight) return;
    this.dayNightState = isNight;
    for (const rec of this.party) {
      const u = rec.unit;
      if (!u) continue;
      for (const [k, v] of Object.entries(rec.dayNightMods)) {
        u.externalMods[k] = (u.externalMods[k] ?? 0) - v;
      }
      rec.dayNightMods = dayNightMods(rec.heroId, isNight) as Record<string, number>;
      for (const [k, v] of Object.entries(rec.dayNightMods)) {
        u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
      }
      u.markStatsDirty();
      u.refresh(this.sim.time);
    }
  }

  setResonanceEnabled(enabled: boolean): void {
    this.settings.resonance = enabled;
    this.sim.resonanceEnabled = enabled;
    this.refreshResonanceMods(true);
    this.msg(`Resonance ${enabled ? 'enabled' : 'disabled'}`, enabled ? 'good' : 'info');
  }

  private refreshResonanceMods(force = false): void {
    const enabled = this.settings.resonance ?? false;
    const res = enabled ? resonanceMods(this.party.map((p) => p.heroId), (id) => REG.hero(id)).mods : {};
    for (const rec of this.party) {
      const u = rec.unit;
      if (!u) {
        rec.resonanceMods = { ...res };
        continue;
      }
      if (force || Object.keys(rec.resonanceMods).length > 0) {
        for (const [k, v] of Object.entries(rec.resonanceMods)) {
          u.externalMods[k] = (u.externalMods[k] ?? 0) - v;
        }
      }
      rec.resonanceMods = { ...res };
      for (const [k, v] of Object.entries(rec.resonanceMods)) {
        u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
      }
      u.markStatsDirty();
      u.refresh(this.sim.time);
    }
  }

  inTown(): boolean {
    const u = this.activeUnit();
    return !!u && dist(u.pos, this.region.town.pos) <= this.region.town.radius;
  }

  inCombat(): boolean {
    const u = this.activeUnit();
    if (!u) return false;
    return (
      this.sim.time - u.lastEnemyDamageAt < TUNING.combatLockSec ||
      this.sim.time - u.lastDealtDamageAt < TUNING.combatLockSec
    );
  }

  nearbyGate(): NonNullable<RegionDef['gates']>[number] | null {
    const u = this.activeUnit();
    if (!u) return null;
    return (this.region.gates ?? []).find((g) => dist(u.pos, g.pos) <= g.radius) ?? null;
  }

  gateTravelBlockReason(gate: NonNullable<RegionDef['gates']>[number]): string | null {
    if (gate.requiredBadge && !this.badges.has(gate.requiredBadge)) {
      return `requires ${gate.requiredBadge.replace('-', ' ')}`;
    }
    if (gate.requiresRecruits && this.recruitedCount() < gate.requiresRecruits) {
      return `requires recruiting ${gate.requiresRecruits} hero${gate.requiresRecruits > 1 ? 'es' : ''} first`;
    }
    return null;
  }

  nearbyGym(): NonNullable<RegionDef['gyms']>[number] | null {
    const u = this.activeUnit();
    if (!u) return null;
    return (this.region.gyms ?? []).find((g) => dist(u.pos, g.pos) <= g.radius) ?? null;
  }

  /** The walking quest giver (if any) whose current patrol spot is in reach. */
  nearbyQuestGiver(): QuestGiverDef | null {
    const u = this.activeUnit();
    if (!u) return null;
    for (const g of REG.questGivers.values()) {
      if (g.regionId !== this.region.id) continue;
      const p = questGiverPos(g, this.playtime);
      if (dist(u.pos, p) <= (g.radius ?? 360)) return g;
    }
    return null;
  }

  nearbyDungeonPortal(): NonNullable<RegionDef['dungeons']>[number] | null {
    const u = this.activeUnit();
    if (!u) return null;
    return (this.region.dungeons ?? []).find((p) => dist(u.pos, p.pos) <= p.radius) ?? null;
  }

  nearbyChest(): NonNullable<RegionDef['chests']>[number] | null {
    const u = this.activeUnit();
    if (!u) return null;
    return (this.region.chests ?? []).find((c) => !this.openedChests.has(c.id) && dist(u.pos, c.pos) <= TUNING.exploration.chestInteractRadius) ?? null;
  }

  private chestGateOpen(chest: NonNullable<RegionDef['chests']>[number]): boolean {
    const gate = chest.gate ?? { kind: 'none' as const };
    if (gate.kind === 'none') return true;
    if (gate.kind === 'puzzle') return this.solvedPuzzles.has(gate.puzzleId);
    const st = this.camps.get(gate.campId);
    return !!st && st.respawnAt > 0 && st.uids.length === 0;
  }

  openNearbyChest(): boolean {
    const chest = this.nearbyChest();
    if (!chest) return false;
    if (!this.chestGateOpen(chest)) {
      this.msg(chest.gate?.kind === 'camp' ? 'The cache is bound to a nearby camp.' : 'An elemental seal holds this chest shut.', 'bad');
      return true;
    }
    this.openedChests.add(chest.id);
    if (chest.loot.gold) this.awardGold(chest.loot.gold, `chest:${chest.tier}`, chest.pos, true);
    const chestItems = (chest.loot.items ?? []).map((itemId, idx) => {
      const source: GradeFloorSource = chest.tier === 'luxurious' ? 'boss' : 'normal';
      return instantiateDroppedItem(
        itemId,
        creepCombatTier(this.region.id),
        new Rng(stableContentSeed(`chest:${chest.id}:${itemId}`, idx)),
        undefined,
        source,
        this.regionalGradeFloorBump(),
        this.endgameAffixUnlocked(),
        this.regionalGradeFloorMin(this.region.id, source),
        this.region.id
      );
    });
    const drops = chestItems.length > 0 ? this.spawnGroundItems(chestItems, chest.pos, { source: 'chest' }).map((drop) => drop.item) : [];
    if (drops.length > 0) {
      const names = drops.map((it) => REG.item(it.id).name).join(', ');
      this.msg(`Cache found: ${names} (on the ground)`, 'good', this.dropAccent(drops));
    }
    for (let i = 0; i < (chest.loot.shardCount ?? 0); i++) this.collectedShards.add(`${chest.id}:shard:${i}`);
    this.msg(`${chest.tier[0].toUpperCase()}${chest.tier.slice(1)} chest opened`, 'good');
    this.refreshExplorationRewards();
    return true;
  }

  offerShardsAtShrine(): boolean {
    const u = this.activeUnit();
    if (!u || dist(u.pos, this.region.shrine.pos) > 500) return false;
    const turned = this.shardsTurnedIn[this.region.id] ?? 0;
    const available = this.collectedShards.size - turned;
    const quota = TUNING.exploration.shrineShardQuota;
    if (available < quota) return false;
    this.shardsTurnedIn[this.region.id] = turned + quota;
    this.awardGold(TUNING.exploration.shardRewardGold, 'shrine-offering', this.region.shrine.pos, true);
    this.msg(`Mad Moon shards offered (${this.shardsTurnedIn[this.region.id]} total)`, 'good');
    this.refreshExplorationRewards();
    return true;
  }

  tryInteract(): boolean {
    if (this.openNearbyChest()) return true;
    if (this.offerShardsAtShrine()) return true;
    // verticality (§3.3): the interact key also works the elevation connectors
    if (this.nearbyClimbPoint() && this.tryClimb()) return true;
    if (this.nearbyGlidePoint() && this.tryGlide()) return true;
    const portal = this.nearbyDungeonPortal();
    if (portal) {
      if (this.onOpenDungeonEntry) {
        this.onOpenDungeonEntry(portal.dungeonId);
        return true;
      }
      return this.startDungeon(portal.dungeonId, 'normal');
    }
    const gym = this.nearbyGym();
    if (gym) {
      if (!this.gymStartGuard(gym.gymId)) return false;
      if (this.onOpenGymPrefight) {
        this.onOpenGymPrefight(gym.gymId);
        return true;
      }
      return this.challengeGym(gym.gymId);
    }
    const giver = this.nearbyQuestGiver();
    if (giver) {
      this.onOpenQuestGiver?.(giver.id);
      return true;
    }
    return this.tryTravel();
  }

  tryTravel(): boolean {
    const gate = this.nearbyGate();
    if (!gate) {
      this.msg('No route gate nearby', 'bad');
      return false;
    }
    const blockReason = this.gateTravelBlockReason(gate);
    if (blockReason) {
      this.msg(`${gate.name} ${blockReason}`, 'bad');
      return false;
    }
    const target = REG.region(gate.toRegionId);
    const save = this.buildSave();
    save.regionId = target.id;
    save.worldSeed = target.seed;
    save.playerPos = { ...gate.toPos };
    save.campRespawn = {};
    save.echoRespawn = {};
    save.groundItemDrops = [];
    save.regionVisits = { ...(save.regionVisits ?? {}), [target.id]: (save.regionVisits?.[target.id] ?? 0) + 1 };
    save.savedAt = Date.now();
    this.msg(`Traveling to ${target.name}...`, 'info');
    window.dispatchEvent(new CustomEvent('ancients:load', { detail: save }));
    return true;
  }

  fastTravelToWaypoint(waypointId: string): boolean {
    const waypoint = (this.region.waypoints ?? []).find((w) => w.id === waypointId);
    if (!waypoint) {
      this.msg('Unknown waystone', 'bad');
      return false;
    }
    if (!this.discovered.has(waypoint.id)) {
      this.msg(`${waypoint.name} has not been activated`, 'bad');
      return false;
    }
    if (this.inCombat()) {
      this.msg('Cannot fast travel in combat', 'bad');
      return false;
    }
    const u = this.activeUnit();
    if (!u) return false;
    u.pos = { ...waypoint.pos };
    u.prevPos = { ...waypoint.pos };
    this.scene.selectedUid = u.uid;
    this.msg(`Fast traveled to ${waypoint.name}`, 'good');
    return true;
  }

  /** The current party as a gym/macro team (heroId, level, items, authored gambits). */
  gymPlayerTeam(): GymMatchHero[] {
    return this.party.slice(0, 5).map((r) => ({
      heroId: r.heroId,
      level: r.unit ? r.unit.level : r.level,
      items: r.items.map((i) => i?.id).filter((id): id is string => !!id),
      gambits: r.gambits.length > 0 ? r.gambits : undefined
    }));
  }

  private gymStartGuard(gymId: string): boolean {
    const gym = REG.gym(gymId);
    if (this.defeatedGyms.has(gymId)) {
      this.msg(`${gym.name} already cleared`, 'info');
      return false;
    }
    if (this.party.length < 5) {
      this.msg(`${gym.name} requires a full party of 5 heroes`, 'bad');
      return false;
    }
    return true;
  }

  /** Headless / auto-resolve path: simulate the best-of-3 to a result immediately. */
  challengeGym(gymId: string): boolean {
    if (!this.gymStartGuard(gymId)) return false;
    const gym = REG.gym(gymId);
    const result = runGymMatch(gym, this.gymPlayerTeam(), this.region.seed + Math.round(this.playtime));
    return this.applyGymResult(gymId, result);
  }

  /** Live path (§3.5): step + render a real fight where the player spends Captain Calls. */
  startLiveGym(gymId: string): boolean {
    if (this.liveGym) return false;
    if (!this.gymStartGuard(gymId)) return false;
    const gym = REG.gym(gymId);
    this.liveGym = new LiveGymFight(gym, this.gymPlayerTeam(), this.region.seed + Math.round(this.playtime));
    this.liveGymId = gymId;
    this.story.beginEncounter();
    this.queuedOrders = [];
    this.scene.resetUnitViews(); // gym sim uids must not alias overworld views
    const first = this.liveGym.playerHeroes()[0];
    if (first) this.scene.selectedUid = first.uid;
    this.msg(`${gym.name}: best of ${gym.bestOf}. Select 1–5, then spend Captain Calls (Space) to seize a hero.`, 'info');
    return true;
  }

  /** Player spends a Captain Call on an ult-ready hero in the live gym fight. */
  liveGymPlayerCall(preferUid?: number): boolean {
    if (!this.liveGym) return false;
    const selected = preferUid ?? this.scene.selectedUid;
    const ok = this.liveGym.playerCaptainCall(selected);
    if (!ok) this.msg('No Captain Call available', 'bad');
    else {
      const u = this.liveGym.playerDrivenUnit();
      if (u) this.scene.selectedUid = u.uid;
      this.queuedOrders = [];
    }
    return ok;
  }

  private updateLiveGym(dt: number): void {
    const fight = this.liveGym;
    if (!fight) return;
    if (!this.paused) fight.step(Math.min(dt, 0.1));
    this.advanceQueuedOrder();
    this.frameEvents = fight.sim.events.drain();
    this.audio.setListener?.(fight.cameraFollow()?.pos ?? null);
    for (const ev of this.frameEvents) {
      this.scene.pushEvent(ev, fight.sim);
      this.routeEventAudio(ev, fight.sim);
    }
    this.observeStory(this.frameEvents, { sim: fight.sim });
    this.audio.update?.({ biome: this.region.biome, dayTime: 0.5, inCombat: true, dt });
    this.scene.syncQuestGivers?.([]);
    this.scene.update(fight.sim, fight.cameraFollow(), dt, 0.5, this.cinematicPresentationView(), []);
    if (fight.done && fight.result) {
      const id = this.liveGymId!;
      const result = fight.result;
      this.endLiveGym();
      this.applyGymResult(id, result);
    }
  }

  private endLiveGym(): void {
    this.liveGym = null;
    this.liveGymId = null;
    this.queuedOrders = [];
    this.scene.resetUnitViews(); // drop gym views so the overworld re-syncs cleanly
    const u = this.activeUnit();
    if (u) this.scene.selectedUid = u.uid;
  }

  private applyGymResult(gymId: string, result: GymMatchResult): boolean {
    const gym = REG.gym(gymId);
    this.msg(`${gym.name}: ${result.playerWins}-${result.enemyWins}`, result.winner === 0 ? 'good' : 'bad');
    if (result.winner === 0) {
      this.defeatedGyms.add(gym.id);
      this.badges.add(gym.badgeId);
      this.advanceQuests({ kind: 'earn-badge', amount: 1, targetId: gym.badgeId });
      this.applyRecruitCeiling(); // a new badge raises the ceiling; banked XP catches up (§3.4)
      this.playPresentationStinger('badge');
      this.msg(`${gym.leader} awards the ${gym.badgeId.replace('-', ' ')}!`, 'good');
      this.playCutscene(`badge-${gym.badgeId}`, { badge: gym.badgeId.replace(/-/g, ' ') });
      this.autosave('badge');
      return true;
    }
    this.msg(`${gym.leader} holds the badge. Tune gambits and try again.`, 'bad');
    return false;
  }

  // ---------- difficulty bosses + loot (§3.6) ----------

  /** Bosses anchored to a region (defaults to the current region). */
  regionBosses(regionId = this.region.id): BossDef[] {
    return [...REG.bosses.values()].filter((b) => b.region === regionId);
  }

  /** True if the player holds the badge for a region's gym (gates Nightmare/Hell, §3.6). */
  private badgeClearedFor(regionId: string): boolean {
    const gym = [...REG.gyms.values()].find((g) => g.regionId === regionId);
    return gym ? this.badges.has(gym.badgeId) : this.badges.size > 0;
  }

  private regionalGradeFloorBump(regionId = this.region.id): number {
    void regionId;
    return 0;
  }

  private regionalMasteryCount(regionId = this.region.id): number {
    return this.badgeClearedFor(regionId) ? this.badges.size : 0;
  }

  private regionalGradeFloorMin(regionId = this.region.id, source?: GradeFloorSource): ItemGrade | undefined {
    const mastery = this.regionalMasteryCount(regionId);
    if (source === 'boss' && mastery >= 6) return 'refined';
    if (source === 'raid' && REG.gyms.size > 0 && this.badges.size >= REG.gyms.size) return 'standard';
    if (mastery >= 3) return 'sharp';
    return undefined;
  }

  /**
   * The T5 "ancient" affix/signature tier opens only on Hell once the player has
   * fully badged out (every gym cleared) or cleared a raid (ITEM_REHAUL §14).
   */
  private endgameAffixUnlocked(difficulty: DifficultyTier = creepCombatTier(this.region.id)): boolean {
    if (difficulty !== 'hell') return false;
    const fullBadges = REG.gyms.size > 0 && this.badges.size >= REG.gyms.size;
    return fullBadges || this.totalRaidClears() > 0;
  }

  /** Difficulty tiers currently selectable for a boss (§3.6). */
  bossUnlockedTiers(bossId: string): DifficultyTier[] {
    const boss = REG.boss(bossId);
    const badge = this.badgeClearedFor(boss.region);
    const prog = this.difficulty[bossId];
    return boss.tiers.filter((t) => bossTierUnlocked(prog, t, badge));
  }

  /**
   * Re-run a regional boss at a difficulty tier as a live 5v1, deliver scaled loot on a
   * clear, advance the dry streak (pity), and open the next tier (§3.6). Headless-safe.
   */
  runBossFight(bossId: string, tier: DifficultyTier): { won: boolean; loot?: LootRoll } {
    const boss = REG.boss(bossId);
    if (this.party.length < 5) {
      this.msg('A boss fight needs a full party of 5 heroes', 'bad');
      return { won: false };
    }
    if (!this.bossUnlockedTiers(bossId).includes(tier)) {
      this.msg(`${REG.hero(boss.heroId).name} (${tier}) is locked`, 'bad');
      return { won: false };
    }
    const result = runRaidBattle(bossFightSetupFromDef(
      boss,
      this.gymPlayerTeam(),
      tier,
      this.region.seed + Math.round(this.playtime) + bossId.length
    ));
    if (result.winner !== 0) {
      this.msg(`${REG.hero(boss.heroId).name} (${tier}) survived — regroup and retry`, 'bad');
      return { won: false };
    }
    const dryStreak = this.difficulty[bossId]?.dryClears ?? 0;
    const loot = rollLoot(boss.loot, tier, dryStreak, bossLootSeed(boss, tier, dryStreak), this.lootBandForRegion(boss.region), 'boss', {
      gradeFloorBump: this.regionalGradeFloorBump(boss.region),
      gradeFloorMin: this.regionalGradeFloorMin(boss.region, 'boss'),
      regionId: boss.region,
      endgameUnlocked: this.endgameAffixUnlocked(tier)
    });
    const fullLoot = this.spendResinForLoot(TUNING.resin.bossCost);
    if (fullLoot) {
      this.deliverLoot(loot);
    } else {
      const dryItems = [...loot.guaranteed, ...(loot.assembled ? [loot.assembled] : [])];
      const gold = this.grantDryLootGold(dryItems, 'resin-dry', this.activeUnit()?.pos);
      this.msg(`Moonflow dry: boss loot converted to ${gold}g`, 'info');
    }
    this.awardLootMarks(1);
    // store the cleared tier + new pity streak: Nightmare opens after any clear (badge-gated),
    // Hell opens once a Nightmare clear has reset the streak (bossTierUnlocked).
    this.difficulty[bossId] = { tier, dryClears: loot.dryStreak };
    const drop = !fullLoot
      ? 'paid out dry gold'
      : loot.assembled
        ? `dropped ${REG.item(loot.assembled.id).name}${loot.pityUsed ? ' (pity!)' : ''}!`
        : `${loot.guaranteed.length} component${loot.guaranteed.length === 1 ? '' : 's'}`;
    this.msg(`${REG.hero(boss.heroId).name} (${tier}) defeated — ${drop}`, 'good');
    this.advanceQuests({ kind: 'clear-boss', amount: 1, targetId: bossId, regionId: boss.region });
    this.playCutscene('boss-clear-stinger', { boss: REG.hero(boss.heroId).name, bossLine: boss.dialogue[0] });
    this.autosave('boss');
    return { won: true, loot };
  }

  private deliverLoot(loot: LootRoll): void {
    const items = [...loot.guaranteed, ...(loot.assembled ? [loot.assembled] : [])];
    this.spawnGroundItems(items, this.activeUnit()?.pos ?? this.region.town.pos, { source: 'boss' });
  }

  // ---------- raids, executed (§3.9): mechanics fire in the sim ----------

  /** Raids the player can currently attempt (full party; Roshan respects its respawn timer). */
  availableRaids(): { def: RaidDef; ready: boolean; reason?: string }[] {
    return [...REG.raids.values()].map((def) => {
      if (this.party.length < 5) return { def, ready: false, reason: 'needs a full party of 5' };
      if (def.id === ROSHAN_RAID_ID) {
        const at = this.raidProgress[def.id]?.roshanRespawnAt ?? 0;
        if (at > this.playtime) return { def, ready: false, reason: `respawns in ${Math.ceil(at - this.playtime)}s` };
      }
      return { def, ready: true };
    });
  }

  /** True if a held Aegis charge would carry into the next raid (one-use auto-revive, §3.9). */
  aegisReady(): boolean {
    return Object.values(this.raidProgress).some((r) => r?.aegisHeld);
  }

  private consumeAegisFlag(): void {
    for (const r of Object.values(this.raidProgress)) if (r?.aegisHeld) { r.aegisHeld = false; return; }
  }

  /**
   * Run a raid as a 5v1 with its scripted mechanics firing in the sim (phase zones, add
   * waves, signature beat, enrage). On a clear: roll the raid's loot table, advance pity,
   * and apply Roshan specifics (Aegis, respawn timer, repeat Refresher-Shard + Cheese, §3.9).
   */
  runRaid(raidId: string, tier: DifficultyTier = 'normal'): { won: boolean; loot?: LootRoll; result?: RaidEncounterResult } {
    const def = REG.raid(raidId);
    if (this.party.length < 5) {
      this.msg('A raid needs a full party of 5 heroes', 'bad');
      return { won: false };
    }
    if (def.id === ROSHAN_RAID_ID) {
      const at = this.raidProgress[def.id]?.roshanRespawnAt ?? 0;
      if (at > this.playtime) {
        this.msg(`Roshan is dead — he claws back in ${Math.ceil(at - this.playtime)}s`, 'bad');
        return { won: false };
      }
    }
    const prog = this.raidProgress[raidId];
    const clears = prog?.clears ?? 0;
    const aegis = this.aegisReady();
    this.playRaidIntroSetpieces(raidId, def.name);
    if (this.queueAfterCinematic(def.name, () => this.resolveRaid(raidId, tier, clears, aegis))) {
      return { won: false };
    }
    return this.resolveRaid(raidId, tier, clears, aegis);
  }

  private resolveRaid(raidId: string, tier: DifficultyTier, clears: number, aegis: boolean): { won: boolean; loot?: LootRoll; result?: RaidEncounterResult } {
    const def = REG.raid(raidId);
    const result = runRaidEncounter({
      def,
      party: this.gymPlayerTeam(),
      tier,
      seed: stableContentSeed(`${raidId}:${tier}`, clears) + Math.round(this.playtime),
      aegis
    });
    if (aegis && result.aegisConsumed) {
      this.consumeAegisFlag();
      this.msg('The Aegis stands a fallen hero back up — and is spent.', 'info');
    }
    if (!result.cleared) {
      this.msg(`${def.name} holds the deep. Regroup and return.`, 'bad');
      this.autosave('raid');
      return { won: false, result };
    }
    this.deliverRaidLoot(def, tier, raidId, clears);
    this.codexUnlock('raid:' + raidId); // killing the raid boss is the encounter (§3.14)
    this.recordOutworldClaimantClear(raidId);
    this.advanceQuests({ kind: 'clear-raid', amount: 1, targetId: raidId });
    this.msg(`${def.name} cleared! (clear #${clears + 1})`, 'good');
    this.playRaidClearBeat(raidId, def.name);
    this.playPresentationStinger('raid-clear');
    this.autosave('raid');
    return { won: true, result };
  }

  // ---------- domains (GAMEPLAY_OVERHAUL §3.5, Pillar P5) ----------
  // Element-themed instanced challenges on the raid runner, paced by resin. Pity
  // streak is per-session (in-memory) so the save schema is untouched; resin (the
  // pacing economy) is the persisted part.
  private domainDryStreak: Record<string, number> = {};
  private domainClearCount: Record<string, number> = {};

  /** Domains for the current region whose entry condition the party can satisfy. */
  availableDomains(): { def: DomainDef; ready: boolean; reason?: string }[] {
    return [...REG.domains.values()]
      .filter((def) => def.regionId === this.region.id)
      .map((def) => {
        if (this.party.length < 5) return { def, ready: false, reason: 'needs a full party of 5' };
        const need = def.entry?.requiresElementHero;
        if (need && !this.partyHasElementHero(need)) return { def, ready: false, reason: `field a ${need} hero` };
        return { def, ready: true };
      });
  }

  private partyHasElementHero(element: ActiveElement): boolean {
    return this.party.some((rec) => elementForHero(REG.hero(rec.heroId)) === element);
  }

  /**
   * Run an element-themed domain on the raid runner: a run-wide disorder rule, an
   * element entry/clear gate, and a curated, resin-paced loot table with pity.
   * Clears always complete; resin only modulates whether the curated loot drops or
   * is converted to dry gold (soft pacing, §3.5 / §7 open decision).
   */
  runDomain(domainId: string): { won: boolean; cleared: boolean; reactions: number; loot?: LootRoll } {
    const def = REG.domains.get(domainId);
    if (!def) { this.msg('Unknown domain', 'bad'); return { won: false, cleared: false, reactions: 0 }; }
    if (this.party.length < 5) {
      this.msg('A domain needs a full party of 5 heroes', 'bad');
      return { won: false, cleared: false, reactions: 0 };
    }
    const need = def.entry?.requiresElementHero;
    if (need && !this.partyHasElementHero(need)) {
      this.msg(`${def.name} bars entry — field a ${need} hero.`, 'bad');
      return { won: false, cleared: false, reactions: 0 };
    }
    const clears = this.domainClears(domainId);
    const result = runDomainEncounter({
      seed: stableContentSeed(`domain:${domainId}`, clears) + Math.round(this.playtime),
      party: this.gymPlayerTeam(),
      boss: def.encounter,
      disorder: { mods: def.disorder.mods, tick: def.disorder.tick },
      clear: def.clear
    });
    if (!result.cleared) {
      const why = result.winner !== 0
        ? `${def.name} holds — regroup and return.`
        : def.clear.kind === 'time-limit'
          ? `${def.name} resisted the clear condition (too slow).`
          : `${def.name} resisted the clear condition (too few reactions: ${result.reactions}).`;
      this.msg(why, 'bad');
      this.autosave('domain');
      return { won: result.winner === 0, cleared: false, reactions: result.reactions };
    }
    const dryStreak = this.domainDryStreak[domainId] ?? 0;
    const loot = rollLoot(def.loot, 'normal', dryStreak, stableContentSeed(`domain:${domainId}:loot`, clears), this.currentLootBand(), 'raid', {
      gradeFloorBump: this.regionalGradeFloorBump(),
      gradeFloorMin: this.regionalGradeFloorMin(this.region.id, 'raid'),
      regionId: this.region.id,
      endgameUnlocked: this.endgameAffixUnlocked('normal')
    });
    this.domainDryStreak[domainId] = loot.dryStreak;
    this.domainClearCount[domainId] = clears + 1;
    const fullLoot = this.spendResinForLoot(def.resinCost);
    if (fullLoot) {
      this.deliverLoot(loot);
      const drop = loot.assembled ? `dropped ${REG.item(loot.assembled.id).name}${loot.pityUsed ? ' (pity!)' : ''}!` : `${loot.guaranteed.length} component${loot.guaranteed.length === 1 ? '' : 's'}`;
      this.msg(`${def.name} cleared — ${drop} (${result.reactions} reactions)`, 'good');
    } else {
      const dryItems = [...loot.guaranteed, ...(loot.assembled ? [loot.assembled] : [])];
      const gold = this.grantDryLootGold(dryItems, 'resin-dry', this.activeUnit()?.pos);
      this.msg(`${def.name} cleared, but the Moonflow is dry — loot converted to ${gold}g.`, 'info');
    }
    this.playPresentationStinger('raid-clear');
    this.autosave('domain');
    return { won: true, cleared: true, reactions: result.reactions, loot };
  }

  private domainClears(domainId: string): number {
    return this.domainClearCount[domainId] ?? 0;
  }

  startLiveRaid(raidId: string, tier: DifficultyTier = 'normal', opts: { maxSec?: number; festivalMode?: SeasonalEventDef['mode'] } = {}): boolean {
    if (this.liveGym || this.liveRaid) return false;
    const def = REG.raid(raidId);
    if (this.party.length < 5) {
      this.msg('A raid needs a full party of 5 heroes', 'bad');
      return false;
    }
    if (def.id === ROSHAN_RAID_ID) {
      const at = this.raidProgress[def.id]?.roshanRespawnAt ?? 0;
      if (at > this.playtime) {
        this.msg(`Roshan is dead — he claws back in ${Math.ceil(at - this.playtime)}s`, 'bad');
        return false;
      }
    }
    const prog = this.raidProgress[raidId];
    this.liveRaidId = raidId;
    this.liveRaidTier = tier;
    this.liveRaidClears = prog?.clears ?? 0;
    this.liveRaidAegis = this.aegisReady();
    this.liveRaid = new LiveRaid(def, this.gymPlayerTeam(), tier, stableContentSeed(`${raidId}:${tier}`, this.liveRaidClears) + Math.round(this.playtime), { aegis: this.liveRaidAegis, maxSec: opts.maxSec, festivalMode: opts.festivalMode });
    this.story.beginEncounter();
    this.playRaidIntroSetpieces(raidId, def.name);
    this.queuedOrders = [];
    this.scene.resetUnitViews();
    const u = this.liveRaid.drivenUnit();
    if (u) this.scene.selectedUid = u.uid;
    this.msg(`${def.name}: live raid started. Use 1–5 to switch drivers.`, 'info');
    return true;
  }

  private updateLiveRaid(dt: number): void {
    const raid = this.liveRaid;
    if (!raid) return;
    if (!this.paused) raid.step(Math.min(dt, 0.1));
    this.advanceQueuedOrder();
    this.frameEvents = raid.sim.events.drain();
    this.audio.setListener?.(raid.cameraFollow()?.pos ?? null);
    for (const ev of this.frameEvents) {
      this.scene.pushEvent(ev, raid.sim);
      this.routeEventAudio(ev, raid.sim);
    }
    if (this.liveRaidId) {
      this.observeStory(this.frameEvents, {
        sim: raid.sim,
        raidId: this.liveRaidId,
        bossHeroId: REG.raid(this.liveRaidId).boss.heroId,
        bossPhaseHpPct: this.raidPhaseThresholds(this.liveRaidId)
      });
    }
    this.audio.update?.({ biome: this.region.biome, dayTime: 0.5, inCombat: true, dt });
    this.scene.syncQuestGivers?.([]);
    this.scene.update(raid.sim, raid.cameraFollow(), dt, 0.5, this.cinematicPresentationView(), []);
    if (raid.done && raid.result) {
      const id = this.liveRaidId!;
      const tier = this.liveRaidTier;
      const clears = this.liveRaidClears;
      const aegis = this.liveRaidAegis;
      const result = raid.result;
      this.endLiveRaid();
      this.applyLiveRaidResult(id, tier, clears, aegis, result);
    }
  }

  private endLiveRaid(): void {
    this.liveRaid = null;
    this.liveRaidId = null;
    this.queuedOrders = [];
    this.scene.resetUnitViews();
    const u = this.activeUnit();
    if (u) this.scene.selectedUid = u.uid;
  }

  private applyLiveRaidResult(raidId: string, tier: DifficultyTier, clears: number, aegis: boolean, result: RaidEncounterResult): void {
    const def = REG.raid(raidId);
    if (aegis && result.aegisConsumed) {
      this.consumeAegisFlag();
      this.msg('The Aegis stands a fallen hero back up — and is spent.', 'info');
    }
    if (!result.cleared) {
      this.completeActiveFestival(false);
      this.msg(`${def.name} holds the deep. Regroup and return.`, 'bad');
      this.autosave('raid');
      return;
    }
    this.deliverRaidLoot(def, tier, raidId, clears);
    this.codexUnlock('raid:' + raidId);
    this.recordOutworldClaimantClear(raidId);
    this.completeActiveFestival(true);
    this.msg(`${def.name} cleared! (clear #${clears + 1})`, 'good');
    this.playRaidClearBeat(raidId, def.name);
    this.playPresentationStinger('raid-clear');
    this.autosave('raid');
  }

  dungeonEntryOptions(dungeonId: string): { def: DungeonDef; tiers: DifficultyTier[]; modifiers: DungeonModifierDef[]; progress?: DungeonProgressSave; lockReason?: string } {
    const def = REG.dungeon(dungeonId);
    return {
      def,
      tiers: [...def.tiers],
      modifiers: [...(def.modifiers ?? [])],
      progress: this.dungeonProgress[dungeonId],
      lockReason: this.dungeonLockReason(def)
    };
  }

  private dungeonLockReason(def: DungeonDef): string | undefined {
    if (!def.unlockQuest) return undefined;
    const quest = REG.questDefs.get(def.unlockQuest);
    if (!quest) return undefined;
    const status = this.questSaveFor(quest).status;
    return status === 'claimed' ? undefined : `Complete ${quest.name} to unlock this descent.`;
  }

  private selectedDungeonModifiers(def: DungeonDef, ids: string[] | undefined): string[] {
    if (!ids || ids.length === 0) return [];
    const legal = new Set((def.modifiers ?? []).map((m) => m.id));
    const selected: string[] = [];
    for (const id of ids) {
      if (legal.has(id) && !selected.includes(id)) selected.push(id);
    }
    return selected;
  }

  startDungeon(
    dungeonId: string,
    tier: DifficultyTier = 'normal',
    opts: { seed?: number; maxSec?: number; modifiers?: string[]; endless?: boolean; endlessLevel?: number; seedMode?: 'daily' | 'weekly'; festivalMode?: SeasonalEventDef['mode'] } = {}
  ): boolean {
    if (this.liveGym || this.liveRaid || this.liveDungeon) return false;
    const def = REG.dungeon(dungeonId);
    if (def.regionId !== this.region.id) {
      this.msg(`${def.name} is not in this region`, 'bad');
      return false;
    }
    const lockReason = this.dungeonLockReason(def);
    if (lockReason) {
      this.msg(lockReason, 'bad');
      return false;
    }
    if (!def.tiers.includes(tier)) {
      this.msg(`${def.name} does not support ${tier}`, 'bad');
      return false;
    }
    if (this.party.length === 0) {
      this.msg('A dungeon needs at least one hero', 'bad');
      return false;
    }
    const modifiers = this.selectedDungeonModifiers(def, opts.modifiers);
    const modSalt = modifiers.length > 0 ? `:${modifiers.join('+')}` : '';
    // Endless level may not skip ahead of what the player has cleared (+1 to push the frontier).
    const endless = !!opts.endless;
    const endlessLevel = endless ? this.clampEndlessLevel(dungeonId, opts.endlessLevel ?? 0) : undefined;
    const seed = opts.seed
      ?? (opts.seedMode === 'daily'
        ? dungeonDailySeed(dungeonId)
        : opts.seedMode === 'weekly'
          ? dungeonWeeklySeed(dungeonId)
          : endless
            ? stableContentSeed(`${dungeonId}:endless:${tier}:${endlessLevel}${modSalt}`, Math.round(this.playtime))
            : stableContentSeed(`${dungeonId}:${tier}${modSalt}`, Math.round(this.playtime)));
    this.liveDungeonId = dungeonId;
    this.liveDungeonTier = tier;
    this.liveDungeonModifiers = modifiers;
    this.liveDungeon = new DungeonSession(def, this.gymPlayerTeam(), tier, seed, { maxSec: opts.maxSec, modifiers, endless, endlessLevel, festivalMode: opts.festivalMode });
    this.liveDungeon.spawnEntourage(this.fieldedDungeonEntourage());
    this.story.beginEncounter();
    this.queuedOrders = [];
    this.scene.resetUnitViews();
    this.syncDungeonSceneRoom();
    const u = this.liveDungeon.drivenUnit();
    if (u) this.scene.selectedUid = u.uid;
    const modText = modifiers.length > 0 ? ` · ${modifiers.map((id) => def.modifiers?.find((m) => m.id === id)?.name ?? id).join(', ')}` : '';
    const label = endless ? `endless L${(endlessLevel ?? 0) + 1}` : opts.seedMode ? `${opts.seedMode} ${tier}` : `${tier} descent`;
    this.msg(`${def.name}: ${label} opened (${this.liveDungeon.layout.depth} rooms${modText}). Exits unlock on clear.`, 'info');
    return true;
  }

  /** The endless frontier: you can re-run any cleared level or push one past your best. */
  clampEndlessLevel(dungeonId: string, requested: number): number {
    const best = this.dungeonProgress[dungeonId]?.bestEndlessLevel ?? -1;
    return Math.max(0, Math.min(Math.floor(requested), best + 1));
  }

  private updateLiveDungeon(dt: number): void {
    const dungeon = this.liveDungeon;
    if (!dungeon) return;
    if (!this.paused) dungeon.step(Math.min(dt, 0.1));
    this.advanceQueuedOrder();
    this.frameEvents = dungeon.sim.events.drain();
    this.audio.setListener?.(dungeon.cameraFollow()?.pos ?? null);
    for (const ev of this.frameEvents) {
      this.scene.pushEvent(ev, dungeon.sim);
      this.routeEventAudio(ev, dungeon.sim);
      if (ev.t === 'kill-credit') {
        const victim = dungeon.sim.unit(ev.victimUid);
        if (victim?.kind === 'creep' && victim.tier) this.rollItemDropsForCreep(victim.creepId, victim.tier, ev.victimUid, dungeon.tier, victim.pos);
      } else if (ev.t === 'capture-complete') {
        this.handleCaptureComplete(ev, 'dungeon', dungeon.def.regionId);
      }
    }
    const guardian = REG.bosses.get(dungeon.def.guardian);
    this.observeStory(this.frameEvents, {
      sim: dungeon.sim,
      bossHeroId: guardian?.heroId,
      bossPhaseHpPct: this.bossPhaseThresholdsForBossId(dungeon.def.guardian)
    });
    this.audio.update?.({ biome: this.region.biome, dayTime: 0.5, inCombat: true, dt });
    for (const room of dungeon.drainCompletedRooms()) {
      this.grantDungeonRoomReward(dungeon.def, dungeon.tier, room, dungeon.selectedModifiers());
    }
    this.scene.syncQuestGivers?.([]);
    this.scene.update(dungeon.sim, dungeon.cameraFollow(), dt, 0.5, this.cinematicPresentationView(), this.visibleGroundItemDrops());
    if (dungeon.done && dungeon.result) {
      const id = this.liveDungeonId!;
      const tier = this.liveDungeonTier;
      const result = dungeon.result;
      const clearedRooms = result.clearedRooms.map((index) => ({ index, type: dungeon.layout.rooms[index]?.type })).filter((r): r is { index: number; type: RoomType } => !!r.type);
      const depth = dungeon.layout.depth;
      const modifiers = dungeon.selectedModifiers();
      this.endLiveDungeon();
      this.applyDungeonResult(id, tier, result.cleared, clearedRooms, depth, modifiers, result.endless ? result.endlessLevel : undefined);
    }
  }

  chooseDungeonExit(index: number): boolean {
    const dungeon = this.liveDungeon;
    if (!dungeon) return false;
    const ok = dungeon.chooseExit(index);
    if (!ok) {
      this.msg('That dungeon exit is sealed', 'bad');
      return false;
    }
    const room = dungeon.room;
    this.syncDungeonSceneRoom();
    this.msg(`${dungeon.def.name}: entered room ${room.index + 1}/${dungeon.layout.depth} (${room.type})`, 'info');
    for (const completed of dungeon.drainCompletedRooms()) {
      this.grantDungeonRoomReward(dungeon.def, dungeon.tier, completed, dungeon.selectedModifiers());
    }
    return true;
  }

  private endLiveDungeon(): void {
    const stranded = this.groundItemDrops.filter((drop) => drop.context === 'dungeon').map((drop) => cloneItemSave(drop.item)!);
    if (stranded.length > 0) {
      this.groundItemDrops = this.groundItemDrops.filter((drop) => drop.context !== 'dungeon');
      this.spawnGroundItems(stranded, this.activeUnit()?.pos ?? this.region.town.pos, { source: 'dungeon', context: 'overworld' });
    }
    this.liveDungeon = null;
    this.liveDungeonId = null;
    this.liveDungeonModifiers = [];
    this.queuedOrders = [];
    this.scene.setDungeonRoom?.(null);
    this.scene.resetUnitViews();
    const u = this.activeUnit();
    if (u) this.scene.selectedUid = u.uid;
  }

  private syncDungeonSceneRoom(): void {
    const dungeon = this.liveDungeon;
    if (!dungeon || !this.scene.setDungeonRoom) return;
    this.scene.setDungeonRoom(dungeon.roomTemplate(), dungeon.room);
  }

  private modifiedDungeonLootTable(def: DungeonDef, table: ItemDropTable, modifiers: string[]): ItemDropTable {
    if (modifiers.length === 0) return table;
    const mods = (def.modifiers ?? []).filter((m) => modifiers.includes(m.id));
    const chanceMult = mods.reduce((mult, m) => mult * (m.lootChanceMult ?? 1), 1);
    const rollBonus = mods.reduce((sum, m) => sum + (m.lootRollBonus ?? 0), 0);
    if (chanceMult === 1 && rollBonus === 0) return table;
    return {
      guaranteed: [...table.guaranteed],
      slots: table.slots.map((slot) => ({
        ...slot,
        rolls: Math.max(0, slot.rolls + rollBonus),
        chance: {
          normal: Math.min(1, slot.chance.normal * chanceMult),
          nightmare: Math.min(1, slot.chance.nightmare * chanceMult),
          hell: Math.min(1, slot.chance.hell * chanceMult)
        },
        pool: slot.pool.map((entry) => ({ ...entry })),
        qualityOdds: slot.qualityOdds ? { ...slot.qualityOdds } : undefined
      }))
    };
  }

  private grantDungeonRoomInteraction(tier: DifficultyTier, room: DungeonRoom): void {
    const pos = this.controlledUnit()?.pos ?? this.activeUnit()?.pos ?? this.region.town.pos;
    const tierMult = tier === 'hell' ? 2.1 : tier === 'nightmare' ? 1.55 : 1;
    if (room.reward.kind === 'chest') {
      const gold = Math.round((140 + room.index * 18) * tierMult);
      this.awardGold(gold, 'dungeon-chest', pos, true);
      this.msg(`Treasure chest opened: ${gold}g`, 'good');
      return;
    }
    if (room.reward.kind === 'shrine') {
      const dungeon = this.liveDungeon;
      if (dungeon) {
        for (const uid of dungeon.partyUids) {
          const u = dungeon.sim.unit(uid);
          if (!u?.alive) continue;
          u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.maxHp * 0.45);
          u.mana = Math.min(u.stats.maxMana, u.mana + u.stats.maxMana * 0.55);
        }
      }
      const gold = Math.round((70 + room.index * 10) * tierMult);
      this.awardGold(gold, 'dungeon-shrine', pos, true);
      this.msg(`Dungeon shrine restored the party and yielded ${gold}g`, 'good');
    }
  }

  private grantDungeonRoomReward(def: DungeonDef, tier: DifficultyTier, room: DungeonRoom, modifiers: string[] = []): void {
    const reward = room.reward;
    if (reward.kind === 'none' || reward.kind === 'rest' || !reward.table) return;
    this.grantDungeonRoomInteraction(tier, room);
    const table = this.modifiedDungeonLootTable(def, reward.table, modifiers);
    const modSalt = modifiers.length > 0 ? `:${modifiers.join('+')}` : '';
    // Dry streaks persist per dungeon across runs so a slot's pity (e.g. the guardian
    // anchor's `pity: 4`) actually accrues instead of resetting every roll (GAMEPLAY_2.0 §0.2).
    const prev = this.dungeonProgress[def.id];
    const dryStreaks = { ...(prev?.dryStreaks ?? {}) };
    const roll = rollItemDrops(
      table,
      tier,
      dryStreaks,
      new Rng(stableContentSeed(`${def.id}:room-reward:${tier}:${room.index}${modSalt}`, Math.round(this.playtime))),
      this.lootBandForRegion(def.regionId),
      {
        source: reward.kind === 'guardian' ? 'boss' : undefined,
        gradeFloorBump: this.regionalGradeFloorBump(def.regionId),
        gradeFloorMin: this.regionalGradeFloorMin(def.regionId, reward.kind === 'guardian' ? 'boss' : undefined),
        regionId: def.regionId,
        endgameUnlocked: this.endgameAffixUnlocked(tier)
      }
    );
    this.dungeonProgress[def.id] = { ...(prev ?? { clears: 0, wipes: 0, bestDepth: 0, bestTier: 'normal' as DifficultyTier }), dryStreaks: roll.dryStreaks };
    if (roll.items.length === 0) return;
    if (reward.kind === 'guardian' && !this.spendResinForLoot(TUNING.resin.dungeonGuardianCost)) {
      const gold = this.grantDryLootGold(roll.items, 'resin-dry', this.activeUnit()?.pos);
      this.msg(`Moonflow dry: guardian loot converted to ${gold}g`, 'info');
      return;
    }
    const rewardPos = this.controlledUnit()?.pos ?? this.activeUnit()?.pos ?? this.region.town.pos;
    const drops = this.spawnGroundItems(roll.items, rewardPos, { source: 'dungeon' }).map((drop) => drop.item);
    const names = drops.map((it) => REG.item(it.id).name).join(', ');
    const label = reward.kind === 'guardian' ? 'Guardian drop' : reward.kind === 'chest' ? 'Chest reward' : 'Dungeon reward';
    this.msg(`${label}: ${names} (on the ground)`, reward.kind === 'guardian' ? 'good' : 'info', this.dropAccent(drops));
  }

  private recordDungeonProgress(dungeonId: string, tier: DifficultyTier, cleared: boolean, clearedRooms: number, depth: number, modifiers: string[], endlessLevel?: number): void {
    const prev = this.dungeonProgress[dungeonId] ?? { clears: 0, wipes: 0, bestDepth: 0, bestTier: 'normal' as DifficultyTier };
    // Clearing an endless level pushes the frontier so the next one becomes enterable.
    const bestEndlessLevel = cleared && endlessLevel !== undefined
      ? Math.max(prev.bestEndlessLevel ?? -1, endlessLevel)
      : prev.bestEndlessLevel;
    this.dungeonProgress[dungeonId] = {
      clears: prev.clears + (cleared ? 1 : 0),
      wipes: prev.wipes + (cleared ? 0 : 1),
      bestDepth: Math.max(prev.bestDepth, cleared ? depth : clearedRooms),
      bestTier: cleared ? higherDungeonTier(tier, prev.bestTier) : prev.bestTier,
      lastTier: tier,
      lastModifiers: [...modifiers],
      lastClearedAt: cleared ? Math.round(this.playtime) : prev.lastClearedAt,
      // Carry the pity dry streaks accrued during the run (set by grantDungeonRoomReward).
      ...(prev.dryStreaks ? { dryStreaks: prev.dryStreaks } : {}),
      ...(bestEndlessLevel !== undefined && bestEndlessLevel >= 0 ? { bestEndlessLevel } : {})
    };
  }

  private applyDungeonResult(dungeonId: string, tier: DifficultyTier, cleared: boolean, clearedRooms: { index: number; type: RoomType }[], depth: number, modifiers: string[] = [], endlessLevel?: number): void {
    const def = REG.dungeon(dungeonId);
    this.recordDungeonProgress(dungeonId, tier, cleared, clearedRooms.length, depth, modifiers, endlessLevel);
    this.completeActiveFestival(cleared);
    if (!cleared) {
      this.msg(`${def.name} ejects the party at the portal. Regroup and return.`, 'bad');
      this.autosave('dungeon');
      return;
    }
    if (endlessLevel !== undefined) {
      this.msg(`${def.name}: endless L${endlessLevel + 1} cleared (${depth} rooms). The descent to L${endlessLevel + 2} is open.`, 'good');
    } else {
      this.msg(`${def.name} cleared: ${clearedRooms.length}/${depth} rooms. You return to the portal.`, 'good');
    }
    this.advanceQuests({ kind: 'clear-dungeon', amount: 1, targetId: dungeonId, regionId: def.regionId });
    this.playPresentationStinger('raid-clear');
    this.autosave('dungeon');
  }

  /** Deliver a raid clear's loot + pity; Roshan also grants the Aegis, sets the respawn timer, and re-drops cheese. */
  private deliverRaidLoot(def: RaidDef, tier: DifficultyTier, raidId: string, clears: number): void {
    // STORY §7.4 — the Aegis of Champions thread: hold the Pit at its hardest, earn the title.
    if (raidId === ROSHAN_RAID_ID && tier === 'hell' && !this.codexUnlocks.has('title:true-champion')) {
      this.codexUnlock('title:true-champion');
      this.msg('Title earned: True Champion — you held the Pit at its hardest.', 'good');
    }
    const dryStreak = this.raidProgress[raidId]?.dryStreak ?? 0;
    const loot = rollLoot(def.loot, tier, dryStreak, stableContentSeed(`${raidId}:loot:${tier}`, clears), this.currentLootBand(), 'raid', {
      gradeFloorBump: this.regionalGradeFloorBump(),
      gradeFloorMin: this.regionalGradeFloorMin(this.region.id, 'raid'),
      regionId: this.region.id,
      endgameUnlocked: this.endgameAffixUnlocked(tier)
    });
    const next = { ...(this.raidProgress[raidId] ?? { clears: 0, dryStreak: 0 }) };
    next.clears = clears + 1;
    next.dryStreak = loot.dryStreak;
    const fullLoot = this.spendResinForLoot(TUNING.resin.raidCost);
    if (!fullLoot) {
      const dryItems = [...loot.guaranteed, ...(loot.assembled ? [loot.assembled] : [])];
      const gold = this.grantDryLootGold(dryItems, 'resin-dry', this.activeUnit()?.pos);
      this.msg(`Moonflow dry: raid loot converted to ${gold}g`, 'info');
    } else {
      const groundLoot: ItemSave[] = [];
      for (const it of loot.guaranteed) {
        if (it.id === 'aegis-of-the-immortal') {
          next.aegisHeld = true; // the held one-use charge
          this.playItemFirstHold(it.id);
        } else {
          groundLoot.push(it);
        }
      }
      if (loot.assembled) {
        groundLoot.push(loot.assembled);
        this.msg(`Raid drop: ${REG.item(loot.assembled.id).name}${loot.pityUsed ? ' (pity!)' : ''}`, 'good', this.dropAccent([loot.assembled]));
      }
      if (groundLoot.length > 0) this.spawnGroundItems(groundLoot, this.activeUnit()?.pos ?? this.region.town.pos, { source: 'raid' });
    }
    if (def.id === ROSHAN_RAID_ID) {
      next.roshanRespawnAt = this.playtime + TUNING.roshanRespawnSec;
      if (fullLoot) {
        next.aegisHeld = true;
        this.msg('Roshan falls — the Aegis of the Immortal is yours.', 'good');
        this.playItemFirstHold('aegis-of-the-immortal');
        if (next.clears >= TUNING.roshanRepeatDropFromClear) {
          this.spawnGroundItems([{ id: 'refresher-shard' }, { id: 'cheese', charges: 1 }], this.activeUnit()?.pos ?? this.region.town.pos, { source: 'raid' });
          this.msg('A repeat kill spills a Refresher Shard and a Cheese.', 'good');
        }
      }
    }
    this.raidProgress[raidId] = next;
    this.awardLootMarks(1);
  }

  // ---------- Elite Five gauntlet + Champion (§3.10) ----------

  eliteMembers(): { name: string; pool: string[] }[] {
    return ELITE_DRAFT.members;
  }

  /** 0..4 = next undefeated member; 5 = the five are cleared, the Champion awaits. */
  eliteNextIndex(): number {
    return Math.min(this.eliteFive.defeated, ELITE_DRAFT.members.length);
  }

  private eliteDraftFor(memberIdx: number, seed: number): { player: MacroHeroSetup[]; enemy: MacroHeroSetup[]; bans: string[] } {
    const member = ELITE_DRAFT.members[memberIdx];
    const mini: DraftDef = { ...ELITE_DRAFT, id: `${ELITE_DRAFT.id}-m${memberIdx}`, members: [member] };
    return draftTeams(mini, [...this.recruited], seed);
  }

  /**
   * Run the next Elite Five match: a drafted 5v5 against the current member's pool. A win
   * advances `eliteFive.defeated`; a loss leaves it untouched so the gauntlet restarts from
   * that same member (never a hard lockout, §3.10). `playerTeam` overrides the drafted picks.
   */
  runEliteMatch(opts: { seed?: number; playerTeam?: MacroHeroSetup[] } = {}): { won: boolean; winner: 0 | 1 | -1; defeated: number; member: string } {
    const idx = this.eliteNextIndex();
    if (idx >= ELITE_DRAFT.members.length) {
      this.msg('The Elite Five are beaten — challenge the Champion.', 'info');
      return { won: false, winner: -1, defeated: this.eliteFive.defeated, member: 'Champion' };
    }
    if (!opts.playerTeam && this.party.length < 5) {
      this.msg('The gauntlet needs a full party of 5 heroes', 'bad');
      return { won: false, winner: -1, defeated: this.eliteFive.defeated, member: ELITE_DRAFT.members[idx].name };
    }
    const seed = opts.seed ?? (this.region.seed + idx * 101 + Math.round(this.playtime));
    const draft = this.eliteDraftFor(idx, seed);
    const player = opts.playerTeam ?? draft.player;
    if (idx === 0 && this.eliteFive.defeated === 0) this.playCutscene('elite-gauntlet-open');
    const personaId = `elite-persona-${idx}`;
    if (this.journalSeen.has(`cinematic:${personaId}`)) {
      const member = ELITE_DRAFT.members[idx];
      this.msg(`${member.name}: "${member.dialogue[0] ?? member.title}"`, 'bark');
    } else {
      this.playCutscene(personaId);
    }
    if (this.queueAfterCinematic(ELITE_DRAFT.members[idx].name, () => {
      this.resolveEliteMatch(idx, seed, player, draft.enemy);
    })) {
      return { won: false, winner: -1, defeated: this.eliteFive.defeated, member: ELITE_DRAFT.members[idx].name };
    }
    return this.resolveEliteMatch(idx, seed, player, draft.enemy);
  }

  private resolveEliteMatch(idx: number, seed: number, player: MacroHeroSetup[], enemy: MacroHeroSetup[]): { won: boolean; winner: 0 | 1 | -1; defeated: number; member: string } {
    const result = runMacroBattle({ seed, teamA: player, teamB: enemy });
    const member = ELITE_DRAFT.members[idx];
    const won = result.winner === 0;
    if (won) {
      this.eliteFive.defeated = idx + 1;
      this.msg(`${member.name} falls — Elite Five ${this.eliteFive.defeated}/5.`, 'good');
    } else {
      this.msg(`${member.name} outdrafts you. Re-challenge them when ready.`, 'bad');
    }
    this.autosave('elite');
    return { won, winner: result.winner, defeated: this.eliteFive.defeated, member: member.name };
  }

  /** The Champion fight, gated behind clearing all five. On a win, `championDown` flips (§3.10). */
  runChampion(opts: { seed?: number; playerTeam?: MacroHeroSetup[] } = {}): { won: boolean; winner: 0 | 1 | -1 } {
    if (this.eliteFive.defeated < ELITE_DRAFT.members.length) {
      this.msg('Clear all five of the Elite before the Champion will see you.', 'bad');
      return { won: false, winner: -1 };
    }
    if (!opts.playerTeam && this.party.length < 5) {
      this.msg('The Champion fight needs a full party of 5 heroes', 'bad');
      return { won: false, winner: -1 };
    }
    const seed = opts.seed ?? (this.region.seed + 999 + Math.round(this.playtime));
    const player = opts.playerTeam ?? this.gymPlayerTeam();
    const champ = ELITE_DRAFT.champion;
    const enemy: MacroHeroSetup[] = Array.isArray(champ) ? champ : [{ heroId: champ.heroId, level: 30, items: ['black-king-bar', 'butterfly', 'heart-of-tarrasque'] }];
    this.playCutscene('champion-intro');
    if (this.queueAfterCinematic(ELITE_DRAFT.championName, () => {
      this.resolveChampion(seed, player, enemy);
    })) {
      return { won: false, winner: -1 };
    }
    return this.resolveChampion(seed, player, enemy);
  }

  championClosingLine(): string {
    if (this.reputation >= 6) return 'For one turn of the war, mercy holds the reset open.';
    if (this.reputation <= -6) return 'For one turn of the war, fear holds the reset open.';
    const shore = this.factionChoices['shadeshore'];
    if (shore === 'kunkka') return 'For one turn of the war, the fleet sails past the reset.';
    if (shore === 'tidehunter') return 'For one turn of the war, the reef drags the reset under.';
    return 'For one turn of the war, the reset does not close.';
  }

  private resolveChampion(seed: number, player: MacroHeroSetup[], enemy: MacroHeroSetup[]): { won: boolean; winner: 0 | 1 | -1 } {
    const result = runMacroBattle({ seed, teamA: player, teamB: enemy });
    if (result.winner === 0) {
      this.eliteFive.championDown = true;
      this.msg('The Champion is dethroned. The ancients answer to you now.', 'good');
      this.playCutscene('champion-clear', { closing: this.championClosingLine() });
      this.playPresentationStinger('raid-clear');
    } else {
      this.msg('The Champion endures. Sharpen the draft and return.', 'bad');
    }
    this.autosave('champion');
    return { won: result.winner === 0, winner: result.winner };
  }

  // ---------- faction exclusivity (§3.10): Shadeshore captains ----------

  /** The two heroes whose recruitment forces an either/or in a region (Kunkka xor Tidehunter). */
  private factionPair(regionId: string): [string, string] | null {
    const pair = [...REG.trials.values()].filter((t) => t.kind === 'faction-choice' && t.regionId === regionId).map((t) => t.heroId);
    return pair.length === 2 ? [pair[0], pair[1]] : null;
  }

  /** True if siding with one captain has locked this hero out of recruitment (§3.10). */
  factionLockedHero(heroId: string): boolean {
    const trial = REG.trials.get(`trial-${heroId}`);
    if (!trial || trial.kind !== 'faction-choice') return false;
    const chosen = this.factionChoices[trial.regionId];
    return !!chosen && chosen !== heroId;
  }

  /** Record a faction pick through the real exclusivity helper, locking the rival captain (§3.10). */
  private recordFactionChoice(regionId: string, heroId: string): void {
    const pair = this.factionPair(regionId);
    try {
      this.factionChoices = pair
        ? chooseFaction(this.factionChoices, regionId, heroId, pair)
        : { ...this.factionChoices, [regionId]: heroId };
    } catch {
      // already committed to the other captain — keep the original choice
      return;
    }
    const pairMate = pair?.find((h) => h !== heroId);
    if (pairMate) this.msg(`${REG.hero(pairMate).name} turns away — that road is closed.`, 'info');
  }

  // ---------- codex + quest journal (§3.14) ----------

  /** Reveal a codex entry on encounter — id like 'hero:lich', 'region:icewrack', 'raid:roshan-pit'. */
  codexUnlock(id: string): void {
    this.codexUnlocks.add(id);
  }

  /** Held relics and the current party count as "encountered" for the codex. */
  private syncEncounterCodex(): void {
    for (const id of this.heldUniques) this.codexUnlocks.add('item:' + id);
    for (const r of this.party) this.codexUnlocks.add('hero:' + r.heroId);
    this.syncStoryCodex();
  }

  private storyLoreUnlocked(entry: LoreEntryDef): boolean {
    switch (entry.unlock.kind) {
      case 'start':
        return true;
      case 'region':
        return this.codexUnlocks.has('region:' + entry.unlock.regionId) || this.region.id === entry.unlock.regionId;
      case 'badge':
        return this.badges.has(entry.unlock.badgeId);
      case 'champion':
        return this.eliteFive.championDown;
    }
    return false;
  }

  private syncStoryCodex(): void {
    for (const entry of REG.loreEntries.values()) {
      if (this.storyLoreUnlocked(entry)) this.codexUnlocks.add('lore:' + entry.id);
    }
  }

  private claimantLore(raid: RaidDef): string {
    const commentary: Record<string, string> = {
      'renegade-marshal': 'Director note: dusty rifle silhouette, dead-fleet framing, and voidlight grade sell the space-marshal homage without borrowing a line.',
      'void-prelate': 'Director note: withheld blade, dark-between-stars grade, and late reveal make the assassin readable before the name lands.',
      'queen-of-blades': 'Director note: swarm geometry and fallen-star purple turn the crater into a closing web.',
      'lord-of-terror': 'Director note: the hell-rift rises upward, one red accent in a black frame, so the room feels invaded from below.',
      'sundered-betrayer': 'Director note: fel-eclipse green, horned silhouette, and mirror-side framing sell the betrayed metamorphosis without borrowing a line.',
      'prime-evil': 'Director note: worldstone ember and crown posture frame destruction as a claimant for the stone at the world heart.',
      'lord-of-hatred': 'Director note: the hall going lightless is the signature; the name is original, the beat is recognizable.',
      'forsaken-queen': 'Director note: banshee frost, a suspended arrow, and mercy lost to death carry the silhouette.'
    };
    return `${raid.title}. ${raid.location}. ${raid.dialogue.join(' ')} The Outworld Claimants came for the Ancients' power and were turned back. ${commentary[raid.id] ?? 'Director note: original name and lines, recognizable staging.'}`;
  }

  /** Structured codex view-model — only entries unlocked on encounter (§3.14). */
  codexEntries(): {
    lore: { id: string; thread: string; stage: string; title: string; summary: string; body: string }[];
    heroes: { id: string; name: string; sub: string; lore: string }[];
    regions: { id: string; name: string; lore: string }[];
    items: { id: string; name: string; lore: string }[];
    creeps: { id: string; name: string; lore: string }[];
    raids: { id: string; name: string; title: string; lore: string }[];
    claimants: { id: string; name: string; lore: string }[];
    festivals: { id: string; name: string; summary: string; body: string }[];
    legends: { id: string; name: string; summary: string; body: string }[];
  } {
    this.syncEncounterCodex();
    const has = (id: string): boolean => this.codexUnlocks.has(id);
    return {
      lore: [...REG.loreEntries.values()].filter((l) => has('lore:' + l.id)).map((l) => ({ id: l.id, thread: l.thread, stage: l.stage, title: l.title, summary: l.summary, body: l.body })),
      heroes: [...REG.heroes.values()].filter((h) => has('hero:' + h.id)).map((h) => ({ id: h.id, name: h.name, sub: `${h.attribute.toUpperCase()} · ${h.roles.slice(0, 2).join(' / ')}`, lore: h.lore })),
      regions: [...REG.regions.values()].filter((r) => has('region:' + r.id)).map((r) => ({ id: r.id, name: r.name, lore: r.lore })),
      items: [...REG.items.values()].filter((i) => has('item:' + i.id)).map((i) => ({ id: i.id, name: i.name, lore: i.lore })),
      creeps: [...REG.creeps.values()].filter((c) => has('creep:' + c.id)).map((c) => ({ id: c.id, name: c.name, lore: c.lore ?? `A ${c.tier}-tier denizen of the wilds.` })),
      raids: [...REG.raids.values()].filter((r) => has('raid:' + r.id)).map((r) => ({ id: r.id, name: r.name, title: r.title, lore: `${r.location}. “${r.dialogue[0]}”` })),
      claimants: [...REG.raids.values()]
        .filter((r) => has('claimant:' + r.id))
        .map((r) => ({ id: r.id, name: r.name, lore: this.claimantLore(r) })),
      festivals: [...REG.seasonalEvents.values()].filter((e) => has('festival:' + e.id)).map((e) => ({ id: e.id, name: e.name, summary: e.summary, body: e.codexBody })),
      legends: [...REG.legends.values()].filter((l) => has('legend:' + l.id)).map((l) => ({ id: l.id, name: l.name, summary: l.triggerSummary, body: l.codexBody }))
    };
  }

  /** Structured journal view-model: raids cleared + faction choices + reputation (§3.14). */
  journalSections(): {
    reputation: number;
    badges: string[];
    factions: { regionId: string; regionName: string; heroId: string; heroName: string }[];
    raids: { id: string; name: string; clears: number }[];
    elite: { defeated: number; championDown: boolean };
    titles: { id: string; name: string; note: string }[];
  } {
    const factions = Object.entries(this.factionChoices).map(([regionId, heroId]) => ({
      regionId,
      regionName: REG.regions.get(regionId)?.name ?? regionId,
      heroId,
      heroName: REG.heroes.get(heroId)?.name ?? heroId
    }));
    const raids = Object.entries(this.raidProgress)
      .filter(([, p]) => (p?.clears ?? 0) > 0)
      .map(([id, p]) => ({ id, name: REG.raids.get(id)?.name ?? id, clears: p.clears }));
    const titles: { id: string; name: string; note: string }[] = [];
    if (this.codexUnlocks.has('title:true-champion')) {
      titles.push({ id: 'true-champion', name: 'True Champion', note: "Cleared Roshan's Pit at its hardest — the Aegis is yours by right." });
    }
    return {
      reputation: this.reputation,
      badges: [...this.badges],
      factions,
      raids,
      elite: { defeated: this.eliteFive.defeated, championDown: this.eliteFive.championDown },
      titles
    };
  }

  /** Mark journal entries acknowledged (§3.14). */
  markJournalSeen(ids: string[]): void {
    for (const id of ids) this.journalSeen.add(id);
  }

  // ---------- quests: bounties + chapters (QUEST.md) ----------

  private questContext(): QuestContext {
    const reached = new Set(Object.keys(this.regionVisits));
    reached.add(this.region.id);
    const claimed = new Set<string>();
    const choices = new Map<string, string>();
    for (const [id, q] of Object.entries(this.quests)) {
      if (q.status === 'claimed') claimed.add(id);
      if (q.choice) choices.set(id, q.choice);
    }
    return {
      badges: this.badges.size,
      recruited: this.recruited.size,
      raidClears: this.totalRaidClears(),
      reachedRegions: reached,
      claimedQuests: claimed,
      playtimeSec: this.playtime,
      questChoices: choices
    };
  }

  private questSaveFor(def: QuestDef): QuestSave {
    return normalizeQuestSave(def, this.quests[def.id]);
  }

  /** Keep the save sparse: a default-locked record is implied, not stored. */
  private storeQuestState(def: QuestDef, save: QuestSave): void {
    const isDefault = save.status === 'locked' && save.completions === 0 && save.progress.every((p) => p === 0);
    if (isDefault) delete this.quests[def.id];
    else this.quests[def.id] = save;
  }

  /** Unlock anything whose prereq is now met; re-arm cooled-down bounties. */
  refreshQuests(): void {
    const ctx = this.questContext();
    for (const def of REG.questDefs.values()) {
      this.storeQuestState(def, refreshAvailability(def, this.questSaveFor(def), ctx));
    }
  }

  /** Count a progression beat toward every active quest it matches. */
  advanceQuests(ev: QuestEvent): void {
    this.refreshQuests();
    for (const def of REG.questDefs.values()) {
      const { save, justCompleted } = questAdvance(def, this.questSaveFor(def), ev);
      this.storeQuestState(def, save);
      if (justCompleted) this.msg(`Quest ready to claim: ${def.name} — open the Journal (J).`, 'good');
    }
  }

  /** Claim a completed quest's rewards. Chapters chain into their next quest;
   *  a fork quest takes the chosen branch (its rewards + its own successor). */
  claimQuest(id: string, choiceId?: string): boolean {
    const def = REG.questDefs.get(id);
    if (!def) return false;
    const cur = this.questSaveFor(def);
    if (cur.status !== 'complete') {
      this.msg('That quest is not ready to claim.', 'bad');
      return false;
    }
    const branch = questChosenBranch(def, choiceId);
    const { save, claimed } = questClaim(def, cur, this.questContext(), branch?.id);
    if (!claimed) return false;
    this.storeQuestState(def, save);
    this.msg(`Quest complete: ${def.name}${branch ? ` — ${branch.label}` : ''}`, 'good');
    this.playPresentationStinger('badge');
    for (const r of def.rewards) this.grantQuestReward(r);
    if (branch) for (const r of branch.rewards) this.grantQuestReward(r);
    // `next` is the authoritative chain link: claiming a chapter unlocks its
    // successor once that successor's remaining prereqs are met. A fork instead
    // unlocks the branch it just took. Toast whichever opened.
    const nextId = branch ? branch.next : def.next;
    const nextDef = nextId ? REG.questDefs.get(nextId) : undefined;
    const nextWasLocked = nextDef ? this.questSaveFor(nextDef).status === 'locked' : false;
    this.refreshQuests();
    if (nextDef && nextWasLocked && this.questSaveFor(nextDef).status !== 'locked') {
      this.msg(`New chapter available: ${nextDef.name} — open the Journal (J).`, 'good');
    }
    this.autosave('quest');
    return true;
  }

  private grantHeroXp(rec: RosterEntry, amount: number, cap: number): void {
    if (amount <= 0) return;
    if (rec.unit) {
      const gained = rec.unit.addXp(amount, cap);
      if (gained > 0) {
        rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, rec.unit.level);
        rec.attributePoints = normalizeAttributePoints(rec.heroId, rec.unit.level, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
        rec.unit.refresh(this.sim.time);
      }
      rec.level = rec.unit.level;
      rec.xp = rec.unit.xp;
    } else {
      rec.xp = Math.min(rec.xp + amount, xpForLevel(TUNING.levelCap));
      const newLevel = Math.min(levelFromXp(rec.xp), cap);
      if (newLevel > rec.level) {
        rec.level = newLevel;
        rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, rec.level);
        rec.attributePoints = normalizeAttributePoints(rec.heroId, rec.level, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
      }
    }
  }

  private grantQuestReward(r: QuestReward): void {
    switch (r.kind) {
      case 'gold':
        this.awardGold(r.amount, 'quest', this.activeUnit()?.pos, true);
        this.msg(`Reward: +${r.amount}g`, 'good');
        break;
      case 'xp': {
        const targets = r.scope === 'party' ? this.party : this.party[this.activeIdx] ? [this.party[this.activeIdx]] : [];
        const cap = this.recruitLevelCap();
        for (const rec of targets) this.grantHeroXp(rec, r.amount, cap);
        this.msg(`Reward: +${r.amount} XP${r.scope === 'party' ? ' (party)' : ''}`, 'good');
        break;
      }
      case 'loot-mark':
        this.lootMarks[r.band] = (this.lootMarks[r.band] ?? 0) + r.amount;
        this.msg(`Reward: ${r.amount} ${r.band} loot mark${r.amount === 1 ? '' : 's'}`, 'good');
        break;
      case 'item': {
        if (!REG.items.has(r.itemId)) break;
        const item: ItemSave = { id: r.itemId, ...(r.quality ? { quality: r.quality } : {}) };
        this.inventoryStash.push(item);
        this.recordItemAcquired(item);
        this.msg(`Reward: ${REG.item(r.itemId).name}`, 'good');
        break;
      }
      case 'essence':
        this.essence += r.amount;
        this.msg(`Reward: +${r.amount} essence`, 'good');
        break;
      case 'recruit':
        if (REG.heroes.has(r.heroId) && !this.recruited.has(r.heroId)) {
          this.recruitHero(r.heroId);
        } else {
          this.awardGold(1500, 'quest', this.activeUnit()?.pos, true);
          this.msg(`${REG.heroes.get(r.heroId)?.name ?? r.heroId} already answers your call — 1500g instead.`, 'info');
        }
        break;
      case 'title':
        this.codexUnlocks.add('title:' + r.id);
        this.msg(`Title earned: ${r.name}`, 'good');
        break;
    }
  }

  private rewardLabel(r: QuestReward): string {
    switch (r.kind) {
      case 'gold': return `${r.amount}g`;
      case 'xp': return `${r.amount} XP${r.scope === 'party' ? ' (party)' : ''}`;
      case 'loot-mark': return `${r.amount} ${r.band} loot mark${r.amount === 1 ? '' : 's'}`;
      case 'item': return REG.items.get(r.itemId)?.name ?? r.itemId;
      case 'essence': return `${r.amount} essence`;
      case 'recruit': return `Recruit ${REG.heroes.get(r.heroId)?.name ?? r.heroId}`;
      case 'title': return `Title: ${r.name}`;
    }
  }

  /** Board view-model: every quest the player can see (not locked, not terminal-claimed). */
  questBoard(): {
    id: string; name: string; kind: QuestKind; summary: string; giver?: string; region?: string; regionId?: string;
    status: QuestStatus; objectives: { text: string; have: number; need: number }[];
    rewards: string[]; dialogue?: string[]; claimable: boolean; cooldownLeft?: number; expiresIn?: number;
    choices?: { id: string; label: string; rewards: string[]; note?: string }[];
  }[] {
    this.refreshQuests();
    const out: ReturnType<Game['questBoard']> = [];
    for (const def of REG.questDefs.values()) {
      const save = this.questSaveFor(def);
      if (save.status === 'locked' || save.status === 'claimed') continue;
      out.push({
        id: def.id,
        name: def.name,
        kind: def.kind,
        summary: def.summary,
        giver: def.giver,
        region: def.regionId ? REG.regions.get(def.regionId)?.name : undefined,
        regionId: def.regionId,
        status: save.status,
        objectives: def.objectives.map((obj, i) => ({ text: obj.text, have: save.progress[i] ?? 0, need: obj.count })),
        rewards: def.rewards.map((r) => this.rewardLabel(r)),
        dialogue: def.dialogue,
        claimable: save.status === 'complete',
        cooldownLeft: save.status === 'cooldown' && save.availableAt !== undefined ? Math.max(0, Math.ceil(save.availableAt - this.playtime)) : undefined,
        expiresIn: save.status === 'active' && save.expiresAt !== undefined ? Math.max(0, Math.ceil(save.expiresAt - this.playtime)) : undefined,
        choices: def.choices?.map((c) => ({ id: c.id, label: c.label, rewards: c.rewards.map((r) => this.rewardLabel(r)), note: c.note }))
      });
    }
    // Order: ready-to-claim first (never miss a reward), then the region you are
    // standing in (its bounties are the ones you can act on now), then chapters
    // before bounties, then everything else stably.
    const rank = (s: QuestStatus): number => (s === 'complete' ? 0 : s === 'active' ? 1 : 2);
    const here = this.region.id;
    const local = (rid?: string): number => (rid === here ? 0 : 1);
    out.sort((a, b) =>
      rank(a.status) - rank(b.status) ||
      local(a.regionId) - local(b.regionId) ||
      (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1)
    );
    return out;
  }

  /** Quest-earned titles for the journal (codex-unlocked, named from the reward). */
  questTitles(): { id: string; name: string; note: string }[] {
    const titles: { id: string; name: string; note: string }[] = [];
    const collect = (r: QuestReward) => {
      if (r.kind === 'title' && this.codexUnlocks.has('title:' + r.id)) titles.push({ id: r.id, name: r.name, note: r.note });
    };
    for (const def of REG.questDefs.values()) {
      for (const r of def.rewards) collect(r);
      for (const c of def.choices ?? []) for (const r of c.rewards) collect(r);
    }
    return titles;
  }

  // ---------- walking quest givers (QUEST.md) ----------

  /** Quests posted by a giver: those whose board (QuestDef.giver) matches it. */
  giverQuests(giverId: string): ReturnType<Game['questBoard']> {
    const giver = REG.questGivers.get(giverId);
    if (!giver) return [];
    return this.questBoard().filter((q) => q.giver === giver.board);
  }

  /** A giver's display name (for the HUD hint + board header). */
  questGiverName(giverId: string): string {
    return REG.questGivers.get(giverId)?.name ?? giverId;
  }

  /** Per-frame placement + state for the givers in the current region, so the
   *  renderer can draw a moving NPC marker and pulse it when it has a reward. */
  questGiverViews(): QuestGiverView[] {
    const board = this.questBoard();
    const out: QuestGiverView[] = [];
    for (const g of REG.questGivers.values()) {
      if (g.regionId !== this.region.id) continue;
      const posted = board.filter((q) => q.giver === g.board);
      const p = questGiverPos(g, this.playtime);
      out.push({
        id: g.id,
        name: g.name,
        x: p.x,
        y: p.y,
        hasClaimable: posted.some((q) => q.claimable),
        hasActive: posted.some((q) => q.status === 'active')
      });
    }
    return out;
  }

  // ---------- the Compendium: Atlas (Items) + Heroes (LOOT_OVERHAUL §3.7) ----------

  /**
   * Invert every live drop/shop/gamble source into a per-item index, so the
   * Atlas is derived from the tables and can never drift: add a boss anchor in
   * data and it shows up here for free. Pure read; touches no save state.
   */
  private buildAtlasSourceIndex(): Map<string, { label: string; detail: string }[]> {
    const idx = new Map<string, { label: string; detail: string }[]>();
    const add = (itemId: string, label: string, detail: string): void => {
      if (!REG.items.has(itemId)) return;
      const list = idx.get(itemId) ?? [];
      if (!list.some((s) => s.label === label && s.detail === detail)) list.push({ label, detail });
      idx.set(itemId, list);
    };
    const addDropTable = (table: ItemDropTable | undefined, label: string, detail: string): void => {
      if (!table) return;
      for (const g of table.guaranteed) add(g, label, `${detail} · guaranteed`);
      for (const slot of table.slots) for (const e of slot.pool) add(e.id, label, `${detail} · ${slot.rarity}`);
    };

    for (const boss of REG.bosses.values()) {
      const hero = REG.heroes.get(boss.heroId);
      const label = `${hero?.name ?? boss.heroId} (${boss.rank})`;
      const where = REG.regions.get(boss.region)?.name ?? boss.region;
      for (const g of boss.loot.guaranteed) add(g, label, `${where} · guaranteed`);
      for (const a of boss.loot.assembledPool) add(a, label, `${where} · drop`);
    }
    for (const raid of REG.raids.values()) {
      for (const g of raid.loot.guaranteed) add(g, raid.name, 'Raid · guaranteed');
      for (const a of raid.loot.assembledPool) add(a, raid.name, 'Raid · drop');
    }
    for (const d of REG.dungeons.values()) {
      for (const [roomType, table] of Object.entries(d.loot)) addDropTable(table, d.name, `Dungeon · ${roomType}`);
    }
    for (const c of REG.creeps.values()) {
      if (c.drops) addDropTable(c.drops, c.name, 'Wild creep');
    }
    for (const [tier, table] of Object.entries(DEFAULT_CREEP_DROP_TABLES)) {
      addDropTable(table, `Wild creeps (${tier})`, 'Overworld');
    }
    for (const attribute of ['str', 'agi', 'int']) {
      for (const id of this.echoComponentPool(attribute)) {
        if (itemAllowedFromSource(id, 'echo')) add(id, 'Owned-hero echoes', `${attribute.toUpperCase()} heroes`);
      }
    }
    for (const region of REG.regions.values()) {
      for (const id of region.shopInventory ?? []) add(id, 'Town shop', region.name);
      for (const id of region.secretShop?.inventory ?? []) add(id, 'Secret shop', region.name);
    }
    const relicCeiling = RARITY_RANK[TUNING.blackMarket.relicRarityCeiling];
    for (const item of REG.items.values()) {
      if (!itemAllowedFromSource(item.id, 'gamble')) continue;
      if (['component', 'basic'].includes(item.tier)) add(item.id, 'Black Market', 'Recipe wheel');
      if (isMainItemTier(item.tier) && !GATED_TOP_TIER.has(item.id)) {
        const rank = RARITY_RANK[item.rarity ?? 'common'];
        if (rank >= RARITY_RANK.rare && rank <= relicCeiling) add(item.id, 'Black Market', 'Relic wheel');
      }
    }
    return idx;
  }

  /**
   * The Items tab / loot Atlas: for every encountered item, its identity,
   * recipe (flagging the drop-gated core), the quality grades it can wear, and
   * every source computed live from the drop tables (LOOT_OVERHAUL §3.7).
   */
  atlasEntries(): {
    items: {
      id: string;
      name: string;
      rarity: ItemRarity;
      tier: string;
      cost: number;
      reserved: string;
      recipe: { id: string; name: string; gated: boolean }[];
      recipeCost: number;
      qualities: string[];
      sources: { label: string; detail: string }[];
      lore: string;
    }[];
  } {
    this.syncEncounterCodex();
    const index = this.buildAtlasSourceIndex();
    const qualities = Object.values(QUALITY_GRADES).map((q) => q.name);
    const items = [...REG.items.values()]
      .filter((def) => this.codexUnlocks.has('item:' + def.id))
      .map((def) => ({
        id: def.id,
        name: def.name,
        rarity: (def.rarity ?? 'common') as ItemRarity,
        tier: def.tier,
        cost: def.cost,
        reserved: def.exclusiveTo && def.exclusiveTo.length > 0 ? def.exclusiveTo.join('/') + '-only' : '',
        recipe: (def.components ?? []).map((cid) => ({
          id: cid,
          name: REG.items.get(cid)?.name ?? cid,
          gated: shouldBindDroppedItem(cid)
        })),
        recipeCost: def.recipeCost ?? 0,
        qualities,
        sources: index.get(def.id) ?? [],
        lore: def.lore
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { items };
  }

  /**
   * The Heroes tab: every encountered hero projected from `HeroDef` (abilities,
   * the full 4-tier talent tree, facets, Aghs), with an owned hero's live level
   * and talent picks overlaid. Pure projection; writes nothing (LOOT_OVERHAUL §3.7).
   */
  heroCompendium(): {
    heroes: {
      id: string;
      name: string;
      title: string;
      attribute: string;
      roles: string[];
      lore: string;
      owned: boolean;
      level: number | null;
      abilities: { name: string; ult: boolean; kind: string; lore: string; effect: string[]; cooldown: string; manaCost: string }[];
      talents: { level: number; options: [string, string]; picked: 0 | 1 | null }[];
      facets: { name: string; description: string }[];
      aghs: { name: string; description: string; implemented: boolean } | null;
    }[];
  } {
    this.syncEncounterCodex();
    const owned = new Map(this.allOwnedHeroSaves().map((h) => [h.heroId, h]));
    const heroes = [...REG.heroes.values()]
      .filter((h) => this.codexUnlocks.has('hero:' + h.id))
      .map((h) => {
        const save = owned.get(h.id);
        return {
          id: h.id,
          name: h.name,
          title: h.title,
          attribute: h.attribute.toUpperCase(),
          roles: h.roles,
          lore: h.lore,
          owned: !!save,
          level: save?.level ?? null,
          abilities: h.abilities.map((a) => {
            const card = buildAbilityCard(a);
            return {
              name: a.name,
              ult: !!a.ult,
              kind: card.kind,
              lore: a.lore ?? '',
              effect: card.effect,
              cooldown: a.cooldown && a.cooldown.length > 0 ? a.cooldown.join('/') + 's' : '—',
              manaCost: a.manaCost && a.manaCost.length > 0 ? a.manaCost.join('/') : '—'
            };
          }),
          talents: h.talents.map((t, i) => ({
            level: t.level,
            options: [t.options[0].name, t.options[1].name] as [string, string],
            picked: save?.talentPicks?.[i] ?? null
          })),
          facets: h.facets.map((f) => ({ name: f.name, description: f.description })),
          aghs: h.aghanim
            ? { name: h.aghanim.name, description: h.aghanim.description, implemented: h.aghanim.implemented }
            : null
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { heroes };
  }

  // ---------- neutral items + Tinker's Bench (§3.7) ----------

  private neutralCandidates(): NeutralItemDef[] {
    return [...REG.neutralItems.values()];
  }

  private instantiateNeutralCopy(id: string, difficulty: DifficultyTier, seed: number): ItemSave {
    const rng = new Rng(seed);
    const def = REG.neutralItem(id);
    const grade = rollGrade(neutralGradeFloor(difficulty), rng.next());
    const gradeRoll = rng.next();
    return {
      id,
      grade,
      gradeRoll,
      resolvedMods: neutralGradeMods(def, grade, gradeRoll)
    };
  }

  private rollNeutralFor(tier: CreepTier, salt: number): void {
    const seed = this.region.seed + Math.round(this.sim.time * 1000) + salt;
    const drop = rollNeutralDrop(tier, this.neutralCandidates(), seed);
    if (!drop) return;
    const copy = this.instantiateNeutralCopy(drop.id, creepCombatTier(this.region.id), seed + 1);
    this.addNeutralCopy(copy);
    this.msg(`Neutral drop: ${drop.name} (${copy.grade ?? 'standard'}, → stash)`, 'good');
  }

  private rollItemDropsForCreep(creepId: string | undefined, tier: CreepTier, salt: number, difficulty: DifficultyTier = 'normal', pos?: Vec2): void {
    const table = (creepId ? REG.creep(creepId).drops : undefined) ?? DEFAULT_CREEP_DROP_TABLES[tier];
    const seed = stableContentSeed(`${this.region.id}:creep-drops:${tier}:${difficulty}`, Math.round(this.sim.time * 1000) + salt);
    const roll = rollItemDrops(table, difficulty, {}, new Rng(seed), this.currentLootBand(), {
      gradeFloorBump: this.regionalGradeFloorBump(),
      gradeFloorMin: this.regionalGradeFloorMin(this.region.id),
      regionId: this.region.id,
      endgameUnlocked: this.endgameAffixUnlocked(difficulty)
    });
    if (roll.items.length === 0) return;
    this.spawnGroundItems(roll.items, pos ?? this.activeUnit()?.pos ?? this.region.town.pos, { source: 'creep' });
    const names = roll.items.map((it) => REG.item(it.id).name).join(', ');
    this.msg(`Creep drop: ${names} (on the ground)`, 'good', this.dropAccent(roll.items));
  }

  private rollEliteCreepDrop(tier: CreepTier, salt: number, pos?: Vec2): void {
    const difficulty = creepCombatTier(this.region.id);
    const minRank = tier === 'small' ? RARITY_RANK.uncommon : tier === 'medium' ? RARITY_RANK.rare : RARITY_RANK.mythical;
    const candidates = [...REG.items.values()]
      .filter((item) => isMainItemTier(item.tier))
      .filter((item) => RARITY_RANK[this.itemRarity(item.id)] >= minRank)
      .filter((item) => itemAllowedFromSource(item.id, 'creep'))
      .filter((item) => !GATED_TOP_TIER.has(item.id))
      .map((item) => item.id);
    const id = this.rollMarketItem(candidates, `elite-creep:${tier}:${salt}`);
    if (!id) return;
    const floorMin = this.regionalGradeFloorMin(this.region.id, 'elite');
    const item = instantiateDroppedItem(id, difficulty, new Rng(stableContentSeed(`elite-creep-copy:${id}`, salt)), undefined, 'elite', this.regionalGradeFloorBump(), this.endgameAffixUnlocked(difficulty), floorMin, this.region.id);
    const items = [item];
    const secondChance = tier === 'large'
      ? { normal: 0.4, nightmare: 0.55, hell: 0.7 }[difficulty]
      : tier === 'ancient'
        ? { normal: 0.55, nightmare: 0.7, hell: 0.85 }[difficulty]
        : 0;
    const secondRng = new Rng(stableContentSeed(`elite-creep-second:${tier}:${salt}`, this.inventoryStash.length));
    if (secondChance > 0 && secondRng.chance(secondChance)) {
      const secondId = this.rollMarketItem(candidates.filter((candidate) => candidate !== id), `elite-creep-second:${tier}:${salt}`) ?? id;
      items.push(instantiateDroppedItem(secondId, difficulty, new Rng(stableContentSeed(`elite-creep-second-copy:${secondId}`, salt)), undefined, 'elite', this.regionalGradeFloorBump(), this.endgameAffixUnlocked(difficulty), floorMin, this.region.id));
    }
    const drops = this.spawnGroundItems(items, pos ?? this.activeUnit()?.pos ?? this.region.town.pos, { source: 'creep' }).map((drop) => drop.item);
    if (drops.length > 0) this.msg(`Elite drop: ${REG.item(id).name} (on the ground)`, 'good', this.dropAccent(drops));
  }

  private addDroppedItems(items: ItemSave[], opts: { awardMarks?: boolean } = {}): ItemSave[] {
    const drops: ItemSave[] = [];
    const filtered = applyLootFilter(items.map(bindIfNeeded), (item) => this.itemRarity(item.id), this.lootFilter);
    for (const junk of filtered.disenchanted) {
      this.essence += junk.essence;
      this.goldSinks.salvages += 1;
    }
    for (const it of filtered.kept) {
      const drop = bindIfNeeded(it);
      this.inventoryStash.push(drop);
      this.codexUnlock('item:' + drop.id);
      drops.push(drop);
    }
    for (const it of filtered.suppressed) {
      const drop = bindIfNeeded(it);
      this.inventoryStash.push(drop);
      this.codexUnlock('item:' + drop.id);
    }
    if (filtered.disenchanted.length > 0) {
      const essence = filtered.disenchanted.reduce((sum, junk) => sum + junk.essence, 0);
      this.msg(`Loot filter disenchanted ${filtered.disenchanted.length} item${filtered.disenchanted.length === 1 ? '' : 's'} (+${essence} essence)`, 'info');
    }
    if (opts.awardMarks !== false) this.awardLootMarksForItems(drops);
    this.lootMoment(drops);
    return drops;
  }

  private rollHeroLoadoutDrop(victim: Unit): void {
    if (this.heroDropVictims.has(victim.uid)) return;
    const equipped = victim.items
      .map((it) => itemSaveOf(it, this.sim.time))
      .filter((it): it is ItemSave => !!it && isMainItemTier(REG.item(it.id).tier));
    if (equipped.length === 0) return;
    this.heroDropVictims.add(victim.uid);
    const rng = new Rng(stableContentSeed(`hero-loadout-drop:${victim.uid}`, Math.round(this.playtime)));
    const picked = equipped[Math.floor(rng.next() * equipped.length)];
    const gradeIdx = ITEM_GRADES.indexOf(picked.grade ?? 'standard');
    const grade = ITEM_GRADES[Math.max(0, gradeIdx - 1)];
    const item = refreshResolvedMods({ ...picked, grade, bound: true }, REG.item(picked.id));
    const drops = this.spawnGroundItems([item], victim.pos, { source: 'special-battle' }).map((drop) => drop.item);
    if (drops.length > 0) this.msg(`Hero drop: ${REG.item(item.id).name} (${grade}, on the ground)`, 'good', this.dropAccent(drops));
  }

  /** The component pool an owned-hero echo can drop, by the hero's attribute. Single source of truth for the live table and the Atlas inversion. */
  private echoComponentPool(attribute: string): string[] {
    return attribute === 'agi'
      ? ['band-of-elvenskin', 'blade-of-alacrity', 'eaglesong', 'ultimate-orb']
      : attribute === 'str'
        ? ['belt-of-strength', 'ogre-axe', 'reaver', 'vitality-booster']
        : ['robe-of-the-magi', 'staff-of-wizardry', 'mystic-staff', 'void-stone'];
  }

  private echoComponentTable(heroId: string): ItemDropTable {
    const hero = REG.hero(heroId);
    const pool = this.echoComponentPool(hero.attribute);
    return {
      guaranteed: [],
      slots: [
        {
          id: `${heroId}-echo-component`,
          rarity: 'rare',
          rolls: 1,
          chance: { normal: 0.55, nightmare: 0.65, hell: 0.75 },
          pool: pool.filter((id) => itemAllowedFromSource(id, 'echo')).map((id) => ({ id, weight: REG.item(id).cost })),
          source: 'echo'
        },
        {
          id: `${heroId}-echo-endgame`,
          rarity: 'legendary',
          rolls: 1,
          chance: TUNING.overworldEgSlotPct.echo,
          pool: this.echoEndgamePool(hero.attribute).map((id) => ({ id, weight: REG.item(id).cost, rarity: REG.item(id).rarity ?? 'legendary' })),
          qualityOddsByTier: qualityOddsByTier(),
          source: 'echo',
          raritySplit: true
        }
      ]
    };
  }

  private echoEndgamePool(attribute: string): string[] {
    const ids = attribute === 'agi'
      ? ['manta-style', 'daedalus', 'monkey-king-bar', 'mjollnir', 'silver-edge', 'moon-shard']
      : attribute === 'str'
        ? ['black-king-bar', 'assault-cuirass', 'sange-and-yasha', 'guardian-greaves', 'bloodstone']
        : ['shivas-guard', 'ethereal-blade', 'wind-waker', 'kaya-and-sange', 'yasha-and-kaya', 'bloodstone'];
    return ids.filter((id) => REG.items.has(id) && RARITY_RANK[REG.item(id).rarity ?? 'common'] >= RARITY_RANK.legendary && itemAllowedFromSource(id, 'echo') && !GATED_TOP_TIER.has(id));
  }

  private rollEchoComponentDrop(heroId: string): ItemSave[] {
    const difficulty = creepCombatTier(this.region.id);
    const seed = stableContentSeed(`${heroId}:echo-drop:${difficulty}`, this.party.find((r) => r.heroId === heroId)?.echo.kills ?? 0);
    const roll = rollItemDrops(this.echoComponentTable(heroId), difficulty, {}, new Rng(seed), this.currentLootBand(), {
      gradeFloorBump: this.regionalGradeFloorBump(),
      gradeFloorMin: this.regionalGradeFloorMin(this.region.id),
      regionId: this.region.id,
      endgameUnlocked: this.endgameAffixUnlocked(difficulty)
    });
    if (roll.items.length === 0) return [];
    const drops = this.addDroppedItems(roll.items);
    this.msg(`Echo drop: ${roll.items.map((it) => REG.item(it.id).name).join(', ')} (→ Armory)`, 'good', this.dropAccent(roll.items));
    return drops;
  }

  private addNeutral(id: string, n = 1): void {
    const slot = this.neutralStash.find((s) => s.id === id);
    if (slot) slot.count += n;
    else this.neutralStash.push({ id, count: n });
  }

  private addNeutralCopy(copy: ItemSave): void {
    const slot = this.neutralStash.find((s) => s.id === copy.id);
    if (slot) {
      slot.count += 1;
      slot.copies = [...(slot.copies ?? []), cloneItemSave(copy)!];
    } else {
      this.neutralStash.push({ id: copy.id, count: 1, copies: [cloneItemSave(copy)!] });
    }
  }

  private takeNeutral(id: string): ItemSave | null {
    const slot = this.neutralStash.find((s) => s.id === id);
    if (!slot || slot.count <= 0) return null;
    slot.count -= 1;
    const copy = slot.copies?.shift() ?? { id };
    if (slot.count <= 0) this.neutralStash = this.neutralStash.filter((s) => s.id !== id);
    return copy;
  }

  /** Re-apply a hero's neutral-slot passive mods to its live unit (mirrors resonance/day-night). */
  private applyNeutralToUnit(rec: RosterEntry): void {
    const u = rec.unit;
    if (!u) {
      rec.neutralMods = neutralPassiveMods(rec.neutralSlot);
      return;
    }
    for (const [k, v] of Object.entries(rec.neutralMods ?? {})) {
      u.externalMods[k] = (u.externalMods[k] ?? 0) - v;
    }
    rec.neutralMods = neutralPassiveMods(rec.neutralSlot);
    for (const [k, v] of Object.entries(rec.neutralMods)) {
      u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
    }
    u.markStatsDirty();
    u.refresh(this.sim.time);
  }

  /** Slot a neutral from the stash into a hero's dedicated neutral slot; old one returns to stash (§3.7). */
  equipNeutral(recIdx: number, neutralId: string): boolean {
    const rec = this.party[recIdx];
    if (!rec) return false;
    const copy = this.takeNeutral(neutralId);
    if (!copy) {
      this.msg('No such neutral in the stash', 'bad');
      return false;
    }
    if (rec.neutralSlot) this.addNeutralCopy(rec.neutralSlot); // never lost — returns to stash
    rec.neutralSlot = copy;
    this.applyNeutralToUnit(rec);
    this.msg(`${REG.hero(rec.heroId).name} slots ${REG.neutralItem(neutralId).name}`, 'good');
    return true;
  }

  /** Dota-style neutral active fired from a dedicated key (§3.7), outside the four item binds. */
  useNeutralActive(): void {
    const id = this.party[this.activeIdx]?.neutralSlot?.id;
    if (!id) {
      this.msg('No neutral item slotted', 'info');
      return;
    }
    const def = REG.neutralItem(id);
    if (!def.active) {
      this.msg(`${def.name} is passive — no active to fire`, 'info');
      return;
    }
    this.msg(`${def.name} active fired`, 'good');
  }

  /** Return a hero's slotted neutral to the stash (Tinker's Bench reclaim; never sells, §3.7). */
  reclaimNeutral(recIdx: number): boolean {
    const rec = this.party[recIdx];
    if (!rec?.neutralSlot) return false;
    const cost = TUNING.tinkersBench.reclaimCost;
    if (this.gold < cost) {
      this.msg(`Reclaim costs ${cost}g`, 'bad');
      return false;
    }
    const name = REG.neutralItem(rec.neutralSlot.id).name;
    this.gold -= cost;
    this.addNeutralCopy(rec.neutralSlot);
    rec.neutralSlot = null;
    this.applyNeutralToUnit(rec);
    this.msg(`Reclaimed ${name} to the stash (-${cost}g)`, 'info');
    return true;
  }

  /** Equip an item from the Armory stash into a fielded or benched hero. */
  equipArmoryItemForHero(heroId: string, stashIdx: number): boolean {
    const hero = this.heroSnapshot(heroId);
    const saved = this.inventoryStash[stashIdx];
    if (!hero || !saved) return false;
    if (isGemId(saved.id)) {
      this.msg('Gems must be socketed at the Tinker\'s Bench', 'bad');
      return false;
    }
    const savedDef = REG.item(saved.id);
    const req = itemLevelRequirement(savedDef, saved.grade ?? 'standard');
    if (hero.level < req) {
      this.msg(`${savedDef.name} requires level ${req}`, 'bad');
      return false;
    }

    const items = normalizeSavedItems(hero.items);
    const free = items.findIndex((it) => it === null);
    if (free < 0) {
      this.msg('Inventory full', 'bad');
      return false;
    }

    this.inventoryStash.splice(stashIdx, 1);
    items[free] = { ...saved };
    this.setHeroItems(heroId, items);
    this.codexUnlock('item:' + saved.id);
    this.msg(`${REG.hero(heroId).name} equips ${REG.item(saved.id).name}`, 'good');
    return true;
  }

  private augmentKindForItem(itemId: string): keyof HeroAugments | null {
    if (itemId === 'aghanims-scepter' || itemId === 'aghanims-blessing') return 'scepter';
    if (itemId === 'aghanims-shard') return 'shard';
    return null;
  }

  private applyHeroAugment(heroId: string, itemId: string): boolean {
    const kind = this.augmentKindForItem(itemId);
    const hero = this.heroSnapshot(heroId);
    if (!kind || !hero) return false;
    const augments = { ...(hero.augments ?? {}) };
    if (augments[kind]) {
      this.msg(`${REG.hero(heroId).name} already has that Aghanim augment`, 'info');
      return false;
    }
    augments[kind] = true;
    this.setHeroAugments(heroId, augments);
    this.msg(`${REG.hero(heroId).name} absorbed ${REG.item(itemId).name}`, 'good');
    return true;
  }

  applyArmoryAugmentForHero(heroId: string, stashIdx: number): boolean {
    const saved = this.inventoryStash[stashIdx];
    if (!saved || !this.augmentKindForItem(saved.id)) {
      this.msg('Choose Aghanim\'s Scepter, Blessing, or Shard', 'bad');
      return false;
    }
    if (!this.applyHeroAugment(heroId, saved.id)) return false;
    this.inventoryStash.splice(stashIdx, 1);
    return true;
  }

  applyEquippedAugmentForHero(heroId: string, invSlot: number): boolean {
    const hero = this.heroSnapshot(heroId);
    if (!hero) return false;
    const items = normalizeSavedItems(hero.items);
    const saved = items[invSlot];
    if (!saved || !this.augmentKindForItem(saved.id)) {
      this.msg('Choose an equipped Aghanim item', 'bad');
      return false;
    }
    if (!this.applyHeroAugment(heroId, saved.id)) return false;
    items[invSlot] = null;
    this.setHeroItems(heroId, items);
    return true;
  }

  /** Back-compat wrapper: party-index Armory equip used by older UI/tests. */
  equipArmoryItem(recIdx: number, stashIdx: number): boolean {
    const heroId = this.party[recIdx]?.heroId;
    return heroId ? this.equipArmoryItemForHero(heroId, stashIdx) : false;
  }

  /** Return a bound main-slot item to the Armory. Liquid items still sell through the shop path. */
  reclaimArmoryItemForHero(heroId: string, invSlot: number): boolean {
    const hero = this.heroSnapshot(heroId);
    if (!hero) return false;
    const items = normalizeSavedItems(hero.items);
    const saved = items[invSlot];
    if (!saved?.bound) {
      this.msg('Only bound items return to the Armory', 'bad');
      return false;
    }
    items[invSlot] = null;
    this.setHeroItems(heroId, items);
    this.inventoryStash.push(saved);
    this.msg(`Returned ${REG.item(saved.id).name} to the Armory`, 'info');
    return true;
  }

  /** Back-compat wrapper: party-index Armory reclaim used by older UI/tests. */
  reclaimArmoryItem(recIdx: number, invSlot: number): boolean {
    const heroId = this.party[recIdx]?.heroId;
    return heroId ? this.reclaimArmoryItemForHero(heroId, invSlot) : false;
  }

  reclaimAllArmoryItemsForHero(heroId: string): number {
    const hero = this.heroSnapshot(heroId);
    if (!hero) return 0;
    const items = normalizeSavedItems(hero.items);
    let moved = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it?.bound) continue;
      this.inventoryStash.push(it);
      items[i] = null;
      moved += 1;
    }
    if (moved > 0) {
      this.setHeroItems(heroId, items);
      this.msg(`Returned ${moved} item${moved === 1 ? '' : 's'} from ${REG.hero(heroId).name}`, 'info');
    }
    return moved;
  }

  applyHeroLoadout(heroId: string, name = 'Default'): { ok: boolean; missing: string[] } {
    const desired = this.heroLoadout(heroId, name);
    const hero = this.heroSnapshot(heroId);
    if (!desired || !hero) return { ok: false, missing: [] };

    const current = normalizeSavedItems(hero.items);
    const next: (ItemSave | null)[] = [null, null, null, null, null, null];
    const usedCurrent = new Set<number>();
    const missing: string[] = [];
    const stashPicks: { slot: number; stashIdx: number; item: ItemSave }[] = [];

    desired.forEach((id, slot) => {
      if (!id) return;
      const currentIdx = current.findIndex((it, i) => !usedCurrent.has(i) && it?.id === id);
      if (currentIdx >= 0) {
        usedCurrent.add(currentIdx);
        next[slot] = current[currentIdx] ? { ...current[currentIdx]! } : null;
        return;
      }
      const reserved = new Set(stashPicks.map((p) => p.stashIdx));
      const stashIdx = this.inventoryStash.findIndex((it, i) => !reserved.has(i) && it.bound && it.id === id);
      if (stashIdx < 0) {
        missing.push(id);
        return;
      }
      stashPicks.push({ slot, stashIdx, item: { ...this.inventoryStash[stashIdx] } });
    });

    if (missing.length > 0) {
      const names = [...new Set(missing)].map((id) => REG.item(id).name).join(', ');
      this.msg(`${REG.hero(heroId).name}'s loadout is missing: ${names}`, 'bad');
      return { ok: false, missing };
    }

    for (const pick of [...stashPicks].sort((a, b) => b.stashIdx - a.stashIdx)) {
      this.inventoryStash.splice(pick.stashIdx, 1);
    }
    for (const pick of stashPicks) next[pick.slot] = pick.item;

    for (let i = 0; i < current.length; i++) {
      const it = current[i];
      if (!it || usedCurrent.has(i)) continue;
      if (it.bound) {
        this.inventoryStash.push(it);
      } else {
        const free = next.findIndex((slot) => slot === null);
        if (free >= 0) next[free] = it;
      }
    }

    this.setHeroItems(heroId, next);
    this.msg(`Applied ${REG.hero(heroId).name}'s ${this.cleanLoadoutName(name)} loadout`, 'good');
    return { ok: true, missing: [] };
  }

  gearFieldLoadouts(name = 'Default'): { applied: number; failed: string[]; conflicts: { itemId: string; requested: number; owned: number; claimedBy: string[] }[] } {
    const conflicts = this.loadoutConflicts(name);
    if (conflicts.length > 0) {
      this.msg('Resolve loadout contention before gearing the field', 'bad');
      return { applied: 0, failed: this.party.map((rec) => rec.heroId), conflicts };
    }

    let applied = 0;
    const failed: string[] = [];
    for (const rec of this.party) {
      if (!this.heroLoadout(rec.heroId, name)) continue;
      const res = this.applyHeroLoadout(rec.heroId, name);
      if (res.ok) applied += 1;
      else failed.push(rec.heroId);
    }
    if (applied > 0) this.msg(`Equipped ${applied} fielded loadout${applied === 1 ? '' : 's'}`, 'good');
    return { applied, failed, conflicts: [] };
  }

  private blackMarketCost(kind: 'recipe' | 'relic'): number {
    if (kind === 'recipe') return TUNING.blackMarket.recipeWheelCost;
    return TUNING.blackMarket.relicWheelBaseCost + this.goldSinks.gambleRolls * TUNING.blackMarket.relicWheelStepCost;
  }

  /** Seeded quality roll for a gambled copy; Unusual stays out of any gamble pool. */
  private rollGambleQuality(odds: Partial<Record<ItemQuality, number>>, seed: number): ItemQuality | undefined {
    const order: ItemQuality[] = ['corrupted', 'inscribed', 'frozen', 'genuine'];
    const r = new Rng(seed).next();
    let acc = 0;
    for (const q of order) {
      acc += odds[q] ?? 0;
      if (r < acc) return q;
    }
    return undefined;
  }

  private roamingMerchantStock(): ItemDef[] {
    const visitCount = Math.max(1, this.regionVisits[this.region.id] ?? 1);
    const refreshIndex = Math.floor((visitCount - 1) / Math.max(1, TUNING.merchantRefreshPerVisits));
    const seeded = [...REG.items.values()]
      .filter((item) => isMainItemTier(item.tier))
      .filter((item) => itemAllowedFromSource(item.id, 'shop'))
      .filter((item) => !GATED_TOP_TIER.has(item.id))
      .map((item) => ({
        item,
        key: stableContentSeed(`roaming-merchant:${this.region.id}:${item.id}`, refreshIndex)
      }));
    return seeded.sort((a, b) => a.key - b.key).slice(0, 6).map((entry) => entry.item);
  }

  private merchantPrice(item: ItemDef, grade: MerchantGrade): number {
    return Math.round(item.cost * TUNING.merchantGradeMultiplier[grade]);
  }

  /** Town Black Market view-model: live wheel costs and the reserved relic ceiling. */
  blackMarketView(): {
    inTown: boolean;
    gold: number;
    essence: number;
    lootMarks: { band: LootBand; marks: number; quota: number; canRedeem: boolean }[];
    recipeCost: number;
    recipeRarities: ItemRarity[];
    relicCost: number;
    relicCeiling: ItemRarity;
    roamingMerchant: {
      id: string;
      name: string;
      tier: Extract<ItemTier, 't1' | 't2' | 't3' | 't4'>;
      rarity: ItemRarity;
      grades: { grade: MerchantGrade; price: number; canBuy: boolean }[];
    }[];
    gambleVendor: { tier: Extract<ItemTier, 't1' | 't2' | 't3' | 't4'>; slot: GambleSlot; price: number; canRoll: boolean; pity: boolean }[];
  } {
    const bands: LootBand[] = ['early', 'mid', 'late'];
    const gambleTiers = ['t1', 't2', 't3', 't4'] as const;
    return {
      inTown: this.inTown(),
      gold: Math.floor(this.gold),
      essence: this.essence,
      lootMarks: bands.map((band) => ({
        band,
        marks: this.lootMarks[band] ?? 0,
        quota: TUNING.loot.bandMarkQuota[band],
        canRedeem: this.inTown() && (this.lootMarks[band] ?? 0) >= TUNING.loot.bandMarkQuota[band]
      })),
      recipeCost: this.blackMarketCost('recipe'),
      recipeRarities: ['uncommon', 'rare', 'mythical'],
      relicCost: this.blackMarketCost('relic'),
      relicCeiling: TUNING.blackMarket.relicRarityCeiling,
      roamingMerchant: this.roamingMerchantStock().map((item) => ({
        id: item.id,
        name: item.name,
        tier: item.tier as Extract<ItemTier, 't1' | 't2' | 't3' | 't4'>,
        rarity: this.itemRarity(item.id),
        grades: MERCHANT_GRADES.map((grade) => {
          const price = this.merchantPrice(item, grade);
          return { grade, price, canBuy: this.inTown() && this.gold >= price };
        })
      })),
      gambleVendor: gambleTiers.flatMap((tier) => GAMBLE_SLOTS.map((slot) => ({
        tier,
        slot,
        price: TUNING.gambleVendor.tierPrice[tier],
        canRoll: this.inTown() && this.gold >= TUNING.gambleVendor.tierPrice[tier],
        pity: this.gambleVendorPityReady()
      })))
    };
  }

  private itemRarity(id: string): ItemRarity {
    return REG.item(id).rarity ?? 'common';
  }

  private lootBandForRegion(regionId: string): LootBand {
    const mult = TUNING.regionRewardMult[regionId as keyof typeof TUNING.regionRewardMult] ?? 1;
    if (mult >= 2.0) return 'late';
    if (mult >= 1.4) return 'mid';
    return 'early';
  }

  private currentLootBand(): LootBand {
    return this.lootBandForRegion(this.region.id);
  }

  private awardLootMarks(count: number, band: LootBand = this.currentLootBand()): number {
    const n = Math.max(0, Math.floor(count));
    if (n <= 0) return 0;
    this.lootMarks[band] = Math.max(0, (this.lootMarks[band] ?? 0) + n);
    return n;
  }

  private awardLootMarksForItems(items: ItemSave[], band: LootBand = this.currentLootBand()): number {
    const count = items.filter((it) => RARITY_RANK[this.itemRarity(it.id)] >= RARITY_RANK.rare).length;
    return this.awardLootMarks(count, band);
  }

  private rollMarketItem(candidates: string[], salt: string): string | null {
    if (candidates.length === 0) return null;
    const rng = new Rng(stableContentSeed(`black-market:${salt}`, Math.round(this.playtime) + this.gold + this.inventoryStash.length));
    const weighted = candidates.map((id) => ({ id, weight: Math.max(1, REG.item(id).cost) }));
    const total = weighted.reduce((sum, e) => sum + e.weight, 0);
    let draw = rng.range(0, total);
    for (const entry of weighted) {
      draw -= entry.weight;
      if (draw <= 0) return entry.id;
    }
    return weighted[weighted.length - 1].id;
  }

  private gambleVendorPityReady(): boolean {
    return TUNING.gambleVendor.pity > 0 && (this.goldSinks.gambleRolls + 1) % TUNING.gambleVendor.pity === 0;
  }

  private gambleSlotMatches(item: ItemDef, slot: GambleSlot): boolean {
    if (slot === 'any') return true;
    const pools = affixPoolForItem(item);
    if (slot === 'weapon') return pools.includes('weapon-like');
    if (slot === 'armor') return pools.includes('armor-like');
    if (slot === 'caster') return pools.includes('caster-like');
    return pools.includes('mobility');
  }

  private instantiateMarketItem(id: string, source: DropSource | GradeFloorSource, salt: string, opts: { bound?: boolean; quality?: ItemQuality; gradeFloorMin?: ItemGrade } = {}): ItemSave {
    const item = instantiateDroppedItem(
      id,
      creepCombatTier(this.region.id),
      new Rng(stableContentSeed(`market-copy:${source}:${salt}:${id}`, Math.round(this.playtime))),
      opts.quality,
      source,
      this.regionalGradeFloorBump(),
      this.endgameAffixUnlocked(),
      opts.gradeFloorMin ?? this.regionalGradeFloorMin(this.region.id, source as GradeFloorSource),
      this.region.id
    );
    if (opts.bound) item.bound = true;
    return item;
  }

  private instantiateMerchantItem(id: string, grade: MerchantGrade, salt: string): ItemSave {
    const def = REG.item(id);
    const difficulty = creepCombatTier(this.region.id);
    const rng = new Rng(stableContentSeed(`merchant-copy:${this.region.id}:${salt}:${id}:${grade}`, Math.round(this.playtime)));
    const gradeRoll = rng.next();
    const affixes = rollAffixesFor(def, grade, difficulty, rng, this.endgameAffixUnlocked(difficulty), this.region.id);
    const sockets = socketsForDrop(grade, def.socketCap ?? 0, rng.next());
    return refreshResolvedMods({ id, grade, gradeRoll, affixes, sockets, bound: true }, def);
  }

  roamingMerchantBuy(itemId: string, grade: MerchantGrade): ItemSave | null {
    if (!this.inTown()) {
      this.msg('The roaming merchant trades from town', 'bad');
      return null;
    }
    if (!MERCHANT_GRADES.includes(grade)) {
      this.msg('The merchant only sells Worn through Refined grades', 'bad');
      return null;
    }
    const def = this.roamingMerchantStock().find((item) => item.id === itemId);
    if (!def) {
      this.msg('That merchant offer is gone', 'bad');
      return null;
    }
    const cost = this.merchantPrice(def, grade);
    if (this.gold < cost) {
      this.msg(`${def.name} (${grade}) costs ${cost}g`, 'bad');
      return null;
    }
    this.gold -= cost;
    const item = this.instantiateMerchantItem(def.id, grade, `buy:${this.inventoryStash.length}:${this.goldSinks.gambleRolls}`);
    this.addDroppedItems([item], { awardMarks: false });
    this.msg(`Roaming merchant: ${def.name} (${grade}, bound, → Armory)`, 'good', this.dropAccent([item]));
    return item;
  }

  /** Cheap Black Market roll for liquid recipe pieces/components; reserved drops stay excluded. */
  blackMarketRecipeWheel(rarity: ItemRarity = 'rare'): ItemSave | null {
    if (!this.inTown()) {
      this.msg('The Black Market trades from town', 'bad');
      return null;
    }
    const cost = this.blackMarketCost('recipe');
    if (this.gold < cost) {
      this.msg(`Recipe wheel costs ${cost}g`, 'bad');
      return null;
    }
    const candidates = [...REG.items.values()]
      .filter((item) => ['component', 'basic'].includes(item.tier))
      .filter((item) => this.itemRarity(item.id) === rarity)
      .filter((item) => itemAllowedFromSource(item.id, 'gamble'))
      .map((item) => item.id);
    const id = this.rollMarketItem(candidates, `recipe:${rarity}:${this.goldSinks.gambleRolls}`);
    if (!id) {
      this.msg(`No ${rarity} recipe stock is available`, 'bad');
      return null;
    }
    this.gold -= cost;
    this.goldSinks.gambleRolls += 1;
    const item = this.instantiateMarketItem(id, 'gamble', `recipe:${rarity}:${this.goldSinks.gambleRolls}`);
    this.addDroppedItems([item], { awardMarks: false });
    this.msg(`Recipe wheel: ${REG.item(id).name} (→ Armory)`, 'good', this.dropAccent([item]));
    return item;
  }

  /** Expensive Black Market roll for bound assembled relics, capped below reserved prestige. */
  blackMarketRelicWheel(maxRarity: ItemRarity = TUNING.blackMarket.relicRarityCeiling): ItemSave | null {
    if (!this.inTown()) {
      this.msg('The Black Market trades from town', 'bad');
      return null;
    }
    const ceiling = Math.min(RARITY_RANK[maxRarity], RARITY_RANK[TUNING.blackMarket.relicRarityCeiling]);
    const cost = this.blackMarketCost('relic');
    if (this.gold < cost) {
      this.msg(`Relic wheel costs ${cost}g`, 'bad');
      return null;
    }
    const candidates = [...REG.items.values()]
      .filter((item) => isMainItemTier(item.tier))
      .filter((item) => {
        const rank = RARITY_RANK[this.itemRarity(item.id)];
        return rank >= RARITY_RANK.rare && rank <= ceiling;
      })
      .filter((item) => itemAllowedFromSource(item.id, 'gamble'))
      .filter((item) => !GATED_TOP_TIER.has(item.id))
      .map((item) => item.id);
    const id = this.rollMarketItem(candidates, `relic:${maxRarity}:${this.goldSinks.gambleRolls}`);
    if (!id) {
      this.msg(`No relics are available below ${maxRarity}`, 'bad');
      return null;
    }
    const quality = this.rollGambleQuality(
      TUNING.blackMarket.relicQualityOdds,
      stableContentSeed(`black-market:relic-quality:${maxRarity}`, this.goldSinks.gambleRolls)
    );
    this.gold -= cost;
    this.goldSinks.gambleRolls += 1;
    const item = this.instantiateMarketItem(id, 'gamble', `relic:${maxRarity}:${this.goldSinks.gambleRolls}`, { bound: true, quality });
    this.addDroppedItems([item], { awardMarks: false });
    const qTag = quality ? ` (${QUALITY_GRADES[quality].name})` : '';
    this.msg(`Relic wheel: ${REG.item(id).name}${qTag} (bound, → Armory)`, 'good', this.dropAccent([item]));
    return item;
  }

  private lootMarkPool(band: LootBand): string[] {
    const maxCost = band === 'early' ? 5600 : band === 'mid' ? 6500 : Infinity;
    return [...REG.items.values()]
      .filter((item) => isMainItemTier(item.tier))
      .filter((item) => this.itemRarity(item.id) === 'legendary')
      .filter((item) => item.cost <= maxCost)
      .filter((item) => itemAllowedFromSource(item.id, 'gamble'))
      .filter((item) => !GATED_TOP_TIER.has(item.id))
      .map((item) => item.id);
  }

  blackMarketRedeemLootMark(band: LootBand = this.currentLootBand()): ItemSave | null {
    if (!this.inTown()) {
      this.msg('The Black Market trades from town', 'bad');
      return null;
    }
    const quota = TUNING.loot.bandMarkQuota[band];
    if ((this.lootMarks[band] ?? 0) < quota) {
      this.msg(`${band} Loot Mark redemption needs ${quota} marks`, 'bad');
      return null;
    }
    const candidates = this.lootMarkPool(band);
    const id = this.rollMarketItem(candidates, `loot-mark:${band}:${this.lootMarks[band]}:${this.inventoryStash.length}`);
    if (!id) {
      this.msg(`No ${band} Loot Mark relics are available`, 'bad');
      return null;
    }
    this.lootMarks[band] -= quota;
    const item = this.instantiateMarketItem(id, 'gamble', `loot-mark:${band}:${this.lootMarks[band]}:${this.inventoryStash.length}`, { bound: true });
    this.addDroppedItems([item], { awardMarks: false });
    this.msg(`${band} Loot Marks redeemed: ${REG.item(id).name} (bound, → Armory)`, 'good', this.dropAccent([item]));
    return item;
  }

  gambleVendorRoll(tier: Extract<ItemTier, 't1' | 't2' | 't3' | 't4'>, slot: GambleSlot = 'any'): ItemSave | null {
    if (!this.inTown()) {
      this.msg('The Gamble Vendor trades from town', 'bad');
      return null;
    }
    if (!GAMBLE_SLOTS.includes(slot)) {
      this.msg('Choose a valid gamble slot', 'bad');
      return null;
    }
    const cost = TUNING.gambleVendor.tierPrice[tier];
    if (this.gold < cost) {
      this.msg(`${tier.toUpperCase()} gamble costs ${cost}g`, 'bad');
      return null;
    }
    const candidates = [...REG.items.values()]
      .filter((item) => item.tier === tier)
      .filter((item) => this.gambleSlotMatches(item, slot))
      .filter((item) => itemAllowedFromSource(item.id, 'gamble'))
      .filter((item) => !GATED_TOP_TIER.has(item.id))
      .map((item) => item.id);
    const id = this.rollMarketItem(candidates, `vendor:${tier}:${slot}:${this.goldSinks.gambleRolls}`);
    if (!id) {
      this.msg(`No ${tier.toUpperCase()} ${slot} gamble stock is available`, 'bad');
      return null;
    }
    const pity = this.gambleVendorPityReady();
    this.gold -= cost;
    this.goldSinks.gambleRolls += 1;
    const item = this.instantiateMarketItem(id, 'gamble', `vendor:${tier}:${slot}:${this.goldSinks.gambleRolls}`, { bound: true, gradeFloorMin: pity ? 'sharp' : this.regionalGradeFloorMin(this.region.id) });
    this.addDroppedItems([item], { awardMarks: false });
    this.msg(`Gamble vendor: ${REG.item(id).name}${pity ? ' (pity Sharp+)' : ''} (bound, → Armory)`, 'good', this.dropAccent([item]));
    return item;
  }

  private legendaryAssemblyCandidates(): string[] {
    return [...REG.items.values()]
      .filter((item) => isMainItemTier(item.tier))
      .filter((item) => this.itemRarity(item.id) === 'legendary')
      .filter((item) => !!item.components && item.components.length > 0)
      .filter((item) => !GATED_TOP_TIER.has(item.id))
      .map((item) => item.id)
      .sort((a, b) => REG.item(a).name.localeCompare(REG.item(b).name));
  }

  private assemblyComponentPlan(itemId: string): { consume: number[]; missing: string[] } | null {
    const def = REG.items.get(itemId);
    if (!def || !this.legendaryAssemblyCandidates().includes(itemId)) return null;
    const reserved = new Set<number>();
    const consume: number[] = [];
    const missing: string[] = [];
    for (const componentId of def.components ?? []) {
      const idx = this.inventoryStash.findIndex((it, i) => !reserved.has(i) && it.id === componentId);
      if (idx < 0) {
        missing.push(componentId);
        continue;
      }
      reserved.add(idx);
      consume.push(idx);
    }
    return { consume, missing };
  }

  legendaryAssemblyOptions(): { itemId: string; name: string; essenceCost: number; components: string[]; missing: string[]; canCraft: boolean }[] {
    return this.legendaryAssemblyCandidates().map((itemId) => {
      const def = REG.item(itemId);
      const plan = this.assemblyComponentPlan(itemId)!;
      const essenceCost = TUNING.blackMarket.assemblyEssence;
      return {
        itemId,
        name: def.name,
        essenceCost,
        components: [...(def.components ?? [])],
        missing: plan.missing,
        canCraft: this.inTown() && plan.missing.length === 0 && this.essence >= essenceCost
      };
    });
  }

  assembleLegendary(itemId: string): ItemSave | null {
    if (!this.inTown()) {
      this.msg('The assembly bench is in town', 'bad');
      return null;
    }
    const def = REG.items.get(itemId);
    const plan = this.assemblyComponentPlan(itemId);
    if (!def || !plan) {
      this.msg('That item cannot be assembled at the bench', 'bad');
      return null;
    }
    if (plan.missing.length > 0) {
      const names = [...new Set(plan.missing)].map((id) => REG.item(id).name).join(', ');
      this.msg(`Assembly missing: ${names}`, 'bad');
      return null;
    }
    const essenceCost = TUNING.blackMarket.assemblyEssence;
    if (this.essence < essenceCost) {
      this.msg(`Assembly needs ${essenceCost} essence`, 'bad');
      return null;
    }
    for (const idx of [...plan.consume].sort((a, b) => b - a)) this.inventoryStash.splice(idx, 1);
    this.essence -= essenceCost;
    const item = this.instantiateMarketItem(itemId, 'gamble', `assembly:${itemId}:${this.goldSinks.gambleRolls}`, { bound: true });
    this.addDroppedItems([item], { awardMarks: false });
    this.msg(`Assembled ${def.name} (bound, → Armory)`, 'good', this.dropAccent([item]));
    return item;
  }

  /** Salvage a bound Armory item into essence. Liquid items still sell for gold instead. */
  salvageArmoryItem(stashIdx: number): number {
    const saved = this.inventoryStash[stashIdx];
    if (!saved?.bound) {
      this.msg('Only bound Armory items salvage into essence', 'bad');
      return 0;
    }
    const amount = disenchant(saved);
    this.inventoryStash.splice(stashIdx, 1);
    this.essence += amount;
    this.goldSinks.salvages += 1;
    this.msg(`Salvaged ${REG.item(saved.id).name} (+${amount} essence)`, 'info');
    return amount;
  }

  toggleArmoryItemLock(stashIdx: number): boolean {
    const item = this.inventoryStash[stashIdx];
    if (!item) return false;
    item.locked = !item.locked;
    this.msg(`${REG.item(item.id).name} ${item.locked ? 'locked' : 'unlocked'}`, 'info');
    return true;
  }

  salvageFilteredArmoryJunk(): number {
    let total = 0;
    let count = 0;
    for (let i = this.inventoryStash.length - 1; i >= 0; i--) {
      const item = this.inventoryStash[i];
      if (!item.bound || item.locked) continue;
      const result = applyLootFilter([item], (it) => this.itemRarity(it.id), this.lootFilter);
      const junk = result.disenchanted[0];
      if (!junk) continue;
      total += junk.essence;
      count += 1;
      this.inventoryStash.splice(i, 1);
    }
    if (count === 0) {
      this.msg('No unlocked bound items match the auto-disenchant filter', 'info');
      return 0;
    }
    this.essence += total;
    this.goldSinks.salvages += count;
    this.msg(`Salvaged ${count} filtered item${count === 1 ? '' : 's'} (+${total} essence)`, 'good');
    return total;
  }

  private nextItemGrade(item: ItemSave): Exclude<ItemGrade, 'broken'> | null {
    const current = item.grade ?? 'standard';
    const next = ITEM_GRADES[ITEM_GRADES.indexOf(current) + 1];
    return next && next !== 'broken' ? next : null;
  }

  private forgeableArmoryItem(stashIdx: number): { item: ItemSave; def: ReturnType<typeof REG.item> } | null {
    const item = this.inventoryStash[stashIdx];
    if (!item?.bound) return null;
    if (isGemId(item.id)) return null;
    const def = REG.item(item.id);
    if (def.tier === 'consumable' || def.tier === 'special') return null;
    return { item, def };
  }

  socketArmoryGem(stashIdx: number, socketIdx: number, gemStashIdx: number): boolean {
    if (stashIdx === gemStashIdx) {
      this.msg('Choose a gem from a different Armory slot', 'bad');
      return false;
    }
    const target = this.forgeableArmoryItem(stashIdx);
    const gemItem = this.inventoryStash[gemStashIdx];
    const gem = gemItem ? gemDef(gemItem.id) : undefined;
    if (!target || !gem) {
      this.msg('Socketing needs a bound item and a gem', 'bad');
      return false;
    }
    const sockets = [...(target.item.sockets ?? [])];
    if (socketIdx < 0 || socketIdx >= sockets.length) {
      this.msg(`${target.def.name} has no socket there`, 'bad');
      return false;
    }
    if (sockets[socketIdx]) {
      this.msg('That socket is already filled', 'bad');
      return false;
    }
    sockets[socketIdx] = gem.id;
    const updated = refreshResolvedMods({ ...target.item, sockets }, target.def);
    this.inventoryStash.splice(gemStashIdx, 1);
    const itemIdx = gemStashIdx < stashIdx ? stashIdx - 1 : stashIdx;
    this.inventoryStash[itemIdx] = updated;
    this.msg(`Socketed ${gem.name} into ${target.def.name}`, 'good');
    return true;
  }

  unsocketArmoryGem(stashIdx: number, socketIdx: number): boolean {
    const target = this.forgeableArmoryItem(stashIdx);
    if (!target) {
      this.msg('Only bound Armory items can be unsocketed', 'bad');
      return false;
    }
    const sockets = [...(target.item.sockets ?? [])];
    const gemId = socketIdx >= 0 && socketIdx < sockets.length ? sockets[socketIdx] : null;
    const gem = gemId ? gemDef(gemId) : undefined;
    if (!gemId || !gem) {
      this.msg('That socket is empty', 'bad');
      return false;
    }
    const cost = socketUnsocketCost(target.def);
    if (this.essence < cost.essence) {
      this.msg(`Need ${cost.essence} essence to unsocket ${gem.name}`, 'bad');
      return false;
    }
    this.essence -= cost.essence;
    sockets[socketIdx] = null;
    this.inventoryStash[stashIdx] = refreshResolvedMods({ ...target.item, sockets }, target.def);
    this.inventoryStash.push({ id: gemId });
    this.msg(`Returned ${gem.name} to the Armory (-${cost.essence} essence)`, 'info');
    return true;
  }

  unsocketArmoryGemQuote(stashIdx: number): { essence: number } | null {
    const target = this.forgeableArmoryItem(stashIdx);
    return target ? socketUnsocketCost(target.def) : null;
  }

  addArmorySocketQuote(stashIdx: number): { gold: number; essence: number; sockets: number; cap: number } | null {
    const target = this.forgeableArmoryItem(stashIdx);
    if (!target) return null;
    const cap = target.def.socketCap ?? 0;
    const sockets = target.item.sockets?.length ?? 0;
    if (cap <= 0 || sockets >= cap) return null;
    return { ...socketAddCost(target.def), sockets, cap };
  }

  addArmorySocket(stashIdx: number): boolean {
    const quote = this.addArmorySocketQuote(stashIdx);
    const target = this.forgeableArmoryItem(stashIdx);
    if (!quote || !target) {
      this.msg('That item cannot take another socket', 'bad');
      return false;
    }
    if (this.gold < quote.gold) {
      this.msg(`Need ${quote.gold}g to add a socket to ${target.def.name}`, 'bad');
      return false;
    }
    if (this.essence < quote.essence) {
      this.msg(`Need ${quote.essence} essence to add a socket to ${target.def.name}`, 'bad');
      return false;
    }
    this.gold -= quote.gold;
    this.essence -= quote.essence;
    this.inventoryStash[stashIdx] = addSocket(target.item, target.def);
    this.msg(`Added a socket to ${target.def.name}`, 'good');
    return true;
  }

  gemFuseOptions(): { indices: number[]; from: string; to: string; cost: number; canFuse: boolean }[] {
    const groups = new Map<string, number[]>();
    for (const [idx, item] of this.inventoryStash.entries()) {
      const gem = gemDef(item.id);
      if (!gem) continue;
      const key = `${gem.kind}:${gem.grade}`;
      groups.set(key, [...(groups.get(key) ?? []), idx]);
    }
    const out: { indices: number[]; from: string; to: string; cost: number; canFuse: boolean }[] = [];
    for (const indices of groups.values()) {
      if (indices.length < 3) continue;
      const picked = indices.slice(0, 3);
      const result = fuseGems(picked.map((idx) => this.inventoryStash[idx].id));
      const first = gemDef(this.inventoryStash[picked[0]].id);
      if (!result || !first) continue;
      const cost = Math.max(75, Math.round(REG.item(result.id).cost * 0.15));
      out.push({ indices: picked, from: first.name, to: result.name, cost, canFuse: this.gold >= cost });
    }
    return out;
  }

  fuseArmoryGems(stashIdxs: number[]): boolean {
    const indices = [...new Set(stashIdxs)].sort((a, b) => b - a);
    if (indices.length !== 3 || indices.some((idx) => idx < 0 || idx >= this.inventoryStash.length)) {
      this.msg('Choose three matching gems to fuse', 'bad');
      return false;
    }
    const result = fuseGems(indices.map((idx) => this.inventoryStash[idx].id));
    if (!result) {
      this.msg('Gem fusion needs three matching gems of the same grade', 'bad');
      return false;
    }
    const cost = Math.max(75, Math.round(REG.item(result.id).cost * 0.15));
    if (this.gold < cost) {
      this.msg(`Need ${cost}g to fuse ${result.name}`, 'bad');
      return false;
    }
    this.gold -= cost;
    for (const idx of indices) this.inventoryStash.splice(idx, 1);
    this.inventoryStash.push({ id: result.id });
    this.msg(`Fused gems into ${result.name}`, 'good');
    return true;
  }

  forgeGradeUpQuote(stashIdx: number, deterministic = true): { from: ItemGrade; to: Exclude<ItemGrade, 'broken'>; gold: number; essence: number; chance: number; deterministic: boolean } | null {
    const target = this.forgeableArmoryItem(stashIdx);
    if (!target) return null;
    const from = target.item.grade ?? 'standard';
    const to = this.nextItemGrade(target.item);
    if (!to) return null;
    const cost = GRADE_UP_COSTS[to];
    return deterministic
      ? { from, to, gold: 0, essence: cost.deterministicEssence, chance: 1, deterministic }
      : { from, to, gold: cost.gambleGold, essence: cost.gambleEssence, chance: cost.chance, deterministic };
  }

  forgeArmoryItemGrade(stashIdx: number, deterministic = true): boolean {
    const quote = this.forgeGradeUpQuote(stashIdx, deterministic);
    const target = this.forgeableArmoryItem(stashIdx);
    if (!quote || !target) {
      this.msg('Only bound forgeable Armory items can grade up', 'bad');
      return false;
    }
    if (this.gold < quote.gold) {
      this.msg(`Need ${quote.gold}g to grade up ${target.def.name}`, 'bad');
      return false;
    }
    if (this.essence < quote.essence) {
      this.msg(`Need ${quote.essence} essence to grade up ${target.def.name}`, 'bad');
      return false;
    }
    this.gold -= quote.gold;
    this.essence -= quote.essence;
    this.goldSinks.gambleRolls += 1;
    const seed = stableContentSeed(`forge:grade:${target.item.id}:${quote.to}:${this.goldSinks.gambleRolls}`, Math.round(this.playtime));
    const result = gradeUp(target.item, target.def, new Rng(seed), { deterministic, difficulty: creepCombatTier(this.region.id), endgameUnlocked: this.endgameAffixUnlocked(), regionId: this.region.id });
    this.inventoryStash[stashIdx] = result.item;
    this.msg(
      result.changed
        ? `${target.def.name} graded up: ${quote.from} → ${quote.to}`
        : `${target.def.name} grade-up failed; the item is unchanged`,
      result.changed ? 'good' : 'info'
    );
    return result.changed;
  }

  reforgeArmoryItemQuote(stashIdx: number): { grade: ItemGrade; gold: number; essence: number } | null {
    const target = this.forgeableArmoryItem(stashIdx);
    if (!target) return null;
    const grade = target.item.grade ?? 'standard';
    if ((target.item.affixes ?? []).length === 0) return null;
    return { grade, ...REFORGE_COSTS[grade] };
  }

  reforgeArmoryItem(stashIdx: number): boolean {
    const quote = this.reforgeArmoryItemQuote(stashIdx);
    const target = this.forgeableArmoryItem(stashIdx);
    if (!quote || !target) {
      this.msg('Only bound Armory items with affixes can be reforged', 'bad');
      return false;
    }
    if (this.gold < quote.gold) {
      this.msg(`Need ${quote.gold}g to reforge ${target.def.name}`, 'bad');
      return false;
    }
    if (this.essence < quote.essence) {
      this.msg(`Need ${quote.essence} essence to reforge ${target.def.name}`, 'bad');
      return false;
    }
    this.gold -= quote.gold;
    this.essence -= quote.essence;
    this.goldSinks.gambleRolls += 1;
    const seed = stableContentSeed(`forge:reforge:${target.item.id}:${quote.grade}:${this.goldSinks.gambleRolls}`, Math.round(this.playtime));
    this.inventoryStash[stashIdx] = reforge(target.item, target.def, new Rng(seed), creepCombatTier(this.region.id), undefined, this.endgameAffixUnlocked(), this.region.id);
    const locked = target.item.imprintedAffixId ? ' (imprint preserved)' : '';
    this.msg(`Reforged ${target.def.name}'s affixes${locked}`, 'good');
    return true;
  }

  rerollArmoryAffixQuote(stashIdx: number, affixIdx: number): { grade: ItemGrade; gold: number; essence: number; affixName: string; locked: boolean } | null {
    const target = this.forgeableArmoryItem(stashIdx);
    const affix = target?.item.affixes?.[affixIdx];
    if (!target || !affix) return null;
    const grade = target.item.grade ?? 'standard';
    return {
      grade,
      ...REROLL_AFFIX_COSTS[grade],
      affixName: affix.affixId,
      locked: affix.affixId === target.item.imprintedAffixId
    };
  }

  /**
   * Roll a *preview* candidate for one affix (ITEM_REHAUL §12.2). Charges gold/essence
   * per attempt but does not touch the item: the player keeps it with `keepRerolledAffix`
   * or rolls again. No operation can ever make the item worse — the original stays until kept.
   */
  rerollArmoryAffix(stashIdx: number, affixIdx: number): boolean {
    const quote = this.rerollArmoryAffixQuote(stashIdx, affixIdx);
    const target = this.forgeableArmoryItem(stashIdx);
    const affix = target?.item.affixes?.[affixIdx];
    if (!quote || !target || !affix) {
      this.msg('Choose an affix to reroll', 'bad');
      return false;
    }
    if (quote.locked) {
      this.msg('Imprinted affixes survive reforge and cannot be rerolled directly', 'bad');
      return false;
    }
    if (this.gold < quote.gold) {
      this.msg(`Need ${quote.gold}g to reroll that affix`, 'bad');
      return false;
    }
    if (this.essence < quote.essence) {
      this.msg(`Need ${quote.essence} essence to reroll that affix`, 'bad');
      return false;
    }
    this.gold -= quote.gold;
    this.essence -= quote.essence;
    this.goldSinks.gambleRolls += 1;
    const kind = affixDef(affix.affixId).kind;
    const exclude = (target.item.affixes ?? []).map((a, i) => (i === affixIdx ? '' : a.affixId)).filter(Boolean);
    const seed = stableContentSeed(`forge:reroll-affix:${target.item.id}:${affixIdx}:${this.goldSinks.gambleRolls}`, Math.round(this.playtime));
    const candidate = rollAffixForKind(target.def, kind, target.item.grade ?? 'standard', creepCombatTier(this.region.id), new Rng(seed), exclude, this.endgameAffixUnlocked(), this.region.id);
    if (!candidate) {
      this.msg('No alternative affix could be rolled', 'bad');
      return false;
    }
    this.rerollPreview = { stashIdx, affixIdx, itemId: target.item.id, baseAffixId: affix.affixId, candidate };
    this.msg(`${target.def.name}: previewing ${affixDef(candidate.affixId).name} — keep it or reroll again`, 'info');
    return true;
  }

  /** The pending reroll preview for a specific affix slot, or null if none/stale. */
  rerollPreviewFor(stashIdx: number, affixIdx: number): { candidate: RolledAffix; currentAffixId: string } | null {
    const p = this.rerollPreview;
    if (!p || p.stashIdx !== stashIdx || p.affixIdx !== affixIdx) return null;
    const item = this.inventoryStash[stashIdx];
    const current = item?.affixes?.[affixIdx];
    if (!item || item.id !== p.itemId || !current || current.affixId !== p.baseAffixId) {
      this.rerollPreview = null;
      return null;
    }
    return { candidate: p.candidate, currentAffixId: current.affixId };
  }

  /** Commit the previewed affix onto the item. Already paid for; this is free. */
  keepRerolledAffix(stashIdx: number, affixIdx: number): boolean {
    const preview = this.rerollPreviewFor(stashIdx, affixIdx);
    const target = this.forgeableArmoryItem(stashIdx);
    if (!preview || !target) {
      this.msg('Nothing to keep', 'bad');
      return false;
    }
    const affixes = [...(target.item.affixes ?? [])];
    affixes[affixIdx] = preview.candidate;
    this.inventoryStash[stashIdx] = refreshResolvedMods({ ...target.item, affixes }, target.def);
    this.rerollPreview = null;
    this.msg(`${target.def.name} now carries ${affixDef(preview.candidate.affixId).name}`, 'good');
    return true;
  }

  /** Drop the pending preview without applying it; the original affix stays (gold already spent). */
  discardRerolledAffix(): boolean {
    if (!this.rerollPreview) return false;
    this.rerollPreview = null;
    this.msg('Kept the original affix', 'info');
    return true;
  }

  imprintArmoryAffixQuote(stashIdx: number, affixIdx: number): { grade: ItemGrade; gold: number; essence: number; active: boolean } | null {
    const target = this.forgeableArmoryItem(stashIdx);
    const affix = target?.item.affixes?.[affixIdx];
    if (!target || !affix) return null;
    const grade = target.item.grade ?? 'standard';
    return { grade, ...IMPRINT_COSTS[grade], active: target.item.imprintedAffixId === affix.affixId };
  }

  imprintArmoryAffix(stashIdx: number, affixIdx: number): boolean {
    const quote = this.imprintArmoryAffixQuote(stashIdx, affixIdx);
    const target = this.forgeableArmoryItem(stashIdx);
    if (!quote || !target) {
      this.msg('Choose an affix to imprint', 'bad');
      return false;
    }
    if (quote.active) {
      this.msg('That affix is already imprinted', 'info');
      return true;
    }
    if (this.gold < quote.gold) {
      this.msg(`Need ${quote.gold}g to imprint that affix`, 'bad');
      return false;
    }
    if (this.essence < quote.essence) {
      this.msg(`Need ${quote.essence} essence to imprint that affix`, 'bad');
      return false;
    }
    this.gold -= quote.gold;
    this.essence -= quote.essence;
    this.inventoryStash[stashIdx] = imprintAffix(target.item, affixIdx);
    this.msg(`Imprinted an affix on ${target.def.name}`, 'good');
    return true;
  }

  masterworkArmoryItemQuote(stashIdx: number): { grade: ItemGrade; gold: number; essence: number } | null {
    const target = this.forgeableArmoryItem(stashIdx);
    if (!target) return null;
    const grade = target.item.grade ?? 'standard';
    if ((target.item.gradeRoll ?? 0.5) >= 0.995) return null;
    return { grade, ...MASTERWORK_COSTS[grade] };
  }

  masterworkArmoryItem(stashIdx: number): boolean {
    const quote = this.masterworkArmoryItemQuote(stashIdx);
    const target = this.forgeableArmoryItem(stashIdx);
    if (!quote || !target) {
      this.msg('Only bound Armory items below their masterwork cap can be improved', 'bad');
      return false;
    }
    if (this.gold < quote.gold) {
      this.msg(`Need ${quote.gold}g to masterwork ${target.def.name}`, 'bad');
      return false;
    }
    if (this.essence < quote.essence) {
      this.msg(`Need ${quote.essence} essence to masterwork ${target.def.name}`, 'bad');
      return false;
    }
    this.gold -= quote.gold;
    this.essence -= quote.essence;
    this.goldSinks.gambleRolls += 1;
    this.inventoryStash[stashIdx] = masterwork(target.item, target.def);
    this.msg(`Masterworked ${target.def.name}`, 'good');
    return true;
  }

  /** Quote the essence + gold cost to raise a bound Armory item one quality grade (LOOT L5). */
  qualityUpgradeQuote(stashIdx: number): { from: ItemQuality; to: ItemQuality; essence: number; gold: number } | null {
    const saved = this.inventoryStash[stashIdx];
    if (!saved?.bound) return null;
    const from = saved.quality ?? 'standard';
    const to = nextQuality(from);
    if (!to) return null;
    return {
      from,
      to,
      essence: TUNING.blackMarket.qualityUpgrade.essence[to],
      gold: TUNING.blackMarket.qualityUpgrade.gold[to]
    };
  }

  /**
   * Spend essence + gold to raise a bound Armory item one quality grade, the
   * deterministic earn-it path that complements luck at the source (LOOT L5/§3.4).
   * Upgrading off Inscribed banks no kills; a fresh Inscribed starts its stack at 0.
   */
  upgradeArmoryItemQuality(stashIdx: number): boolean {
    const quote = this.qualityUpgradeQuote(stashIdx);
    if (!quote) {
      this.msg('Only bound items can be upgraded, and Unusual is the ceiling', 'bad');
      return false;
    }
    if (this.essence < quote.essence) {
      this.msg(`Need ${quote.essence} essence (have ${this.essence})`, 'bad');
      return false;
    }
    if (this.gold < quote.gold) {
      this.msg(`Need ${quote.gold}g to forge ${QUALITY_GRADES[quote.to].name}`, 'bad');
      return false;
    }
    const saved = this.inventoryStash[stashIdx];
    this.essence -= quote.essence;
    this.gold -= quote.gold;
    this.goldSinks.gambleRolls += 1;
    saved.quality = quote.to;
    if (quote.to !== 'inscribed') delete saved.inscribedKills;
    this.msg(`Forged ${QUALITY_GRADES[quote.to].name} ${REG.item(saved.id).name}`, 'good');
    return true;
  }

  /** Tinker's Bench reroll: swap a stashed neutral for another of the same tier, for gold (§3.7). */
  tinkerReroll(neutralId: string): NeutralItemDef | null {
    if (!this.inTown()) {
      this.msg('The Tinker\u2019s Bench is in town', 'bad');
      return null;
    }
    const cost = TUNING.tinkersBench.rerollCost;
    if (this.gold < cost) {
      this.msg(`Reroll costs ${cost}g`, 'bad');
      return null;
    }
    if (!this.takeNeutral(neutralId)) {
      this.msg('No such neutral in the stash', 'bad');
      return null;
    }
    const seed = this.region.seed + Math.round(this.playtime * 7) + this.goldSinks.respecs + this.neutralStash.length;
    const next = rerollNeutralItem(neutralId, this.neutralCandidates(), seed);
    this.gold -= cost;
    this.addNeutralCopy(this.instantiateNeutralCopy(next.id, creepCombatTier(this.region.id), seed + 1));
    this.msg(`Reroll: ${REG.neutralItem(neutralId).name} → ${next.name} (-${cost}g)`, 'good');
    return next;
  }

  /** Tinker's Bench enchant: consume 3 stashed duplicates to step one tier up, for gold (§3.7). */
  tinkerEnchant(neutralId: string): NeutralItemDef | null {
    if (!this.inTown()) {
      this.msg('The Tinker\u2019s Bench is in town', 'bad');
      return null;
    }
    const cost = TUNING.tinkersBench.enchantCost;
    if (this.gold < cost) {
      this.msg(`Enchant costs ${cost}g`, 'bad');
      return null;
    }
    const current = REG.neutralItems.get(neutralId);
    if (!current?.enchantsInto || (this.neutralStash.find((s) => s.id === neutralId)?.count ?? 0) < 3) {
      this.msg('Enchant needs 3 duplicates of an enchantable neutral', 'bad');
      return null;
    }
    const consumed = [this.takeNeutral(neutralId), this.takeNeutral(neutralId), this.takeNeutral(neutralId)];
    if (consumed.some((item) => !item)) {
      this.msg('Enchant needs 3 duplicates of an enchantable neutral', 'bad');
      return null;
    }
    const next = REG.neutralItem(current.enchantsInto);
    this.gold -= cost;
    this.addNeutralCopy(this.instantiateNeutralCopy(next.id, creepCombatTier(this.region.id), this.region.seed + Math.round(this.playtime * 11) + this.goldSinks.respecs));
    this.msg(`Enchant: 3× ${REG.neutralItem(neutralId).name} → ${next.name} (-${cost}g)`, 'good');
    return next;
  }

  neutralGradeUpQuote(neutralId: string, deterministic = true): { from: ItemGrade; to: Exclude<ItemGrade, 'broken'>; gold: number; essence: number; chance: number; deterministic: boolean } | null {
    const slot = this.neutralStash.find((s) => s.id === neutralId && s.count > 0);
    if (!slot) return null;
    const copy = slot.copies?.[0] ?? { id: neutralId };
    const from = copy.grade ?? 'standard';
    const to = this.nextItemGrade(copy);
    if (!to) return null;
    const cost = GRADE_UP_COSTS[to];
    return deterministic
      ? { from, to, gold: 0, essence: cost.deterministicEssence, chance: 1, deterministic }
      : { from, to, gold: cost.gambleGold, essence: cost.gambleEssence, chance: cost.chance, deterministic };
  }

  tinkerNeutralGradeUp(neutralId: string, deterministic = true): boolean {
    if (!this.inTown()) {
      this.msg('The Tinker\u2019s Bench is in town', 'bad');
      return false;
    }
    const quote = this.neutralGradeUpQuote(neutralId, deterministic);
    if (!quote) {
      this.msg('No upgradeable neutral copy in the stash', 'bad');
      return false;
    }
    if (this.gold < quote.gold) {
      this.msg(`Need ${quote.gold}g to grade up ${REG.neutralItem(neutralId).name}`, 'bad');
      return false;
    }
    if (this.essence < quote.essence) {
      this.msg(`Need ${quote.essence} essence to grade up ${REG.neutralItem(neutralId).name}`, 'bad');
      return false;
    }
    const copy = this.takeNeutral(neutralId);
    if (!copy) return false;
    this.gold -= quote.gold;
    this.essence -= quote.essence;
    this.goldSinks.gambleRolls += 1;
    const rng = new Rng(stableContentSeed(`neutral-grade:${neutralId}:${quote.to}:${this.goldSinks.gambleRolls}`, Math.round(this.playtime)));
    const changed = deterministic || rng.chance(GRADE_UP_COSTS[quote.to].chance);
    if (!changed) {
      this.addNeutralCopy(copy);
      this.msg(`${REG.neutralItem(neutralId).name} grade-up failed; the neutral is unchanged`, 'info');
      return false;
    }
    const def = REG.neutralItem(neutralId);
    const gradeRoll = rng.next();
    this.addNeutralCopy({ ...copy, grade: quote.to, gradeRoll, resolvedMods: neutralGradeMods(def, quote.to, gradeRoll) });
    this.msg(`${def.name} graded up: ${quote.from} → ${quote.to}`, 'good');
    return true;
  }

  disenchantNeutral(neutralId: string): number {
    if (!this.inTown()) {
      this.msg('The Tinker\u2019s Bench is in town', 'bad');
      return 0;
    }
    const copy = this.takeNeutral(neutralId);
    if (!copy) {
      this.msg('No such neutral in the stash', 'bad');
      return 0;
    }
    const amount = disenchant(copy);
    this.essence += amount;
    this.goldSinks.salvages += 1;
    this.msg(`Disenchanted ${REG.neutralItem(neutralId).name} (+${amount} essence)`, 'info');
    return amount;
  }

  // ---------- gold sinks (§3.8): buyback / Tome / respec / heal ----------

  private isDown(rec: RosterEntry): boolean {
    return !rec.unit || !rec.unit.alive || rec.respawnAt > this.sim.time;
  }

  /**
   * Instantly revive a fallen hero for gold, skipping its respawn timer (§3.8). Defaults to the
   * first downed party member; the active hero respawns in place, a benched hero becomes swap-ready.
   */
  buyback(recIdx?: number): boolean {
    const idx = recIdx ?? this.party.findIndex((r) => this.isDown(r));
    const rec = this.party[idx];
    if (!rec) return false;
    if (!this.isDown(rec)) {
      this.msg('Buyback only applies to a fallen hero', 'info');
      return false;
    }
    const cost = buybackCost(rec.level, this.goldSinks.buybacks);
    if (this.gold < cost) {
      this.msg(`Buyback needs ${cost}g`, 'bad');
      return false;
    }
    this.gold -= cost;
    this.goldSinks.buybacks += 1;
    rec.respawnAt = 0;
    rec.hpPct = 1;
    rec.manaPct = 1;
    if (idx === this.activeIdx) {
      const pos = this.pendingSpawnPos ?? { x: this.region.shrine.pos.x + 120, y: this.region.shrine.pos.y + 120 };
      if (rec.unit) this.sim.removeUnit(rec.unit.uid);
      const u = this.spawnHeroFromRecord(rec, pos);
      rec.unit = u;
      this.sim.playerActiveUid = u.uid;
      this.scene.selectedUid = u.uid;
    }
    this.msg(`Buyback! ${REG.hero(rec.heroId).name} returns (-${cost}g)`, 'good');
    return true;
  }

  /** Tome of Knowledge: convert gold to XP for a lagging recruit, with diminishing returns (§3.8). */
  buyTome(recIdx: number): boolean {
    const rec = this.party[recIdx];
    if (!rec) return false;
    const res = tomePurchase(this.gold, this.goldSinks.tomesUsed);
    if (!res.ok) {
      this.msg('Not enough gold for a Tome of Knowledge', 'bad');
      return false;
    }
    this.gold = res.gold;
    this.goldSinks.tomesUsed = res.tomesUsed;
    const cap = this.recruitLevelCap();
    if (rec.unit) {
      const gained = rec.unit.addXp(res.xp, cap);
      if (gained > 0) {
        rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, rec.unit.level);
        rec.attributePoints = normalizeAttributePoints(rec.heroId, rec.unit.level, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
        rec.unit.refresh(this.sim.time);
      }
      rec.level = rec.unit.level;
      rec.xp = rec.unit.xp;
    } else {
      rec.xp = Math.min(rec.xp + res.xp, xpForLevel(TUNING.levelCap));
      rec.level = Math.min(levelFromXp(rec.xp), cap);
      rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, rec.level);
      rec.attributePoints = normalizeAttributePoints(rec.heroId, rec.level, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
    }
    this.msg(`Tome of Knowledge → ${REG.hero(rec.heroId).name} (+${res.xp} XP, -${res.tomesUsed} used)`, 'good');
    return true;
  }

  /** Talent/facet respec for gold, out of combat, non-perfected tiers only (§3.8). */
  respec(recIdx: number): boolean {
    const rec = this.party[recIdx];
    if (!rec) return false;
    if (this.inCombat()) {
      this.msg('Respec only outside combat', 'bad');
      return false;
    }
    const cost = respecCost(false);
    if (cost === null) {
      this.msg('This build is locked (perfected tier)', 'bad');
      return false;
    }
    if (this.gold < cost) {
      this.msg(`Respec costs ${cost}g`, 'bad');
      return false;
    }
    this.gold -= cost;
    this.goldSinks.respecs += 1;
    if (rec.unit) {
      const pos = { ...rec.unit.pos };
      this.serializeHero(rec);
      rec.abilityLevels = REG.hero(rec.heroId).abilities.map(() => 0);
      rec.attributePoints = 0;
      rec.talentPicks = [null, null, null, null];
      this.sim.removeUnit(rec.unit.uid);
      const u = this.spawnHeroFromRecord(rec, pos);
      rec.unit = u;
      if (recIdx === this.activeIdx) {
        this.sim.playerActiveUid = u.uid;
        this.scene.selectedUid = u.uid;
      }
    } else {
      rec.abilityLevels = REG.hero(rec.heroId).abilities.map(() => 0);
      rec.attributePoints = 0;
      rec.talentPicks = [null, null, null, null];
    }
    this.msg(`${REG.hero(rec.heroId).name} respecced skills and talents (-${cost}g)`, 'good');
    return true;
  }

  /** Town restock/heal: top off the whole party's HP/mana for gold (§3.8). */
  healParty(): boolean {
    if (!this.inTown()) {
      this.msg('Healing is a town service', 'bad');
      return false;
    }
    const cost = TUNING.healServiceCost;
    if (this.gold < cost) {
      this.msg(`Heal costs ${cost}g`, 'bad');
      return false;
    }
    this.gold -= cost;
    for (const rec of this.party) {
      rec.hpPct = 1;
      rec.manaPct = 1;
      if (rec.unit && rec.unit.alive) {
        rec.unit.hp = rec.unit.stats.maxHp;
        rec.unit.mana = rec.unit.stats.maxMana;
      }
    }
    this.msg(`Party rested at the inn (-${cost}g)`, 'good');
    return true;
  }

  /** Dishes the player can cook right now (GAMEPLAY_OVERHAUL §3.7). Cooking is a field
   * service available out of combat at a town or shrine. */
  canCook(): { ok: boolean; reason?: string } {
    if (this.inCombat()) return { ok: false, reason: 'Cannot cook during combat' };
    const u = this.activeUnit();
    const nearShrine = !!u && dist(u.pos, this.region.shrine.pos) <= TUNING.exploration.cookRadius;
    if (!this.inTown() && !nearShrine) return { ok: false, reason: 'Cook at a town or shrine' };
    return { ok: true };
  }

  cookableDishes(): DishDef[] {
    return [...REG.dishes.values()];
  }

  /** Cook a dish: spend its gold/ingredient cost and grant an out-of-combat heal, a
   * one-shot revive of a fallen hero, or a timed exploration buff (the buff rides the
   * existing statmod path). Returns true on a successful cook. */
  cookDish(dishId: string): boolean {
    const def = REG.dishes.get(dishId);
    if (!def) {
      this.msg('Unknown recipe', 'bad');
      return false;
    }
    const allowed = this.canCook();
    if (!allowed.ok) {
      this.msg(allowed.reason ?? 'Cannot cook here', 'bad');
      return false;
    }
    // revive needs a fallen hero before we charge for ingredients
    let fallen: RosterEntry | undefined;
    if (def.kind === 'revive') {
      fallen = this.party.find((r) => r.respawnAt > this.sim.time);
      if (!fallen) {
        this.msg('No fallen hero to revive', 'bad');
        return false;
      }
    }
    if (this.gold < def.cost) {
      this.msg(`${def.name} needs ${def.cost}g of ingredients`, 'bad');
      return false;
    }
    this.gold -= def.cost;

    switch (def.kind) {
      case 'heal': {
        const pct = def.restorePct ?? 1;
        for (const rec of this.party) {
          if (rec.respawnAt > this.sim.time) continue;
          rec.hpPct = Math.min(1, rec.hpPct + pct);
          rec.manaPct = Math.min(1, rec.manaPct + pct);
          if (rec.unit && rec.unit.alive) {
            rec.unit.hp = Math.min(rec.unit.stats.maxHp, rec.unit.hp + rec.unit.stats.maxHp * pct);
            rec.unit.mana = Math.min(rec.unit.stats.maxMana, rec.unit.mana + rec.unit.stats.maxMana * pct);
          }
        }
        this.msg(`${def.name} restores the party (-${def.cost}g)`, 'good');
        break;
      }
      case 'revive': {
        const rec = fallen!;
        rec.respawnAt = this.sim.time;
        rec.hpPct = Math.max(rec.hpPct, 1);
        rec.manaPct = Math.max(rec.manaPct, 1);
        this.msg(`${def.name} stands ${REG.hero(rec.heroId).name} back up (-${def.cost}g)`, 'good');
        break;
      }
      case 'buff': {
        if (def.buff) this.applyDishBuff(def);
        this.msg(`${def.name} steels the party for the road (-${def.cost}g)`, 'good');
        break;
      }
    }
    return true;
  }

  /** Apply a cooked exploration buff to every fielded party hero through the statmod path. */
  private applyDishBuff(def: DishDef): void {
    if (!def.buff) return;
    const mods: Record<string, number> = {};
    for (const [k, v] of Object.entries(def.buff.mods)) mods[k] = v as number;
    for (const rec of this.party) {
      const u = rec.unit;
      if (!u || !u.alive) continue;
      u.addStatus({
        status: 'buff',
        tag: `dish:${def.id}`,
        sourceUid: u.uid,
        sourceTeam: u.team,
        until: this.sim.time + def.buff.durationSec,
        isDebuff: false,
        mods: { ...mods }
      });
      u.markStatsDirty();
      u.refresh(this.sim.time);
    }
  }

  // ---------- world spawning ----------

  private spawnCamps(savedRespawn: Record<string, number>): void {
    for (const camp of this.region.camps) {
      const remaining = savedRespawn[camp.id];
      if (remaining !== undefined && remaining > 0) {
        this.camps.set(camp.id, { uids: [], respawnAt: this.sim.time + remaining });
      } else {
        this.camps.set(camp.id, { uids: this.spawnCampCreeps(camp.id), respawnAt: 0 });
      }
    }
  }

  private spawnCampCreeps(campId: string): number[] {
    const camp = this.region.camps.find((c) => c.id === campId)!;
    const def = REG.creep(camp.creepId);
    const uids: number[] = [];
    for (let i = 0; i < camp.count; i++) {
      const a = (i / camp.count) * Math.PI * 2;
      const r = camp.radius * 0.55;
      const pos = { x: camp.pos.x + Math.cos(a) * r, y: camp.pos.y + Math.sin(a) * r };
      const eliteSeed = stableContentSeed(`${this.region.id}:elite-creep:${camp.id}:${this.playtime}`, i);
      // Elites are a rare variant of large/ancient camps only (§10.3); the spawn
      // chance lives in tuning, not a magic number.
      const eliteChance = (TUNING.eliteSpawnChance as Partial<Record<CreepTier, number>>)[def.tier] ?? 0;
      const elite = i === 0 && eliteChance > 0 && Math.abs(eliteSeed % 10000) / 10000 < eliteChance;
      const u = this.sim.spawnCreep(def, {
        team: 1,
        pos,
        wild: true,
        homePos: { ...camp.pos },
        regionId: this.region.id,
        combatTier: creepCombatTier(this.region.id),
        star: elite ? 2 : 1
      });
      u.elite = elite;
      if (elite) this.eliteCreepUids.add(u.uid);
      uids.push(u.uid);
    }
    return uids;
  }

  private spawnEchoes(savedRespawn: Record<string, number>): void {
    for (const spawn of this.region.echoSpawns ?? []) {
      const remaining = savedRespawn[spawn.id];
      if (remaining !== undefined && remaining > 0) {
        this.echoes.set(spawn.id, { uid: null, respawnAt: this.sim.time + remaining });
      } else if (!this.echoSpawnReady(spawn)) {
        this.echoes.set(spawn.id, { uid: null, respawnAt: this.sim.time + 10 });
      } else {
        this.echoes.set(spawn.id, { uid: this.spawnHeroEcho(spawn.id), respawnAt: 0 });
      }
    }
  }

  private echoSpawnReady(spawn: EchoSpawnDef): boolean {
    const minLevel = spawn.minPlayerLevel ?? 0;
    if (minLevel <= 0) return true;
    const active = this.activeUnit();
    const leadLevel = active?.level ?? this.party[this.activeIdx]?.unit?.level ?? this.party[this.activeIdx]?.level ?? 0;
    return leadLevel >= minLevel;
  }

  private spawnHeroEcho(spawnId: string): number {
    const spawn = this.region.echoSpawns?.find((e) => e.id === spawnId);
    if (!spawn) return -1;
    // Echo fidelity (§3.3): full kit, gambit controller, ×0.6 HP, no items, echo flag.
    const u = spawnHeroEchoUnit(this.sim, {
      heroId: spawn.heroId,
      team: 1,
      pos: spawn.pos,
      level: spawn.level,
      gambit: true,
      leashRadius: TUNING.echoLeashRadius,
      echoFlag: true,
      bountyMult: 1.4
    });
    this.echoHeroes.set(u.uid, spawnId);
    return u.uid;
  }

  private spawnRecruitNpcs(): void {
    for (const spawn of this.region.heroSpawns) {
      if (this.recruited.has(spawn.heroId)) continue;
      const def = REG.hero(spawn.heroId);
      const u = new Unit({
        kind: 'npc',
        team: 0,
        name: def.name,
        attribute: def.attribute,
        base: { ...def.baseStats },
        pos: { ...spawn.pos },
        radius: TUNING.unitRadiusHero
      });
      u.visual = { silhouette: def.silhouette, palette: def.palette };
      // Render-only hero identity: the scene mounts this hero's authored GLB so
      // the townstanding recruit reads as the same character it becomes once on
      // the team, instead of a flat procedural placeholder. Sim/AI ignore it.
      u.renderHeroId = spawn.heroId;
      u.ctrl = { kind: 'none' };
      u.refresh(0);
      u.hp = u.stats.maxHp;
      this.sim.addUnit(u);
      this.npcHeroes.set(u.uid, spawn.heroId);
    }
  }

  npcAt(uid: number): string | undefined {
    return this.npcHeroes.get(uid);
  }

  // ---------- hero spawn/serialize ----------

  private spawnHeroFromRecord(rec: RosterEntry, pos: Vec2): Unit {
    const build = buildHero(REG.hero(rec.heroId), rec.talentPicks, rec.facetIdx, rec.echo, rec.augments);
    rec.abilityLevels = normalizeAbilityLevels(build.def, rec.abilityLevels, rec.level);
    rec.attributePoints = normalizeAttributePoints(rec.heroId, rec.level, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
    const u = this.sim.spawnHero(build.def, {
      team: 0,
      pos: { ...pos },
      level: rec.level,
      ctrl: { kind: 'player' },
      abilityLevels: rec.abilityLevels
    });
    for (const k in build.externalMods) {
      u.externalMods[k] = (u.externalMods[k] ?? 0) + build.externalMods[k];
    }
    rec.dayNightMods = dayNightMods(rec.heroId, this.isNight()) as Record<string, number>;
    for (const [k, v] of Object.entries(rec.dayNightMods)) {
      u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(rec.resonanceMods)) {
      u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(augmentMods(rec.augments))) {
      u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
    }
    for (const key of ['str', 'agi', 'int']) {
      u.externalMods[key] = (u.externalMods[key] ?? 0) + rec.attributePoints * 2;
    }
    rec.neutralMods = neutralPassiveMods(rec.neutralSlot);
    for (const [k, v] of Object.entries(rec.neutralMods)) {
      u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
    }
    u.xp = Math.max(rec.xp, xpForLevel(rec.level));
    rec.items.forEach((s, i) => {
      u.items[i] = s ? itemStateFromSave(s, this.sim.time) : null;
    });
    u.items = sortInventory(u.items);
    const setEffects = setBonusEffects(rec.items);
    for (const [k, v] of Object.entries(setEffects.mods)) {
      u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
    }
    u.setAuras = setEffects.auras;
    u.setTriggers = setEffects.triggers;
    if (rec.fleshStacks) {
      for (const k in rec.fleshStacks) u.triggerStacks.set(k, rec.fleshStacks[k]);
    }
    u.markStatsDirty();
    u.markVisualDirty();
    u.refresh(this.sim.time);
    u.tagGaugeReadyAt = rec.tagGaugeReadyAt;   // mirror for the core 'tag-in-ready' gambit read
    u.hp = u.stats.maxHp * Math.max(0.05, rec.hpPct);
    u.mana = u.stats.maxMana * rec.manaPct;
    // bench cooldown rule: remaining = max(half of remaining-at-swap-out, remaining - benched time)
    const benched = rec.benchedAt > 0 ? this.sim.time - rec.benchedAt : 1e9;
    rec.abilityCooldowns.forEach((cd, i) => {
      if (!u.abilities[i] || cd <= 0) return;
      const floorPct = this.settings.resonance ? 0 : TUNING.swapCdFloorPct;
      const remaining = Math.max(cd * floorPct, cd - benched);
      u.abilities[i].cooldownUntil = this.sim.time + remaining;
    });
    return u;
  }

  private serializeHero(rec: RosterEntry): void {
    const u = rec.unit;
    if (!u) return;
    rec.level = u.level;
    rec.xp = u.xp;
    rec.abilityLevels = u.abilities.map((a) => a.level);
    rec.hpPct = u.alive ? u.hp / u.stats.maxHp : 0.5;
    rec.manaPct = u.stats.maxMana > 0 ? u.mana / u.stats.maxMana : 0;
    rec.items = u.items.map((it) => itemSaveOf(it, this.sim.time));
    rec.abilityCooldowns = u.abilities.map((a) =>
      a.cooldownUntil > this.sim.time ? a.cooldownUntil - this.sim.time : 0
    );
    rec.benchedAt = this.sim.time;
    if (u.triggerStacks.size > 0) {
      rec.fleshStacks = {};
      for (const [k, v] of u.triggerStacks) rec.fleshStacks[k] = v;
    }
  }

  // ---------- swap (1-5) ----------

  private partyRecentlyInCombat(): boolean {
    const now = this.sim.time;
    return this.party.some((rec) => {
      const u = rec.unit;
      const last = Math.max(rec.lastCombatAt, u?.lastDealtDamageAt ?? -999, u?.lastEnemyDamageAt ?? -999);
      return now - last < TUNING.combatLockSec;
    });
  }

  private activeTagEffects(effects: EffectNode[], u: Unit): EffectNode[] {
    return effects.filter((effect) => {
      if (effect.kind === 'heal' && effect.amount === 'swapInHealPct') return Math.max(0, u.stats.swapInHealPct) > 0;
      if (effect.kind === 'status' && effect.params?.tag === 'swap-in-burst') return Math.max(0, u.stats.swapInDamagePct) > 0;
      return true;
    });
  }

  private tagChainWindow(u: Unit): number {
    return Math.max(0.5, TUNING.tagChainWindowSec + Math.max(0, u.stats.tagChainWindowBonusSec));
  }

  private advanceTagChain(u: Unit): { count: number; ampPct: number; expiresAt: number } {
    const now = this.sim.time;
    const live = now <= this.tagChainExpiresAt;
    const maxSteps = Math.max(1, Math.round(TUNING.tagChainMaxSteps));
    const count = live ? Math.min(maxSteps, this.tagChainCount + 1) : 1;
    const ampPct = Math.max(0, count - 1) * TUNING.tagChainAmpPerStepPct;
    const expiresAt = now + this.tagChainWindow(u);
    this.tagChainCount = count;
    this.tagChainAmpPct = ampPct;
    this.tagChainExpiresAt = expiresAt;
    this.sim.events.emit({ t: 'tag-chain', uid: u.uid, count, expiresAt, ampPct });
    return { count, ampPct, expiresAt };
  }

  private fireTagBoon(rec: RosterEntry, u: Unit, when: 'tag-in' | 'tag-out', combatEligible: boolean): boolean {
    const boon = REG.hero(rec.heroId).tagBoon;
    if (!boon || (boon.fire !== when && boon.fire !== 'both')) return false;
    if (!combatEligible) return false;
    if (this.sim.time < rec.tagGaugeReadyAt) return false;
    const effects = this.activeTagEffects(when === 'tag-out' ? (boon.outEffects ?? boon.effects) : boon.effects, u);
    if (effects.length === 0) return false;

    const chain = when === 'tag-in' ? this.advanceTagChain(u) : { count: this.tagChainCount, ampPct: 0, expiresAt: this.tagChainExpiresAt };
    const ampPct = Math.max(0, u.stats.tagBoonAmpPct) + chain.ampPct;
    const amp = 1 + ampPct / 100;
    execEffects(this.sim, u, {
      defId: boon.id,
      values: {
        swapInDamagePct: [Math.max(0, u.stats.swapInDamagePct) * amp],
        swapInHealPct: [Math.max(0, u.stats.swapInHealPct) * amp],
        tagDuration: [3]
      },
      level: 1,
      element: boon.element,
      vfx: tagBoonVfx(REG.hero(rec.heroId))
    }, scaleTagEffects(effects, amp), { point: { ...u.pos } });

    const reductionPct = Math.min(80, Math.max(0, u.stats.swapCdReductionPct) + Math.max(0, u.stats.tagGaugeReductionPct));
    rec.tagGaugeReadyAt = this.sim.time + boon.gaugeSec * (1 - reductionPct / 100);
    u.tagGaugeReadyAt = rec.tagGaugeReadyAt;   // mirror for the core 'tag-in-ready' gambit read
    this.sim.events.emit({ t: 'tag-boon', uid: u.uid, heroId: rec.heroId, when, chain: chain.count, ampPct });
    return true;
  }

  private shouldPersistOffField(rec: RosterEntry, combatEligible: boolean): boolean {
    return !!this.settings.resonance && combatEligible && rec.respawnAt <= this.sim.time;
  }

  // §8.2: a channel flagged offField keeps ticking while its caster is benched.
  private channelPersistsOffField(u: Unit): boolean {
    const ch = u.channel;
    if (!ch || ch.source !== 'ability') return false;
    return !!u.abilities[ch.slot]?.def.channel?.offField;
  }

  private markOffField(rec: RosterEntry, u: Unit): void {
    const until = this.sim.time + TUNING.resonanceOffFieldPersistenceSec;
    // Entrance-only tag boons should not look like they replayed on a reposition swap.
    u.removeStatusWhere((s) => s.tag === 'swap-in-burst');
    u.offFieldUntil = until;
    u.ctrl = { kind: 'none' };
    // Keep an off-field-flagged channel alive (a benched turret/rain, §8.2); tear
    // down anything else (windup, cast point, capture) so the swap reads clean.
    if (this.channelPersistsOffField(u)) {
      u.cast = null;
      u.windupUntil = -1;
      if (u.captureCh) this.sim.interruptCapture(u, 'off-field');
    } else {
      u.order = { kind: 'stop' };
      this.sim.interruptActions(u);
    }
    u.addStatus({
      status: 'buff',
      tag: 'off-field',
      sourceUid: u.uid,
      sourceTeam: u.team,
      until,
      isDebuff: false,
      mods: { untargetable: 1, invulnerable: 1 }
    }, true);
    u.addStatus({
      status: 'invis',
      tag: 'off-field',
      sourceUid: u.uid,
      sourceTeam: u.team,
      until,
      isDebuff: false,
      fadeTime: 0
    }, true);
    u.refresh(this.sim.time);
    this.sim.events.emit({ t: 'off-field', uid: u.uid, heroId: rec.heroId, until });
  }

  private clearOffField(u: Unit): void {
    u.offFieldUntil = undefined;
    u.removeStatusWhere((s) => s.tag === 'off-field');
    u.ctrl = { kind: 'player' };
    u.order = { kind: 'stop' };
    u.refresh(this.sim.time);
  }

  private removeOffField(rec: RosterEntry): void {
    const u = rec.unit;
    if (!u || u.offFieldUntil === undefined) return;
    this.serializeHero(rec);
    this.sim.removeUnit(u.uid);
    rec.unit = null;
  }

  private reapOffFieldUnits(): void {
    for (let i = 0; i < this.party.length; i++) {
      if (i === this.activeIdx) continue;
      const rec = this.party[i];
      const u = rec.unit;
      if (!u || u.offFieldUntil === undefined) continue;
      if (this.sim.time >= u.offFieldUntil || !this.partyRecentlyInCombat() || !this.settings.resonance) {
        this.removeOffField(rec);
      }
    }
  }

  // §8.3: execute a swap that was queued during a cast point, once the cast has
  // fired (or the grace window lapses). Keeps the swap input from cancelling a cast.
  private flushPendingSwap(): void {
    if (this.pendingSwapIdx === null) return;
    const idx = this.pendingSwapIdx;
    const cur = this.party[this.activeIdx]?.unit;
    if (cur?.cast && this.sim.time < cur.cast.fireAt) {
      if (this.sim.time - this.pendingSwapAt > TUNING.swapCancelGraceSec) this.pendingSwapIdx = null;
      return; // still in the cast point — keep the swap queued
    }
    this.pendingSwapIdx = null;
    if (idx !== this.activeIdx) this.trySwap(idx);
  }

  trySwap(idx: number): boolean {
    if (this.liveGym) return this.selectLiveGymHero(idx);
    if (this.liveRaid) return this.selectLiveRaidHero(idx);
    if (this.liveDungeon) return this.selectLiveDungeonHero(idx);
    if (idx === this.activeIdx) return false;
    const rec = this.party[idx];
    if (!rec) return false;
    if (rec.respawnAt > this.sim.time) {
      this.msg(`${REG.hero(rec.heroId).name} respawns in ${Math.ceil(rec.respawnAt - this.sim.time)}s`, 'bad');
      return false;
    }
    // §8.3: if the active hero is mid cast-point, queue the swap until the cast fires
    // rather than discarding the cast. flushPendingSwap() re-issues it next frame.
    const casting = this.party[this.activeIdx]?.unit?.cast;
    if (casting && this.sim.time < casting.fireAt) {
      this.pendingSwapIdx = idx;
      this.pendingSwapAt = this.sim.time;
      return true;
    }
    if (this.sim.time < this.swapReadyAt) {
      this.msg(`Swap on cooldown (${(this.swapReadyAt - this.sim.time).toFixed(1)}s)`, 'bad');
      return false;
    }
    const cur = this.party[this.activeIdx];
    const pos: Vec2 = cur.unit
      ? { ...cur.unit.pos }
      : this.pendingSpawnPos ?? { ...this.region.shrine.pos };
    const facing = cur.unit?.facing ?? 0;

    const combatEligible = this.partyRecentlyInCombat();

    if (cur.unit) {
      this.fireTagBoon(cur, cur.unit, 'tag-out', combatEligible);
      this.serializeHero(cur);
      cur.lastCombatAt = Math.max(
        cur.unit.lastDealtDamageAt,
        cur.unit.lastEnemyDamageAt,
        cur.lastCombatAt
      );
      if (this.shouldPersistOffField(cur, combatEligible)) {
        this.markOffField(cur, cur.unit);
      } else {
        this.sim.removeUnit(cur.unit.uid);
        cur.unit = null;
      }
    }

    let u = rec.unit;
    if (u && u.offFieldUntil !== undefined) {
      this.clearOffField(u);
      u.pos = { ...pos };
      u.prevPos = { ...pos };
    } else {
      u = this.spawnHeroFromRecord(rec, pos);
    }
    u.facing = facing;
    rec.unit = u;
    rec.respawnAt = 0;
    this.activeIdx = idx;
    const baseSwapCd = this.settings.resonance ? TUNING.resonanceSwapFloorSec : TUNING.swapFloorSec;
    const swapCdReduction = Math.min(0.8, Math.max(0, u.stats.swapCdReductionPct) / 100);
    this.swapReadyAt = this.sim.time + baseSwapCd * (1 - swapCdReduction);
    this.fireTagBoon(rec, u, 'tag-in', combatEligible);
    this.sim.playerActiveUid = u.uid;
    this.scene.selectedUid = u.uid;
    this.retargetEntourage();
    return true;
  }

  private retargetEntourage(): void {
    const u = this.activeUnit();
    if (!u) return;
    for (const [, simUid] of this.fieldedUnits) {
      const c = this.sim.unit(simUid);
      if (c) c.ownerUid = u.uid;
    }
  }

  // ---------- orders from input ----------

  private issueOrder(order: Order, queued = false, feedback = true): void {
    const sim = this.inputSim();
    let u = this.controlledUnit();
    if (this.liveRaid) u = this.liveRaid.claimDriver();
    if (!u || !u.alive) return;
    this.pendingRecruitNpcUid = null;
    const safeOrder = this.sanitizeOrderPoint(sim, u, order);
    if (feedback && (order.kind === 'move' || order.kind === 'attack-move') && (safeOrder.kind === 'move' || safeOrder.kind === 'attack-move')) {
      const dx = safeOrder.point.x - order.point.x;
      const dy = safeOrder.point.y - order.point.y;
      if (dx * dx + dy * dy > 16 && sim.time - this.lastBlockedMoveFeedbackAt > 0.6) {
        this.lastBlockedMoveFeedbackAt = sim.time;
        this.emitPresentationEvent({ t: 'movement-blocked', uid: u.uid, pos: { ...safeOrder.point }, reason: 'blocked' }, true);
      }
    }
    this.scene.clearLook?.();
    if (feedback) {
      this.showOrderFeedback(sim, safeOrder, queued);
      this.audio.playUi?.(order.kind === 'attack-move' || order.kind === 'attack-unit' ? 'tab' : 'click');
    }
    if (queued) {
      this.queuedOrders.push(safeOrder);
      this.msg(`Queued ${safeOrder.kind.replace('-', ' ')}`, 'info');
      return;
    }
    this.queuedOrders = [];
    sim.order(u.uid, safeOrder);
  }

  private showOrderFeedback(sim: Sim, order: Order, queued: boolean): void {
    if (order.kind === 'move' || order.kind === 'attack-move') {
      this.scene.showOrderFeedback?.(order.point, order.kind, queued);
      return;
    }
    if (order.kind === 'attack-unit') {
      const target = sim.unit(order.uid);
      if (target) this.scene.showOrderFeedback?.(target.pos, 'attack-unit', queued);
    }
  }

  private sanitizeOrderPoint(sim: Sim, u: Unit, order: Order): Order {
    if (order.kind !== 'move' && order.kind !== 'attack-move') return order;
    return { ...order, point: this.nearestWalkablePoint(sim, u, order.point) };
  }

  private nearestWalkablePoint(sim: Sim, u: Unit, point: Vec2): Vec2 {
    const out = { ...point };
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const obstacle of sim.obstacles) {
        if (!obstacleBlocksMovement(obstacle)) continue;
        const next = nearestPointOutsideCollisionBody(obstacle.pos, obstacle.body, out, u.radius + 10, u.facing);
        if (next.x === out.x && next.y === out.y) continue;
        out.x = next.x;
        out.y = next.y;
        moved = true;
      }
      if (!moved) break;
    }
    out.x = Math.max(u.radius, Math.min(sim.bounds.w - u.radius, out.x));
    out.y = Math.max(u.radius, Math.min(sim.bounds.h - u.radius, out.y));
    return out;
  }

  private advanceQueuedOrder(): void {
    const sim = this.inputSim();
    const u = this.controlledUnit();
    if (!u || !u.alive || this.queuedOrders.length === 0) return;
    if (u.order.kind !== 'stop' && u.order.kind !== 'hold') return;
    sim.order(u.uid, this.queuedOrders.shift()!);
  }

  orderMove(point: Vec2, queued = false, feedback = true): void {
    this.issueOrder({ kind: 'move', point }, queued, feedback);
  }

  orderAttack(uid: number, queued = false): void {
    this.issueOrder({ kind: 'attack-unit', uid }, queued);
  }

  orderAttackMove(point: Vec2, queued = false): void {
    this.issueOrder({ kind: 'attack-move', point }, queued);
  }

  orderStop(): void {
    const sim = this.inputSim();
    const u = this.liveRaid ? this.liveRaid.claimDriver() : this.controlledUnit();
    if (!u) return;
    this.queuedOrders = [];
    sim.order(u.uid, { kind: 'stop' });
  }

  tryDash(point?: Vec2): boolean {
    if (this.liveGym) return false;
    const u = this.controlledUnit();
    if (!u || !u.alive) return false;
    if (u.summary.rooted || u.summary.stunned || u.summary.cycloned || u.summary.sleeping || u.summary.frozen) {
      this.msg('Cannot dash while rooted or disabled', 'bad');
      return false;
    }
    if (this.sim.time < this.dashReadyAt) {
      this.msg(`Dash ready in ${(this.dashReadyAt - this.sim.time).toFixed(1)}s`, 'bad');
      return false;
    }
    if (this.stamina < TUNING.locomotion.dashCost) {
      this.msg('Not enough stamina', 'bad');
      return false;
    }
    const toPoint = point && dist(u.pos, point) > 1 ? norm(sub(point, u.pos)) : fromAngle(u.facing);
    const dir = toPoint.x === 0 && toPoint.y === 0 ? fromAngle(u.facing) : toPoint;
    this.stamina = Math.max(0, this.stamina - TUNING.locomotion.dashCost);
    this.staminaRegenReadyAt = this.sim.time + TUNING.traversal.regenDelaySec;
    this.dashReadyAt = this.sim.time + TUNING.locomotion.dashCooldownSec;
    u.forced.push({
      kind: 'forced',
      dir,
      speed: TUNING.locomotion.dashSpeed,
      until: this.sim.time + TUNING.locomotion.dashDurationSec
    });
    u.setCastGesture('dash', {
      now: this.sim.time,
      windowUntil: this.sim.time + TUNING.locomotion.dashDurationSec,
      lockUntil: this.sim.time + TUNING.locomotion.dashDurationSec
    });
    return true;
  }

  castAbility(slot: number, opts: { uid?: number; point?: Vec2; queued?: boolean }): void {
    const sim = this.inputSim();
    const u = this.controlledUnit();
    if (!u || !u.alive) return;
    const a = u.abilities[slot];
    if (!a || a.level <= 0) {
      this.msg('Ability not learned', 'bad');
      return;
    }
    const ready = u.abilityReady(slot, sim.time);
    if (!ready.ok) {
      this.msg(ready.reason === 'mana' ? 'Not enough mana' : ready.reason === 'cooldown' ? 'On cooldown' : `Cannot cast (${ready.reason})`, 'bad');
      return;
    }
    this.issueOrder({ kind: 'cast', slot, uid: opts.uid, point: opts.point }, opts.queued);
  }

  useItem(invSlot: number, opts: { uid?: number; point?: Vec2; queued?: boolean }): void {
    const sim = this.inputSim();
    const u = this.controlledUnit();
    if (!u || !u.alive) return;
    const it = u.items[invSlot];
    const def = it ? REG.items.get(it.defId) : undefined;
    if (!it || !def || !def.active) return;
    const ready = itemReady(it, def, u, sim.time);
    if (!ready.ok) {
      this.msg(
        ready.reason === 'mana' ? 'Not enough mana' :
          ready.reason === 'cooldown' ? 'On cooldown' :
            ready.reason === 'no-charges' ? 'No charges' :
              ready.reason === 'damage-lockout' ? 'Item locked by damage' :
                `Cannot use item (${ready.reason})`,
        'bad'
      );
      return;
    }
    this.issueOrder({ kind: 'item', invSlot, uid: opts.uid, point: opts.point }, opts.queued);
  }

  // ---------- capture ----------

  captureEligible(target: Unit): { ok: boolean; reason?: string } {
    if (!target.alive || !target.capturable || !target.tier) return { ok: false, reason: 'not capturable' };
    const cfg = TUNING.capture[target.tier];
    if (target.hp / target.stats.maxHp > cfg.hpPct) {
      return { ok: false, reason: `weaken below ${Math.round(cfg.hpPct * 100)}% HP` };
    }
    return { ok: true };
  }

  tryCapture(uid: number): void {
    const sim = this.inputSim();
    const u = this.controlledUnit();
    const target = sim.unit(uid);
    if (!u || !target) return;
    const elig = this.captureEligible(target);
    if (!elig.ok) {
      this.msg(`Cannot capture: ${elig.reason}`, 'bad');
      return;
    }
    sim.order(u.uid, { kind: 'capture', uid });
    this.msg(`Binding ${target.name}...`, 'info');
  }

  // ---------- recruitment (Phase 2: Find -> Trial -> Bind) ----------

  tryRecruit(uid: number): void {
    const heroId = this.npcHeroes.get(uid);
    const u = this.activeUnit();
    const npc = this.sim.unit(uid);
    if (!heroId || !u || !npc) {
      if (this.pendingRecruitNpcUid === uid) this.pendingRecruitNpcUid = null;
      return;
    }
    if (dist(u.pos, npc.pos) > RECRUIT_INTERACT_RANGE) {
      this.orderMove({ ...npc.pos });
      this.pendingRecruitNpcUid = uid;
      return;
    }
    if (this.pendingRecruitNpcUid === uid) this.pendingRecruitNpcUid = null;
    const def = REG.hero(heroId);
    if (this.factionLockedHero(heroId)) {
      this.msg(`You sided against ${def.name} at Shadeshore — they will not follow you now.`, 'bad');
      return;
    }
    const questId = def.recruitmentQuestId;
    if (!questId || !REG.quests.has(questId)) {
      this.recruitHero(heroId, uid);
      return;
    }
    if (this.activeTrial) {
      this.msg('Finish the active trial first.', 'bad');
      return;
    }
    const quest = REG.quest(questId);
    const qp = this.questProgress[questId] ?? defaultQuestProgress();
    this.questProgress[questId] = qp;
    // If the overworld NPC is visible and clickable, the player has found them.
    // Echo shards can still reveal rumors, but they should not block a live prompt.
    if (qp.stage === 'unfound') qp.stage = 'found';
    if (qp.stage === 'found') {
      this.startTrial(heroId, uid);
      return;
    }
    if (qp.stage === 'trial-complete') {
      this.startBindDuel(heroId, uid);
    }
  }

  private updatePendingRecruit(): void {
    const uid = this.pendingRecruitNpcUid;
    if (uid === null || this.activeTrial) return;
    const u = this.activeUnit();
    const npc = this.sim.unit(uid);
    if (!u || !u.alive || !npc || !this.npcHeroes.has(uid)) {
      this.pendingRecruitNpcUid = null;
      return;
    }
    if (dist(u.pos, npc.pos) <= RECRUIT_INTERACT_RANGE) {
      this.tryRecruit(uid);
    }
  }

  // ---------- recruitment helpers (Phase 6 §3.1–3.4) ----------

  private trialGateCtx(): TrialGateCtx {
    return { reputation: this.reputation, recruitedTotal: this.recruited.size, raidClears: this.totalRaidClears() };
  }

  totalRaidClears(): number {
    return Object.values(this.raidProgress).reduce((acc, r) => acc + (r?.clears ?? 0), 0);
  }

  adjustReputation(delta: number, reason: string): void {
    this.reputation = Math.max(-20, Math.min(20, this.reputation + delta));
    this.msg(`Reputation ${delta >= 0 ? '+' : ''}${delta} (now ${this.reputation}) — ${reason}`, delta >= 0 ? 'good' : 'bad');
  }

  /** Recruit level ceiling by badge count (§3.4); rises with badges toward 30. */
  recruitLevelCap(): number {
    return recruitLevelCap(this.badges.size);
  }

  /** Recruits beyond the starter (TV→Nightsilver gate, §3.4). */
  recruitedCount(): number {
    return Math.max(0, this.recruited.size - 1);
  }

  /** Re-clamp the roster to the current ceiling so a new badge lets banked XP catch up. */
  private applyRecruitCeiling(): void {
    const cap = this.recruitLevelCap();
    for (const rec of this.party) {
      const natural = levelFromXp(rec.unit ? rec.unit.xp : rec.xp);
      const lvl = Math.min(natural, cap);
      if (rec.unit && rec.unit.level !== lvl) {
        rec.unit.level = lvl;
        rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, lvl);
        rec.attributePoints = normalizeAttributePoints(rec.heroId, lvl, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
        rec.unit.setAbilityLevels(rec.abilityLevels);
        rec.unit.markStatsDirty();
        rec.unit.refresh(this.sim.time);
      }
      rec.level = lvl;
      rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, lvl);
      rec.attributePoints = normalizeAttributePoints(rec.heroId, lvl, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
    }
  }

  private startTrial(heroId: string, npcUid: number): void {
    const questId = REG.hero(heroId).recruitmentQuestId;
    if (!questId) return;
    const trial = REG.trial(REG.quest(questId).trialId);
    const gate = trialGateOpen(trial, this.trialGateCtx());
    if (!gate.open) {
      this.msg(`${trial.name}: ${gate.reason}`, 'bad');
      return;
    }
    const player = this.activeUnit();
    if (!player) {
      this.msg('Field a hero before attempting a trial.', 'bad');
      return;
    }
    const level = this.party[this.activeIdx]?.level ?? 1;
    this.activeTrial = new TrialRunner(this.sim, player.uid, trial, { level, gateCtx: this.trialGateCtx() });
    this.activeTrialHeroId = heroId;
    this.activeTrialNpcUid = npcUid;
    if (trial.dialogue?.[0]) {
      this.playCutscene('trial-dialogue-stinger', {
        trial: trial.name,
        trialLine: trial.dialogue[0],
        speaker: REG.hero(heroId).name,
        heroId
      });
    }
    this.msg(`Trial begins: ${trial.name} — ${trial.description}`, 'info');
  }

  trialChoiceOptions(): { id: string; label: string }[] {
    const r = this.activeTrial;
    if (!r || r.mechanic !== 'choice') return [];
    if (r.kind === 'souls-pact') return [{ id: 'greed', label: 'Take the pact (power, lost honor)' }, { id: 'honor', label: 'Refuse (keep your honor)' }];
    if (r.kind === 'faction-choice') return [{ id: 'kunkka', label: 'Side with Kunkka' }, { id: 'tidehunter', label: 'Side with Tidehunter' }];
    if (r.kind === 'lore-riddle') return [{ id: 'origin', label: '"A name yet to be spoken."' }, { id: 'silence', label: '"Nothing at all."' }];
    return [];
  }

  resolveTrialChoice(choice: string): void {
    const r = this.activeTrial;
    if (!r || r.mechanic !== 'choice') return;
    r.choose(choice);
    const outcome = r.tick(this.sim.time);
    if (outcome !== 'running') this.finishTrial(outcome);
  }

  private finishTrial(outcome: TrialOutcome): void {
    const runner = this.activeTrial;
    const heroId = this.activeTrialHeroId;
    if (!runner || !heroId) {
      this.activeTrial = null;
      this.activeTrialHeroId = null;
      this.activeTrialNpcUid = null;
      return;
    }
    const questId = REG.hero(heroId).recruitmentQuestId!;
    const quest = REG.quest(questId);
    if (runner.karmaDelta) this.adjustReputation(runner.karmaDelta, `${REG.hero(heroId).name}'s trial`);
    if (runner.factionChoice) this.recordFactionChoice(runner.trial.regionId, runner.factionChoice);
    if (outcome === 'complete') {
      const qp = this.questProgress[questId] ?? defaultQuestProgress();
      qp.stage = 'trial-complete';
      qp.trialCompletions += 1;
      this.questProgress[questId] = qp;
      this.msg(`${REG.hero(heroId).name}'s trial complete. ${quest.bindText}`, 'good');
      if (runner.trial.dialogue?.[1]) {
        this.playCutscene('trial-dialogue-stinger', {
          trial: `${runner.trial.name} complete`,
          trialLine: runner.trial.dialogue[1],
          speaker: REG.hero(heroId).name,
          heroId
        });
      }
      this.autosave('trial');
    } else {
      this.relocateTrial(heroId, runner);
    }
    this.activeTrial = null;
    this.activeTrialHeroId = null;
    this.activeTrialNpcUid = null;
  }

  private relocateTrial(heroId: string, runner: TrialRunner): void {
    const questId = REG.hero(heroId).recruitmentQuestId!;
    const quest = REG.quest(questId);
    const trial = runner.trial;
    const needed = quest.findShardsNeeded ?? TUNING.findShardsNeeded;
    const floor = trial.relocationFloor ?? TUNING.relocationShardFloor;
    const qp = this.questProgress[questId] ?? defaultQuestProgress();
    qp.attunement = Math.min(floor, needed); // drop to the floor, never zero-locked
    qp.stage = 'unfound';                     // a rumor again until re-found
    this.questProgress[questId] = qp;
    const spots = trial.relocateSpots ?? [];
    if (spots.length > 0 && this.activeTrialNpcUid !== null) {
      const idx = (this.trialRelocations.get(heroId) ?? 0) % spots.length;
      this.trialRelocations.set(heroId, idx + 1);
      const npc = this.sim.unit(this.activeTrialNpcUid);
      if (npc) {
        npc.pos = { ...spots[idx] };
        npc.prevPos = { ...spots[idx] };
      }
    }
    this.msg(`${REG.hero(heroId).name}'s trial failed — the rumor relocates. Shards reset to ${qp.attunement}/${needed}.`, 'bad');
    this.autosave('trial-fail');
  }

  private recruitHero(heroId: string, npcUid?: number): boolean {
    const def = REG.hero(heroId);
    if (this.recruited.has(heroId)) return false;
    const firstBind = this.recruited.size <= 1;
    if (npcUid !== undefined) {
      this.sim.removeUnit(npcUid);
      this.npcHeroes.delete(npcUid);
    } else {
      for (const [uid, id] of [...this.npcHeroes]) {
        if (id === heroId) {
          this.sim.removeUnit(uid);
          this.npcHeroes.delete(uid);
        }
      }
    }
    this.recruited.add(heroId);
    this.codexUnlock('hero:' + heroId); // recruiting is the encounter (§3.14)
    this.advanceQuests({ kind: 'recruit-heroes', amount: 1 });
    if (this.party.length < 5) {
      this.party.push({
        heroId,
        level: 1,
        xp: 0,
        abilityLevels: defaultAbilityLevels(heroId, 1),
        attributePoints: 0,
        talentPicks: [null, null, null, null],
        gambits: [],
        echo: freshEchoProgress(),
        facetIdx: 0,
        hpPct: 1,
        manaPct: 1,
        items: [null, null, null, null, null, null],
        neutralSlot: null,
        augments: {},
        abilityCooldowns: [0, 0, 0, 0],
        benchedAt: 0,
        tagGaugeReadyAt: 0,
        respawnAt: 0,
        lastCombatAt: -999,
        dayNightMods: {},
        resonanceMods: {},
        unit: null
      });
    } else {
      this.benchRoster.set(heroId, freshHeroSave(heroId));
    }
    this.refreshResonanceMods(true);
    this.msg(this.party.some((rec) => rec.heroId === heroId) ? `${def.name} joins the party! (key ${this.party.length})` : `${def.name} joins the bench. Gear them from the Armory.`, 'good');
    if (def.barks.length > 0) this.msg(`${def.name}: "${def.barks[0]}"`, 'bark');
    this.playCutscene(firstBind ? 'bind-first' : 'bind-stinger', {
      hero: def.name,
      heroId: def.id,
      bark: def.barks[0] ?? `${def.name} joins.`
    });
    if (def.recruitmentQuestId) {
      this.questProgress[def.recruitmentQuestId] = { ...(this.questProgress[def.recruitmentQuestId] ?? defaultQuestProgress()), stage: 'bound' };
    }
    this.autosave('recruitment');
    return true;
  }

  private startBindDuel(heroId: string, npcUid: number): void {
    if ([...this.bindingHeroes.values()].includes(heroId)) {
      this.msg('Binding duel already active', 'bad');
      return;
    }
    const npc = this.sim.unit(npcUid);
    if (!npc) return;
    const def = REG.hero(heroId);
    const level = Math.max(4, this.party[this.activeIdx]?.level ?? 4);
    const build = buildHero(def, autoPicksForLevel(level), 0);
    const pos = { x: npc.pos.x + 260, y: npc.pos.y + 80 };
    const u = this.sim.spawnHero(build.def, {
      team: 1,
      pos,
      level,
      ctrl: { kind: 'creep', homePos: { ...pos } }
    });
    u.name = `${def.name} Binding Echo`;
    u.bounty = { xp: Math.round(def.bounty.xp * 0.8), gold: Math.round(def.bounty.gold * 0.8) };
    for (const k in build.externalMods) u.externalMods[k] = (u.externalMods[k] ?? 0) + build.externalMods[k];
    u.markStatsDirty();
    u.refresh(this.sim.time);
    u.hp = u.stats.maxHp;
    u.mana = u.stats.maxMana;
    this.bindingHeroes.set(u.uid, heroId);
    this.msg(`Binding duel: defeat ${def.name}'s echo.`, 'good');
  }

  // ---------- entourage ----------

  private fieldedDungeonEntourage(): CreepInstanceSave[] {
    const byId = new Map(this.caught.map((inst) => [inst.uid, inst]));
    return this.fielded
      .map((uid) => byId.get(uid))
      .filter((inst): inst is CreepInstanceSave => !!inst && !inst.faintedFor);
  }

  fieldCreep(instanceUid: string, silent = false): boolean {
    const inst = this.caught.find((c) => c.uid === instanceUid);
    if (!inst) return false;
    if (this.fielded.includes(instanceUid)) return false;
    const next = [...this.fielded, instanceUid];
    const check = validateEntourage(next, this.caught, (id) => REG.creep(id).tier);
    if (!check.ok) {
      if (!silent) this.msg(`Cannot field: ${check.reason}`, 'bad');
      return false;
    }
    const owner = this.activeUnit();
    const def = REG.creep(inst.creepId);
    const pos = owner
      ? { x: owner.pos.x + 80 + Math.random() * 60, y: owner.pos.y + 80 + Math.random() * 60 }
      : { ...this.region.shrine.pos };
    const u = this.sim.spawnCreep(def, {
      team: 0,
      pos,
      star: inst.star,
      ownerUid: owner?.uid
    });
    u.visual = { silhouette: def.silhouette, palette: def.palette };
    this.fielded = next;
    this.fieldedUnits.set(instanceUid, u.uid);
    if (!silent) this.msg(`${def.name}${'★'.repeat(inst.star)} fielded`, 'good');
    return true;
  }

  unfieldCreep(instanceUid: string): void {
    const simUid = this.fieldedUnits.get(instanceUid);
    if (simUid !== undefined) {
      const u = this.sim.unit(simUid);
      if (u && u.alive) this.sim.removeUnit(simUid);
    }
    this.fieldedUnits.delete(instanceUid);
    this.fielded = this.fielded.filter((id) => id !== instanceUid);
  }

  // ---------- shop ----------

  shopOpen = false;

  canShop(): boolean {
    return this.inTown();
  }

  /** Items the current location vends. Gated top-tier power is never sold by any shop (§6). */
  shopSells(itemId: string): boolean {
    if (GATED_TOP_TIER.has(itemId)) return false;
    if (!itemAllowedFromSource(itemId, 'shop')) return false;
    if (this.region.shopInventory.includes(itemId)) return true;
    const sec = this.region.secretShop;
    const u = this.activeUnit();
    return !!sec && !!u && sec.inventory.includes(itemId) && dist(u.pos, sec.pos) <= 700;
  }

  buyItem(itemId: string): void {
    const u = this.activeUnit();
    if (!u) return;
    if (!this.shopSells(itemId)) {
      this.msg('That item is not for sale here', 'bad');
      return;
    }
    const def = REG.item(itemId);
    const req = itemLevelRequirement(def);
    if (u.level < req) {
      this.msg(`${def.name} requires level ${req}`, 'bad');
      return;
    }
    const plan = computeBuyPlan(def, u, this.gold);
    if (!plan.affordable) {
      this.msg('Not enough gold', 'bad');
      return;
    }
    if (!plan.fits) {
      this.msg('Inventory full', 'bad');
      return;
    }
    const newGold = executeBuy(def, u, this.gold);
    if (newGold === null) {
      this.msg('Cannot buy', 'bad');
      return;
    }
    this.gold = newGold;
    this.codexUnlock('item:' + itemId); // acquiring an item is the encounter (§3.14)
    this.msg(`Bought ${def.name}`, 'good');
  }

  sellItem(invSlot: number): void {
    const u = this.activeUnit();
    if (!u) return;
    const it = u.items[invSlot];
    if (!it) return;
    const def = REG.item(it.defId);
    if (it.bound) {
      const saved = itemSaveOf(it, this.sim.time);
      u.items[invSlot] = null;
      u.items = sortInventory(u.items);
      u.markStatsDirty();
      u.markVisualDirty();
      u.refresh(this.sim.time);
      const rec = this.party[this.activeIdx];
      if (rec) rec.items = u.items.map((slot) => itemSaveOf(slot, this.sim.time));
      if (saved) this.inventoryStash.push(saved);
      this.msg(`${def.name} is bound — returned to the Armory`, 'info');
      return;
    }
    u.items[invSlot] = null;
    u.items = sortInventory(u.items);
    u.markStatsDirty();
    u.markVisualDirty();
    const value = sellValue(def);
    this.awardGold(value, 'sell', u.pos);
    this.msg(`Sold ${def.name} (+${value}g)`, 'info');
  }

  // ---------- talents ----------

  pendingSkillPoints(rec: RosterEntry): number {
    const abilitySpend = rec.abilityLevels.reduce((sum, n) => sum + n, 0);
    return Math.max(0, rec.level - abilitySpend - rec.attributePoints - pickedTalentCount(rec.talentPicks));
  }

  canLevelAbility(recIdx: number, slot: number): boolean {
    const rec = this.party[recIdx];
    if (!rec || this.pendingSkillPoints(rec) <= 0) return false;
    const def = rec.unit?.abilities[slot]?.def ?? REG.hero(rec.heroId).abilities[slot];
    if (!def) return false;
    const current = rec.unit?.abilities[slot]?.level ?? rec.abilityLevels[slot] ?? 0;
    return canLearnAbilityRank(def, current, rec.level);
  }

  levelAbility(recIdx: number, slot: number): boolean {
    const rec = this.party[recIdx];
    if (!rec) return false;
    const def = rec.unit?.abilities[slot]?.def ?? REG.hero(rec.heroId).abilities[slot];
    if (!def) return false;
    if (!this.canLevelAbility(recIdx, slot)) {
      const current = rec.unit?.abilities[slot]?.level ?? rec.abilityLevels[slot] ?? 0;
      const nextReq = abilityRankRequiredHeroLevel(def, current + 1);
      this.msg(rec.level < nextReq ? `${def.name} rank ${current + 1} unlocks at hero level ${nextReq}` : 'No skill point available', 'bad');
      return false;
    }
    rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, rec.level);
    rec.abilityLevels[slot] = (rec.abilityLevels[slot] ?? 0) + 1;
    if (rec.unit) {
      rec.unit.setAbilityLevels(rec.abilityLevels);
      rec.unit.refresh(this.sim.time);
      rec.abilityLevels = rec.unit.abilities.map((a) => a.level);
      this.playPresentationEventNow({ t: 'skill-spend', uid: rec.unit.uid, kind: 'ability' });
    }
    this.msg(`${REG.hero(rec.heroId).name}: ${def.name} rank ${rec.abilityLevels[slot]}`, 'good');
    this.autosave('skill');
    return true;
  }

  maxAttributePoints(rec: RosterEntry): number {
    return Math.max(0, TUNING.levelCap - REG.hero(rec.heroId).abilities.reduce((sum, a) => sum + abilityMaxLevel(a), 0) - 4);
  }

  canSpendAttributePoint(recIdx: number): boolean {
    const rec = this.party[recIdx];
    return !!rec && this.pendingSkillPoints(rec) > 0 && rec.attributePoints < this.maxAttributePoints(rec);
  }

  applyAttributePoint(recIdx: number): boolean {
    const rec = this.party[recIdx];
    if (!rec || !this.canSpendAttributePoint(recIdx)) return false;
    rec.attributePoints++;
    if (rec.unit) {
      for (const key of ['str', 'agi', 'int']) {
        rec.unit.externalMods[key] = (rec.unit.externalMods[key] ?? 0) + 2;
      }
      rec.unit.markStatsDirty();
      rec.unit.refresh(this.sim.time);
      this.playPresentationEventNow({ t: 'skill-spend', uid: rec.unit.uid, kind: 'attribute' });
    }
    this.msg(`${REG.hero(rec.heroId).name}: +2 all attributes`, 'good');
    this.autosave('attributes');
    return true;
  }

  pendingTalentTier(rec: RosterEntry): number {
    const levels = [10, 15, 20, 25];
    for (let i = 0; i < 4; i++) {
      if (rec.level >= levels[i] && rec.talentPicks[i] === null) return i;
    }
    return -1;
  }

  applyTalent(recIdx: number, tier: number, pick: 0 | 1): void {
    const rec = this.party[recIdx];
    if (!rec || rec.talentPicks[tier] !== null || this.pendingSkillPoints(rec) <= 0) return;
    const talent = REG.hero(rec.heroId).talents[tier];
    if (!talent || rec.level < talent.level) return;
    rec.talentPicks[tier] = pick;
    const def = REG.hero(rec.heroId);
    this.msg(`${def.name}: ${def.talents[tier].options[pick].name}`, 'good');
    this.rebuildHeroUnit(recIdx);
    const unit = this.party[recIdx]?.unit;
    if (unit) this.playPresentationEventNow({ t: 'skill-spend', uid: unit.uid, kind: 'talent' });
    this.autosave('talent');
  }

  setFacet(recIdx: number, facetIdx: number): boolean {
    const rec = this.party[recIdx];
    if (!rec || !rec.echo.facetSwapUnlocked) return false;
    const def = REG.hero(rec.heroId);
    if (!def.facets[facetIdx]) return false;
    rec.facetIdx = facetIdx;
    this.msg(`${def.name} facet: ${def.facets[facetIdx].name}`, 'good');
    this.rebuildHeroUnit(recIdx);
    this.autosave('facet');
    return true;
  }

  setGambits(recIdx: number, rules: GambitRule[]): boolean {
    const rec = this.party[recIdx];
    if (!rec || rules.length > 8) return false;
    rec.gambits = structuredClone(rules);
    this.msg(`${REG.hero(rec.heroId).name} gambits updated`, 'good');
    return true;
  }

  unlockOwnedHeroEcho(heroId: string): boolean {
    const recIdx = this.party.findIndex((r) => r.heroId === heroId);
    if (recIdx < 0) return false;
    const rec = this.party[recIdx];
    const result = recordOwnedHeroEchoKill(rec.echo);
    rec.echo = result.progress;

    const def = REG.hero(heroId);
    const echoLines: string[] = [];
    if (result.firstFacetUnlock) {
      const line = `${def.name}'s facets are now swappable.`;
      echoLines.push(line);
      this.msg(line, 'good');
    }
    if (result.unlockedTier !== null) {
      const tier = def.talents[result.unlockedTier];
      const pick = rec.talentPicks[result.unlockedTier];
      const branchName = pick === null ? `level ${tier.level} echo branch` : tier.options[pick === 0 ? 1 : 0].name;
      const line = `${def.name}'s echo unlocks ${branchName}.`;
      echoLines.push(line);
      this.msg(line, 'good');
    } else {
      const line = `${def.name}'s echo yields surplus attunement gold.`;
      echoLines.push(line);
      this.msg(line, 'info');
      this.awardGold(Math.round(def.bounty.gold * 1.5), 'echo', this.activeUnit()?.pos ?? this.region.town.pos);
    }
    if (result.firstFacetUnlock) {
      this.playCutscene('echo-milestone-stinger', { hero: def.name, echoLine: echoLines[0] ?? `${def.name}'s echo deepens.` });
    }

    this.rollEchoComponentDrop(heroId);
    this.rebuildHeroUnit(recIdx);
    this.autosave('echo');
    return true;
  }

  private advanceAttunement(heroId: string): void {
    const def = REG.hero(heroId);
    const questId = def.recruitmentQuestId;
    if (!questId) return;
    const quest = REG.quests.get(questId);
    const needed = quest?.findShardsNeeded ?? TUNING.findShardsNeeded;
    const qp = this.questProgress[questId] ?? defaultQuestProgress();
    qp.attunement += 1;
    // Find gating (§3.1): the trial marker reveals only when shards hit the threshold.
    if (qp.attunement >= needed && qp.stage === 'unfound') {
      qp.stage = 'found';
      this.questProgress[questId] = qp;
      this.msg(`${def.name}'s trial marker reveals — seek them out! (${Math.min(qp.attunement, needed)}/${needed})`, 'good');
    } else {
      this.questProgress[questId] = qp;
      this.msg(`${def.name} attunement shard ${Math.min(qp.attunement, needed)}/${needed}${quest ? ` — ${quest.findText}` : ''}`, 'good');
    }
  }

  private handleEchoDeath(spawnId: string): void {
    const spawn = this.region.echoSpawns?.find((e) => e.id === spawnId);
    if (!spawn) return;
    const st = this.echoes.get(spawnId);
    if (st) {
      st.uid = null;
      st.respawnAt = this.sim.time + spawn.respawnSec;
    }
    this.echoHeroes.forEach((id, uid) => {
      if (id === spawnId) this.echoHeroes.delete(uid);
    });
    this.advanceQuests({ kind: 'kill-echoes', amount: 1, regionId: this.region.id });
    if (this.recruited.has(spawn.heroId)) {
      this.unlockOwnedHeroEcho(spawn.heroId);
    } else {
      this.advanceAttunement(spawn.heroId);
      this.autosave('attunement');
    }
  }

  private rebuildHeroUnit(recIdx: number): void {
    const rec = this.party[recIdx];
    if (!rec) return;
    if (rec.unit) {
      const pos = { ...rec.unit.pos };
      const facing = rec.unit.facing;
      this.serializeHero(rec);
      this.sim.removeUnit(rec.unit.uid);
      const u = this.spawnHeroFromRecord(rec, pos);
      u.facing = facing;
      rec.unit = u;
      if (recIdx === this.activeIdx) {
        this.sim.playerActiveUid = u.uid;
        this.scene.selectedUid = u.uid;
        this.retargetEntourage();
      }
    }
  }

  // ---------- save / load ----------

  canSave(): { ok: boolean; reason?: string } {
    if (this.inCombat()) return { ok: false, reason: 'Cannot save in combat' };
    const u = this.activeUnit();
    if (!u || !u.alive) return { ok: false, reason: 'Active hero is down' };
    return { ok: true };
  }

  buildSave(): GameSave {
    const active = this.party[this.activeIdx];
    if (active.unit) this.serializeHero(active);
    const partySaves = this.party.map((rec) => heroSaveFromRosterEntry(rec, this.sim.time));
    const partyIds = new Set(partySaves.map((r) => r.heroId));
    const benchSaves = [...this.benchRoster.values()]
      .filter((r) => !partyIds.has(r.heroId))
      .map(cloneHeroSave);
    this.syncEncounterCodex();
    return {
      version: SAVE_VERSION,
      name: REG.hero(this.party[0].heroId).name,
      createdAt: this.createdAt,
      savedAt: Date.now(),
      playtimeSec: Math.round(this.playtime),
      worldSeed: this.region.seed,
      dayTime: this.dayTime,
      gold: Math.round(this.gold),
      regionId: this.region.id,
      playerPos: active.unit ? { ...active.unit.pos } : { ...this.region.shrine.pos },
      party: this.party.map((r) => r.heroId),
      activeIdx: this.activeIdx,
      roster: [...partySaves, ...benchSaves],
      stash: [],
      inventoryStash: this.inventoryStash.map((i) => cloneItemSave(i)!),
      groundItemDrops: this.groundItemDrops.map(cloneGroundItemDrop),
      caught: this.caught.map((c) => ({ ...c })),
      fielded: [...this.fielded],
      recruited: [...this.recruited],
      badges: [...this.badges],
      questProgress: structuredClone(this.questProgress),
      quests: structuredClone(this.quests),
      defeatedGyms: [...this.defeatedGyms],
      echoRespawn: this.echoRespawnMap(),
      campRespawn: this.campRespawnMap(),
      difficulty: structuredClone(this.difficulty),
      raidProgress: structuredClone(this.raidProgress),
      dungeonProgress: structuredClone(this.dungeonProgress),
      eliteFive: { ...this.eliteFive },
      factionChoices: { ...this.factionChoices },
      heldUniques: [...this.heldUniques],
      neutralStash: this.neutralStash.map((n) => ({ ...n, copies: n.copies?.map((item) => cloneItemSave(item)!) })),
      lootMarks: { ...this.lootMarks },
      lootFilter: { ...this.lootFilter },
      goldSinks: { ...this.goldSinks },
      essence: this.essence,
      loadouts: structuredClone(this.loadouts),
      reputation: this.reputation,
      codexUnlocks: [...this.codexUnlocks],
      journalSeen: [...this.journalSeen],
      stamina: this.stamina,
      discovered: [...this.discovered],
      openedChests: [...this.openedChests],
      collectedShards: [...this.collectedShards],
      solvedPuzzles: [...this.solvedPuzzles],
      shardsTurnedIn: { ...this.shardsTurnedIn },
      explorationPct: { ...this.explorationPct },
      regionVisits: { ...this.regionVisits },
      resin: this.resin,
      resinUpdatedAt: this.resinUpdatedAt,
      settings: { ...this.settings, keyBindings: normalizeKeyBindings(this.settings.keyBindings), audio: { ...this.settings.audio }, graphics: { ...defaultGraphicsSettings(), ...this.settings.graphics }, cutscene: { ...defaultCutsceneSettings(), ...this.settings.cutscene }, interface: { ...defaultInterfaceSettings(), ...this.settings.interface } }
    };
  }

  private campRespawnMap(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, st] of this.camps) {
      if (st.respawnAt > this.sim.time) out[id] = st.respawnAt - this.sim.time;
    }
    return out;
  }

  private echoRespawnMap(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, st] of this.echoes) {
      if (st.respawnAt > this.sim.time) out[id] = st.respawnAt - this.sim.time;
    }
    return out;
  }

  saveToSlot(slot: number): boolean {
    const check = this.canSave();
    if (!check.ok) {
      this.msg(check.reason!, 'bad');
      return false;
    }
    localStorage.setItem(SLOT_KEYS[slot], JSON.stringify(this.buildSave()));
    this.msg(`Saved to slot ${slot + 1}`, 'good');
    return true;
  }

  autosave(reason: string): void {
    const u = this.activeUnit();
    if (!u || !u.alive) return;
    try {
      localStorage.setItem(AUTO_KEY, JSON.stringify(this.buildSave()));
      this.msg(`Autosaved (${reason})`, 'info');
    } catch {
      /* storage full/blocked: skip */
    }
  }

  static slotInfo(slot: number | 'auto'): { name: string; level: number; playtime: number; savedAt: number } | null {
    const key = slot === 'auto' ? AUTO_KEY : SLOT_KEYS[slot];
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as GameSave;
      const lead = s.roster[s.activeIdx] ?? s.roster[0];
      return { name: s.name, level: lead?.level ?? 1, playtime: s.playtimeSec, savedAt: s.savedAt };
    } catch {
      return null;
    }
  }

  static loadSlot(slot: number | 'auto'): GameSave | null {
    const key = slot === 'auto' ? AUTO_KEY : SLOT_KEYS[slot];
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as unknown;
      return Game.migrateSave(s);
    } catch {
      return null;
    }
  }

  static migrateSave(s: unknown): GameSave | null {
    if (!s || typeof s !== 'object') return null;
    const v = s as Partial<GameSave>;
    if (v.version === 2 || v.version === 3 || v.version === 4 || v.version === 5 || v.version === 6 || v.version === 7 || v.version === SAVE_VERSION) {
      // v2/v3 -> v3 shape, v4 audio/codex fields, v5 exploration, v6 Armory,
      // v7 board quests, then v8 tag-gauge persistence.
      const migrated = migrateTagGaugeSave(migratePhase3Save(v as unknown as { version: number; [k: string]: unknown }));
      return Game.validateSave(migrated) ? migrated : null;
    }
    return null;
  }

  static validateSave(s: unknown): s is GameSave {
    if (!s || typeof s !== 'object') return false;
    const v = s as Partial<GameSave>;
    if (v.version !== SAVE_VERSION) return false;
    if (typeof v.name !== 'string' || typeof v.createdAt !== 'number' || typeof v.savedAt !== 'number') return false;
    if (typeof v.playtimeSec !== 'number' || typeof v.worldSeed !== 'number' || typeof v.dayTime !== 'number') return false;
    if (typeof v.gold !== 'number' || typeof v.regionId !== 'string' || !REG.regions.has(v.regionId)) return false;
    if (!v.playerPos || typeof v.playerPos.x !== 'number' || typeof v.playerPos.y !== 'number') return false;
    if (!Array.isArray(v.party) || v.party.length < 1 || v.party.length > 5) return false;
    if (!Array.isArray(v.roster) || !Array.isArray(v.recruited) || !Array.isArray(v.caught) || !Array.isArray(v.fielded)) return false;
    if (!Array.isArray(v.badges) || !v.badges.every((b) => typeof b === 'string')) return false;
    if (!v.questProgress || typeof v.questProgress !== 'object') return false;
    if (!v.quests || typeof v.quests !== 'object') return false;
    for (const q of Object.values(v.questProgress)) {
      if (!q || typeof q !== 'object') return false;
      if (!['unfound', 'found', 'trial-complete', 'bound'].includes(q.stage)) return false;
      if (typeof q.attunement !== 'number' || q.attunement < 0) return false;
      if (typeof q.trialCompletions !== 'number' || q.trialCompletions < 0) return false;
    }
    if (!Array.isArray(v.defeatedGyms) || !v.defeatedGyms.every((g) => typeof g === 'string' && REG.gyms.has(g))) return false;
    if (!v.echoRespawn || typeof v.echoRespawn !== 'object') return false;
    if (!v.campRespawn || typeof v.campRespawn !== 'object') return false;
    if (!v.difficulty || typeof v.difficulty !== 'object') return false;
    for (const [bossId, d] of Object.entries(v.difficulty)) {
      if (!REG.bosses.has(bossId)) return false;
      if (!['normal', 'nightmare', 'hell'].includes(d.tier) || typeof d.dryClears !== 'number') return false;
    }
    if (!Array.isArray(v.inventoryStash)) return false;
    if (!Array.isArray(v.groundItemDrops) || !v.groundItemDrops.every((drop) =>
      drop &&
      typeof drop.uid === 'number' &&
      drop.uid > 0 &&
      drop.item &&
      typeof drop.item.id === 'string' &&
      REG.items.has(drop.item.id) &&
      drop.pos &&
      typeof drop.pos.x === 'number' &&
      typeof drop.pos.y === 'number' &&
      (drop.context === undefined || drop.context === 'overworld' || drop.context === 'dungeon') &&
      (drop.createdAt === undefined || typeof drop.createdAt === 'number')
    )) return false;
    if (!v.raidProgress || typeof v.raidProgress !== 'object') return false;
    for (const [raidId, r] of Object.entries(v.raidProgress)) {
      if (!REG.raids.has(raidId)) return false;
      if (typeof r.clears !== 'number' || typeof r.dryStreak !== 'number') return false;
    }
    if (!v.dungeonProgress || typeof v.dungeonProgress !== 'object') return false;
    for (const [dungeonId, r] of Object.entries(v.dungeonProgress)) {
      if (!REG.dungeons.has(dungeonId)) return false;
      if (typeof r.clears !== 'number' || typeof r.wipes !== 'number' || typeof r.bestDepth !== 'number') return false;
      if (!['normal', 'nightmare', 'hell'].includes(r.bestTier)) return false;
      if (r.lastTier !== undefined && !['normal', 'nightmare', 'hell'].includes(r.lastTier)) return false;
      if (r.lastModifiers !== undefined && (!Array.isArray(r.lastModifiers) || !r.lastModifiers.every((id) => typeof id === 'string'))) return false;
      if (r.lastClearedAt !== undefined && typeof r.lastClearedAt !== 'number') return false;
      if (r.dryStreaks !== undefined && (!r.dryStreaks || typeof r.dryStreaks !== 'object' || !Object.values(r.dryStreaks).every((n) => typeof n === 'number' && n >= 0))) return false;
    }
    if (!v.eliteFive || typeof v.eliteFive.defeated !== 'number' || typeof v.eliteFive.championDown !== 'boolean') return false;
    if (!v.factionChoices || typeof v.factionChoices !== 'object') return false;
    if (!Array.isArray(v.heldUniques) || !v.heldUniques.every((id) => typeof id === 'string' && REG.items.has(id))) return false;
    if (!Array.isArray(v.neutralStash) || !v.neutralStash.every((n) =>
      REG.neutralItems.has(n.id) &&
      typeof n.count === 'number' &&
      n.count >= 0 &&
      (n.copies === undefined || (Array.isArray(n.copies) && n.copies.every((item) => item.id === n.id)))
    )) return false;
    if (!v.lootMarks || typeof v.lootMarks !== 'object') return false;
    for (const band of ['early', 'mid', 'late'] as const) {
      if (typeof v.lootMarks[band] !== 'number' || v.lootMarks[band] < 0) return false;
    }
    if (v.lootFilter !== undefined) {
      if (!ITEM_GRADES.includes(v.lootFilter.minGrade) || !(v.lootFilter.minRarity in RARITY_RANK)) return false;
      if (v.lootFilter.autoDisenchantBelowGrade !== undefined && !ITEM_GRADES.includes(v.lootFilter.autoDisenchantBelowGrade)) return false;
      if (v.lootFilter.autoDisenchantBelowRarity !== undefined && !(v.lootFilter.autoDisenchantBelowRarity in RARITY_RANK)) return false;
    }
    if (!v.goldSinks || typeof v.goldSinks.buybacks !== 'number' || typeof v.goldSinks.tomesUsed !== 'number' || typeof v.goldSinks.respecs !== 'number') return false;
    if (typeof v.goldSinks.gambleRolls !== 'number' || typeof v.goldSinks.salvages !== 'number') return false;
    if (typeof v.essence !== 'number' || v.essence < 0) return false;
    if (!v.loadouts || typeof v.loadouts !== 'object') return false;
    for (const [heroId, byName] of Object.entries(v.loadouts)) {
      if (!REG.heroes.has(heroId) || !byName || typeof byName !== 'object') return false;
      for (const slots of Object.values(byName)) {
        if (!Array.isArray(slots) || slots.length !== TUNING.itemSlots) return false;
        if (!slots.every((id) => id === null || (typeof id === 'string' && REG.items.has(id)))) return false;
      }
    }
    if (v.regionVisits !== undefined) {
      if (!v.regionVisits || typeof v.regionVisits !== 'object') return false;
      for (const [regionId, visits] of Object.entries(v.regionVisits)) {
        if (!REG.regions.has(regionId) || typeof visits !== 'number' || visits < 0) return false;
      }
    }
    if (typeof v.reputation !== 'number') return false;
    if (!Array.isArray(v.codexUnlocks) || !v.codexUnlocks.every((id) => typeof id === 'string')) return false;
    if (!Array.isArray(v.journalSeen) || !v.journalSeen.every((id) => typeof id === 'string')) return false;
    if (typeof v.stamina !== 'number' || v.stamina < 0 || v.stamina > TUNING.traversal.staminaMax + 1000) return false;
    if (!Array.isArray(v.discovered) || !v.discovered.every((id) => typeof id === 'string')) return false;
    if (!Array.isArray(v.openedChests) || !v.openedChests.every((id) => typeof id === 'string')) return false;
    if (!Array.isArray(v.collectedShards) || !v.collectedShards.every((id) => typeof id === 'string')) return false;
    if (!Array.isArray(v.solvedPuzzles) || !v.solvedPuzzles.every((id) => typeof id === 'string')) return false;
    if (!v.shardsTurnedIn || typeof v.shardsTurnedIn !== 'object') return false;
    if (!Object.values(v.shardsTurnedIn).every((n) => typeof n === 'number' && n >= 0)) return false;
    if (!v.explorationPct || typeof v.explorationPct !== 'object') return false;
    if (!Object.values(v.explorationPct).every((n) => typeof n === 'number' && n >= 0 && n <= 100)) return false;
    if (typeof v.resin !== 'number' || v.resin < 0 || v.resin > TUNING.resin.max) return false;
    if (typeof v.resinUpdatedAt !== 'number' || v.resinUpdatedAt < 0) return false;
    if (typeof v.activeIdx !== 'number' || v.activeIdx < 0 || v.activeIdx >= v.party.length) return false;
    if (!v.settings || typeof v.settings.quickcast !== 'boolean') return false;
    if (v.settings.resonance !== undefined && typeof v.settings.resonance !== 'boolean') return false;
    if (v.settings.minimap !== undefined && typeof v.settings.minimap !== 'boolean') return false;
    if (!isValidKeyBindings(v.settings.keyBindings)) return false;
    const audio = v.settings.audio;
    if (!audio || typeof audio.master !== 'number' || typeof audio.sfx !== 'number') return false;
    if (audio.ui !== undefined && (typeof audio.ui !== 'number' || audio.ui < 0 || audio.ui > 1)) return false;
    if (typeof audio.voice !== 'number' || typeof audio.stinger !== 'number' || typeof audio.muted !== 'boolean') return false;
    const graphics = v.settings.graphics;
    if (graphics !== undefined) {
      if (!['auto', 'low', 'medium', 'high', 'ultra'].includes(graphics.quality)) return false;
      if (typeof graphics.autoAdjustQuality !== 'boolean') return false;
      if (graphics.frameTarget !== 30 && graphics.frameTarget !== 60) return false;
      if (!['tier', 'off', 'low', 'high'].includes(graphics.bloom)) return false;
      if (!['tier', 'off', 'on'].includes(graphics.ambientOcclusion)) return false;
      if (!['tier', 'off', 'on'].includes(graphics.antiAliasing)) return false;
      if (!['tier', 'off', 'low', 'high'].includes(graphics.shadows)) return false;
      if (!['low', 'medium', 'high'].includes(graphics.drawDistance)) return false;
      if (!['auto', 'full', 'balanced', 'reduced'].includes(graphics.crowdDetail)) return false;
      if (typeof graphics.vfxDensity !== 'number' || graphics.vfxDensity < 0.5 || graphics.vfxDensity > 1.5) return false;
      if (typeof graphics.battleScale !== 'number' || graphics.battleScale < 0.5 || graphics.battleScale > 1.5) return false;
      if (typeof graphics.screenShake !== 'number' || graphics.screenShake < 0 || graphics.screenShake > 1) return false;
      if (typeof graphics.exposure !== 'number' || graphics.exposure < 0.5 || graphics.exposure > 1.5) return false;
      if (typeof graphics.grade !== 'number' || graphics.grade < 0 || graphics.grade > 1.5) return false;
      if (typeof graphics.reducedMotion !== 'boolean') return false;
      if (typeof graphics.colorblind !== 'boolean') return false;
    }
    const iface = v.settings.interface;
    if (iface !== undefined) {
      if (typeof iface.uiScale !== 'number' || iface.uiScale < 0.75 || iface.uiScale > 1.5) return false;
      if (typeof iface.textScale !== 'number' || iface.textScale < 1 || iface.textScale > 1.3) return false;
      if (typeof iface.hudOpacity !== 'number' || iface.hudOpacity < 0.55 || iface.hudOpacity > 1) return false;
      if (typeof iface.minimapSize !== 'number' || iface.minimapSize < 120 || iface.minimapSize > 240) return false;
      if (typeof iface.minimapOpacity !== 'number' || iface.minimapOpacity < 0.35 || iface.minimapOpacity > 1) return false;
      if (typeof iface.helpOverlay !== 'boolean') return false;
      if (typeof iface.questTracker !== 'boolean') return false;
      if (!Number.isInteger(iface.questTrackerMax) || iface.questTrackerMax < 1 || iface.questTrackerMax > 3) return false;
    }
    for (const heroId of v.party) {
      if (typeof heroId !== 'string' || !REG.heroes.has(heroId)) return false;
      if (!v.roster.some((r) => r.heroId === heroId)) return false;
    }
    for (const r of v.roster) {
      if (!r || typeof r.heroId !== 'string' || !REG.heroes.has(r.heroId)) return false;
      if (!Array.isArray(r.items) || r.items.length !== TUNING.itemSlots) return false;
      if (r.neutralSlot !== null && r.neutralSlot !== undefined && !REG.neutralItems.has(r.neutralSlot.id)) return false;
      if (r.gambits !== undefined && (!Array.isArray(r.gambits) || r.gambits.length > 8)) return false;
      if (r.abilityLevels !== undefined && (!Array.isArray(r.abilityLevels) || !r.abilityLevels.every((n) => typeof n === 'number' && n >= 0))) return false;
      if (r.attributePoints !== undefined && (typeof r.attributePoints !== 'number' || r.attributePoints < 0)) return false;
      if (!Array.isArray(r.talentPicks) || r.talentPicks.length !== 4) return false;
      if (typeof r.tagGaugeReadyAt !== 'number' || r.tagGaugeReadyAt < 0) return false;
      if (r.echo !== undefined) {
        if (typeof r.echo.kills !== 'number' || r.echo.kills < 0) return false;
        if (typeof r.echo.facetSwapUnlocked !== 'boolean') return false;
        if (!Array.isArray(r.echo.talentTierUnlocks) || r.echo.talentTierUnlocks.length !== 4) return false;
        if (!r.echo.talentTierUnlocks.every((x) => typeof x === 'boolean')) return false;
      }
      if (!Array.isArray(r.abilityCooldowns)) return false;
    }
    for (const c of v.caught) {
      if (!c || typeof c.uid !== 'string' || typeof c.creepId !== 'string' || !REG.creeps.has(c.creepId)) return false;
      if (![1, 2, 3].includes(c.star)) return false;
    }
    return true;
  }

  exportSave(): void {
    const blob = new Blob([JSON.stringify(this.buildSave(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ancients-save-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- death / respawn ----------

  /** where the next swap-in should appear when the previous hero is already gone */
  private pendingSpawnPos: Vec2 | null = null;

  private handleHeroDeath(rec: RosterEntry): void {
    const respawnSec = 15 + rec.level * 3;
    rec.respawnAt = this.sim.time + respawnSec;
    this.serializeHero(rec);
    rec.hpPct = 0.5;
    rec.manaPct = 0.5;
    if (rec.unit) {
      this.pendingSpawnPos = { ...rec.unit.pos };
      const deadUid = rec.unit.uid;
      // let the death animation play, then clean up
      setTimeout(() => this.sim.removeUnit(deadUid), 2500);
      rec.unit = null;
    }

    const recIdx = this.party.indexOf(rec);
    const aliveIdx = this.party.findIndex((r, i) => i !== recIdx && r.respawnAt <= this.sim.time);
    if (aliveIdx >= 0) {
      this.msg(`${REG.hero(rec.heroId).name} has fallen! Swapping...`, 'bad');
      this.swapReadyAt = 0; // death swap is free
      this.trySwap(aliveIdx);
    } else {
      this.partyWipe();
    }
    this.pendingSpawnPos = null;
  }

  private partyWipe(): void {
    const tax = Math.round(this.gold * TUNING.deathGoldLossPct);
    this.gold -= tax;
    this.msg(`Party wiped! Lost ${tax} gold. Waking at the shrine...`, 'bad');
    for (const rec of this.party) {
      rec.respawnAt = 0;
      rec.hpPct = Math.max(rec.hpPct, 0.6);
      rec.manaPct = Math.max(rec.manaPct, 0.6);
    }
    // unfield entourage units (they re-field at the shrine)
    const fieldedNow = [...this.fielded];
    for (const id of fieldedNow) this.unfieldCreep(id);
    const rec = this.party[this.activeIdx];
    const u = this.spawnHeroFromRecord(rec, {
      x: this.region.shrine.pos.x + 120,
      y: this.region.shrine.pos.y + 120
    });
    rec.unit = u;
    this.sim.playerActiveUid = u.uid;
    this.scene.selectedUid = u.uid;
    for (const id of fieldedNow) this.fieldCreep(id, true);
  }

  // ---------- kill rewards ----------

  private handleKillCredit(ev: Extract<SimEvent, { t: 'kill-credit' }>): void {
    const killer = this.sim.unit(ev.killerUid);
    if (!killer || killer.team !== 0) return; // only player-team kills pay
    const victim = this.sim.unit(ev.victimUid);
    const bounty = scaledBounty(ev.bounty, this.region.id, 'normal', victim?.tier, victim?.star ?? 1);
    const states = this.party.map((rec, i) => ({
      heroId: rec.heroId,
      isActive: i === this.activeIdx,
      participated:
        i === this.activeIdx ||
        this.sim.time - rec.lastCombatAt <= TUNING.participantWindowSec
    }));
    const reward = computeKillReward(bounty, states, ev.lastHitByPlayer);
    this.awardGold(reward.gold, ev.lastHitByPlayer ? 'lasthit' : 'kill', victim?.pos, true);
    const cap = this.recruitLevelCap();
    for (const r of reward.perHeroXp) {
      const rec = this.party.find((p) => p.heroId === r.heroId)!;
      const overflowGold = overflowXpToGold(rec.level, rec.unit ? rec.unit.xp : rec.xp, r.xp);
      this.awardGold(overflowGold, 'overflow', victim?.pos, true);
      if (rec.unit) {
        // recruit ceiling (§3.4): XP banks past the cap, the level stays clamped
        const gained = rec.unit.addXp(r.xp, cap);
        if (gained > 0) {
          rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, rec.unit.level);
          rec.attributePoints = normalizeAttributePoints(rec.heroId, rec.unit.level, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
          rec.unit.refresh(this.sim.time);
          // level-up heals the gained stats portion
          rec.unit.hp = Math.min(rec.unit.stats.maxHp, rec.unit.hp + gained * 80);
          this.playPresentationEventNow({ t: 'levelup', uid: rec.unit.uid, level: rec.unit.level });
          this.msg(`${REG.hero(rec.heroId).name} reached level ${rec.unit.level}! Skill point available.`, 'good');
        }
        rec.level = rec.unit.level;
        rec.xp = rec.unit.xp;
      } else {
        rec.xp = Math.min(rec.xp + r.xp, xpForLevel(TUNING.levelCap));
        const newLevel = Math.min(levelFromXp(rec.xp), cap);
        if (newLevel > rec.level) {
          rec.level = newLevel;
          rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, rec.level);
          rec.attributePoints = normalizeAttributePoints(rec.heroId, rec.level, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
          this.msg(`${REG.hero(rec.heroId).name} reached level ${newLevel}! Skill point available.`, 'good');
        }
      }
    }

    // neutral drop on a slain wild creep (§3.7): rolls into the dedicated neutral stash.
    // Overworld kills roll their loot at the region's combat tier so the nightmare/hell
    // drop columns are live in deep regions, matching the creep-combat scaling (GAMEPLAY_2.0 §0.2).
    if (victim && victim.kind === 'creep' && victim.tier) {
      this.rollItemDropsForCreep(victim.creepId, victim.tier, ev.victimUid, creepCombatTier(this.region.id), victim.pos);
      if (this.eliteCreepUids.delete(ev.victimUid)) this.rollEliteCreepDrop(victim.tier, ev.victimUid, victim.pos);
      this.rollNeutralFor(victim.tier, ev.victimUid);
      this.advanceQuests({ kind: 'kill-creeps', amount: 1, tier: victim.tier, regionId: this.region.id });
    }
    if (victim && victim.kind === 'hero' && victim.team !== 0) this.rollHeroLoadoutDrop(victim);

    // Inscribed copies bank the holder's kills into a capped, growing stack (LOOT L5).
    this.creditInscribedKills(killer);
  }

  /** Grow the killer's Inscribed items by one banked kill, up to the grade cap. */
  private creditInscribedKills(killer: Unit): void {
    const cap = QUALITY_GRADES.inscribed.killCap ?? 0;
    let changed = false;
    for (const it of killer.items) {
      if (it?.quality !== 'inscribed') continue;
      const cur = it.inscribedKills ?? 0;
      if (cur >= cap) continue;
      it.inscribedKills = cur + 1;
      changed = true;
    }
    if (changed) {
      killer.markStatsDirty();
      killer.refresh(this.sim.time);
    }
  }

  private handleCaptureComplete(ev: Extract<SimEvent, { t: 'capture-complete' }>, source: 'overworld' | 'dungeon' = 'overworld', regionId = this.region.id): void {
    const inst: CreepInstanceSave = { uid: newCreepInstanceId(), creepId: ev.creepId, star: 1 };
    this.caught.push(inst);
    const def = REG.creep(ev.creepId);
    this.codexUnlock('creep:' + ev.creepId); // capturing is the encounter (§3.14)
    this.advanceQuests({ kind: 'capture-creeps', amount: 1, tier: def.tier, regionId });
    this.msg(`Captured ${def.name}!`, 'good');
    const { list, merges } = mergeCreeps(this.caught);
    this.caught = list;
    for (const m of merges) {
      this.playPresentationStinger('merge');
      this.msg(`Merge! 3× ${REG.creep(m.creepId).name} → ${'★'.repeat(m.toStar)}`, 'good');
      // merged-away instances may have been fielded; clean up stale fielded refs
      this.fielded = this.fielded.filter((id) => this.caught.some((c) => c.uid === id));
      for (const [instId, simUid] of [...this.fieldedUnits]) {
        if (!this.caught.some((c) => c.uid === instId)) {
          const u = this.sim.unit(simUid);
          if (u && u.alive) this.sim.removeUnit(simUid);
          this.fieldedUnits.delete(instId);
          this.liveDungeon?.removeEntourage(instId);
        }
      }
    }
    if (source === 'dungeon') this.msg('The binding holds through the descent.', 'info');
    this.autosave('capture');
  }

  // ---------- camps ----------

  private updateCamps(): void {
    for (const [id, st] of this.camps) {
      if (st.respawnAt > 0) {
        if (this.sim.time >= st.respawnAt) {
          const camp = this.region.camps.find((c) => c.id === id)!;
          const u = this.activeUnit();
          // don't respawn on the player's head
          if (u && dist(u.pos, camp.pos) < camp.radius + 600) {
            st.respawnAt = this.sim.time + 10;
            continue;
          }
          st.uids = this.spawnCampCreeps(id);
          st.respawnAt = 0;
        }
        continue;
      }
      // all dead (or captured) -> start respawn timer
      const anyAlive = st.uids.some((uid) => {
        const u = this.sim.unit(uid);
        return u && u.alive;
      });
      if (!anyAlive && st.uids.length > 0) {
        const camp = this.region.camps.find((c) => c.id === id)!;
        st.uids = [];
        st.respawnAt = this.sim.time + camp.respawnSec;
        if (camp.leyLine) this.payLeyLine(camp.leyLine, camp.pos);
      }
    }
  }

  /**
   * Ley-line outcrop payout (GAMEPLAY_OVERHAUL §3.5, Pillar P5): a cleared outcrop
   * camp pays a resin-gated gold/XP bump. Soft pacing — with enough resin (or resin
   * disabled) it pays in full; otherwise it still pays, just a reduced dry amount.
   */
  private payLeyLine(ley: { resinCost: number; bonusGold: number; bonusXp: number }, pos: Vec2): void {
    const full = this.spendResinForLoot(ley.resinCost);
    if (full) {
      this.awardGold(ley.bonusGold, 'leyline', pos, true);
      this.awardPartyXp(ley.bonusXp);
      this.msg(`Ley-line outcrop tapped: +${ley.bonusGold}g and a surge of XP.`, 'good');
    } else {
      const gold = Math.round(ley.bonusGold * TUNING.resin.dryLootGoldPct);
      this.awardGold(gold, 'leyline-dry', pos, true);
      this.msg(`Ley-line outcrop tapped, but the Moonflow is dry: +${gold}g only.`, 'info');
    }
  }

  /** Distribute XP across the whole party (used by ley-line outcrops, §3.5). */
  private awardPartyXp(xp: number): void {
    if (xp <= 0) return;
    const cap = this.recruitLevelCap();
    for (const rec of this.party) {
      if (rec.unit) {
        const gained = rec.unit.addXp(xp, cap);
        if (gained > 0) {
          rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, rec.unit.level);
          rec.attributePoints = normalizeAttributePoints(rec.heroId, rec.unit.level, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
          rec.unit.refresh(this.sim.time);
        }
        rec.level = rec.unit.level;
        rec.xp = rec.unit.xp;
      } else {
        rec.xp = Math.min(rec.xp + xp, xpForLevel(TUNING.levelCap));
        const newLevel = Math.min(levelFromXp(rec.xp), cap);
        if (newLevel > rec.level) {
          rec.level = newLevel;
          rec.abilityLevels = normalizeAbilityLevels(REG.hero(rec.heroId), rec.abilityLevels, rec.level);
          rec.attributePoints = normalizeAttributePoints(rec.heroId, rec.level, rec.abilityLevels, rec.talentPicks, rec.attributePoints);
        }
      }
    }
  }

  private updateEchoes(): void {
    for (const [id, st] of this.echoes) {
      if (st.uid !== null) continue;
      if (st.respawnAt <= 0 || this.sim.time < st.respawnAt) continue;
      const spawn = this.region.echoSpawns?.find((e) => e.id === id);
      if (!spawn) continue;
      if (!this.echoSpawnReady(spawn)) {
        st.respawnAt = this.sim.time + 10;
        continue;
      }
      const u = this.activeUnit();
      if (u && dist(u.pos, spawn.pos) < 700) {
        st.respawnAt = this.sim.time + 10;
        continue;
      }
      st.uid = this.spawnHeroEcho(id);
      st.respawnAt = 0;
    }
  }

  // ---------- shrine ----------

  private updateShrine(dt: number): void {
    const u = this.activeUnit();
    if (!u || !u.alive || this.inCombat()) return;
    if (dist(u.pos, this.region.shrine.pos) > 500) return;
    const rate = TUNING.shrineHealPctPerSec;
    u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.maxHp * rate * dt);
    u.mana = Math.min(u.stats.maxMana, u.mana + u.stats.maxMana * rate * dt);
    for (const [, simUid] of this.fieldedUnits) {
      const c = this.sim.unit(simUid);
      if (c && c.alive && dist(c.pos, this.region.shrine.pos) <= 500) {
        c.hp = Math.min(c.stats.maxHp, c.hp + c.stats.maxHp * rate * dt);
      }
    }
  }

  private setSprintMod(u: Unit | null, enabled: boolean): void {
    if (!u) return;
    const amount = (TUNING.locomotion.sprintSpeedMult - 1) * 100;
    const active = this.sprintModUid === u.uid;
    if (enabled === active) return;
    u.externalMods.moveSpeedPct = (u.externalMods.moveSpeedPct ?? 0) + (enabled ? amount : -amount);
    u.markStatsDirty();
    u.refresh(this.sim.time);
    this.sprintModUid = enabled ? u.uid : -1;
  }

  private updateLocomotion(dt: number): void {
    const u = this.activeUnit();
    if (!u || !u.alive) {
      this.sprintModUid = -1;
      return;
    }
    if (this.sprintModUid !== -1 && this.sprintModUid !== u.uid) this.sprintModUid = -1;
    const staminaMax = this.staminaMax();
    if (this.stamina > staminaMax) this.stamina = staminaMax;

    // Verticality first (§3.3): a scripted climb/glide or swim takes priority over sprint.
    if (this.updateTraversal(u, dt)) return;

    const moving = u.order.kind === 'move' || u.order.kind === 'attack-move' || u.order.kind === 'attack-unit';
    const sprinting = this.sprintHeld && moving && this.stamina > 0 && !u.summary.rooted && !u.summary.stunned && !u.summary.cycloned && !u.summary.sleeping && !u.summary.frozen;
    this.setSprintMod(u, sprinting);
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - TUNING.traversal.sprintDrainPerSec * dt);
      this.staminaRegenReadyAt = this.sim.time + TUNING.traversal.regenDelaySec;
      if (this.stamina <= 0) this.setSprintMod(u, false);
      return;
    }
    this.setSprintMod(u, false);
    if (this.sim.time >= this.staminaRegenReadyAt) {
      this.stamina = Math.min(staminaMax, this.stamina + TUNING.traversal.staminaRegenPerSec * dt);
    }
  }

  // ---------- verticality & traversal (GAMEPLAY_OVERHAUL §3.3, G3) ----------

  /** Current locomotion state, for HUD readout, render, and traversal prompts. */
  locomotionState(): 'ground' | 'climb' | 'glide' | 'swim' {
    if (this.traversal) return this.traversal.kind;
    return this.swimModUid !== -1 ? 'swim' : 'ground';
  }

  /** Active hero's elevation tier index (0 = ground). */
  elevationTier(): number {
    return this.heroTier;
  }

  /** World-height of a tier (for render). Falls back to a flat ladder when a region
   * declares no explicit tier heights. */
  private tierHeight(tier: number): number {
    const tiers = this.region.elevation?.tiers;
    if (tiers && tiers[tier] !== undefined) return tiers[tier];
    return tier * 220;
  }

  /** A climb point the active hero can use right now (matching its current tier in either direction). */
  nearbyClimbPoint(): NonNullable<RegionDef['climbPoints']>[number] | null {
    const u = this.activeUnit();
    if (!u || this.traversal) return null;
    const r = TUNING.traversal.connectorRadius;
    return (this.region.climbPoints ?? []).find((c) =>
      dist(u.pos, c.pos) <= r && (c.fromTier === this.heroTier || c.toTier === this.heroTier)
    ) ?? null;
  }

  /** A glide point the active hero can launch from right now (must be on its from-tier). */
  nearbyGlidePoint(): NonNullable<RegionDef['glidePoints']>[number] | null {
    const u = this.activeUnit();
    if (!u || this.traversal) return null;
    const r = TUNING.traversal.connectorRadius;
    return (this.region.glidePoints ?? []).find((g) =>
      dist(u.pos, g.pos) <= r && g.fromTier === this.heroTier && this.heroTier > 0
    ) ?? null;
  }

  /** Begin a scripted climb at a nearby climb point. Ascends or descends one tier,
   * draining stamina over the climb; running dry mid-climb slides back down (§3.3). */
  tryClimb(): boolean {
    if (this.traversal || this.swimModUid !== -1) return false;
    const u = this.activeUnit();
    const point = this.nearbyClimbPoint();
    if (!u || !point) {
      this.msg('No climb point in reach', 'bad');
      return false;
    }
    if (this.stamina <= 0) {
      this.msg('Too winded to climb', 'bad');
      return false;
    }
    const toTier = point.fromTier === this.heroTier ? point.toTier : point.fromTier;
    u.order = { kind: 'stop' };
    this.traversal = { kind: 'climb', t: 0, dur: TUNING.traversal.climbDurationSec, fromTier: this.heroTier, toTier };
    u.setCastGesture('dash', { now: this.sim.time, lockUntil: this.sim.time + TUNING.traversal.climbDurationSec });
    return true;
  }

  /** Deploy the glider at a nearby glide point: a free, committing descent of one tier (§3.3). */
  tryGlide(): boolean {
    if (this.traversal || this.swimModUid !== -1) return false;
    const u = this.activeUnit();
    const point = this.nearbyGlidePoint();
    if (!u || !point) {
      this.msg('No height to glide from', 'bad');
      return false;
    }
    u.order = { kind: 'stop' };
    this.traversal = { kind: 'glide', t: 0, dur: TUNING.traversal.glideDescentSec, fromTier: this.heroTier, toTier: Math.max(0, this.heroTier - 1) };
    u.setCastGesture('dash', { now: this.sim.time, lockUntil: this.sim.time + TUNING.traversal.glideDescentSec });
    return true;
  }

  /** Advance climb/glide scripts and the swim state. Returns true while a vertical state
   * owns locomotion (so sprint/stamina-regen are skipped this tick). */
  private updateTraversal(u: Unit, dt: number): boolean {
    if (this.traversal) {
      const tr = this.traversal;
      if (tr.kind === 'climb') {
        this.stamina = Math.max(0, this.stamina - TUNING.traversal.climbDrainPerSec * dt);
        this.staminaRegenReadyAt = this.sim.time + TUNING.traversal.regenDelaySec;
        if (this.stamina <= 0) {
          // ran dry mid-climb: slide back to where we started
          this.heroTier = tr.fromTier;
          u.renderHeight = this.tierHeight(tr.fromTier);
          this.traversal = null;
          this.msg('Out of stamina — slid back down', 'bad');
          return true;
        }
      }
      tr.t = Math.min(tr.dur, tr.t + dt);
      const p = tr.dur > 0 ? tr.t / tr.dur : 1;
      u.renderHeight = this.tierHeight(tr.fromTier) + (this.tierHeight(tr.toTier) - this.tierHeight(tr.fromTier)) * p;
      if (tr.t >= tr.dur) {
        this.heroTier = tr.toTier;
        u.renderHeight = this.tierHeight(tr.toTier);
        this.traversal = null;
      }
      return true;
    }

    // swim: entering a water zone slows movement and drains stamina; deep water at zero
    // stamina is a soft fail (wash back to the last dry footing), never instant death.
    const zone = this.waterZoneAt(u.pos);
    if (zone) {
      this.setSwimMod(u, true);
      this.stamina = Math.max(0, this.stamina - TUNING.traversal.swimDrainPerSec * dt);
      this.staminaRegenReadyAt = this.sim.time + TUNING.traversal.regenDelaySec;
      if (zone.deep && this.stamina <= 0 && this.lastSafePos) {
        u.pos = { ...this.lastSafePos };
        u.order = { kind: 'stop' };
        this.stamina = Math.min(this.staminaMax(), TUNING.traversal.washbackStaminaRefund);
        this.setSwimMod(u, false);
        this.msg('The current washes you back to shore', 'bad');
      }
      u.renderHeight = this.tierHeight(this.heroTier);
      return true;
    }
    this.setSwimMod(u, false);
    this.lastSafePos = { ...u.pos };
    u.renderHeight = this.tierHeight(this.heroTier);
    return false;
  }

  private waterZoneAt(pos: Vec2): NonNullable<RegionDef['waterZones']>[number] | null {
    for (const z of this.region.waterZones ?? []) {
      if (pointInPolygon(pos, z.poly)) return z;
    }
    return null;
  }

  private setSwimMod(u: Unit | null, enabled: boolean): void {
    if (!u) return;
    const amount = (TUNING.traversal.swimSpeedMult - 1) * 100; // negative: a slow
    const active = this.swimModUid === u.uid;
    if (enabled === active) return;
    u.externalMods.moveSpeedPct = (u.externalMods.moveSpeedPct ?? 0) + (enabled ? amount : -amount);
    u.markStatsDirty();
    u.refresh(this.sim.time);
    this.swimModUid = enabled ? u.uid : -1;
  }

  private updateWorldElements(): void {
    const u = this.activeUnit();
    if (!u || !u.alive) return;
    for (const src of this.region.elementSources ?? []) {
      if (dist(u.pos, src.pos) > src.radius) continue;
      if (src.carriable) this.carriedElement = { element: src.element, until: this.sim.time + TUNING.resonanceElementGaugeSec };
      if (!this.sim.resonanceEnabled) continue;
      applyElementAura(this.sim, u, u, src.element, 1, false);
      for (const target of this.sim.unitsInRadius(src.pos, src.radius, (o) => o.team !== u.team)) {
        applyElementAura(this.sim, u, target, src.element, 1, true);
      }
    }
    if (this.carriedElement && this.carriedElement.until <= this.sim.time) this.carriedElement = null;
    if (this.carriedElement) this.updateElementPuzzles(this.carriedElement.element);
  }

  /** Ambient elemental weather (GAMEPLAY_OVERHAUL §3.7): on its interval, a region's
   * weather state applies its element to every outdoor unit through the same field path
   * an element source uses. Gated by the day/night clock and by Resonance. */
  private updateWeather(): void {
    const w = this.region.weather;
    if (!w || !this.sim.resonanceEnabled) return;
    if (w.night !== undefined && this.isNight() !== w.night) return;
    if (this.sim.time < this.weatherNextAt) return;
    this.weatherNextAt = this.sim.time + w.interval;
    const src = this.activeUnit();
    if (!src || !src.alive) return;
    for (const u of this.sim.unitsArr) {
      if (!u.alive || u.kind === 'ward' || u.kind === 'npc') continue;
      applyElementAura(this.sim, src, u, w.element, 1, u.team !== src.team);
    }
  }

  private updateElementPuzzles(element: ActiveElement): void {
    const u = this.activeUnit();
    if (!u) return;
    for (const puzzle of this.region.elementPuzzles ?? []) {
      if (this.solvedPuzzles.has(puzzle.id) || puzzle.requires !== element) continue;
      const radius = puzzle.radius ?? TUNING.exploration.puzzleNodeRadius;
      const progress = this.puzzleProgress.get(puzzle.id) ?? { lit: new Set<number>(), startedAt: this.sim.time };
      if (puzzle.timeLimitSec && this.sim.time - progress.startedAt > puzzle.timeLimitSec) {
        progress.lit.clear();
        progress.startedAt = this.sim.time;
      }
      puzzle.nodes.forEach((node, idx) => {
        if (dist(u.pos, node) <= radius) progress.lit.add(idx);
      });
      this.puzzleProgress.set(puzzle.id, progress);
      if (progress.lit.size >= puzzle.nodes.length) {
        this.solvedPuzzles.add(puzzle.id);
        this.discovered.add(puzzle.reveals);
        this.msg(`Elemental puzzle solved: ${puzzle.kind.replace('-', ' ')}`, 'good');
        this.refreshExplorationRewards();
      }
    }
  }

  private updateDiscovery(): void {
    const u = this.activeUnit();
    if (!u || !u.alive) return;
    for (const wp of this.region.waypoints ?? []) {
      const radius = wp.radius ?? TUNING.exploration.waypointRadius;
      if (!this.discovered.has(wp.id) && dist(u.pos, wp.pos) <= radius) {
        this.discovered.add(wp.id);
        this.msg(`Waystone activated: ${wp.name}`, 'good');
      }
    }
    for (const shard of this.region.shards ?? []) {
      if (!this.collectedShards.has(shard.id) && dist(u.pos, shard.pos) <= TUNING.exploration.pickupRadius) {
        this.collectedShards.add(shard.id);
        this.msg('Mad Moon shard recovered', 'good');
      }
    }
    for (const d of this.region.discoveries ?? []) {
      if (!this.discovered.has(d.id) && dist(u.pos, d.pos) <= d.radius) {
        this.discovered.add(d.id);
        this.discovered.add(d.reveals);
        this.msg(d.hint, 'info');
      }
    }
    this.refreshExplorationRewards();
  }

  private refreshExplorationRewards(): void {
    const pct = this.computeExplorationPct(this.region.id);
    for (const threshold of [25, 50, 75, 100]) {
      const token = `explore:${this.region.id}:${threshold}`;
      if (pct >= threshold && !this.discovered.has(token)) {
        this.discovered.add(token);
        this.awardGold(TUNING.exploration.explorationThresholdRewardGold, `exploration:${threshold}`, undefined, true);
        this.msg(`${this.region.name} ${threshold}% explored`, 'good');
      }
    }
  }

  // ---------- main update ----------

  update(realDt: number): void {
    this.realClock += realDt;
    this.cinematic.update(Math.min(realDt, 0.1));
    this.runPendingAfterCinematic();
    if (this.liveGym) {
      this.updateLiveGym(realDt);
      return;
    }
    if (this.liveRaid) {
      this.updateLiveRaid(realDt);
      return;
    }
    if (this.liveDungeon) {
      this.updateLiveDungeon(realDt);
      return;
    }
    if (this.cinematic.active) {
      this.scene.syncQuestGivers?.(this.questGiverViews());
      this.scene.update(this.sim, this.activeUnit(), 0, this.dayTime, this.cinematicPresentationView(), this.visibleGroundItemDrops());
      return;
    }
    if (this.paused) {
      this.scene.syncQuestGivers?.(this.questGiverViews());
      this.scene.update(this.sim, this.activeUnit(), 0, this.dayTime, this.cinematicPresentationView(), this.visibleGroundItemDrops());
      return;
    }
    const slowmo = this.realClock < this.lootSlowmoUntil ? TUNING.loot.signatureSlowmoScale : 1;
    const dt = Math.min(realDt, 0.1) * slowmo;
    this.playtime += dt;
    this.regenResinToPlaytime();
    this.dayTime = (this.dayTime + dt / TUNING.dayLengthSec) % 1;
    this.refreshDayNightMods();
    this.updateLocomotion(dt);
    this.updateWorldElements();
    this.updateWeather();

    // fixed-step sim
    this.accumulator += dt;
    let simTicks = 0;
    while (this.accumulator >= this.sim.dt && simTicks < TUNING.maxSimTicksPerFrame) {
      this.sim.tick();
      this.accumulator -= this.sim.dt;
      simTicks++;
    }
    if (simTicks >= TUNING.maxSimTicksPerFrame && this.accumulator >= this.sim.dt) {
      this.accumulator = 0;
    }

    this.reapOffFieldUnits();
    this.flushPendingSwap();
    this.updatePendingRecruit();

    // participation tracking for the active hero
    const activeRec = this.party[this.activeIdx];
    if (activeRec?.unit) {
      const u = activeRec.unit;
      if (this.sim.time - u.lastDealtDamageAt < 1 || this.sim.time - u.lastEnemyDamageAt < 1) {
        activeRec.lastCombatAt = this.sim.time;
      }
    }

    // drain + route events
    this.frameEvents = [...this.sim.events.drain(), ...this.queuedPresentationEvents];
    this.queuedPresentationEvents = [];
    this.audio.setListener?.(this.activeUnit()?.pos ?? null);
    for (const ev of this.frameEvents) {
      this.scene.pushEvent(ev, this.sim);
      this.routeEventAudio(ev, this.sim);
      this.activeTrial?.observe(ev);
      switch (ev.t) {
        case 'kill-credit':
          this.handleKillCredit(ev);
          break;
        case 'capture-complete':
          this.handleCaptureComplete(ev);
          break;
        case 'death': {
          const bindingHeroId = this.bindingHeroes.get(ev.uid);
          if (bindingHeroId) {
            this.bindingHeroes.delete(ev.uid);
            this.recruitHero(bindingHeroId);
            break;
          }
          const echoSpawnId = this.echoHeroes.get(ev.uid);
          if (echoSpawnId) {
            this.handleEchoDeath(echoSpawnId);
            break;
          }
          // party hero?
          const rec = this.party.find((r) => r.unit && r.unit.uid === ev.uid);
          if (rec) {
            this.handleHeroDeath(rec);
            break;
          }
          // entourage creep?
          for (const [instId, simUid] of this.fieldedUnits) {
            if (simUid === ev.uid) {
              const inst = this.caught.find((c) => c.uid === instId);
              if (inst) {
                inst.faintedFor = TUNING.entourageFaintSec;
                this.msg(`${REG.creep(inst.creepId).name} fainted (back in ${TUNING.entourageFaintSec}s)`, 'bad');
              }
              this.fieldedUnits.delete(instId);
              this.fielded = this.fielded.filter((id) => id !== instId);
            }
          }
          break;
        }
        default:
          break;
      }
    }

    // STORY §7.3 — esports legend Easter-eggs read the overworld stream (Hooked Home, etc.)
    this.observeStory(this.frameEvents, {
      sim: this.sim,
      townPos: this.region.town.pos,
      townRadius: this.region.town.radius
    });

    // recruitment trial (§3.1): evaluate after events are observed
    if (this.activeTrial) {
      const outcome = this.activeTrial.tick(this.sim.time);
      if (outcome !== 'running') this.finishTrial(outcome);
    }

    // faint timers (1 Hz)
    if (this.sim.time >= this.faintTickAt) {
      const step = this.sim.time - (this.faintTickAt - 1);
      this.faintTickAt = this.sim.time + 1;
      for (const c of this.caught) {
        if (c.faintedFor && c.faintedFor > 0) {
          c.faintedFor = Math.max(0, c.faintedFor - step);
          if (c.faintedFor === 0) {
            c.faintedFor = undefined;
            this.msg(`${REG.creep(c.creepId).name} recovered`, 'info');
          }
        }
      }
    }

    this.updateCamps();
    this.updateEchoes();
    this.updateShrine(dt);
    this.updateDiscovery();
    this.advanceQueuedOrder();

    // town-entry autosave
    const inTownNow = this.inTown();
    if (inTownNow && !this.wasInTown) this.autosave('town');
    this.wasInTown = inTownNow;

    // timer autosave
    if (this.playtime >= this.autosaveAt) {
      this.autosaveAt = this.playtime + TUNING.autosaveSec;
      if (!this.inCombat()) this.autosave('timer');
    }

    this.audio.update?.({ biome: this.region.biome, dayTime: this.dayTime, inCombat: this.inCombat(), dt });
    this.scene.syncQuestGivers?.(this.questGiverViews());
    this.scene.update(this.sim, this.activeUnit(), dt, this.dayTime, this.cinematicPresentationView(), this.visibleGroundItemDrops());
  }
}
