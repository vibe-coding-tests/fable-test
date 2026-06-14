import { AnimationClip, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface HeroModelAsset {
  scene: Group;
  animations: AnimationClip[];
}

export interface HeroAssetManifestEntry {
  heroId: string;
  modelUrl: string;
  clips: Partial<Record<'idle' | 'run' | 'attack' | 'cast' | 'channel' | 'death', string>>;
  sockets: ('weapon' | 'back' | 'shoulder')[];
  fallback: 'procedural';
}

export const PHASE5_STARTER_ASSETS: HeroAssetManifestEntry[] = [
  'juggernaut',
  'crystal-maiden',
  'pudge',
  'earthshaker',
  'sniper',
  'lich'
].map((heroId) => ({
  heroId,
  modelUrl: `/assets/heroes/${heroId}.glb`,
  clips: { idle: 'idle', run: 'run', attack: 'attack', cast: 'cast', channel: 'channel', death: 'death' },
  sockets: ['weapon', 'back', 'shoulder'],
  fallback: 'procedural'
}));

/**
 * Heroes whose authored glTF is actually shipped in /public/assets/heroes.
 * Gating here keeps the runtime from firing 404s (clean console) for heroes whose
 * GLB hasn't shipped yet, while the whole pipeline + fallback stays wired and tested.
 * The six starters ship as CC0 KayKit Adventurers bases retextured to each hero's
 * palette (VFX_OVERHAUL WS-J batch 13; see scripts/assets/specs/heroes.json + ASSETS.md).
 * Asset policy: original + generated + CC0/CC-BY only, never Valve.
 */
export const ENABLED_HERO_MODELS: ReadonlySet<string> = new Set<string>([
  'juggernaut',
  'crystal-maiden',
  'pudge',
  'earthshaker',
  'sniper',
  'lich'
]);

/** The manifest entry for a hero, but only when its model is actually available. */
export function heroAssetEntry(heroId: string | undefined): HeroAssetManifestEntry | null {
  if (!heroId || !ENABLED_HERO_MODELS.has(heroId)) return null;
  return PHASE5_STARTER_ASSETS.find((a) => a.heroId === heroId) ?? null;
}

// ------------------------------------------------------------------
// WS-A0: shared base meshes + runtime recolor (VFX_ASSETS §2-3).
// One CC0 base per archetype serves a whole cohort; the loader caches PER BASE
// (so 122 heroes trigger ~16 loads, not 122) and the renderer recolors the clone
// to each hero's three-color palette. Procedural rigs remain the floor: a hero
// with base 'procedural', or any base whose file has not shipped, simply keeps
// its hand-tuned primitive likeness.
// ------------------------------------------------------------------

export type HeroBaseId =
  | 'knight' | 'mage' | 'barbarian' | 'rogue'
  | 'spider' | 'dragonevolved' | 'demon' | 'wolf' | 'giant' | 'golelingevolved'
  | 'goblin' | 'velociraptor' | 'bull' | 'fox' | 'yeti' | 'ghost'
  | 'procedural';

const HERO_COHORTS: Record<Exclude<HeroBaseId, 'procedural'>, string[]> = {
  // §3.1 KayKit Knight base — armored melee (17)
  knight: ['juggernaut', 'sven', 'abaddon', 'dragon-knight', 'chaos-knight', 'legion-commander', 'omniknight', 'dawnbreaker', 'kunkka', 'mars', 'wraith-king', 'chen', 'clockwerk', 'timbersaw', 'slardar', 'faceless-void', 'pangolier'],
  // §3.2 KayKit Mage base — robed caster (30)
  mage: ['crystal-maiden', 'lich', 'lina', 'zeus', 'witch-doctor', 'invoker', 'lion', 'rubick', 'pugna', 'necrophos', 'death-prophet', 'disruptor', 'grimstroke', 'keeper-of-the-light', 'shadow-shaman', 'silencer', 'skywrath-mage', 'outworld-destroyer', 'warlock', 'dark-seer', 'dark-willow', 'enchantress', 'natures-prophet', 'queen-of-pain', 'storm-spirit', 'vengeful-spirit', 'dazzle', 'arc-warden', 'razor', 'winter-wyvern'],
  // §3.3 KayKit Barbarian base — brute (15)
  barbarian: ['pudge', 'earthshaker', 'lifestealer', 'undying', 'ogre-magi', 'bristleback', 'troll-warlord', 'axe', 'magnus', 'brewmaster', 'alchemist', 'huskar', 'beastmaster', 'slark', 'underlord'],
  // §3.4 KayKit Rogue base — agile / ranged (18)
  rogue: ['sniper', 'mirana', 'drow-ranger', 'windranger', 'phantom-assassin', 'riki', 'bounty-hunter', 'anti-mage', 'templar-assassin', 'clinkz', 'meepo', 'void-spirit', 'ember-spirit', 'marci', 'phantom-lancer', 'monkey-king', 'luna', 'bloodseeker'],
  // §3.5 Quaternius creature bases (31)
  spider: ['broodmother', 'weaver', 'nyx-assassin', 'sand-king'],
  dragonevolved: ['jakiro', 'viper', 'puck'],
  demon: ['doom', 'shadow-demon', 'shadow-fiend', 'night-stalker', 'terrorblade', 'visage'],
  wolf: ['lycan'],
  giant: ['tidehunter', 'primal-beast', 'ursa', 'treant-protector'],
  golelingevolved: ['tiny', 'elder-titan', 'earth-spirit'],
  goblin: ['techies', 'gyrocopter', 'tinker'],
  velociraptor: ['venomancer', 'snapfire'],
  bull: ['spirit-breaker', 'centaur-warrunner'],
  fox: ['hoodwink'],
  yeti: ['tusk'],
  ghost: ['spectre']
};

// §3.6 procedural-only holdouts (abstract / no-legs / elemental); a base mesh
// would read worse, so these keep their bespoke primitive rigs.
const PROCEDURAL_HOLDOUTS: ReadonlySet<string> = new Set([
  'io', 'enigma', 'morphling', 'bane', 'ancient-apparition', 'leshrac', 'phoenix', 'naga-siren', 'medusa', 'batrider', 'lone-druid'
]);

/** heroId → shared base assignment (VFX_ASSETS §3). Built once from the cohorts. */
export const HERO_BASE: Readonly<Record<string, HeroBaseId>> = (() => {
  const map: Record<string, HeroBaseId> = {};
  for (const [base, ids] of Object.entries(HERO_COHORTS) as [Exclude<HeroBaseId, 'procedural'>, string[]][]) {
    for (const id of ids) map[id] = base;
  }
  for (const id of PROCEDURAL_HOLDOUTS) map[id] = 'procedural';
  return map;
})();

/** The shared base a hero reads through, or 'procedural' when none fits. */
export function heroBaseId(heroId: string | undefined): HeroBaseId {
  if (!heroId) return 'procedural';
  return HERO_BASE[heroId] ?? 'procedural';
}

/**
 * Bases whose CC0 GLB has actually shipped to /public/assets/bases. Empty until
 * the base files land (A1+); gating here keeps the runtime from firing 404s while
 * the whole shared-base path stays wired and tested behind it.
 */
export const ENABLED_HERO_BASES: ReadonlySet<HeroBaseId> = new Set<HeroBaseId>([]);

export function heroBaseUrl(base: HeroBaseId): string | null {
  if (base === 'procedural' || !ENABLED_HERO_BASES.has(base)) return null;
  return `/assets/bases/${base}.glb`;
}

/**
 * Phase 3 (GRAPHICS_SPEC §13): creeps render as authored Quaternius creatures
 * (CC0) when a mapping exists, else fall back to the procedural rig. Specific
 * ids win; otherwise the silhouette `build` picks a sensible archetype so every
 * creep (including summoned minions) resolves to a creature.
 */
const CREATURE_BY_ID: Record<string, string> = {
  ghost: 'ghost',
  'fell-spirit': 'ghost',
  'alpha-wolf': 'wolf',
  'giant-wolf': 'wolf',
  'polar-furbolg': 'yeti',
  'frostbitten-golem': 'yeti',
  'granite-golem': 'golelingevolved',
  'rock-golem': 'golelingevolved',
  'mud-golem': 'golelingevolved',
  'black-dragon': 'dragonevolved',
  hellbear: 'giant',
  'hill-troll': 'orc',
  kobold: 'goblin',
  'kobold-foreman': 'goblin',
  'gnoll-assassin': 'goblin',
  'vhoul-assassin': 'goblin',
  'satyr-banisher': 'demon',
  'satyr-mindstealer': 'demon',
  'harpy-stormcrafter': 'velociraptor',
  'harpy-scout': 'velociraptor',
  wildwing: 'velociraptor',
  'wildwing-ripper': 'velociraptor',
  'enraged-wildkin': 'velociraptor',
  'ice-shaman': 'tribal',
  'ogre-frostmage': 'tribal',
  'prowler-shaman': 'tribal',
  'prowler-acolyte': 'tribal',
  'dark-troll': 'tribal',
  'dark-troll-summoner': 'tribal',
  'centaur-courser': 'bull',
  'centaur-conqueror': 'bull',
  thunderhide: 'bull',
  'ancient-thunderhide': 'bull',
  'elder-jungle-stalker': 'stag',
  'ogre-bruiser': 'orc',
  'ogre-magi-large': 'orc'
};

const CREATURE_BY_BUILD: Record<string, string> = {
  biped: 'goblin',
  brute: 'orc',
  golem: 'golelingevolved',
  quad: 'wolf',
  bird: 'velociraptor',
  blob: 'glubevolved'
};

/** Authored creature GLB URL for a creep, or null to keep the procedural rig. */
export function creepCreatureUrl(creepId: string | undefined, build: string | undefined): string | null {
  const name = (creepId && CREATURE_BY_ID[creepId]) || (build && CREATURE_BY_BUILD[build]) || null;
  return name ? `/assets/creeps/${name}.glb` : null;
}

export class HeroAssetLoader {
  // Vendored GLBs are meshopt-compressed, so the decoder must be wired or loads fail.
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private cache = new Map<string, Promise<HeroModelAsset | null>>();
  private baseCache = new Map<HeroBaseId, Promise<HeroModelAsset | null>>();

  /** Resolve a hero's authored scene + clips, or null to keep the procedural rig. */
  loadHero(entry: HeroAssetManifestEntry): Promise<HeroModelAsset | null> {
    const cached = this.cache.get(entry.heroId);
    if (cached) return cached;
    const promise = this.loader.loadAsync(entry.modelUrl)
      .then((gltf) => ({ scene: gltf.scene, animations: gltf.animations ?? [] }))
      .catch(() => null);
    this.cache.set(entry.heroId, promise);
    return promise;
  }

  /**
   * WS-A0: load a shared base mesh once and reuse the clone for every hero in its
   * cohort. Caching per base (not per hero) is what keeps 122 heroes at ~16 loads.
   * Returns null for procedural holdouts or any base whose file has not shipped.
   */
  loadBase(base: HeroBaseId): Promise<HeroModelAsset | null> {
    const cached = this.baseCache.get(base);
    if (cached) return cached;
    const url = heroBaseUrl(base);
    const promise: Promise<HeroModelAsset | null> = url
      ? this.loader.loadAsync(url).then((gltf) => ({ scene: gltf.scene, animations: gltf.animations ?? [] })).catch(() => null)
      : Promise.resolve(null);
    this.baseCache.set(base, promise);
    return promise;
  }

  /** True once a load has been attempted for this hero (success or fallback). */
  has(heroId: string): boolean {
    return this.cache.has(heroId);
  }

  /** True once a base load has been attempted (cohort-shared). */
  hasBase(base: HeroBaseId): boolean {
    return this.baseCache.has(base);
  }
}
