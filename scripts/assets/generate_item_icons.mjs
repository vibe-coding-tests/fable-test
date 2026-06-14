// Generate item-icon silhouettes from game-icons.net (CC BY 3.0).
//
// game-icons.net ships ~4100 flat single-path SVG silhouettes — the exact shape
// our item HUD already wanted: a recognizable glyph tinted per rarity/tier on a
// gem-slot background. This script is the reproducible "download": it reads the
// vendored @iconify-json/game-icons data package, pulls the curated subset mapped
// to our item glyph vocabulary, and emits two things:
//
//   1. public/assets/ui/items/<token>.svg — one standalone currentColor SVG per
//      glyph token. These are the auditable, shipped assets (ASSETS.md row + the
//      manifest pick them up like every other public file). Delete them and the
//      build still boots: icons.ts falls back to the hand-drawn procedural glyph.
//   2. src/engine/item-glyphs.generated.ts — the same path data baked for the
//      runtime so itemIcon() can fill the silhouette onto its canvas synchronously
//      (no async image load, no flash). Derived/committed like manifest.json.
//
// License: CC BY 3.0. Attribution is recorded in ASSETS.md and CREDITS.md and must
// stay shipped with the work. Re-run after editing ICON_MAP:
//   npm run generate:item-icons
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SVG_OUT_DIR = path.join(ROOT, 'public', 'assets', 'ui', 'items');
const TS_OUT = path.join(ROOT, 'src', 'engine', 'item-glyphs.generated.ts');

// Our item glyph vocabulary (the `glyph` tokens on ItemDef) → a game-icons name.
// Every token currently used across src/data is covered, so no item falls back to
// the generic gem diamond. All chosen icons are single-path, transform-free 512²
// silhouettes (verified), which is what keeps the runtime Path2D fill clean.
const ICON_MAP = {
  armor: 'breastplate',
  axe: 'battle-axe',
  band: 'ring',
  bar: 'metal-bar',
  belt: 'belt',
  blade: 'broadsword',
  boot: 'boots',
  bow: 'pocket-bow',
  bracer: 'bracer',
  branch: 'tree-branch',
  broach: 'gem-pendant',
  burst: 'fire-ray',
  chain: 'gem-chain',
  cheese: 'cheese-wedge',
  cloak: 'cloak',
  cloud: 'cloudy-fork',
  crown: 'crown',
  cyclone: 'tornado',
  dagger: 'plain-dagger',
  disc: 'thrown-charcoal',
  drum: 'drum',
  eye: 'eyeball',
  fang: 'fangs',
  fist: 'fist',
  flask: 'round-bottom-flask',
  flower: 'flowers',
  gear: 'gears',
  gem: 'cut-diamond',
  ghost: 'ghost',
  hammer: 'warhammer',
  hand: 'hand',
  heart: 'hearts',
  helm: 'visored-helm',
  leaf: 'solid-leaf',
  lens: 'magnifying-glass',
  locket: 'locked-heart',
  mantle: 'cape',
  mask: 'tribal-mask',
  medal: 'medal',
  mirror: 'mirror-mirror',
  orb: 'crystal-ball',
  pipe: 'pipes',
  relic: 'relic-blade',
  ring: 'ring',
  scythe: 'scythe',
  shard: 'crystal-shine',
  shield: 'checked-shield',
  spear: 'spears',
  staff: 'wizard-staff',
  sun: 'sun',
  urn: 'amphora',
  veil: 'hooded-figure',
  wand: 'crystal-wand',
  wing: 'feathered-wing',
  scope: 'spectacle-lenses',
  shovel: 'trowel'
};

