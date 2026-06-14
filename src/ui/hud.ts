import { REG } from '../core/registry';
import { TUNING } from '../data/tuning';
import { QUALITY_GRADES, qualityColor, rarityColor } from '../data/quality';
import { affixDef } from '../data/affixes';
import { GRADE_DEFS } from '../data/grade';
import { gemDef } from '../data/gems';
import { itemSetDef } from '../data/sets';
import { xpProgress } from '../core/progression';
import { itemReady, sellValue, computeBuyPlan } from '../core/items';
import { buybackCost } from '../core/phase3';
import { abilityMaxLevel, abilityRankRequiredHeroLevel, levelArr } from '../core/values';
import { buildDefaultGambit } from '../core/controllers';
import { statLabel, fmtStatValue, statLines, buildAbilityCard, buildItemCard, buildNeutralItemCard, buildHeroCard, type TooltipCard } from '../core/describe';
import { abilityIcon, itemIcon, heroPortrait } from '../engine/icons';
import { WORLD_SCALE } from '../engine/scale';
import { Game } from '../systems/game';
import type { InputController } from '../systems/input';
import type { Unit } from '../core/unit';
import type { DifficultyTier, GambitAction, GambitCondition, GambitRule, GambitTargetMode, GraphicsSettings, HeroDef, ItemDef, ItemRarity, ItemSave, SimEvent, StatModMap, TalentDef } from '../core/types';
import * as THREE from 'three';

// ------------------------------------------------------------------
// HUD: DOM overlay. Reads game state every frame; all interactions
// call back into Game. No game logic lives here.
// ------------------------------------------------------------------

const ABILITY_KEYS = ['Q', 'W', 'E', 'R', 'D', 'F'];
const ITEM_KEYS = ['Z', 'X', 'C', 'V', '·', '·'];
const GOLD_STREAK_WINDOW_MS = 1500;
const RARITY_ORDER: ItemRarity[] = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana'];
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
  reactionAmpPct: 2,
  elementalGaugeSec: 8,
  staminaBonus: 0.04
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
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

export class Hud {
  root: HTMLElement;
  private topBar: HTMLElement;
  private partyCol: HTMLElement;
  private heroPanel: HTMLElement;
  private toastCol: HTMLElement;
  private captureBar: HTMLElement;
  private floaterLayer: HTMLElement;
  private minimap: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;
  private modal: HTMLElement;
  private hint: HTMLElement;
  private trialChoice: HTMLElement;
  private lastTrialChoiceKey = '';
  private liveGymBar: HTMLElement;
  private cinematicLayer: HTMLElement;
  private hoverCard!: HTMLElement;
  private tips = new Map<string, string>();
  private hoverKey: string | null = null;
  private hoverKind: 'ui' | 'world' | null = null;
  private lastLiveGymKey = '';
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
  private gambitReturnTo: 'party' | 'prefight' | 'none' = 'none';
  private prefightGymId: string | null = null;
  private dungeonEntryId: string | null = null;

  private floaters: Floater[] = [];
  private coinFx: CoinFx[] = [];
  private shownToasts = 0;
  private modalKind: 'none' | 'party' | 'shop' | 'menu' | 'talents' | 'journal' | 'codex' | 'gambit' | 'prefight' | 'dungeon-entry' | 'services' = 'none';
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

