import { REG } from '../core/registry';
import { TUNING } from '../data/tuning';
import { QUALITY_GRADES, qualityColor, rarityColor } from '../data/quality';
import { affixDef } from '../data/affixes';
import { GRADE_DEFS } from '../data/grade';
import { gemDef } from '../data/gems';
import { itemSetDef } from '../data/sets';
import { xpProgress } from '../core/progression';
import { armorMultiplier } from '../core/stats';
import { STATUS_META, type StatusInstance } from '../core/status';
import { STATUS_ICON_PATHS, STATUS_ICON_VIEWBOX } from '../engine/status-glyphs.generated';
import { itemReady, sellValue, computeBuyPlan } from '../core/items';
import { buybackCost } from '../core/phase3';
import { defaultInterfaceSettings } from '../core/phase4';
import { abilityMaxLevel, abilityRankRequiredHeroLevel, levelArr } from '../core/values';
import { deriveMasteryTrees, masteryNodeIndex, masteryNodeUnlocked, masteryPointsForLevel } from '../core/mastery';
import { buildDefaultGambit } from '../core/controllers';
import { BOARD_COLS, BOARD_ROWS, DOCTRINES, defaultFormation, doctrineFormation, placementHint, reachProfile, type DoctrineId } from '../core/board';
import { describeRule, validateDraft } from '../core/draft';
import { statLabel, fmtStatValue, statLines, buildAbilityCard, buildItemCard, buildNeutralItemCard, buildHeroCard, type TooltipCard } from '../core/describe';
import { abilityIcon, itemIcon, neutralItemIcon, heroPortrait } from '../engine/icons';
import { WORLD_SCALE } from '../engine/scale';
import { Game } from '../systems/game';
import { ACTION_META, INPUT_ACTIONS, canRebindAction, glyphForAction, keyEventToBinding, rebindAction, resetKeyBindings } from '../systems/keybindings';
import type { InputController } from '../systems/input';
import type { Unit } from '../core/unit';
import type { DifficultyTier, DraftTeam, GambitAction, GambitCondition, GambitRule, GambitTargetMode, GraphicsSettings, HeroDef, InputAction, ItemDef, ItemRarity, ItemSave, MacroHeroSetup, SimEvent, StatModMap, StatusId, TalentDef, Vec2 } from '../core/types';
import * as THREE from 'three';

// ------------------------------------------------------------------
// HUD: DOM overlay. Reads game state every frame; all interactions
// call back into Game. No game logic lives here.
// ------------------------------------------------------------------

const GOLD_STREAK_WINDOW_MS = 1500;
const RARITY_ORDER: ItemRarity[] = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana'];
const STATUS_LABELS: Record<StatusId, string> = {
  stun: 'Stun',
  root: 'Root',
  silence: 'Silence',
  hex: 'Hex',
  slow: 'Slow',
  disarm: 'Disarm',
  blind: 'Blind',
  fear: 'Fear',
  taunt: 'Taunt',
  invis: 'Invisibility',
  'magic-immune': 'Spell Immune',
  break: 'Break',
  cyclone: 'Cyclone',
  sleep: 'Sleep',
  frozen: 'Frozen',
  buff: 'Buff'
};
const STATUS_GLYPHS: Record<StatusId, string> = {
  stun: 'ST',
  root: 'RT',
  silence: 'SI',
  hex: 'HX',
  slow: 'SL',
  disarm: 'DA',
  blind: 'BL',
  fear: 'FE',
  taunt: 'TA',
  invis: 'IN',
  'magic-immune': 'MI',
  break: 'BR',
  cyclone: 'CY',
  sleep: 'ZZ',
  frozen: 'FR',
  buff: 'UP'
};
const HARD_CC: StatusId[] = ['stun', 'hex', 'cyclone', 'sleep', 'frozen', 'fear', 'taunt'];
const STAT_WEIGHTS: Partial<Record<keyof StatModMap, number>> = {
  damage: 1.5,
  damagePct: 3,
  str: 1.2,
  agi: 1.2,
  int: 1.2,
  armor: 4,
  attackSpeed: 0.6,
  moveSpeed: 0.4,
  moveSpeedPct: 2,
  hpRegen: 2,
  manaRegen: 2,
  manaRegenPctMax: 8,
  maxHp: 0.03,
  maxMana: 0.02,
  magicResistPct: 2,
  spellAmpPct: 3,
  statusResistPct: 2,
  evasionPct: 3,
  lifestealPct: 3,
  attackRange: 0.05,
  hpRegenPctMax: 8,
  damageTakenReductionPct: -2,
  attackDamageTakenReductionPct: 2,
  castRange: 0.04,
  visionPct: 0.5,
  swapCdReductionPct: 2,
  swapInDamagePct: 2,
  swapInHealPct: 2,
  tagBoonAmpPct: 2,
  tagGaugeReductionPct: 2,
  tagChainWindowBonusSec: 8,
  reactionAmpPct: 2,
  elementalGaugeSec: 8,
  staminaBonus: 0.04
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function mergeMods(...parts: (StatModMap | undefined)[]): StatModMap {
  const out: StatModMap = {};
  for (const mods of parts) {
    for (const [key, value] of Object.entries(mods ?? {}) as [keyof StatModMap, number][]) {
      out[key] = Math.round(((out[key] ?? 0) + value) * 10) / 10;
    }
  }
  return out;
}

function itemMods(item: ItemSave, def: ItemDef): StatModMap {
  return mergeMods(def.passiveMods, item.resolvedMods);
}

function itemScore(item: ItemSave, def: ItemDef): number {
  return (Object.entries(itemMods(item, def)) as [keyof StatModMap, number][])
    .reduce((sum, [key, value]) => sum + value * (STAT_WEIGHTS[key] ?? 1), 0);
}

function compareItems(candidate: ItemSave, equipped: ItemSave | null): { verdict: string; cls: string; delta: number; lines: string[] } | null {
  if (!equipped) return null;
  const candDef = REG.item(candidate.id);
  const eqDef = REG.item(equipped.id);
  const candScore = itemScore(candidate, candDef);
  const eqScore = itemScore(equipped, eqDef);
  const delta = Math.round((candScore - eqScore) * 10) / 10;
  const threshold = Math.max(6, Math.abs(eqScore) * 0.08);
  const verdict = delta > threshold ? 'UPGRADE' : delta < -threshold ? 'DOWNGRADE' : 'SIDEGRADE';
  const cls = verdict === 'UPGRADE' ? 'good' : verdict === 'DOWNGRADE' ? 'bad' : 'side';
  const candMods = itemMods(candidate, candDef);
  const eqMods = itemMods(equipped, eqDef);
  const keys = [...new Set([...Object.keys(candMods), ...Object.keys(eqMods)])] as (keyof StatModMap)[];
  const lines = keys
    .map((key) => [key, Math.round(((candMods[key] ?? 0) - (eqMods[key] ?? 0)) * 10) / 10] as const)
    .filter(([, value]) => Math.abs(value) > 0.0001)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 4)
    .map(([key, value]) => `${fmtStatValue(key, value)} ${statLabel(key)}`);
  const candAffixes = new Set((candidate.affixes ?? []).map((affix) => affixDef(affix.affixId).name));
  const eqAffixes = new Set((equipped.affixes ?? []).map((affix) => affixDef(affix.affixId).name));
  const gained = [...candAffixes].filter((name) => !eqAffixes.has(name)).slice(0, 2);
  const lost = [...eqAffixes].filter((name) => !candAffixes.has(name)).slice(0, 2);
  lines.push(...gained.map((name) => `+ ${name}`), ...lost.map((name) => `- ${name}`));
  return { verdict, cls, delta, lines };
}

function comparableEquipped(candidate: ItemSave, heroItems: (ItemSave | null)[]): ItemSave | null {
  const candDef = REG.item(candidate.id);
  const candActive = !!candDef.active;
  const pool = heroItems
    .filter((item): item is ItemSave => !!item && !gemDef(item.id))
    .filter((item) => {
      const def = REG.item(item.id);
      return def.tier !== 'consumable' && def.tier !== 'special' && !!def.active === candActive;
    });
  if (pool.length === 0) return null;
  return pool.sort((a, b) => itemScore(a, REG.item(a.id)) - itemScore(b, REG.item(b.id)))[0];
}

function gradeLabel(item: { grade?: ItemSave['grade']; affixes?: ItemSave['affixes']; sockets?: ItemSave['sockets'] }): string {
  const grade = item.grade ?? 'standard';
  const def = GRADE_DEFS[grade];
  const pips = def.pips > 0 ? ` ${'•'.repeat(def.pips)}` : '';
  const affixes = (item.affixes ?? []).map((affix) => affixDef(affix.affixId).name).join(', ');
  const sockets = item.sockets && item.sockets.length > 0 ? ` · ${item.sockets.length} socket${item.sockets.length === 1 ? '' : 's'}` : '';
  return `${def.name}${pips}${affixes ? ` · ${affixes}` : ''}${sockets}`;
}

function setProgressLines(item: ItemSave, equipped: (ItemSave | null)[] = []): string[] {
  const def = REG.item(item.id);
  if (!def.set) return [];
  const set = itemSetDef(def.set);
  if (!set) return [];
  const equippedIds = new Set(equipped.filter((it): it is ItemSave => !!it).map((it) => it.id));
  equippedIds.add(item.id);
  const pieces = set.pieces.filter((id) => equippedIds.has(id)).length;
  const pieceNames = set.pieces.map((id) => `${equippedIds.has(id) ? '+' : '-'} ${REG.item(id).name}`).join(' · ');
  const bonuses = set.bonuses
    .map((bonus) => {
      const parts = [
        ...(bonus.mods ? statLines(bonus.mods, 5) : []),
        ...(bonus.aura ? ['aura'] : []),
        ...(bonus.trigger ? ['on-combat effect'] : [])
      ];
      return `${bonus.atPieces}p ${pieces >= bonus.atPieces ? 'active' : 'locked'}: ${parts.join(', ') || 'special bonus'}`;
    });
  return [`Set: ${set.name} ${pieces}/${set.pieces.length}`, ...bonuses, `Pieces: ${pieceNames}`];
}

/** Instance-specific lines (grade, affixes, sockets, set progress) shown beneath the base stats. */
function itemDetailLines(item: ItemSave, equipped: (ItemSave | null)[] = []): string[] {
  return [
    gradeLabel(item),
    ...(item.affixes ?? []).map((affix) => {
      const defn = affixDef(affix.affixId);
      const mods = statLines(affix.resolved, 4).join(', ');
      return `${defn.kind === 'signature' ? 'Signature: ' : ''}${defn.name}${mods ? ` (${mods})` : ''}${item.imprintedAffixId === affix.affixId ? ' [imprinted]' : ''}`;
    }),
    ...(item.sockets ?? []).map((socket, i) => {
      const gem = socket ? gemDef(socket) : null;
      return `Socket ${i + 1}: ${gem ? gem.name : 'empty'}`;
    }),
    ...setProgressLines(item, equipped)
  ].filter(Boolean);
}

function itemTooltip(def: ItemDef, item: ItemSave, equipped: (ItemSave | null)[] = []): string {
  const lines = [
    def.name,
    ...statLines(itemMods(item, def), 10),
    ...itemDetailLines(item, equipped),
    def.lore
  ].filter(Boolean);
  return lines.join('\n');
}

function liveRegen(stats: { maxHp: number; maxMana: number; hpRegen: number; manaRegen: number; hpRegenPctMax: number; manaRegenPctMax: number }): { hp: number; mana: number } {
  return {
    hp: stats.hpRegen + (stats.maxHp * stats.hpRegenPctMax) / 100,
    mana: stats.manaRegen + (stats.maxMana * stats.manaRegenPctMax) / 100
  };
}

function fmtRegen(value: number): string {
  return value.toFixed(Math.abs(value) >= 10 ? 0 : 1);
}

function talentAbilityLines(talent: TalentDef, def: HeroDef): string[] {
  const lines: string[] = [];
  if (talent.abilityOverride) {
    const patch = talent.abilityOverride;
    const ability = def.abilities.find((a) => a.id === patch.abilityId);
    const label = patch.valueKey.replace(/([A-Z])/g, ' $1').toLowerCase();
    const value = patch.mode === 'add'
      ? `${patch.amount >= 0 ? '+' : ''}${patch.amount}`
      : patch.mode === 'mul'
        ? `x${patch.amount}`
        : `${patch.amount}`;
    lines.push(`${ability?.name ?? patch.abilityId}: ${label} ${value}`);
  }
  if (talent.cooldownAdd) {
    const patch = talent.cooldownAdd;
    const ability = def.abilities.find((a) => a.id === patch.abilityId);
    lines.push(`${ability?.name ?? patch.abilityId}: cooldown ${patch.amount >= 0 ? '+' : ''}${patch.amount}s`);
  }
  return lines;
}

function talentDetailLines(talent: TalentDef, def: HeroDef): string[] {
  return [
    ...(talent.mods ? statLines(talent.mods, 4) : []),
    ...talentAbilityLines(talent, def)
  ];
}

interface Floater {
  el: HTMLElement;
  simX: number;
  simY: number;
  born: number;
  life: number;
  scale: number;
  driftX: number;
}

interface CoinFx {
  el: HTMLElement;
  born: number;
  dur: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  arc: number;
}

interface StatusView {
  instance: StatusInstance;
  label: string;
  glyph: string;
  icon: string;
  cls: 'buff' | 'debuff' | 'aura';
  urgent: boolean;
  remaining: number;
  ringDeg: number;
  source: string;
}

type QuestBoardEntry = ReturnType<Game['questBoard']>[number];

interface KillfeedEntry {
  text: string;
  kind: 'hero' | 'boss' | 'elite';
  at: number;
}

