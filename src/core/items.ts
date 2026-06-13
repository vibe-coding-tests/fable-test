import { TUNING } from '../data/tuning';
import { REG } from './registry';
import type { ItemState, Unit } from './unit';
import type { ItemDef, ItemSave } from './types';

// ------------------------------------------------------------------
// Item runtime: slots, auto-sort, buying with component consumption,
// lockouts (Blink), charges. Item ACTIVES run through the ability
// engine (ItemDef.active is an AbilityDef).
// ------------------------------------------------------------------

export function itemDef(id: string): ItemDef {
  return REG.item(id);
}

export function isActiveItem(def: ItemDef): boolean {
  return !!def.active;
}

/**
 * Auto-sort actives into keyed slots 1–4 (Z/X/C/V), passives into 5–6,
 * preserving relative order (SPEC §5).
 */
export function sortInventory(items: (ItemState | null)[]): (ItemState | null)[] {
  const present = items.filter((i): i is ItemState => i !== null);
  const actives = present.filter((i) => isActiveItem(itemDef(i.defId)));
  const passives = present.filter((i) => !isActiveItem(itemDef(i.defId)));
  const out: (ItemState | null)[] = new Array(TUNING.itemSlots).fill(null);
  let idx = 0;
  for (const a of actives) {
    if (idx >= TUNING.itemSlots) break;
    out[idx++] = a;
  }
  // passives fill from the back so actives keep low (keyed) slots
  let back = TUNING.itemSlots - 1;
  for (const p of passives) {
    while (back >= 0 && out[back] !== null) back--;
    if (back < 0) break;
    out[back--] = p;
  }
  // overflow actives (more than fit) go wherever is free
  for (const a of actives.slice(idx)) {
    const free = out.findIndex((s) => s === null);
    if (free >= 0) out[free] = a;
  }
  return out;
}

export function freeSlotCount(items: (ItemState | null)[]): number {
  return items.filter((i) => i === null).length;
}

export function makeItemState(def: ItemDef): ItemState {
  return {
    defId: def.id,
    charges: def.charges ?? -1,
    cooldownUntil: 0
  };
}

/**
 * Buy plan with Dota-style component consumption: owned recipe components
 * (in this hero's inventory) are consumed and discounted.
 */
export interface BuyPlan {
  goldCost: number;
  consumeSlots: number[];
  fits: boolean;
}

export function computeBuyPlan(def: ItemDef, unit: Unit, gold: number): BuyPlan & { affordable: boolean } {
  const consumeSlots: number[] = [];
  let discount = 0;
  if (def.components && def.components.length > 0) {
    const need = [...def.components];
    for (let slot = 0; slot < unit.items.length; slot++) {
      const it = unit.items[slot];
      if (!it) continue;
      const idx = need.indexOf(it.defId);
      if (idx >= 0) {
        need.splice(idx, 1);
        consumeSlots.push(slot);
        discount += REG.item(it.defId).cost;
      }
    }
  }
  const goldCost = Math.max(0, def.cost - discount);
  const freeAfter = freeSlotCount(unit.items) + consumeSlots.length;
  return { goldCost, consumeSlots, fits: freeAfter >= 1, affordable: gold >= goldCost };
}

/** Execute a purchase. Returns new gold (or null if invalid). Caller re-sorts. */
export function executeBuy(def: ItemDef, unit: Unit, gold: number): number | null {
  const plan = computeBuyPlan(def, unit, gold);
  if (!plan.fits || !plan.affordable) return null;
  // stacking consumables: add charges to an existing stack instead
  if (def.charges !== undefined && def.tier === 'consumable') {
    const existing = unit.items.find((i) => i && i.defId === def.id);
    if (existing) {
      existing.charges += def.charges;
      return gold - plan.goldCost;
    }
  }
  for (const slot of plan.consumeSlots) unit.items[slot] = null;
  const free = unit.items.findIndex((s) => s === null);
  if (free < 0) return null;
  unit.items[free] = makeItemState(def);
  unit.items = sortInventory(unit.items);
  unit.markStatsDirty();
  return gold - plan.goldCost;
}

export function sellValue(def: ItemDef): number {
  return Math.round(def.cost * TUNING.sellRatio);
}

/** Blink-style lockout: item unusable for def.damageLockoutSec after taking enemy damage. */
export function itemLockedOut(def: ItemDef, unit: Unit, now: number): boolean {
  const lock = (def as ItemDef & { damageLockoutSec?: number }).damageLockoutSec;
  if (!lock) return false;
  return now - unit.lastEnemyDamageAt < lock;
}

export function itemReady(it: ItemState, def: ItemDef, unit: Unit, now: number): { ok: boolean; reason?: string } {
  if (!def.active) return { ok: false, reason: 'passive' };
  if (now < it.cooldownUntil) return { ok: false, reason: 'cooldown' };
  if (it.charges === 0) return { ok: false, reason: 'no-charges' };
  if (itemLockedOut(def, unit, now)) return { ok: false, reason: 'damage-lockout' };
  const cost = def.active.manaCost ? def.active.manaCost[0] : 0;
  if (unit.mana < cost) return { ok: false, reason: 'mana' };
  return { ok: true };
}

export function itemSaveOf(it: ItemState | null, now: number): ItemSave | null {
  if (!it) return null;
  return {
    id: it.defId,
    charges: it.charges >= 0 ? it.charges : undefined,
    cooldownLeft: it.cooldownUntil > now ? it.cooldownUntil - now : undefined,
    bound: it.bound || undefined,
    quality: it.quality
  };
}

export function itemStateFromSave(s: ItemSave, now: number): ItemState {
  const def = REG.item(s.id);
  return {
    defId: s.id,
    charges: s.charges ?? def.charges ?? -1,
    cooldownUntil: s.cooldownLeft ? now + s.cooldownLeft : 0,
    bound: s.bound || undefined,
    quality: s.quality
  };
}
