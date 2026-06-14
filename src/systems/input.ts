import type { Game } from './game';
import type { Vec2 } from '../core/types';
import { TUNING } from '../data/tuning';

// ------------------------------------------------------------------
// Controls (SPEC §6): RMB move/attack, QWER abilities (quickcast),
// ZXCV item actives, 1-5 swap, T capture, G interact/travel, M map, Tab party, B shop.
// ------------------------------------------------------------------

export type TargetingState =
  | { kind: 'none' }
  | { kind: 'ability'; slot: number }
  | { kind: 'item'; slot: number };

const ABILITY_KEYS = ['q', 'w', 'e', 'r', 'd', 'f'];
const ITEM_KEYS = ['z', 'x', 'c', 'v'];

export class InputController {
  /** current mouse position (client px) */
  mouseX = 0;
  mouseY = 0;
  hoverUid = -1;
  hoverGround: Vec2 | null = null;
  targeting: TargetingState = { kind: 'none' };

  /** UI layers can grab the keyboard (shop search etc.) */
  uiModalOpen = false;

  onToggleParty: () => void = () => {};
  onToggleShop: () => void = () => {};
  onToggleMenu: () => void = () => {};
  onToggleJournal: () => void = () => {};
  onToggleCodex: () => void = () => {};
  onToggleServices: () => void = () => {};

  private rmbHeld = false;
  private lastMoveOrderAt = 0;
  private attackMovePending = false;
  private clickQueued = false;
  private disposers: (() => void)[] = [];