// Per-item overrides: every item gets its own recognizable silhouette, so two
// items that share a glyph token (e.g. the dozen `blade`s) still read distinctly
// in the bag. Keyed by ItemDef id (main + neutral items). Anything not listed
// falls back to its glyph token in ICON_MAP, then to the procedural glyph.
const ITEM_ICON_OVERRIDES = {
  // consumables + specials
  tango: 'three-leaves',
  'healing-salve': 'health-potion',
  clarity: 'potion-ball',
  'dust-of-appearance': 'dust-cloud',
  'observer-ward': 'eye-target',
  'sentry-ward': 'eye-shield',
  'smoke-of-deceit': 'smoking-orb',
  'refresher-shard': 'recycle',
  cheese: 'cheese-wedge',
  'moon-shard': 'moon',
  'aghanims-shard': 'crystal-cluster',
  // components
  'iron-branch': 'tree-branch',
  circlet: 'ring',
  crown: 'crown',
  'gauntlets-of-strength': 'gauntlet',
  'slippers-of-agility': 'winged-leg',
  'mantle-of-intelligence': 'cape',
  'belt-of-strength': 'belt-armor',
  'band-of-elvenskin': 'ring',
  'robe-of-the-magi': 'robe',
  'blades-of-attack': 'crossed-swords',
  broadsword: 'broadsword',
  claymore: 'ancient-sword',
  'mithril-hammer': 'warhammer',
  quarterstaff: 'bo',
  'ogre-axe': 'battle-axe',
  'staff-of-wizardry': 'wizard-staff',
  'blade-of-alacrity': 'wind-slap',
  'boots-of-speed': 'boots',
  'gloves-of-haste': 'gloves',
  'sages-mask': 'tribal-mask',
  'ring-of-regen': 'ring',
  'void-stone': 'rock',
  'energy-booster': 'electric',
  'vitality-booster': 'health-normal',
  chainmail: 'chain-mail',
  cloak: 'cloak',
  'shadow-amulet': 'gem-pendant',
  'morbid-mask': 'tribal-mask',
  'quickstep-cord': 'belt',
  'wanderer-wraps': 'leg-armor',
  'prismatic-shard': 'crystal-shine',
  hyperstone: 'gems',
  platemail: 'breastplate',
  'ultimate-orb': 'crystal-ball',
  'demon-edge': 'fragmented-sword',
  'sacred-relic': 'relic-blade',
  reaver: 'spiked-mace',
  eaglesong: 'feathered-wing',
  'mystic-staff': 'wizard-staff',
  'point-booster': 'cut-diamond',
  'magic-stick': 'crystal-wand',
  // gems — one cut per family
  'chipped-ruby': 'rupee', 'flawed-ruby': 'rupee', 'standard-ruby': 'rupee', 'flawless-ruby': 'rupee', 'perfect-ruby': 'rupee',
  'chipped-topaz': 'topaz', 'flawed-topaz': 'topaz', 'standard-topaz': 'topaz', 'flawless-topaz': 'topaz', 'perfect-topaz': 'topaz',
  'chipped-sapphire': 'cut-diamond', 'flawed-sapphire': 'cut-diamond', 'standard-sapphire': 'cut-diamond', 'flawless-sapphire': 'cut-diamond', 'perfect-sapphire': 'cut-diamond',
  'chipped-emerald': 'emerald', 'flawed-emerald': 'emerald', 'standard-emerald': 'emerald', 'flawless-emerald': 'emerald', 'perfect-emerald': 'emerald',
  'chipped-diamond': 'diamonds', 'flawed-diamond': 'diamonds', 'standard-diamond': 'diamonds', 'flawless-diamond': 'diamonds', 'perfect-diamond': 'diamonds',
  // rings / utility
  'ring-of-protection': 'ring',
  'ring-of-health': 'ring',
  'gem-of-true-sight': 'all-seeing-eye',
  'helm-of-iron-will': 'visored-helm',
  'oblivion-staff': 'wizard-staff',
  'talisman-of-evasion': 'feathered-wing',
  javelin: 'spears',
  'blitz-knuckles': 'fist',
  perseverance: 'ring',
  headdress: 'feather',
  buckler: 'round-shield',
  'ring-of-basilius': 'ring',
  bracer: 'bracer',
  'wraith-band': 'ring',
  'null-talisman': 'gem-pendant',
  'magic-wand': 'crystal-wand',
  'arcane-boots': 'boots',
  yasha: 'katana',
  sange: 'sparkling-sabre',
  kaya: 'energy-sword',
  // cores
  'dragon-lance': 'barbed-spear',
  'mask-of-madness': 'carnival-mask',
  'blink-dagger': 'plain-dagger',
  'black-king-bar': 'metal-bar',
  'euls-scepter': 'tornado',
  'force-staff': 'wizard-staff',
  'glimmer-cape': 'cape',
  mekansm: 'gears',
  battlefury: 'battle-axe',
  crystalys: 'shard-sword',
  'diffusal-blade': 'shard-sword',
  maelstrom: 'lightning-arc',
  'drum-of-endurance': 'drum',
  'vladmirs-offering': 'fangs',
  'assault-cuirass': 'breastplate',
  'divine-rapier': 'rune-sword',
  butterfly: 'butterfly',
  'scythe-of-vyse': 'scythe',
  'heart-of-tarrasque': 'hearts',
  'eye-of-skadi': 'frozen-orb',
  'refresher-orb': 'recycle',
  'aghanims-scepter': 'bird-scepter',
  'aegis-of-the-immortal': 'checked-shield',
  'breacher-cloak': 'cloak',
  'exchange-mark': 'ring',
  'resonance-catalyst': 'crystal-ball',
  'power-treads': 'boots',
  'phase-boots': 'boots',
  'tranquil-boots': 'boots',
  'boots-of-travel': 'winged-leg',
  'guardian-greaves': 'leg-armor',
  vanguard: 'round-shield',
  'hood-of-defiance': 'hooded-figure',
  'pipe-of-insight': 'pipes',
  'crimson-guard': 'checked-shield',
  'shivas-guard': 'frostfire',
  'lotus-orb': 'lotus',
  'linkens-sphere': 'crystal-ball',
  'aeon-disk': 'thrown-charcoal',
  'eternal-shroud': 'cloak',
  'manta-style': 'mirror-mirror',
  'sange-and-yasha': 'crossed-swords',
  'kaya-and-sange': 'crossed-swords',
  'yasha-and-kaya': 'crossed-swords',
  desolator: 'bloody-sword',
  daedalus: 'broadsword',
  'monkey-king-bar': 'bo',
  'skull-basher': 'spiked-mace',
  'abyssal-blade': 'bloody-sword',
  mjollnir: 'thor-hammer',
  satanic: 'devil-mask',
  'silver-edge': 'curvy-knife',
  'echo-sabre': 'katana',
  'orchid-malevolence': 'flowers',
  bloodthorn: 'thorny-vine',
  nullifier: 'relic-blade',
  radiance: 'sun',
  'medallion-of-courage': 'medal',
  'solar-crest': 'sun',
  'urn-of-shadows': 'amphora',
  'spirit-vessel': 'amphora',
  'holy-locket': 'locked-heart',
  'helm-of-the-dominator': 'visored-helm',
  'helm-of-the-overlord': 'visored-helm',
  'veil-of-discord': 'hooded-figure',
  'rod-of-atos': 'crystal-wand',
  gleipnir: 'gem-chain',
  dagon: 'crystal-wand',
  'ghost-scepter': 'ghost',
  'ethereal-blade': 'energy-sword',
  'wind-waker': 'tornado',
  'hand-of-midas': 'hand',
  'octarine-core': 'crystal-ball',
  'aether-lens': 'magnifying-glass',
  'meteor-hammer': 'hammer-drop',
  'heavens-halberd': 'trident',
  'aghanims-blessing': 'winged-scepter',
  bloodstone: 'fire-gem',
  'soul-ring': 'ring',
  // neutral items
  'trusty-shovel': 'trowel',
  'faded-broach': 'gem-pendant',
  'arcane-ring': 'ring',
  'grove-bow': 'pocket-bow',
  vambrace: 'bracer',
  'pupils-gift': 'crystal-ball',
  'elven-tunic': 'cloak',
  'paladin-sword': 'broadsword',
  'vortex-storm-globe': 'crystal-ball',
  telescope: 'spyglass',
  'ninja-gear': 'ninja-mask',
  'spell-prism': 'crystal-shine',
  apex: 'crown',
  'force-boots': 'winged-leg',
  'mirror-shield': 'mirror-mirror'
};

