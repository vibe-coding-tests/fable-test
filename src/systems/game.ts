import { TUNING } from '../data/tuning';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { Unit } from '../core/unit';
import { autoPicksForLevel, buildHero } from '../core/hero-setup';
import { spawnHeroEchoUnit } from '../core/echo-unit';
import { TrialRunner, trialGateOpen, type TrialGateCtx, type TrialOutcome } from '../core/trials';
import { freshEchoProgress, normalizeEchoProgress, recordOwnedHeroEchoKill } from '../core/echo';
import { computeKillReward, overflowXpToGold, recruitLevelCap } from '../core/progression';
import {
  bossLootSeed,
  bossTierUnlocked,
  buybackCost,
  chooseFaction,
  dayNightMods,
  defaultPhase3SaveFields,
  draftTeams,
  enchantNeutralItem,
  migratePhase3Save,
  rerollNeutralItem,
  respecCost,
  rollLoot,
  rollNeutralDrop,
  scaledBounty,
  stableContentSeed,
  tierScale,
  tomePurchase,
  type LootRoll
} from '../core/phase3';
import { defaultAudioSettings, defaultPhase4SaveFields, migratePhase4Save } from '../core/phase4';
import { mergeCreeps, newCreepInstanceId, validateEntourage } from '../core/capture';
import { computeBuyPlan, executeBuy, itemSaveOf, itemStateFromSave, sellValue, sortInventory } from '../core/items';
import { runRaidBattle, runRaidEncounter, runMacroBattle, type RaidEncounterResult } from '../core/macro';
import { ELITE_DRAFT } from '../data/drafts';
import { resonanceMods } from '../core/resonance';
import { levelFromXp, xpForLevel } from '../core/stats';
import { dist } from '../core/math2d';
import type { BossDef, CreepTier, CreepInstanceSave, DifficultyTier, DraftDef, EchoProgress, GambitRule, GameSave, ItemSave, MacroHeroSetup, NeutralItemDef, Order, QuestProgress, RaidDef, RegionDef, SimEvent, Vec2 } from '../core/types';
import { ProceduralAudio } from '../engine/audio';
import { GameScene } from '../engine/scene';
import { LiveGymFight, runGymMatch, type GymMatchHero, type GymMatchResult } from './macro-session';

/** The Roshan raid — the only one that yields the Aegis, respawns on a timer, and re-drops cheese (§3.9). */
const ROSHAN_RAID_ID = 'roshan-pit';

/** Top-tier power that only drops from bosses/raids — never vended by any shop or gold sink (§6). */
export const GATED_TOP_TIER: ReadonlySet<string> = new Set([
  'divine-rapier', 'butterfly', 'scythe-of-vyse', 'heart-of-tarrasque', 'eye-of-skadi',
  'refresher-orb', 'aghanims-scepter', 'aegis-of-the-immortal', 'refresher-shard', 'cheese'
]);

// ------------------------------------------------------------------
// Overworld orchestration (SPEC layout: /src/systems/): party, swap,
// camps, capture/entourage, shop, shrine, day clock, save/load.
// ------------------------------------------------------------------

export const SAVE_VERSION = 4;
const SLOT_KEYS = ['ancients.save.1', 'ancients.save.2', 'ancients.save.3'];
const AUTO_KEY = 'ancients.save.auto';

export interface RosterEntry {
  heroId: string;
  level: number;
  xp: number;
  talentPicks: (0 | 1 | null)[];
  gambits: GambitRule[];
  echo: EchoProgress;
  facetIdx: number;
  hpPct: number;
  manaPct: number;
  items: (ItemSave | null)[];
  neutralSlot: ItemSave | null;
  abilityCooldowns: number[]; // remaining sec at serialize time
  benchedAt: number;          // game time at swap-out
  respawnAt: number;          // 0 = alive
  lastCombatAt: number;
  fleshStacks?: Record<string, number>;
  dayNightMods: Record<string, number>;
  resonanceMods: Record<string, number>;
  neutralMods?: Record<string, number>; // currently-applied neutral-slot passive mods
  unit: Unit | null;
}

export interface Toast {
  text: string;
  kind: 'info' | 'good' | 'bad' | 'bark';
  at: number;
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

/** Neutral-slot passive mods as a flat record (auras/actives apply through their own systems). */
function neutralPassiveMods(neutralId: string | undefined): Record<string, number> {
  if (!neutralId) return {};
  const def = REG.neutralItem(neutralId);
  return def.passiveMods ? { ...(def.passiveMods as Record<string, number>) } : {};
}

export function newGameSave(starterHeroId: string): GameSave {
  const region = REG.region('tranquil-vale');
  const phase3 = defaultPhase3SaveFields();
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
        talentPicks: [null, null, null, null],
        gambits: [],
        echo: freshEchoProgress(),
        facetIdx: 0,
        hpPct: 1,
        manaPct: 1,
        abilityCooldowns: [0, 0, 0, 0]
      }
    ],
    stash: [],
    caught: [],
    fielded: [],
    recruited: [starterHeroId],
    badges: [],
    questProgress: {},
    defeatedGyms: [],
    echoRespawn: {},
    campRespawn: {},
    ...phase3,
    ...defaultPhase4SaveFields(),
    settings: { quickcast: true, resonance: false, minimap: true, audio: defaultAudioSettings() }
  };
}

