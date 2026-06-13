import { REG } from '../core/registry';
import { TUNING } from '../data/tuning';
import { xpProgress } from '../core/progression';
import { itemReady, sellValue, computeBuyPlan } from '../core/items';
import { levelArr } from '../core/values';
import { buildDefaultGambit } from '../core/controllers';
import { abilityIcon, itemIcon, heroPortrait } from '../engine/icons';
import { WORLD_SCALE } from '../engine/scale';
import { Game } from '../systems/game';
import type { InputController } from '../systems/input';
import type { GambitRule, ItemDef, SimEvent } from '../core/types';
import * as THREE from 'three';

// ------------------------------------------------------------------
// HUD: DOM overlay. Reads game state every frame; all interactions
// call back into Game. No game logic lives here.
// ------------------------------------------------------------------

const ABILITY_KEYS = ['Q', 'W', 'E', 'R', 'D', 'F'];
const ITEM_KEYS = ['Z', 'X', 'C', 'V', '·', '·'];
const GOLD_STREAK_WINDOW_MS = 1500;

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

  private floaters: Floater[] = [];
  private coinFx: CoinFx[] = [];
  private shownToasts = 0;
  private modalKind: 'none' | 'party' | 'shop' | 'menu' | 'talents' | 'journal' | 'codex' = 'none';
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
      <div id="modal-root" class="hidden"></div>
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
    this.topBar.addEventListener('click', (e) => {
      const open = (e.target as HTMLElement).closest('[data-open]') as HTMLElement | null;
      const kind = open?.dataset.open as 'journal' | 'codex' | undefined;
      if (kind) this.toggleModal(kind);
    });
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
    if (this.modalKind === 'shop' || this.modalKind === 'party') this.refreshModalDynamic();
    // auto-open talent picker
    if (this.modalKind === 'none') {
      const rec = this.game.party[this.game.activeIdx];
      if (rec && this.game.pendingTalentTier(rec) >= 0) this.toggleModal('talents');
    }
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
    this.topBar.innerHTML = `
      <span class="region">${g.region.name}</span>
      <span class="clock ${isNight ? 'night' : 'day'}">${isNight ? 'Night' : 'Day'} ${clockPct}%</span>
      <span class="gold-counter ${goldPop ? 'pop' : ''}" data-gold-counter>
        <span class="coin-icon">◆</span>
        <span class="gold-amount">${Math.floor(this.displayGold)}</span><span class="gold-unit">g</span>
        ${streakActive ? `<span class="gold-streak">×${this.goldStreak}</span>` : ''}
      </span>
      <button class="top-btn" data-open="journal">Journal</button>
      <button class="top-btn" data-open="codex">Codex</button>
      <span class="keys-hint">RMB move/attack · A-click attack-move · Shift queues · S stop · QWER cast · ZXCV items · 1-5 swap · T capture · G interact · B shop · Tab party · M map</span>
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
      html += `
        <div class="party-frame ${active ? 'active' : ''} ${dead ? 'dead' : ''}" data-swap="${i}">
          <img src="${heroPortrait(def.palette, def.name[0])}" alt="">
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
          <img src="${heroPortrait(def.palette, def.name[0], 48)}" alt="">
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
      this.heroPanel.innerHTML = '';
      return;
    }
    const def = REG.hero(rec.heroId);
    const now = g.sim.time;
    const xp = xpProgress(u.level, u.xp);

    let abilitiesHtml = '';
    u.abilities.forEach((a, i) => {
      if (i >= 6) return;
      const cdLeft = Math.max(0, a.cooldownUntil - now);
      const cdTotal = (levelArr(a.def.cooldown, Math.max(1, a.level), 1) || 1) * TUNING.cooldownScale;
      const cdPct = cdLeft > 0 ? Math.min(100, (cdLeft / cdTotal) * 100) : 0;
      const mana = a.level > 0 ? levelArr(a.def.manaCost, a.level, 0) * TUNING.manaCostScale : 0;
      const noMana = mana > 0 && u.mana < mana;
      const passive = ['passive', 'aura', 'attack-modifier'].includes(a.def.targeting);
      const toggledOn = a.toggled;
      abilitiesHtml += `
        <div class="ab-slot ${a.level <= 0 ? 'unlearned' : ''} ${noMana ? 'nomana' : ''} ${passive ? 'passive' : ''} ${toggledOn ? 'toggled' : ''}"
             title="${a.def.name}${a.def.lore ? ' — ' + a.def.lore : ''}">
          <img src="${abilityIcon(a.def)}" alt="">
          ${cdLeft > 0 ? `<div class="cd" style="height:${cdPct}%"></div><span class="cd-num">${cdLeft.toFixed(cdLeft > 5 ? 0 : 1)}</span>` : ''}
          <span class="hotkey">${passive ? '' : ABILITY_KEYS[i]}</span>
          <span class="ab-level">${'•'.repeat(Math.max(0, a.level))}</span>
          ${mana > 0 ? `<span class="ab-mana">${Math.round(mana)}</span>` : ''}
        </div>`;
    });

    let itemsHtml = '';
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
      itemsHtml += `
        <div class="item-slot ${keyed ? '' : 'passive-slot'} ${lockout ? 'lockout' : ''}" title="${idef.name} — ${idef.lore}">
          <img src="${itemIcon(idef)}" alt="">
          ${cdLeft > 0 ? `<span class="cd-num">${cdLeft.toFixed(cdLeft > 5 ? 0 : 1)}</span>` : ''}
          ${it.charges >= 0 ? `<span class="charges">${it.charges}</span>` : ''}
          <span class="hotkey">${keyed && idef.active ? ITEM_KEYS[i] : ''}</span>
        </div>`;
    });

    const talentPending = g.pendingTalentTier(rec) >= 0;

    this.heroPanel.innerHTML = `
      <div class="hp-left">
        <img class="portrait" src="${heroPortrait(def.palette, def.name[0])}" alt="">
        <div class="hp-id">
          <div class="hp-name">${def.name} <em>Lv ${u.level}</em>
            ${talentPending ? '<button class="talent-btn" id="talent-open">Talent!</button>' : ''}
          </div>
          <div class="bar hp big"><div style="width:${(u.hp / u.stats.maxHp) * 100}%"></div><span>${Math.ceil(u.hp)} / ${Math.ceil(u.stats.maxHp)}</span></div>
          <div class="bar mana big"><div style="width:${u.stats.maxMana > 0 ? (u.mana / u.stats.maxMana) * 100 : 0}%"></div><span>${Math.ceil(u.mana)} / ${Math.ceil(u.stats.maxMana)}</span></div>
          <div class="bar xp"><div style="width:${xp.pct * 100}%"></div></div>
          <div class="hp-stats">DMG ${Math.round(u.stats.damage)} · ARM ${u.stats.armor.toFixed(1)} · MS ${Math.round(u.stats.moveSpeed)}</div>
        </div>
      </div>
      <div class="ab-row">${abilitiesHtml}</div>
      <div class="item-grid">${itemsHtml}</div>
    `;
    this.heroPanel.querySelector('#talent-open')?.addEventListener('click', () => this.toggleModal('talents'));
  }

  // ---------- toasts ----------

  private renderToasts(): void {
    const g = this.game;
    while (this.shownToasts < g.toasts.length) {
      const t = g.toasts[this.shownToasts++];
      const el = document.createElement('div');
      el.className = `toast ${t.kind}`;
      el.textContent = t.text;
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
        this.game.scene.terrain.heightAt(f.simX, f.simY) + 2.2 + age * 1.5,
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
      this.game.scene.terrain.heightAt(simX, simY) + height,
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
    if (this.input.hoverUid >= 0) {
      const u = g.sim.unit(this.input.hoverUid);
      if (u) {
        if (g.npcAt(u.uid)) hint = `${u.name} — right-click to recruit`;
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
      hint = gate.requiredBadge && !g.badges.has(gate.requiredBadge)
        ? `${gate.name} — requires ${gate.requiredBadge.replace('-', ' ')}`
        : `${gate.name} — press G to travel`;
    }
    if (g.canShop() && this.modalKind === 'none' && !hint) hint = `${g.region.town.name} — press B to shop`;
    this.hint.textContent = hint;
    this.hint.classList.toggle('hidden', hint === '');
  }

  // ---------- modals ----------

  toggleModal(kind: 'party' | 'shop' | 'menu' | 'talents' | 'journal' | 'codex'): void {
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
  }

  closeModal(): void {
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
          <img src="${heroPortrait(def.palette, def.name[0])}" alt="">
          <div class="rr-main">
            <b>${def.name}</b> <em>Lv ${rec.unit ? rec.unit.level : rec.level} · key ${i + 1}</em>
            <div class="rr-sub">${def.attribute.toUpperCase()} · ${def.roles.join(' / ')}</div>
            <div class="echo-row">Echoes ${rec.echo.kills} · talents ${echoPips}</div>
            ${facets}
            <div class="gambit-row">Gambit: ${gambitLabel}
              <button class="btn tiny" data-gambit="${i}:default">Default</button>
              <button class="btn tiny" data-gambit="${i}:aggro">Aggro</button>
              <button class="btn tiny" data-gambit="${i}:safe">Safe</button>
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
          <img src="${heroPortrait(def.palette, def.name[0], 48)}" alt="">
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
        const rules = preset === 'default' ? buildDefaultGambit(def.roles) : this.gambitPreset(preset as 'aggro' | 'safe');
        g.setGambits(recIdx, rules);
        this.renderPartyModal();
      });
    });
  }

  private gambitPreset(preset: 'aggro' | 'safe'): GambitRule[] {
    if (preset === 'aggro') {
      return [
        { if: [{ k: 'ability-ready', slot: 3 }, { k: 'fight-time-gt', sec: 5 }], then: { k: 'cast', slot: 3, targetMode: 'most-clustered' } },
        { if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
        { if: [{ k: 'ability-ready', slot: 1 }], then: { k: 'cast', slot: 1, targetMode: 'lowest-hp-enemy' } },
        { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
      ];
    }
    return [
      { if: [{ k: 'self-hp-below', pct: 35 }], then: { k: 'retreat' } },
      { if: [{ k: 'ally-hp-below', pct: 45 }, { k: 'ability-ready', slot: 1 }], then: { k: 'cast', slot: 1, targetMode: 'lowest-hp-ally' } },
      { if: [{ k: 'ability-ready', slot: 0 }, { k: 'distance-to-focus-lt', dist: 700 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
      { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
    ];
  }

  // --- shop ---

  private shopTab: 'consumable' | 'component' | 'assembled' = 'assembled';

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
      grid += `
        <div class="shop-item ${plan.affordable && plan.fits ? '' : 'cant'}" data-buy="${d.id}"
             title="${d.name} — ${d.lore}${d.components?.length ? ' | Components: ' + d.components.map((c) => REG.item(c).name).join(', ') : ''}">
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
    const badges = [...g.badges].map((b) => b.replace(/-/g, ' ')).join(', ') || 'none yet';
    this.modalShell(
      'Quest Journal',
      `
      <div class="journal-summary">
        <b>${g.region.name}</b> · badges ${badges} · recruited ${g.recruited.size}/${REG.heroes.size}
      </div>
      ${rows || '<p class="dim">No open quest leads in this region yet. Find echo scars, gyms, and hero rumors to fill the journal.</p>'}`
    );
  }

  private renderCodexModal(): void {
    const g = this.game;
    const knownHeroIds = new Set([
      ...g.recruited,
      ...g.party.map((r) => r.heroId),
      ...g.region.heroSpawns.map((h) => h.heroId),
      ...(g.region.echoSpawns ?? []).map((h) => h.heroId)
    ]);
    const heroes = [...knownHeroIds]
      .map((id) => REG.hero(id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((h) => `
        <div class="codex-card">
          <img src="${heroPortrait(h.palette, h.name[0], 48)}" alt="">
          <div><b>${h.name}</b> <em>${h.attribute.toUpperCase()} · ${h.roles.slice(0, 2).join(' / ')}</em>
          <p>${h.lore}</p></div>
        </div>`)
      .join('');
    const regions = Array.from(REG.regions.values())
      .slice(0, 10)
      .map((r) => `<div class="codex-note"><b>${r.name}</b><p>${r.lore}</p></div>`)
      .join('');
    const items = Array.from(REG.items.values())
      .filter((i) => i.appearance || i.attackVisual)
      .map((i) => `<div class="codex-note"><b>${i.name}</b><p>${i.lore}</p></div>`)
      .join('');
    this.modalShell(
      'Codex',
      `
      <div class="codex-grid">
        <section><h3>Known Heroes</h3>${heroes}</section>
        <section><h3>Regions</h3>${regions}</section>
        <section><h3>Relics With Visible Power</h3>${items}</section>
      </div>`
    );
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
    this.modalShell(
      `${def.name} — Level ${t.level} Talent`,
      `
      <div class="talent-choice">
        <button class="talent-opt" data-pick="0"><b>${t.options[0].name}</b></button>
        <div class="talent-or">or</div>
        <button class="talent-opt" data-pick="1"><b>${t.options[1].name}</b></button>
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
          <label class="opt-row">Master volume <input type="range" id="opt-master-volume" min="0" max="1" step="0.05" value="${g.settings.masterVolume ?? 0.8}"></label>
          <label class="opt-row">SFX volume <input type="range" id="opt-sfx-volume" min="0" max="1" step="0.05" value="${g.settings.sfxVolume ?? 0.8}"></label>
          <label class="opt-row">Music volume <input type="range" id="opt-music-volume" min="0" max="1" step="0.05" value="${g.settings.musicVolume ?? 0.6}"></label>
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
    this.modal.querySelector('#opt-master-volume')?.addEventListener('input', (e) => {
      g.settings.masterVolume = Number((e.target as HTMLInputElement).value);
    });
    this.modal.querySelector('#opt-sfx-volume')?.addEventListener('input', (e) => {
      g.settings.sfxVolume = Number((e.target as HTMLInputElement).value);
    });
    this.modal.querySelector('#opt-music-volume')?.addEventListener('input', (e) => {
      g.settings.musicVolume = Number((e.target as HTMLInputElement).value);
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
