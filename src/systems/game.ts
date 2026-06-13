import { TUNING } from '../data/tuning';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { Unit } from '../core/unit';
import { autoPicksForLevel, buildHero } from '../core/hero-setup';
import { freshEchoProgress, normalizeEchoProgress, recordOwnedHeroEchoKill } from '../core/echo';
import { computeKillReward, overflowXpToGold } from '../core/progression';
import { dayNightMods, defaultPhase3SaveFields, migratePhase3Save, scaledBounty } from '../core/phase3';
import { mergeCreeps, newCreepInstanceId, validateEntourage } from '../core/capture';
import { computeBuyPlan, executeBuy, itemSaveOf, itemStateFromSave, sellValue, sortInventory } from '../core/items';
import { resonanceMods } from '../core/resonance';
import { levelFromXp, xpForLevel } from '../core/stats';
import { dist } from '../core/math2d';
import type { CreepInstanceSave, EchoProgress, GambitRule, GameSave, ItemSave, Order, QuestProgress, RegionDef, SimEvent, Vec2 } from '../core/types';
import { ProceduralAudio } from '../engine/audio';
import { GameScene } from '../engine/scene';
import { runGymMatch } from './macro-session';

// ------------------------------------------------------------------
// Overworld orchestration (SPEC layout: /src/systems/): party, swap,
// camps, capture/entourage, shop, shrine, day clock, save/load.
// ------------------------------------------------------------------

