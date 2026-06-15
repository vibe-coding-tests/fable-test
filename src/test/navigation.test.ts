import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ALL_DUNGEONS, ALL_REGIONS, registerAllContent } from '../data/index';
import { ALL_GYMS } from '../data/gyms/index';
import { REG } from '../core/registry';
import { Game, newGameSave } from '../systems/game';
import type { GameSave, RegionDef } from '../core/types';

// ============================================================
// Navigation invariants: the overworld is a hand-authored graph of
// regions linked by gates, with dungeons as in-region portal POIs.
// Two layers are covered here:
//   1. Map connectivity (pure data) — every region is reachable from
//      the start, the badge-gated progression never soft-locks, and
//      every dungeon has a portal in its own region.
//   2. Runtime navigation (Game.headless) — POI detection, gate
//      requirements, travel transitions, and dungeon entry guards.
// ============================================================

beforeAll(() => registerAllContent());

const START_REGION = 'tranquil-vale';
const DUNGEON_REGIONS = [...new Set(ALL_DUNGEONS.map((d) => d.regionId))];

type Gate = NonNullable<RegionDef['gates']>[number];

function regionById(): Map<string, RegionDef> {
  return new Map(ALL_REGIONS.map((r) => [r.id, r]));
}

function bfs(start: string, neighbors: (id: string) => string[]): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of neighbors(cur)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// ------------------------------------------------------------
// 1. Map connectivity (pure data)
// ------------------------------------------------------------

describe('overworld map connectivity', () => {
  it('every gate points at a registered region', () => {
    for (const r of ALL_REGIONS) {
      for (const g of r.gates ?? []) {
        expect(REG.regions.has(g.toRegionId), `${r.id}:${g.id} -> ${g.toRegionId}`).toBe(true);
      }
    }
  });

  it('every region is reachable from the start, ignoring gate requirements', () => {
    const forward = new Map(ALL_REGIONS.map((r) => [r.id, (r.gates ?? []).map((g) => g.toRegionId)]));
    const reachable = bfs(START_REGION, (id) => forward.get(id) ?? []);
    for (const r of ALL_REGIONS) {
      expect(reachable.has(r.id), `${r.id} is unreachable from ${START_REGION}`).toBe(true);
    }
  });

  it('every region has a path back to the start region', () => {
    const reverse = new Map<string, string[]>(ALL_REGIONS.map((r) => [r.id, []]));
    for (const r of ALL_REGIONS) {
      for (const g of r.gates ?? []) reverse.get(g.toRegionId)?.push(r.id);
    }
    const canReturn = bfs(START_REGION, (id) => reverse.get(id) ?? []);
    for (const r of ALL_REGIONS) {
      expect(canReturn.has(r.id), `${r.id} has no path back to ${START_REGION}`).toBe(true);
    }
  });

  it('the badge-gated progression unlocks every region without a soft-lock', () => {
    // A region's gym badge is obtainable once that region is reachable
    // (gyms are proven winnable in playthrough.test.ts). Recruit gates are
    // always satisfiable since recruiting is available from the start.
    const forward = new Map(ALL_REGIONS.map((r) => [r.id, [...(r.gates ?? [])] as Gate[]]));
    const badgeByRegion = new Map<string, string[]>();
    for (const gym of ALL_GYMS) {
      const list = badgeByRegion.get(gym.regionId) ?? [];
      list.push(gym.badgeId);
      badgeByRegion.set(gym.regionId, list);
    }

    const reachable = new Set<string>([START_REGION]);
    const earned = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of reachable) {
        for (const badge of badgeByRegion.get(id) ?? []) {
          if (!earned.has(badge)) {
            earned.add(badge);
            changed = true;
          }
        }
      }
      for (const id of [...reachable]) {
        for (const gate of forward.get(id) ?? []) {
          if (gate.requiredBadge && !earned.has(gate.requiredBadge)) continue;
          if (!reachable.has(gate.toRegionId)) {
            reachable.add(gate.toRegionId);
            changed = true;
          }
        }
      }
    }

    for (const r of ALL_REGIONS) {
      expect(reachable.has(r.id), `${r.id} is soft-locked: its gating badge isn't obtainable before its gate`).toBe(true);
    }
  });

  it('every gate badge requirement is granted by some gym', () => {
    const gymBadges = new Set(ALL_GYMS.map((g) => g.badgeId));
    for (const r of ALL_REGIONS) {
      for (const g of r.gates ?? []) {
        if (!g.requiredBadge) continue;
        expect(gymBadges.has(g.requiredBadge), `${r.id}:${g.id} needs '${g.requiredBadge}' which no gym grants`).toBe(true);
      }
    }
  });
});