  constructor(
    private game: Game,
    private input: InputController,
    private onQuitToTitle: () => void
  ) {
    this.root = document.getElementById('ui-root')!;
    this.root.innerHTML = `
      <div id="top-bar"></div>
      <div id="party-col"></div>
      <canvas id="minimap" width="160" height="160"></canvas>
      <div id="toast-col"></div>
      <div id="floater-layer"></div>
      <div id="capture-bar" class="hidden"><div class="fill"></div><span>Binding...</span></div>
      <div id="hero-panel"></div>
      <div id="hud-hint"></div>
      <div id="trial-choice" class="hidden"></div>
      <div id="live-gym-bar" class="hidden"></div>
      <div id="cinematic-layer" class="hidden"></div>
      <div id="modal-root" class="hidden"></div>
      <div id="hover-card" class="hidden"></div>
    `;
    this.topBar = this.root.querySelector('#top-bar')!;
    this.partyCol = this.root.querySelector('#party-col')!;
    this.heroPanel = this.root.querySelector('#hero-panel')!;
    this.toastCol = this.root.querySelector('#toast-col')!;
    this.captureBar = this.root.querySelector('#capture-bar')!;
    this.floaterLayer = this.root.querySelector('#floater-layer')!;
    this.minimap = this.root.querySelector('#minimap')!;
    this.minimapCtx = this.minimap.getContext('2d')!;
    this.modal = this.root.querySelector('#modal-root')!;
    this.hint = this.root.querySelector('#hud-hint')!;
    this.trialChoice = this.root.querySelector('#trial-choice')!;
    this.trialChoice.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-choice]') as HTMLElement | null;
      if (btn?.dataset.choice) this.game.resolveTrialChoice(btn.dataset.choice);
    });
    this.liveGymBar = this.root.querySelector('#live-gym-bar')!;
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
    input.onToggleServices = () => this.toggleModal('services');
    window.addEventListener('dragover', this.onItemDragOver);
    window.addEventListener('drop', this.onItemDrop);
    window.addEventListener('dragend', this.onItemDragEnd);
    this.topBar.addEventListener('click', (e) => {
      const open = (e.target as HTMLElement).closest('[data-open]') as HTMLElement | null;
      const kind = open?.dataset.open as 'journal' | 'codex' | undefined;
      if (kind) this.toggleModal(kind);
    });
    this.hoverCard = this.root.querySelector('#hover-card')!;
    this.setupHoverCard();
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
      s.invulnerable ? 1 : 0
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
    const s = u.summary;
    return [
      s.stunned ? 'Stunned' : '',
      s.rooted ? 'Rooted' : '',
      s.silenced ? 'Silenced' : '',
      s.disarmed ? 'Disarmed' : '',
      s.hexed ? 'Hexed' : '',
      s.magicImmune ? 'Magic Immune' : '',
      s.invisible ? 'Invisible' : '',
      s.invulnerable ? 'Invulnerable' : ''
    ].filter(Boolean);
  }

  private worldUnitAccent(u: Unit): string {
    if (u.team === 0) return 'var(--good)';
    if (u.team === 2) return 'var(--brass-lite)';
    return 'var(--bad)';
  }

  // ---------- per frame ----------

  update(): void {
    this.updateGoldTween();
    this.renderTopBar();
    this.renderParty();
    this.renderHeroPanel();
    this.renderMinimap();
    this.renderToasts();
    this.handleEvents(this.game.frameEvents);
    this.updateFloaters();
    this.updateCoinFx();
    this.updateCaptureBar();
    this.renderHint();
    this.renderWorldHoverCard();
    this.renderTrialChoice();
    this.renderLiveGym();
    this.renderCinematic();
    if (this.modalKind === 'shop' || this.modalKind === 'party') this.refreshModalDynamic();
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
    this.topBar.innerHTML = `
      <span class="region">${g.region.name}</span>
      <span class="daynight" title="${isNight ? 'Night' : 'Day'} ${clockPct}%">
        <span class="dn-dial"><span class="dn-marker ${isNight ? 'moon' : 'sun'}" style="transform:rotate(${(t * 360 - 90).toFixed(1)}deg)"></span></span>
        <span class="clock ${isNight ? 'night' : 'day'}">${isNight ? 'Night' : 'Day'} ${clockPct}%</span>
      </span>
      <span class="gold-counter ${goldPop ? 'pop' : ''}" data-gold-counter>
        <span class="coin-icon">◆</span>
        <span class="gold-amount">${Math.floor(this.displayGold)}</span><span class="gold-unit">g</span>
        ${streakActive ? `<span class="gold-streak">×${this.goldStreak}</span>` : ''}
      </span>
      <span class="stamina-chip" title="Stamina: sprint and dash (${Math.round(g.stamina)}/${staminaMax})">
        <span>STA</span><b>${staminaPct}%</b><i><em style="width:${staminaPct}%"></em></i>
      </span>
      <span class="explore-chip" title="Region exploration">${exploration}% explored</span>
      <span class="resin-chip" title="Soft pacing resource">${resin}/${TUNING.resin.max} moonflow</span>
      <button class="top-btn" data-open="journal">Journal</button>
      <button class="top-btn" data-open="codex">Codex</button>
      <span class="keys-hint">RMB move/attack · Alt sprint · Space dash · A-click attack-move · Shift queues · S stop · QWER cast · ZXCV items · 1-5 swap · T capture · G interact · B shop · Tab party · M map</span>
    `;
  }

  private renderMinimap(): void {
    const g = this.game;
    const ctx = this.minimapCtx;
    const s = this.minimap.width;
    const scale = s / g.region.size;
    const dot = (x: number, y: number, r: number, color: string, stroke = false): void => {
      ctx.beginPath();
      ctx.arc(x * scale, y * scale, r, 0, Math.PI * 2);
      if (stroke) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
    };
    const bg = { grass: '#263b26', snow: '#dce8f2', desert: '#7a5d32', wasteland: '#3a2930', coast: '#23465c', forest: '#1f3d2e' }[g.region.biome];
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    for (const camp of g.region.camps) dot(camp.pos.x, camp.pos.y, 1.6, '#db6b55');
    for (const spawn of g.region.heroSpawns) dot(spawn.pos.x, spawn.pos.y, 2.4, '#b88cff', true);
    for (const echo of g.region.echoSpawns ?? []) dot(echo.pos.x, echo.pos.y, 2.2, '#8fe8ff', true);
    for (const gate of g.region.gates ?? []) dot(gate.pos.x, gate.pos.y, 2.7, '#7aff9a', true);
    for (const gym of g.region.gyms ?? []) dot(gym.pos.x, gym.pos.y, 3, '#ff9ad5', true);
    for (const dungeon of g.region.dungeons ?? []) dot(dungeon.pos.x, dungeon.pos.y, 3, '#b28cff', true);
    for (const wp of g.region.waypoints ?? []) dot(wp.pos.x, wp.pos.y, 2.5, g.discovered.has(wp.id) ? '#7af7ff' : '#446b73', true);
    for (const chest of g.region.chests ?? []) {
      if (!g.openedChests.has(chest.id)) dot(chest.pos.x, chest.pos.y, 2, '#ffd86a', true);
    }
    for (const shard of g.region.shards ?? []) {
      if (!g.collectedShards.has(shard.id)) dot(shard.pos.x, shard.pos.y, 1.8, '#d990ff');
    }
    for (const src of g.region.elementSources ?? []) dot(src.pos.x, src.pos.y, 1.8, '#ff9f57');
    dot(g.region.town.pos.x, g.region.town.pos.y, 4, '#ffd86a', true);
    dot(g.region.shrine.pos.x, g.region.shrine.pos.y, 2.4, '#67d7ff');
    const u = g.activeUnit();
    if (u) {
      dot(u.pos.x, u.pos.y, 3.3, '#ffffff');
      dot(u.pos.x, u.pos.y, 5.2, '#ffd86a', true);
    }
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
      const partyTip = this.registerTip(`party-${i}`, buildHeroCard(def, { level: u ? u.level : rec.level }), { accent: def.palette[2] ?? 'var(--brass)' });
      html += `
        <div class="party-frame ${active ? 'active' : ''} ${dead ? 'dead' : ''}" data-swap="${i}"${partyTip}>
          <img src="${heroPortrait(def.palette, def.name[0], 72, def.silhouette)}" alt="">
          <div class="pf-info">
            <div class="pf-name">${i + 1} ${def.name} <em>L${u ? u.level : rec.level}</em></div>
            <div class="bar hp"><div style="width:${hpPct}%"></div></div>
            <div class="bar mana"><div style="width:${manaPct}%"></div></div>
            ${dead ? `<div class="pf-dead">${deadIn}s</div>` : ''}
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
        <div class="party-frame creep">
          <img src="${heroPortrait(def.palette, def.name[0], 48, def.silhouette)}" alt="">
          <div class="pf-info">
            <div class="pf-name">${def.name} <em>${'★'.repeat(inst.star)}</em></div>
            <div class="bar hp"><div style="width:${hpPct}%"></div></div>
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
    const pendingSkillPoints = g.pendingSkillPoints(rec);
    this.heroPanel.classList.toggle('skill-ready', pendingSkillPoints > 0);

    let abilitiesHtml = '';
    u.abilities.forEach((a, i) => {
      if (i >= 6) return;
      const maxLevel = abilityMaxLevel(a.def);
      const nextReq = a.level < maxLevel ? abilityRankRequiredHeroLevel(a.def, a.level + 1) : 0;
      const canUpgrade = pendingSkillPoints > 0 && g.canLevelAbility(g.activeIdx, i);
      const cdLeft = Math.max(0, a.cooldownUntil - now);
      const cdTotal = (levelArr(a.def.cooldown, Math.max(1, a.level), 1) || 1) * TUNING.cooldownScale;
      const cdPct = cdLeft > 0 ? Math.min(100, (cdLeft / cdTotal) * 100) : 0;
      const mana = a.level > 0 ? levelArr(a.def.manaCost, a.level, 0) * TUNING.manaCostScale : 0;
      const noMana = mana > 0 && u.mana < mana;
      const passive = ['passive', 'aura', 'attack-modifier'].includes(a.def.targeting);
      const toggledOn = a.toggled;
      const abTip = this.registerTip(`ab-${i}`, buildAbilityCard(a.def, a.level), {
        extra: [
          `Rank ${a.level}/${maxLevel}`,
          a.level < maxLevel ? `Next rank: hero level ${nextReq}` : 'Max rank'
        ]
      });
      abilitiesHtml += `
        <div class="ab-slot ${a.level <= 0 ? 'unlearned' : ''} ${noMana ? 'nomana' : ''} ${passive ? 'passive' : ''} ${toggledOn ? 'toggled' : ''} ${canUpgrade ? 'upgradeable' : ''}"${abTip}>
          <img src="${abilityIcon(a.def)}" alt="">
          ${cdLeft > 0 ? `<div class="cd" style="height:${cdPct}%"></div><span class="cd-num">${cdLeft.toFixed(cdLeft > 5 ? 0 : 1)}</span>` : ''}
          <span class="hotkey">${passive ? '' : ABILITY_KEYS[i]}</span>
          <span class="ab-level">${a.level}/${maxLevel}</span>
          ${pendingSkillPoints > 0 && a.level < maxLevel ? `<button class="ab-plus" data-skill="${i}" ${canUpgrade ? '' : 'disabled'} title="${canUpgrade ? 'Spend a skill point' : `Requires hero level ${nextReq}`}">+</button>` : ''}
          ${mana > 0 ? `<span class="ab-mana">${Math.round(mana)}</span>` : ''}
        </div>`;
    });

    let itemsHtml = '';
    const equippedSaves = u.items.map((slot) => (slot ? ({ ...slot, id: slot.defId } as ItemSave) : null));
    u.items.forEach((it, i) => {
      const keyed = i < TUNING.activeItemSlots;
      if (!it) {
        itemsHtml += `<div class="item-slot empty ${keyed ? '' : 'passive-slot'}"><span class="hotkey">${ITEM_KEYS[i]}</span></div>`;
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
          ${cdLeft > 0 ? `<span class="cd-num">${cdLeft.toFixed(cdLeft > 5 ? 0 : 1)}</span>` : ''}
          ${it.charges >= 0 ? `<span class="charges">${it.charges}</span>` : ''}
          <span class="hotkey">${keyed && idef.active ? ITEM_KEYS[i] : ''}</span>
        </div>`;
    });

    const talentPending = pendingSkillPoints > 0 && g.pendingTalentTier(rec) >= 0;
    const attrPending = pendingSkillPoints > 0 && g.canSpendAttributePoint(g.activeIdx);
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
    const skillSpendHtml = pendingSkillPoints > 0
      ? `<div class="skill-points"><b>${pendingSkillPoints}</b> skill point${pendingSkillPoints === 1 ? '' : 's'} available
          ${talentPending ? '<button class="talent-btn inline" id="talent-open">Talent</button>' : ''}
          ${attrPending ? `<button class="btn tiny attr-btn" id="attr-up">+2 all stats (${rec.attributePoints}/${g.maxAttributePoints(rec)})</button>` : ''}
        </div>`
      : rec.attributePoints > 0
        ? `<div class="skill-points spent">Attributes +${rec.attributePoints * 2} all stats</div>`
        : '';

    const heroTip = this.registerTip(`hero-active`, buildHeroCard(def, { level: u.level }), { accent: def.palette[2] ?? 'var(--brass)', extra: heroExtra });
    this.heroPanel.innerHTML = `
      <div class="hp-left">
        <img class="portrait" src="${heroPortrait(def.palette, def.name[0], 72, def.silhouette)}" alt=""${heroTip}>
        <div class="hp-id">
          <div class="hp-name">${def.name} <em>Lv ${u.level}</em></div>
          <div class="build-row">${facetBadge}<span class="talent-pips">${talentPips}</span></div>
          <div class="bar hp big"><div style="width:${(u.hp / u.stats.maxHp) * 100}%"></div><span>${Math.ceil(u.hp)} / ${Math.ceil(u.stats.maxHp)}</span></div>
          <div class="bar mana big"><div style="width:${u.stats.maxMana > 0 ? (u.mana / u.stats.maxMana) * 100 : 0}%"></div><span>${Math.ceil(u.mana)} / ${Math.ceil(u.stats.maxMana)}</span></div>
          <div class="bar xp"><div style="width:${xp.pct * 100}%"></div></div>
          ${skillSpendHtml}
          <div class="hp-stats">DMG ${Math.round(u.stats.damage)} · ARM ${u.stats.armor.toFixed(1)} · MS ${Math.round(u.stats.moveSpeed)} · HP +${fmtRegen(regen.hp)}/s · MP +${fmtRegen(regen.mana)}/s</div>
        </div>
      </div>
      <div class="ab-row">${abilitiesHtml}</div>
      <div class="item-grid">${itemsHtml}</div>
    `;
    this.heroPanel.querySelector('#talent-open')?.addEventListener('click', () => this.toggleModal('talents'));
    this.heroPanel.querySelector('#attr-up')?.addEventListener('click', () => g.applyAttributePoint(g.activeIdx));
    this.heroPanel.querySelectorAll('[data-skill]').forEach((el) => {
      el.addEventListener('click', () => g.levelAbility(g.activeIdx, Number((el as HTMLElement).dataset.skill)));
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
      el.textContent = t.text;
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
          if (u) this.addFloater(u.pos.x, u.pos.y, 'IMMUNE', 'immunef');
          break;
        }
        case 'miss': {
          const u = g.sim.unit(ev.target);
          if (u) this.addFloater(u.pos.x, u.pos.y, 'MISS', 'missf');
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

  private updateFloaters(): void {
    const now = performance.now();
    const cam = this.game.scene.camera;
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

  toggleModal(kind: 'party' | 'shop' | 'menu' | 'talents' | 'journal' | 'codex' | 'services'): void {
    if (this.modalKind === kind) {
      this.closeModal();
      return;
    }
    this.modalKind = kind;
    this.input.uiModalOpen = true;
    this.modal.classList.remove('hidden');
    this.game.paused = kind === 'menu';
    if (kind === 'party') this.renderPartyModal();
    if (kind === 'shop') this.renderShopModal();
    if (kind === 'menu') this.renderMenuModal();
    if (kind === 'talents') this.renderTalentModal();
    if (kind === 'journal') this.renderJournalModal();
    if (kind === 'codex') this.renderCodexModal();
    if (kind === 'services') this.renderServicesModal();
  }

  closeModal(): void {
    if (this.modalKind === 'gambit') this.commitGambit();
    this.modalKind = 'none';
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
    { label: 'Enemies', kinds: ['enemy-hp-below', 'enemies-within', 'focus-is-role', 'distance-to-focus-gt', 'distance-to-focus-lt'] },
    { label: 'Reactions', kinds: ['enemy-cast-seen', 'incoming-disable'] },
    { label: 'Abilities', kinds: ['ability-ready'] }
  ];
  private static readonly COND_KINDS = Hud.COND_GROUPS.flatMap((g) => g.kinds);
  private static readonly COND_LABEL: Record<string, string> = {
    'always': 'Always', 'self-hp-below': 'My HP <', 'ally-hp-below': 'Ally HP <', 'enemy-hp-below': 'Enemy HP <',
    'self-mana-above': 'My mana >', 'self-mana-below': 'My mana <', 'enemies-within': 'Enemies within',
    'allies-alive': 'Allies alive ≥', 'ability-ready': 'Ability ready', 'fight-time-gt': 'Fight time >',
    'standing-in-zone': 'Standing in zone', 'focus-is-role': 'Focus role is',
    'distance-to-focus-gt': 'Focus farther than', 'distance-to-focus-lt': 'Focus closer than',
    'enemy-cast-seen': 'Enemy casting', 'self-disabled': "I'm disabled", 'incoming-disable': 'Disable incoming'
  };
  private static readonly ACT_KINDS = ['cast', 'use-item', 'attack-focus', 'focus-fire', 'kite', 'dodge-zones', 'retreat', 'hold'];
  private static readonly ACT_LABEL: Record<string, string> = {
    'cast': 'Cast ability', 'use-item': 'Use item', 'attack-focus': 'Attack focus', 'focus-fire': 'Focus-fire',
    'kite': 'Kite', 'dodge-zones': 'Dodge zones', 'retreat': 'Retreat', 'hold': 'Hold'
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
    this.gambitReturnTo = returnTo;
    this.gambitDraft = rec.gambits.length > 0
      ? structuredClone(rec.gambits)
      : buildDefaultGambit(REG.hero(rec.heroId).roles);
    this.modalKind = 'gambit';
    this.input.uiModalOpen = true;
    this.modal.classList.remove('hidden');
    this.game.paused = false;
    this.renderGambitModal();
  }

  private commitGambit(): void {
    if (this.gambitEditRec >= 0 && this.gambitDraft.length > 0) {
      this.game.setGambits(this.gambitEditRec, this.gambitDraft);
    }
    this.gambitEditRec = -1;
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
      case 'distance-to-focus-gt': return { k: 'distance-to-focus-gt', dist: 700 };
      case 'distance-to-focus-lt': return { k: 'distance-to-focus-lt', dist: 500 };
      case 'enemy-cast-seen': return { k: 'enemy-cast-seen', category: 'ult' };
      case 'self-disabled': return { k: 'self-disabled' };
      case 'incoming-disable': return { k: 'incoming-disable' };
      default: return { k: 'always' };
    }
  }

  private defaultAction(kind: string, itemId?: string): GambitAction {
    switch (kind) {
      case 'cast': return { k: 'cast', slot: 0, targetMode: 'focus' };
      case 'use-item': return { k: 'use-item', itemId: itemId ?? '', targetMode: 'focus' };
      case 'focus-fire': return { k: 'focus-fire', targetMode: 'focus' };
      case 'kite': return { k: 'kite', distance: 500 };
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
      case 'enemies-within': return [{ key: 'radius', label: 'radius' }, { key: 'count', label: 'count' }];
      case 'allies-alive': return [{ key: 'count', label: 'count' }];
      case 'ability-ready': return [{ key: 'slot', label: 'slot 0-3' }];
      case 'fight-time-gt': return [{ key: 'sec', label: 'sec' }];
      case 'focus-is-role': return [{ key: 'role', label: 'role' }];
      case 'distance-to-focus-gt': case 'distance-to-focus-lt': return [{ key: 'dist', label: 'dist' }];
      case 'enemy-cast-seen': return [{ key: 'category', label: 'blink/ult/channel/any' }];
      default: return [];
    }
  }

  private heroItemIds(recIdx: number): string[] {
    const rec = this.game.party[recIdx];
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
    const rec = this.game.party[this.gambitEditRec];
    if (!rec) {
      this.closeModal();
      return;
    }
    const def = REG.hero(rec.heroId);
    const items = this.heroItemIds(this.gambitEditRec);
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
          rule.then = this.defaultAction(value, this.heroItemIds(this.gambitEditRec)[0]);
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
        const def = REG.hero(this.game.party[this.gambitEditRec].heroId);
        this.gambitDraft = preset === 'default' ? buildDefaultGambit(def.roles) : this.gambitPreset(preset as 'aggro' | 'safe', def.roles);
        this.renderGambitModal();
      });
    });
  }

  // --- gym pre-fight screen (§3.5) ---

  openDungeonEntry(dungeonId: string): void {
    this.dungeonEntryId = dungeonId;
    this.modalKind = 'dungeon-entry';
    this.input.uiModalOpen = true;
    this.modal.classList.remove('hidden');
    this.game.paused = true;
    this.renderDungeonEntryModal();
  }

  private renderDungeonEntryModal(): void {
    const dungeonId = this.dungeonEntryId!;
    const { def, tiers, modifiers, progress } = this.game.dungeonEntryOptions(dungeonId);
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

    this.modalShell(
      `${def.name} — Entry`,
      `<div class="services">
        <section><h3>Tier</h3>${tierButtons}</section>
        <section><h3>Map Modifiers</h3>${modRows}</section>
        <section><h3>Progress</h3><p class="rr-sub">${progressText}</p></section>
        <div class="pf-foot">
          <button class="btn accent big" data-dungeon-start="1">Open Descent</button>
          <button class="btn big" data-dungeon-endless="1">Endless L${nextEndless + 1}</button>
          <button class="btn" data-dungeon-daily="1">Daily</button>
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
  }

  openGymPrefight(gymId: string): void {
    this.prefightGymId = gymId;
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
    const roster = g.party.slice(0, 5).map((rec, i) => {
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

    this.modalShell(
      `${gym.name} — ${gym.leader}`,
      `<div class="prefight">
        <p class="pf-theme">${gym.theme}</p>
        <p class="dim">Best of ${gym.bestOf}. You hold <b>${TUNING.captainCallsPerFight} Captain Calls</b>; ${gym.leader}'s side gets <b>${enemyCalls}</b>. In live fights, select a hero with 1–5 or a click, then spend a call (Space or the button) to fully control them for ${TUNING.captainCallSec}s.</p>
        <h3>Your five</h3>
        <div class="pf-roster">${roster}</div>
        <h3>Opposition</h3>
        <p class="pf-enemy">${enemy}</p>
        <div class="pf-foot">
          <button class="btn accent big" data-pf="live">Fight Live</button>
          <button class="btn" data-pf="auto">Auto-Resolve</button>
          <button class="btn" data-pf="cancel">Back</button>
        </div>
      </div>`
    );
    this.modal.querySelectorAll<HTMLElement>('[data-pf-edit]').forEach((el) => {
      el.addEventListener('click', () => this.openGambitEditor(Number(el.dataset.pfEdit), 'prefight'));
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
        } else {
          this.closeModal();
        }
      });
    });
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
      const n = rec.neutralSlot ? REG.neutralItem(rec.neutralSlot.id).name : '—';
      return `<div class="svc-row">
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
          <button class="btn small" data-respec="${i}">Respec ${TUNING.respecCost}g</button>
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
    this.modal.querySelector<HTMLElement>('[data-elite]')?.addEventListener('click', () => { g.runEliteMatch(); rerender(); });
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
    this.modal.querySelectorAll<HTMLElement>('[data-respec]').forEach((el) => el.addEventListener('click', () => { g.respec(Number(el.dataset.respec)); rerender(); }));
    this.modal.querySelector<HTMLElement>('[data-heal]')?.addEventListener('click', () => { g.healParty(); rerender(); });
    this.modal.querySelector<HTMLElement>('[data-buyback]')?.addEventListener('click', () => { g.buyback(downIdx >= 0 ? downIdx : undefined); rerender(); });
  }

  // --- live gym overlay (§3.5): round score + both teams' Captain Call charges ---

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
        ? `<div class="lg-calls">Greater progress ${endlessPct}% ${endlessPct >= 100 ? '· guardian!' : ''}</div>`
        : '';
      this.liveGymBar.innerHTML = `
        <div class="lg-score"><b>${dungeon.def.name}</b> · ${dungeon.tier}${titleSuffix} · Room ${room.index + 1}/${dungeon.layout.depth} · ${roomType}</div>
        <div class="lg-calls">Template <b>${template.id}</b> · ${Math.round(template.size.x)}×${Math.round(template.size.y)} · ${template.connectors.length} doors</div>
        <div class="lg-calls">Selected <b>${selectedName}</b></div>
        <div class="lg-calls">Packs ${pacing.spawnedPacks}/${pacing.plannedPacks}${modNames.length > 0 ? ` · ${modNames.join(', ')}` : ''}</div>
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
    const board = g.questBoard();
    const questRows = board
      .map((q) => {
        const tag = q.kind === 'event' ? 'Chapter' : 'Bounty';
        const stateLabel = q.claimable ? 'Ready' : q.status === 'cooldown' ? `Cooldown ${q.cooldownLeft ?? 0}s` : tag;
        const objs = q.objectives.map((o) => `${o.text} ${Math.min(o.have, o.need)}/${o.need}`).join(' · ');
        const claimBtn = q.claimable ? `<button class="btn small accent" data-claim-quest="${q.id}">Claim</button>` : '';
        const source = [q.giver ?? tag, q.region].filter(Boolean).join(' · ');
        const flavor = q.dialogue?.[0] ? `<p class="jr-flavor dim">&ldquo;${q.dialogue[0]}&rdquo;</p>` : '';
        return `
          <div class="journal-row">
            <div class="jr-stage">${stateLabel}</div>
            <div class="jr-main">
              <b>${q.name}</b> <em>${source}</em>
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
        if (this.game.claimQuest(el.dataset.claimQuest!)) this.renderJournalModal();
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
      return `
        <div class="codex-card hero-codex">
          <img src="${heroPortrait(heroDef.palette, h.name[0], 48, heroDef.silhouette)}" alt="">
          <div>
            <b>${h.name}</b> <span class="dim">${h.title}</span><br>
            <em>${h.attribute} · ${h.roles.slice(0, 3).join(' / ')}</em> ${ownTag}
            ${blurb}
            ${baseStats}
            <h4>Abilities</h4><ul class="codex-list">${abilities}</ul>
            <h4>Talent Tree</h4>${talents}
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
          <h3>Options</h3>
          <label class="opt-row"><input type="checkbox" id="opt-quickcast" ${g.settings.quickcast ? 'checked' : ''}> Quick-cast at cursor</label>
          <label class="opt-row"><input type="checkbox" id="opt-resonance" ${g.settings.resonance ? 'checked' : ''}> Resonance mode (micro/raids)</label>
          <label class="opt-row"><input type="checkbox" id="opt-mute" ${g.settings.audio.muted ? 'checked' : ''}> Mute all audio</label>
          <label class="opt-row">Master volume <input type="range" id="opt-master-volume" min="0" max="1" step="0.05" value="${g.settings.audio.master}"></label>
          <label class="opt-row">SFX volume <input type="range" id="opt-sfx-volume" min="0" max="1" step="0.05" value="${g.settings.audio.sfx}"></label>
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
    this.modal.querySelector('#opt-quickcast')?.addEventListener('change', (e) => {
      g.settings.quickcast = (e.target as HTMLInputElement).checked;
    });
    this.modal.querySelector('#opt-resonance')?.addEventListener('change', (e) => {
      g.setResonanceEnabled((e.target as HTMLInputElement).checked);
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