/** The slice of GameScene the orchestrator calls; lets tests run headless. */
export interface SceneLike {
  selectedUid: number;
  terrain: { obstacles: { pos: Vec2; radius: number }[] };
  pushEvent(ev: SimEvent, sim: Sim): void;
  update(sim: Sim, followUnit: Unit | null, renderDt: number, timeOfDay01: number): void;
}

/** The slice of ProceduralAudio the orchestrator calls. */
export interface AudioLike {
  setSettings(settings: GameSave['settings']): void;
  handleEvent(ev: SimEvent): void;
}

/** No-op scene for headless (test/CI) runs — no WebGL, no DOM. */
export class HeadlessScene implements SceneLike {
  selectedUid = -1;
  terrain = { obstacles: [] as { pos: Vec2; radius: number }[] };
  pushEvent(): void {}
  update(): void {}
}

/** No-op audio for headless runs. */
export class HeadlessAudio implements AudioLike {
  setSettings(): void {}
  handleEvent(): void {}
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
  activeIdx = 0;
  swapReadyAt = 0;

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
  badges = new Set<string>();
  questProgress: Record<string, QuestProgress> = {};
  defeatedGyms = new Set<string>();
  difficulty: GameSave['difficulty'] = {};
  inventoryStash: ItemSave[] = [];
  raidProgress: GameSave['raidProgress'] = {};
  eliteFive: GameSave['eliteFive'] = { defeated: 0, championDown: false };
  factionChoices: Record<string, string> = {};
  heldUniques: string[] = [];
  neutralStash: GameSave['neutralStash'] = [];
  goldSinks: GameSave['goldSinks'] = { buybacks: 0, tomesUsed: 0, respecs: 0 };
  reputation = 0;
  codexUnlocks = new Set<string>();
  journalSeen = new Set<string>();

  /** active recruitment trial (Phase 6 §3.1) */
  activeTrial: TrialRunner | null = null;
  private activeTrialHeroId: string | null = null;
  private activeTrialNpcUid: number | null = null;
  /** heroId -> how many times its trial has relocated (cycles relocateSpots) */
  private trialRelocations = new Map<string, number>();

  private camps = new Map<string, CampState>();
  private echoes = new Map<string, EchoState>();
  private accumulator = 0;
  private autosaveAt = TUNING.autosaveSec;
  private wasInTown = false;
  private faintTickAt = 0;
  private createdAt = 0;
  private queuedOrders: Order[] = [];

  /** Active live gym fight (§3.5): when set, update() steps + renders it instead of the overworld. */
  liveGym: LiveGymFight | null = null;
  private liveGymId: string | null = null;
  /** HUD hook: open the gym pre-fight screen (§3.5). Null in headless. */
  onOpenGymPrefight: ((gymId: string) => void) | null = null;

  toasts: Toast[] = [];
  /** events the HUD wants this frame (damage floaters, gold, barks) */
  frameEvents: SimEvent[] = [];
  private queuedPresentationEvents: SimEvent[] = [];
  paused = false;

  /** Headless game for tests/CI: no WebGL scene, no audio. */
  static headless(save: GameSave): Game {
    return new Game(null, save, { scene: new HeadlessScene(), audio: new HeadlessAudio() });
  }