// ------------------------------------------------------------
// 2. Dungeon ↔ portal wiring
// ------------------------------------------------------------

describe('dungeon portal wiring', () => {
  it('every dungeon has an overworld portal in its own region', () => {
    const regions = regionById();
    for (const d of ALL_DUNGEONS) {
      const region = regions.get(d.regionId);
      expect(region, `${d.id} references missing region ${d.regionId}`).toBeTruthy();
      const portal = (region!.dungeons ?? []).find((p) => p.dungeonId === d.id);
      expect(portal, `${d.id} has no portal POI in ${d.regionId}`).toBeTruthy();
    }
  });

  it('every overworld portal references a dungeon defined for that region', () => {
    for (const r of ALL_REGIONS) {
      for (const p of r.dungeons ?? []) {
        const def = ALL_DUNGEONS.find((d) => d.id === p.dungeonId);
        expect(def, `${r.id}:${p.id} -> unknown dungeon '${p.dungeonId}'`).toBeTruthy();
        expect(def!.regionId, `portal ${p.id} sits in ${r.id} but '${def!.id}' is defined for ${def!.regionId}`).toBe(r.id);
      }
    }
  });

  it('every dungeon-bearing region is reachable through the gated progression', () => {
    // Mirrors the soft-lock walk above, then asserts each dungeon region is hit.
    const forward = new Map(ALL_REGIONS.map((r) => [r.id, [...(r.gates ?? [])] as Gate[]]));
    const badgeByRegion = new Map<string, string[]>();
    for (const gym of ALL_GYMS) {
      const list = badgeByRegion.get(gym.regionId) ?? [];
      list.push(gym.badgeId);
      badgeByRegion.set(gym.regionId, list);
    }
    const reachable = new Set<string>([START_REGION]);
    const earned = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of reachable) for (const b of badgeByRegion.get(id) ?? []) if (!earned.has(b)) (earned.add(b), changed = true);
      for (const id of [...reachable]) {
        for (const gate of forward.get(id) ?? []) {
          if (gate.requiredBadge && !earned.has(gate.requiredBadge)) continue;
          if (!reachable.has(gate.toRegionId)) (reachable.add(gate.toRegionId), changed = true);
        }
      }
    }
    for (const regionId of DUNGEON_REGIONS) {
      expect(reachable.has(regionId), `dungeon region ${regionId} is never reachable`).toBe(true);
    }
  });
});

// ------------------------------------------------------------
// 3. Runtime navigation (Game.headless)
// ------------------------------------------------------------

function saveInRegion(regionId: string, opts: { badges?: string[]; recruited?: string[] } = {}): GameSave {
  const save = newGameSave('juggernaut');
  save.regionId = regionId;
  save.worldSeed = REG.region(regionId).seed;
  if (opts.badges) save.badges = opts.badges;
  if (opts.recruited) save.recruited = opts.recruited;
  return save;
}

function placeAt(g: Game, pos: { x: number; y: number }): void {
  g.activeUnit()!.pos = { ...pos };
}

describe('overworld POI detection', () => {
  it('detects a gate only when standing within its radius', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const gate = g.region.gates![0];
    placeAt(g, gate.pos);
    expect(g.nearbyGate()?.id).toBe(gate.id);
    placeAt(g, { x: gate.pos.x + gate.radius + 50, y: gate.pos.y });
    expect(g.nearbyGate()).toBeNull();
  });

  it('detects a dungeon portal within its radius', () => {
    const g = Game.headless(saveInRegion('icewrack', { badges: ['lunar-badge'] }));
    const portal = g.region.dungeons![0];
    placeAt(g, portal.pos);
    expect(g.nearbyDungeonPortal()?.dungeonId).toBe(portal.dungeonId);
    placeAt(g, { x: portal.pos.x + portal.radius + 100, y: portal.pos.y });
    expect(g.nearbyDungeonPortal()).toBeNull();
  });

  it('detects a gym within its radius', () => {
    const g = Game.headless(saveInRegion('nightsilver-woods'));
    const gym = g.region.gyms![0];
    placeAt(g, gym.pos);
    expect(g.nearbyGym()?.gymId).toBe(gym.gymId);
    placeAt(g, { x: gym.pos.x + gym.radius + 100, y: gym.pos.y });
    expect(g.nearbyGym()).toBeNull();
  });
});