export class Hud {
  root: HTMLElement;
  private topBar: HTMLElement;
  private partyCol: HTMLElement;
  private heroPanel: HTMLElement;
  private questTracker: HTMLElement;
  private toastCol: HTMLElement;
  private killfeedLane: HTMLElement;
  private captureBar: HTMLElement;
  private floaterLayer: HTMLElement;
  private statusLayer: HTMLElement;
  private minimap: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;
  private minimapLegend!: HTMLElement;
  private modal: HTMLElement;
  private hint: HTMLElement;
  private trialChoice: HTMLElement;
  private lastTrialChoiceKey = '';
  private liveGymBar: HTMLElement;
  private combatReadout: HTMLElement;
  private counterReveal!: HTMLElement;
  private counterRevealKey = '';
  private counterRevealHideAt = 0;
  private cinematicLayer: HTMLElement;
  private hoverCard!: HTMLElement;
  private tips = new Map<string, string>();
  private hoverKey: string | null = null;
  private hoverKind: 'ui' | 'world' | null = null;
  private lastLiveGymKey = '';
  private lastCombatReadoutKey = '';
  private draggingItemSlot: number | null = null;
  private readonly onItemDragOver = (e: DragEvent): void => {
    if (this.draggingItemSlot === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  };
  private readonly onItemDrop = (e: DragEvent): void => {
    if (this.draggingItemSlot === null) return;
    e.preventDefault();
    this.finishItemDrag(e.clientX, e.clientY);
  };
  private readonly onItemDragEnd = (e: DragEvent): void => {
    if (this.draggingItemSlot === null) return;
    this.finishItemDrag(e.clientX, e.clientY);
  };

  // gambit editor working state (§3.5)
  private gambitDraft: GambitRule[] = [];
  private gambitEditRec = -1;
  private gambitEditDraftHeroId: string | null = null;
  private gambitReturnTo: 'party' | 'prefight' | 'draft' | 'none' = 'none';
  private prefightGymId: string | null = null;
  // draft + board editor (AUTOBATTLER_OVERHAUL §3/§7)
  private draftGymId: string | null = null;
  private draftEdit: DraftTeam | null = null;
  private draftPick: string | null = null; // heroId currently held for placement
  private draftDragId: string | null = null; // heroId being dragged (drag-and-drop, §7)
  private draftHoverId: string | null = null; // heroId under the cursor for the reach readout
  private dungeonEntryId: string | null = null;

  private floaters: Floater[] = [];
  private contactFloaterAt = new Map<string, number>();
  private coinFx: CoinFx[] = [];
  private shownToasts = 0;
  private modalKind: 'none' | 'party' | 'shop' | 'menu' | 'talents' | 'journal' | 'codex' | 'character' | 'help' | 'gambit' | 'prefight' | 'draft' | 'elite-draft' | 'dungeon-entry' | 'services' = 'none';
  /** When the Journal is opened by talking to a giver, spotlight its board. */
  private questGiverFocus: string | null = null;
  private captureUntil = 0;
  private captureDur = 1;
  private vec = new THREE.Vector3();
  private displayGold = 0;
  private goldTweenFrom = 0;
  private goldTweenTo = 0;
  private goldTweenStart = 0;
  private goldTweenEnd = 0;
  private goldPopUntil = 0;
  private goldStreak = 0;
  private goldStreakUntil = 0;
  private lastGoldEventAt = 0;
  private pinnedQuestIds = new Set<string>();
  private lastQuestTrackerKey = '';
  private questTrackerFlashUntil = 0;
  private killfeed: KillfeedEntry[] = [];
  private abilityCooldowns = new Map<string, number>();
  private abilityReadyUntil = new Map<string, number>();
  private lastUiHoverEl: Element | null = null;
  private heartbeatNextAt = 0;
  private minimapPings: { x: number; y: number; at: number }[] = [];
  private minimapHidden = new Set<string>();
  private lastMinimapLegendKey = '';

  constructor(
    private game: Game,
    private input: InputController,
    private onQuitToTitle: () => void
  ) {
    this.root = document.getElementById('ui-root')!;
    this.root.innerHTML = `
      <div id="top-bar"></div>
      <div id="party-col"></div>
      <div id="quest-tracker"></div>
      <canvas id="minimap" width="160" height="160"></canvas>
      <div id="minimap-legend" class="hidden"></div>
      <div id="toast-col"></div>
      <div id="killfeed-lane"></div>
      <div id="floater-layer"></div>
      <div id="status-layer"></div>
      <div id="capture-bar" class="hidden"><div class="fill"></div><span>Binding...</span></div>
      <div id="hero-panel"></div>
      <div id="hud-hint"></div>
      <div id="trial-choice" class="hidden"></div>
      <div id="combat-readout" class="hidden"></div>
      <div id="counter-reveal" class="hidden"></div>
      <div id="live-gym-bar" class="hidden"></div>
      <div id="cinematic-layer" class="hidden"></div>
      <div id="modal-root" class="hidden"></div>
      <div id="hover-card" class="hidden"></div>
    `;
    this.topBar = this.root.querySelector('#top-bar')!;
    this.partyCol = this.root.querySelector('#party-col')!;
    this.heroPanel = this.root.querySelector('#hero-panel')!;
    this.questTracker = this.root.querySelector('#quest-tracker')!;
    this.toastCol = this.root.querySelector('#toast-col')!;
    this.killfeedLane = this.root.querySelector('#killfeed-lane')!;
    this.captureBar = this.root.querySelector('#capture-bar')!;
    this.floaterLayer = this.root.querySelector('#floater-layer')!;
    this.statusLayer = this.root.querySelector('#status-layer')!;
    this.minimap = this.root.querySelector('#minimap')!;
    this.minimapCtx = this.minimap.getContext('2d')!;
    this.minimapLegend = this.root.querySelector('#minimap-legend')!;
    this.modal = this.root.querySelector('#modal-root')!;
    this.hint = this.root.querySelector('#hud-hint')!;
    this.trialChoice = this.root.querySelector('#trial-choice')!;
    this.trialChoice.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-choice]') as HTMLElement | null;
      if (btn?.dataset.choice) this.game.resolveTrialChoice(btn.dataset.choice);
    });
    this.liveGymBar = this.root.querySelector('#live-gym-bar')!;
    this.combatReadout = this.root.querySelector('#combat-readout')!;
    this.counterReveal = this.root.querySelector('#counter-reveal')!;
    this.cinematicLayer = this.root.querySelector('#cinematic-layer')!;
    this.liveGymBar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-livegym]') as HTMLElement | null;
      if (btn?.dataset.livegym === 'call') this.game.liveGymPlayerCall();
    });
    this.cinematicLayer.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-cinematic]') as HTMLElement | null;
      if (btn?.dataset.cinematic === 'next') this.game.cinematicAdvance();
      if (btn) return;
      this.game.cinematicAdvance();
    });
    this.cinematicLayer.addEventListener('mousedown', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-cinematic]') as HTMLElement | null;
      if (btn?.dataset.cinematic === 'ff') this.game.cinematicFastForward(true);
      if (btn?.dataset.cinematic === 'skip') this.game.cinematicRequestSkip();
    });
    this.cinematicLayer.addEventListener('mouseup', () => {
      this.game.cinematicFastForward(false);
      this.game.cinematicReleaseSkip();
    });
    this.cinematicLayer.addEventListener('mouseleave', () => {
      this.game.cinematicFastForward(false);
      this.game.cinematicReleaseSkip();
    });
    this.game.onOpenGymPrefight = (gymId) => this.openGymPrefight(gymId);
    this.game.onOpenDungeonEntry = (dungeonId) => this.openDungeonEntry(dungeonId);
    this.game.onOpenQuestGiver = (giverId) => this.openQuestGiver(giverId);
    this.displayGold = this.game.gold;
    this.goldTweenFrom = this.game.gold;
    this.goldTweenTo = this.game.gold;

    input.onToggleParty = () => this.toggleModal('party');
    input.onToggleShop = () => {
      if (!this.game.canShop() && this.modalKind !== 'shop') {
        this.game.msg(`The shop is in ${this.game.region.town.name} (the town)`, 'bad');
        return;
      }
      this.toggleModal('shop');
    };
    input.onToggleMenu = () => this.toggleModal('menu');
    input.onToggleJournal = () => this.toggleModal('journal');
    input.onToggleCodex = () => this.toggleModal('codex');
    input.onToggleCharacter = () => this.toggleModal('character');
    input.onToggleHelp = () => this.toggleModal('help');
    input.onToggleServices = () => this.toggleModal('services');
    window.addEventListener('dragover', this.onItemDragOver);
    window.addEventListener('drop', this.onItemDrop);
    window.addEventListener('dragend', this.onItemDragEnd);
    this.topBar.addEventListener('click', (e) => {
      const open = (e.target as HTMLElement).closest('[data-open]') as HTMLElement | null;
      const kind = open?.dataset.open as 'journal' | 'codex' | 'help' | undefined;
      if (kind) this.toggleModal(kind);
    });
    this.hoverCard = this.root.querySelector('#hover-card')!;
    this.setupHoverCard();
    this.setupUiAudio();
    this.setupMinimapInput();
  }

  // ---------- UI audio (§11) ----------

  /** Interface cues: a hover tick on entering interactive elements and a click
   *  on actionable presses. Open/close whooshes are owned by the modal methods,
   *  and the error buzz lives in Game.msg('…','bad'). The synth path is the
   *  guaranteed floor; muting/volume is handled inside the audio bus. */
  private playUi(kind: 'hover' | 'click' | 'open' | 'close' | 'error' | 'ready' | 'heartbeat' | 'tab'): void {
    this.game.audio.playUi?.(kind);
  }

  private static readonly UI_HOVER_SELECTOR =
    'button, .top-btn, .help-btn, .ab-slot:not(.empty), .item-slot:not(.empty), .party-frame, ' +
    '[data-open], [data-pin], [data-rebind], [data-choice], [data-livegym], [data-replay], [data-track], ' +
    '.modal-tab, .close-x, .quest-track-row, select, input[type="checkbox"], input[type="range"]';

  private static readonly UI_CLICK_SELECTOR =
    'button, .top-btn, .help-btn, [data-open], [data-pin], [data-rebind], [data-choice], [data-livegym], ' +
    '[data-replay], [data-track], .modal-tab, .close-x, .quest-track-row, select, input[type="checkbox"]';

  private setupUiAudio(): void {
    this.root.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.(Hud.UI_HOVER_SELECTOR) ?? null;
      if (el && el !== this.lastUiHoverEl && !(el as HTMLButtonElement).disabled) {
        this.lastUiHoverEl = el;
        this.playUi('hover');
      } else if (!el) {
        this.lastUiHoverEl = null;
      }
    });
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.(Hud.UI_CLICK_SELECTOR) as HTMLButtonElement | null;
      if (el && !el.disabled) this.playUi('click');
    }, true);
  }

  // ---------- minimap interaction (§8) ----------

  /** Project a pointer event over the minimap to a sim-world point. The canvas
   *  paints at `region.size` mapped to its backing width, so the world point is
   *  just the click fraction times the region size — independent of CSS scale. */
  private minimapPointToWorld(e: MouseEvent): Vec2 | null {
    const rect = this.minimap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const size = this.game.region.size;
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(size, fx * size)),
      y: Math.max(0, Math.min(size, fy * size))
    };
  }

  private setupMinimapInput(): void {
    this.minimap.addEventListener('contextmenu', (e) => e.preventDefault());
    this.minimap.addEventListener('pointerdown', (e) => {
      if (this.game.cinematic.active || this.input.uiModalOpen || this.modalKind !== 'none') return;
      if (this.game.settings.minimap === false) return;
      const point = this.minimapPointToWorld(e);
      if (!point) return;
      e.preventDefault();
      e.stopPropagation();
      // Alt-click pings; middle-click or Ctrl looks; left/right click moves (§8).
      if (e.altKey) {
        this.game.scene.showPing?.(point);
        this.addMinimapPing(point);
        this.playUi('tab');
        return;
      }
      if (e.button === 1 || e.ctrlKey || e.metaKey) {
        this.game.scene.lookAt?.(point);
        this.playUi('tab');
        return;
      }
      this.game.orderMove(point);
    });
  }

  private addMinimapPing(point: Vec2): void {
    this.minimapPings.push({ x: point.x, y: point.y, at: performance.now() });
    if (this.minimapPings.length > 6) this.minimapPings.shift();
  }

  // ---------- hover card (rich tooltips) ----------

  private setupHoverCard(): void {
    document.addEventListener('mousemove', (e) => {
      const target = e.target as HTMLElement | null;
      const tipEl = target?.closest?.('[data-tip]') as HTMLElement | null;
      const key = tipEl?.dataset.tip ?? null;
      if (key && this.tips.has(key)) {
        if (key !== this.hoverKey || this.hoverKind !== 'ui') {
          this.hoverKey = key;
          this.hoverKind = 'ui';
          this.hoverCard.innerHTML = this.tips.get(key)!;
          this.hoverCard.classList.remove('hidden');
        }
        this.positionHoverCard(e.clientX, e.clientY);
      } else if (this.hoverKind === 'ui') {
        this.hideHoverCard();
      }
    });
  }

  private hideHoverCard(): void {
    if (this.hoverKey === null && this.hoverKind === null) return;
    this.hoverKey = null;
    this.hoverKind = null;
    this.hoverCard.classList.add('hidden');
  }

  private positionHoverCard(x: number, y: number): void {
    const margin = 16;
    const w = this.hoverCard.offsetWidth || 300;
    const h = this.hoverCard.offsetHeight || 180;
    let left = x + margin;
    let top = y + margin;
    if (left + w > window.innerWidth - 8) left = x - w - margin;
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
    this.hoverCard.style.left = `${Math.max(8, left)}px`;
    this.hoverCard.style.top = `${Math.max(8, top)}px`;
  }

  /** Register a tooltip card under a key and return the attribute to drop on the trigger element. */
  private registerTip(key: string, card: TooltipCard, opts: { accent?: string; extra?: string[] } = {}): string {
    this.tips.set(key, this.cardHtml(card, opts));
    return ` data-tip="${key}"`;
  }

  private cardHtml(card: TooltipCard, opts: { accent?: string; extra?: string[] } = {}): string {
    const accent = opts.accent ?? 'var(--brass)';
    const head = `<div class="tip-head" style="border-bottom-color:${accent}"><span class="tip-name" style="color:${accent}">${esc(card.name)}</span><span class="tip-kind">${esc(card.kind)}</span></div>`;
    const blurb = card.blurb ? `<div class="tip-blurb">${esc(card.blurb)}</div>` : '';
    const effect = card.effect.length > 0 ? `<div class="tip-effect">${card.effect.map((e) => `<p>${esc(e)}</p>`).join('')}</div>` : '';
    const allStats = [...card.stats, ...(opts.extra ?? [])].filter(Boolean);
    const stats = allStats.length > 0 ? `<div class="tip-stats">${allStats.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : '';
    const meta = card.meta.length > 0 ? `<div class="tip-meta">${card.meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>` : '';
    return `${head}${blurb}${effect}${stats}${meta}`;
  }

  private renderWorldHoverCard(): void {
    if (this.hoverKind === 'ui') return;
    if (this.modalKind !== 'none' || this.input.uiModalOpen || this.game.cinematic.active) {
      if (this.hoverKind === 'world') this.hideHoverCard();
      return;
    }

    if (this.input.hoverItemUid >= 0) {
      const drop = this.game.groundItemDrops.find((item) => item.uid === this.input.hoverItemUid);
      if (!drop) {
        if (this.hoverKind === 'world') this.hideHoverCard();
        return;
      }
      const def = REG.item(drop.item.id);
      const key = `world-item-${drop.uid}`;
      if (this.hoverKey !== key || this.hoverKind !== 'world') {
        this.hoverKey = key;
        this.hoverKind = 'world';
        this.hoverCard.innerHTML = this.cardHtml(buildItemCard(def, { mods: itemMods(drop.item, def) }), {
          accent: rarityColor(def.rarity),
          extra: [...itemDetailLines(drop.item, []), 'Click to pick up']
        });
        this.hoverCard.classList.remove('hidden');
      }
      this.positionHoverCard(this.input.mouseX, this.input.mouseY);
      return;
    }

    if (this.input.hoverUid >= 0) {
      const u = this.game.inputSim().unit(this.input.hoverUid);
      if (!u || !u.alive) {
        if (this.hoverKind === 'world') this.hideHoverCard();
        return;
      }
      const key = this.worldUnitHoverKey(u);
      if (this.hoverKey !== key || this.hoverKind !== 'world') {
        this.hoverKey = key;
        this.hoverKind = 'world';
        this.hoverCard.innerHTML = this.cardHtml(this.worldUnitCard(u), { accent: this.worldUnitAccent(u) });
        this.hoverCard.classList.remove('hidden');
      }
      this.positionHoverCard(this.input.mouseX, this.input.mouseY);
      return;
    }

    if (this.hoverKind === 'world') this.hideHoverCard();
  }

  private worldUnitHoverKey(u: Unit): string {
    const s = u.summary;
    return [
      'world-unit',
      u.uid,
      u.level,
      Math.ceil(u.hp),
      Math.ceil(u.mana),
      Math.ceil(u.stats.maxHp),
      Math.ceil(u.stats.maxMana),
      u.team,
      u.kind,
      u.star,
      u.elite ? 1 : 0,
      u.capturable ? 1 : 0,
      this.input.targeting.kind,
      this.input.attackMoveArmed() ? 1 : 0,
      s.stunned ? 1 : 0,
      s.rooted ? 1 : 0,
      s.silenced ? 1 : 0,
      s.disarmed ? 1 : 0,
      s.hexed ? 1 : 0,
      s.magicImmune ? 1 : 0,
      s.invisible ? 1 : 0,
      s.invulnerable ? 1 : 0,
      u.statuses.map((st) => `${st.status}:${Math.ceil(st.until)}`).join(',')
    ].join(':');
  }

  private worldUnitCard(u: Unit): TooltipCard {
    const mana = u.stats.maxMana > 0 ? `${Math.ceil(u.mana)}/${Math.ceil(u.stats.maxMana)}` : null;
    const stats = [
      `HP ${Math.ceil(u.hp)}/${Math.ceil(u.stats.maxHp)}`,
      mana ? `MP ${mana}` : '',
      `DMG ${Math.round(u.stats.damage)}`,
      `ARM ${u.stats.armor.toFixed(1)}`,
      `MS ${Math.round(u.stats.moveSpeed)}`
    ].filter(Boolean);
    const meta = [
      this.worldUnitType(u),
      this.worldTeamLabel(u),
      `Lv ${u.level}`,
      u.star > 1 ? `${u.star} star` : '',
      u.elite ? 'Elite' : '',
      ...this.worldStatusLabels(u)
    ].filter(Boolean);
    return {
      name: u.name,
      kind: `Lv ${u.level} ${this.worldTeamLabel(u)}`,
      blurb: this.worldUnitBlurb(u),
      effect: this.worldUnitActions(u),
      stats,
      meta
    };
  }

  private worldUnitType(u: Unit): string {
    if (this.game.npcAt(u.uid)) return 'Recruit';
    if (u.kind === 'hero' && u.heroId) return REG.hero(u.heroId).attribute.toUpperCase();
    if (u.kind === 'creep' && u.tier) return `${u.tier} creep`;
    return u.kind;
  }

  private worldTeamLabel(u: Unit): string {
    if (u.kind === 'npc') return 'NPC';
    if (u.team === 0) return 'Ally';
    if (u.team === 2) return 'Neutral';
    return 'Enemy';
  }

  private worldUnitBlurb(u: Unit): string {
    if (u.kind === 'hero' && u.heroId) return REG.hero(u.heroId).title;
    if (this.game.npcAt(u.uid)) return 'Available for recruitment.';
    if (u.capturable) return 'Wild creature.';
    if (u.ownerUid !== undefined) return 'Summoned unit.';
    return '';
  }

  private worldUnitActions(u: Unit): string[] {
    const g = this.game;
    if (this.input.targeting.kind !== 'none') return ['Left-click to target this unit.'];
    if (this.input.attackMoveArmed()) return [u.team === 0 ? 'Left-click to inspect this ally.' : 'Left-click to attack this unit.'];
    if (g.npcAt(u.uid)) return ['Right-click to recruit.', 'Left-click to inspect.'];
    if (!g.liveGym && !g.liveRaid && !g.liveDungeon && u.capturable && u.tier) {
      const elig = g.captureEligible(u);
      return [elig.ok ? 'Press T to capture.' : `Capture: ${elig.reason ?? 'not eligible'}.`, 'Right-click to attack.'];
    }
    if (u.team === 0 && g.liveGym) return ['Click to select for Captain\'s Call.'];
    if (u.team !== 0 && g.controlledUnit()) return ['Right-click to attack.', 'Left-click to inspect.'];
    return ['Left-click to inspect.'];
  }

  private worldStatusLabels(u: Unit): string[] {
    return this.statusViews(u, 6).map((s) => s.label);
  }

  private worldUnitAccent(u: Unit): string {
    if (u.team === 0) return 'var(--good)';
    if (u.team === 2) return 'var(--brass-lite)';
    return 'var(--bad)';
  }

  private statusViews(u: Unit, limit = 6): StatusView[] {
    const inputSim = this.game.inputSim();
    const now = inputSim.unit(u.uid) === u ? inputSim.time : this.game.sim.time;
    return u.statuses
      .filter((st) => Number.isFinite(st.until) ? st.until > now : true)
      .map((st) => {
        const meta = STATUS_META[st.status];
        const isDebuff = st.isDebuff || meta.debuff;
        const remaining = Number.isFinite(st.until) ? Math.max(0, st.until - now) : Infinity;
        const ringDeg = Number.isFinite(remaining) ? Math.max(12, Math.min(360, (remaining / 8) * 360)) : 360;
        const cls: StatusView['cls'] = Number.isFinite(st.until) ? (isDebuff ? 'debuff' : 'buff') : 'aura';
        return {
          instance: st,
          label: this.statusLabel(st),
          glyph: this.statusGlyph(st),
          icon: STATUS_ICON_PATHS[this.statusIconToken(st)] ?? '',
          cls,
          urgent: isDebuff && HARD_CC.includes(st.status),
          remaining,
          ringDeg,
          source: this.statusSource(st)
        };
      })
      .sort((a, b) =>
        Number(b.urgent) - Number(a.urgent) ||
        Number(b.cls === 'debuff') - Number(a.cls === 'debuff') ||
        a.remaining - b.remaining ||
        a.label.localeCompare(b.label)
      )
      .slice(0, limit);
  }

  private statusLabel(st: StatusInstance): string {
    if (st.status !== 'buff') return STATUS_LABELS[st.status];
    if (st.dotDps) return st.isDebuff ? 'Damage Over Time' : 'Burning Aura';
    const mods = st.mods ?? {};
    if ((mods.damageTakenReductionPct ?? 0) > 0 || (mods.attackDamageTakenReductionPct ?? 0) > 0 || (mods.maxHp ?? 0) > 0) return 'Shield';
    if ((mods.hpRegen ?? 0) > 0 || (mods.hpRegenPctMax ?? 0) > 0 || (mods.manaRegen ?? 0) > 0) return 'Regen';
    if ((mods.damage ?? 0) > 0 || (mods.damagePct ?? 0) > 0 || (mods.attackSpeed ?? 0) > 0 || (mods.spellAmpPct ?? 0) > 0) return 'Power';
    if ((mods.moveSpeed ?? 0) > 0 || (mods.moveSpeedPct ?? 0) > 0) return 'Haste';
    return st.isDebuff ? 'Debuff' : 'Buff';
  }

  private statusGlyph(st: StatusInstance): string {
    const label = this.statusLabel(st);
    if (st.status !== 'buff') return STATUS_GLYPHS[st.status];
    return label.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || STATUS_GLYPHS.buff;
  }

  /** Resolve a status to its curated-icon token (§4/§13). Non-buff carriers map
   *  by StatusId; buff carriers map by the derived sub-kind the label names. */
  private statusIconToken(st: StatusInstance): string {
    if (st.status !== 'buff') return st.status;
    switch (this.statusLabel(st)) {
      case 'Damage Over Time': return 'dot';
      case 'Burning Aura': return 'aura';
      case 'Shield': return 'shield';
      case 'Regen': return 'regen';
      case 'Power': return 'power';
      case 'Haste': return 'haste';
      case 'Debuff': return 'debuff';
      default: return 'buff';
    }
  }

  private statusSource(st: StatusInstance): string {
    return this.game.inputSim().unit(st.sourceUid)?.name ?? `Unit ${st.sourceUid}`;
  }

  private statusTooltip(view: StatusView): TooltipCard {
    const st = view.instance;
    const mods = st.mods ? statLines(st.mods as StatModMap, 8) : [];
    const effect = [
      st.dotDps ? `${Math.round(st.dotDps)} ${st.dotType ?? 'magical'} damage per second.` : '',
      st.moveSlowPct ? `${Math.round(st.moveSlowPct)}% move slow.` : '',
      st.attackSlowPct ? `${Math.round(st.attackSlowPct)} attack speed slow.` : '',
      st.breakOnDamage ? 'Breaks when the unit takes damage.' : '',
      st.periodic ? `Pulses every ${st.periodic.interval}s.` : ''
    ].filter(Boolean);
    const remaining = Number.isFinite(view.remaining) ? `${view.remaining.toFixed(view.remaining > 5 ? 0 : 1)}s remaining` : 'Persistent aura/toggle';
    return {
      name: view.label,
      kind: view.cls === 'debuff' ? 'Debuff' : view.cls === 'aura' ? 'Aura' : 'Buff',
      effect: effect.length > 0 ? effect : ['Active modifier affecting this unit.'],
      stats: mods,
      meta: [remaining, `Source: ${view.source}`, STATUS_META[st.status].purgeable ? 'Purgeable' : 'Unpurgeable']
    };
  }

  private statusPipsHtml(u: Unit, scope: 'hero' | 'party' | 'world' | 'sheet', limit = 6): string {
    const views = this.statusViews(u, limit);
    if (views.length === 0) return scope === 'hero' ? '<div class="status-strip hero empty"><span>No active effects</span></div>' : '';
    const pips = views.map((view, i) => {
      const tip = this.registerTip(`status-${scope}-${u.uid}-${i}`, this.statusTooltip(view), {
        accent: view.cls === 'debuff' ? 'var(--bad)' : view.cls === 'aura' ? 'var(--brass-lite)' : 'var(--good)'
      });
      const time = Number.isFinite(view.remaining) ? `<em>${Math.ceil(view.remaining)}</em>` : '';
      const mark = view.icon
        ? `<svg class="status-ico" viewBox="0 0 ${STATUS_ICON_VIEWBOX} ${STATUS_ICON_VIEWBOX}" aria-hidden="true"><path d="${view.icon}"/></svg>`
        : `<b>${esc(view.glyph)}</b>`;
      return `<span class="status-pip ${view.cls} ${view.urgent ? 'urgent' : ''}" style="--status-deg:${view.ringDeg.toFixed(0)}deg"${tip}>${mark}${time}</span>`;
    }).join('');
    return `<div class="status-strip ${scope}">${pips}</div>`;
  }

  private renderWorldStatusPips(): void {
    const g = this.game;
    if (this.modalKind !== 'none' || g.cinematic.active) {
      this.statusLayer.innerHTML = '';
      return;
    }
    const sim = g.inputSim();
    const selected = g.scene.selectedUid;
    const hover = this.input.hoverUid;
    const active = g.activeUnit()?.uid ?? -1;
    const html = sim.unitsArr
      .filter((u) => u.alive && u.statuses.length > 0)
      .filter((u) => {
        const s = u.summary;
        const critical = s.stunned || s.hexed || s.frozen || s.sleeping || s.cycloned || s.silenced || s.rooted;
        return u.uid === selected || u.uid === hover || u.uid === active || critical;
      })
      .map((u) => {
        const screen = this.screenFromWorld(u.pos.x, u.pos.y, 2.9);
        if (!screen) return '';
        return `<div class="world-status" style="transform:translate(${screen.x.toFixed(0)}px, ${screen.y.toFixed(0)}px) translate(-50%, -100%)">${this.statusPipsHtml(u, 'world', 3)}</div>`;
      })
      .join('');
    if (this.statusLayer.innerHTML !== html) this.statusLayer.innerHTML = html;
  }

  // ---------- per frame ----------

  update(): void {
    this.applyInterfaceSettings();
    this.updateGoldTween();
    this.renderTopBar();
    this.renderParty();
    this.renderHeroPanel();
    this.renderMinimap();
    this.renderQuestTracker();
    this.renderToasts();
    this.renderKillfeed();
    this.handleEvents(this.game.frameEvents);
    this.updateFloaters();
    this.renderWorldStatusPips();
    this.updateCoinFx();
    this.updateCaptureBar();
    this.renderHint();
    this.renderWorldHoverCard();
    this.renderTrialChoice();
    this.renderLiveGym();
    this.renderCombatReadout();
    this.renderCounterReveal();
    this.renderCinematic();
    this.updateLowHpHeartbeat();
    if (this.modalKind === 'shop' || this.modalKind === 'party') this.refreshModalDynamic();
  }

  /** Low-HP heartbeat (§11): a slow pulse that fades in under ~25% HP and
   *  quickens as it drops. The audio cue itself is gentle; photosensitivity/
   *  reduced-motion only governs the matching screen vignette, so the cue stays
   *  but its intensity is capped. Silent in menus, cinematics, and on death. */
  private updateLowHpHeartbeat(): void {
    const g = this.game;
    const u = g.controlledUnit() ?? g.activeUnit();
    const paused = g.paused || g.cinematic.active || this.modalKind === 'menu';
    if (!u || !u.alive || paused || u.stats.maxHp <= 0) {
      this.heartbeatNextAt = 0;
      this.root.classList.remove('low-hp');
      return;
    }
    const frac = u.hp / u.stats.maxHp;
    if (frac >= 0.25) {
      this.heartbeatNextAt = 0;
      this.root.classList.remove('low-hp');
      return;
    }
    // 25% HP → ~1.05s between beats; 5% HP → ~0.5s. The danger vignette respects
    // the photosensitivity/reduced-motion floor by simply not pulsing.
    const danger = Math.max(0, Math.min(1, (0.25 - frac) / 0.2));
    const interval = 1050 - danger * 550;
    const now = performance.now();
    if (this.heartbeatNextAt === 0) this.heartbeatNextAt = now + interval;
    if (now >= this.heartbeatNextAt) {
      this.heartbeatNextAt = now + interval;
      this.playUi('heartbeat');
      if (!this.reducedMotion()) {
        this.root.classList.add('low-hp');
        window.setTimeout(() => this.root.classList.remove('low-hp'), 220);
      }
    }
  }

  private interfaceSettings(): ReturnType<typeof defaultInterfaceSettings> {
    const ui = { ...defaultInterfaceSettings(), ...this.game.settings.interface };
    this.game.settings.interface = ui;
    return ui;
  }

  private applyInterfaceSettings(): void {
    const ui = this.interfaceSettings();
    this.root.style.setProperty('zoom', String(ui.uiScale));
    this.root.style.setProperty('--text-scale', ui.textScale.toFixed(2));
    this.root.style.setProperty('--hud-opacity', ui.hudOpacity.toFixed(2));
    this.root.style.setProperty('--minimap-size', `${Math.round(ui.minimapSize)}px`);
    this.root.style.setProperty('--minimap-opacity', ui.minimapOpacity.toFixed(2));
    this.root.classList.toggle('reduced-motion', this.reducedMotion());
  }

  private reducedMotion(): boolean {
    return !!this.game.settings.graphics?.reducedMotion || !!this.game.settings.cutscene?.photosensitive;
  }

  // ---------- top bar ----------

  private renderTopBar(): void {
    const g = this.game;
    const t = g.dayTime;
    const isNight = t >= 0.5;
    const clockPct = Math.round(((t % 0.5) / 0.5) * 100);
    const now = performance.now();
    const goldPop = now < this.goldPopUntil;
    const streakActive = now < this.goldStreakUntil && this.goldStreak > 1;
    const staminaMax = g.staminaMax();
    const staminaPct = Math.round((g.stamina / staminaMax) * 100);
    const resin = Math.floor(g.resin);
    const exploration = g.explorationFor();
    const key = (action: InputAction) => glyphForAction(g.settings, action);
    const crest = g.region.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    const badges = [...g.badges].slice(0, 8).map((badge) => `<span class="badge-chip" title="${esc(badge.replace(/-/g, ' '))}">${esc(badge.split('-')[0]?.[0]?.toUpperCase() ?? 'B')}</span>`).join('');
    const showHelp = this.interfaceSettings().helpOverlay;
    this.topBar.innerHTML = `
      <span class="region-crest" title="${esc(g.region.name)}">${crest}</span>
      <span class="region">${g.region.name}</span>
      ${badges ? `<span class="badge-row">${badges}</span>` : ''}
      <span class="daynight" title="${isNight ? 'Night' : 'Day'} ${clockPct}%">
        <span class="dn-dial"><span class="dn-marker ${isNight ? 'moon' : 'sun'}" style="transform:rotate(${(t * 360 - 90).toFixed(1)}deg)"></span></span>
        <span class="clock ${isNight ? 'night' : 'day'}">${isNight ? 'Night' : 'Day'} ${clockPct}%</span>
      </span>
      <span class="gold-counter ${goldPop ? 'pop' : ''}" data-gold-counter>
        <span class="coin-icon">◆</span>
        <span class="gold-amount">${Math.floor(this.displayGold)}</span><span class="gold-unit">g</span>
        ${streakActive ? `<span class="gold-streak">×${this.goldStreak}</span>` : ''}
      </span>
      <span class="stamina-chip" title="Stamina: sprint, dash, climb and swim (${Math.round(g.stamina)}/${staminaMax})">
        <span>STA</span><b>${staminaPct}%</b><i><em style="width:${staminaPct}%"></em></i>
      </span>
      ${(() => {
        const state = g.locomotionState();
        if (state !== 'ground') return `<span class="loco-chip" title="Traversal state">${state.toUpperCase()}</span>`;
        if (g.nearbyClimbPoint()) return `<span class="loco-chip prompt" title="Elevation connector">G to climb</span>`;
        if (g.nearbyGlidePoint()) return `<span class="loco-chip prompt" title="Elevation connector">G to glide</span>`;
        return '';
      })()}
      <span class="explore-chip" title="Region exploration">${exploration}% explored</span>
      <span class="resin-chip" title="Soft pacing resource">${resin}/${TUNING.resin.max} moonflow</span>
      <button class="top-btn" data-open="journal">Journal</button>
      <button class="top-btn" data-open="codex">Codex</button>
      ${showHelp ? `<button class="top-btn help-btn" data-open="help" title="Controls help (${esc(key('help'))})">?</button>` : ''}
    `;
  }

  // Minimap POI categories (§8): shaped glyphs (never color-only) with a
  // legend/filter for the dense ones. `legend` lists what the filter exposes.
  private static readonly MINIMAP_CATEGORIES: { id: string; label: string; color: string; legend: boolean }[] = [
    { id: 'camps', label: 'Camps', color: '#db6b55', legend: true },
    { id: 'gates', label: 'Gates', color: '#7aff9a', legend: true },
    { id: 'gyms', label: 'Gyms', color: '#ff9ad5', legend: true },
    { id: 'dungeons', label: 'Dungeons', color: '#b28cff', legend: true },
    { id: 'echoes', label: 'Echoes', color: '#8fe8ff', legend: true },
    { id: 'waypoints', label: 'Waypoints', color: '#7af7ff', legend: true },
    { id: 'chests', label: 'Chests', color: '#ffd86a', legend: true },
    { id: 'shards', label: 'Shards', color: '#d990ff', legend: true },
    { id: 'sources', label: 'Sources', color: '#ff9f57', legend: true }
  ];

  /** Draw a shaped POI glyph on the minimap — shape carries the category so the
   *  map reads without relying on color alone (accessibility, §1/§8). */
  private minimapGlyph(
    ctx: CanvasRenderingContext2D,
    shape: 'circle' | 'square' | 'tri-up' | 'tri-down' | 'diamond' | 'cross' | 'house' | 'star',
    cx: number, cy: number, r: number, color: string, filled: boolean
  ): void {
    ctx.beginPath();
    switch (shape) {
      case 'circle': ctx.arc(cx, cy, r, 0, Math.PI * 2); break;
      case 'square': ctx.rect(cx - r, cy - r, r * 2, r * 2); break;
      case 'tri-up': ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r); ctx.closePath(); break;
      case 'tri-down': ctx.moveTo(cx, cy + r); ctx.lineTo(cx + r, cy - r); ctx.lineTo(cx - r, cy - r); ctx.closePath(); break;
      case 'diamond': ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); break;
      case 'house': ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy - r * 0.1); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r); ctx.lineTo(cx - r, cy - r * 0.1); ctx.closePath(); break;
      case 'star':
        for (let i = 0; i < 10; i++) {
          const rad = i % 2 === 0 ? r : r * 0.45;
          const a = (Math.PI / 5) * i - Math.PI / 2;
          const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      case 'cross':
        ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
        ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
        return;
    }
    if (filled) { ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = 'rgba(7,16,24,0.7)'; ctx.lineWidth = 1; ctx.stroke(); }
    else { ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke(); }
  }

  private renderMinimap(): void {
    const g = this.game;
    const hidden = g.settings.minimap === false;
    this.minimap.classList.toggle('hidden', hidden);
    this.minimapLegend.classList.toggle('hidden', hidden);
    if (hidden) return;
    const ctx = this.minimapCtx;
    const s = this.minimap.width;
    const scale = s / g.region.size;
    const show = (cat: string): boolean => !this.minimapHidden.has(cat);
    const glyph = (shape: Parameters<typeof this.minimapGlyph>[1], x: number, y: number, r: number, color: string, filled = false): void =>
      this.minimapGlyph(ctx, shape, x * scale, y * scale, r, color, filled);
    const bg = { grass: '#263b26', snow: '#dce8f2', desert: '#7a5d32', wasteland: '#3a2930', coast: '#23465c', forest: '#1f3d2e' }[g.region.biome];
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);

    // Day/night tint matching the world clock (§8): darken toward midnight.
    const t = g.dayTime;
    const daylight = 0.5 + 0.5 * Math.cos((t - 0.25) * Math.PI * 2);
    const nightAmt = 1 - daylight;
    if (nightAmt > 0.02) {
      ctx.fillStyle = `rgba(20,30,68,${(nightAmt * 0.36).toFixed(3)})`;
      ctx.fillRect(0, 0, s, s);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);

    if (show('camps')) for (const camp of g.region.camps) glyph('tri-up', camp.pos.x, camp.pos.y, 2, '#db6b55', true);
    for (const spawn of g.region.heroSpawns) glyph('circle', spawn.pos.x, spawn.pos.y, 2.4, '#b88cff');
    if (show('echoes')) for (const echo of g.region.echoSpawns ?? []) glyph('diamond', echo.pos.x, echo.pos.y, 2.4, '#8fe8ff');
    if (show('gates')) for (const gate of g.region.gates ?? []) glyph('tri-up', gate.pos.x, gate.pos.y, 2.9, '#7aff9a');
    if (show('gyms')) for (const gym of g.region.gyms ?? []) glyph('square', gym.pos.x, gym.pos.y, 2.7, '#ff9ad5');
    if (show('dungeons')) for (const dungeon of g.region.dungeons ?? []) glyph('tri-down', dungeon.pos.x, dungeon.pos.y, 2.9, '#b28cff');
    if (show('waypoints')) for (const wp of g.region.waypoints ?? []) glyph('cross', wp.pos.x, wp.pos.y, 2.6, g.discovered.has(wp.id) ? '#7af7ff' : '#446b73');
    if (show('chests')) for (const chest of g.region.chests ?? []) {
      if (!g.openedChests.has(chest.id)) glyph('square', chest.pos.x, chest.pos.y, 1.9, '#ffd86a');
    }
    if (show('shards')) for (const shard of g.region.shards ?? []) {
      if (!g.collectedShards.has(shard.id)) glyph('diamond', shard.pos.x, shard.pos.y, 1.9, '#d990ff', true);
    }
    if (show('sources')) for (const src of g.region.elementSources ?? []) glyph('tri-up', src.pos.x, src.pos.y, 1.9, '#ff9f57', true);
    glyph('house', g.region.town.pos.x, g.region.town.pos.y, 3.6, '#ffd86a', true);
    glyph('star', g.region.shrine.pos.x, g.region.shrine.pos.y, 3, '#67d7ff', true);
    // Walking quest givers: gold when a reward is ready, cyan when one is active.
    for (const giver of g.questGiverViews()) {
      glyph('circle', giver.x, giver.y, 2.6, giver.hasClaimable ? '#ffd24a' : giver.hasActive ? '#73d9ff' : '#8aa0b8');
    }

    const reducedMotion = this.reducedMotion();
    const qNow = reducedMotion ? 0 : performance.now();
    for (const marker of this.questMinimapMarkers(this.trackedQuests())) {
      const x = marker.x * scale;
      const y = marker.y * scale;
      const pulse = reducedMotion ? 1 : 1 + Math.sin(qNow / 240) * 0.16;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = marker.claimable ? '#ffd24a' : '#73d9ff';
      ctx.strokeStyle = '#0b1018';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(-3.8 * pulse, -3.8 * pulse, 7.6 * pulse, 7.6 * pulse);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#071018';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Q', x, y + 0.3);
    }

    this.renderMinimapPings(ctx, scale);
    this.renderMinimapViewport(ctx, scale);

    const u = g.activeUnit();
    if (u) {
      this.minimapGlyph(ctx, 'circle', u.pos.x * scale, u.pos.y * scale, 2.6, '#ffffff', true);
      this.minimapGlyph(ctx, 'circle', u.pos.x * scale, u.pos.y * scale, 5.2, '#ffd86a', false);
    }
    this.renderMinimapLegend();
  }

  /** Expanding ping rings dropped by Alt-clicking the minimap (§8). */
  private renderMinimapPings(ctx: CanvasRenderingContext2D, scale: number): void {
    const now = performance.now();
    this.minimapPings = this.minimapPings.filter((p) => now - p.at < 2200);
    for (const p of this.minimapPings) {
      const age = (now - p.at) / 2200;
      const r = 3 + age * 12;
      ctx.beginPath();
      ctx.arc(p.x * scale, p.y * scale, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(122,223,255,${(1 - age).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  /** Camera-viewport rectangle showing the current view bounds on the map (§8). */
  private renderMinimapViewport(ctx: CanvasRenderingContext2D, scale: number): void {
    const corners = this.game.scene.viewBoundsSim?.();
    if (!corners || corners.length !== 4) return;
    ctx.save();
    ctx.beginPath();
    corners.forEach((c, i) => {
      const x = c.x * scale, y = c.y * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  private renderMinimapLegend(): void {
    const g = this.game;
    const present = Hud.MINIMAP_CATEGORIES.filter((cat) => cat.legend && this.minimapCategoryPresent(cat.id));
    const key = present.map((c) => `${c.id}:${this.minimapHidden.has(c.id) ? 0 : 1}`).join('|');
    if (key === this.lastMinimapLegendKey) return;
    this.lastMinimapLegendKey = key;
    if (present.length === 0) {
      this.minimapLegend.innerHTML = '';
      return;
    }
    this.minimapLegend.innerHTML = present.map((cat) => {
      const off = this.minimapHidden.has(cat.id);
      return `<button class="mm-legend-chip ${off ? 'off' : ''}" data-mm-cat="${cat.id}" title="Toggle ${esc(cat.label)} on the minimap">
        <i style="background:${cat.color}"></i>${esc(cat.label)}</button>`;
    }).join('');
    this.minimapLegend.querySelectorAll<HTMLElement>('[data-mm-cat]').forEach((el) => {
      el.addEventListener('click', () => {
        const cat = el.dataset.mmCat!;
        if (this.minimapHidden.has(cat)) this.minimapHidden.delete(cat);
        else this.minimapHidden.add(cat);
        this.lastMinimapLegendKey = '';
      });
    });
  }

  private minimapCategoryPresent(cat: string): boolean {
    const r = this.game.region;
    switch (cat) {
      case 'camps': return r.camps.length > 0;
      case 'gates': return (r.gates?.length ?? 0) > 0;
      case 'gyms': return (r.gyms?.length ?? 0) > 0;
      case 'dungeons': return (r.dungeons?.length ?? 0) > 0;
      case 'echoes': return (r.echoSpawns?.length ?? 0) > 0;
      case 'waypoints': return (r.waypoints?.length ?? 0) > 0;
      case 'chests': return (r.chests?.length ?? 0) > 0;
      case 'shards': return (r.shards?.length ?? 0) > 0;
      case 'sources': return (r.elementSources?.length ?? 0) > 0;
      default: return false;
    }
  }

  private trackedQuests(): QuestBoardEntry[] {
    const max = this.interfaceSettings().questTrackerMax;
    const board = this.game.questBoard();
    const picked: QuestBoardEntry[] = [];
    const add = (q: QuestBoardEntry | undefined): void => {
      if (q && !picked.some((p) => p.id === q.id)) picked.push(q);
    };
    for (const id of this.pinnedQuestIds) add(board.find((q) => q.id === id));
    for (const q of board) if (q.claimable) add(q);
    for (const q of board) if (q.regionId === this.game.region.id && q.status === 'active') add(q);
    for (const q of board) if (q.status === 'active') add(q);
    return picked.slice(0, max);
  }

  private questMarkerFor(q: QuestBoardEntry): { x: number; y: number; label: string; claimable: boolean } | null {
    const def = REG.questDefs.get(q.id);
    if (!def) return null;
    const objIdx = q.objectives.findIndex((obj) => obj.have < obj.need);
    const obj = def.objectives[objIdx >= 0 ? objIdx : 0];
    const label = q.claimable ? 'Claim reward' : q.name;
    const targetRegion = obj?.kind === 'reach-region' ? obj.targetId : obj?.regionId ?? def.regionId;
    if (targetRegion && targetRegion !== this.game.region.id) {
      const gate = this.game.region.gates?.find((g) => g.toRegionId === targetRegion);
      return gate ? { ...gate.pos, label, claimable: q.claimable } : null;
    }
    if (obj?.kind === 'reach-region') return { ...this.game.region.town.pos, label, claimable: q.claimable };
    if (obj?.kind === 'earn-badge') {
      const gym = this.game.region.gyms?.find((g) => REG.gym(g.gymId).badgeId === obj.targetId) ?? this.game.region.gyms?.[0];
      return gym ? { ...gym.pos, label, claimable: q.claimable } : null;
    }
    if (obj?.kind === 'clear-dungeon') {
      const dungeon = this.game.region.dungeons?.find((d) => d.dungeonId === obj.targetId) ?? this.game.region.dungeons?.[0];
      return dungeon ? { ...dungeon.pos, label, claimable: q.claimable } : null;
    }
    if (obj?.kind === 'kill-echoes') {
      const echo = this.game.region.echoSpawns?.[0];
      return echo ? { ...echo.pos, label, claimable: q.claimable } : null;
    }
    if (obj?.kind === 'recruit-heroes') {
      const spawn = this.game.region.heroSpawns[0];
      return spawn ? { ...spawn.pos, label, claimable: q.claimable } : null;
    }
    if (obj?.kind === 'clear-raid') return { ...this.game.region.town.pos, label, claimable: q.claimable };
    if (obj?.kind === 'clear-boss') return { ...this.game.region.shrine.pos, label, claimable: q.claimable };
    const camp = this.game.region.camps[0];
    return camp ? { ...camp.pos, label, claimable: q.claimable } : null;
  }

  private questMinimapMarkers(quests: QuestBoardEntry[]): { x: number; y: number; label: string; claimable: boolean }[] {
    const seen = new Set<string>();
    const out: { x: number; y: number; label: string; claimable: boolean }[] = [];
    for (const q of quests) {
      const marker = this.questMarkerFor(q);
      if (!marker) continue;
      const key = `${Math.round(marker.x)}:${Math.round(marker.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(marker);
    }
    return out;
  }

  private renderQuestTracker(): void {
    if (!this.interfaceSettings().questTracker) {
      this.questTracker.classList.add('hidden');
      this.questTracker.innerHTML = '';
      return;
    }
    const quests = this.trackedQuests();
    if (quests.length === 0) {
      this.questTracker.classList.add('hidden');
      this.questTracker.innerHTML = '';
      return;
    }
    const key = quests
      .map((q) => `${q.id}:${q.status}:${q.objectives.map((o) => `${o.have}/${o.need}`).join(',')}`)
      .join('|');
    const now = performance.now();
    if (!this.reducedMotion() && this.lastQuestTrackerKey && this.lastQuestTrackerKey !== key) this.questTrackerFlashUntil = now + 1400;
    this.lastQuestTrackerKey = key;
    const flash = now < this.questTrackerFlashUntil;
    const rows = quests.map((q) => {
      const objectives = q.objectives.map((obj) => {
        const pct = obj.need > 0 ? Math.min(100, (obj.have / obj.need) * 100) : 100;
        return `<div class="qt-obj"><span>${esc(obj.text)}</span><b>${obj.have}/${obj.need}</b><i><em style="width:${pct}%"></em></i></div>`;
      }).join('');
      const pinned = this.pinnedQuestIds.has(q.id);
      const meta = q.claimable ? 'Ready to claim' : q.expiresIn ? `${q.expiresIn}s left` : q.region ?? q.kind;
      return `<article class="qt-row ${q.claimable ? 'claimable' : ''}">
        <button class="qt-pin ${pinned ? 'on' : ''}" data-pin-quest="${q.id}" title="${pinned ? 'Unpin quest' : 'Pin quest'}">${pinned ? '◆' : '◇'}</button>
        <button class="qt-open" data-open-quest="${q.id}">
          <strong>${esc(q.name)}</strong><em>${esc(meta)}</em>${objectives}
        </button>
      </article>`;
    }).join('');
    const html = `<div class="qt-card ${flash ? 'flash' : ''}">
      <div class="qt-head"><span>Tracked Quests</span><button class="qt-journal" data-open-journal>Journal</button></div>
      ${rows}
    </div>`;
    if (this.questTracker.innerHTML !== html) {
      this.questTracker.innerHTML = html;
      this.questTracker.querySelectorAll<HTMLElement>('[data-pin-quest]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = el.dataset.pinQuest!;
          if (this.pinnedQuestIds.has(id)) this.pinnedQuestIds.delete(id);
          else this.pinnedQuestIds.add(id);
          this.renderQuestTracker();
        });
      });
      this.questTracker.querySelectorAll<HTMLElement>('[data-open-quest], [data-open-journal]').forEach((el) => {
        el.addEventListener('click', () => this.toggleModal('journal'));
      });
    }
    this.questTracker.classList.remove('hidden');
  }

  // ---------- party frames ----------

  private renderParty(): void {
    const g = this.game;
    let html = '';
    g.party.forEach((rec, i) => {
      const def = REG.hero(rec.heroId);
      const active = i === g.activeIdx;
      const u = rec.unit;
      const hpPct = u ? (u.hp / u.stats.maxHp) * 100 : rec.hpPct * 100;
      const manaPct = u ? (u.stats.maxMana > 0 ? (u.mana / u.stats.maxMana) * 100 : 0) : rec.manaPct * 100;
      const dead = rec.respawnAt > g.sim.time;
      const deadIn = dead ? Math.ceil(rec.respawnAt - g.sim.time) : 0;
      const respawnTotal = 15 + rec.level * 3;
      const respawnPct = dead ? Math.max(0, Math.min(1, deadIn / respawnTotal)) : 0;
      const swapKey = glyphForAction(g.settings, `swap-${i + 1}` as InputAction);
      const boon = def.tagBoon;
      const tagReadyIn = boon ? Math.max(0, rec.tagGaugeReadyAt - g.sim.time) : 0;
      const tagPct = boon ? Math.max(0, Math.min(1, 1 - tagReadyIn / Math.max(0.1, boon.gaugeSec))) : 1;
      const tagState = boon && tagReadyIn > 0 ? `${tagReadyIn.toFixed(tagReadyIn > 5 ? 0 : 1)}s` : 'ready';
      const reactionPreview = boon && tagReadyIn <= 0 ? g.tagReactionPreview(i) : null;
      const reactionLine = reactionPreview
        ? `${reactionPreview.reaction} on ${reactionPreview.targetName}`
        : '';
      const partyTip = this.registerTip(`party-${i}`, buildHeroCard(def, { level: u ? u.level : rec.level }), {
        accent: def.palette[2] ?? 'var(--brass)',
        extra: [
          `HP ${Math.ceil(u ? u.hp : hpPct)} / ${Math.ceil(u ? u.stats.maxHp : 100)} · Mana ${Math.ceil(u ? u.mana : manaPct)} / ${Math.ceil(u ? u.stats.maxMana : 100)}`,
          dead ? `Respawns in ${deadIn}s` : `Swap: ${swapKey}`,
          boon ? `Tag Gauge: ${tagState}` : '',
          reactionLine ? `Preview: ${reactionLine}` : ''
        ]
      });
      html += `
        <div class="party-frame ${active ? 'active' : ''} ${dead ? 'dead' : ''}" data-swap="${i}" style="--pf-accent:${def.palette[2] ?? 'var(--brass)'}; --respawn-deg:${(respawnPct * 360).toFixed(1)}deg; --tag-deg:${(tagPct * 360).toFixed(1)}deg"${partyTip}>
          <span class="pf-portrait ${boon && tagReadyIn <= 0 ? 'tag-ready' : ''}"><img src="${heroPortrait(def.palette, def.name[0], 72, def.silhouette)}" alt="">${boon ? `<i class="tag-gauge" title="Tag Gauge ${esc(tagState)}"></i>` : ''}${dead ? `<b>${deadIn}</b>` : ''}</span>
          <div class="pf-info">
            <div class="pf-name"><kbd>${esc(swapKey)}</kbd> ${def.name} <em>L${u ? u.level : rec.level}</em></div>
            <div class="bar hp"><div style="width:${hpPct}%"></div></div>
            <div class="bar mana"><div style="width:${manaPct}%"></div></div>
            ${boon ? `<div class="tag-line">${esc(boon.tooltip)}</div>` : ''}
            ${reactionLine ? `<div class="reaction-preview">-> ${esc(reactionLine)}</div>` : ''}
            ${u ? this.statusPipsHtml(u, 'party', 4) : ''}
          </div>
        </div>`;
    });
    // entourage
    for (const instId of g.fielded) {
      const inst = g.caught.find((c) => c.uid === instId);
      if (!inst) continue;
      const def = REG.creep(inst.creepId);
      const simUid = g.fieldedUnits.get(instId);
      const u = simUid !== undefined ? g.sim.unit(simUid) : undefined;
      const hpPct = u && u.alive ? (u.hp / u.stats.maxHp) * 100 : 0;
      html += `
        <div class="party-frame creep" style="--pf-accent:${def.palette[2] ?? 'var(--brass)'}">
          <span class="pf-portrait"><img src="${heroPortrait(def.palette, def.name[0], 48, def.silhouette)}" alt=""></span>
          <div class="pf-info">
            <div class="pf-name">${def.name} <em>${'★'.repeat(inst.star)}</em></div>
            <div class="bar hp"><div style="width:${hpPct}%"></div></div>
            ${u ? this.statusPipsHtml(u, 'party', 3) : ''}
          </div>
        </div>`;
    }
    if (this.partyCol.innerHTML !== html) {
      this.partyCol.innerHTML = html;
      this.partyCol.querySelectorAll('[data-swap]').forEach((el) => {
        el.addEventListener('click', () => g.trySwap(Number((el as HTMLElement).dataset.swap)));
      });
    }
  }

  // ---------- hero panel ----------

  private abilityReadyFlash(key: string, cdLeft: number): boolean {
    const prev = this.abilityCooldowns.get(key);
    const now = performance.now();
    if (prev !== undefined && prev > 0.05 && cdLeft <= 0.05) {
      if (!this.reducedMotion()) this.abilityReadyUntil.set(key, now + 700);
      this.game.audio.playUi?.('ready');
    }
    this.abilityCooldowns.set(key, cdLeft);
    return now < (this.abilityReadyUntil.get(key) ?? 0);
  }

  private renderHeroPanel(): void {
    const g = this.game;
    const rec = g.party[g.activeIdx];
    const u = rec?.unit;
    if (!rec || !u) {
      this.heroPanel.classList.remove('skill-ready');
      this.heroPanel.innerHTML = '';
      return;
    }
    const def = REG.hero(rec.heroId);
    const now = g.sim.time;
    const xp = xpProgress(u.level, u.xp);
    const pendingAbilityPoints = g.pendingAbilityPoints(rec);
    const pendingMasteryPoints = g.pendingMasteryPoints(rec);
    this.heroPanel.classList.toggle('skill-ready', pendingAbilityPoints > 0 || pendingMasteryPoints > 0);

    let abilitiesHtml = '';
    u.abilities.forEach((a, i) => {
      if (i >= 6) return;
      const maxLevel = abilityMaxLevel(a.def);
      const nextReq = a.level < maxLevel ? abilityRankRequiredHeroLevel(a.def, a.level + 1) : 0;
      const canUpgrade = pendingAbilityPoints > 0 && g.canLevelAbility(g.activeIdx, i);
      const cdLeft = Math.max(0, a.cooldownUntil - now);
      const cdTotal = (levelArr(a.def.cooldown, Math.max(1, a.level), 1) || 1) * TUNING.cooldownScale;
      const cdPct = cdLeft > 0 ? Math.min(100, (cdLeft / cdTotal) * 100) : 0;
      const mana = a.level > 0 ? levelArr(a.def.manaCost, a.level, 0) * TUNING.manaCostScale : 0;
      const noMana = mana > 0 && u.mana < mana;
      const passive = ['passive', 'aura', 'attack-modifier'].includes(a.def.targeting);
      const toggledOn = a.toggled;
      const hotkey = glyphForAction(g.settings, `ability-${i + 1}` as InputAction);
      const readyFlash = this.abilityReadyFlash(`${u.uid}:${i}`, cdLeft);
      const abTip = this.registerTip(`ab-${i}`, buildAbilityCard(a.def, a.level), {
        extra: [
          `Rank ${a.level}/${maxLevel}`,
          a.level < maxLevel ? `Next rank: hero level ${nextReq}` : 'Max rank',
          noMana ? `Need ${Math.ceil(mana - u.mana)} more mana` : ''
        ]
      });
      abilitiesHtml += `
        <div class="ab-slot ${a.level <= 0 ? 'unlearned' : ''} ${noMana ? 'nomana' : ''} ${passive ? 'passive' : ''} ${toggledOn ? 'toggled' : ''} ${canUpgrade ? 'upgradeable' : ''} ${readyFlash ? 'ready-flash' : ''}"${abTip}>
          <img src="${abilityIcon(a.def)}" alt="">
          ${cdLeft > 0 ? `<div class="cd" style="--cd-deg:${(cdPct * 3.6).toFixed(1)}deg"></div><span class="cd-num">${cdLeft.toFixed(cdLeft > 5 ? 0 : 1)}</span>` : ''}
          <span class="hotkey">${passive ? '' : esc(hotkey)}</span>
          <span class="ab-level">${a.level}/${maxLevel}</span>
          ${pendingAbilityPoints > 0 && a.level < maxLevel ? `<button class="ab-plus" data-skill="${i}" ${canUpgrade ? '' : 'disabled'} title="${canUpgrade ? 'Spend an ability point' : `Requires hero level ${nextReq}`}">+</button>` : ''}
          ${mana > 0 ? `<span class="ab-mana">${Math.round(mana)}</span>` : ''}
        </div>`;
    });

    let itemsHtml = '';
    const equippedSaves = u.items.map((slot) => (slot ? ({ ...slot, id: slot.defId } as ItemSave) : null));
    u.items.forEach((it, i) => {
      const keyed = i < TUNING.activeItemSlots;
      const hotkey = keyed ? glyphForAction(g.settings, `item-${i + 1}` as InputAction) : '·';
      if (!it) {
        itemsHtml += `<div class="item-slot empty ${keyed ? '' : 'passive-slot'}"><span class="hotkey">${esc(hotkey)}</span></div>`;
        return;
      }
      const idef = REG.item(it.defId);
      const ready = itemReady(it, idef, u, now);
      const cdLeft = Math.max(0, it.cooldownUntil - now);
      const lockout = !ready.ok && ready.reason === 'damage-lockout';
      const hasQuality = !!it.quality && it.quality !== 'standard';
      const qLine = hasQuality
        ? `${QUALITY_GRADES[it.quality!].name}${it.quality === 'inscribed' && it.inscribedKills ? ` (${it.inscribedKills} kills)` : ''}`
        : '';
      const qBorder = hasQuality ? `box-shadow: inset 0 0 0 2px ${qualityColor(it.quality)};` : '';
      const gDef = GRADE_DEFS[it.grade ?? 'standard'];
      const savedItem: ItemSave = { ...it, id: it.defId };
      const gradeFrame = `outline:2px solid ${gDef.frame};`;
      const itemTip = this.registerTip(`item-${i}`, buildItemCard(idef, { mods: itemMods(savedItem, idef) }), {
        accent: rarityColor(idef.rarity),
        extra: [...(qLine ? [qLine] : []), ...itemDetailLines(savedItem, equippedSaves)]
      });
      itemsHtml += `
        <div class="item-slot ${keyed ? '' : 'passive-slot'} ${lockout ? 'lockout' : ''}" draggable="true" data-item-slot="${i}"${itemTip} style="border-color:${rarityColor(idef.rarity)};${gradeFrame}${qBorder}">
          <img src="${itemIcon(idef)}" alt="">
          ${cdLeft > 0 ? `<div class="cd" style="--cd-deg:${Math.min(360, Math.max(0, cdLeft / Math.max(1, levelArr(idef.active?.cooldown, 1, cdLeft)) * 360)).toFixed(1)}deg"></div>` : ''}
          ${cdLeft > 0 ? `<span class="cd-num">${cdLeft.toFixed(cdLeft > 5 ? 0 : 1)}</span>` : ''}
          ${it.charges >= 0 ? `<span class="charges">${it.charges}</span>` : ''}
          <span class="hotkey">${keyed && idef.active ? esc(hotkey) : ''}</span>
        </div>`;
    });

    const facet = def.facets[rec.facetIdx];
    const regen = liveRegen(u.stats);
    const pickedTalents = rec.talentPicks
      .map((pick, idx) => pick === null ? null : `Lv ${def.talents[idx].level}: ${def.talents[idx].options[pick].name}`)
      .filter((line): line is string => !!line);
    const talentPips = def.talents.map((tier, idx) => {
      const pick = rec.talentPicks[idx];
      const unlocked = rec.echo.talentTierUnlocks[idx];
      const title = pick === null
        ? `Lv ${tier.level}: unpicked`
        : `Lv ${tier.level}: ${tier.options[pick].name}${unlocked ? ' + echo branch' : ''}`;
      return `<span class="talent-pip ${pick === null ? '' : `picked branch-${pick}`} ${unlocked ? 'echo' : ''}" title="${esc(title)}">${tier.level}</span>`;
    }).join('');
    const facetLine = facet
      ? `Facet: ${facet.name}${rec.echo.facetSwapUnlocked ? '' : ' (swap locked)'}`
      : 'Facet: none';
    const heroExtra = [
      `Live: STR ${Math.round(u.stats.str)} · AGI ${Math.round(u.stats.agi)} · INT ${Math.round(u.stats.int)}`,
      `Regen: +${fmtRegen(regen.hp)} HP/s · +${fmtRegen(regen.mana)} MP/s`,
      facetLine,
      `Talents: ${pickedTalents.length > 0 ? pickedTalents.join(' · ') : 'none picked'}`,
      `Echo: ${rec.echo.kills} kill${rec.echo.kills === 1 ? '' : 's'} · ${rec.echo.talentTierUnlocks.filter(Boolean).length}/4 echo branches`
    ];
    const facetBadge = facet
      ? `<span class="facet-badge ${rec.echo.facetSwapUnlocked ? '' : 'locked'}" title="${esc(facet.description)}">Facet: ${esc(facet.name)}</span>`
      : '';
    const xpText = xp.needed > 0
      ? `${Math.floor(xp.current)} / ${xp.needed} XP · ${Math.max(0, Math.ceil(xp.needed - xp.current))} to L${u.level + 1}`
      : 'Level cap';
    const hpRegenTitle = `HP regen: base + flat ${fmtRegen(u.stats.hpRegen)}/s, max-HP ${fmtRegen((u.stats.maxHp * u.stats.hpRegenPctMax) / 100)}/s, total +${fmtRegen(regen.hp)}/s`;
    const manaRegenTitle = `Mana regen: base + flat ${fmtRegen(u.stats.manaRegen)}/s, max-mana ${fmtRegen((u.stats.maxMana * u.stats.manaRegenPctMax) / 100)}/s, total +${fmtRegen(regen.mana)}/s`;
    const masteryBranches = deriveMasteryTrees(def);
    const masterySpent = rec.masteryRanks.reduce((sum, rank) => sum + (rank > 0 ? 1 : 0), 0);
    const masteryHtml = `
      <div class="mastery-panel">
        <div class="mastery-head">
          <b>Masteries</b>
          <span>${pendingMasteryPoints} MP available · ${masterySpent}/${masteryPointsForLevel(rec.level)} spent</span>
          ${masterySpent > 0 ? '<button class="btn tiny mastery-respec" id="mastery-respec">Refund</button>' : ''}
        </div>
        <div class="mastery-grid">
          ${masteryBranches.map((branch, branchIdx) => {
            const ability = def.abilities[branchIdx];
            return `<div class="mastery-branch">
              <div class="mastery-ability"><img src="${abilityIcon(ability)}" alt=""><span>${esc(branch.name)}</span></div>
              <div class="mastery-nodes">
                ${branch.nodes.map((node, tierIdx) => {
                  const nodeIdx = masteryNodeIndex(branchIdx, tierIdx + 1);
                  const bought = (rec.masteryRanks[nodeIdx] ?? 0) > 0;
                  const unlocked = masteryNodeUnlocked(def, rec.level, rec.abilityLevels, nodeIdx);
                  const canBuy = g.canBuyMasteryNode(g.activeIdx, nodeIdx);
                  const title = `${node.name}: ${node.description}${unlocked ? '' : ' (locked by ability rank)'}`;
                  return `<button class="mastery-node ${node.kind} ${bought ? 'bought' : ''} ${unlocked ? 'unlocked' : 'locked'}" data-mastery="${nodeIdx}" ${canBuy ? '' : 'disabled'} title="${esc(title)}">${tierIdx + 1}</button>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    const skillSpendHtml = (pendingAbilityPoints > 0 || pendingMasteryPoints > 0)
      ? `<div class="skill-points">
          ${pendingAbilityPoints > 0 ? `<span><b>${pendingAbilityPoints}</b> ability point${pendingAbilityPoints === 1 ? '' : 's'}</span>` : ''}
          ${pendingMasteryPoints > 0 ? `<span><b>${pendingMasteryPoints}</b> mastery point${pendingMasteryPoints === 1 ? '' : 's'}</span>` : ''}
        </div>`
      : '';

    const heroTip = this.registerTip(`hero-active`, buildHeroCard(def, { level: u.level }), { accent: def.palette[2] ?? 'var(--brass)', extra: heroExtra });
    this.heroPanel.innerHTML = `
      <div class="hp-left">
        <button class="portrait-btn" id="character-open" title="Open character sheet">
          <img class="portrait" src="${heroPortrait(def.palette, def.name[0], 72, def.silhouette)}" alt=""${heroTip}>
          <span>Sheet</span>
        </button>
        <div class="hp-id">
          <div class="hp-name">${def.name} <em>Lv ${u.level}</em></div>
          <div class="build-row">${facetBadge}<span class="talent-pips">${talentPips}</span></div>
          <div class="bar hp big" title="${esc(hpRegenTitle)}"><div style="width:${(u.hp / u.stats.maxHp) * 100}%"></div><span>${Math.ceil(u.hp)} / ${Math.ceil(u.stats.maxHp)} · +${fmtRegen(regen.hp)}/s</span></div>
          <div class="bar mana big" title="${esc(manaRegenTitle)}"><div style="width:${u.stats.maxMana > 0 ? (u.mana / u.stats.maxMana) * 100 : 0}%"></div><span>${Math.ceil(u.mana)} / ${Math.ceil(u.stats.maxMana)} · +${fmtRegen(regen.mana)}/s</span></div>
          <div class="bar xp"><div style="width:${xp.pct * 100}%"></div><span>${xpText}</span></div>
          ${this.statusPipsHtml(u, 'hero', 6)}
          ${skillSpendHtml}
          ${masteryHtml}
          <div class="hp-stats">DMG ${Math.round(u.stats.damage)} · ARM ${u.stats.armor.toFixed(1)} · MS ${Math.round(u.stats.moveSpeed)} · HP +${fmtRegen(regen.hp)}/s · MP +${fmtRegen(regen.mana)}/s</div>
        </div>
      </div>
      <div class="ab-row">${abilitiesHtml}</div>
      <div class="item-grid">${itemsHtml}</div>
    `;
    this.heroPanel.querySelector('#character-open')?.addEventListener('click', () => this.toggleModal('character'));
    this.heroPanel.querySelector('#mastery-respec')?.addEventListener('click', () => g.respecMasteries(g.activeIdx));
    this.heroPanel.querySelectorAll('[data-skill]').forEach((el) => {
      el.addEventListener('click', () => g.levelAbility(g.activeIdx, Number((el as HTMLElement).dataset.skill)));
    });
    this.heroPanel.querySelectorAll('[data-mastery]').forEach((el) => {
      el.addEventListener('click', () => g.buyMasteryNode(g.activeIdx, Number((el as HTMLElement).dataset.mastery)));
    });
    this.heroPanel.querySelectorAll<HTMLElement>('[data-item-slot]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        this.draggingItemSlot = Number(el.dataset.itemSlot);
        el.classList.add('dragging');
        e.dataTransfer?.setData('text/plain', `item-slot:${el.dataset.itemSlot}`);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
    });
  }

  private finishItemDrag(clientX: number, clientY: number): void {
    const slot = this.draggingItemSlot;
    this.draggingItemSlot = null;
    this.heroPanel.querySelectorAll('.item-slot.dragging').forEach((el) => el.classList.remove('dragging'));
    if (slot === null || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (target?.closest('#hero-panel, #modal-root')) return;
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    const rect = canvas?.getBoundingClientRect();
    const overCanvas = !!rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (!overCanvas) return;
    const pick = this.game.scene.pick(clientX, clientY, this.game.inputSim(), this.game.visibleGroundItemDrops());
    const fallback = this.game.activeUnit()?.pos;
    this.game.dropHeroItemToGround(slot, pick.ground ?? this.input.hoverGround ?? fallback);
  }

  // ---------- toasts ----------

  private renderToasts(): void {
    const g = this.game;
    while (this.shownToasts < g.toasts.length) {
      const t = g.toasts[this.shownToasts++];
      const el = document.createElement('div');
      el.className = `toast ${t.kind}`;
      const icon = t.kind === 'good' ? '◆' : t.kind === 'bad' ? '!' : t.kind === 'bark' ? '“' : 'i';
      el.innerHTML = `<span class="toast-icon">${icon}</span><span>${esc(t.text)}</span>`;
      if (t.color) {
        el.style.borderLeft = `3px solid ${t.color}`;
        el.style.color = t.color;
      }
      this.toastCol.appendChild(el);
      setTimeout(() => el.classList.add('show'), 10);
      setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 400);
      }, t.kind === 'bark' ? 6000 : 3500);
      while (this.toastCol.children.length > 6) this.toastCol.children[0].remove();
    }
  }

  private addKillfeed(ev: Extract<SimEvent, { t: 'death' }>): void {
    const victim = this.game.sim.unit(ev.uid);
    if (!victim) return;
    const kind: KillfeedEntry['kind'] | null = victim.heroId || victim.renderHeroId
      ? 'hero'
      : (victim.visualScale ?? 1) > 1.25
        ? 'boss'
        : victim.elite
          ? 'elite'
          : null;
    if (!kind) return;
    const killer = this.game.sim.unit(ev.killer);
    const text = killer ? `${killer.name} defeated ${victim.name}` : `${victim.name} fell`;
    this.killfeed.unshift({ text, kind, at: performance.now() });
    this.killfeed = this.killfeed.slice(0, 5);
  }

  private renderKillfeed(): void {
    const now = performance.now();
    this.killfeed = this.killfeed.filter((entry) => now - entry.at < 6500);
    if (this.killfeed.length === 0) {
      this.killfeedLane.classList.add('hidden');
      this.killfeedLane.innerHTML = '';
      return;
    }
    this.killfeedLane.classList.remove('hidden');
    this.killfeedLane.innerHTML = this.killfeed.map((entry) => {
      const age = (now - entry.at) / 6500;
      return `<div class="kf-row ${entry.kind}" style="opacity:${Math.max(0.2, 1 - age).toFixed(2)}"><b>${entry.kind === 'boss' ? 'BOSS' : entry.kind === 'hero' ? 'HERO' : 'ELITE'}</b><span>${esc(entry.text)}</span></div>`;
    }).join('');
  }

  // ---------- floaters (damage numbers etc.) ----------

  private handleEvents(events: SimEvent[]): void {
    const g = this.game;
    for (const ev of events) {
      switch (ev.t) {
        case 'damage': {
          if (ev.amount < 1) break;
          const u = g.sim.unit(ev.uid);
          if (!u) break;
          const cls = ev.dtype === 'physical' ? 'phys' : ev.dtype === 'magical' ? 'mag' : 'pure';
          const amountScale = Math.min(2.2, 0.82 + Math.log10(ev.amount + 1) * 0.42);
          const scale = ev.crit ? Math.max(1.45, amountScale + 0.65) : amountScale;
          this.addFloater(
            u.pos.x,
            u.pos.y,
            `${Math.round(ev.amount)}${ev.crit ? '!' : ''}`,
            `dmg ${cls} ${ev.crit ? 'crit' : ''}`,
            { scale, life: ev.crit ? 1.35 : 1.1, driftX: ev.crit ? 0 : (Math.random() - 0.5) * 18 }
          );
          break;
        }
        case 'heal': {
          if (ev.amount < 2) break;
          const u = g.sim.unit(ev.uid);
          if (u) this.addFloater(u.pos.x, u.pos.y, `+${Math.round(ev.amount)}`, 'healf');
          break;
        }
        case 'gold': {
          this.handleGold(ev);
          break;
        }
        case 'capture-start': {
          this.captureDur = ev.duration;
          this.captureUntil = g.sim.time + ev.duration;
          break;
        }
        case 'capture-interrupt': {
          this.captureUntil = 0;
          break;
        }
        case 'capture-complete': {
          this.captureUntil = 0;
          break;
        }
        case 'immune-block': {
          const u = g.sim.unit(ev.uid);
          if (u) this.addContactFloater(`immune:${u.uid}`, u.pos.x, u.pos.y, 'IMMUNE', 'immunef blockedf');
          break;
        }
        case 'miss': {
          const u = g.sim.unit(ev.target);
          if (u) this.addContactFloater(`miss:${u.uid}`, u.pos.x, u.pos.y, 'MISS', 'missf');
          break;
        }
        case 'projectile-block': {
          this.addContactFloater(`projectile-block:${ev.obstacleId ?? `${Math.round(ev.pos.x)}:${Math.round(ev.pos.y)}`}`, ev.pos.x, ev.pos.y, 'BLOCKED', 'blockedf');
          break;
        }
        case 'movement-blocked': {
          const label = ev.reason === 'out-of-range' ? 'OUT OF RANGE' : ev.reason === 'no-path' ? 'NO PATH' : 'BLOCKED';
          this.addContactFloater(`move-block:${ev.uid}:${ev.reason}`, ev.pos.x, ev.pos.y, label, ev.reason === 'out-of-range' ? 'rangef' : 'blockedf');
          break;
        }
        case 'invalid-target': {
          const label = ev.reason === 'out-of-range'
            ? 'OUT OF RANGE'
            : ev.reason === 'no-line'
              ? 'NO LINE'
              : ev.reason === 'immune'
                ? 'IMMUNE'
                : 'INVALID TARGET';
          this.addContactFloater(`invalid:${ev.uid}:${ev.reason}`, ev.pos.x, ev.pos.y, label, ev.reason === 'out-of-range' ? 'rangef' : 'blockedf');
          break;
        }
        case 'death': {
          this.addKillfeed(ev);
          break;
        }
        case 'bark': {
          const u = g.sim.unit(ev.uid);
          if (u) g.msg(`${u.name}: "${ev.line}"`, 'bark');
          break;
        }
        default:
          break;
      }
    }
  }

  private handleGold(ev: Extract<SimEvent, { t: 'gold' }>): void {
    const pos = ev.pos ?? this.game.activeUnit()?.pos;
    const reasonClass = ev.reason.replace(/[^a-z0-9-]/gi, '').toLowerCase();
    const isLastHit = ev.reason === 'lasthit';
    const text = isLastHit ? `+${Math.round(ev.amount)}g LAST HIT +15%` : `+${Math.round(ev.amount)}g`;
    if (pos) {
      this.addFloater(pos.x, pos.y, text, `goldf ${reasonClass}`, {
        scale: Math.min(1.85, 1 + Math.log10(ev.amount + 1) * 0.28 + (isLastHit ? 0.22 : 0)),
        life: isLastHit ? 1.45 : 1.25,
        driftX: 0
      });
      this.spawnCoinBurst(ev, pos);
    }
    this.startGoldTween(ev);
  }

  private addFloater(
    simX: number,
    simY: number,
    text: string,
    cls: string,
    opts: { scale?: number; life?: number; driftX?: number } = {}
  ): void {
    if (this.floaters.length > 50) return;
    const el = document.createElement('span');
    el.className = `floater ${cls}`;
    el.textContent = text;
    this.floaterLayer.appendChild(el);
    this.floaters.push({
      el,
      simX,
      simY,
      born: performance.now(),
      life: opts.life ?? 1.1,
      scale: opts.scale ?? 1,
      driftX: opts.driftX ?? 0
    });
  }

  private addContactFloater(key: string, simX: number, simY: number, text: string, cls: string): void {
    const now = performance.now();
    const last = this.contactFloaterAt.get(key) ?? -Infinity;
    if (now - last < 550) return;
    this.contactFloaterAt.set(key, now);
    this.addFloater(simX, simY, text, cls, { life: 0.9, scale: 0.95 });
  }

  private updateFloaters(): void {
    const now = performance.now();
    const cam = this.game.scene.camera;
    if (!cam) {
      this.floaters.forEach((f) => f.el.remove());
      this.floaters = [];
      return;
    }
    this.floaters = this.floaters.filter((f) => {
      const age = (now - f.born) / 1000;
      if (age > f.life) {
        f.el.remove();
        return false;
      }
      this.vec.set(
        f.simX / WORLD_SCALE,
        this.game.scene.groundHeightAt(f.simX, f.simY) + 2.2 + age * 1.5,
        f.simY / WORLD_SCALE
      );
      this.vec.project(cam);
      if (this.vec.z > 1) {
        f.el.style.display = 'none';
        return true;
      }
      const sx = (this.vec.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-this.vec.y * 0.5 + 0.5) * window.innerHeight;
      const punch = f.el.classList.contains('crit') ? 1 + Math.max(0, 1 - age / 0.2) * 0.36 : 1;
      const scale = f.scale * punch;
      f.el.style.display = '';
      f.el.style.transform = `translate(${(sx + f.driftX * age).toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -50%) scale(${scale.toFixed(2)})`;
      f.el.style.opacity = String(Math.max(0, 1 - age / f.life));
      return true;
    });
  }

  private updateGoldTween(): void {
    const now = performance.now();
    if (this.goldTweenEnd > this.goldTweenStart && now < this.goldTweenEnd) {
      const t = (now - this.goldTweenStart) / (this.goldTweenEnd - this.goldTweenStart);
      const eased = 1 - (1 - t) ** 3;
      this.displayGold = this.goldTweenFrom + (this.goldTweenTo - this.goldTweenFrom) * eased;
      return;
    }
    this.displayGold = this.goldTweenTo || this.game.gold;
    if (Math.abs(this.displayGold - this.game.gold) > 0.5) this.displayGold = this.game.gold;
  }

  private startGoldTween(ev: Extract<SimEvent, { t: 'gold' }>): void {
    const now = performance.now();
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const streakEligible = ev.reason === 'kill' || ev.reason === 'lasthit' || ev.reason === 'echo';
    if (streakEligible) {
      this.goldStreak = now - this.lastGoldEventAt <= GOLD_STREAK_WINDOW_MS ? Math.min(9, this.goldStreak + 1) : 1;
      this.goldStreakUntil = now + GOLD_STREAK_WINDOW_MS;
      this.lastGoldEventAt = now;
    }

    this.goldTweenFrom = this.displayGold;
    this.goldTweenTo = this.game.gold;
    this.goldTweenStart = now;
    this.goldTweenEnd = now + (reducedMotion ? 90 : Math.min(650, 260 + Math.log2(ev.amount + 1) * 42));
    this.goldPopUntil = now + (reducedMotion ? 120 : 360);
  }

  private spawnCoinBurst(ev: Extract<SimEvent, { t: 'gold' }>, pos: { x: number; y: number }): void {
    const target = this.root.querySelector('[data-gold-counter]') as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    const start = this.screenFromWorld(pos.x, pos.y, 2.4);
    if (!rect || !start) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const baseCount = Math.max(3, Math.ceil(Math.log2(ev.amount + 1)));
    const count = reducedMotion ? 1 : Math.min(14, baseCount + (ev.reason === 'lasthit' ? 2 : 0) + (ev.reason === 'echo' ? 3 : 0));
    const endX = rect.left + rect.width * 0.5;
    const endY = rect.top + rect.height * 0.5;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = `coin-fx ${ev.reason === 'lasthit' ? 'last-hit' : ''}`;
      el.textContent = '◆';
      this.floaterLayer.appendChild(el);
      this.coinFx.push({
        el,
        born: performance.now() + i * 28,
        dur: reducedMotion ? 260 : 520 + Math.random() * 180,
        startX: start.x + (Math.random() - 0.5) * 32,
        startY: start.y + (Math.random() - 0.5) * 22,
        endX: endX + (Math.random() - 0.5) * 18,
        endY: endY + (Math.random() - 0.5) * 10,
        arc: reducedMotion ? 0 : 70 + Math.random() * 70
      });
    }
    while (this.coinFx.length > 60) this.coinFx.shift()?.el.remove();
  }

  private updateCoinFx(): void {
    const now = performance.now();
    this.coinFx = this.coinFx.filter((c) => {
      const t = Math.max(0, Math.min(1, (now - c.born) / c.dur));
      if (t >= 1) {
        c.el.remove();
        return false;
      }
      const eased = 1 - (1 - t) ** 3;
      const x = c.startX + (c.endX - c.startX) * eased;
      const y = c.startY + (c.endY - c.startY) * eased - Math.sin(t * Math.PI) * c.arc;
      const scale = 0.8 + Math.sin(t * Math.PI) * 0.45;
      c.el.style.opacity = String(Math.max(0, 1 - t * 0.15));
      c.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%) scale(${scale.toFixed(2)}) rotate(${(t * 360).toFixed(0)}deg)`;
      return true;
    });
  }

  private screenFromWorld(simX: number, simY: number, height = 2.2): { x: number; y: number } | null {
    this.vec.set(
      simX / WORLD_SCALE,
      this.game.scene.groundHeightAt(simX, simY) + height,
      simY / WORLD_SCALE
    );
    this.vec.project(this.game.scene.camera);
    if (this.vec.z > 1) return null;
    return {
      x: (this.vec.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.vec.y * 0.5 + 0.5) * window.innerHeight
    };
  }

  private updateCaptureBar(): void {
    const g = this.game;
    if (this.captureUntil > g.sim.time) {
      this.captureBar.classList.remove('hidden');
      const pct = 100 * (1 - (this.captureUntil - g.sim.time) / this.captureDur);
      (this.captureBar.querySelector('.fill') as HTMLElement).style.width = `${pct}%`;
    } else {
      this.captureBar.classList.add('hidden');
    }
  }

  private renderHint(): void {
    const g = this.game;
    let hint = '';
    if (this.input.attackMoveArmed()) {
      hint = 'Attack-move: left-click ground to advance and fight · click an enemy to attack · Esc cancels';
    } else if (this.input.hoverUid >= 0) {
      const u = g.sim.unit(this.input.hoverUid);
      if (u) {
        const heroId = g.npcAt(u.uid);
        if (heroId) hint = REG.hero(heroId).recruitmentQuestId ? `${u.name} — right-click to start trial` : `${u.name} — right-click to recruit`;
        else if (u.capturable && u.tier) {
          const elig = g.captureEligible(u);
          hint = elig.ok ? `${u.name} — press T to capture!` : `${u.name} — capture: ${elig.reason}`;
        }
      }
    }
    if (this.input.targeting.kind !== 'none') hint = 'Choose a target (left-click) · Esc to cancel';
    const gym = g.nearbyGym();
    if (gym && this.modalKind === 'none' && !hint) {
      const def = REG.gym(gym.gymId);
      hint = `${def.name} — press G to challenge`;
    }
    const giver = g.nearbyQuestGiver();
    if (giver && this.modalKind === 'none' && !hint) {
      hint = `${giver.name} — press G for bounties`;
    }
    const gate = g.nearbyGate();
    if (gate && this.modalKind === 'none' && !hint) {
      const blockReason = g.gateTravelBlockReason(gate);
      hint = blockReason ? `${gate.name} — ${blockReason}` : `${gate.name} — press G to travel`;
    }
    if (g.canShop() && this.modalKind === 'none' && !hint) hint = `${g.region.town.name} — B to shop · Y for services`;
    this.hint.textContent = hint;
    this.hint.classList.toggle('hidden', hint === '');
  }

  private renderTrialChoice(): void {
    const g = this.game;
    const r = g.activeTrial;
    const opts = r && r.mechanic === 'choice' ? g.trialChoiceOptions() : [];
    if (!r || opts.length === 0) {
      if (!this.trialChoice.classList.contains('hidden')) {
        this.trialChoice.classList.add('hidden');
        this.lastTrialChoiceKey = '';
      }
      return;
    }
    const key = `${r.kind}|${opts.map((o) => o.id).join(',')}`;
    if (key !== this.lastTrialChoiceKey) {
      this.lastTrialChoiceKey = key;
      const prompt = r.trial.dialogue?.[0] ?? r.trial.description;
      this.trialChoice.innerHTML = `
        <div class="tc-title">${r.trial.name}</div>
        <div class="tc-prompt">${prompt}</div>
        <div class="tc-buttons">${opts.map((o) => `<button class="tc-btn" data-choice="${o.id}">${o.label}</button>`).join('')}</div>
      `;
      this.trialChoice.classList.remove('hidden');
    }
  }

  // ---------- modals ----------

  toggleModal(kind: 'party' | 'shop' | 'menu' | 'talents' | 'journal' | 'codex' | 'character' | 'help' | 'services'): void {
    if (this.modalKind === kind) {
      this.closeModal();
      return;
    }
    this.playUi(this.modalKind === 'none' ? 'open' : 'tab');
    this.modalKind = kind;
    this.input.uiModalOpen = true;
    this.modal.classList.remove('hidden');
    this.game.paused = kind === 'menu';
    if (kind === 'party') this.renderPartyModal();
    if (kind === 'shop') this.renderShopModal();
    if (kind === 'menu') this.renderMenuModal();
    if (kind === 'talents') this.renderTalentModal();
    if (kind === 'character') this.renderCharacterModal();
    if (kind === 'journal') {
      this.questGiverFocus = null;
      this.renderJournalModal();
    }
    if (kind === 'codex') this.renderCodexModal();
    if (kind === 'help') this.renderHelpModal();
    if (kind === 'services') this.renderServicesModal();
  }

  closeModal(): void {
    if (this.modalKind === 'gambit') this.commitGambit();
    if (this.modalKind === 'elite-draft') this.game.cancelEliteDraft();
    if (this.modalKind !== 'none') this.playUi('close');
    this.modalKind = 'none';
    this.questGiverFocus = null;
    this.input.uiModalOpen = false;
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
    this.game.paused = false;
  }

  private modalShell(title: string, body: string): void {
    this.modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-head"><h2>${title}</h2><button class="close-x" id="modal-close">✕</button></div>
        <div class="modal-body">${body}</div>
      </div>`;
    this.modal.querySelector('#modal-close')!.addEventListener('click', () => this.closeModal());
  }

  private renderHelpModal(): void {
    const groups = new Map<string, string[]>();
    for (const action of INPUT_ACTIONS) {
      const meta = ACTION_META[action];
      const rows = groups.get(meta.group) ?? [];
      rows.push(`<div class="help-row"><kbd>${esc(glyphForAction(this.game.settings, action))}</kbd><span>${esc(meta.label)}</span></div>`);
      groups.set(meta.group, rows);
    }
    const sections = [...groups.entries()]
      .map(([group, rows]) => `<section class="help-section"><h3>${esc(group)}</h3>${rows.join('')}</section>`)
      .join('');
    this.modalShell(
      'Controls Help',
      `<div class="help-grid">
        ${sections}
        <section class="help-section help-notes">
          <h3>Mouse</h3>
          <div class="help-row"><kbd>RMB</kbd><span>Move, attack, or interact with hovered targets</span></div>
          <div class="help-row"><kbd>Shift</kbd><span>Queue move, attack, ability, and item orders</span></div>
        </section>
        <section class="help-section help-notes">
          <h3>Minimap</h3>
          <div class="help-row"><kbd>Click</kbd><span>Move the hero to the clicked point</span></div>
          <div class="help-row"><kbd>Ctrl/MMB</kbd><span>Look at a point without moving</span></div>
          <div class="help-row"><kbd>Alt+Click</kbd><span>Drop a ping at that point</span></div>
        </section>
      </div>`
    );
  }

  private renderCharacterModal(): void {
    const g = this.game;
    const rec = g.party[g.activeIdx];
    const u = rec?.unit;
    if (!rec || !u) {
      this.closeModal();
      return;
    }
    const def = REG.hero(rec.heroId);
    const s = u.stats;
    const regen = liveRegen(s);
    const physReduction = (1 - armorMultiplier(s.armor)) * 100;
    const attacksPerSec = 1 / Math.max(0.1, s.attackInterval);
    const pct = (value: number) => `${Math.round(value * 10) / 10}%`;
    const signed = (value: number, suffix = '') => `${value >= 0 ? '+' : ''}${Math.round(value * 10) / 10}${suffix}`;
    const row = (label: string, value: string, note = '') => `<div class="cs-row"><span>${label}</span><b>${value}</b>${note ? `<em>${note}</em>` : ''}</div>`;
    const section = (title: string, rows: string) => `<section class="cs-section"><h3>${title}</h3>${rows}</section>`;
    const attrName = { str: 'Strength', agi: 'Agility', int: 'Intelligence', uni: 'Universal' }[def.attribute];
    const attrCards = (['str', 'agi', 'int'] as const).map((a) => {
      const primary = def.attribute === a || def.attribute === 'uni';
      const note = a === 'str' ? 'HP + regen' : a === 'agi' ? 'armor + attack speed' : 'mana + regen';
      return `<div class="cs-attr ${a} ${primary ? 'primary' : ''}"><b>${a.toUpperCase()}</b><span>${Math.round(s[a])}</span><em>${note}</em></div>`;
    }).join('');
    const pickedTalents = def.talents.map((tier, idx) => {
      const pick = rec.talentPicks[idx];
      const unlocked = rec.echo.talentTierUnlocks[idx];
      if (pick === null) return `<li><span>Lv ${tier.level}</span><em>Unpicked</em></li>`;
      const talent = tier.options[pick];
      const details = talentDetailLines(talent, def).join(' · ');
      return `<li><span>Lv ${tier.level}</span><b>${esc(talent.name)}${unlocked ? ' + echo' : ''}</b>${details ? `<em>${esc(details)}</em>` : ''}</li>`;
    }).join('');
    const masteryBranches = deriveMasteryTrees(def);
    const masteryList = masteryBranches.flatMap((branch, branchIdx) =>
      branch.nodes.map((node, tierIdx) => {
        const idx = masteryNodeIndex(branchIdx, tierIdx + 1);
        return (rec.masteryRanks[idx] ?? 0) > 0 ? `<li><span>${esc(branch.name)} ${tierIdx + 1}</span><b>${esc(node.name)}</b><em>${esc(node.description)}</em></li>` : '';
      })
    ).filter(Boolean).join('');
    const facet = def.facets[rec.facetIdx];
    this.modalShell(
      `${def.name} — Character Sheet`,
      `
      <div class="char-sheet">
        <section class="cs-hero">
          <img src="${heroPortrait(def.palette, def.name[0], 96, def.silhouette)}" alt="">
          <div>
            <h3>${esc(def.title)}</h3>
            <p>${esc(attrName)} · ${def.roles.map(esc).join(' / ')} · Level ${u.level}</p>
            <p>${facet ? `<b>Facet:</b> ${esc(facet.name)} — ${esc(facet.description)}` : 'No facet selected.'}</p>
            ${this.statusPipsHtml(u, 'sheet', 8)}
          </div>
        </section>
        <section class="cs-attrs">${attrCards}</section>
        <div class="cs-grid">
          ${section('Offense', [
            row('Attack damage', Math.round(s.damage).toString(), 'base + primary + gear'),
            row('Attack speed', `${attacksPerSec.toFixed(2)}/s`, `${s.attackInterval.toFixed(2)}s interval`),
            row('Attack range', Math.round(s.attackRange).toString()),
            row('Cast range', signed(s.castRangeBonus)),
            row('Spell amp', pct(s.spellAmpPct)),
            row('Lifesteal', pct(s.lifestealPct))
          ].join(''))}
          ${section('Defense', [
            row('Armor', s.armor.toFixed(1), `${pct(physReduction)} phys reduction`),
            row('Magic resist', pct(s.magicResistPct)),
            row('Status resist', pct(s.statusResistPct)),
            row('Evasion', pct(s.evasionPct)),
            row('Max HP', Math.round(s.maxHp).toString()),
            row('HP regen', `+${fmtRegen(regen.hp)}/s`, `${fmtRegen(s.hpRegen)} flat + ${fmtRegen((s.maxHp * s.hpRegenPctMax) / 100)} max%`)
          ].join(''))}
          ${section('Resources & Utility', [
            row('Max mana', Math.round(s.maxMana).toString()),
            row('Mana regen', `+${fmtRegen(regen.mana)}/s`, `${fmtRegen(s.manaRegen)} flat + ${fmtRegen((s.maxMana * s.manaRegenPctMax) / 100)} max%`),
            row('Move speed', Math.round(s.moveSpeed).toString()),
            row('Vision bonus', signed(u.summary.mods.visionPct ?? 0, '%')),
            row('Swap cooldown', signed(s.swapCdReductionPct, '%')),
            row('Stamina bonus', signed(s.staminaBonus))
          ].join(''))}
          ${section('Talents & Echo', `
            <ul class="cs-talents">${pickedTalents}</ul>
            <div class="cs-row"><span>Echo kills</span><b>${rec.echo.kills}</b><em>${rec.echo.talentTierUnlocks.filter(Boolean).length}/4 echo branches</em></div>
          `)}
          ${section('Masteries', `
            <ul class="cs-talents">${masteryList || '<li><span>None</span><em>No mastery nodes bought yet</em></li>'}</ul>
          `)}
        </div>
      </div>`
    );
  }

  // --- party / creeps ---

  private renderPartyModal(): void {
    const g = this.game;
    let heroes = '';
    g.party.forEach((rec, i) => {
      const def = REG.hero(rec.heroId);
      const echoPips = rec.echo.talentTierUnlocks.map((x) => `<span class="pip ${x ? 'on' : ''}"></span>`).join('');
      const facets = rec.echo.facetSwapUnlocked
        ? `<div class="facet-row">${def.facets.map((f, idx) =>
            `<button class="btn tiny ${idx === rec.facetIdx ? 'on' : ''}" data-facet="${i}:${idx}" title="${f.description}">${f.name}</button>`
          ).join('')}</div>`
        : '<div class="rr-sub">Facet swap locked: defeat this hero echo once.</div>';
      const gambitLabel = rec.gambits.length > 0 ? `${rec.gambits.length} custom rules` : 'default role gambit';
      heroes += `
        <div class="roster-row ${i === g.activeIdx ? 'active' : ''}">
          <img src="${heroPortrait(def.palette, def.name[0], 72, def.silhouette)}" alt="">
          <div class="rr-main">
            <b>${def.name}</b> <em>Lv ${rec.unit ? rec.unit.level : rec.level} · key ${i + 1}</em>
            <div class="rr-sub">${def.attribute.toUpperCase()} · ${def.roles.join(' / ')}</div>
            <div class="echo-row">Echoes ${rec.echo.kills} · talents ${echoPips}</div>
            ${facets}
            <div class="gambit-row">Gambit: ${gambitLabel}
              <button class="btn tiny" data-gambit="${i}:default">Default</button>
              <button class="btn tiny" data-gambit="${i}:aggro">Aggro</button>
              <button class="btn tiny" data-gambit="${i}:safe">Safe</button>
              <button class="btn tiny accent" data-gambit-edit="${i}">Edit rules</button>
            </div>
          </div>
        </div>`;
    });

    let creeps = '';
    if (g.caught.length === 0) {
      creeps = `<p class="dim">No creeps caught yet. Weaken a wild creep below its capture threshold, then press <b>T</b>.</p>`;
    }
    for (const inst of g.caught) {
      const def = REG.creep(inst.creepId);
      const fielded = g.fielded.includes(inst.uid);
      const fainted = inst.faintedFor && inst.faintedFor > 0;
      creeps += `
        <div class="roster-row creep ${fielded ? 'fielded' : ''} ${fainted ? 'fainted' : ''}">
          <img src="${heroPortrait(def.palette, def.name[0], 48, def.silhouette)}" alt="">
          <div class="rr-main">
            <b>${def.name} ${'★'.repeat(inst.star)}</b>
            <div class="rr-sub">${def.tier}${fainted ? ` · fainted ${Math.ceil(inst.faintedFor!)}s` : ''}</div>
          </div>
          <button class="btn small" data-field="${inst.uid}" ${fainted ? 'disabled' : ''}>
            ${fielded ? 'Recall' : 'Field'}
          </button>
        </div>`;
    }

    this.modalShell(
      'Party & Creeps',
      `
      <div class="party-modal-grid">
        <section><h3>Heroes (${g.party.length}/5)</h3>${heroes}</section>
        <section><h3>Creep Storage — fielded ${g.fielded.length}/${TUNING.entourageMax}</h3><div id="creep-list">${creeps}</div>
          <p class="dim">3 identical creeps merge into one ★ upgrade automatically.</p>
        </section>
      </div>`
    );
    this.modal.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.field!;
        if (g.fielded.includes(id)) g.unfieldCreep(id);
        else g.fieldCreep(id);
        this.renderPartyModal();
      });
    });
    this.modal.querySelectorAll('[data-facet]').forEach((el) => {
      el.addEventListener('click', () => {
        const [recIdx, facetIdx] = (el as HTMLElement).dataset.facet!.split(':').map(Number);
        g.setFacet(recIdx, facetIdx);
        this.renderPartyModal();
      });
    });
    this.modal.querySelectorAll('[data-gambit]').forEach((el) => {
      el.addEventListener('click', () => {
        const [idxRaw, preset] = (el as HTMLElement).dataset.gambit!.split(':');
        const recIdx = Number(idxRaw);
        const def = REG.hero(g.party[recIdx].heroId);
        const rules = preset === 'default' ? buildDefaultGambit(def.roles) : this.gambitPreset(preset as 'aggro' | 'safe', def.roles);
        g.setGambits(recIdx, rules);
        this.renderPartyModal();
      });
    });
    this.modal.querySelectorAll('[data-gambit-edit]').forEach((el) => {
      el.addEventListener('click', () => this.openGambitEditor(Number((el as HTMLElement).dataset.gambitEdit), 'party'));
    });
  }

  private gambitPreset(preset: 'aggro' | 'safe', roles: string[]): GambitRule[] {
    const base = buildDefaultGambit(roles);
    if (preset === 'aggro') {
      return [
        ...base,
        { if: [{ k: 'enemy-hp-below', pct: 45 }], then: { k: 'focus-fire', targetMode: 'lowest-hp-in-range' } },
        { if: [{ k: 'fight-time-gt', sec: 6 }], then: { k: 'focus-fire', targetMode: 'most-dangerous' } }
      ];
    }
    return [
      ...base,
      { if: [{ k: 'self-hp-below', pct: 42 }], then: { k: 'retreat' } },
      { if: [{ k: 'incoming-disable' }], then: { k: 'hold' } }
    ];
  }

  // --- gambit editor (§3.5): an ordered, reorderable ≤8-rule dropdown builder ---

  // Conditions, grouped by category so the growing grammar stays scannable (AI_OVERHAUL §2/§7).
  private static readonly COND_GROUPS: { label: string; kinds: string[] }[] = [
    { label: 'General', kinds: ['always', 'fight-time-gt', 'allies-alive'] },
    { label: 'My state', kinds: ['self-hp-below', 'self-mana-above', 'self-mana-below', 'self-disabled', 'standing-in-zone'] },
    { label: 'Allies', kinds: ['ally-hp-below'] },
    { label: 'Enemies', kinds: ['enemy-hp-below', 'enemies-within', 'focus-is-role', 'enemy-count-by-role', 'distance-to-focus-gt', 'distance-to-focus-lt'] },
    { label: 'Reactions', kinds: ['enemy-cast-seen', 'incoming-disable', 'tag-in-ready', 'combo-setup-active'] },
    { label: 'Combos', kinds: ['combo-ready', 'save-assigned', 'in-friendly-field', 'enemy-in-hostile-field'] },
    { label: 'Formation', kinds: ['in-formation', 'backline-threatened', 'enemy-clustered', 'flank-open', 'ally-channeling', 'enemy-channeling'] },
    { label: 'Abilities', kinds: ['ability-ready'] }
  ];
  private static readonly COND_KINDS = Hud.COND_GROUPS.flatMap((g) => g.kinds);
  private static readonly COND_LABEL: Record<string, string> = {
    'always': 'Always', 'self-hp-below': 'My HP <', 'ally-hp-below': 'Ally HP <', 'enemy-hp-below': 'Enemy HP <',
    'self-mana-above': 'My mana >', 'self-mana-below': 'My mana <', 'enemies-within': 'Enemies within',
    'allies-alive': 'Allies alive ≥', 'ability-ready': 'Ability ready', 'fight-time-gt': 'Fight time >',
    'standing-in-zone': 'Standing in zone', 'focus-is-role': 'Focus role is', 'enemy-count-by-role': 'Enemy role count ≥',
    'distance-to-focus-gt': 'Focus farther than', 'distance-to-focus-lt': 'Focus closer than',
    'enemy-cast-seen': 'Enemy casting', 'self-disabled': "I'm disabled", 'incoming-disable': 'Disable incoming',
    'tag-in-ready': 'Tag-in ready', 'combo-setup-active': 'Combo setup active',
    'combo-ready': 'Combo ready', 'save-assigned': "I'm the save-holder",
    'in-friendly-field': 'In friendly field', 'enemy-in-hostile-field': 'Focus in our field',
    'in-formation': 'Holding formation', 'backline-threatened': 'Backline threatened',
    'enemy-clustered': 'Enemies clustered', 'flank-open': 'Flank open',
    'ally-channeling': 'Ally channeling', 'enemy-channeling': 'Enemy channeling'
  };
  private static readonly ACT_KINDS = ['cast', 'use-item', 'combo-route', 'attack-focus', 'focus-fire', 'kite', 'peel', 'spread', 'dodge-zones', 'retreat', 'hold'];
  private static readonly ACT_LABEL: Record<string, string> = {
    'cast': 'Cast ability', 'use-item': 'Use item', 'combo-route': 'Route combo', 'attack-focus': 'Attack focus', 'focus-fire': 'Focus-fire',
    'kite': 'Kite', 'peel': 'Peel for ally', 'spread': 'Spread out', 'dodge-zones': 'Dodge zones', 'retreat': 'Retreat', 'hold': 'Hold'
  };
  private static readonly TARGET_MODES = [
    'focus', 'lowest-hp-enemy', 'lowest-hp-in-range', 'most-clustered', 'most-dangerous',
    'enemy-casting', 'nearest-enemy', 'lowest-hp-ally', 'self'
  ];
  private static readonly TARGET_LABEL: Record<string, string> = {
    'focus': 'focus', 'lowest-hp-enemy': 'lowest-HP enemy', 'lowest-hp-in-range': 'lowest HP in range',
    'most-clustered': 'most clustered', 'most-dangerous': 'most dangerous', 'enemy-casting': 'enemy casting',
    'nearest-enemy': 'nearest enemy', 'lowest-hp-ally': 'lowest-HP ally', 'self': 'self'
  };
  private static readonly SLOT_LABEL = ['Q', 'W', 'E', 'R'];

  openGambitEditor(recIdx: number, returnTo: 'party' | 'prefight'): void {
    const rec = this.game.party[recIdx];
    if (!rec) return;
    this.commitGambit(); // flush any prior edit
    this.gambitEditRec = recIdx;
    this.gambitEditDraftHeroId = null;
    this.gambitReturnTo = returnTo;
    this.gambitDraft = rec.gambits.length > 0
      ? structuredClone(rec.gambits)
      : buildDefaultGambit(REG.hero(rec.heroId).roles);
    this.playUi(this.modalKind === 'none' ? 'open' : 'tab');
    this.modalKind = 'gambit';
    this.input.uiModalOpen = true;
    this.modal.classList.remove('hidden');
    this.game.paused = false;
    this.renderGambitModal();
  }

  private openDraftGambitEditor(heroId: string, returnTo: 'draft' | 'prefight'): void {
    if (!this.draftEdit || !this.draftEdit.heroes.some((h) => h.heroId === heroId)) return;
    this.commitGambit(); // flush any prior edit
    const hero = this.draftEdit.heroes.find((h) => h.heroId === heroId)!;
    this.gambitEditRec = -1;
    this.gambitEditDraftHeroId = heroId;
    this.gambitReturnTo = returnTo;
    this.gambitDraft = hero.gambits && hero.gambits.length > 0
      ? structuredClone(hero.gambits)
      : buildDefaultGambit(REG.hero(heroId).roles);
    this.playUi(this.modalKind === 'none' ? 'open' : 'tab');
    this.modalKind = 'gambit';
    this.input.uiModalOpen = true;
    this.modal.classList.remove('hidden');
    this.game.paused = false;
    this.renderGambitModal();
  }

  private commitGambit(): void {
    if (this.gambitEditDraftHeroId && this.draftEdit && this.gambitDraft.length > 0) {
      const hero = this.draftEdit.heroes.find((h) => h.heroId === this.gambitEditDraftHeroId);
      if (hero) hero.gambits = structuredClone(this.gambitDraft);
      if (this.gambitReturnTo === 'prefight' && this.prefightGymId) {
        this.game.commitGymDraft(this.prefightGymId, this.draftEdit);
      }
    } else if (this.gambitEditRec >= 0 && this.gambitDraft.length > 0) {
      this.game.setGambits(this.gambitEditRec, this.gambitDraft);
    }
    this.gambitEditRec = -1;
    this.gambitEditDraftHeroId = null;
  }

  private defaultCondition(kind: string): GambitCondition {
    switch (kind) {
      case 'self-hp-below': return { k: 'self-hp-below', pct: 40 };
      case 'ally-hp-below': return { k: 'ally-hp-below', pct: 45 };
      case 'enemy-hp-below': return { k: 'enemy-hp-below', pct: 40 };
      case 'self-mana-above': return { k: 'self-mana-above', pct: 50 };
      case 'self-mana-below': return { k: 'self-mana-below', pct: 30 };
      case 'enemies-within': return { k: 'enemies-within', radius: 600, count: 2 };
      case 'allies-alive': return { k: 'allies-alive', count: 3 };
      case 'ability-ready': return { k: 'ability-ready', slot: 3 };
      case 'fight-time-gt': return { k: 'fight-time-gt', sec: 5 };
      case 'standing-in-zone': return { k: 'standing-in-zone' };
      case 'focus-is-role': return { k: 'focus-is-role', role: 'carry' };
      case 'enemy-count-by-role': return { k: 'enemy-count-by-role', role: 'carry', count: 2 };
      case 'distance-to-focus-gt': return { k: 'distance-to-focus-gt', dist: 700 };
      case 'distance-to-focus-lt': return { k: 'distance-to-focus-lt', dist: 500 };
      case 'enemy-cast-seen': return { k: 'enemy-cast-seen', category: 'ult' };
      case 'self-disabled': return { k: 'self-disabled' };
      case 'incoming-disable': return { k: 'incoming-disable' };
      case 'tag-in-ready': return { k: 'tag-in-ready' };
      case 'combo-setup-active': return { k: 'combo-setup-active' };
      case 'combo-ready': return { k: 'combo-ready' };
      case 'save-assigned': return { k: 'save-assigned' };
      case 'in-friendly-field': return { k: 'in-friendly-field' };
      case 'enemy-in-hostile-field': return { k: 'enemy-in-hostile-field' };
      case 'in-formation': return { k: 'in-formation' };
      case 'backline-threatened': return { k: 'backline-threatened' };
      case 'enemy-clustered': return { k: 'enemy-clustered', radius: 600, count: 3 };
      case 'flank-open': return { k: 'flank-open' };
      case 'ally-channeling': return { k: 'ally-channeling' };
      case 'enemy-channeling': return { k: 'enemy-channeling' };
      default: return { k: 'always' };
    }
  }

  private defaultAction(kind: string, itemId?: string): GambitAction {
    switch (kind) {
      case 'cast': return { k: 'cast', slot: 0, targetMode: 'focus' };
      case 'use-item': return { k: 'use-item', itemId: itemId ?? '', targetMode: 'focus' };
      case 'combo-route': return { k: 'combo-route' };
      case 'focus-fire': return { k: 'focus-fire', targetMode: 'focus' };
      case 'kite': return { k: 'kite', distance: 500 };
      case 'peel': return { k: 'peel' };
      case 'spread': return { k: 'spread' };
      case 'dodge-zones': return { k: 'dodge-zones' };
      case 'retreat': return { k: 'retreat' };
      case 'hold': return { k: 'hold' };
      default: return { k: 'attack-focus' };
    }
  }

  private condParams(kind: string): { key: string; label: string }[] {
    switch (kind) {
      case 'self-hp-below': case 'ally-hp-below': case 'enemy-hp-below':
      case 'self-mana-above': case 'self-mana-below': return [{ key: 'pct', label: '%' }];
      case 'enemies-within': case 'enemy-clustered': return [{ key: 'radius', label: 'radius' }, { key: 'count', label: 'count' }];
      case 'allies-alive': return [{ key: 'count', label: 'count' }];
      case 'ability-ready': return [{ key: 'slot', label: 'slot 0-3' }];
      case 'fight-time-gt': return [{ key: 'sec', label: 'sec' }];
      case 'focus-is-role': return [{ key: 'role', label: 'role' }];
      case 'enemy-count-by-role': return [{ key: 'role', label: 'role' }, { key: 'count', label: 'count' }];
      case 'distance-to-focus-gt': case 'distance-to-focus-lt': return [{ key: 'dist', label: 'dist' }];
      case 'enemy-cast-seen': return [{ key: 'category', label: 'blink/ult/channel/any' }];
      default: return [];
    }
  }

  private gambitHeroId(): string | null {
    if (this.gambitEditDraftHeroId) return this.gambitEditDraftHeroId;
    const rec = this.game.party[this.gambitEditRec];
    return rec?.heroId ?? null;
  }

  private gambitItemIds(): string[] {
    if (this.gambitEditDraftHeroId && this.draftEdit) {
      return this.draftEdit.heroes.find((h) => h.heroId === this.gambitEditDraftHeroId)?.items?.filter((id): id is string => !!id) ?? [];
    }
    const rec = this.game.party[this.gambitEditRec];
    if (!rec) return [];
    return rec.items.map((i) => i?.id).filter((id): id is string => !!id);
  }

  private opts(values: string[], labels: Record<string, string>, selected: string): string {
    return values.map((v) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${labels[v] ?? v}</option>`).join('');
  }

  /** Condition dropdown, grouped by category (AI_OVERHAUL §2) so the list stays readable. */
  private condOpts(selected: string): string {
    return Hud.COND_GROUPS.map((g) =>
      `<optgroup label="${g.label}">${this.opts(g.kinds, Hud.COND_LABEL, selected)}</optgroup>`
    ).join('');
  }

  private renderGambitModal(): void {
    const heroId = this.gambitHeroId();
    if (!heroId || !REG.heroes.has(heroId)) {
      this.closeModal();
      return;
    }
    const def = REG.hero(heroId);
    const items = this.gambitItemIds();
    const slotOpts = [0, 1, 2, 3].map((s) => `<option value="${s}">${Hud.SLOT_LABEL[s]} (slot ${s})</option>`).join('');

    const ruleRows = this.gambitDraft.map((rule, ri) => {
      const conds = rule.if.length > 0 ? rule.if : [{ k: 'always' } as GambitCondition];
      const condChips = conds.map((c, ci) => {
        const params = this.condParams(c.k).map((p) => {
          const val = (c as unknown as Record<string, string | number>)[p.key] ?? (p.key === 'role' ? '' : 0);
          const type = p.key === 'role' || p.key === 'category' ? 'text' : 'number';
          return `<input class="ge-num" type="${type}" data-r="${ri}" data-ci="${ci}" data-field="cond-param" data-param="${p.key}" value="${val}" title="${p.label}">`;
        }).join('');
        const del = conds.length > 1 ? `<button class="ge-x" data-r="${ri}" data-ci="${ci}" data-act="cond-del" title="remove condition">×</button>` : '';
        return `<span class="ge-chip">
          <select class="ge-sel" data-r="${ri}" data-ci="${ci}" data-field="cond-kind">${this.condOpts(c.k)}</select>
          ${params}${del}</span>`;
      }).join('<span class="ge-and">AND</span>');

      const act = rule.then;
      let actExtra = '';
      if (act.k === 'cast') {
        const sel = `<select class="ge-sel" data-r="${ri}" data-field="act-slot">${slotOpts.replace(`value="${act.slot}"`, `value="${act.slot}" selected`)}</select>`;
        actExtra = `${sel}<span class="ge-at">@</span><select class="ge-sel" data-r="${ri}" data-field="act-target">${this.opts(Hud.TARGET_MODES, Hud.TARGET_LABEL, act.targetMode)}</select>`;
      } else if (act.k === 'use-item') {
        const itemOpts = items.length > 0
          ? items.map((id) => `<option value="${id}" ${id === act.itemId ? 'selected' : ''}>${REG.item(id).name}</option>`).join('')
          : '<option value="">(no items)</option>';
        actExtra = `<select class="ge-sel" data-r="${ri}" data-field="act-item">${itemOpts}</select><span class="ge-at">@</span><select class="ge-sel" data-r="${ri}" data-field="act-target">${this.opts(Hud.TARGET_MODES, Hud.TARGET_LABEL, act.targetMode)}</select>`;
      } else if (act.k === 'focus-fire') {
        actExtra = `<span class="ge-at">@</span><select class="ge-sel" data-r="${ri}" data-field="act-target">${this.opts(Hud.TARGET_MODES, Hud.TARGET_LABEL, act.targetMode ?? 'focus')}</select>`;
      } else if (act.k === 'kite') {
        actExtra = `<input class="ge-num" type="number" data-r="${ri}" data-field="act-distance" value="${act.distance ?? 500}" title="distance">`;
      }

      return `<div class="ge-rule">
        <div class="ge-rule-head"><span class="ge-rn">${ri + 1}</span>
          <div class="ge-reorder">
            <button class="ge-x" data-r="${ri}" data-act="up" ${ri === 0 ? 'disabled' : ''}>▲</button>
            <button class="ge-x" data-r="${ri}" data-act="down" ${ri === this.gambitDraft.length - 1 ? 'disabled' : ''}>▼</button>
            <button class="ge-x" data-r="${ri}" data-act="del" title="delete rule">🗑</button>
          </div>
        </div>
        <div class="ge-if"><span class="ge-kw">IF</span> ${condChips} <button class="btn tiny" data-r="${ri}" data-act="cond-add">+ AND</button></div>
        <div class="ge-then"><span class="ge-kw">THEN</span>
          <select class="ge-sel" data-r="${ri}" data-field="act-kind">${this.opts(Hud.ACT_KINDS, Hud.ACT_LABEL, act.k)}</select>
          ${actExtra}
        </div>
      </div>`;
    }).join('');

    const full = this.gambitDraft.length >= 8;
    this.modalShell(
      `Gambits — ${def.name}`,
      `<div class="gambit-editor">
        <p class="dim">Rules run top to bottom; the first whose conditions all match fires. Up to 8 rules.</p>
        <div class="ge-presets">Templates:
          <button class="btn tiny" data-preset="default">Default</button>
          <button class="btn tiny" data-preset="aggro">Aggro</button>
          <button class="btn tiny" data-preset="safe">Safe</button>
        </div>
        <div class="ge-rules">${ruleRows || '<p class="dim">No rules. Add one below.</p>'}</div>
        <div class="ge-foot">
          <button class="btn" data-act="add-rule" ${full ? 'disabled' : ''}>+ Add rule (${this.gambitDraft.length}/8)</button>
          <button class="btn accent" data-act="done">Done</button>
        </div>
      </div>`
    );
    this.wireGambitEditor();
  }

  private wireGambitEditor(): void {
    const draft = this.gambitDraft;
    const rerender = () => this.renderGambitModal();
    const ruleAt = (el: HTMLElement) => draft[Number(el.dataset.r)];

    this.modal.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
      el.addEventListener('change', () => {
        const rule = ruleAt(el);
        if (!rule) return;
        const field = el.dataset.field!;
        const value = (el as HTMLInputElement | HTMLSelectElement).value;
        if (field === 'cond-kind') {
          rule.if[Number(el.dataset.ci)] = this.defaultCondition(value);
        } else if (field === 'cond-param') {
          const cond = rule.if[Number(el.dataset.ci)];
          if (cond) {
            const param = el.dataset.param!;
            const textParam = param === 'role' || param === 'category';
            (cond as unknown as Record<string, string | number>)[param] = textParam ? value : Number(value);
          }
        } else if (field === 'act-kind') {
          rule.then = this.defaultAction(value, this.gambitItemIds()[0]);
        } else if (field === 'act-slot' && rule.then.k === 'cast') {
          rule.then.slot = Number(value);
        } else if (field === 'act-target' && (rule.then.k === 'cast' || rule.then.k === 'use-item' || rule.then.k === 'focus-fire')) {
          rule.then.targetMode = value as GambitTargetMode;
        } else if (field === 'act-item' && rule.then.k === 'use-item') {
          rule.then.itemId = value;
        } else if (field === 'act-distance' && rule.then.k === 'kite') {
          rule.then.distance = Number(value);
        }
        rerender();
      });
    });

    this.modal.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
      el.addEventListener('click', () => {
        const act = el.dataset.act!;
        if (act === 'add-rule') {
          if (draft.length < 8) draft.push({ if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'attack-focus' } });
        } else if (act === 'done') {
          this.commitGambit();
          if (this.gambitReturnTo === 'prefight' && this.prefightGymId) this.openGymPrefight(this.prefightGymId);
          else if (this.gambitReturnTo === 'draft') {
            this.modalKind = 'draft';
            this.game.paused = true;
            this.renderDraftModal();
          }
          else this.toggleModal('party');
          return;
        } else {
          const rule = ruleAt(el);
          const ri = Number(el.dataset.r);
          if (!rule) return;
          if (act === 'up' && ri > 0) [draft[ri - 1], draft[ri]] = [draft[ri], draft[ri - 1]];
          else if (act === 'down' && ri < draft.length - 1) [draft[ri + 1], draft[ri]] = [draft[ri], draft[ri + 1]];
          else if (act === 'del') draft.splice(ri, 1);
          else if (act === 'cond-add') rule.if.push({ k: 'ability-ready', slot: 0 });
          else if (act === 'cond-del') {
            rule.if.splice(Number(el.dataset.ci), 1);
            if (rule.if.length === 0) rule.if.push({ k: 'always' });
          }
        }
        rerender();
      });
    });

    this.modal.querySelectorAll<HTMLElement>('[data-preset]').forEach((el) => {
      el.addEventListener('click', () => {
        const preset = el.dataset.preset!;
        const heroId = this.gambitHeroId();
        if (!heroId) return;
        const def = REG.hero(heroId);
        this.gambitDraft = preset === 'default' ? buildDefaultGambit(def.roles) : this.gambitPreset(preset as 'aggro' | 'safe', def.roles);
        this.renderGambitModal();
      });
    });
  }

  // --- gym pre-fight screen (§3.5) ---

  openDungeonEntry(dungeonId: string): void {
    this.dungeonEntryId = dungeonId;
    this.playUi(this.modalKind === 'none' ? 'open' : 'tab');
    this.modalKind = 'dungeon-entry';
    this.input.uiModalOpen = true;
    this.modal.classList.remove('hidden');
    this.game.paused = true;
    this.renderDungeonEntryModal();
  }

  /** Talk to a walking quest giver: open the Journal focused on its board. */
  openQuestGiver(giverId: string): void {
    this.questGiverFocus = giverId;
    if (this.modalKind !== 'journal') {
      this.playUi(this.modalKind === 'none' ? 'open' : 'tab');
      this.modalKind = 'journal';
      this.input.uiModalOpen = true;
      this.modal.classList.remove('hidden');
    }
    this.renderJournalModal();
  }

  private renderDungeonEntryModal(): void {
    const dungeonId = this.dungeonEntryId!;
    const { def, tiers, modifiers, progress, lockReason } = this.game.dungeonEntryOptions(dungeonId);
    const tierButtons = (['normal', 'nightmare', 'hell'] as const)
      .map((tier) => `<label class="svc-row"><span class="svc-main"><b>${tier[0].toUpperCase()}${tier.slice(1)}</b></span><span class="svc-actions"><input type="radio" name="dungeon-tier" value="${tier}" ${tier === 'normal' ? 'checked' : ''} ${tiers.includes(tier) ? '' : 'disabled'}></span></label>`)
      .join('');
    const modRows = modifiers.length === 0
      ? '<p class="dim">No modifiers are available for this dungeon yet.</p>'
      : modifiers.map((mod) => `<label class="svc-row">
          <span class="svc-main"><b>${mod.name}</b><div class="rr-sub">${mod.description}</div></span>
          <span class="svc-actions"><input type="checkbox" data-dungeon-mod="${mod.id}"></span>
        </label>`).join('');
    const bestEndless = progress?.bestEndlessLevel;
    const nextEndless = (bestEndless ?? -1) + 1;
    const progressText = progress
      ? `Clears ${progress.clears} · wipes ${progress.wipes} · best depth ${progress.bestDepth} · best tier ${progress.bestTier}${bestEndless !== undefined ? ` · endless L${bestEndless + 1}` : ''}`
      : 'No clears recorded yet.';
    const lockHtml = lockReason ? `<section><h3>Locked</h3><p class="bad">${esc(lockReason)}</p></section>` : '';
    const disabled = lockReason ? 'disabled' : '';

    this.modalShell(
      `${def.name} — Entry`,
      `<div class="services">
        ${lockHtml}
        <section><h3>Tier</h3>${tierButtons}</section>
        <section><h3>Map Modifiers</h3>${modRows}</section>
        <section><h3>Progress</h3><p class="rr-sub">${progressText}</p></section>
        <div class="pf-foot">
          <button class="btn accent big" data-dungeon-start="1" ${disabled}>Open Descent</button>
          <button class="btn big" data-dungeon-endless="1" ${disabled}>Endless L${nextEndless + 1}</button>
          <button class="btn" data-dungeon-daily="1" ${disabled}>Daily</button>
          <button class="btn" data-dungeon-weekly="1" ${disabled}>Weekly</button>
          <button class="btn" data-dungeon-cancel="1">Back</button>
        </div>
      </div>`
    );
    const readTierMods = (): { tier: DifficultyTier; selected: string[] } => ({
      tier: (this.modal.querySelector<HTMLInputElement>('input[name="dungeon-tier"]:checked')?.value ?? 'normal') as DifficultyTier,
      selected: [...this.modal.querySelectorAll<HTMLInputElement>('[data-dungeon-mod]:checked')].map((el) => el.dataset.dungeonMod!).filter(Boolean)
    });
    this.modal.querySelector<HTMLElement>('[data-dungeon-cancel]')?.addEventListener('click', () => this.closeModal());
    this.modal.querySelector<HTMLElement>('[data-dungeon-start]')?.addEventListener('click', () => {
      const { tier, selected } = readTierMods();
      this.closeModal();
      this.game.startDungeon(dungeonId, tier, { modifiers: selected });
    });
    this.modal.querySelector<HTMLElement>('[data-dungeon-endless]')?.addEventListener('click', () => {
      const { tier, selected } = readTierMods();
      this.closeModal();
      this.game.startDungeon(dungeonId, tier, { modifiers: selected, endless: true, endlessLevel: nextEndless });
    });
    this.modal.querySelector<HTMLElement>('[data-dungeon-daily]')?.addEventListener('click', () => {
      const { tier, selected } = readTierMods();
      this.closeModal();
      this.game.startDungeon(dungeonId, tier, { modifiers: selected, seedMode: 'daily' });
    });
    this.modal.querySelector<HTMLElement>('[data-dungeon-weekly]')?.addEventListener('click', () => {
      const { tier, selected } = readTierMods();
      this.closeModal();
      this.game.startDungeon(dungeonId, tier, { modifiers: selected, seedMode: 'weekly' });
    });
  }

  openGymPrefight(gymId: string): void {
    this.prefightGymId = gymId;
    this.playUi(this.modalKind === 'none' ? 'open' : 'tab');
    this.modalKind = 'prefight';
    this.input.uiModalOpen = true;
    this.modal.classList.remove('hidden');
    this.game.paused = true;
    this.renderPrefightModal();
  }

  private renderPrefightModal(): void {
    const g = this.game;
    const gym = REG.gym(this.prefightGymId!);
    const enemyCalls = TUNING.captainCallsPerFight + (gym.enemyBonusCaptainCalls ?? 0);
    const draft = g.gymDraft(this.prefightGymId!);
    const roster = draft && draft.heroes.length >= 5
      ? draft.heroes.slice(0, 5).map((hero) => {
      const def = REG.hero(hero.heroId);
      const label = hero.gambits && hero.gambits.length > 0 ? `${hero.gambits.length} drafted rules` : 'default role gambit';
      const itemBits = (hero.items ?? []).map((id) => REG.items.has(id) ? REG.item(id).name : null).filter(Boolean).join(', ') || 'no items';
      return `<div class="pf-hero">
        <img src="${heroPortrait(def.palette, def.name[0], 40, def.silhouette)}" alt="">
        <div class="pf-main"><b>${def.name}</b> <em>Lv ${hero.level ?? 1}</em>
          <div class="rr-sub">${def.roles.join(' / ')} · ${itemBits}</div>
          <div class="rr-sub">Gambit: ${label} <button class="btn tiny accent" data-pf-edit-draft="${hero.heroId}">Edit draft rules</button></div>
        </div>
      </div>`;
    }).join('')
      : g.party.slice(0, 5).map((rec, i) => {
      const def = REG.hero(rec.heroId);
      const label = rec.gambits.length > 0 ? `${rec.gambits.length} authored rules` : 'default role gambit';
      const itemBits = rec.items.map((it) => it ? REG.item(it.id).name : null).filter(Boolean).join(', ') || 'no items';
      return `<div class="pf-hero">
        <img src="${heroPortrait(def.palette, def.name[0], 40, def.silhouette)}" alt="">
        <div class="pf-main"><b>${def.name}</b> <em>Lv ${rec.unit ? rec.unit.level : rec.level}</em>
          <div class="rr-sub">${def.roles.join(' / ')} · ${itemBits}</div>
          <div class="rr-sub">Gambit: ${label} <button class="btn tiny accent" data-pf-edit="${i}">Edit rules</button></div>
        </div>
      </div>`;
    }).join('');
    const enemy = gym.enemyTeam.map((h) => `${REG.hero(h.heroId).name} <em>Lv ${h.level ?? 10}</em>`).join(' · ');
    const draftLine = draft
      ? `<p class="pf-draft">Drafted five: <b>${draft.heroes.map((h) => REG.hero(h.heroId).name).join(', ')}</b>, placed on the board.</p>`
      : `<p class="pf-draft dim">No draft — you bring your walking party on the default formation.</p>`;
    // Format pressure (§5): what this leader demands of your composition.
    const fmt = gym.format;
    const fmtBits = fmt ? [
      ...fmt.rules.map((r) => describeRule(r)),
      ...(fmt.counterDraft && fmt.counterDraft !== 'none' ? [`counter-draft: ${fmt.counterDraft}`] : [])
    ] : [];
    const formatLine = fmtBits.length
      ? `<p class="pf-format"><b>Format:</b> ${fmtBits.map((b) => `<span class="pf-tag">${esc(b)}</span>`).join(' ')}</p>`
      : '';

    this.modalShell(
      `${gym.name} — ${gym.leader}`,
      `<div class="prefight">
        <p class="pf-theme">${gym.theme}</p>
        <p class="dim">Best of ${gym.bestOf}. You hold <b>${TUNING.captainCallsPerFight} Captain Calls</b>; ${gym.leader}'s side gets <b>${enemyCalls}</b>. In live fights, select a hero with 1–5 or a click, then spend a call (Space or the button) to fully control them for ${TUNING.captainCallSec}s.</p>
        <h3>Your five</h3>
        <div class="pf-roster">${roster}</div>
        ${draftLine}
        ${formatLine}
        <h3>Opposition</h3>
        <p class="pf-enemy">${enemy}</p>
        <div class="pf-foot">
          <button class="btn accent big" data-pf="live">Fight Live</button>
          <button class="btn" data-pf="auto">Auto-Resolve</button>
          <button class="btn" data-pf="draft">Draft &amp; Deploy</button>
          <button class="btn" data-pf="cancel">Back</button>
        </div>
      </div>`
    );
    this.modal.querySelectorAll<HTMLElement>('[data-pf-edit]').forEach((el) => {
      el.addEventListener('click', () => this.openGambitEditor(Number(el.dataset.pfEdit), 'prefight'));
    });
    this.modal.querySelectorAll<HTMLElement>('[data-pf-edit-draft]').forEach((el) => {
      el.addEventListener('click', () => {
        const saved = this.game.gymDraft(this.prefightGymId!);
        if (!saved) return;
        this.draftEdit = structuredClone(saved);
        this.draftGymId = this.prefightGymId;
        this.openDraftGambitEditor(el.dataset.pfEditDraft!, 'prefight');
      });
    });
    this.modal.querySelectorAll<HTMLElement>('[data-pf]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = el.dataset.pf;
        const gymId = this.prefightGymId!;
        if (action === 'live') {
          this.closeModal();
          this.game.startLiveGym(gymId);
        } else if (action === 'auto') {
          this.closeModal();
          this.game.challengeGym(gymId);
        } else if (action === 'draft') {
          this.openDraftEditor(gymId);
        } else {
          this.closeModal();
        }
      });
    });
  }

  // --- draft + board editor (AUTOBATTLER_OVERHAUL §3/§7) ---

  private openDraftEditor(gymId: string): void {
    this.draftGymId = gymId;
    this.draftEdit = this.game.defaultGymDraft(gymId);
    this.draftPick = null;
    this.playUi('tab');
    this.modalKind = 'draft';
    this.input.uiModalOpen = true;
    this.modal.classList.remove('hidden');
    this.game.paused = true;
    this.renderDraftModal();
  }

  // --- Elite Five pick/ban screen (AUTOBATTLER_OVERHAUL §4.2/§7) ---

  private openEliteDraft(): void {
    this.playUi('tab');
    this.modalKind = 'elite-draft';
    this.input.uiModalOpen = true;
    this.modal.classList.remove('hidden');
    this.game.paused = true;
    this.renderEliteDraftModal();
  }

  private renderEliteDraftModal(): void {
    const g = this.game;
    const s = g.eliteDraft;
    if (!s) { this.closeModal(); return; }
    const turn = g.eliteDraftTurn()!;
    const yourTurn = !turn.done && turn.side === 0;

    // the ban/pick order as a strip, current step highlighted
    const steps = s.order.map((act, i) => {
      const side = i % 2 === 0 ? 'you' : 'foe';
      const state = i < s.step ? 'done' : i === s.step ? 'now' : 'todo';
      return `<i class="ed-step ${act} ${side} ${state}" title="${side === 'you' ? 'You' : s.memberName}: ${act}">${act === 'ban' ? '⊘' : '●'}</i>`;
    }).join('');

    const teamRow = (heroes: typeof s.player, n: number): string =>
      Array.from({ length: n }, (_, i) => {
        const h = heroes[i];
        if (!h) return '<div class="ed-slot empty"></div>';
        const def = REG.hero(h.heroId);
        return `<div class="ed-slot"><img src="${heroPortrait(def.palette, def.name[0], 40, def.silhouette)}" alt=""><span>${esc(def.name)}</span></div>`;
      }).join('');

    // the pool the player acts on this turn: their roster to pick, the leader's pool to ban
    const taken = new Set([...s.bans, ...s.player.map((h) => h.heroId), ...s.enemy.map((h) => h.heroId)]);
    const actPool = yourTurn ? (turn.action === 'ban' ? s.enemyPool : s.playerPool) : [];
    const poolChips = [...new Set(actPool)].filter((id) => REG.heroes.has(id)).sort().map((id) => {
      const def = REG.hero(id);
      const gone = taken.has(id);
      return `<button class="ed-chip ${gone ? 'gone' : ''} ${turn.action}" data-ed-pick="${id}" ${gone ? 'disabled' : ''}>
        <img src="${heroPortrait(def.palette, def.name[0], 34, def.silhouette)}" alt=""><span>${esc(def.name)}</span>
        <em>${def.roles.slice(0, 2).join('/')}</em>
      </button>`;
    }).join('');

    const banChips = s.bans.length
      ? s.bans.map((id) => `<span class="ed-ban">⊘ ${esc(REG.hero(id).name)}</span>`).join('')
      : '<span class="dim">none yet</span>';

    const prompt = turn.done
      ? '<b>Draft complete.</b> Lock it in and fight.'
      : yourTurn
        ? `<b>Your ${turn.action === 'ban' ? 'ban' : 'pick'}.</b> ${turn.action === 'ban' ? `Deny one of ${esc(s.memberName)}'s pool.` : 'Pick from your recruited roster.'}`
        : `<span class="dim">${esc(s.memberName)} is ${turn.action === 'ban' ? 'banning' : 'picking'}…</span>`;

    this.modalShell(
      `Elite Five — draft vs. ${esc(s.memberName)}`,
      `<div class="elite-draft">
        <div class="ed-order">${steps}</div>
        <div class="ed-teams">
          <div class="ed-team you"><h4>Your five (${s.player.length}/5)</h4><div class="ed-row">${teamRow(s.player, 5)}</div></div>
          <div class="ed-team foe"><h4>${esc(s.memberName)} (${s.enemy.length}/5)</h4><div class="ed-row">${teamRow(s.enemy, 5)}</div></div>
        </div>
        <div class="ed-bans">Bans: ${banChips}</div>
        <p class="ed-prompt">${prompt}</p>
        <div class="ed-pool">${poolChips}</div>
        <div class="pf-foot">
          <button class="btn accent" data-ed="commit" ${turn.done ? '' : 'disabled'}>Lock in &amp; fight</button>
          <button class="btn" data-ed="cancel">Cancel</button>
        </div>
      </div>`
    );

    this.modal.querySelectorAll<HTMLElement>('[data-ed-pick]').forEach((el) => el.addEventListener('click', () => {
      if (g.eliteDraftChoose(el.dataset.edPick!)) this.renderEliteDraftModal();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-ed]').forEach((el) => el.addEventListener('click', () => {
      if (el.dataset.ed === 'commit') {
        g.commitEliteDraft();
        this.closeModal();
      } else {
        this.closeModal();
      }
    }));
  }

  private draftCellHero(col: number, row: number): string | null {
    const places = this.draftEdit!.formation.placements;
    for (const [id, s] of Object.entries(places)) if (s.col === col && s.row === row) return id;
    return null;
  }

  private draftFreeCell(preferCol: number): { col: 0 | 1 | 2; row: number } {
    const cols = [preferCol, 1, 0, 2].filter((c, i, a) => a.indexOf(c) === i);
    for (const c of cols) for (let r = 0; r < BOARD_ROWS; r++) {
      if (!this.draftCellHero(c, r)) return { col: c as 0 | 1 | 2, row: r };
    }
    return { col: 0, row: 0 };
  }

  /** Place / swap the held hero onto a cell, or pick up the hero already there. */
  private draftPlaceAt(col: number, row: number): void {
    const d = this.draftEdit!;
    const occupant = this.draftCellHero(col, row);
    if (this.draftPick) {
      const moving = this.draftPick;
      const from = d.formation.placements[moving];
      if (occupant && occupant !== moving) {
        if (from) d.formation.placements[occupant] = { ...from }; // swap
        else delete d.formation.placements[occupant];             // bump to the bench strip
      }
      d.formation.placements[moving] = { col: col as 0 | 1 | 2, row };
      this.draftPick = null;
    } else if (occupant) {
      this.draftPick = occupant; // pick up
    }
    this.renderDraftModal();
  }

  /** Toggle a pool hero: select if fielded, else field it (≤5) on a hinted free cell. */
  private draftTogglePool(heroId: string): void {
    const d = this.draftEdit!;
    const fielded = d.heroes.some((h) => h.heroId === heroId);
    if (fielded) {
      this.draftPick = this.draftPick === heroId ? null : heroId;
    } else if (d.heroes.length < BOARD_ROWS) {
      d.heroes.push(this.game.draftHeroSetup(heroId));
      const hint = placementHint(REG.hero(heroId));
      d.formation.placements[heroId] = this.draftFreeCell(hint.col);
      this.draftPick = heroId;
    }
    this.renderDraftModal();
  }

  private draftRemoveHero(heroId: string): void {
    const d = this.draftEdit!;
    d.heroes = d.heroes.filter((h) => h.heroId !== heroId);
    delete d.formation.placements[heroId];
    if (this.draftPick === heroId) this.draftPick = null;
    this.renderDraftModal();
  }

  private static readonly REACH_TAG_LABEL: Record<string, string> = {
    'teamfight-ult': 'Teamfight ult', 'cluster-nuke': 'Cluster nuke', 'channel': 'Channel',
    'skillshot-line': 'Skillshot', 'single-lockdown': 'Lockdown', 'zone-field': 'Zone',
    'team-buff': 'Team buff', 'self-steroid': 'Self steroid'
  };

  /** §7 reach readout content for the hovered (or held) hero. */
  private draftReachHtml(): string {
    const id = this.draftHoverId && REG.heroes.has(this.draftHoverId) ? this.draftHoverId : this.draftPick;
    if (!id || !REG.heroes.has(id)) return '<div class="bd-reach empty">Hover a hero to see its reach and footprint.</div>';
    const def = REG.hero(id);
    const rp = reachProfile(def);
    const tagBits = rp.tags.length
      ? rp.tags.map((t) => `<span class="bd-tag">${esc(Hud.REACH_TAG_LABEL[t] ?? t)}</span>`).join('')
      : '<span class="dim">right-click bruiser</span>';
    return `<div class="bd-reach">
      <div class="bd-reach-h"><img src="${heroPortrait(def.palette, def.name[0], 26, def.silhouette)}" alt=""><b>${esc(def.name)}</b></div>
      <div class="bd-reach-stats"><span>Reach <em>${rp.reach}</em></span><span>AoE <em>${rp.footprint || '—'}</em></span></div>
      <div class="bd-reach-tags">${tagBits}</div>
    </div>`;
  }

  /** Update only the reach slot on hover, so dragging and selection state survive. */
  private refreshDraftReach(): void {
    const slot = this.modal.querySelector<HTMLElement>('#bd-reach-slot');
    if (slot) slot.innerHTML = this.draftReachHtml();
  }

  /** Drag-and-drop (§7): drop a dragged hero onto a cell — fielding it if needed, swapping occupants. */
  private draftDropCell(col: number, row: number): void {
    const id = this.draftDragId;
    if (!id) return;
    const d = this.draftEdit!;
    if (!d.heroes.some((h) => h.heroId === id)) {
      if (d.heroes.length >= BOARD_ROWS) { this.draftDragId = null; return; }
      d.heroes.push(this.game.draftHeroSetup(id));
    }
    const occupant = this.draftCellHero(col, row);
    const from = d.formation.placements[id];
    if (occupant && occupant !== id) {
      if (from) d.formation.placements[occupant] = { ...from };
      else delete d.formation.placements[occupant];
    }
    d.formation.placements[id] = { col: col as 0 | 1 | 2, row };
    this.draftPick = null;
    this.draftDragId = null;
    this.renderDraftModal();
  }

  /** Drag-and-drop: drop onto the bench strip — field if needed, then unseat from any cell. */
  private draftDropBench(): void {
    const id = this.draftDragId;
    if (!id) return;
    const d = this.draftEdit!;
    if (!d.heroes.some((h) => h.heroId === id)) {
      if (d.heroes.length >= BOARD_ROWS) { this.draftDragId = null; return; }
      d.heroes.push(this.game.draftHeroSetup(id));
    }
    delete d.formation.placements[id];
    this.draftPick = null;
    this.draftDragId = null;
    this.renderDraftModal();
  }

  private draftStampDoctrine(id: DoctrineId): void {
    const d = this.draftEdit!;
    const defs = d.heroes.map((h) => REG.hero(h.heroId));
    d.formation = doctrineFormation(id, defs);
    this.draftPick = null;
    this.renderDraftModal();
  }

  private draftResetToParty(): void {
    const heroes: MacroHeroSetup[] = this.game.gymPlayerTeam().map((h) => ({ heroId: h.heroId, level: h.level, items: h.items, gambits: h.gambits }));
    this.draftEdit = { heroes, formation: defaultFormation(heroes.map((h) => REG.hero(h.heroId))) };
    this.draftPick = null;
    this.renderDraftModal();
  }

  private draftItemChoices(current: readonly string[] = []): string[] {
    const ids = new Set<string>(current.filter((id) => REG.items.has(id)));
    const armory = this.game.armoryView();
    for (const item of armory.stash) if (REG.items.has(item.id)) ids.add(item.id);
    for (const hero of armory.heroes) {
      for (const item of hero.items) if (item && REG.items.has(item.id)) ids.add(item.id);
    }
    return [...ids].sort((a, b) => REG.item(a).cost - REG.item(b).cost || REG.item(a).name.localeCompare(REG.item(b).name));
  }

  private draftSetItem(heroId: string, slot: number, itemId: string): void {
    const hero = this.draftEdit?.heroes.find((h) => h.heroId === heroId);
    if (!hero || slot < 0 || slot >= 6) return;
    const items = [...(hero.items ?? [])].slice(0, 6);
    while (items.length <= slot) items.push('');
    items[slot] = itemId;
    hero.items = items.filter((id) => id && REG.items.has(id));
    this.renderDraftModal();
  }

  private draftApplyGambitPreset(heroId: string, preset: 'default' | 'aggro' | 'safe'): void {
    const hero = this.draftEdit?.heroes.find((h) => h.heroId === heroId);
    if (!hero) return;
    const def = REG.hero(heroId);
    hero.gambits = preset === 'default' ? buildDefaultGambit(def.roles) : this.gambitPreset(preset, def.roles);
    this.renderDraftModal();
  }

  private draftLoadoutsHtml(): string {
    const d = this.draftEdit!;
    if (d.heroes.length === 0) return '<p class="dim">Field heroes to edit their draft-only items and gambits.</p>';
    return d.heroes.map((hero) => {
      const def = REG.hero(hero.heroId);
      const items = (hero.items ?? []).slice(0, 6);
      const choices = this.draftItemChoices(items);
      const slotHtml = Array.from({ length: 6 }, (_, slot) => {
        const selected = items[slot] ?? '';
        const opts = [
          `<option value="" ${selected ? '' : 'selected'}>empty</option>`,
          ...choices.map((id) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(REG.item(id).name)}</option>`)
        ].join('');
        return `<select class="bd-item-slot" data-draft-item="${hero.heroId}:${slot}" title="Draft item ${slot + 1}">${opts}</select>`;
      }).join('');
      const gambitLabel = hero.gambits && hero.gambits.length > 0 ? `${hero.gambits.length} rules` : 'default role gambit';
      return `<div class="bd-loadout">
        <div class="bd-loadout-head"><img src="${heroPortrait(def.palette, def.name[0], 28, def.silhouette)}" alt=""><b>${esc(def.name)}</b><em>Lv ${hero.level ?? 1}</em></div>
        <div class="bd-items">${slotHtml}</div>
        <div class="bd-gambits">Gambit: ${esc(gambitLabel)}
          <button class="btn tiny" data-draft-gambit-preset="${hero.heroId}:default">Default</button>
          <button class="btn tiny" data-draft-gambit-preset="${hero.heroId}:aggro">Aggro</button>
          <button class="btn tiny" data-draft-gambit-preset="${hero.heroId}:safe">Safe</button>
          <button class="btn tiny accent" data-draft-gambit-edit="${hero.heroId}">Edit rules</button>
        </div>
      </div>`;
    }).join('');
  }

  private renderDraftModal(): void {
    const d = this.draftEdit!;
    const gym = REG.gym(this.draftGymId!);
    const fieldedIds = new Set(d.heroes.map((h) => h.heroId));
    const pickDef = this.draftPick ? REG.hero(this.draftPick) : null;
    const hintCol = pickDef ? placementHint(pickDef).col : -1;

    // 3 columns × 5 rows; render Back→Front left to right. The Front column carries a
    // faint "enemy contact" overlay (§7) — the edge the opposing front collapses onto.
    const colName = ['Back', 'Mid', 'Front'];
    let grid = '';
    for (let col = 0; col < BOARD_COLS; col++) {
      let cells = '';
      for (let row = 0; row < BOARD_ROWS; row++) {
        const id = this.draftCellHero(col, row);
        const def = id ? REG.hero(id) : null;
        const held = id && id === this.draftPick ? 'held' : '';
        const hinted = col === hintCol ? 'hinted' : '';
        const drag = def ? `draggable="true" data-drag="${id}"` : '';
        cells += `<button class="bd-cell ${held} ${hinted}" data-cell="${col}:${row}" ${drag} title="${colName[col]} · row ${row + 1}">
          ${def ? `<img src="${heroPortrait(def.palette, def.name[0], 40, def.silhouette)}" alt=""><span>${esc(def.name)}</span>` : ''}
        </button>`;
      }
      const front = col === BOARD_COLS - 1 ? ' front-contact' : '';
      const contact = col === BOARD_COLS - 1 ? '<div class="bd-contact">⚔ enemy contact</div>' : '';
      grid += `<div class="bd-col${front}"><div class="bd-col-h">${colName[col]}</div>${cells}${contact}</div>`;
    }

    // bench strip: fielded heroes without a cell
    const bench = d.heroes.filter((h) => !d.formation.placements[h.heroId]).map((h) => {
      const def = REG.hero(h.heroId);
      const sel = this.draftPick === h.heroId ? 'sel' : '';
      return `<button class="bd-chip ${sel}" data-bench="${h.heroId}" draggable="true" data-drag="${h.heroId}"><img src="${heroPortrait(def.palette, def.name[0], 32, def.silhouette)}" alt="">${esc(def.name)}</button>`;
    }).join('') || '<span class="dim">all placed</span>';

    // recruited pool
    const pool = this.game.draftPool().map((id) => {
      const def = REG.hero(id);
      const on = fieldedIds.has(id) ? 'on' : '';
      const sel = this.draftPick === id ? 'sel' : '';
      return `<button class="bd-pool ${on} ${sel}" data-pool="${id}" draggable="true" data-drag="${id}">
        <img src="${heroPortrait(def.palette, def.name[0], 36, def.silhouette)}" alt="">
        <span>${esc(def.name)}</span>
        ${fieldedIds.has(id) ? `<i class="bd-x" data-remove="${id}">✕</i>` : ''}
      </button>`;
    }).join('');

    // archetype placement hints for the fielded five
    const hints = d.heroes.map((h) => {
      const def = REG.hero(h.heroId);
      const hint = placementHint(def);
      return `<div class="bd-hint"><img src="${heroPortrait(def.palette, def.name[0], 24, def.silhouette)}" alt=""><b>${esc(def.name)}</b><em>${['Back', 'Mid', 'Front'][hint.col]}</em><span>${esc(hint.reason)}</span></div>`;
    }).join('');

    const doctrines = DOCTRINES.map((doc) =>
      `<button class="btn tiny" data-doctrine="${doc.id}" title="${esc(doc.describe)}">${esc(doc.name)}</button>`
    ).join('');


    // Composition format (§5): live constraints the player must satisfy to commit.
    const validation = validateDraft(gym.format, d.heroes);
    const counterNote = gym.format?.counterDraft && gym.format.counterDraft !== 'none'
      ? `<div class="bd-counter">⚠ ${esc(gym.leader)} counter-drafts (<b>${gym.format.counterDraft}</b>) — she answers what you commit.</div>`
      : '';
    const formatPanel = (gym.format && (gym.format.rules.length || counterNote))
      ? `<h3>Format · ${esc(gym.leaderTitle)}</h3>
         <div class="bd-format">
           ${validation.statuses.map((s) => `<div class="bd-rule ${s.ok ? 'ok' : 'bad'}"><span>${esc(s.label)}</span><em>${esc(s.detail)}</em></div>`).join('')}
           ${counterNote}
         </div>`
      : '';

    const placed = d.heroes.length === BOARD_ROWS && d.heroes.every((h) => d.formation.placements[h.heroId]);
    const ready = placed && validation.ok;
    const commitHint = !validation.ok && d.heroes.length >= BOARD_ROWS
      ? `<div class="bd-illegal">Illegal under ${esc(gym.name)}'s format — fix the flagged rules to commit.</div>`
      : '';

    this.modalShell(
      `Draft &amp; Deploy — ${gym.name}`,
      `<div class="draft">
        <p class="dim">Build a five from your recruited roster and place them on the board. Front bodies soak the engage; AoE casters want the middle; channels and skillshots want a protected back edge. ${this.draftPick ? `<b>Holding ${esc(REG.hero(this.draftPick).name)} — click a cell.</b>` : 'Drag a hero onto a cell, or click a hero then a cell.'}</p>
        <div class="draft-main">
          <div class="bd-board">${grid}</div>
          <div class="draft-side">
            ${formatPanel}
            <h3>Reach &amp; footprint</h3>
            <div id="bd-reach-slot">${this.draftReachHtml()}</div>
            <h3>Placement hints</h3>
            <div class="bd-hints">${hints}</div>
            <h3>Doctrines</h3>
            <div class="bd-doctrines">${doctrines}</div>
          </div>
        </div>
        <h3>To place</h3>
        <div class="bd-bench">${bench}</div>
        <h3>Draft loadouts</h3>
        <div class="bd-loadouts">${this.draftLoadoutsHtml()}</div>
        <h3>Recruited (${d.heroes.length}/5 fielded)</h3>
        <div class="bd-poolwrap">${pool}</div>
        ${commitHint}
        <div class="pf-foot">
          <button class="btn accent" data-draft="commit" ${ready ? '' : 'disabled'}>Commit draft</button>
          <button class="btn" data-draft="reset">Reset to party</button>
          <button class="btn" data-draft="clear">Clear draft</button>
          <button class="btn" data-draft="back">Back</button>
        </div>
      </div>`
    );

    this.modal.querySelectorAll<HTMLElement>('[data-cell]').forEach((el) => {
      el.addEventListener('click', () => {
        const [c, r] = el.dataset.cell!.split(':').map(Number);
        this.draftPlaceAt(c, r);
      });
      el.addEventListener('dragover', (e) => e.preventDefault());
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const [c, r] = el.dataset.cell!.split(':').map(Number);
        this.draftDropCell(c, r);
      });
    });
    this.modal.querySelectorAll<HTMLElement>('[data-bench]').forEach((el) => el.addEventListener('click', () => {
      this.draftPick = this.draftPick === el.dataset.bench ? null : el.dataset.bench!;
      this.renderDraftModal();
    }));
    // drag-and-drop (§7): any [data-drag] hero can be dragged onto a cell or the bench strip
    this.modal.querySelectorAll<HTMLElement>('[data-drag]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        this.draftDragId = el.dataset.drag!;
        (e as DragEvent).dataTransfer?.setData('text/plain', el.dataset.drag!);
      });
      el.addEventListener('dragend', () => { this.draftDragId = null; });
    });
    const benchZone = this.modal.querySelector<HTMLElement>('.bd-bench');
    benchZone?.addEventListener('dragover', (e) => e.preventDefault());
    benchZone?.addEventListener('drop', (e) => { e.preventDefault(); this.draftDropBench(); });
    // §7 reach readout: hovering any hero (cell / bench / pool) shows its reach + footprint
    this.modal.querySelectorAll<HTMLElement>('[data-drag]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        const id = el.dataset.drag!;
        if (this.draftHoverId !== id) { this.draftHoverId = id; this.refreshDraftReach(); }
      });
    });
    this.modal.querySelectorAll<HTMLElement>('[data-pool]').forEach((el) => el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).dataset.remove) return; // handled below
      this.draftTogglePool(el.dataset.pool!);
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-remove]').forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.draftRemoveHero(el.dataset.remove!);
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-doctrine]').forEach((el) => el.addEventListener('click', () => this.draftStampDoctrine(el.dataset.doctrine as DoctrineId)));
    this.modal.querySelectorAll<HTMLSelectElement>('[data-draft-item]').forEach((el) => el.addEventListener('change', () => {
      const [heroId, slotRaw] = el.dataset.draftItem!.split(':');
      this.draftSetItem(heroId, Number(slotRaw), el.value);
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-draft-gambit-preset]').forEach((el) => el.addEventListener('click', () => {
      const [heroId, preset] = el.dataset.draftGambitPreset!.split(':');
      this.draftApplyGambitPreset(heroId, preset as 'default' | 'aggro' | 'safe');
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-draft-gambit-edit]').forEach((el) => el.addEventListener('click', () => this.openDraftGambitEditor(el.dataset.draftGambitEdit!, 'draft')));
    this.modal.querySelectorAll<HTMLElement>('[data-draft]').forEach((el) => el.addEventListener('click', () => {
      const act = el.dataset.draft;
      const gymId = this.draftGymId!;
      if (act === 'commit') {
        if (!this.game.validateGymDraft(gymId, this.draftEdit!.heroes).ok) {
          this.game.msg(`That five is illegal under ${REG.gym(gymId).name}'s format`, 'bad');
          return;
        }
        this.game.commitGymDraft(gymId, this.draftEdit!);
        this.draftEdit = null;
        this.openGymPrefight(gymId);
      } else if (act === 'reset') {
        this.draftResetToParty();
      } else if (act === 'clear') {
        this.game.commitGymDraft(gymId, { heroes: [], formation: { placements: {} } });
        this.draftEdit = null;
        this.openGymPrefight(gymId);
      } else {
        this.draftEdit = null;
        this.openGymPrefight(gymId);
      }
    }));
  }

  // --- town services (§3.6–3.8): boss reruns, Tinker's Bench, gold sinks ---

  private renderServicesModal(): void {
    const g = this.game;
    const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

    // Boss reruns (§3.6)
    const bosses = g.regionBosses();
    let bossHtml = bosses.length === 0
      ? `<p class="dim">No boss roams ${g.region.name}. Their lairs wait in deeper regions.</p>`
      : '';
    for (const boss of bosses) {
      const unlocked = g.bossUnlockedTiers(boss.id);
      const prog = g.difficulty[boss.id];
      const tiers = (['normal', 'nightmare', 'hell'] as const).map((t) =>
        `<button class="btn small tier-${t}" data-boss="${boss.id}:${t}" ${unlocked.includes(t) ? '' : 'disabled'}>${cap(t)}</button>`
      ).join('');
      const streak = prog ? ` · dry ${prog.dryClears}/${TUNING.raidBadLuckPity}` : '';
      bossHtml += `<div class="svc-row">
        <div class="svc-main"><b>${REG.hero(boss.heroId).name}</b> <em>${boss.rank}</em>
          <div class="rr-sub">farms ${boss.loot.assembledPool.map((id) => REG.item(id).name).join(', ')}${streak}</div>
        </div>
        <div class="svc-actions">${tiers}</div>
      </div>`;
    }

    // Tinker's Bench (§3.7): the neutral stash + per-hero slots
    const activeName = REG.hero(g.party[g.activeIdx].heroId).name;
    let stashHtml = g.neutralStash.length === 0
      ? `<p class="dim">No neutral items yet. Slay wild creeps to find them.</p>`
      : '';
    for (const s of g.neutralStash) {
      const def = REG.neutralItem(s.id);
      const canEnchant = !!def.enchantsInto && s.count >= 3;
      const gradeDet = g.neutralGradeUpQuote(s.id, true);
      const gradeGamble = g.neutralGradeUpQuote(s.id, false);
      const neutralTip = this.registerTip(`neutral-${s.id}`, buildNeutralItemCard(def));
      stashHtml += `<div class="svc-row"${neutralTip}>
        <img class="svc-ico" src="${neutralItemIcon(def)}" alt="">
        <div class="svc-main"><b>${def.name}</b> <em>T${def.tier} ·×${s.count}</em><div class="rr-sub">${def.lore}</div></div>
        <div class="svc-actions">
          <button class="btn small" data-neq="${s.id}">Equip → ${activeName}</button>
          <button class="btn small" data-nrr="${s.id}">Reroll ${TUNING.tinkersBench.rerollCost}g</button>
          <button class="btn small" data-nen="${s.id}" ${canEnchant ? '' : 'disabled'}>Enchant ${TUNING.tinkersBench.enchantCost}g</button>
          ${gradeDet ? `<button class="btn small" data-ngd="${s.id}">Grade ${gradeDet.to} (${gradeDet.essence}e)</button>` : ''}
          ${gradeGamble ? `<button class="btn small" data-ngg="${s.id}">Gamble ${gradeGamble.to} (${gradeGamble.gold}g/${gradeGamble.essence}e · ${Math.round(gradeGamble.chance * 100)}%)</button>` : ''}
          <button class="btn small" data-ndis="${s.id}">Disenchant</button>
        </div>
      </div>`;
    }
    const slotHtml = g.party.map((rec, i) => {
      const ndef = rec.neutralSlot ? REG.neutralItem(rec.neutralSlot.id) : null;
      const n = ndef ? ndef.name : '—';
      return `<div class="svc-row">
        ${ndef ? `<img class="svc-ico" src="${neutralItemIcon(ndef)}" alt="">` : ''}
        <div class="svc-main"><b>${REG.hero(rec.heroId).name}</b> <div class="rr-sub">neutral: ${n}</div></div>
        <div class="svc-actions">${rec.neutralSlot ? `<button class="btn small" data-nrec="${i}">Reclaim ${TUNING.tinkersBench.reclaimCost}g</button>` : ''}</div>
      </div>`;
    }).join('');

    // Armory: bound drops and bench loadouts (LOOT L8).
    const armory = g.armoryView();
    const heroOptions = armory.heroes
      .map((h) => `<option value="${h.heroId}">${h.name}${h.fielded ? ' · fielded' : ''}</option>`)
      .join('');
    const gemOptions = armory.stash
      .map((it, i) => {
        const gem = gemDef(it.id);
        return gem ? `<option value="${i}">${gem.name}</option>` : '';
      })
      .join('');
    const gradeOptions = (['broken', 'worn', 'standard', 'sharp', 'refined', 'pristine'] as const)
      .map((grade) => `<option value="${grade}" ${armory.lootFilter.minGrade === grade ? 'selected' : ''}>${GRADE_DEFS[grade].name}</option>`)
      .join('');
    const rarityOptions = RARITY_ORDER
      .map((rarity) => `<option value="${rarity}" ${armory.lootFilter.minRarity === rarity ? 'selected' : ''}>${cap(rarity)}</option>`)
      .join('');
    const autoGradeOptions = [
      `<option value="">Off</option>`,
      ...(['broken', 'worn', 'standard', 'sharp', 'refined', 'pristine'] as const)
        .map((grade) => `<option value="${grade}" ${armory.lootFilter.autoDisenchantBelowGrade === grade ? 'selected' : ''}>Below ${GRADE_DEFS[grade].name}</option>`)
    ].join('');
    const autoRarityOptions = [
      `<option value="">Off</option>`,
      ...RARITY_ORDER.map((rarity) => `<option value="${rarity}" ${armory.lootFilter.autoDisenchantBelowRarity === rarity ? 'selected' : ''}>Below ${cap(rarity)}</option>`)
    ].join('');
    const filterHtml = `<div class="svc-row loot-filter-row">
      <div class="svc-main"><b>Loot Filter</b><div class="rr-sub">Toast and keep at or above these thresholds; optional auto-disenchant turns junk into essence.</div></div>
      <div class="svc-actions">
        <label class="mini-label">Keep grade <select class="small-select" data-lf="minGrade">${gradeOptions}</select></label>
        <label class="mini-label">Keep rarity <select class="small-select" data-lf="minRarity">${rarityOptions}</select></label>
        <label class="mini-label">Auto grade <select class="small-select" data-lf="autoGrade">${autoGradeOptions}</select></label>
        <label class="mini-label">Auto rarity <select class="small-select" data-lf="autoRarity">${autoRarityOptions}</select></label>
        <button class="btn small accent" data-lf-apply="1">Apply</button>
        <button class="btn small" data-arm-salvage-filtered="1">Salvage Filtered</button>
      </div>
    </div>`;
    const conflictHtml = armory.conflicts.length === 0
      ? ''
      : `<div class="rr-sub bad">Contention: ${armory.conflicts.map((c) => `${REG.item(c.itemId).name} claimed ${c.requested}×, owned ${c.owned}×`).join(' · ')}</div>`;
    const activeHero = armory.heroes.find((hero) => hero.heroId === g.party[g.activeIdx].heroId) ?? armory.heroes[0];
    const fuseOptions = g.gemFuseOptions();
    const fuseHtml = fuseOptions.length === 0
      ? `<p class="dim">No matching gem triples ready to fuse.</p>`
      : fuseOptions.map((opt) => `<div class="svc-row">
          <div class="svc-main"><b>${opt.from}</b> <em>×3 → ${opt.to}</em><div class="rr-sub">${opt.cost}g fusion cost</div></div>
          <div class="svc-actions"><button class="btn small" data-arm-fuse="${opt.indices.join(',')}" ${opt.canFuse ? '' : 'disabled'}>Fuse</button></div>
        </div>`).join('');
    const armoryHtml = armory.stash.length === 0
      ? `<p class="dim">No stashed items yet. Bosses, raids, chests, and wild creeps can stock the Armory.</p>`
      : armory.stash.map((it, i) => {
          const def = REG.item(it.id);
          const gem = gemDef(it.id);
          const augmentKind = it.id === 'aghanims-scepter' || it.id === 'aghanims-blessing' ? 'scepter' : it.id === 'aghanims-shard' ? 'shard' : null;
          const qLabel = it.quality && it.quality !== 'standard'
            ? ` · <span style="color:${qualityColor(it.quality)}">${QUALITY_GRADES[it.quality].name}</span>`
            : '';
          const gDef = GRADE_DEFS[it.grade ?? 'standard'];
          const flags = gem ? ['gem', gem.grade, 'socket material'].join(' · ') : [def.tier, gradeLabel(it), it.bound ? 'bound' : 'liquid'].join(' · ');
          const quote = !gem && it.bound ? g.qualityUpgradeQuote(i) : null;
          const qualityForge = quote
            ? `<button class="btn small" data-arm-upgrade="${i}">Quality ${QUALITY_GRADES[quote.to].name} (${quote.essence}e/${quote.gold}g)</button>`
            : '';
          const gradeDet = !gem && it.bound ? g.forgeGradeUpQuote(i, true) : null;
          const gradeGamble = !gem && it.bound ? g.forgeGradeUpQuote(i, false) : null;
          const reforge = !gem && it.bound ? g.reforgeArmoryItemQuote(i) : null;
          const masterwork = !gem && it.bound ? g.masterworkArmoryItemQuote(i) : null;
          const addSocket = !gem && it.bound ? g.addArmorySocketQuote(i) : null;
          const equipped = !gem && activeHero ? comparableEquipped(it, activeHero.items) : null;
          const comparison = !gem ? compareItems(it, equipped) : null;
          const comparisonHtml = comparison
            ? `<div class="item-compare ${comparison.cls}"><b>${comparison.verdict}</b> vs ${equipped ? REG.item(equipped.id).name : 'empty'} <span>${comparison.delta > 0 ? '+' : ''}${comparison.delta}</span>${comparison.lines.length ? `<em>${comparison.lines.join(' · ')}</em>` : ''}</div>`
            : '';
          const detailLines = !gem ? statLines(itemMods(it, def), 8) : statLines(gem.mods, 4);
          const setLines = !gem ? setProgressLines(it, activeHero?.items ?? []) : [];
          const detailsHtml = [
            detailLines.length ? `<div class="item-stat-lines">${detailLines.map(esc).join(' · ')}</div>` : '',
            setLines.length ? `<div class="item-stat-lines">${setLines.slice(0, 3).map(esc).join(' · ')}</div>` : '',
            !gem && (it.affixes ?? []).length > 0
              ? `<div class="affix-lines">${(it.affixes ?? []).map((affix, affixIdx) => {
                  const aDef = affixDef(affix.affixId);
                  const aQuote = g.rerollArmoryAffixQuote(i, affixIdx);
                  const imprint = g.imprintArmoryAffixQuote(i, affixIdx);
                  const mods = statLines(affix.resolved, 4).join(', ');
                  const lock = it.imprintedAffixId === affix.affixId ? ' locked' : '';
                  const preview = aQuote && !aQuote.locked ? g.rerollPreviewFor(i, affixIdx) : null;
                  const canReroll = aQuote && !aQuote.locked && g.gold >= aQuote.gold && g.essence >= aQuote.essence;
                  let controls: string;
                  if (preview) {
                    const candDef = affixDef(preview.candidate.affixId);
                    const candMods = statLines(preview.candidate.resolved, 4).join(', ');
                    controls = `<span class="affix-preview ${candDef.kind}">→ ${esc(candDef.name)}${candMods ? ` <em>${esc(candMods)}</em>` : ''}</span>
                    <button class="btn tiny on" data-arm-reroll-keep="${i}:${affixIdx}">Keep</button>
                    <button class="btn tiny" data-arm-reroll-affix="${i}:${affixIdx}" ${canReroll ? '' : 'disabled'}>Reroll again ${aQuote!.gold}g</button>
                    <button class="btn tiny" data-arm-reroll-cancel="1">Cancel</button>`;
                  } else {
                    controls = aQuote ? `<button class="btn tiny" data-arm-reroll-affix="${i}:${affixIdx}" ${canReroll ? '' : 'disabled'}>Reroll ${aQuote.gold}g</button>` : '';
                  }
                  return `<div class="affix-line ${aDef.kind}${lock}">
                    <span>${aDef.kind === 'signature' ? 'Signature: ' : ''}${esc(aDef.name)}${mods ? ` <em>${esc(mods)}</em>` : ''}${lock ? ' <b>IMPRINTED</b>' : ''}</span>
                    ${controls}
                    ${imprint ? `<button class="btn tiny ${imprint.active ? 'on' : ''}" data-arm-imprint-affix="${i}:${affixIdx}" ${imprint.active || g.gold < imprint.gold || g.essence < imprint.essence ? 'disabled' : ''}>Imprint ${imprint.essence}e</button>` : ''}
                  </div>`;
                }).join('')}</div>`
              : ''
          ].join('');
          const socketControls = !gem && it.bound && (it.sockets ?? []).length > 0
            ? (it.sockets ?? []).map((socketed, socketIdx) => {
                const socketedGem = socketed ? gemDef(socketed) : null;
                const unsocket = socketedGem ? g.unsocketArmoryGemQuote(i) : null;
                return socketedGem
                  ? `<button class="btn small" data-arm-unsocket="${i}:${socketIdx}" ${unsocket && g.essence >= unsocket.essence ? '' : 'disabled'}>Unsocket ${socketedGem.name}${unsocket ? ` (${unsocket.essence}e)` : ''}</button>`
                  : gemOptions
                    ? `<select class="small-select" data-arm-gem-pick="${i}:${socketIdx}">${gemOptions}</select><button class="btn small" data-arm-socket="${i}:${socketIdx}">Socket</button>`
                    : `<span class="rr-sub">empty socket</span>`;
              }).join('')
            : '';
          const powerForge = gem ? [
            `<span class="rr-sub">Socket into a bound item with an empty slot.</span>`
          ].join('') : [
            gradeDet ? `<button class="btn small" data-arm-grade-det="${i}">Grade ${gradeDet.to} (${gradeDet.essence}e)</button>` : '',
            gradeGamble ? `<button class="btn small" data-arm-grade-gamble="${i}">Gamble ${gradeGamble.to} (${gradeGamble.gold}g/${gradeGamble.essence}e · ${Math.round(gradeGamble.chance * 100)}%)</button>` : '',
            reforge ? `<button class="btn small" data-arm-reforge="${i}">Reforge (${reforge.gold}g/${reforge.essence}e)</button>` : '',
            masterwork ? `<button class="btn small" data-arm-masterwork="${i}">Masterwork (${masterwork.gold}g/${masterwork.essence}e)</button>` : '',
            addSocket ? `<button class="btn small" data-arm-add-socket="${i}">Add Socket (${addSocket.gold}g/${addSocket.essence}e)</button>` : '',
            socketControls
          ].join('');
          const augmentButton = augmentKind
            ? `<button class="btn small accent" data-arm-augment="${i}" ${activeHero?.augments?.[augmentKind] ? 'disabled' : ''}>Absorb</button>`
            : '';
          const armoryTip = this.registerTip(`armory-${i}`, buildItemCard(def, { mods: gem ? gem.mods : itemMods(it, def) }), {
            accent: rarityColor(def.rarity),
            extra: gem ? [] : itemDetailLines(it, activeHero?.items ?? [])
          });
          return `<div class="svc-row item-row ${it.locked ? 'locked' : ''}"${armoryTip} style="border-left:3px solid ${rarityColor(def.rarity)}; outline:1px solid ${gDef.frame}">
            <div class="svc-main"><b style="color:${rarityColor(def.rarity)}">${def.name}</b> <em>${flags}${qLabel}${it.locked ? ' · locked' : ''}</em><div class="rr-sub">${def.lore}</div>${comparisonHtml}${detailsHtml}</div>
            <div class="svc-actions">
              ${gem ? '' : `<select class="small-select" data-arm-pick="${i}">${heroOptions}</select><button class="btn small" data-arm-hero-eq="${i}">Equip</button>`}
              ${augmentButton}
              ${powerForge}
              ${qualityForge}
              <button class="btn small ${it.locked ? 'on' : ''}" data-arm-lock="${i}">${it.locked ? 'Unlock' : 'Lock'}</button>
              ${!gem && it.bound ? `<button class="btn small" data-arm-salvage="${i}">Salvage</button>` : ''}
            </div>
          </div>`;
        }).join('');
    const assembly = g.legendaryAssemblyOptions();
    const assemblyHtml = assembly.length === 0
      ? `<p class="dim">No Legendary assembly recipes are available.</p>`
      : assembly.map((opt) => {
          const missing = opt.missing.length > 0
            ? `missing ${[...new Set(opt.missing)].map((id) => REG.item(id).name).join(', ')}`
            : 'ready';
          const components = opt.components.map((id) => REG.item(id).name).join(' + ');
          return `<div class="svc-row">
            <div class="svc-main"><b>${opt.name}</b> <em>${opt.essenceCost} essence</em>
              <div class="rr-sub">${components} · ${missing}</div>
            </div>
            <div class="svc-actions"><button class="btn small" data-arm-assemble="${opt.itemId}" ${opt.canCraft ? '' : 'disabled'}>Assemble</button></div>
          </div>`;
        }).join('');
    const armorySlotsHtml = armory.heroes.map((hero) => {
      const bound = hero.items
        .map((it, slot) => (it?.bound ? { it, slot } : null))
        .filter((x): x is { it: ItemSave; slot: number } => !!x);
      const augmentStatus = `${hero.augments.scepter ? 'Scepter' : 'no Scepter'} · ${hero.augments.shard ? 'Shard' : 'no Shard'}`;
      const rows = bound.length === 0
        ? `<div class="rr-sub">no bound main-slot items</div>`
        : bound.map(({ it, slot }) => {
            const aug = it.id === 'aghanims-scepter' || it.id === 'aghanims-blessing' ? 'scepter' : it.id === 'aghanims-shard' ? 'shard' : null;
            return `<button class="btn small" data-arm-rec-hero="${hero.heroId}:${slot}">Reclaim ${REG.item(it.id).name}</button>${aug ? `<button class="btn small accent" data-arm-eq-augment="${hero.heroId}:${slot}" ${hero.augments[aug] ? 'disabled' : ''}>Absorb</button>` : ''}`;
          }).join('');
      const loadoutText = hero.loadouts.length > 0 ? `loadouts: ${hero.loadouts.join(', ')}` : 'no saved loadout';
      const conflicts = hero.conflicts.length > 0
        ? `<div class="rr-sub bad">waiting on ${hero.conflicts.map((id) => REG.item(id).name).join(', ')}</div>`
        : '';
      return `<div class="svc-row">
        <div class="svc-main"><b>${hero.name}</b> <em>Lv ${hero.level}${hero.fielded ? ' · fielded' : ' · bench'}</em>
          <div class="rr-sub">${loadoutText} · ${augmentStatus}</div>${conflicts}
        </div>
        <div class="svc-actions">
          ${rows}
          <button class="btn small" data-arm-save-loadout="${hero.heroId}">Save Loadout</button>
          <button class="btn small" data-arm-apply-loadout="${hero.heroId}" ${hero.loadouts.includes('Default') ? '' : 'disabled'}>Apply</button>
          <button class="btn small" data-arm-reclaim-all="${hero.heroId}">Reclaim All</button>
        </div>
      </div>`;
    }).join('');

    // Black Market (LOOT L4): recipe + relic gamble wheels — a gold sink that feeds the Armory.
    const bm = g.blackMarketView();
    const recipeBtns = bm.recipeRarities
      .map((r) => `<button class="btn small" data-bm-recipe="${r}" ${bm.inTown && bm.gold >= bm.recipeCost ? '' : 'disabled'} style="color:${rarityColor(r)}">${cap(r)}</button>`)
      .join('');
    const markBtns = bm.lootMarks
      .map((m) => `<button class="btn small" data-bm-mark="${m.band}" ${m.canRedeem ? '' : 'disabled'}>${cap(m.band)} ${m.marks}/${m.quota}</button>`)
      .join('');
    const gambleBtns = bm.gambleVendor
      .map((gbl) => `<button class="btn small" data-bm-gamble="${gbl.tier}:${gbl.slot}" ${gbl.canRoll ? '' : 'disabled'}>${gbl.tier.toUpperCase()} ${cap(gbl.slot)} ${gbl.price}g${gbl.pity ? ' · pity' : ''}</button>`)
      .join('');
    const merchantHtml = bm.roamingMerchant.map((offer) => {
      const gradeBtns = offer.grades
        .map((gOffer) => `<button class="btn small" data-bm-merchant="${offer.id}:${gOffer.grade}" ${gOffer.canBuy ? '' : 'disabled'}>${cap(gOffer.grade)} ${gOffer.price}g</button>`)
        .join('');
      return `<div class="svc-row">
        <div class="svc-main"><b style="color:${rarityColor(offer.rarity)}">${offer.name}</b> <em>${offer.tier.toUpperCase()}</em>
          <div class="rr-sub">Known base item, chosen grade, random affixes. Pristine stays drop-only.</div>
        </div>
        <div class="svc-actions">${gradeBtns}</div>
      </div>`;
    }).join('');
    const bmHtml = `
      <div class="svc-row">
        <div class="svc-main"><b>Loot Marks</b>
          <div class="rr-sub">Cross-activity pity: Progress+ drops and boss/raid clears convert into a bound Legendary pick.</div>
        </div>
        <div class="svc-actions">${markBtns}</div>
      </div>
      <div class="svc-row">
        <div class="svc-main"><b>Recipe Wheel</b> <em>${bm.recipeCost}g</em>
          <div class="rr-sub">One roll for a component/basic piece of the chosen band — the steady gold that finishes the builds your drops start.</div>
        </div>
        <div class="svc-actions">${recipeBtns}</div>
      </div>
      <div class="svc-row">
        <div class="svc-main"><b>Relic Wheel</b> <em>${bm.relicCost}g</em>
          <div class="rr-sub">One bound assembled relic up to <span style="color:${rarityColor(bm.relicCeiling)}">${bm.relicCeiling}</span>; cost climbs each spin and never reaches the reserved peak.</div>
        </div>
        <div class="svc-actions"><button class="btn small accent" data-bm-relic="1" ${bm.inTown && bm.gold >= bm.relicCost ? '' : 'disabled'}>Spin</button></div>
      </div>
      <div class="svc-row">
        <div class="svc-main"><b>Gamble Vendor</b>
          <div class="rr-sub">Pick a core tier and slot family; every ${TUNING.gambleVendor.pity}th spin is Sharp+.</div>
        </div>
        <div class="svc-actions">${gambleBtns}</div>
      </div>
      <div class="svc-sub">Roaming Merchant</div>${merchantHtml}`;

    // Raids, executed (§3.9): scripted 5v1 with mechanics firing in the sim
    const aegisTag = g.aegisReady() ? ` <span class="gold">Aegis held</span>` : '';
    let raidHtml = '';
    for (const { def, ready, reason } of g.availableRaids()) {
      const tiers = (['normal', 'nightmare', 'hell'] as const).map((t) =>
        `<button class="btn small tier-${t}" data-raid-live="${def.id}:${t}" ${ready ? '' : 'disabled'}>Live ${cap(t)}</button>
         <button class="btn small tier-${t}" data-raid="${def.id}:${t}" ${ready ? '' : 'disabled'}>Auto ${cap(t)}</button>`
      ).join('');
      const clears = g.raidProgress[def.id]?.clears ?? 0;
      raidHtml += `<div class="svc-row">
        <div class="svc-main"><b>${def.name}</b> <em>${def.location}</em>
          <div class="rr-sub">${ready ? `cleared ×${clears}` : reason}</div>
        </div>
        <div class="svc-actions">${tiers}</div>
      </div>`;
    }

    // Conquest: the Elite Five gauntlet + the Champion (§3.10)
    const members = g.eliteMembers();
    const nextIdx = g.eliteNextIndex();
    const fiveCleared = nextIdx >= members.length;
    const champDown = g.eliteFive.championDown;
    const eliteHtml = `
      <div class="svc-row">
        <div class="svc-main"><b>Elite Five</b> <em>${Math.min(nextIdx, members.length)}/5</em>
          <div class="rr-sub">${fiveCleared ? 'All five beaten — face the Champion.' : `Next: ${members[nextIdx].name}`}</div>
        </div>
        <div class="svc-actions"><button class="btn small accent" data-elite="1" ${fiveCleared ? 'disabled' : ''}>Challenge</button></div>
      </div>
      <div class="svc-row">
        <div class="svc-main"><b>The Champion</b><div class="rr-sub">${champDown ? 'Dethroned.' : fiveCleared ? 'Awaits you.' : 'Locked until the five fall.'}</div></div>
        <div class="svc-actions"><button class="btn small accent" data-champion="1" ${fiveCleared && !champDown ? '' : 'disabled'}>Challenge</button></div>
      </div>`;

    const festivalHtml = [...REG.seasonalEvents.values()].map((event) => {
      const status = g.seasonalEventStatus(event.id);
      return `
        <div class="svc-row">
          <div class="svc-main"><b>${event.name}</b> <em>${event.realEvent}</em>
            <div class="rr-sub">${event.summary}</div>
            <div class="rr-sub">${status.target} — ${status.detail}</div>
          </div>
          <div class="svc-actions"><button class="btn small accent" data-festival="${event.id}" ${status.launchable ? '' : 'disabled'}>Invoke</button></div>
        </div>`;
    }).join('');

    // Gold sinks (§3.8)
    const downIdx = g.party.findIndex((r) => !r.unit || !r.unit.alive || r.respawnAt > g.sim.time);
    const buyLabel = downIdx >= 0
      ? `Buyback ${buybackCost(g.party[downIdx].level, g.goldSinks.buybacks)}g`
      : 'Buyback (no one down)';
    const sinkHtml = g.party.map((rec, i) =>
      `<div class="svc-row">
        <div class="svc-main"><b>${REG.hero(rec.heroId).name}</b> <em>Lv ${rec.unit ? rec.unit.level : rec.level}</em></div>
        <div class="svc-actions">
          <button class="btn small" data-tome="${i}">Tome +XP</button>
          <button class="btn small" data-mastery-respec="${i}">Refund Masteries</button>
          <button class="btn small" data-respec="${i}">Respec ${TUNING.respecCost}g</button>
        </div>
      </div>`
    ).join('');
    const cookKind = (k: 'heal' | 'revive' | 'buff') => k === 'heal' ? 'restores the party' : k === 'revive' ? 'revives a fallen hero' : 'short exploration buff';
    const cookHtml = g.cookableDishes().map((d) =>
      `<div class="svc-row">
        <div class="svc-main"><b>${d.name}</b> <em>${cookKind(d.kind)}</em></div>
        <div class="svc-actions">
          <button class="btn small" data-cook="${d.id}" ${g.gold >= d.cost ? '' : 'disabled'}>Cook ${d.cost}g</button>
        </div>
      </div>`
    ).join('');

    this.modalShell('Town Services', `
      <div class="services">
        <section><h3>Boss Reruns</h3>${bossHtml}</section>
        <section><h3>Raids${aegisTag}</h3>${raidHtml}</section>
        <section><h3>Conquest — Tower of the Ancients</h3>${eliteHtml}</section>
        <section><h3>Festivals — Turns of the Loop</h3>${festivalHtml}</section>
        <section><h3>Tinker's Bench <span class="gold">${Math.floor(g.gold)} g</span></h3>
          ${stashHtml}
          <div class="svc-sub">Neutral slots</div>${slotHtml}
        </section>
        <section><h3>Armory <span class="gold">${armory.essence} essence</span></h3>
          ${conflictHtml}
          <div class="svc-actions"><button class="btn small accent" data-arm-gear-field="1">Gear Fielded Loadouts</button></div>
          ${filterHtml}
          ${armoryHtml}
          <div class="svc-sub">Gem Fusion</div>${fuseHtml}
          <div class="svc-sub">Assembly Bench</div>${assemblyHtml}
          <div class="svc-sub">Bound items</div>${armorySlotsHtml}
        </section>
        <section><h3>Black Market <span class="gold">${Math.floor(g.gold)} g</span></h3>${bmHtml}</section>
        <section><h3>Recovery &amp; Growth</h3>
          <div class="svc-row"><div class="svc-main">Rest at the inn — full HP/mana</div>
            <div class="svc-actions">
              <button class="btn small" data-heal="1">Heal ${TUNING.healServiceCost}g</button>
              <button class="btn small accent" data-buyback="1" ${downIdx >= 0 ? '' : 'disabled'}>${buyLabel}</button>
            </div>
          </div>
          <div class="svc-sub">Field Kitchen</div>${cookHtml}
          ${sinkHtml}
        </section>
      </div>`);

    const rerender = () => this.renderServicesModal();
    this.modal.querySelectorAll<HTMLElement>('[data-boss]').forEach((el) => el.addEventListener('click', () => {
      const [id, tier] = el.dataset.boss!.split(':');
      g.runBossFight(id, tier as 'normal' | 'nightmare' | 'hell');
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-raid]').forEach((el) => el.addEventListener('click', () => {
      const [id, tier] = el.dataset.raid!.split(':');
      g.runRaid(id, tier as 'normal' | 'nightmare' | 'hell');
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-raid-live]').forEach((el) => el.addEventListener('click', () => {
      const [id, tier] = el.dataset.raidLive!.split(':');
      this.closeModal();
      g.startLiveRaid(id, tier as 'normal' | 'nightmare' | 'hell');
    }));
    this.modal.querySelector<HTMLElement>('[data-elite]')?.addEventListener('click', () => {
      if (g.beginEliteDraft()) this.openEliteDraft();
    });
    this.modal.querySelector<HTMLElement>('[data-champion]')?.addEventListener('click', () => { g.runChampion(); rerender(); });
    this.modal.querySelectorAll<HTMLElement>('[data-festival]').forEach((el) => el.addEventListener('click', () => { g.runSeasonalEvent(el.dataset.festival!); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-neq]').forEach((el) => el.addEventListener('click', () => { g.equipNeutral(g.activeIdx, el.dataset.neq!); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-nrr]').forEach((el) => el.addEventListener('click', () => { g.tinkerReroll(el.dataset.nrr!); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-nen]').forEach((el) => el.addEventListener('click', () => { g.tinkerEnchant(el.dataset.nen!); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-ngd]').forEach((el) => el.addEventListener('click', () => { g.tinkerNeutralGradeUp(el.dataset.ngd!, true); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-ngg]').forEach((el) => el.addEventListener('click', () => { g.tinkerNeutralGradeUp(el.dataset.ngg!, false); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-ndis]').forEach((el) => el.addEventListener('click', () => { g.disenchantNeutral(el.dataset.ndis!); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-nrec]').forEach((el) => el.addEventListener('click', () => { g.reclaimNeutral(Number(el.dataset.nrec)); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-hero-eq]').forEach((el) => el.addEventListener('click', () => {
      const idx = Number(el.dataset.armHeroEq);
      const select = this.modal.querySelector<HTMLSelectElement>(`select[data-arm-pick="${idx}"]`);
      if (select) g.equipArmoryItemForHero(select.value, idx);
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-augment]').forEach((el) => el.addEventListener('click', () => {
      const idx = Number(el.dataset.armAugment);
      const select = this.modal.querySelector<HTMLSelectElement>(`select[data-arm-pick="${idx}"]`);
      if (select) g.applyArmoryAugmentForHero(select.value, idx);
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-eq-augment]').forEach((el) => el.addEventListener('click', () => {
      const [heroId, slotRaw] = el.dataset.armEqAugment!.split(':');
      g.applyEquippedAugmentForHero(heroId, Number(slotRaw));
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-salvage]').forEach((el) => el.addEventListener('click', () => { g.salvageArmoryItem(Number(el.dataset.armSalvage)); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-lock]').forEach((el) => el.addEventListener('click', () => { g.toggleArmoryItemLock(Number(el.dataset.armLock)); rerender(); }));
    this.modal.querySelector<HTMLElement>('[data-arm-salvage-filtered]')?.addEventListener('click', () => { g.salvageFilteredArmoryJunk(); rerender(); });
    this.modal.querySelectorAll<HTMLElement>('[data-arm-upgrade]').forEach((el) => el.addEventListener('click', () => { g.upgradeArmoryItemQuality(Number(el.dataset.armUpgrade)); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-grade-det]').forEach((el) => el.addEventListener('click', () => { g.forgeArmoryItemGrade(Number(el.dataset.armGradeDet), true); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-grade-gamble]').forEach((el) => el.addEventListener('click', () => { g.forgeArmoryItemGrade(Number(el.dataset.armGradeGamble), false); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-reforge]').forEach((el) => el.addEventListener('click', () => { g.reforgeArmoryItem(Number(el.dataset.armReforge)); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-reroll-affix]').forEach((el) => el.addEventListener('click', () => {
      const [idxRaw, affixRaw] = el.dataset.armRerollAffix!.split(':');
      g.rerollArmoryAffix(Number(idxRaw), Number(affixRaw));
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-reroll-keep]').forEach((el) => el.addEventListener('click', () => {
      const [idxRaw, affixRaw] = el.dataset.armRerollKeep!.split(':');
      g.keepRerolledAffix(Number(idxRaw), Number(affixRaw));
      rerender();
    }));
    this.modal.querySelector<HTMLElement>('[data-arm-reroll-cancel]')?.addEventListener('click', () => { g.discardRerolledAffix(); rerender(); });
    this.modal.querySelectorAll<HTMLElement>('[data-arm-imprint-affix]').forEach((el) => el.addEventListener('click', () => {
      const [idxRaw, affixRaw] = el.dataset.armImprintAffix!.split(':');
      g.imprintArmoryAffix(Number(idxRaw), Number(affixRaw));
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-masterwork]').forEach((el) => el.addEventListener('click', () => { g.masterworkArmoryItem(Number(el.dataset.armMasterwork)); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-add-socket]').forEach((el) => el.addEventListener('click', () => { g.addArmorySocket(Number(el.dataset.armAddSocket)); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-socket]').forEach((el) => el.addEventListener('click', () => {
      const [idxRaw, socketRaw] = el.dataset.armSocket!.split(':');
      const select = this.modal.querySelector<HTMLSelectElement>(`select[data-arm-gem-pick="${idxRaw}:${socketRaw}"]`);
      if (select) g.socketArmoryGem(Number(idxRaw), Number(socketRaw), Number(select.value));
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-unsocket]').forEach((el) => el.addEventListener('click', () => {
      const [idxRaw, socketRaw] = el.dataset.armUnsocket!.split(':');
      g.unsocketArmoryGem(Number(idxRaw), Number(socketRaw));
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-fuse]').forEach((el) => el.addEventListener('click', () => {
      g.fuseArmoryGems(el.dataset.armFuse!.split(',').map(Number));
      rerender();
    }));
    this.modal.querySelector<HTMLElement>('[data-lf-apply]')?.addEventListener('click', () => {
      const value = (field: string) => this.modal.querySelector<HTMLSelectElement>(`select[data-lf="${field}"]`)?.value ?? '';
      g.setLootFilter({
        minGrade: value('minGrade') as NonNullable<ItemSave['grade']>,
        minRarity: value('minRarity') as ItemRarity,
        autoDisenchantBelowGrade: value('autoGrade') ? value('autoGrade') as NonNullable<ItemSave['grade']> : undefined,
        autoDisenchantBelowRarity: value('autoRarity') ? value('autoRarity') as ItemRarity : undefined
      });
      rerender();
    });
    this.modal.querySelectorAll<HTMLElement>('[data-arm-assemble]').forEach((el) => el.addEventListener('click', () => { g.assembleLegendary(el.dataset.armAssemble!); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-rec-hero]').forEach((el) => el.addEventListener('click', () => {
      const [heroId, slotRaw] = el.dataset.armRecHero!.split(':');
      g.reclaimArmoryItemForHero(heroId, Number(slotRaw));
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-save-loadout]').forEach((el) => el.addEventListener('click', () => { g.saveHeroLoadout(el.dataset.armSaveLoadout!); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-apply-loadout]').forEach((el) => el.addEventListener('click', () => { g.applyHeroLoadout(el.dataset.armApplyLoadout!); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-arm-reclaim-all]').forEach((el) => el.addEventListener('click', () => { g.reclaimAllArmoryItemsForHero(el.dataset.armReclaimAll!); rerender(); }));
    this.modal.querySelector<HTMLElement>('[data-arm-gear-field]')?.addEventListener('click', () => { g.gearFieldLoadouts(); rerender(); });
    this.modal.querySelectorAll<HTMLElement>('[data-bm-recipe]').forEach((el) => el.addEventListener('click', () => { g.blackMarketRecipeWheel(el.dataset.bmRecipe as ItemRarity); rerender(); }));
    this.modal.querySelector<HTMLElement>('[data-bm-relic]')?.addEventListener('click', () => { g.blackMarketRelicWheel(); rerender(); });
    this.modal.querySelectorAll<HTMLElement>('[data-bm-mark]').forEach((el) => el.addEventListener('click', () => { g.blackMarketRedeemLootMark(el.dataset.bmMark as 'early' | 'mid' | 'late'); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-bm-gamble]').forEach((el) => el.addEventListener('click', () => {
      const [tier, slot] = el.dataset.bmGamble!.split(':');
      g.gambleVendorRoll(tier as 't1' | 't2' | 't3' | 't4', slot as 'any' | 'weapon' | 'armor' | 'caster' | 'mobility');
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-bm-merchant]').forEach((el) => el.addEventListener('click', () => {
      const [itemId, grade] = el.dataset.bmMerchant!.split(':');
      g.roamingMerchantBuy(itemId, grade as 'worn' | 'standard' | 'sharp' | 'refined');
      rerender();
    }));
    this.modal.querySelectorAll<HTMLElement>('[data-tome]').forEach((el) => el.addEventListener('click', () => { g.buyTome(Number(el.dataset.tome)); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-mastery-respec]').forEach((el) => el.addEventListener('click', () => { g.respecMasteries(Number(el.dataset.masteryRespec)); rerender(); }));
    this.modal.querySelectorAll<HTMLElement>('[data-respec]').forEach((el) => el.addEventListener('click', () => { g.respec(Number(el.dataset.respec)); rerender(); }));
    this.modal.querySelector<HTMLElement>('[data-heal]')?.addEventListener('click', () => { g.healParty(); rerender(); });
    this.modal.querySelectorAll<HTMLElement>('[data-cook]').forEach((el) => el.addEventListener('click', () => { g.cookDish(el.dataset.cook!); rerender(); }));
    this.modal.querySelector<HTMLElement>('[data-buyback]')?.addEventListener('click', () => { g.buyback(downIdx >= 0 ? downIdx : undefined); rerender(); });
  }

  // --- live gym overlay (§3.5): round score + both teams' Captain Call charges ---

  // --- combat readability (COMBAT_OVERHAUL §3.4, C4): cast bars, boss threat, shared
  //     focus, and the "ult ready → seize" prompt; full overlay during a live raid/gym ---
  private renderCombatReadout(): void {
    const r = this.game.combatReadout();
    if (!r.active || this.game.cinematic.active) {
      if (!this.combatReadout.classList.contains('hidden')) {
        this.combatReadout.classList.add('hidden');
        this.combatReadout.innerHTML = '';
        this.lastCombatReadoutKey = '';
      }
      return;
    }
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
    const bars = r.castBars.slice(0, 4);
    const key = [
      r.live ? 'L' : 'C',
      bars.map((b) => `${b.uid}:${b.ability}:${Math.round(b.pct * 12)}:${b.enemy ? 'e' : 'a'}:${b.isUlt ? 'u' : ''}`).join(','),
      r.bossThreat ? `${r.bossThreat.bossName}>${r.bossThreat.targetName ?? '-'}${r.bossThreat.taunted ? '!' : ''}` : '',
      r.sharedFocus?.name ?? '',
      r.ultReady.map((u) => u.name).join('+'),
      r.tagChain ? `${r.tagChain.count}:${Math.round(r.tagChain.pct * 12)}:${r.tagChain.ampPct}` : '',
      `${r.offField.count}:${r.offField.names.join('+')}`,
      r.nextLink ? `${r.nextLink.slot}:${r.nextLink.heroId}` : '',
      r.swapCharges ? `sc${Math.floor(r.swapCharges.current)}/${r.swapCharges.max}` : '',
      r.formation ? `f${r.formation.posture}:${r.formation.protect ? `${r.formation.protect.peeler}>${r.formation.protect.ward}` : '-'}:${r.formation.flankTargetName ?? '-'}` : ''
    ].join('|');
    if (key === this.lastCombatReadoutKey) return;
    this.lastCombatReadoutKey = key;

    const castHtml = bars.map((b) =>
      `<div class="cast-bar ${b.enemy ? 'enemy' : 'ally'} ${b.isUlt ? 'ult' : ''}">
        <span class="cast-name">${esc(b.name)} — ${esc(b.ability)}${b.isUlt ? ' ✦' : ''}</span>
        <i><em style="width:${Math.round(b.pct * 100)}%"></em></i>
      </div>`
    ).join('');
    const threatHtml = r.bossThreat
      ? `<div class="threat-line ${r.bossThreat.taunted ? 'taunted' : ''}">
          <b>${esc(r.bossThreat.bossName)}</b> ${r.bossThreat.taunted ? 'is taunted onto' : '▸ targeting'} <span>${esc(r.bossThreat.targetName ?? 'no one')}</span>
        </div>`
      : '';
    const focusHtml = r.sharedFocus
      ? `<div class="focus-line">Team focus ▸ <span>${esc(r.sharedFocus.name)}</span></div>`
      : '';
    const ultHtml = r.ultReady.length
      ? `<div class="ult-line">Ult ready: ${r.ultReady.map((u) => esc(u.name)).join(', ')}${r.live && !this.game.controlledUnit() ? ' — click a portrait to seize' : ''}</div>`
      : '';
    const tagHtml = r.tagChain
      ? `<div class="tag-chain-line ${r.tagChain.count >= 3 ? 'wombo' : ''}">${r.tagChain.count >= 3 ? 'WOMBO' : 'Tag chain'} ×${r.tagChain.count} <span>+${Math.round(r.tagChain.ampPct)}%</span><i><em style="width:${Math.round(r.tagChain.pct * 100)}%"></em></i></div>`
      : '';
    const offFieldHtml = r.offField.count
      ? `<div class="off-field-line">Off-field: ${r.offField.names.map(esc).join(', ')}</div>`
      : '';
    const nextLinkHtml = r.nextLink
      ? `<div class="next-link-line ${esc(r.nextLink.role)}">${r.tagChain ? 'Chain' : 'Next'} ▸ <kbd>${esc(glyphForAction(this.game.settings, `swap-${r.nextLink.slot + 1}` as InputAction))}</kbd> <span>${esc(r.nextLink.name)}</span> <em>${esc(r.nextLink.role)} · ${esc(r.nextLink.archetype)}</em></div>`
      : '';
    const swapChargeHtml = r.swapCharges
      ? `<div class="swap-charge-line">Swap ${Array.from({ length: r.swapCharges.max }, (_, i) => `<i class="${i < Math.floor(r.swapCharges!.current) ? 'on' : ''}"></i>`).join('')}</div>`
      : '';
    // §6.5 formation posture — holding the anchor vs committed, the lead peel, the flank.
    const formationHtml = r.formation
      ? `<div class="formation-line ${r.formation.posture}">
          <b>${r.formation.posture === 'committed' ? '⚔ Committed' : '🛡 Holding formation'}</b>
          ${r.formation.protect ? `<span>${esc(r.formation.protect.peeler)} peels for ${esc(r.formation.protect.ward)}</span>` : ''}
          ${r.formation.flankTargetName ? `<em>flank ▸ ${esc(r.formation.flankTargetName)}</em>` : ''}
        </div>`
      : '';

    this.combatReadout.classList.remove('hidden');
    this.combatReadout.innerHTML = `
      <div class="readout-casts">${castHtml}</div>
      <div class="readout-status">${threatHtml}${focusHtml}${ultHtml}${tagHtml}${offFieldHtml}${nextLinkHtml}${swapChargeHtml}${formationHtml}</div>`;
  }

  // §6.5 counter-draft reveal: when a last-pick gym answers the committed five, drop a
  // brief animated beat naming the leader's swap. Keyed off game.lastCounterDraft so it
  // fires once per counter and auto-dismisses.
  private renderCounterReveal(): void {
    const cd = this.game.lastCounterDraft;
    const key = cd ? `${cd.gymId}:${cd.swappedIn.join(',')}` : '';
    if (key && key !== this.counterRevealKey) {
      this.counterRevealKey = key;
      const leader = REG.gym(cd!.gymId).leader;
      const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
      const inNames = cd!.swappedIn.map((id) => REG.hero(id).name).join(', ');
      const outNames = cd!.swappedOut.map((id) => REG.hero(id).name).join(', ');
      this.counterReveal.innerHTML = `
        <div class="cr-card">
          <div class="cr-leader">${esc(leader)} counter-drafts</div>
          <div class="cr-reason">${esc(cd!.reason || 'answers your composition')}</div>
          <div class="cr-swap">${outNames ? `<s>${esc(outNames)}</s> ▸ ` : ''}<b>${esc(inNames)}</b></div>
        </div>`;
      this.counterReveal.classList.remove('hidden');
      this.counterReveal.classList.add('show');
      this.counterRevealHideAt = performance.now() + 4500;
      this.playUi('open');
    }
    if (!this.counterReveal.classList.contains('hidden') && performance.now() >= this.counterRevealHideAt) {
      this.counterReveal.classList.remove('show');
      this.counterReveal.classList.add('hidden');
    }
  }

  private renderLiveGym(): void {
    const fight = this.game.liveGym;
    const dungeon = this.game.liveDungeon;
    if (!fight && dungeon) {
      const room = dungeon.room;
      const template = dungeon.roomTemplate();
      const selected = dungeon.sim.unit(this.game.scene.selectedUid);
      const selectedName = selected && selected.team === 0 ? selected.name : 'select 1–5';
      const exitRooms = dungeon.availableExits();
      const exitKey = exitRooms.map((r) => `${r.index}:${r.type}:${r.reward.kind}:${r.reward.rarity ?? ''}`).join(',');
      const pacing = dungeon.pacingInfo();
      const mods = dungeon.selectedModifiers();
      const endless = dungeon.endlessInfo();
      const endlessPct = Math.round(endless.progress * 100);
      const key = `dungeon|${dungeon.def.id}|${room.index}|${room.type}|${room.templateId}|${dungeon.enemyUids.length}|${dungeon.exitsUnlocked()}|${pacing.phase}:${pacing.spawnedPacks}:${pacing.remainingPacks}:${Math.ceil(pacing.nextPackIn)}|${exitKey}|${this.game.scene.selectedUid}|${endless.active ? endlessPct : ''}`;
      if (key === this.lastLiveGymKey) return;
      this.lastLiveGymKey = key;
      const enemies = dungeon.enemyUids.filter((uid) => dungeon.sim.unit(uid)?.alive).length;
      const roomType = room.type[0].toUpperCase() + room.type.slice(1);
      const rewardText = (kind: string, rarity?: string) => {
        if (kind === 'guardian') return 'guardian anchor';
        if (kind === 'chest') return 'chest';
        if (kind === 'shrine') return 'shrine';
        if (kind === 'rest') return 'rest';
        if (kind === 'loot') return rarity ? `${rarity} loot` : 'loot';
        return 'no reward';
      };
      const exitHtml = exitRooms.map((next) => {
        const nextType = next.type[0].toUpperCase() + next.type.slice(1);
        return `<button class="btn small" data-dungeon-exit="${next.index}">${next.index + 1}: ${nextType} · ${rewardText(next.reward.kind, next.reward.rarity)}</button>`;
      }).join('');
      const routeRooms = [room, ...exitRooms].slice(0, 4);
      const routeHtml = routeRooms.map((r, i) => {
        const type = r.type[0].toUpperCase() + r.type.slice(1);
        const marker = i === 0 ? 'Here' : 'Door';
        return `${marker} ${r.index + 1}:${type}/${rewardText(r.reward.kind, r.reward.rarity)}`;
      }).join(' → ');
      const exitLine = enemies > 0
        ? `${enemies} foes seal the exits`
        : dungeon.exitsUnlocked()
          ? (exitHtml || 'Exit opens back to the portal')
          : pacing.remainingPacks > 0
            ? `Director ${pacing.phase}; next pack in ${pacing.nextPackIn.toFixed(1)}s`
            : 'The room settles...';
      const modNames = mods.map((id) => dungeon.def.modifiers?.find((m) => m.id === id)?.name ?? id);
      const titleSuffix = endless.active ? ` · Endless L${endless.level + 1}` : '';
      const endlessLine = endless.active
        ? `<div class="lg-calls">Greater progress ${endlessPct}% ${endlessPct >= 100 ? '· guardian route open' : ''}</div>`
        : '';
      this.liveGymBar.innerHTML = `
        <div class="lg-score"><b>${dungeon.def.name}</b> · ${dungeon.tier}${titleSuffix} · Room ${room.index + 1}/${dungeon.layout.depth} · ${roomType}</div>
        <div class="lg-calls">Template <b>${template.id}</b> · ${Math.round(template.size.x)}×${Math.round(template.size.y)} · ${template.connectors.length} doors</div>
        <div class="lg-calls">Selected <b>${selectedName}</b></div>
        <div class="lg-calls">Packs ${pacing.spawnedPacks}/${pacing.plannedPacks}${modNames.length > 0 ? ` · ${modNames.join(', ')}` : ''}</div>
        <div class="lg-calls">Route ${routeHtml}</div>
        ${endlessLine}
        <div class="lg-calls">${exitLine}</div>`;
      this.liveGymBar.querySelectorAll<HTMLElement>('[data-dungeon-exit]').forEach((el) => {
        el.addEventListener('click', () => this.game.chooseDungeonExit(Number(el.dataset.dungeonExit)));
      });
      this.liveGymBar.classList.remove('hidden');
      return;
    }
    if (!fight) {
      if (!this.liveGymBar.classList.contains('hidden')) {
        this.liveGymBar.classList.add('hidden');
        this.lastLiveGymKey = '';
      }
      return;
    }
    const pc = fight.playerCaptain;
    const ec = fight.enemyCaptain;
    const active = pc.activeUid !== null;
    const selected = fight.sim.unit(this.game.scene.selectedUid);
    const selectedName = selected && selected.team === 0 ? selected.name : 'select 1–5';
    const key = `${fight.gym.id}|${fight.round}|${fight.playerWins}-${fight.enemyWins}|${pc.remaining}|${active}|${ec.remaining}|${this.game.scene.selectedUid}`;
    if (key === this.lastLiveGymKey) return;
    this.lastLiveGymKey = key;
    const dots = (remaining: number, total: number) => '●'.repeat(Math.max(0, remaining)) + '○'.repeat(Math.max(0, total - remaining));
    const pcTotal = TUNING.captainCallsPerFight;
    const ecTotal = TUNING.captainCallsPerFight + (fight.gym.enemyBonusCaptainCalls ?? 0);
    const canCall = pc.remaining > 0 && !active;
    this.liveGymBar.innerHTML = `
      <div class="lg-score"><b>${fight.gym.name}</b> · Round ${fight.round} · <span class="lg-w">${fight.playerWins}</span>–<span class="lg-l">${fight.enemyWins}</span></div>
      <div class="lg-calls">Selected <b>${selectedName}</b></div>
      <div class="lg-calls">You <span class="lg-dots">${dots(pc.remaining, pcTotal)}</span></div>
      <div class="lg-calls">Foe <span class="lg-dots foe">${dots(ec.remaining, ecTotal)}</span></div>
      <button class="btn accent" data-livegym="call" ${canCall ? '' : 'disabled'}>${active ? 'Call active…' : 'Captain Call (Space)'}</button>`;
    this.liveGymBar.classList.remove('hidden');
  }

  private renderCinematic(): void {
    const view = this.game.cinematic.view();
    if (!view) {
      this.cinematicLayer.classList.add('hidden');
      this.cinematicLayer.innerHTML = '';
      return;
    }
    this.cinematicLayer.classList.remove('hidden');
    this.cinematicLayer.classList.toggle('letterbox', view.letterbox);
    this.cinematicLayer.classList.toggle('reduced-motion', view.reducedMotion || view.photosensitive);
    const portraitHero = view.portraitHeroId && REG.heroes.has(view.portraitHeroId)
      ? REG.hero(view.portraitHeroId)
      : null;
    const portrait = portraitHero
      ? `<img class="cin-portrait" src="${heroPortrait(portraitHero.palette, portraitHero.name[0], 52, portraitHero.silhouette)}" alt="">`
      : '';
    this.cinematicLayer.innerHTML = `
      <div class="cin-bar top"></div>
      <div class="cin-card ${view.tier}">
        <div class="cin-meta">
          <span>${view.title}</span>
          <em>${view.tier} · ${view.beatIndex + 1}/${view.beatCount} · ${view.shot.angle}/${view.shot.move}</em>
        </div>
        ${view.stageText ? `<div class="cin-stage">${view.stageText}</div>` : ''}
        ${view.text ? `
          <div class="cin-line">
            ${portrait}
            <div><b>${view.speaker ?? 'Narration'}</b>
            <p>${view.revealedText}</p></div>
          </div>` : ''}
        ${view.skipProgress > 0 ? `<div class="cin-skip-confirm"><span style="width:${Math.round(view.skipProgress * 100)}%"></span></div>` : ''}
        <div class="cin-controls">
          <span>${view.controls}${view.speed > 1 ? ` · ${view.speed}x` : ''}</span>
          <button class="btn small" data-cinematic="next">Next</button>
          <button class="btn small" data-cinematic="ff">Fast-fwd</button>
          <button class="btn small" data-cinematic="skip">Skip</button>
        </div>
      </div>
      <div class="cin-bar bottom"></div>
    `;
  }

  // --- shop ---

  private shopTab: 'consumable' | 'component' | 'assembled' = 'assembled';
  private compendiumTab: 'lore' | 'heroes' | 'atlas' | 'cinematics' = 'lore';

  private renderShopModal(): void {
    const g = this.game;
    const u = g.activeUnit();
    if (!u) return;
    const defs = g.region.shopInventory.map((id) => REG.item(id));
    const groups: Record<string, ItemDef[]> = { consumable: [], component: [], assembled: [] };
    for (const d of defs) {
      if (d.tier === 'consumable') groups.consumable.push(d);
      else if (d.components && d.components.length > 0) groups.assembled.push(d);
      else groups.component.push(d);
    }

    const tabs = (['assembled', 'component', 'consumable'] as const)
      .map((t) => `<button class="tab ${this.shopTab === t ? 'on' : ''}" data-tab="${t}">${t === 'assembled' ? 'Items' : t === 'component' ? 'Components' : 'Consumables'}</button>`)
      .join('');

    let grid = '';
    for (const d of groups[this.shopTab]) {
      const plan = computeBuyPlan(d, u, g.gold);
      const discounted = plan.goldCost < d.cost;
      const components = d.components && d.components.length > 0 ? [`Built from: ${d.components.map((c) => REG.item(c).name).join(', ')}`] : [];
      const shopTip = this.registerTip(`shop-${d.id}`, buildItemCard(d), { accent: rarityColor(d.rarity), extra: components });
      const canBuy = plan.affordable && plan.fits;
      grid += `
        <div class="shop-item ${canBuy ? '' : 'cant'}" ${canBuy ? `data-buy="${d.id}"` : ''}${shopTip}>
          <img src="${itemIcon(d)}" alt="">
          <div class="si-name">${d.name}</div>
          <div class="si-cost ${discounted ? 'discount' : ''}">${plan.goldCost} g</div>
        </div>`;
    }

    let sellRow = '';
    u.items.forEach((it, i) => {
      if (!it) return;
      const d = REG.item(it.defId);
      sellRow += `
        <div class="shop-item sell" data-sell="${i}" title="Sell ${d.name} for ${sellValue(d)} g">
          <img src="${itemIcon(d)}" alt=""><div class="si-cost">+${sellValue(d)} g</div>
        </div>`;
    });

    this.modalShell(
      `${g.region.town.name} Shop — <span class="gold">${Math.floor(g.gold)} g</span>`,
      `
      <div class="shop-tabs">${tabs}</div>
      <div class="shop-grid">${grid}</div>
      <h3>Sell (active hero)</h3>
      <div class="shop-grid">${sellRow || '<p class="dim">Inventory empty.</p>'}</div>`
    );
    this.modal.querySelectorAll('[data-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        this.shopTab = (el as HTMLElement).dataset.tab as typeof this.shopTab;
        this.renderShopModal();
      });
    });
    this.modal.querySelectorAll('[data-buy]').forEach((el) => {
      el.addEventListener('click', () => {
        g.buyItem((el as HTMLElement).dataset.buy!);
        this.renderShopModal();
      });
    });
    this.modal.querySelectorAll('[data-sell]').forEach((el) => {
      el.addEventListener('click', () => {
        g.sellItem(Number((el as HTMLElement).dataset.sell));
        this.renderShopModal();
      });
    });
  }

  /** cheap dynamic refresh for open shop/party (gold changes etc.) */
  private refreshModalDynamic(): void {
    const goldEl = this.modal.querySelector('.modal-head .gold');
    if (goldEl) goldEl.textContent = `${Math.floor(this.game.gold)} g`;
  }

  // --- journal / codex ---

  private renderJournalModal(): void {
    const g = this.game;
    const regionHeroIds = new Set([
      ...g.region.heroSpawns.map((h) => h.heroId),
      ...(g.region.echoSpawns ?? []).map((h) => h.heroId),
      ...g.party.map((r) => r.heroId)
    ]);
    const rows = Array.from(REG.quests.values())
      .filter((q) => {
        const progress = g.questProgress[q.id];
        return progress?.stage !== 'bound' && (progress || regionHeroIds.has(q.heroId));
      })
      .slice(0, 18)
      .map((q) => {
        const hero = REG.hero(q.heroId);
        const progress = g.questProgress[q.id] ?? { stage: 'unfound', attunement: 0, trialCompletions: 0 };
        const stageText = {
          unfound: 'Rumor',
          found: 'Trial',
          'trial-complete': 'Binding Duel',
          bound: 'Recruited'
        }[progress.stage];
        const body = progress.stage === 'unfound'
          ? q.findText
          : progress.stage === 'found'
            ? q.trialText
            : q.bindText;
        return `
          <div class="journal-row">
            <div class="jr-stage">${stageText}</div>
            <div class="jr-main">
              <b>${hero.name}</b> <em>${REG.region(hero.region).name}</em>
              <p>${body}</p>
              <span>Attunement ${progress.attunement} · trials ${progress.trialCompletions}</span>
            </div>
          </div>`;
      })
      .join('');
    const j = g.journalSections();
    const repText = j.reputation > 0 ? `+${j.reputation} · revered` : j.reputation < 0 ? `${j.reputation} · feared` : '0 · neutral';
    const factionRows = j.factions
      .map((f) => `
        <div class="journal-row"><div class="jr-stage">Faction</div>
          <div class="jr-main"><b>${f.heroName}</b> <em>${f.regionName}</em>
          <p>You swore to this captain; the rival road is closed.</p></div></div>`)
      .join('') || '<p class="dim">No faction pacts sworn yet.</p>';
    const raidRows = j.raids
      .map((r) => `
        <div class="journal-row"><div class="jr-stage">Raid</div>
          <div class="jr-main"><b>${r.name}</b><p>Cleared ${r.clears}×.</p></div></div>`)
      .join('') || '<p class="dim">No raids cleared yet.</p>';
    const eliteText = j.elite.championDown
      ? 'Champion dethroned — the ancients answer to you now.'
      : `Elite Five defeated: ${j.elite.defeated}/5${j.elite.defeated >= 5 ? ' — the Champion awaits.' : ''}`;
    const badges = j.badges.map((b) => b.replace(/-/g, ' ')).join(', ') || 'none yet';
    let board = g.questBoard();
    // If the journal was opened by talking to a giver, float its board to the top.
    const focusGiver = this.questGiverFocus && REG.questGivers.has(this.questGiverFocus) ? REG.questGiver(this.questGiverFocus) : null;
    if (focusGiver) {
      board = [...board].sort((a, b) => (a.giver === focusGiver.board ? 0 : 1) - (b.giver === focusGiver.board ? 0 : 1));
    }
    const giverHeader = focusGiver
      ? `<p class="jr-flavor dim">Speaking with <b>${focusGiver.name}</b>${focusGiver.title ? ` — ${focusGiver.title}` : ''}.</p>`
      : '';
    const fmtTime = (s: number) => (s >= 3600 ? `${Math.ceil(s / 3600)}h` : s >= 60 ? `${Math.ceil(s / 60)}m` : `${s}s`);
    const questRows = board
      .map((q) => {
        const tag = q.kind === 'event' ? 'Chapter' : 'Bounty';
        const stateLabel = q.claimable
          ? 'Ready'
          : q.status === 'cooldown'
            ? `Cooldown ${fmtTime(q.cooldownLeft ?? 0)}`
            : q.expiresIn !== undefined
              ? `Expires ${fmtTime(q.expiresIn)}`
              : tag;
        const objs = q.objectives.map((o) => `${o.text} ${Math.min(o.have, o.need)}/${o.need}`).join(' · ');
        // A fork offers a button per branch; everything else a single Claim.
        const claimBtn = q.claimable
          ? q.choices && q.choices.length > 0
            ? `<div class="jr-choices">${q.choices
                .map(
                  (c) =>
                    `<button class="btn small accent" data-claim-quest="${q.id}" data-claim-choice="${c.id}" title="${c.note ? c.note.replace(/"/g, '&quot;') : ''}">${c.label}<span class="dim"> · ${c.rewards.join(', ')}</span></button>`
                )
                .join('')}</div>`
            : `<button class="btn small accent" data-claim-quest="${q.id}">Claim</button>`
          : '';
        const source = [q.giver ?? tag, q.region].filter(Boolean).join(' · ');
        const flavor = q.dialogue?.[0] ? `<p class="jr-flavor dim">&ldquo;${q.dialogue[0]}&rdquo;</p>` : '';
        const pinned = this.pinnedQuestIds.has(q.id);
        return `
          <div class="journal-row">
            <div class="jr-stage">${stateLabel}</div>
            <div class="jr-main">
              <b>${q.name}</b> <em>${source}</em> <button class="btn tiny ${pinned ? 'on' : ''}" data-pin-quest="${q.id}">${pinned ? 'Pinned' : 'Track'}</button>
              <p>${q.summary}</p>
              ${flavor}
              <span>${objs}</span>
              <span class="dim">Rewards: ${q.rewards.join(', ')}</span>
            </div>
            ${claimBtn}
          </div>`;
      })
      .join('');
    const titles = [...j.titles, ...g.questTitles().filter((t) => !j.titles.some((x) => x.id === t.id))];
    g.markJournalSeen([
      ...j.raids.map((r) => `raid:${r.id}`),
      ...j.factions.map((f) => `faction:${f.regionId}`),
      ...j.badges.map((b) => `badge:${b}`)
    ]);
    this.modalShell(
      'Quest Journal',
      `
      <div class="journal-summary">
        <b>${g.region.name}</b> · reputation ${repText} · recruited ${g.recruited.size}/${REG.heroes.size}
      </div>
      <h3>Bounties &amp; Chapters</h3>
      ${giverHeader}
      ${questRows || '<p class="dim">No bounties or chapters open yet. They unlock as you recruit, badge up, and descend.</p>'}
      <h3>Recruitment</h3>
      ${rows || '<p class="dim">No open quest leads in this region yet. Find echo scars, gyms, and hero rumors to fill the journal.</p>'}
      <h3>Conquest</h3>
      <div class="journal-row"><div class="jr-stage">Elite</div><div class="jr-main"><p>${eliteText}</p></div></div>
      ${raidRows}
      <h3>Factions</h3>
      ${factionRows}
      <h3>Badges</h3>
      <div class="journal-summary">${badges}</div>
      <h3>Titles</h3>
      ${titles.length
        ? titles.map((t) => `<div class="journal-row"><div class="jr-stage">Title</div><div class="jr-main"><p><b>${t.name}</b> — ${t.note}</p></div></div>`).join('')
        : '<p class="dim">Earn titles through legendary feats — like holding Roshan\'s Pit at its hardest tier.</p>'}`
    );
    this.modal.querySelectorAll<HTMLElement>('[data-claim-quest]').forEach((el) => {
      el.addEventListener('click', () => {
        if (this.game.claimQuest(el.dataset.claimQuest!, el.dataset.claimChoice)) this.renderJournalModal();
      });
    });
    this.modal.querySelectorAll<HTMLElement>('[data-pin-quest]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.pinQuest!;
        if (this.pinnedQuestIds.has(id)) this.pinnedQuestIds.delete(id);
        else this.pinnedQuestIds.add(id);
        this.renderJournalModal();
      });
    });
  }

  private renderCodexModal(): void {
    const labels = { lore: 'Lore', heroes: 'Heroes', atlas: 'Atlas', cinematics: 'Cinematics' } as const;
    const tabs = (['lore', 'heroes', 'atlas', 'cinematics'] as const)
      .map((t) => `<button class="tab ${this.compendiumTab === t ? 'on' : ''}" data-ctab="${t}">${labels[t]}</button>`)
      .join('');
    const body =
      this.compendiumTab === 'heroes'
        ? this.compendiumHeroesBody()
        : this.compendiumTab === 'atlas'
          ? this.compendiumAtlasBody()
          : this.compendiumTab === 'cinematics'
            ? this.compendiumCinematicsBody()
            : this.compendiumLoreBody();
    this.modalShell('Compendium', `<div class="shop-tabs">${tabs}</div>${body}`);
    this.modal.querySelectorAll('[data-ctab]').forEach((el) => {
      el.addEventListener('click', () => {
        this.compendiumTab = (el as HTMLElement).dataset.ctab as typeof this.compendiumTab;
        this.renderCodexModal();
      });
    });
    this.modal.querySelectorAll<HTMLElement>('[data-replay]').forEach((el) => {
      el.addEventListener('click', () => {
        if (this.game.replayCutscene(el.dataset.replay!)) this.closeModal();
      });
    });
  }

  private compendiumCinematicsBody(): string {
    const groups = this.game.cinematicGallery();
    const total = groups.reduce((n, g) => n + g.entries.length, 0);
    const seen = groups.reduce((n, g) => n + g.entries.filter((e) => e.seen).length, 0);
    const sections = groups
      .map((group) => {
        const entries = group.entries
          .map((e) =>
            e.seen
              ? `<div class="codex-note cin-gallery-entry">
                   <div><b>${e.title}</b> <em>${e.tier}</em><p>${e.caption}</p></div>
                   <button class="btn small" data-replay="${e.id}">Replay</button>
                 </div>`
              : `<div class="codex-note cin-gallery-entry locked">
                   <div><b>${e.title}</b> <em>${e.tier}</em><p class="dim">${e.caption}</p></div>
                 </div>`
          )
          .join('');
        return `<section class="codex-thread"><h3>${group.category}</h3>${entries}</section>`;
      })
      .join('');
    return `<p class="dim">Cinematics recorded: ${seen}/${total}. Replay any you have seen; locked ones stay spoiler-safe.</p>${sections || '<p class="dim">No cinematics recorded yet.</p>'}`;
  }

  private compendiumLoreBody(): string {
    const cx = this.game.codexEntries();
    const loop = cx.lore
      .filter((l) => l.thread === 'loop')
      .map((l) => `
        <div class="codex-note codex-thread-note">
          <b>${l.title}</b> <em>${l.stage}</em>
          <p><strong>${l.summary}</strong></p>
          <p>${l.body}</p>
        </div>`)
      .join('') || '<p class="dim">Follow badges and the Tower to reconstruct the Loop.</p>';
    const claimants = cx.claimants
      .map((c) => `<div class="codex-note"><b>${c.name}</b><p>${c.lore}</p></div>`)
      .join('') || '<p class="dim">Defeat Outworld Claimants to record the worlds held at the seal.</p>';
    const festivals = cx.festivals
      .map((f) => `<div class="codex-note"><b>${f.name}</b><em>${f.summary}</em><p>${f.body}</p></div>`)
      .join('') || '<p class="dim">Invoke festivals from Town Services to remember seasonal turns of the Loop.</p>';
    const legends = cx.legends
      .map((l) => `<div class="codex-note"><b>${l.name}</b><em>${l.summary}</em><p>${l.body}</p></div>`)
      .join('') || '<p class="dim">Recreate famous plays to wake the Legends track.</p>';
    const heroes = [...cx.heroes]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((h) => `
        <div class="codex-card">
          <img src="${heroPortrait(REG.hero(h.id).palette, h.name[0], 48, REG.hero(h.id).silhouette)}" alt="">
          <div><b>${h.name}</b> <em>${h.sub}</em>
          <p>${h.lore}</p></div>
        </div>`)
      .join('') || '<p class="dim">No heroes encountered yet — recruit to reveal them.</p>';
    const regions = cx.regions
      .map((r) => `<div class="codex-note"><b>${r.name}</b><p>${r.lore}</p></div>`)
      .join('') || '<p class="dim">Travel the world to reveal regions.</p>';
    const items = cx.items
      .map((i) => {
        const def = REG.item(i.id);
        const rarity = def.rarity ?? 'common';
        const src = def.exclusiveTo && def.exclusiveTo.length > 0 ? ` · ${def.exclusiveTo.join('/')}-only` : '';
        return `<div class="codex-note" style="border-left:3px solid ${rarityColor(rarity)}"><b style="color:${rarityColor(rarity)}">${i.name}</b> <em>${rarity}${src}</em><p>${i.lore}</p></div>`;
      })
      .join('') || '<p class="dim">Find or buy relics to reveal them.</p>';
    const creeps = cx.creeps
      .map((c) => `<div class="codex-note"><b>${c.name}</b><p>${c.lore}</p></div>`)
      .join('') || '<p class="dim">Capture wild creatures to fill the bestiary.</p>';
    const raids = cx.raids
      .map((r) => `<div class="codex-note"><b>${r.name}</b> <em>${r.title}</em><p>${r.lore}</p></div>`)
      .join('') || '<p class="dim">Clear raids to reveal their lords.</p>';
    return `
      <section class="codex-thread"><h3>The Loop</h3>${loop}</section>
      <section class="codex-thread"><h3>Outworld Claimants</h3>${claimants}</section>
      <section class="codex-thread"><h3>Festivals</h3>${festivals}</section>
      <section class="codex-thread"><h3>Legends</h3>${legends}</section>
      <div class="codex-grid">
        <section><h3>Known Heroes</h3>${heroes}</section>
        <section><h3>Regions</h3>${regions}</section>
        <section><h3>Relics</h3>${items}</section>
        <section><h3>Bestiary</h3>${creeps}</section>
        <section><h3>Raid Lords</h3>${raids}</section>
      </div>`;
  }

  private compendiumHeroesBody(): string {
    const hc = this.game.heroCompendium();
    if (hc.heroes.length === 0) return '<p class="dim">No heroes encountered yet — recruit or meet heroes to reveal their kits.</p>';
    const cards = hc.heroes.map((h) => {
      const abilities = h.abilities
        .map((a) => {
          const effect = a.effect.length > 0 ? `<p class="codex-effect">${a.effect.map((e) => esc(e)).join(' ')}</p>` : '';
          return `<li><b>${a.ult ? '★ ' : ''}${a.name}</b> <em>${a.kind} · cd ${a.cooldown} · mana ${a.manaCost}</em>${effect}${a.lore ? `<p class="codex-lore">${a.lore}</p>` : ''}</li>`;
        })
        .join('');
      const talents = h.talents
        .map((t) => {
          const left = `<span class="${t.picked === 0 ? 'tal-pick' : ''}">${t.options[0]}</span>`;
          const right = `<span class="${t.picked === 1 ? 'tal-pick' : ''}">${t.options[1]}</span>`;
          return `<div class="tal-row"><em>Lv ${t.level}</em> ${left} <span class="dim">·</span> ${right}</div>`;
        })
        .join('');
      const facets = h.facets.map((f) => `<li><b>${f.name}</b> — ${f.description}</li>`).join('');
      const aghs = h.aghs
        ? `<div class="codex-note"><b>Aghanim's: ${h.aghs.name}</b> <em>${h.aghs.implemented ? 'implemented' : 'planned'}</em><p>${h.aghs.description}</p></div>`
        : '';
      const ownTag = h.owned ? `<em>Owned · Lv ${h.level}</em>` : '<em>Met — plan the recruit</em>';
      const heroDef = REG.hero(h.id);
      const heroCard = buildHeroCard(heroDef, { level: h.owned ? h.level : null });
      const blurb = heroCard.blurb ? `<p class="hero-blurb">${esc(heroCard.blurb)}</p>` : '';
      const baseStats = `<div class="hero-base-stats">${heroCard.stats.map((s) => `<span>${esc(s)}</span>`).join('')}</div>`;
      const masteryPreview = deriveMasteryTrees(heroDef)
        .map((branch) => `<div class="codex-mastery-branch"><b>${esc(branch.name)}</b>${branch.nodes.map((node) => `<span title="${esc(node.description)}">${node.tier}. ${esc(node.name)}</span>`).join('')}</div>`)
        .join('');
      return `
        <div class="codex-card hero-codex">
          <img src="${heroPortrait(heroDef.palette, h.name[0], 48, heroDef.silhouette)}" alt="">
          <div>
            <b>${h.name}</b> <span class="dim">${h.title}</span><br>
            <em>${h.attribute} · ${h.roles.slice(0, 3).join(' / ')}</em> ${ownTag}
            ${blurb}
            ${baseStats}
            <h4>Abilities</h4><ul class="codex-list">${abilities}</ul>
            <h4>Mastery Tree</h4><div class="codex-mastery-grid">${masteryPreview}</div>
            <details class="legacy-talents"><summary>Legacy talents</summary>${talents}</details>
            <h4>Facets</h4><ul class="codex-list">${facets}</ul>
            ${aghs}
          </div>
        </div>`;
    }).join('');
    return `<h3>Heroes (${hc.heroes.length})</h3><div class="compendium-single">${cards}</div>`;
  }

  private compendiumAtlasBody(): string {
    const atlas = this.game.atlasEntries();
    if (atlas.items.length === 0) return '<p class="dim">Find, buy, or drop items to chart their sources in the Atlas.</p>';
    const cards = atlas.items.map((i) => {
      const reserved = i.reserved ? ` · <span style="color:${rarityColor(i.rarity)}">${i.reserved}</span>` : '';
      const recipe = i.recipe.length > 0
        ? `<div class="atlas-recipe">Recipe: ${i.recipe.map((c) => `<span class="${c.gated ? 'atlas-core' : ''}">${c.name}${c.gated ? ' (drop core)' : ''}</span>`).join(' + ')}${i.recipeCost > 0 ? ` + ${i.recipeCost}g` : ''}</div>`
        : '';
      const sources = i.sources.length > 0
        ? `<ul class="codex-list">${i.sources.map((s) => `<li><b>${s.label}</b> <em>${s.detail}</em></li>`).join('')}</ul>`
        : '<p class="dim">No farmable source yet — shop or recipe only.</p>';
      const card = buildItemCard(REG.item(i.id));
      const effect = card.effect.length > 0 ? `<p class="codex-effect">${card.effect.map((e) => esc(e)).join(' ')}</p>` : '';
      const stats = card.stats.length > 0 ? `<div class="atlas-qual">${card.stats.map((s) => esc(s)).join(' · ')}</div>` : '';
      return `
        <div class="codex-note" style="border-left:3px solid ${rarityColor(i.rarity)}">
          <b style="color:${rarityColor(i.rarity)}">${i.name}</b> <em>${i.rarity} · ${i.tier} · ${i.cost}g${reserved}</em>
          ${effect}${stats}
          ${recipe}
          <div class="atlas-qual dim">Qualities: ${i.qualities.join(', ')}</div>
          <h4>Sources</h4>${sources}
        </div>`;
    }).join('');
    return `<h3>Atlas — ${atlas.items.length} items charted</h3><div class="compendium-single">${cards}</div>`;
  }

  // --- talents ---

  private renderTalentModal(): void {
    const g = this.game;
    const recIdx = g.activeIdx;
    const rec = g.party[recIdx];
    if (!rec) {
      this.closeModal();
      return;
    }
    const def = REG.hero(rec.heroId);
    const tier = g.pendingTalentTier(rec);
    if (tier < 0) {
      this.closeModal();
      return;
    }
    const t = def.talents[tier];
    const echoUnlocked = rec.echo.talentTierUnlocks[tier];
    const echoText = echoUnlocked
      ? 'Echo attunement unlocked: after you choose a branch, the opposite branch applies too.'
      : "The other branch stays echo-locked until this hero's echo is defeated.";
    const optionHtml = (pick: 0 | 1) => {
      const option = t.options[pick];
      const details = talentDetailLines(option, def);
      const detailsHtml = details.length > 0
        ? `<em>${details.map((line) => esc(line)).join(' · ')}</em>`
        : '<em>Kit upgrade</em>';
      return `<button class="talent-opt" data-pick="${pick}"><b>${esc(option.name)}</b>${detailsHtml}</button>`;
    };
    this.modalShell(
      `${def.name} — Level ${t.level} Talent`,
      `
      <div class="talent-choice">
        ${optionHtml(0)}
        <div class="talent-or">or</div>
        ${optionHtml(1)}
      </div>
      <p class="dim">${echoText}</p>`
    );
    this.modal.querySelectorAll('[data-pick]').forEach((el) => {
      el.addEventListener('click', () => {
        g.applyTalent(recIdx, tier, Number((el as HTMLElement).dataset.pick) as 0 | 1);
        this.closeModal();
      });
    });
  }

  // --- menu (save/load/settings) ---

  private controlsSettingsHtml(): string {
    const groups = ['Movement', 'Abilities', 'Items', 'Party', 'Interface'] as const;
    return groups.map((group) => {
      const rows = INPUT_ACTIONS
        .filter((action) => ACTION_META[action].group === group)
        .map((action) => {
          const meta = ACTION_META[action];
          const locked = !canRebindAction(action);
          return `
            <div class="keybind-row ${locked ? 'locked' : ''}">
              <span>${esc(meta.label)}</span>
              <button class="btn tiny keybind-key" data-rebind="${action}" ${locked ? 'disabled' : ''}>${esc(glyphForAction(this.game.settings, action))}</button>
            </div>`;
        })
        .join('');
      return `<section class="keybind-group"><h4>${group}</h4>${rows}</section>`;
    }).join('');
  }

  private bindControlsSettings(): void {
    const g = this.game;
    this.modal.querySelectorAll<HTMLElement>('[data-rebind]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = el.dataset.rebind as InputAction | undefined;
        if (!action || !canRebindAction(action)) return;
        const oldText = el.textContent ?? '';
        el.textContent = 'Press a key...';
        el.classList.add('listening');
        const capture = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener('keydown', capture, true);
          const key = keyEventToBinding(e);
          if (key === 'escape') {
            el.textContent = oldText;
            el.classList.remove('listening');
            return;
          }
          const result = rebindAction(g.settings, action, key);
          if (!result.ok) {
            const conflict = result.conflict ? ACTION_META[result.conflict].label : result.reason ?? 'Invalid key';
            g.msg(`Key conflict: ${conflict}`, 'bad');
          }
          this.renderMenuModal();
        };
        window.addEventListener('keydown', capture, true);
      });
    });
    this.modal.querySelector('#reset-keybinds')?.addEventListener('click', () => {
      resetKeyBindings(g.settings);
      this.renderMenuModal();
    });
  }

  private renderMenuModal(): void {
    const g = this.game;
    const slots = [0, 1, 2]
      .map((i) => {
        const info = Game_slotInfo(i);
        return `
        <div class="save-slot">
          <div class="ss-info">${info ? `<b>${info.name}</b> Lv ${info.level} · ${fmtTime(info.playtime)} · ${new Date(info.savedAt).toLocaleTimeString()}` : '<span class="dim">Empty slot</span>'}</div>
          <button class="btn small" data-save="${i}">Save</button>
          ${info ? `<button class="btn small" data-load="${i}">Load</button>` : ''}
        </div>`;
      })
      .join('');
    const auto = Game_slotInfo('auto');
    const ui = this.interfaceSettings();

    this.modalShell(
      'Menu',
      `
      <div class="menu-grid">
        <section>
          <h3>Save slots</h3>
          ${slots}
          <div class="save-slot"><div class="ss-info">${auto ? `<b>Autosave</b> — ${new Date(auto.savedAt).toLocaleTimeString()}` : '<span class="dim">No autosave yet</span>'}</div>
            ${auto ? '<button class="btn small" data-load="auto">Load</button>' : ''}
          </div>
        </section>
        <section>
          <h3>Controls</h3>
          <label class="opt-row"><input type="checkbox" id="opt-quickcast" ${g.settings.quickcast ? 'checked' : ''}> Quick-cast at cursor</label>
          <div class="keybind-panel">${this.controlsSettingsHtml()}</div>
          <button class="btn small" id="reset-keybinds">Reset controls to defaults</button>
          <h3>Interface</h3>
          <label class="opt-row">UI scale <input type="range" id="opt-ui-scale" min="0.75" max="1.5" step="0.05" value="${ui.uiScale}"></label>
          <label class="opt-row">Text size <input type="range" id="opt-text-scale" min="1" max="1.3" step="0.05" value="${ui.textScale}"></label>
          <label class="opt-row">HUD opacity <input type="range" id="opt-hud-opacity" min="0.55" max="1" step="0.05" value="${ui.hudOpacity}"></label>
          <label class="opt-row"><input type="checkbox" id="opt-minimap" ${g.settings.minimap !== false ? 'checked' : ''}> Show minimap</label>
          <label class="opt-row">Minimap size <input type="range" id="opt-minimap-size" min="120" max="240" step="10" value="${ui.minimapSize}"></label>
          <label class="opt-row">Minimap opacity <input type="range" id="opt-minimap-opacity" min="0.35" max="1" step="0.05" value="${ui.minimapOpacity}"></label>
          <label class="opt-row"><input type="checkbox" id="opt-help-overlay" ${ui.helpOverlay ? 'checked' : ''}> Show help button</label>
          <label class="opt-row"><input type="checkbox" id="opt-quest-tracker" ${ui.questTracker ? 'checked' : ''}> Show quest tracker</label>
          <label class="opt-row">Tracked quests
            <select id="opt-quest-tracker-max">
              ${([1, 2, 3] as const).map((v) => `<option value="${v}"${ui.questTrackerMax === v ? ' selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
          <h3>Options</h3>
          <label class="opt-row"><input type="checkbox" id="opt-resonance" ${g.settings.resonance ? 'checked' : ''}> Resonance mode (micro/raids)</label>
          <label class="opt-row"><input type="checkbox" id="opt-swap-charges" ${g.settings.swapCharges ? 'checked' : ''}> Swap charges (high-skill: 2 charges, no floor)</label>
          <label class="opt-row"><input type="checkbox" id="opt-mute" ${g.settings.audio.muted ? 'checked' : ''}> Mute all audio</label>
          <label class="opt-row">Master volume <input type="range" id="opt-master-volume" min="0" max="1" step="0.05" value="${g.settings.audio.master}"></label>
          <label class="opt-row">SFX volume <input type="range" id="opt-sfx-volume" min="0" max="1" step="0.05" value="${g.settings.audio.sfx}"></label>
          <label class="opt-row">UI volume <input type="range" id="opt-ui-volume" min="0" max="1" step="0.05" value="${g.settings.audio.ui ?? g.settings.audio.sfx}"></label>
          <label class="opt-row">Voice volume <input type="range" id="opt-voice-volume" min="0" max="1" step="0.05" value="${g.settings.audio.voice}"></label>
          <label class="opt-row">Stinger volume <input type="range" id="opt-stinger-volume" min="0" max="1" step="0.05" value="${g.settings.audio.stinger}"></label>
          <label class="opt-row">Music volume <input type="range" id="opt-music-volume" min="0" max="1" step="0.05" value="${g.settings.audio.music}"></label>
          <h3>Graphics</h3>
          <label class="opt-row">Quality
            <select id="opt-quality">
              ${(['auto', 'low', 'medium', 'high', 'ultra'] as const)
                .map((q) => `<option value="${q}"${(g.settings.graphics?.quality ?? 'auto') === q ? ' selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`)
                .join('')}
            </select>
          </label>
          <label class="opt-row"><input type="checkbox" id="opt-auto-quality" ${(g.settings.graphics?.autoAdjustQuality ?? true) ? 'checked' : ''}> Auto-adjust quality when frames drop</label>
          <label class="opt-row">Frame target
            <select id="opt-frame-target">
              ${([60, 30] as const)
                .map((v) => `<option value="${v}"${(g.settings.graphics?.frameTarget ?? 60) === v ? ' selected' : ''}>${v} fps</option>`)
                .join('')}
            </select>
          </label>
          <label class="opt-row">Bloom
            <select id="opt-bloom">
              ${(['tier', 'off', 'low', 'high'] as const).map((v) => `<option value="${v}"${(g.settings.graphics?.bloom ?? 'tier') === v ? ' selected' : ''}>${v === 'tier' ? 'Tier' : v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
            </select>
          </label>
          <label class="opt-row">Anti-aliasing
            <select id="opt-aa">
              ${(['tier', 'off', 'on'] as const).map((v) => `<option value="${v}"${(g.settings.graphics?.antiAliasing ?? 'tier') === v ? ' selected' : ''}>${v === 'tier' ? 'Tier' : v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
            </select>
          </label>
          <label class="opt-row">Ambient occlusion
            <select id="opt-ao">
              ${(['tier', 'off', 'on'] as const).map((v) => `<option value="${v}"${(g.settings.graphics?.ambientOcclusion ?? 'tier') === v ? ' selected' : ''}>${v === 'tier' ? 'Tier' : v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
            </select>
          </label>
          <label class="opt-row">Shadows
            <select id="opt-shadows">
              ${(['tier', 'off', 'low', 'high'] as const).map((v) => `<option value="${v}"${(g.settings.graphics?.shadows ?? 'tier') === v ? ' selected' : ''}>${v === 'tier' ? 'Tier' : v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
            </select>
          </label>
          <label class="opt-row">Draw distance
            <select id="opt-draw-distance">
              ${(['low', 'medium', 'high'] as const).map((v) => `<option value="${v}"${(g.settings.graphics?.drawDistance ?? 'medium') === v ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
            </select>
          </label>
          <label class="opt-row">Crowd detail
            <select id="opt-crowd-detail">
              ${(['auto', 'full', 'balanced', 'reduced'] as const).map((v) => `<option value="${v}"${(g.settings.graphics?.crowdDetail ?? 'auto') === v ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
            </select>
          </label>
          <label class="opt-row">VFX density <input type="range" id="opt-vfx-density" min="0.5" max="1.5" step="0.05" value="${g.settings.graphics?.vfxDensity ?? 1}"></label>
          <label class="opt-row">Overworld battle scale <input type="range" id="opt-battle-scale" min="0.5" max="1.5" step="0.05" value="${g.settings.graphics?.battleScale ?? 1}"></label>
          <label class="opt-row">Screen shake <input type="range" id="opt-screen-shake" min="0" max="1" step="0.05" value="${g.settings.graphics?.screenShake ?? 1}"></label>
          <label class="opt-row">Exposure <input type="range" id="opt-exposure" min="0.5" max="1.5" step="0.02" value="${g.settings.graphics?.exposure ?? 0.92}"></label>
          <label class="opt-row">Color grade <input type="range" id="opt-grade" min="0" max="1.5" step="0.05" value="${g.settings.graphics?.grade ?? 1}"></label>
          <label class="opt-row"><input type="checkbox" id="opt-reduced-motion" ${g.settings.graphics?.reducedMotion ? 'checked' : ''}> Reduced motion (ambient FX)</label>
          <label class="opt-row"><input type="checkbox" id="opt-colorblind" ${g.settings.graphics?.colorblind ? 'checked' : ''}> Colorblind-safe loot palette</label>
          <h3>Cut-scenes</h3>
          <label class="opt-row">Length
            <select id="opt-cutscene-length">
              ${(['full', 'short', 'off'] as const)
                .map((v) => `<option value="${v}"${(g.settings.cutscene?.length ?? 'full') === v ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`)
                .join('')}
            </select>
          </label>
          <label class="opt-row">Default speed
            <select id="opt-cutscene-speed">
              ${([1, 2, 4] as const)
                .map((v) => `<option value="${v}"${(g.settings.cutscene?.defaultSpeed ?? 1) === v ? ' selected' : ''}>${v}x</option>`)
                .join('')}
            </select>
          </label>
          <label class="opt-row"><input type="checkbox" id="opt-cutscene-skip" ${g.settings.cutscene?.alwaysSkip ? 'checked' : ''}> Always skip cut-scenes</label>
          <label class="opt-row"><input type="checkbox" id="opt-cutscene-photosensitive" ${g.settings.cutscene?.photosensitive ? 'checked' : ''}> Limit cinematic flashes</label>
          <label class="opt-row"><input type="checkbox" id="opt-cutscene-tieins" ${(g.settings.cutscene?.tieIns ?? true) ? 'checked' : ''}> Seasonal and esports tie-ins</label>
          <button class="btn" id="open-journal">Quest Journal</button>
          <button class="btn" id="open-codex">Codex</button>
          <button class="btn" id="export-save">Export save (JSON)</button>
          <label class="btn" for="import-file">Import save<input type="file" id="import-file" accept=".json" hidden></label>
          <button class="btn warn" id="quit-title">Quit to title</button>
          <p class="dim">Playtime ${fmtTime(Math.round(g.playtime))} · ${g.canSave().ok ? 'Safe to save' : g.canSave().reason}</p>
        </section>
      </div>`
    );

    this.modal.querySelectorAll('[data-save]').forEach((el) => {
      el.addEventListener('click', () => {
        if (g.saveToSlot(Number((el as HTMLElement).dataset.save))) this.renderMenuModal();
      });
    });
    this.modal.querySelectorAll('[data-load]').forEach((el) => {
      el.addEventListener('click', () => {
        const v = (el as HTMLElement).dataset.load!;
        const save = Game_loadSlot(v === 'auto' ? 'auto' : Number(v));
        if (save) {
          this.closeModal();
          window.dispatchEvent(new CustomEvent('ancients:load', { detail: save }));
        }
      });
    });
    this.bindControlsSettings();
    this.modal.querySelector('#opt-quickcast')?.addEventListener('change', (e) => {
      g.settings.quickcast = (e.target as HTMLInputElement).checked;
    });
    this.modal.querySelector('#opt-ui-scale')?.addEventListener('input', (e) => {
      this.interfaceSettings().uiScale = clampNum(Number((e.target as HTMLInputElement).value), 0.75, 1.5);
      this.applyInterfaceSettings();
    });
    this.modal.querySelector('#opt-text-scale')?.addEventListener('input', (e) => {
      this.interfaceSettings().textScale = clampNum(Number((e.target as HTMLInputElement).value), 1, 1.3);
      this.applyInterfaceSettings();
    });
    this.modal.querySelector('#opt-hud-opacity')?.addEventListener('input', (e) => {
      this.interfaceSettings().hudOpacity = clampNum(Number((e.target as HTMLInputElement).value), 0.55, 1);
      this.applyInterfaceSettings();
    });
    this.modal.querySelector('#opt-minimap')?.addEventListener('change', (e) => {
      g.settings.minimap = (e.target as HTMLInputElement).checked;
    });
    this.modal.querySelector('#opt-minimap-size')?.addEventListener('input', (e) => {
      this.interfaceSettings().minimapSize = clampNum(Number((e.target as HTMLInputElement).value), 120, 240);
      this.applyInterfaceSettings();
    });
    this.modal.querySelector('#opt-minimap-opacity')?.addEventListener('input', (e) => {
      this.interfaceSettings().minimapOpacity = clampNum(Number((e.target as HTMLInputElement).value), 0.35, 1);
      this.applyInterfaceSettings();
    });
    this.modal.querySelector('#opt-help-overlay')?.addEventListener('change', (e) => {
      this.interfaceSettings().helpOverlay = (e.target as HTMLInputElement).checked;
    });
    this.modal.querySelector('#opt-quest-tracker')?.addEventListener('change', (e) => {
      this.interfaceSettings().questTracker = (e.target as HTMLInputElement).checked;
    });
    this.modal.querySelector('#opt-quest-tracker-max')?.addEventListener('change', (e) => {
      this.interfaceSettings().questTrackerMax = Math.round(clampNum(Number((e.target as HTMLSelectElement).value), 1, 3));
    });
    this.modal.querySelector('#opt-resonance')?.addEventListener('change', (e) => {
      g.setResonanceEnabled((e.target as HTMLInputElement).checked);
    });
    this.modal.querySelector('#opt-swap-charges')?.addEventListener('change', (e) => {
      g.setSwapChargesEnabled((e.target as HTMLInputElement).checked);
    });
    this.modal.querySelector('#opt-mute')?.addEventListener('change', (e) => {
      g.settings.audio.muted = (e.target as HTMLInputElement).checked;
      g.audio.setSettings(g.settings);
    });
    this.modal.querySelector('#opt-master-volume')?.addEventListener('input', (e) => {
      g.settings.audio.master = Number((e.target as HTMLInputElement).value);
      g.audio.setSettings(g.settings);
    });
    this.modal.querySelector('#opt-sfx-volume')?.addEventListener('input', (e) => {
      g.settings.audio.sfx = Number((e.target as HTMLInputElement).value);
      g.audio.setSettings(g.settings);
    });
    this.modal.querySelector('#opt-ui-volume')?.addEventListener('input', (e) => {
      g.settings.audio.ui = Number((e.target as HTMLInputElement).value);
      g.audio.setSettings(g.settings);
    });
    this.modal.querySelector('#opt-voice-volume')?.addEventListener('input', (e) => {
      g.settings.audio.voice = Number((e.target as HTMLInputElement).value);
      g.audio.setSettings(g.settings);
    });
    this.modal.querySelector('#opt-stinger-volume')?.addEventListener('input', (e) => {
      g.settings.audio.stinger = Number((e.target as HTMLInputElement).value);
      g.audio.setSettings(g.settings);
    });
    this.modal.querySelector('#opt-music-volume')?.addEventListener('input', (e) => {
      g.settings.audio.music = Number((e.target as HTMLInputElement).value);
      g.audio.setSettings(g.settings);
    });
    this.modal.querySelector('#opt-quality')?.addEventListener('change', (e) => {
      g.setQualityTier((e.target as HTMLSelectElement).value as GraphicsSettings['quality']);
    });
    this.modal.querySelector('#opt-auto-quality')?.addEventListener('change', (e) => {
      if (g.settings.graphics) g.settings.graphics.autoAdjustQuality = (e.target as HTMLInputElement).checked;
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-frame-target')?.addEventListener('change', (e) => {
      if (g.settings.graphics) g.settings.graphics.frameTarget = Number((e.target as HTMLSelectElement).value) as 30 | 60;
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-bloom')?.addEventListener('change', (e) => {
      if (g.settings.graphics) g.settings.graphics.bloom = (e.target as HTMLSelectElement).value as GraphicsSettings['bloom'];
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-aa')?.addEventListener('change', (e) => {
      if (g.settings.graphics) g.settings.graphics.antiAliasing = (e.target as HTMLSelectElement).value as GraphicsSettings['antiAliasing'];
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-ao')?.addEventListener('change', (e) => {
      if (g.settings.graphics) g.settings.graphics.ambientOcclusion = (e.target as HTMLSelectElement).value as GraphicsSettings['ambientOcclusion'];
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-shadows')?.addEventListener('change', (e) => {
      if (g.settings.graphics) g.settings.graphics.shadows = (e.target as HTMLSelectElement).value as GraphicsSettings['shadows'];
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-draw-distance')?.addEventListener('change', (e) => {
      if (g.settings.graphics) g.settings.graphics.drawDistance = (e.target as HTMLSelectElement).value as GraphicsSettings['drawDistance'];
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-crowd-detail')?.addEventListener('change', (e) => {
      if (g.settings.graphics) g.settings.graphics.crowdDetail = (e.target as HTMLSelectElement).value as GraphicsSettings['crowdDetail'];
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-vfx-density')?.addEventListener('input', (e) => {
      if (g.settings.graphics) g.settings.graphics.vfxDensity = Number((e.target as HTMLInputElement).value);
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-battle-scale')?.addEventListener('input', (e) => {
      if (g.settings.graphics) g.settings.graphics.battleScale = Number((e.target as HTMLInputElement).value);
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-screen-shake')?.addEventListener('input', (e) => {
      if (g.settings.graphics) g.settings.graphics.screenShake = Number((e.target as HTMLInputElement).value);
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-exposure')?.addEventListener('input', (e) => {
      if (g.settings.graphics) g.settings.graphics.exposure = Number((e.target as HTMLInputElement).value);
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-grade')?.addEventListener('input', (e) => {
      if (g.settings.graphics) g.settings.graphics.grade = Number((e.target as HTMLInputElement).value);
      g.applyGraphics();
    });
    this.modal.querySelector('#opt-reduced-motion')?.addEventListener('change', (e) => {
      if (g.settings.graphics) g.settings.graphics.reducedMotion = (e.target as HTMLInputElement).checked;
      g.applyGraphics();
      g.applyCutsceneSettings();
    });
    this.modal.querySelector('#opt-colorblind')?.addEventListener('change', (e) => {
      if (g.settings.graphics) g.settings.graphics.colorblind = (e.target as HTMLInputElement).checked;
      g.applyGraphics();
      this.renderMenuModal();
    });
    this.modal.querySelector('#opt-cutscene-length')?.addEventListener('change', (e) => {
      if (g.settings.cutscene) g.settings.cutscene.length = (e.target as HTMLSelectElement).value as 'full' | 'short' | 'off';
      g.applyCutsceneSettings();
    });
    this.modal.querySelector('#opt-cutscene-speed')?.addEventListener('change', (e) => {
      if (g.settings.cutscene) g.settings.cutscene.defaultSpeed = Number((e.target as HTMLSelectElement).value) as 1 | 2 | 4;
      g.applyCutsceneSettings();
    });
    this.modal.querySelector('#opt-cutscene-skip')?.addEventListener('change', (e) => {
      if (g.settings.cutscene) g.settings.cutscene.alwaysSkip = (e.target as HTMLInputElement).checked;
      g.applyCutsceneSettings();
    });
    this.modal.querySelector('#opt-cutscene-photosensitive')?.addEventListener('change', (e) => {
      if (g.settings.cutscene) g.settings.cutscene.photosensitive = (e.target as HTMLInputElement).checked;
      g.applyCutsceneSettings();
    });
    this.modal.querySelector('#opt-cutscene-tieins')?.addEventListener('change', (e) => {
      if (g.settings.cutscene) g.settings.cutscene.tieIns = (e.target as HTMLInputElement).checked;
    });
    this.modal.querySelector('#export-save')?.addEventListener('click', () => g.exportSave());
    this.modal.querySelector('#open-journal')?.addEventListener('click', () => this.toggleModal('journal'));
    this.modal.querySelector('#open-codex')?.addEventListener('click', () => this.toggleModal('codex'));
    this.modal.querySelector('#import-file')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      file.text().then((txt) => {
        try {
          const save = JSON.parse(txt) as unknown;
          if (!Game.validateSave(save)) throw new Error('bad save');
          window.dispatchEvent(new CustomEvent('ancients:load', { detail: save }));
        } catch {
          g.msg('Invalid save file', 'bad');
        }
      });
    });
    this.modal.querySelector('#quit-title')?.addEventListener('click', () => {
      this.closeModal();
      this.onQuitToTitle();
    });
  }

  dispose(): void {
    window.removeEventListener('dragover', this.onItemDragOver);
    window.removeEventListener('drop', this.onItemDrop);
    window.removeEventListener('dragend', this.onItemDragEnd);
    this.root.innerHTML = '';
  }
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const Game_slotInfo = Game.slotInfo;
const Game_loadSlot = Game.loadSlot;