  constructor(
    private game: Game,
    private canvas: HTMLCanvasElement
  ) {
    const on = <K extends keyof WindowEventMap>(t: K, fn: (e: WindowEventMap[K]) => void, el: Window | HTMLElement = window) => {
      el.addEventListener(t, fn as EventListener);
      this.disposers.push(() => el.removeEventListener(t, fn as EventListener));
    };

    on('contextmenu', (e) => e.preventDefault(), this.canvas);
    on('mousemove', (e) => {
      this.mouseX = (e as MouseEvent).clientX;
      this.mouseY = (e as MouseEvent).clientY;
    });
    on('mousedown', (e) => this.onMouseDown(e as MouseEvent), this.canvas);
    on('mouseup', (e) => {
      if ((e as MouseEvent).button === 2) this.rmbHeld = false;
    });
    on('wheel', (e) => {
      if (this.uiModalOpen) return;
      this.game.scene.zoomBy((e as WheelEvent).deltaY);
    }, this.canvas);
    on('keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    on('keyup', (e) => this.onKeyUp(e as KeyboardEvent));
    on('blur', () => {
      this.rmbHeld = false;
      this.game.setSprintHeld(false);
    });
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }

  /** re-pick at the current mouse position (also called on mousedown so
   *  clicks use exact click coords, not last frame's cached hover) */
  private refreshPick(): void {
    const pick = this.game.scene.pick(this.mouseX, this.mouseY, this.game.inputSim());
    this.hoverUid = pick.uid ?? -1;
    this.hoverGround = pick.ground ?? null;
  }

  /** called each frame: refresh hover pick + held-RMB move orders */
  update(): void {
    this.refreshPick();

    if (this.rmbHeld && !this.uiModalOpen) {
      const now = performance.now();
      if (now - this.lastMoveOrderAt > 150 && this.hoverGround) {
        this.lastMoveOrderAt = now;
        this.game.orderMove(this.hoverGround);
      }
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (this.uiModalOpen) return;
    if (this.game.cinematic.active) {
      if (e.button === 0) {
        e.preventDefault();
        this.game.cinematicAdvance();
      }
      return;
    }
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    this.clickQueued = e.shiftKey;
    this.refreshPick();
    if (e.button === 2) {
      this.targeting = { kind: 'none' };
      this.attackMovePending = false;
      this.rightClick();
      this.rmbHeld = true;
      this.lastMoveOrderAt = performance.now();
    } else if (e.button === 0) {
      this.leftClick();
    }
  }

  private rightClick(): void {
    const g = this.game;
    const sim = g.inputSim();
    const driver = g.controlledUnit();
    if (this.hoverUid >= 0) {
      const target = sim.unit(this.hoverUid);
      if (!target) return;
      if (g.liveGym && target.team === 0) {
        g.selectLiveGymUnit(target.uid);
        return;
      }
      // npc hero -> recruit
      if (!g.liveGym && g.npcAt(this.hoverUid)) {
        g.tryRecruit(this.hoverUid);
        return;
      }
      if (driver && target.team !== 0 && target.alive) {
        g.orderAttack(this.hoverUid, this.clickQueued);
        return;
      }
    }
    if (driver && this.hoverGround) g.orderMove(this.hoverGround, this.clickQueued);
  }

  private leftClick(): void {
    const g = this.game;
    if (this.attackMovePending) {
      this.attackMovePending = false;
      if (this.hoverUid >= 0) {
        const target = g.inputSim().unit(this.hoverUid);
        if (target && target.team !== 0 && target.alive) g.orderAttack(this.hoverUid, this.clickQueued);
      } else if (this.hoverGround) {
        g.orderAttackMove(this.hoverGround, this.clickQueued);
      }
      return;
    }
    // confirm pending targeted cast (non-quickcast mode)
    if (this.targeting.kind !== 'none') {
      this.fire(this.targeting);
      this.targeting = { kind: 'none' };
      return;
    }
    // select hovered unit (info only; control stays on the hero)
    if (this.hoverUid >= 0) {
      if (g.liveGym) g.selectLiveGymUnit(this.hoverUid);
      g.scene.selectedUid = this.hoverUid;
    } else {
      const u = g.controlledUnit() ?? g.activeUnit();
      if (u) g.scene.selectedUid = u.uid;
    }
  }

  private fire(t: TargetingState): void {
    const g = this.game;
    const u = g.controlledUnit();
    if (!u || t.kind === 'none') return;
    const opts = {
      uid: this.hoverUid >= 0 ? this.hoverUid : undefined,
      point: this.hoverGround ?? { ...u.pos }
    };
    if (t.kind === 'ability') g.castAbility(t.slot, { ...opts, queued: this.clickQueued });
    else g.useItem(t.slot, { ...opts, queued: this.clickQueued });
  }

  private onKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (this.game.cinematic.active) {
      if (key === ' ' || key === 'spacebar' || key === 'enter') {
        e.preventDefault();
        this.game.cinematicAdvance();
        return;
      }
      if (key === 'tab') {
        e.preventDefault();
        this.game.cinematicFastForward(true);
        return;
      }
      if (key === 'escape') {
        e.preventDefault();
        this.game.cinematicRequestSkip();
        return;
      }
    }
    if (e.code === 'AltLeft' || e.code === 'AltRight') {
      this.game.setSprintHeld(true);
      return;
    }
    if (key === 'escape') {
      if (this.targeting.kind !== 'none') {
        this.targeting = { kind: 'none' };
        return;
      }
      this.onToggleMenu();
      return;
    }
    if (this.uiModalOpen) {
      if (key === 'tab' || key === 'b') {
        e.preventDefault();
        if (key === 'tab') this.onToggleParty();
        else this.onToggleShop();
      }
      return;
    }

    const g = this.game;
    const u = g.controlledUnit();
    const queued = e.shiftKey;

    // hero swap
    if (key >= '1' && key <= '5') {
      g.trySwap(Number(key) - 1);
      return;
    }

    // abilities
    const abilityIdx = ABILITY_KEYS.indexOf(key);
    if (abilityIdx >= 0 && u) {
      const a = u.abilities[abilityIdx];
      if (!a) return;
      const targeting = a.def.targeting;
      if (targeting === 'no-target' || targeting === 'toggle') {
        g.castAbility(abilityIdx, { queued });
      } else if (g.settings.quickcast) {
        this.fireAbilityQuick(abilityIdx, queued);
      } else {
        this.targeting = { kind: 'ability', slot: abilityIdx };
      }
      return;
    }

    if (key === 'j') {
      this.onToggleJournal();
      return;
    }
    if (key === 'k') {
      this.onToggleCodex();
      return;
    }

    // items
    const itemIdx = ITEM_KEYS.indexOf(key);
    if (itemIdx >= 0 && u && itemIdx < TUNING.activeItemSlots) {
      if (g.settings.quickcast) {
        g.useItem(itemIdx, {
          uid: this.hoverUid >= 0 ? this.hoverUid : undefined,
          point: this.hoverGround ?? { ...u.pos },
          queued
        });
      } else {
        this.targeting = { kind: 'item', slot: itemIdx };
      }
      return;
    }

    switch (key) {
      case 't': {
        if (g.liveGym || g.liveRaid) return;
        // capture hovered (or selected) creep
        const uid = this.hoverUid >= 0 ? this.hoverUid : g.scene.selectedUid;
        if (uid >= 0) g.tryCapture(uid);
        return;
      }
      case 'a':
        if (!g.controlledUnit()) {
          if (g.liveGym) g.msg('Spend a Captain Call to issue orders', 'info');
          return;
        }
        this.attackMovePending = true;
        g.msg('Attack-move: click a point or enemy', 'info');
        return;
      case 'g':
        if (g.liveGym || g.liveRaid) return;
        g.tryInteract();
        return;
      case 's':
        g.orderStop();
        return;
      case ' ':
      case 'spacebar':
        e.preventDefault();
        if (g.liveGym) {
          if (!g.controlledUnit()) g.liveGymPlayerCall(this.hoverUid >= 0 ? this.hoverUid : undefined);
          return;
        }
        g.tryDash(this.hoverGround ?? undefined);
        return;
      case 'm':
        g.scene.toggleCameraMode();
        return;
      case 'tab':
        e.preventDefault();
        this.onToggleParty();
        return;
      case 'b':
        if (g.liveGym || g.liveRaid) return;
        this.onToggleShop();
        return;
      case 'y':
        if (g.liveGym || g.liveRaid) return;
        this.onToggleServices();
        return;
      case 'n':
        if (g.liveGym || g.liveRaid) return;
        g.useNeutralActive();
        return;
      case 'f5':
        e.preventDefault();
        g.saveToSlot(0);
        return;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (key === 'tab') {
      this.game.cinematicFastForward(false);
    }
    if (key === 'escape' && this.game.cinematic.active) {
      this.game.cinematicReleaseSkip();
    }
    if (e.code === 'AltLeft' || e.code === 'AltRight') {
      this.game.setSprintHeld(false);
    }
  }

  private fireAbilityQuick(slot: number, queued = false): void {
    const g = this.game;
    const u = g.controlledUnit();
    if (!u) return;
    const a = u.abilities[slot];
    const targeting = a.def.targeting;
    if (targeting === 'unit-target') {
      if (this.hoverUid < 0) {
        g.msg('No target under cursor', 'bad');
        return;
      }
      g.castAbility(slot, { uid: this.hoverUid, queued });
    } else {
      // point-target / skillshot / ground-aoe: cast at cursor ground
      if (!this.hoverGround && this.hoverUid < 0) {
        g.msg('No target point', 'bad');
        return;
      }
      const target = this.hoverUid >= 0 ? g.inputSim().unit(this.hoverUid) : null;
      const point = target ? { ...target.pos } : this.hoverGround!;
      g.castAbility(slot, { point, uid: this.hoverUid >= 0 ? this.hoverUid : undefined, queued });
    }
  }
}