const ATTRIBUTION = {
  source: 'game-icons.net',
  authors: 'Lorc, Delapouite & contributors',
  url: 'https://game-icons.net',
  license: 'CC BY 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/'
};

function pathData(body) {
  const m = body.match(/\sd="([^"]+)"/);
  if (!m) throw new Error(`no path data in: ${body.slice(0, 80)}`);
  return m[1];
}

function svgFile(d, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><path fill="currentColor" d="${d}"/></svg>\n`;
}

function main() {
  const data = require('@iconify-json/game-icons/icons.json');
  const size = data.width ?? 512;

  // Rebuild from scratch so a removed/renamed mapping never leaves a stale SVG.
  fs.rmSync(SVG_OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(SVG_OUT_DIR, 'tokens'), { recursive: true });
  const missing = [];

  // Token defaults (fallback when an item id has no override) live in tokens/.
  const tokenPaths = {};
  const tokenSourceIcons = {};
  for (const [token, name] of Object.entries(ICON_MAP)) {
    const icon = data.icons[name];
    if (!icon) {
      missing.push(`token ${token} -> ${name}`);
      continue;
    }
    const d = pathData(icon.body);
    tokenPaths[token] = d;
    tokenSourceIcons[token] = name;
    fs.writeFileSync(path.join(SVG_OUT_DIR, 'tokens', `${token}.svg`), svgFile(d, size));
  }

  // Per-item silhouettes, one SVG per item id.
  const itemPaths = {};
  const itemSourceIcons = {};
  for (const [id, name] of Object.entries(ITEM_ICON_OVERRIDES)) {
    const icon = data.icons[name];
    if (!icon) {
      missing.push(`item ${id} -> ${name}`);
      continue;
    }
    const d = pathData(icon.body);
    itemPaths[id] = d;
    itemSourceIcons[id] = name;
    fs.writeFileSync(path.join(SVG_OUT_DIR, `${id}.svg`), svgFile(d, size));
  }

  if (missing.length) {
    console.error('Missing icons in @iconify-json/game-icons:');
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  const block = (obj) => Object.keys(obj).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(obj[k])}`).join(',\n');
  const ts = `// GENERATED by scripts/assets/generate_item_icons.mjs — do not edit by hand.
// Item-icon silhouettes from ${ATTRIBUTION.source} (${ATTRIBUTION.authors}), ${ATTRIBUTION.license}.
// ${ATTRIBUTION.url} · attribution: ASSETS.md and CREDITS.md.
// Run \`npm run generate:item-icons\` to regenerate.

export const ITEM_GLYPH_VIEWBOX = ${size};

/** ItemDef id → SVG path data. Highest-priority lookup, so every item reads uniquely. */
export const ITEM_ICON_PATHS: Record<string, string> = {
${block(itemPaths)}
};

/** glyph token → SVG path data (fallback when an id has no entry above). */
export const ITEM_GLYPH_PATHS: Record<string, string> = {
${block(tokenPaths)}
};

/** id / token → source game-icons name, for provenance and credits. */
export const ITEM_ICON_SOURCE_ICONS: Record<string, string> = {
${block(itemSourceIcons)}
};
export const ITEM_GLYPH_SOURCE_ICONS: Record<string, string> = {
${block(tokenSourceIcons)}
};

export const ITEM_GLYPH_ATTRIBUTION = ${JSON.stringify(ATTRIBUTION, null, 2)} as const;
`;
  fs.writeFileSync(TS_OUT, ts);

  console.log(`generated ${Object.keys(itemPaths).length} per-item + ${Object.keys(tokenPaths).length} token SVGs in ${path.relative(ROOT, SVG_OUT_DIR)}`);
  console.log(`wrote ${path.relative(ROOT, TS_OUT)}`);
}

main();
