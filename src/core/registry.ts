import type { BossDef, CreepDef, CutsceneDef, DraftDef, DungeonDef, GymDef, HeroDef, ItemDef, LegendDef, LoreEntryDef, NeutralItemDef, RaidDef, RecruitmentQuestDef, RegionDef, RoomTemplate, SeasonalEventDef, TrainerDef, TrialDef } from './types';

// ---------------------------------------------------------------
// Content registry. Data files register themselves; systems are
// generic interpreters. Adding hero #61 = one data file, zero code.
// The exotic registry is the logged escape hatch (budget ~25).
// ---------------------------------------------------------------

export type ExoticImpl = (ctx: unknown) => void;

class Registry {
  heroes = new Map<string, HeroDef>();
  items = new Map<string, ItemDef>();
  creeps = new Map<string, CreepDef>();
  regions = new Map<string, RegionDef>();
  gyms = new Map<string, GymDef>();
  trials = new Map<string, TrialDef>();
  quests = new Map<string, RecruitmentQuestDef>();
  bosses = new Map<string, BossDef>();
  raids = new Map<string, RaidDef>();
  loreEntries = new Map<string, LoreEntryDef>();
  cutscenes = new Map<string, CutsceneDef>();
  seasonalEvents = new Map<string, SeasonalEventDef>();
  legends = new Map<string, LegendDef>();
  dungeons = new Map<string, DungeonDef>();
  roomTemplates = new Map<string, RoomTemplate>();
  drafts = new Map<string, DraftDef>();
  neutralItems = new Map<string, NeutralItemDef>();
  trainers = new Map<string, TrainerDef>();
  exotics = new Map<string, ExoticImpl>();

  registerHero(def: HeroDef): void {
    this.heroes.set(def.id, def);
  }
  registerItem(def: ItemDef): void {
    this.items.set(def.id, def);
  }
  registerCreep(def: CreepDef): void {
    this.creeps.set(def.id, def);
  }
  registerRegion(def: RegionDef): void {
    this.regions.set(def.id, def);
  }
  registerGym(def: GymDef): void {
    this.gyms.set(def.id, def);
  }
  registerTrial(def: TrialDef): void {
    this.trials.set(def.id, def);
  }
  registerQuest(def: RecruitmentQuestDef): void {
    this.quests.set(def.id, def);
  }
  registerBoss(def: BossDef): void {
    this.bosses.set(def.id, def);
  }
  registerRaid(def: RaidDef): void {
    this.raids.set(def.id, def);
  }
  registerLoreEntry(def: LoreEntryDef): void {
    this.loreEntries.set(def.id, def);
  }
  registerCutscene(def: CutsceneDef): void {
    this.cutscenes.set(def.id, def);
  }
  registerSeasonalEvent(def: SeasonalEventDef): void {
    this.seasonalEvents.set(def.id, def);
  }
  registerLegend(def: LegendDef): void {
    this.legends.set(def.id, def);
  }
  registerDungeon(def: DungeonDef): void {
    this.dungeons.set(def.id, def);
  }
  registerRoomTemplate(def: RoomTemplate): void {
    this.roomTemplates.set(def.id, def);
  }
  registerDraft(def: DraftDef): void {
    this.drafts.set(def.id, def);
  }
  registerNeutralItem(def: NeutralItemDef): void {
    this.neutralItems.set(def.id, def);
  }
  registerTrainer(def: TrainerDef): void {
    this.trainers.set(def.id, def);
  }
  registerExotic(id: string, impl: ExoticImpl): void {
    this.exotics.set(id, impl);
  }

  hero(id: string): HeroDef {
    const d = this.heroes.get(id);
    if (!d) throw new Error(`unknown hero: ${id}`);
    return d;
  }
  item(id: string): ItemDef {
    const d = this.items.get(id);
    if (!d) throw new Error(`unknown item: ${id}`);
    return d;
  }
  creep(id: string): CreepDef {
    const d = this.creeps.get(id);
    if (!d) throw new Error(`unknown creep: ${id}`);
    return d;
  }
  region(id: string): RegionDef {
    const d = this.regions.get(id);
    if (!d) throw new Error(`unknown region: ${id}`);
    return d;
  }
  gym(id: string): GymDef {
    const d = this.gyms.get(id);
    if (!d) throw new Error(`unknown gym: ${id}`);
    return d;
  }
  trial(id: string): TrialDef {
    const d = this.trials.get(id);
    if (!d) throw new Error(`unknown trial: ${id}`);
    return d;
  }
  quest(id: string): RecruitmentQuestDef {
    const d = this.quests.get(id);
    if (!d) throw new Error(`unknown quest: ${id}`);
    return d;
  }
  boss(id: string): BossDef {
    const d = this.bosses.get(id);
    if (!d) throw new Error(`unknown boss: ${id}`);
    return d;
  }
  raid(id: string): RaidDef {
    const d = this.raids.get(id);
    if (!d) throw new Error(`unknown raid: ${id}`);
    return d;
  }
  loreEntry(id: string): LoreEntryDef {
    const d = this.loreEntries.get(id);
    if (!d) throw new Error(`unknown lore entry: ${id}`);
    return d;
  }
  cutscene(id: string): CutsceneDef {
    const d = this.cutscenes.get(id);
    if (!d) throw new Error(`unknown cutscene: ${id}`);
    return d;
  }
  seasonalEvent(id: string): SeasonalEventDef {
    const d = this.seasonalEvents.get(id);
    if (!d) throw new Error(`unknown seasonal event: ${id}`);
    return d;
  }
  legend(id: string): LegendDef {
    const d = this.legends.get(id);
    if (!d) throw new Error(`unknown legend: ${id}`);
    return d;
  }
  dungeon(id: string): DungeonDef {
    const d = this.dungeons.get(id);
    if (!d) throw new Error(`unknown dungeon: ${id}`);
    return d;
  }
  roomTemplate(id: string): RoomTemplate {
    const d = this.roomTemplates.get(id);
    if (!d) throw new Error(`unknown room template: ${id}`);
    return d;
  }
  draft(id: string): DraftDef {
    const d = this.drafts.get(id);
    if (!d) throw new Error(`unknown draft: ${id}`);
    return d;
  }
  neutralItem(id: string): NeutralItemDef {
    const d = this.neutralItems.get(id);
    if (!d) throw new Error(`unknown neutral item: ${id}`);
    return d;
  }
  trainer(id: string): TrainerDef {
    const d = this.trainers.get(id);
    if (!d) throw new Error(`unknown trainer: ${id}`);
    return d;
  }
  clear(): void {
    this.heroes.clear();
    this.items.clear();
    this.creeps.clear();
    this.regions.clear();
    this.gyms.clear();
    this.trials.clear();
    this.quests.clear();
    this.bosses.clear();
    this.raids.clear();
    this.loreEntries.clear();
    this.cutscenes.clear();
    this.seasonalEvents.clear();
    this.legends.clear();
    this.dungeons.clear();
    this.roomTemplates.clear();
    this.drafts.clear();
    this.neutralItems.clear();
    this.trainers.clear();
    this.exotics.clear();
  }
}

export const REG = new Registry();