export const SAVE_VERSION = 3;
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
    settings: { quickcast: true, resonance: false, masterVolume: 0.8, sfxVolume: 0.8, musicVolume: 0.6 }
  };
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

  private camps = new Map<string, CampState>();
  private echoes = new Map<string, EchoState>();
  private accumulator = 0;
  private autosaveAt = TUNING.autosaveSec;
  private wasInTown = false;
  private faintTickAt = 0;
  private createdAt = 0;
  private queuedOrders: Order[] = [];

  toasts: Toast[] = [];
  /** events the HUD wants this frame (damage floaters, gold, barks) */
  frameEvents: SimEvent[] = [];
  private queuedPresentationEvents: SimEvent[] = [];
  paused = false;

  constructor(canvas: HTMLCanvasElement, save: GameSave) {
    this.region = REG.region(save.regionId);
    this.scene = new GameScene(canvas, this.region);
    this.audio = new ProceduralAudio(this.settings);
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
      masterVolume: save.settings.masterVolume ?? 0.8,
      sfxVolume: save.settings.sfxVolume ?? 0.8,
      musicVolume: save.settings.musicVolume ?? 0.6
    };
    this.sim.resonanceEnabled = this.settings.resonance ?? false;
    this.audio.setSettings(this.settings);
    this.refreshResonanceMods(true);
  }

  settings: GameSave['settings'] = { quickcast: true, resonance: false, masterVolume: 0.8, sfxVolume: 0.8, musicVolume: 0.6 };

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
    if (gym) return this.challengeGym(gym.gymId);
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

  challengeGym(gymId: string): boolean {
    const gym = REG.gym(gymId);
    if (this.defeatedGyms.has(gymId)) {
      this.msg(`${gym.name} already cleared`, 'info');
      return false;
    }
    if (this.party.length < 5) {
      this.msg(`${gym.name} requires a full party of 5 heroes`, 'bad');
      return false;
    }
    const result = runGymMatch(
      gym,
      this.party.slice(0, 5).map((r) => ({
        heroId: r.heroId,
        level: r.level,
        items: r.items.map((i) => i?.id).filter((id): id is string => !!id),
        gambits: r.gambits.length > 0 ? r.gambits : undefined
      })),
      this.region.seed + Math.round(this.playtime)
    );
    this.msg(`${gym.name}: ${result.playerWins}-${result.enemyWins}`, result.winner === 0 ? 'good' : 'bad');
    if (result.winner === 0) {
      this.defeatedGyms.add(gym.id);
      this.badges.add(gym.badgeId);
      this.msg(`${gym.leader} awards the ${gym.badgeId.replace('-', ' ')}!`, 'good');
      this.autosave('badge');
      return true;
    }
    this.msg(`${gym.leader} holds the badge. Tune gambits and try again.`, 'bad');
    return false;
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
    const def = REG.hero(spawn.heroId);
    const build = buildHero(def, autoPicksForLevel(spawn.level), 0);
    const u = this.sim.spawnHero(build.def, {
      team: 1,
      pos: { ...spawn.pos },
      level: spawn.level,
      ctrl: { kind: 'creep', homePos: { ...spawn.pos } }
    });
    u.name = `${def.name} Echo`;
    u.bounty = { xp: Math.round(def.bounty.xp * 1.4), gold: Math.round(def.bounty.gold * 1.4) };
    for (const k in build.externalMods) u.externalMods[k] = (u.externalMods[k] ?? 0) + build.externalMods[k];
    u.markStatsDirty();
    u.refresh(this.sim.time);
    u.hp = u.stats.maxHp;
    u.mana = u.stats.maxMana;
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
    const questId = def.recruitmentQuestId;
    if (!questId || !REG.quests.has(questId)) {
      this.recruitHero(heroId, uid);
      return;
    }
    const quest = REG.quest(questId);
    const trial = REG.trial(quest.trialId);
    const qp = this.questProgress[questId] ?? defaultQuestProgress();
    if (qp.stage === 'unfound') {
      qp.stage = 'found';
      this.questProgress[questId] = qp;
      this.msg(quest.findText, 'info');
      this.msg(`Trial: ${trial.name} — ${trial.description}`, 'info');
      this.autosave('quest-found');
      return;
    }
    if (qp.stage === 'found') {
      qp.stage = 'trial-complete';
      qp.trialCompletions += 1;
      this.questProgress[questId] = qp;
      this.msg(`${trial.name} complete. ${quest.bindText}`, 'good');
      this.autosave('trial');
      return;
    }
    if (qp.stage === 'trial-complete') {
      this.startBindDuel(heroId, uid);
    }
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

  buyItem(itemId: string): void {
    const u = this.activeUnit();
    if (!u) return;
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
    const qp = this.questProgress[questId] ?? defaultQuestProgress();
    qp.stage = qp.stage === 'unfound' ? 'found' : qp.stage;
    qp.attunement += 1;
    this.questProgress[questId] = qp;
    const quest = REG.quests.get(questId);
    this.msg(`${def.name} attunement shard ${qp.attunement}/2${quest ? ` — ${quest.findText}` : ''}`, 'good');
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
      settings: { ...this.settings }
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
    if (v.version === 2 || v.version === SAVE_VERSION) {
      const migrated = migratePhase3Save(v as GameSave);
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
    if (typeof v.activeIdx !== 'number' || v.activeIdx < 0 || v.activeIdx >= v.party.length) return false;
    if (!v.settings || typeof v.settings.quickcast !== 'boolean') return false;
    if (v.settings.resonance !== undefined && typeof v.settings.resonance !== 'boolean') return false;
    if (v.settings.masterVolume !== undefined && typeof v.settings.masterVolume !== 'number') return false;
    if (v.settings.sfxVolume !== undefined && typeof v.settings.sfxVolume !== 'number') return false;
    if (v.settings.musicVolume !== undefined && typeof v.settings.musicVolume !== 'number') return false;
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
    for (const r of reward.perHeroXp) {
      const rec = this.party.find((p) => p.heroId === r.heroId)!;
      const overflowGold = overflowXpToGold(rec.level, rec.unit ? rec.unit.xp : rec.xp, r.xp);
      this.awardGold(overflowGold, 'overflow', victim?.pos, true);
      if (rec.unit) {
        const gained = rec.unit.addXp(r.xp);
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
        const newLevel = levelFromXp(rec.xp);
        if (newLevel > rec.level) {
          rec.level = newLevel;
          this.msg(`${REG.hero(rec.heroId).name} reached level ${newLevel}!`, 'good');
        }
      }
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