describe('gate travel requirements', () => {
  it('blocks the first gate until a hero is recruited', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const gate = g.region.gates!.find((x) => x.requiresRecruits)!;
    expect(gate).toBeTruthy();
    expect(g.gateTravelBlockReason(gate)).toMatch(/recruit/i);
  });

  it('clears the recruit gate once enough heroes are recruited', () => {
    const save = newGameSave('juggernaut');
    save.recruited = ['juggernaut', 'pudge'];
    const g = Game.headless(save);
    const gate = g.region.gates!.find((x) => x.requiresRecruits)!;
    expect(g.gateTravelBlockReason(gate)).toBeNull();
  });

  it('blocks a badge gate without the badge and clears once it is earned', () => {
    const gate = REG.region('nightsilver-woods').gates!.find((x) => x.requiredBadge)!;
    const locked = Game.headless(saveInRegion('nightsilver-woods'));
    expect(locked.gateTravelBlockReason(gate)).toMatch(/badge/i);
    const unlocked = Game.headless(saveInRegion('nightsilver-woods', { badges: [gate.requiredBadge!] }));
    expect(unlocked.gateTravelBlockReason(gate)).toBeNull();
  });
});

describe('tryTravel transitions', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubLoad(): { loaded: () => GameSave | null } {
    let captured: GameSave | null = null;
    vi.stubGlobal('CustomEvent', class {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    });
    vi.stubGlobal('window', {
      dispatchEvent: (ev: { detail?: unknown }) => {
        captured = (ev.detail as GameSave) ?? null;
        return true;
      }
    });
    return { loaded: () => captured };
  }

  it('moves the player to the target region at the gate exit position', () => {
    const cap = stubLoad();
    const save = newGameSave('juggernaut');
    save.recruited = ['juggernaut', 'pudge']; // satisfy the recruit gate
    const g = Game.headless(save);
    const gate = g.region.gates!.find((x) => x.toRegionId === 'nightsilver-woods')!;
    placeAt(g, gate.pos);
    expect(g.tryTravel()).toBe(true);
    const loaded = cap.loaded();
    expect(loaded?.regionId).toBe('nightsilver-woods');
    expect(loaded?.playerPos).toEqual(gate.toPos);
  });

  it('refuses to travel through a gate whose requirements are unmet, dispatching nothing', () => {
    const dispatch = vi.fn();
    vi.stubGlobal('window', { dispatchEvent: dispatch });
    const g = Game.headless(newGameSave('juggernaut')); // 0 recruits
    const gate = g.region.gates!.find((x) => x.requiresRecruits)!;
    placeAt(g, gate.pos);
    expect(g.tryTravel()).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('refuses to travel with no gate nearby', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    placeAt(g, { x: g.region.town.pos.x, y: g.region.town.pos.y });
    expect(g.nearbyGate()).toBeNull();
    expect(g.tryTravel()).toBe(false);
  });
});

describe('dungeon entry guards', () => {
  it('starts a dungeon via interact when standing on its portal in its region', () => {
    const g = Game.headless(saveInRegion('icewrack', { badges: ['lunar-badge'] }));
    const portal = g.region.dungeons![0];
    placeAt(g, portal.pos);
    expect(g.nearbyDungeonPortal()?.dungeonId).toBe('frost-hollow');
    expect(g.tryInteract()).toBe(true);
    expect(g.liveDungeon).toBeTruthy();
    expect(g.liveDungeon!.def.id).toBe('frost-hollow');
  });

  it('refuses to start a dungeon that belongs to another region', () => {
    const g = Game.headless(saveInRegion('icewrack', { badges: ['lunar-badge'] }));
    expect(g.startDungeon('worldstone-vault')).toBe(false);
    expect(g.liveDungeon).toBeNull();
  });

  it('refuses to start a dungeon with an empty party', () => {
    const g = Game.headless(saveInRegion('icewrack', { badges: ['lunar-badge'] }));
    g.party = [];
    expect(g.startDungeon('frost-hollow')).toBe(false);
    expect(g.liveDungeon).toBeNull();
  });
});