  constructor(canvas: HTMLCanvasElement | null, save: GameSave, deps?: GameDeps) {
    this.region = REG.region(save.regionId);
    this.scene = (deps?.scene ?? new GameScene(canvas as HTMLCanvasElement, this.region)) as unknown as GameScene;
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
    this.defeatedGyms = new Set(save.defeatedGyms);
    this.difficulty = structuredClone(save.difficulty);
    this.inventoryStash = save.inventoryStash.map((i) => ({ ...i }));
    this.raidProgress = structuredClone(save.raidProgress);
    this.eliteFive = { ...save.eliteFive };
    this.factionChoices = { ...save.factionChoices };
    this.heldUniques = [...save.heldUniques];
    this.neutralStash = save.neutralStash.map((n) => ({ ...n }));
    this.goldSinks = { ...save.goldSinks };
    this.reputation = save.reputation ?? 0;
    this.codexUnlocks = new Set(save.codexUnlocks ?? []);
    this.journalSeen = new Set(save.journalSeen ?? []);

    this.party = save.party.map((heroId) => {
      const hs = save.roster.find((r) => r.heroId === heroId)!;
      return {
        heroId,
        level: hs.level,
        xp: hs.xp,
        talentPicks: [...hs.talentPicks],
        gambits: [...(hs.gambits ?? [])],
        echo: normalizeEchoProgress(hs.echo),
        facetIdx: hs.facetIdx,
        hpPct: hs.hpPct,
        manaPct: hs.manaPct,
        items: hs.items.map((i) => (i ? { ...i } : null)),
        neutralSlot: hs.neutralSlot ? { ...hs.neutralSlot } : null,
        abilityCooldowns: [...hs.abilityCooldowns],
        benchedAt: 0,
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
      audio: { ...defaultAudioSettings(), ...save.settings.audio }
    };
    this.sim.resonanceEnabled = this.settings.resonance ?? false;
    this.audio.setSettings(this.settings);
    this.refreshResonanceMods(true);
  }

  settings: GameSave['settings'] = { quickcast: true, resonance: false, minimap: true, audio: defaultAudioSettings() };

  // ---------- helpers ----------

  activeUnit(): Unit | null {
    return this.party[this.activeIdx]?.unit ?? null;
  }

  msg(text: string, kind: Toast['kind'] = 'info'): void {
    this.toasts.push({ text, kind, at: performance.now() / 1000 });
    if (this.toasts.length > 60) this.toasts.splice(0, this.toasts.length - 60);
  }

  private emitPresentationEvent(ev: SimEvent, routeNow = false): void {
    if (routeNow) this.frameEvents.push(ev);
    else this.queuedPresentationEvents.push(ev);
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

  nearbyGym(): NonNullable<RegionDef['gyms']>[number] | null {
    const u = this.activeUnit();
    if (!u) return null;
    return (this.region.gyms ?? []).find((g) => dist(u.pos, g.pos) <= g.radius) ?? null;
  }

  tryInteract(): boolean {
    const gym = this.nearbyGym();
    if (gym) {
      if (!this.gymStartGuard(gym.gymId)) return false;
      if (this.onOpenGymPrefight) {
        this.onOpenGymPrefight(gym.gymId);
        return true;
      }
      return this.challengeGym(gym.gymId);
    }
    return this.tryTravel();
  }

  tryTravel(): boolean {
    const gate = this.nearbyGate();
    if (!gate) {
      this.msg('No route gate nearby', 'bad');
      return false;
    }
    if (gate.requiredBadge && !this.badges.has(gate.requiredBadge)) {
      this.msg(`${gate.name} requires ${gate.requiredBadge.replace('-', ' ')}`, 'bad');
      return false;
    }
    if (gate.requiresRecruits && this.recruitedCount() < gate.requiresRecruits) {
      this.msg(`${gate.name} requires recruiting ${gate.requiresRecruits} hero${gate.requiresRecruits > 1 ? 'es' : ''} first`, 'bad');
      return false;
    }
    const target = REG.region(gate.toRegionId);
    const save = this.buildSave();
    save.regionId = target.id;
    save.worldSeed = target.seed;
    save.playerPos = { ...gate.toPos };
    save.campRespawn = {};
    save.echoRespawn = {};
    save.savedAt = Date.now();
    this.msg(`Traveling to ${target.name}...`, 'info');
    window.dispatchEvent(new CustomEvent('ancients:load', { detail: save }));
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
    this.scene.resetUnitViews(); // gym sim uids must not alias overworld views
    this.msg(`${gym.name}: best of ${gym.bestOf}. Spend Captain Calls (Space) to seize a hero.`, 'info');
    return true;
  }

  /** Player spends a Captain Call on an ult-ready hero in the live gym fight. */
  liveGymPlayerCall(): boolean {
    if (!this.liveGym) return false;
    const ok = this.liveGym.playerCaptainCall();
    if (!ok) this.msg('No Captain Call available', 'bad');
    return ok;
  }

  private updateLiveGym(dt: number): void {
    const fight = this.liveGym;
    if (!fight) return;
    if (!this.paused) fight.step(Math.min(dt, 0.1));
    for (const ev of fight.sim.events.drain()) {
      this.scene.pushEvent(ev, fight.sim);
      this.audio.handleEvent(ev);
    }
    this.scene.update(fight.sim, fight.cameraFollow(), dt, 0.5);
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
    this.scene.resetUnitViews(); // drop gym views so the overworld re-syncs cleanly
  }

  private applyGymResult(gymId: string, result: GymMatchResult): boolean {
    const gym = REG.gym(gymId);
    this.msg(`${gym.name}: ${result.playerWins}-${result.enemyWins}`, result.winner === 0 ? 'good' : 'bad');
    if (result.winner === 0) {
      this.defeatedGyms.add(gym.id);
      this.badges.add(gym.badgeId);
      this.applyRecruitCeiling(); // a new badge raises the ceiling; banked XP catches up (§3.4)
      this.msg(`${gym.leader} awards the ${gym.badgeId.replace('-', ' ')}!`, 'good');
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
    const scale = tierScale(tier);
    const bossLevel = boss.rank === 'boss' ? 28 : 24;
    const result = runRaidBattle({
      seed: this.region.seed + Math.round(this.playtime) + bossId.length,
      party: this.gymPlayerTeam(),
      boss: {
        heroId: boss.heroId,
        level: bossLevel,
        items: ['black-king-bar', 'assault-cuirass'],
        hpScale: TUNING.raidBossHpScale * scale.hp,
        damageScale: TUNING.raidBossDamageScale * scale.damage
      }
    });
    if (result.winner !== 0) {
      this.msg(`${REG.hero(boss.heroId).name} (${tier}) survived — regroup and retry`, 'bad');
      return { won: false };
    }
    const dryStreak = this.difficulty[bossId]?.dryClears ?? 0;
    const loot = rollLoot(boss.loot, tier, dryStreak, bossLootSeed(boss, tier, dryStreak));
    this.deliverLoot(loot);
    // store the cleared tier + new pity streak: Nightmare opens after any clear (badge-gated),
    // Hell opens once a Nightmare clear has reset the streak (bossTierUnlocked).
    this.difficulty[bossId] = { tier, dryClears: loot.dryStreak };
    const drop = loot.assembled
      ? `dropped ${REG.item(loot.assembled.id).name}${loot.pityUsed ? ' (pity!)' : ''}!`
      : `${loot.guaranteed.length} component${loot.guaranteed.length === 1 ? '' : 's'}`;
    this.msg(`${REG.hero(boss.heroId).name} (${tier}) defeated — ${drop}`, 'good');
    this.autosave('boss');
    return { won: true, loot };
  }

  private deliverLoot(loot: LootRoll): void {
    for (const it of loot.guaranteed) this.inventoryStash.push({ ...it });
    if (loot.assembled) {
      this.inventoryStash.push({ ...loot.assembled });
      if (!this.heldUniques.includes(loot.assembled.id)) this.heldUniques.push(loot.assembled.id);
    }
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
    this.msg(`${def.name} cleared! (clear #${clears + 1})`, 'good');
    this.audio.handleEvent({ t: 'cast', uid: -1, abilityId: 'stinger:raid-clear', vfx: { archetype: 'global-mark', color: '#ffd27a' } });
    this.autosave('raid');
    return { won: true, result };
  }

  /** Deliver a raid clear's loot + pity; Roshan also grants the Aegis, sets the respawn timer, and re-drops cheese. */
  private deliverRaidLoot(def: RaidDef, tier: DifficultyTier, raidId: string, clears: number): void {
    const dryStreak = this.raidProgress[raidId]?.dryStreak ?? 0;
    const loot = rollLoot(def.loot, tier, dryStreak, stableContentSeed(`${raidId}:loot:${tier}`, clears));
    const next = { ...(this.raidProgress[raidId] ?? { clears: 0, dryStreak: 0 }) };
    next.clears = clears + 1;
    next.dryStreak = loot.dryStreak;
    for (const it of loot.guaranteed) {
      if (it.id === 'aegis-of-the-immortal') next.aegisHeld = true; // the held one-use charge
      else this.inventoryStash.push({ ...it });
    }
    if (loot.assembled) {
      this.inventoryStash.push({ ...loot.assembled });
      if (!this.heldUniques.includes(loot.assembled.id)) this.heldUniques.push(loot.assembled.id);
      this.msg(`Raid drop: ${REG.item(loot.assembled.id).name}${loot.pityUsed ? ' (pity!)' : ''}`, 'good');
    }
    if (def.id === ROSHAN_RAID_ID) {
      next.aegisHeld = true;
      next.roshanRespawnAt = this.playtime + TUNING.roshanRespawnSec;
      this.msg('Roshan falls — the Aegis of the Immortal is yours.', 'good');
      if (next.clears >= TUNING.roshanRepeatDropFromClear) {
        this.inventoryStash.push({ id: 'refresher-shard' });
        this.inventoryStash.push({ id: 'cheese', charges: 1 });
        this.msg('A repeat kill spills a Refresher Shard and a Cheese.', 'good');
      }
    }
    this.raidProgress[raidId] = next;
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
    const mini: DraftDef = { id: `${ELITE_DRAFT.id}-m${memberIdx}`, members: [member], banPickOrder: ELITE_DRAFT.banPickOrder, champion: ELITE_DRAFT.champion };
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
    const result = runMacroBattle({ seed, teamA: player, teamB: draft.enemy });
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
    const result = runMacroBattle({ seed, teamA: player, teamB: enemy });
    if (result.winner === 0) {
      this.eliteFive.championDown = true;
      this.msg('The Champion is dethroned. The ancients answer to you now.', 'good');
      this.audio.handleEvent({ t: 'cast', uid: -1, abilityId: 'stinger:raid-clear', vfx: { archetype: 'global-mark', color: '#ffd27a' } });
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

  // ---------- neutral items + Tinker's Bench (§3.7) ----------

  private neutralCandidates(): NeutralItemDef[] {
    return [...REG.neutralItems.values()];
  }

  private rollNeutralFor(tier: CreepTier, salt: number): void {
    const seed = this.region.seed + Math.round(this.sim.time * 1000) + salt;
    const drop = rollNeutralDrop(tier, this.neutralCandidates(), seed);
    if (!drop) return;
    this.addNeutral(drop.id);
    this.msg(`Neutral drop: ${drop.name} (→ stash)`, 'good');
  }

  private addNeutral(id: string, n = 1): void {
    const slot = this.neutralStash.find((s) => s.id === id);
    if (slot) slot.count += n;
    else this.neutralStash.push({ id, count: n });
  }

  private takeNeutral(id: string): boolean {
    const slot = this.neutralStash.find((s) => s.id === id);
    if (!slot || slot.count <= 0) return false;
    slot.count -= 1;
    if (slot.count <= 0) this.neutralStash = this.neutralStash.filter((s) => s.id !== id);
    return true;
  }

  /** Re-apply a hero's neutral-slot passive mods to its live unit (mirrors resonance/day-night). */
  private applyNeutralToUnit(rec: RosterEntry): void {
    const u = rec.unit;
    if (!u) {
      rec.neutralMods = neutralPassiveMods(rec.neutralSlot?.id);
      return;
    }
    for (const [k, v] of Object.entries(rec.neutralMods ?? {})) {
      u.externalMods[k] = (u.externalMods[k] ?? 0) - v;
    }
    rec.neutralMods = neutralPassiveMods(rec.neutralSlot?.id);
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
    if (!this.takeNeutral(neutralId)) {
      this.msg('No such neutral in the stash', 'bad');
      return false;
    }
    if (rec.neutralSlot) this.addNeutral(rec.neutralSlot.id); // never lost — returns to stash
    rec.neutralSlot = { id: neutralId };
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
    const name = REG.neutralItem(rec.neutralSlot.id).name;
    this.addNeutral(rec.neutralSlot.id);
    rec.neutralSlot = null;
    this.applyNeutralToUnit(rec);
    this.msg(`Reclaimed ${name} to the stash`, 'info');
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
    this.addNeutral(next.id);
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
    let res: { item: NeutralItemDef; stash: { id: string; count: number }[] };
    try {
      res = enchantNeutralItem(neutralId, this.neutralStash, this.neutralCandidates());
    } catch {
      this.msg('Enchant needs 3 duplicates of an enchantable neutral', 'bad');
      return null;
    }
    this.gold -= cost;
    this.neutralStash = res.stash;
    this.addNeutral(res.item.id);
    this.msg(`Enchant: 3× ${REG.neutralItem(neutralId).name} → ${res.item.name} (-${cost}g)`, 'good');
    return res.item;
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
        rec.unit.autoLevelAbilities(REG.hero(rec.heroId).skillOrder);
        rec.unit.refresh(this.sim.time);
      }
      rec.level = rec.unit.level;
      rec.xp = rec.unit.xp;
    } else {
      rec.xp = Math.min(rec.xp + res.xp, xpForLevel(TUNING.levelCap));
      rec.level = Math.min(levelFromXp(rec.xp), cap);
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
    rec.talentPicks = [null, null, null, null];
    if (rec.unit) {
      const pos = { ...rec.unit.pos };
      this.serializeHero(rec);
      this.sim.removeUnit(rec.unit.uid);
      const u = this.spawnHeroFromRecord(rec, pos);
      rec.unit = u;
      if (recIdx === this.activeIdx) {
        this.sim.playerActiveUid = u.uid;
        this.scene.selectedUid = u.uid;
      }
    }
    this.msg(`${REG.hero(rec.heroId).name} respecced talents (-${cost}g)`, 'good');
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
      const u = this.sim.spawnCreep(def, { team: 1, pos, wild: true, homePos: { ...camp.pos } });
      uids.push(u.uid);
    }
    return uids;
  }

  private spawnEchoes(savedRespawn: Record<string, number>): void {
    for (const spawn of this.region.echoSpawns ?? []) {
      const remaining = savedRespawn[spawn.id];
      if (remaining !== undefined && remaining > 0) {
        this.echoes.set(spawn.id, { uid: null, respawnAt: this.sim.time + remaining });
      } else {
        this.echoes.set(spawn.id, { uid: this.spawnHeroEcho(spawn.id), respawnAt: 0 });
      }
    }
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
    const build = buildHero(REG.hero(rec.heroId), rec.talentPicks, rec.facetIdx, rec.echo);
    const u = this.sim.spawnHero(build.def, {
      team: 0,
      pos: { ...pos },
      level: rec.level,
      ctrl: { kind: 'player' }
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
    rec.neutralMods = neutralPassiveMods(rec.neutralSlot?.id);
    for (const [k, v] of Object.entries(rec.neutralMods)) {
      u.externalMods[k] = (u.externalMods[k] ?? 0) + v;
    }
    u.xp = Math.max(rec.xp, xpForLevel(rec.level));
    rec.items.forEach((s, i) => {
      u.items[i] = s ? itemStateFromSave(s, this.sim.time) : null;
    });
    u.items = sortInventory(u.items);
    if (rec.fleshStacks) {
      for (const k in rec.fleshStacks) u.triggerStacks.set(k, rec.fleshStacks[k]);
    }
    u.markStatsDirty();
    u.refresh(this.sim.time);
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

  trySwap(idx: number): boolean {
    if (idx === this.activeIdx) return false;
    const rec = this.party[idx];
    if (!rec) return false;
    if (rec.respawnAt > this.sim.time) {
      this.msg(`${REG.hero(rec.heroId).name} respawns in ${Math.ceil(rec.respawnAt - this.sim.time)}s`, 'bad');
      return false;
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

    if (cur.unit) {
      this.serializeHero(cur);
      cur.lastCombatAt = Math.max(
        cur.unit.lastDealtDamageAt,
        cur.unit.lastEnemyDamageAt,
        cur.lastCombatAt
      );
      this.sim.removeUnit(cur.unit.uid);
      cur.unit = null;
    }

    const u = this.spawnHeroFromRecord(rec, pos);
    u.facing = facing;
    rec.unit = u;
    rec.respawnAt = 0;
    this.activeIdx = idx;
    this.swapReadyAt = this.sim.time + (this.settings.resonance ? TUNING.resonanceSwapCooldownSec : TUNING.swapCooldownSec);
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

  private issueOrder(order: Order, queued = false): void {
    const u = this.activeUnit();
    if (!u || !u.alive) return;
    if (queued) {
      this.queuedOrders.push(order);
      this.msg(`Queued ${order.kind.replace('-', ' ')}`, 'info');
      return;
    }
    this.queuedOrders = [];
    this.sim.order(u.uid, order);
  }

  private advanceQueuedOrder(): void {
    const u = this.activeUnit();
    if (!u || !u.alive || this.queuedOrders.length === 0) return;
    if (u.order.kind !== 'stop' && u.order.kind !== 'hold') return;
    this.sim.order(u.uid, this.queuedOrders.shift()!);
  }

  orderMove(point: Vec2, queued = false): void {
    this.issueOrder({ kind: 'move', point }, queued);
  }

  orderAttack(uid: number, queued = false): void {
    this.issueOrder({ kind: 'attack-unit', uid }, queued);
  }

  orderAttackMove(point: Vec2, queued = false): void {
    this.issueOrder({ kind: 'attack-move', point }, queued);
  }

  orderStop(): void {
    const u = this.activeUnit();
    if (!u) return;
    this.queuedOrders = [];
    this.sim.order(u.uid, { kind: 'stop' });
  }

  castAbility(slot: number, opts: { uid?: number; point?: Vec2; queued?: boolean }): void {
    const u = this.activeUnit();
    if (!u || !u.alive) return;
    const a = u.abilities[slot];
    if (!a || a.level <= 0) {
      this.msg('Ability not learned', 'bad');
      return;
    }
    const ready = u.abilityReady(slot, this.sim.time);
    if (!ready.ok) {
      this.msg(ready.reason === 'mana' ? 'Not enough mana' : ready.reason === 'cooldown' ? 'On cooldown' : `Cannot cast (${ready.reason})`, 'bad');
      return;
    }
    this.issueOrder({ kind: 'cast', slot, uid: opts.uid, point: opts.point }, opts.queued);
  }

  useItem(invSlot: number, opts: { uid?: number; point?: Vec2; queued?: boolean }): void {
    const u = this.activeUnit();
    if (!u || !u.alive) return;
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
    const u = this.activeUnit();
    const target = this.sim.unit(uid);
    if (!u || !target) return;
    const elig = this.captureEligible(target);
    if (!elig.ok) {
      this.msg(`Cannot capture: ${elig.reason}`, 'bad');
      return;
    }
    this.sim.order(u.uid, { kind: 'capture', uid });
    this.msg(`Binding ${target.name}...`, 'info');
  }

  // ---------- recruitment (Phase 2: Find -> Trial -> Bind) ----------

  tryRecruit(uid: number): void {
    const heroId = this.npcHeroes.get(uid);
    const u = this.activeUnit();
    const npc = this.sim.unit(uid);
    if (!heroId || !u || !npc) return;
    if (dist(u.pos, npc.pos) > 350) {
      this.orderMove({ ...npc.pos });
      return;
    }
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
    const needed = quest.findShardsNeeded ?? TUNING.findShardsNeeded;
    // Find is shard-gated (§3.1): the hero is a rumor until enough echo shards reveal the marker.
    if (qp.stage === 'unfound' && qp.attunement < needed) {
      this.msg(`${def.name} is only a rumor — defeat their echoes (${qp.attunement}/${needed}).`, 'info');
      return;
    }
    if (qp.stage === 'unfound') qp.stage = 'found';
    if (qp.stage === 'found') {
      this.startTrial(heroId, uid);
      return;
    }
    if (qp.stage === 'trial-complete') {
      this.startBindDuel(heroId, uid);
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
        rec.unit.autoLevelAbilities(REG.hero(rec.heroId).skillOrder);
        rec.unit.markStatsDirty();
        rec.unit.refresh(this.sim.time);
      }
      rec.level = lvl;
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
    if (trial.dialogue?.[0]) this.msg(trial.dialogue[0], 'bark');
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
      if (runner.trial.dialogue?.[1]) this.msg(runner.trial.dialogue[1], 'bark');
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
    if (this.party.length >= 5) {
      this.msg('Party is full (5 heroes)', 'bad');
      return false;
    }
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
    this.party.push({
      heroId,
      level: 1,
      xp: 0,
      talentPicks: [null, null, null, null],
      gambits: [],
      echo: freshEchoProgress(),
      facetIdx: 0,
      hpPct: 1,
      manaPct: 1,
      items: [null, null, null, null, null, null],
      neutralSlot: null,
      abilityCooldowns: [0, 0, 0, 0],
      benchedAt: 0,
      respawnAt: 0,
      lastCombatAt: -999,
      dayNightMods: {},
      resonanceMods: {},
      unit: null
    });
    this.refreshResonanceMods(true);
    this.msg(`${def.name} joins the party! (key ${this.party.length})`, 'good');
    if (def.barks.length > 0) this.msg(`${def.name}: "${def.barks[0]}"`, 'bark');
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
    this.msg(`Bought ${def.name}`, 'good');
  }

  sellItem(invSlot: number): void {
    const u = this.activeUnit();
    if (!u) return;
    const it = u.items[invSlot];
    if (!it) return;
    const def = REG.item(it.defId);
    u.items[invSlot] = null;
    u.items = sortInventory(u.items);
    u.markStatsDirty();
    const value = sellValue(def);
    this.awardGold(value, 'sell', u.pos);
    this.msg(`Sold ${def.name} (+${value}g)`, 'info');
  }

  // ---------- talents ----------

  pendingTalentTier(rec: RosterEntry): number {
    const levels = [10, 15, 20, 25];
    for (let i = 0; i < 4; i++) {
      if (rec.level >= levels[i] && rec.talentPicks[i] === null) return i;
    }
    return -1;
  }

  applyTalent(recIdx: number, tier: number, pick: 0 | 1): void {
    const rec = this.party[recIdx];
    if (!rec || rec.talentPicks[tier] !== null) return;
    rec.talentPicks[tier] = pick;
    const def = REG.hero(rec.heroId);
    this.msg(`${def.name}: ${def.talents[tier].options[pick].name}`, 'good');
    this.rebuildHeroUnit(recIdx);
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
    if (result.firstFacetUnlock) this.msg(`${def.name}'s facets are now swappable.`, 'good');
    if (result.unlockedTier !== null) {
      const tier = def.talents[result.unlockedTier];
      const pick = rec.talentPicks[result.unlockedTier];
      const branchName = pick === null ? `level ${tier.level} echo branch` : tier.options[pick === 0 ? 1 : 0].name;
      this.msg(`${def.name}'s echo unlocks ${branchName}.`, 'good');
    } else {
      this.msg(`${def.name}'s echo yields surplus attunement gold.`, 'info');
      this.awardGold(Math.round(def.bounty.gold * 1.5), 'echo', this.activeUnit()?.pos ?? this.region.town.pos);
    }

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
      roster: this.party.map((r) => ({
        heroId: r.heroId,
        level: r.level,
        xp: r.xp,
        items: r.items.map((i) => (i ? { ...i } : null)),
        neutralSlot: r.neutralSlot ? { ...r.neutralSlot } : null,
        gambits: structuredClone(r.gambits),
        talentPicks: [...r.talentPicks],
        echo: {
          kills: r.echo.kills,
          facetSwapUnlocked: r.echo.facetSwapUnlocked,
          talentTierUnlocks: [...r.echo.talentTierUnlocks]
        },
        facetIdx: r.facetIdx,
        hpPct: r.hpPct,
        manaPct: r.manaPct,
        abilityCooldowns: [...r.abilityCooldowns],
        fleshStacks: r.fleshStacks ? { ...r.fleshStacks } : undefined
      })),
      stash: [],
      inventoryStash: this.inventoryStash.map((i) => ({ ...i })),
      caught: this.caught.map((c) => ({ ...c })),
      fielded: [...this.fielded],
      recruited: [...this.recruited],
      badges: [...this.badges],
      questProgress: structuredClone(this.questProgress),
      defeatedGyms: [...this.defeatedGyms],
      echoRespawn: this.echoRespawnMap(),
      campRespawn: this.campRespawnMap(),
      difficulty: structuredClone(this.difficulty),
      raidProgress: structuredClone(this.raidProgress),
      eliteFive: { ...this.eliteFive },
      factionChoices: { ...this.factionChoices },
      heldUniques: [...this.heldUniques],
      neutralStash: this.neutralStash.map((n) => ({ ...n })),
      goldSinks: { ...this.goldSinks },
      reputation: this.reputation,
      codexUnlocks: [...this.codexUnlocks],
      journalSeen: [...this.journalSeen],
      settings: { ...this.settings, audio: { ...this.settings.audio } }
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
    if (v.version === 2 || v.version === 3 || v.version === SAVE_VERSION) {
      // v2/v3 -> v3 shape (phase 3 fields), then v3 -> v4 (audio channels, karma, codex/journal)
      const migrated = migratePhase4Save(migratePhase3Save(v as unknown as { version: number; [k: string]: unknown }));
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
    if (!v.raidProgress || typeof v.raidProgress !== 'object') return false;
    for (const [raidId, r] of Object.entries(v.raidProgress)) {
      if (!REG.raids.has(raidId)) return false;
      if (typeof r.clears !== 'number' || typeof r.dryStreak !== 'number') return false;
    }
    if (!v.eliteFive || typeof v.eliteFive.defeated !== 'number' || typeof v.eliteFive.championDown !== 'boolean') return false;
    if (!v.factionChoices || typeof v.factionChoices !== 'object') return false;
    if (!Array.isArray(v.heldUniques) || !v.heldUniques.every((id) => typeof id === 'string' && REG.items.has(id))) return false;
    if (!Array.isArray(v.neutralStash) || !v.neutralStash.every((n) => REG.neutralItems.has(n.id) && typeof n.count === 'number' && n.count >= 0)) return false;
    if (!v.goldSinks || typeof v.goldSinks.buybacks !== 'number' || typeof v.goldSinks.tomesUsed !== 'number' || typeof v.goldSinks.respecs !== 'number') return false;
    if (typeof v.reputation !== 'number') return false;
    if (!Array.isArray(v.codexUnlocks) || !v.codexUnlocks.every((id) => typeof id === 'string')) return false;
    if (!Array.isArray(v.journalSeen) || !v.journalSeen.every((id) => typeof id === 'string')) return false;
    if (typeof v.activeIdx !== 'number' || v.activeIdx < 0 || v.activeIdx >= v.party.length) return false;
    if (!v.settings || typeof v.settings.quickcast !== 'boolean') return false;
    if (v.settings.resonance !== undefined && typeof v.settings.resonance !== 'boolean') return false;
    if (v.settings.minimap !== undefined && typeof v.settings.minimap !== 'boolean') return false;
    const audio = v.settings.audio;
    if (!audio || typeof audio.master !== 'number' || typeof audio.sfx !== 'number') return false;
    if (typeof audio.voice !== 'number' || typeof audio.stinger !== 'number' || typeof audio.muted !== 'boolean') return false;
    for (const heroId of v.party) {
      if (typeof heroId !== 'string' || !REG.heroes.has(heroId)) return false;
      if (!v.roster.some((r) => r.heroId === heroId)) return false;
    }
    for (const r of v.roster) {
      if (!r || typeof r.heroId !== 'string' || !REG.heroes.has(r.heroId)) return false;
      if (!Array.isArray(r.items) || r.items.length !== TUNING.itemSlots) return false;
      if (r.neutralSlot !== null && r.neutralSlot !== undefined && !REG.neutralItems.has(r.neutralSlot.id)) return false;
      if (r.gambits !== undefined && (!Array.isArray(r.gambits) || r.gambits.length > 8)) return false;
      if (!Array.isArray(r.talentPicks) || r.talentPicks.length !== 4) return false;
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
          rec.unit.autoLevelAbilities(REG.hero(rec.heroId).skillOrder);
          rec.unit.refresh(this.sim.time);
          // level-up heals the gained stats portion
          rec.unit.hp = Math.min(rec.unit.stats.maxHp, rec.unit.hp + gained * 80);
          this.scene.pushEvent({ t: 'levelup', uid: rec.unit.uid, level: rec.unit.level }, this.sim);
          this.msg(`${REG.hero(rec.heroId).name} reached level ${rec.unit.level}!`, 'good');
        }
        rec.level = rec.unit.level;
        rec.xp = rec.unit.xp;
      } else {
        rec.xp = Math.min(rec.xp + r.xp, xpForLevel(TUNING.levelCap));
        const newLevel = Math.min(levelFromXp(rec.xp), cap);
        if (newLevel > rec.level) {
          rec.level = newLevel;
          this.msg(`${REG.hero(rec.heroId).name} reached level ${newLevel}!`, 'good');
        }
      }
    }

    // neutral drop on a slain wild creep (§3.7): rolls into the dedicated neutral stash
    if (victim && victim.kind === 'creep' && victim.tier) {
      this.rollNeutralFor(victim.tier, ev.victimUid);
    }
  }

  private handleCaptureComplete(ev: Extract<SimEvent, { t: 'capture-complete' }>): void {
    const inst: CreepInstanceSave = { uid: newCreepInstanceId(), creepId: ev.creepId, star: 1 };
    this.caught.push(inst);
    const def = REG.creep(ev.creepId);
    this.msg(`Captured ${def.name}!`, 'good');
    const { list, merges } = mergeCreeps(this.caught);
    this.caught = list;
    for (const m of merges) {
      this.msg(`Merge! 3× ${REG.creep(m.creepId).name} → ${'★'.repeat(m.toStar)}`, 'good');
      // merged-away instances may have been fielded; clean up stale fielded refs
      this.fielded = this.fielded.filter((id) => this.caught.some((c) => c.uid === id));
      for (const [instId, simUid] of [...this.fieldedUnits]) {
        if (!this.caught.some((c) => c.uid === instId)) {
          const u = this.sim.unit(simUid);
          if (u && u.alive) this.sim.removeUnit(simUid);
          this.fieldedUnits.delete(instId);
        }
      }
    }
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
      }
    }
  }

  private updateEchoes(): void {
    for (const [id, st] of this.echoes) {
      if (st.uid !== null) continue;
      if (st.respawnAt <= 0 || this.sim.time < st.respawnAt) continue;
      const spawn = this.region.echoSpawns?.find((e) => e.id === id);
      const u = this.activeUnit();
      if (spawn && u && dist(u.pos, spawn.pos) < 700) {
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

  // ---------- main update ----------

  update(realDt: number): void {
    if (this.liveGym) {
      this.updateLiveGym(realDt);
      return;
    }
    if (this.paused) {
      this.scene.update(this.sim, this.activeUnit(), 0, this.dayTime);
      return;
    }
    const dt = Math.min(realDt, 0.1);
    this.playtime += dt;
    this.dayTime = (this.dayTime + dt / TUNING.dayLengthSec) % 1;
    this.refreshDayNightMods();

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
    for (const ev of this.frameEvents) {
      this.scene.pushEvent(ev, this.sim);
      this.audio.handleEvent(ev);
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

    this.scene.update(this.sim, this.activeUnit(), dt, this.dayTime);
  }
}
