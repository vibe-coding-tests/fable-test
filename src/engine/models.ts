import * as THREE from 'three';
import type { ItemAppearanceSpec, ItemWeaponVisualKind, SilhouetteSpec } from '../core/types';

// ------------------------------------------------------------------
// Procedural unit models (SPEC §3): primitive-built, palette-driven,
// readable at gameplay zoom. Returns a rig of named parts that the
// animator drives. No external assets, ever.
// ------------------------------------------------------------------

export interface UnitRig {
  root: THREE.Group;       // positioned at unit origin (feet)
  body: THREE.Group;       // bobs/leans
  head?: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
  legL?: THREE.Object3D;
  legR?: THREE.Object3D;
  weapon?: THREE.Object3D;
  rightHand?: THREE.Object3D;
  itemLayer: THREE.Group;
  height: number;
  scale: number;
  attackBuild: SilhouetteSpec['build'];
  attackWeapon: NonNullable<SilhouetteSpec['weapon']> | ItemWeaponVisualKind;
  materials: THREE.MeshStandardMaterial[];
  mixer?: THREE.AnimationMixer;
  actions?: Partial<Record<AuthoredActionName, THREE.AnimationAction>>;
  activeAction?: AuthoredActionName;
  authoredModel?: THREE.Object3D;
}

export type AuthoredActionName = 'idle' | 'run' | 'attack' | 'cast' | 'channel' | 'death';

const ACTION_SYNONYMS: Record<AuthoredActionName, string[]> = {
  idle: ['idle', 'idling', 'stand', 'standing', 'breath'],
  run: ['run', 'running', 'walk', 'walking', 'move', 'locomotion'],
  attack: ['attack', 'attack1', 'slash', 'hit', 'bite', 'claw', 'shoot', 'melee'],
  cast: ['cast', 'spell', 'magic', 'ability', 'gesture'],
  channel: ['channel', 'channeled', 'loop', 'chant'],
  death: ['death', 'die', 'dying', 'dead']
};

function normClipName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findClip(
  clips: THREE.AnimationClip[],
  action: AuthoredActionName,
  names?: Partial<Record<AuthoredActionName, string>>
): THREE.AnimationClip | null {
  const requested = names?.[action];
  const needles = [
    ...(requested ? [requested] : []),
    ...ACTION_SYNONYMS[action]
  ].map(normClipName);
  for (const needle of needles) {
    const exact = clips.find((clip) => normClipName(clip.name) === needle);
    if (exact) return exact;
  }
  for (const needle of needles) {
    const fuzzy = clips.find((clip) => normClipName(clip.name).includes(needle));
    if (fuzzy) return fuzzy;
  }
  return null;
}

function collectStandardMaterials(rig: UnitRig, model: THREE.Object3D): void {
  const add = (mat: THREE.Material): void => {
    if (mat instanceof THREE.MeshStandardMaterial && !rig.materials.includes(mat)) rig.materials.push(mat);
  };
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach(add);
    else if (mat) add(mat);
  });
}

export interface HeroLikenessProfile {
  heroId: string;
  readsAs: string;
  features: string[];
}

export const HERO_LIKENESS_PROFILES: HeroLikenessProfile[] = [
  { heroId: 'juggernaut', readsAs: 'masked orange swordsman', features: ['white mask', 'crest fins', 'katana silhouette', 'belt sash'] },
  { heroId: 'crystal-maiden', readsAs: 'blue-white frost mage', features: ['fur hood', 'ice crown', 'frost staff', 'robe panels'] },
  { heroId: 'pudge', readsAs: 'huge green butcher with hook', features: ['belly scar', 'meat hook', 'apron straps', 'cleaver charm'] },
  { heroId: 'earthshaker', readsAs: 'horned blue-brown totem bruiser', features: ['horns', 'massive totem', 'stone shoulders', 'beard'] },
  { heroId: 'sniper', readsAs: 'short bearded rifleman', features: ['wide helm', 'goggles', 'long rifle', 'dwarf beard'] },
  { heroId: 'lich', readsAs: 'skeletal frost king', features: ['skull face', 'ice crown', 'ragged cape', 'frost staff'] },
  { heroId: 'luna', readsAs: 'silver-blue glaive rider', features: ['crescent helm', 'moon glaive', 'silver shoulders', 'glowing eyes'] },
  { heroId: 'sven', readsAs: 'masked heavy knight', features: ['winged helm', 'visor glow', 'greatsword', 'broad pauldrons'] },
  { heroId: 'axe', readsAs: 'red axe berserker', features: ['black mohawk', 'red body', 'spiked pauldrons', 'two-handed axe'] },
  { heroId: 'legion-commander', readsAs: 'red-gold duelist commander', features: ['crested helm', 'duel banner', 'gold chest plate', 'long sword'] },
  { heroId: 'shadow-fiend', readsAs: 'black demon of red souls', features: ['horns', 'red soul core', 'shadow wings', 'clawed arms'] },
  { heroId: 'lion', readsAs: 'purple demon witch', features: ['single horn', 'gold collar', 'monster hand', 'violet staff'] },
  { heroId: 'doom', readsAs: 'red infernal demon', features: ['huge horns', 'burning chest', 'black wings', 'fiery blade'] },
  { heroId: 'wraith-king', readsAs: 'green spectral skeleton king', features: ['crown', 'glowing skull', 'royal cape', 'green soul core'] },
  { heroId: 'invoker', readsAs: 'gold arcane magus', features: ['high collar', 'orb triad', 'gold shoulders', 'arcane cape'] },
  { heroId: 'medusa', readsAs: 'green serpent gorgon', features: ['snake crown', 'bow crest', 'stone-gaze eyes', 'scaled lower body'] },
  { heroId: 'tidehunter', readsAs: 'huge sea leviathan', features: ['wide jaw', 'anchor', 'shell shoulders', 'sea-green bulk'] },
  { heroId: 'tiny', readsAs: 'walking stone giant', features: ['rock crown', 'boulder shoulders', 'tree club', 'cracked core'] },
  { heroId: 'storm-spirit', readsAs: 'round blue storm monk', features: ['wide hat', 'white moustache', 'lightning belt', 'electric orbs'] },
  { heroId: 'kunkka', readsAs: 'blue admiral swordsman', features: ['captain hat', 'naval coat', 'ghost ship wheel', 'tide sword'] },
  { heroId: 'natures-prophet', readsAs: 'green antlered forest prophet', features: ['antlers', 'leaf cape', 'treant seed orbs', 'wood staff'] },
  { heroId: 'anti-mage', readsAs: 'purple twin-blade mage hunter', features: ['bald head mark', 'crescent glaives', 'purple sash', 'mana-burn glow'] },
  { heroId: 'queen-of-pain', readsAs: 'blue-winged pain demon', features: ['bat wings', 'horned crown', 'clawed hands', 'violet scream aura'] },
  { heroId: 'mars', readsAs: 'red-gold spear arena god', features: ['plumed helm', 'round shield', 'war spear', 'blood-red cape'] },
  { heroId: 'monkey-king', readsAs: 'golden staff trickster king', features: ['simian mask', 'long staff', 'gold circlet', 'red-gold cape'] },
  { heroId: 'rubick', readsAs: 'green hooded grand magus', features: ['high hood', 'green staff', 'floating spell cube', 'arcane cape'] },
  { heroId: 'techies', readsAs: 'goblin demolition trio', features: ['blast goggles', 'mine satchel', 'rifle barrel', 'yellow bomb sparks'] },
  { heroId: 'arc-warden', readsAs: 'blue-gold split self warden', features: ['faceless hood', 'crackling arc core', 'gold staff', 'double afterimage'] },
  { heroId: 'meepo', readsAs: 'small shovel-clan geomancer', features: ['digging cap', 'shovel blade', 'green scarf', 'clone pips'] },
  { heroId: 'morphling', readsAs: 'flowing blue water warrior', features: ['water body', 'crest wave', 'glowing eyes', 'ripple trail'] },
  { heroId: 'brewmaster', readsAs: 'broad drunken elemental brawler', features: ['barrel charm', 'bare headband', 'totem keg', 'tri-element wisps'] },
  // ---- Phase 2 ----
  { heroId: 'mirana', readsAs: 'moon-priestess on guard', features: ['star tiara', 'crescent bow', 'star cloak', 'glowing eyes'] },
  { heroId: 'lina', readsAs: 'red fire sorceress', features: ['flame ponytail', 'ember hands', 'hot eyes', 'slim robe'] },
  { heroId: 'zeus', readsAs: 'bearded storm lord', features: ['cloud beard', 'lightning rods', 'gold crown', 'crackling eyes'] },
  { heroId: 'drow-ranger', readsAs: 'icy elf archer', features: ['hood', 'frost bow', 'quiver', 'pale-blue eyes'] },
  { heroId: 'jakiro', readsAs: 'twin-headed dragon', features: ['fire head', 'ice head', 'wings', 'split palette'] },
  { heroId: 'witch-doctor', readsAs: 'voodoo shaman', features: ['bone mask', 'fetish charms', 'green eyes', 'arcane cape'] },
  { heroId: 'omniknight', readsAs: 'golden paladin', features: ['winged helm', 'halo glow', 'heavy plate', 'blue cape'] },
  { heroId: 'windranger', readsAs: 'green archer', features: ['hood', 'red scarf', 'quiver', 'glowing eyes'] },
  { heroId: 'phantom-assassin', readsAs: 'hooded daggerfall', features: ['veil mask', 'ragged cloak', 'hood', 'red eyes'] },
  { heroId: 'tusk', readsAs: 'walrus brawler', features: ['tusks', 'fur coat', 'ice gauntlets', 'cold eyes'] },
  { heroId: 'ancient-apparition', readsAs: 'floating ice wraith', features: ['frost crown', 'trailing wisp body', 'no legs', 'glacial eyes'] },
  // ---- Phase 3 ----
  { heroId: 'vengeful-spirit', readsAs: 'blue winged spirit', features: ['bat wings', 'horned crown', 'cape', 'glowing eyes'] },
  { heroId: 'riki', readsAs: 'small invis assassin', features: ['hood', 'smoke wisps', 'twin daggers', 'glowing eyes'] },
  { heroId: 'bounty-hunter', readsAs: 'masked ninja', features: ['gold mask', 'scarf', 'shuriken', 'gold trim'] },
  { heroId: 'winter-wyvern', readsAs: 'icy dragon', features: ['wings', 'frost crest', 'fanged maw', 'glacial eyes'] },
  { heroId: 'sand-king', readsAs: 'scorpion warrior', features: ['carapace', 'stinger tail', 'mandibles', 'glowing eyes'] },
  { heroId: 'nyx-assassin', readsAs: 'beetle assassin', features: ['carapace shell', 'mandibles', 'back spikes', 'glowing eyes'] },
  { heroId: 'viper', readsAs: 'nether drake', features: ['wings', 'scaled body', 'fanged maw', 'glowing eyes'] },
  { heroId: 'slardar', readsAs: 'fish-knight', features: ['fin crest', 'scaled plate', 'mace', 'glowing eyes'] },
  { heroId: 'naga-siren', readsAs: 'serpentine siren', features: ['scaled tail', 'head fins', 'no legs', 'glowing eyes'] },
  { heroId: 'slark', readsAs: 'fish rogue', features: ['fin head', 'hood', 'dagger', 'glowing eyes'] },
  { heroId: 'lifestealer', readsAs: 'feral ghoul', features: ['claws', 'exposed ribs', 'gaunt body', 'red eyes'] },
  { heroId: 'undying', readsAs: 'rotting zombie lord', features: ['tombstone arm', 'tattered robe', 'sagging jaw', 'pale eyes'] },
  { heroId: 'night-stalker', readsAs: 'bat demon', features: ['leather wings', 'fanged maw', 'horns', 'glowing eyes'] },
  { heroId: 'silencer', readsAs: 'arcane duelist', features: ['hood', 'curse glaive', 'sigil', 'glowing eyes'] },
  { heroId: 'outworld-destroyer', readsAs: 'astral construct', features: ['floating orb head', 'cape', 'orbiting glyphs', 'glowing eyes'] },
  { heroId: 'skywrath-mage', readsAs: 'winged bird-mage', features: ['feathered wings', 'beak helm', 'crest', 'glowing eyes'] },
  { heroId: 'tinker', readsAs: 'goblin inventor', features: ['goggles', 'backpack', 'laser arm', 'red core'] },
  { heroId: 'enchantress', readsAs: 'deer dryad', features: ['antlers', 'leaf dress', 'forest palette', 'glowing eyes'] },
  { heroId: 'chen', readsAs: 'holy knight', features: ['winged helm', 'halo glow', 'heavy plate', 'cape'] },
  { heroId: 'beastmaster', readsAs: 'tribal beast lord', features: ['boar helm', 'tusks', 'fur shoulders', 'glowing eyes'] },
  { heroId: 'broodmother', readsAs: 'giant spider', features: ['eight legs', 'abdomen', 'fangs', 'glowing eyes'] },
  { heroId: 'warlock', readsAs: 'demon summoner', features: ['horned hood', 'tome', 'horns', 'glowing eyes'] },
  { heroId: 'visage', readsAs: 'gargoyle', features: ['stone wings', 'crown', 'claws', 'glowing eyes'] },
  { heroId: 'magnus', readsAs: 'armored mammoth-man', features: ['tusks', 'quad mount', 'horns', 'glowing eyes'] },
  { heroId: 'elder-titan', readsAs: 'stone titan', features: ['rocky shoulders', 'spirit core', 'stone crown', 'glowing eyes'] },
  { heroId: 'treant-protector', readsAs: 'walking tree', features: ['bark body', 'branch antlers', 'leaf crown', 'glowing eyes'] },
  { heroId: 'centaur-warrunner', readsAs: 'centaur', features: ['quad mount', 'rock shoulders', 'beard', 'glowing eyes'] },
  { heroId: 'ember-spirit', readsAs: 'fire swordsman', features: ['topknot', 'ember wisps', 'fire palette', 'glowing eyes'] },
  { heroId: 'spectre', readsAs: 'shadow wraith', features: ['smoke body', 'blade-arms', 'no feet', 'glowing eyes'] },
  { heroId: 'faceless-void', readsAs: 'time alien', features: ['faceless head', 'gauntlet', 'carapace', 'face plate'] },
  { heroId: 'terrorblade', readsAs: 'demon marauder', features: ['horns', 'twin swords', 'wings', 'glowing eyes'] },
  { heroId: 'phoenix', readsAs: 'fire bird', features: ['flame wings', 'beak', 'ember body', 'glowing eyes'] },
  { heroId: 'io', readsAs: 'floating wisp', features: ['glowing orb', 'tether tendrils', 'no body', 'bright core'] },
  // ---- Standard: Strength ----
  { heroId: 'abaddon', readsAs: 'teal death-knight', features: ['horned helm', 'shield', 'mist cloak', 'glowing eyes'] },
  { heroId: 'alchemist', readsAs: 'ogre and goblin rider', features: ['barrel', 'cleaver', 'vials', 'glowing eyes'] },
  { heroId: 'bristleback', readsAs: 'quilled brute', features: ['back quills', 'snout', 'plate', 'glowing eyes'] },
  { heroId: 'dawnbreaker', readsAs: 'celestial smith', features: ['halo', 'hammer', 'pauldrons', 'glowing eyes'] },
  { heroId: 'dragon-knight', readsAs: 'armored dragon knight', features: ['helm crest', 'scale cape', 'plate', 'glowing eyes'] },
  { heroId: 'huskar', readsAs: 'spear tribesman', features: ['topknot', 'back spear', 'low-HP glow', 'glowing eyes'] },
  { heroId: 'ogre-magi', readsAs: 'two-headed ogre', features: ['two heads', 'club', 'fur', 'bulky body'] },
  { heroId: 'primal-beast', readsAs: 'giant ape-beast', features: ['tusks', 'fists', 'mane', 'glowing eyes'] },
  { heroId: 'spirit-breaker', readsAs: 'charging bull-demon', features: ['quad mount', 'horns', 'star core', 'glowing eyes'] },
  { heroId: 'underlord', readsAs: 'hulking pit demon', features: ['tusks', 'maul', 'dark armor', 'glowing eyes'] },
  // ---- Standard: Agility ----
  { heroId: 'bloodseeker', readsAs: 'blood hound', features: ['crest fin', 'claws', 'red palette', 'red eyes'] },
  { heroId: 'clinkz', readsAs: 'flaming skeleton archer', features: ['exposed ribs', 'gun-bow', 'fire eyes', 'bone body'] },
  { heroId: 'gyrocopter', readsAs: 'goblin gyro pilot', features: ['rotor', 'cockpit', 'gun arms', 'glowing eyes'] },
  { heroId: 'hoodwink', readsAs: 'squirrel ranger', features: ['bushy tail', 'hood', 'crossbow', 'glowing eyes'] },
  { heroId: 'razor', readsAs: 'lightning revenant', features: ['smoke body', 'lightning whip', 'storm crackle', 'glowing eyes'] },
  { heroId: 'templar-assassin', readsAs: 'psionic templar', features: ['headdress', 'refraction shards', 'crest', 'glowing eyes'] },
  { heroId: 'troll-warlord', readsAs: 'troll berserker', features: ['tusks', 'dual axes', 'war paint', 'glowing eyes'] },
  { heroId: 'ursa', readsAs: 'bear warrior', features: ['bear head', 'ears', 'claws', 'glowing eyes'] },
  { heroId: 'venomancer', readsAs: 'plague lizard', features: ['tail', 'back spines', 'poison palette', 'glowing eyes'] },
  { heroId: 'weaver', readsAs: 'beetle weaver', features: ['carapace', 'wings', 'mandibles', 'glowing eyes'] },
  // ---- Standard: Intelligence ----
  { heroId: 'death-prophet', readsAs: 'banshee witch', features: ['veil hood', 'robe cape', 'skull charm', 'glowing eyes'] },
  { heroId: 'disruptor', readsAs: 'storm shaman', features: ['hide hood', 'totems', 'lightning palette', 'glowing eyes'] },
  { heroId: 'grimstroke', readsAs: 'ink sorcerer', features: ['mask', 'brush-quill', 'cape', 'glowing eyes'] },
  { heroId: 'keeper-of-the-light', readsAs: 'lantern wizard', features: ['beard', 'lantern', 'cape', 'glowing eyes'] },
  { heroId: 'leshrac', readsAs: 'tormented demon', features: ['horns', 'tail', 'bone crown', 'glowing eyes'] },
  { heroId: 'necrophos', readsAs: 'plague reaper', features: ['hood', 'scythe', 'skull head', 'glowing eyes'] },
  { heroId: 'puck', readsAs: 'faerie dragon', features: ['wings', 'horns', 'slim body', 'glowing eyes'] },
  { heroId: 'pugna', readsAs: 'nether skull-mage', features: ['skull head', 'ward orbs', 'cape', 'glowing eyes'] },
  // queen-of-pain is profiled in the marquee group above (richer entry); no duplicate here.
  { heroId: 'shadow-demon', readsAs: 'eredar demon', features: ['horns', 'hood', 'claws', 'glowing eyes'] },
  { heroId: 'shadow-shaman', readsAs: 'troll shaman', features: ['mask', 'feathers', 'ward staff', 'glowing eyes'] },
  // ---- Standard: Universal ----
  { heroId: 'bane', readsAs: 'nightmare horror', features: ['tentacle body', 'big eye', 'no legs', 'glowing eyes'] },
  { heroId: 'batrider', readsAs: 'imp on bat', features: ['bat wings', 'torch', 'flame', 'glowing eyes'] },
  { heroId: 'clockwerk', readsAs: 'clockwork knight', features: ['gear armor', 'cogs', 'hook', 'glowing eyes'] },
  { heroId: 'dark-seer', readsAs: 'hooded seer', features: ['dome head', 'third eye', 'cape', 'glowing eyes'] },
  { heroId: 'dark-willow', readsAs: 'fae trickster', features: ['wisp wings', 'fae mask', 'staff', 'glowing eyes'] },
  { heroId: 'dazzle', readsAs: 'troll priest', features: ['bone mask', 'wand', 'robe', 'glowing eyes'] },
  { heroId: 'earth-spirit', readsAs: 'stone monk', features: ['rock shoulders', 'totem', 'golem body', 'glowing eyes'] },
  { heroId: 'enigma', readsAs: 'void blob', features: ['dark mass', 'inner stars', 'no legs', 'glowing eyes'] },
  { heroId: 'lone-druid', readsAs: 'bear druid', features: ['hood', 'bear companion head', 'fur', 'glowing eyes'] },
  { heroId: 'lycan', readsAs: 'werewolf lord', features: ['wolf head', 'snout', 'claws', 'glowing eyes'] },
  { heroId: 'marci', readsAs: 'martial companion', features: ['braid', 'gauntlets', 'satchel', 'glowing eyes'] },
  { heroId: 'pangolier', readsAs: 'pangolin swashbuckler', features: ['plumed hat', 'scale plates', 'rapier', 'glowing eyes'] },
  { heroId: 'snapfire', readsAs: 'granny on a lizard mount', features: ['quad mount', 'goggles', 'shotgun', 'glowing eyes'] },
  { heroId: 'timbersaw', readsAs: 'mech lumberjack', features: ['saw-mech frame', 'chain saws', 'armor', 'glowing eyes'] },
  { heroId: 'void-spirit', readsAs: 'astral monk', features: ['crystal hood', 'rifts', 'blade', 'glowing eyes'] },
  // ---- Complex ----
  { heroId: 'chaos-knight', readsAs: 'armored chaos rider', features: ['jagged crown', 'cape', 'pauldrons', 'red eyes'] },
  { heroId: 'phantom-lancer', readsAs: 'blue spear duelist', features: ['crest', 'lance', 'sash', 'glowing eyes'] }
];

// PBR base material. Node-safe: MeshStandardMaterial constructs without a GL
// context (no textures here), so model-cache / perf-harness tests still pass.
// Picks up the scene env map at render time for Dota-style lit highlights.
function lam(color: string | number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: emissive ? 1 : 0,
    roughness: 0.74,
    metalness: 0.12,
    flatShading: false,
    envMapIntensity: 0.55
  });
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

function shareGeometry<T extends THREE.BufferGeometry>(geo: T): T {
  const key = `${geo.type}:${JSON.stringify((geo as T & { parameters?: unknown }).parameters ?? {})}`;
  const cached = geometryCache.get(key);
  if (cached) {
    geo.dispose();
    return cached as T;
  }
  geometryCache.set(key, geo);
  return geo;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(shareGeometry(geo), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function modelGeometryCacheSize(): number {
  return geometryCache.size;
}

export function buildUnitRig(sil: SilhouetteSpec, palette: [string, string, string]): UnitRig {
  const [primary, secondary, accent] = palette;
  // Role-differentiated PBR: primary reads as cloth/skin, secondary as worked
  // metal/armour, accent as polished gem/trim that catches the env map + bloom.
  const matP = lam(primary);
  matP.roughness = 0.82;
  matP.metalness = 0.06;
  const matS = lam(secondary);
  matS.roughness = 0.44;
  matS.metalness = 0.55;
  const matA = lam(accent);
  matA.roughness = 0.28;
  matA.metalness = 0.45;
  matA.envMapIntensity = 0.95;
  const materials = [matP, matS, matA];
  const s = sil.scale;

  const root = new THREE.Group();
  const body = new THREE.Group();
  const itemLayer = new THREE.Group();
  root.add(body);
  root.add(itemLayer);

  const rig: UnitRig = {
    root,
    body,
    itemLayer,
    height: 1.8 * s,
    scale: s,
    attackBuild: sil.build,
    attackWeapon: sil.weapon ?? 'none',
    materials
  };

  switch (sil.build) {
    case 'ward': {
      const post = mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.4 * s, 10), matS);
      post.position.y = 0.7 * s;
      const eye = mesh(new THREE.OctahedronGeometry(0.34 * s), matA);
      eye.position.y = 1.6 * s;
      eye.name = 'ward-eye';
      body.add(post, eye);
      rig.head = eye;
      rig.height = 1.9 * s;
      return rig;
    }
    case 'blob': {
      const blob = mesh(new THREE.SphereGeometry(0.7 * s, 14, 10), matP);
      blob.position.y = 0.65 * s;
      blob.scale.y = 0.85;
      const eyeL = mesh(new THREE.SphereGeometry(0.09 * s, 8, 6), matA);
      eyeL.position.set(0.5 * s, 0.8 * s, 0.22 * s);
      const eyeR = eyeL.clone();
      eyeR.position.z = -0.22 * s;
      body.add(blob, eyeL, eyeR);
      rig.height = 1.3 * s;
      return rig;
    }
    case 'quad': {
      const torso = mesh(new THREE.BoxGeometry(1.5 * s, 0.7 * s, 0.8 * s), matP);
      torso.position.y = 0.75 * s;
      body.add(torso);
      const head = mesh(new THREE.BoxGeometry(0.55 * s, 0.5 * s, 0.5 * s), matS);
      head.position.set(0.95 * s, 1.0 * s, 0);
      body.add(head);
      rig.head = head;
      const legGeo = new THREE.CylinderGeometry(0.1 * s, 0.13 * s, 0.7 * s, 10);
      const legs: THREE.Object3D[] = [];
      for (const [lx, lz] of [[0.55, 0.3], [0.55, -0.3], [-0.55, 0.3], [-0.55, -0.3]]) {
        const leg = mesh(legGeo, matS);
        leg.position.set(lx * s, 0.35 * s, lz * s);
        body.add(leg);
        legs.push(leg);
      }
      rig.legL = legs[0];
      rig.legR = legs[1];
      rig.height = 1.4 * s;
      return rig;
    }
    case 'bird': {
      const torso = mesh(new THREE.SphereGeometry(0.5 * s, 12, 8), matP);
      torso.position.y = 1.1 * s;
      const head = mesh(new THREE.SphereGeometry(0.28 * s, 12, 8), matS);
      head.position.set(0.4 * s, 1.6 * s, 0);
      const beak = mesh(new THREE.ConeGeometry(0.1 * s, 0.35 * s, 8), matA);
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.72 * s, 1.6 * s, 0);
      const wingGeo = new THREE.BoxGeometry(0.5 * s, 0.08 * s, 0.9 * s);
      const wingL = mesh(wingGeo, matS);
      wingL.position.set(-0.1 * s, 1.25 * s, 0.6 * s);
      const wingR = mesh(wingGeo, matS);
      wingR.position.set(-0.1 * s, 1.25 * s, -0.6 * s);
      body.add(torso, head, beak, wingL, wingR);
      rig.head = head;
      rig.armL = wingL;
      rig.armR = wingR;
      rig.height = 1.9 * s;
      return rig;
    }
    case 'golem': {
      const torso = mesh(new THREE.DodecahedronGeometry(0.8 * s, 1), matP);
      torso.position.y = 1.2 * s;
      torso.scale.set(1, 1.15, 0.85);
      body.add(torso);
      const head = mesh(new THREE.DodecahedronGeometry(0.32 * s, 1), matS);
      head.position.y = 2.25 * s;
      body.add(head);
      rig.head = head;
      const armGeo = new THREE.DodecahedronGeometry(0.34 * s, 1);
      const armL = new THREE.Group();
      const armR = new THREE.Group();
      const fistL = mesh(armGeo, matS);
      fistL.position.y = -0.8 * s;
      const fistR = mesh(armGeo, matS);
      fistR.position.y = -0.8 * s;
      armL.add(fistL);
      armR.add(fistR);
      armL.position.set(0, 1.8 * s, 0.95 * s);
      armR.position.set(0, 1.8 * s, -0.95 * s);
      body.add(armL, armR);
      rig.armL = armL;
      rig.armR = armR;
      const legGeo = new THREE.BoxGeometry(0.4 * s, 0.6 * s, 0.4 * s);
      const legL = mesh(legGeo, matS);
      legL.position.set(0, 0.3 * s, 0.4 * s);
      const legR = mesh(legGeo, matS);
      legR.position.set(0, 0.3 * s, -0.4 * s);
      body.add(legL, legR);
      rig.legL = legL;
      rig.legR = legR;
      rig.height = 2.6 * s;
      return rig;
    }
    case 'brute':
    case 'biped':
    default: {
      const brute = sil.build === 'brute';
      const wide = sil.bodyShape === 'bulky' || brute;
      const robed = sil.bodyShape === 'robed';

      // torso
      const torsoGeo = robed
        ? new THREE.ConeGeometry(0.55 * s, 1.3 * s, 12)
        : new THREE.BoxGeometry((wide ? 0.95 : 0.62) * s, 0.95 * s, (wide ? 0.7 : 0.45) * s);
      const torso = mesh(torsoGeo, matP);
      torso.position.y = (robed ? 0.85 : 1.05) * s;
      body.add(torso);

      // belt
      if (sil.extras?.includes('belt') && !robed) {
        const belt = mesh(new THREE.BoxGeometry((wide ? 1.0 : 0.68) * s, 0.16 * s, (wide ? 0.74 : 0.5) * s), matA);
        belt.position.y = 0.68 * s;
        body.add(belt);
      }

      // head
      const headGroup = new THREE.Group();
      headGroup.position.y = (robed ? 1.75 : 1.85) * s;
      let headMesh: THREE.Mesh;
      switch (sil.head) {
        case 'helm':
          headMesh = mesh(new THREE.CylinderGeometry(0.24 * s, 0.28 * s, 0.42 * s, 12), matS);
          break;
        case 'hood':
          headMesh = mesh(new THREE.ConeGeometry(0.3 * s, 0.55 * s, 12), matS);
          headMesh.position.y = 0.05 * s;
          break;
        case 'mask':
          headMesh = mesh(new THREE.SphereGeometry(0.26 * s, 12, 8), matS);
          break;
        case 'skull':
          headMesh = mesh(new THREE.SphereGeometry(0.26 * s, 12, 8), lam('#e8e8d8'));
          break;
        case 'horned':
          headMesh = mesh(new THREE.SphereGeometry(0.28 * s, 12, 8), matS);
          break;
        default:
          headMesh = mesh(new THREE.SphereGeometry(0.25 * s, 12, 8), matS);
      }
      headGroup.add(headMesh);
      if (sil.head === 'mask') {
        const visor = mesh(new THREE.BoxGeometry(0.34 * s, 0.18 * s, 0.12 * s), matA);
        visor.position.set(0.18 * s, 0.02 * s, 0);
        headGroup.add(visor);
      }
      if (sil.head === 'horned' || sil.extras?.includes('horns')) {
        const hornGeo = new THREE.ConeGeometry(0.07 * s, 0.4 * s, 8);
        const hornL = mesh(hornGeo, matA);
        hornL.position.set(0, 0.22 * s, 0.22 * s);
        hornL.rotation.x = 0.5;
        const hornR = mesh(hornGeo, matA);
        hornR.position.set(0, 0.22 * s, -0.22 * s);
        hornR.rotation.x = -0.5;
        headGroup.add(hornL, hornR);
      }
      if (sil.extras?.includes('crown')) {
        const crown = mesh(new THREE.CylinderGeometry(0.2 * s, 0.24 * s, 0.16 * s, 12), matA);
        crown.position.y = 0.3 * s;
        headGroup.add(crown);
      }
      body.add(headGroup);
      rig.head = headGroup;

      // shoulderpads
      if (sil.extras?.includes('shoulderpads')) {
        const padGeo = new THREE.SphereGeometry(0.22 * s, 10, 8);
        const padL = mesh(padGeo, matA);
        padL.position.set(0, 1.5 * s, (wide ? 0.55 : 0.42) * s);
        const padR = mesh(padGeo, matA);
        padR.position.set(0, 1.5 * s, -(wide ? 0.55 : 0.42) * s);
        body.add(padL, padR);
      }

      // cape
      if (sil.extras?.includes('cape')) {
        const cape = mesh(new THREE.BoxGeometry(0.08 * s, 1.15 * s, 0.55 * s), matA);
        cape.position.set(-0.3 * s, 1.05 * s, 0);
        body.add(cape);
      }

      // arms (pivot at shoulder)
      const armLen = (brute ? 0.95 : 0.75) * s;
      const armGeo = new THREE.CylinderGeometry(0.09 * s, (brute ? 0.16 : 0.1) * s, armLen, 10);
      const mkArm = (side: 1 | -1): THREE.Group => {
        const arm = new THREE.Group();
        const limb = mesh(armGeo, matS);
        limb.position.y = -armLen / 2;
        arm.add(limb);
        if (brute) {
          const fist = mesh(new THREE.SphereGeometry(0.18 * s, 10, 8), matS);
          fist.position.y = -armLen;
          arm.add(fist);
        }
        arm.position.set(0, 1.5 * s, side * ((wide ? 0.6 : 0.42) * s));
        return arm;
      };
      const armL = mkArm(1);
      const armR = mkArm(-1);
      body.add(armL, armR);
      rig.armL = armL;
      rig.armR = armR;
      rig.rightHand = armR;

      // legs (hidden under robe)
      if (!robed) {
        const legLen = 0.62 * s;
        const legGeo = new THREE.CylinderGeometry(0.1 * s, 0.12 * s, legLen, 10);
        const mkLeg = (side: 1 | -1): THREE.Group => {
          const leg = new THREE.Group();
          const limb = mesh(legGeo, matS);
          limb.position.y = -legLen / 2;
          leg.add(limb);
          leg.position.set(0, 0.6 * s, side * 0.2 * s);
          return leg;
        };
        const legL = mkLeg(1);
        const legR = mkLeg(-1);
        body.add(legL, legR);
        rig.legL = legL;
        rig.legR = legR;
      }

      // weapon in right hand
      const weapon = buildWeapon(sil.weapon, s, matS, matA);
      if (weapon) {
        weapon.position.set(0.15 * s, -armLen * 0.9, 0);
        armR.add(weapon);
        rig.weapon = weapon;
      }

      if (sil.extras?.includes('quiver')) {
        const quiver = mesh(new THREE.CylinderGeometry(0.1 * s, 0.12 * s, 0.6 * s, 10), matA);
        quiver.position.set(-0.32 * s, 1.35 * s, 0.15 * s);
        quiver.rotation.x = 0.4;
        body.add(quiver);
      }

      rig.height = (robed ? 2.05 : 2.15) * s;
      return rig;
    }
  }
}

/**
 * Swap a loaded glTF scene in for the procedural body (Phase 5 pluggable rig).
 * Pure Object3D math — no GL context — so it is unit-testable headless. Procedural
 * parts are hidden (not disposed) so a failed/again-absent load can fall back, and
 * the itemLayer (on root) keeps driving item visuals over the authored model.
 */
export function mountHeroModel(
  rig: UnitRig,
  model: THREE.Object3D,
  clips: THREE.AnimationClip[] = [],
  clipNames?: Partial<Record<AuthoredActionName, string>>
): void {
  for (const child of rig.body.children) child.visible = false;
  if (rig.authoredModel?.parent) rig.authoredModel.parent.remove(rig.authoredModel);

  // Fit authored height to the procedural silhouette and seat feet on the ground.
  const pre = new THREE.Box3().setFromObject(model);
  const size = pre.getSize(new THREE.Vector3());
  const k = rig.height / (size.y || 1);
  model.scale.setScalar(k);
  const post = new THREE.Box3().setFromObject(model);
  model.position.y -= post.min.y;

  collectStandardMaterials(rig, model);
  model.userData.heroModel = true;
  rig.body.add(model);
  rig.authoredModel = model;

  if (clips.length > 0) {
    const mixer = new THREE.AnimationMixer(model);
    const actions: Partial<Record<AuthoredActionName, THREE.AnimationAction>> = {};
    for (const name of ['idle', 'run', 'attack', 'cast', 'channel', 'death'] as const) {
      const clip = findClip(clips, name, clipNames);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      if (name === 'attack' || name === 'cast' || name === 'death') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions[name] = action;
    }
    rig.mixer = mixer;
    rig.actions = actions;
    const idle = actions.idle ?? actions.run ?? actions.channel;
    if (idle) {
      idle.reset();
      idle.enabled = true;
      idle.setEffectiveWeight(1);
      idle.play();
      rig.activeAction = actions.idle ? 'idle' : actions.run ? 'run' : 'channel';
    }
  }
}

export function applyHeroLikeness(rig: UnitRig, heroId: string): void {
  const s = rig.scale;
  const body = rig.body;
  const add = (...objs: THREE.Object3D[]) => body.add(...objs);

  const box = (w: number, h: number, d: number, color: string | number, emissive = 0): THREE.Mesh =>
    mesh(new THREE.BoxGeometry(w * s, h * s, d * s), lam(color, emissive));
  const sphere = (r: number, color: string | number, emissive = 0): THREE.Mesh =>
    mesh(new THREE.SphereGeometry(r * s, 14, 10), lam(color, emissive));
  const cone = (r: number, h: number, color: string | number, emissive = 0): THREE.Mesh =>
    mesh(new THREE.ConeGeometry(r * s, h * s, 10), lam(color, emissive));
  const cyl = (rt: number, rb: number, h: number, color: string | number, emissive = 0): THREE.Mesh =>
    mesh(new THREE.CylinderGeometry(rt * s, rb * s, h * s, 12), lam(color, emissive));
  const torus = (r: number, tube: number, color: string | number, emissive = 0, arc = Math.PI * 2): THREE.Mesh =>
    mesh(new THREE.TorusGeometry(r * s, tube * s, 8, 24, arc), lam(color, emissive));
  // Paired glowing eyes — the single strongest "this is a hero" read at zoom.
  const eyes = (fx: number, y: number, dz: number, r: number, color: string): THREE.Mesh[] => {
    const eL = sphere(r, color, 0x222222);
    eL.position.set(fx * s, y * s, dz * s);
    const eR = eL.clone();
    eR.position.z = -dz * s;
    return [eL, eR];
  };

  // ---- Composite feature closures ----
  // Shared recognizable parts so each hero case stays a handful of cheap calls.
  // All lean on the primitive helpers above, palette-driven and scaled by rig.scale.
  const dodeca = (r: number, color: string | number, emissive = 0): THREE.Mesh =>
    mesh(new THREE.DodecahedronGeometry(r * s, 0), lam(color, emissive));
  const octa = (r: number, color: string | number, emissive = 0): THREE.Mesh =>
    mesh(new THREE.OctahedronGeometry(r * s), lam(color, emissive));

  const horns = (color: string, len = 0.42, y = 2.0, spread = 0.18, tilt = 0.4, lean = 0.5): void => {
    const hL = cone(0.075, len, color);
    hL.position.set(0.04 * s, y * s, spread * s);
    hL.rotation.set(tilt, 0, lean);
    const hR = hL.clone();
    hR.position.z = -spread * s;
    hR.rotation.set(-tilt, 0, lean);
    add(hL, hR);
  };
  const wings = (color: string, span = 0.85, y = 1.3, emissive = 0): void => {
    const wL = box(0.05, span, 0.34, color, emissive);
    wL.position.set(-0.42 * s, y * s, 0.42 * s);
    wL.rotation.z = 0.4;
    const wR = wL.clone();
    wR.position.z = -0.42 * s;
    add(wL, wR);
  };
  const antlers = (color: string): void => {
    const aL = cone(0.05, 0.5, color);
    aL.position.set(0, 2.12 * s, 0.18 * s);
    aL.rotation.x = 0.55;
    const aR = aL.clone();
    aR.position.z = -0.18 * s;
    aR.rotation.x = -0.55;
    const bL = cone(0.035, 0.24, color);
    bL.position.set(0.02 * s, 2.34 * s, 0.32 * s);
    bL.rotation.x = 1.0;
    const bR = bL.clone();
    bR.position.z = -0.32 * s;
    bR.rotation.x = -1.0;
    add(aL, aR, bL, bR);
  };
  const crownSpikes = (n: number, color: string, emissive = 0, y = 2.06): void => {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const sp = cone(0.05, 0.26 + (i % 2) * 0.12, color, emissive);
      sp.position.set(0.04 * s, (y + (i % 2) * 0.04) * s, (i - (n - 1) / 2) * 0.11 * s);
      g.add(sp);
    }
    add(g);
  };
  const hoodCowl = (color: string, emissive = 0): void => {
    const h = sphere(0.27, color, emissive);
    h.scale.set(0.95, 1.05, 1.12);
    h.position.set(-0.04 * s, 1.86 * s, 0);
    const peak = cone(0.13, 0.32, color, emissive);
    peak.position.set(-0.1 * s, 2.04 * s, 0);
    peak.rotation.z = 0.4;
    add(h, peak);
  };
  const beard = (color: string, y = 1.54): void => {
    const b = cone(0.18, 0.42, color);
    b.rotation.z = Math.PI;
    b.position.set(0.15 * s, y * s, 0);
    add(b);
  };
  const tailSerpent = (color: string, tipColor?: string): void => {
    const seg = cyl(0.27, 0.1, 0.95, color);
    seg.position.set(-0.06 * s, 0.5 * s, 0);
    seg.rotation.z = 0.25;
    const coil = torus(0.2, 0.09, color, 0, Math.PI * 1.3);
    coil.position.set(-0.32 * s, 0.22 * s, 0);
    const tip = cone(0.09, 0.3, tipColor ?? color);
    tip.position.set(-0.12 * s, 0.06 * s, 0);
    tip.rotation.z = 1.4;
    add(seg, coil, tip);
  };
  const mountQuad = (color: string): void => {
    const haunch = sphere(0.36, color);
    haunch.scale.set(1.5, 0.95, 0.95);
    haunch.position.set(-0.52 * s, 0.95 * s, 0);
    add(haunch);
    for (const [x, z] of [[-0.78, 0.24], [-0.78, -0.24], [-0.3, 0.26], [-0.3, -0.26]] as const) {
      const lg = cyl(0.08, 0.05, 0.95, color);
      lg.position.set(x * s, 0.46 * s, z * s);
      add(lg);
    }
  };
  const shoulderSlabs = (color: string, r = 0.26): void => {
    const sL = dodeca(r, color);
    sL.position.set(0, 1.54 * s, 0.56 * s);
    const sR = sL.clone();
    sR.position.z = -0.56 * s;
    add(sL, sR);
  };
  const chestCore = (color: string, emissive = 0x222222): void => {
    const c = sphere(0.15, color, emissive);
    c.position.set(0.34 * s, 1.2 * s, 0);
    add(c);
  };
  const cape = (color: string, w = 0.68): void => {
    const c = box(0.05, 1.05, w, color);
    c.position.set(-0.34 * s, 1.0 * s, 0);
    add(c);
  };
  const gunArm = (color: string, accent?: string): void => {
    const barrel = cyl(0.06, 0.085, 0.72, color);
    barrel.position.set(0.5 * s, 1.2 * s, 0.18 * s);
    barrel.rotation.z = Math.PI / 2;
    const muzzle = cyl(0.1, 0.1, 0.1, accent ?? color, 0x331100);
    muzzle.position.set(0.86 * s, 1.2 * s, 0.18 * s);
    muzzle.rotation.z = Math.PI / 2;
    add(barrel, muzzle);
  };
  const bowCrest = (color: string): void => {
    const b = torus(0.3, 0.035, color, 0, Math.PI * 1.5);
    b.position.set(0.5 * s, 1.2 * s, 0.4 * s);
    b.rotation.y = Math.PI / 2;
    add(b);
  };
  const fangedMaw = (color: string): void => {
    const jaw = sphere(0.22, color);
    jaw.scale.set(1.1, 0.55, 1);
    jaw.position.set(0.26 * s, 1.62 * s, 0);
    const fL = cone(0.03, 0.12, '#f4f4e8');
    fL.rotation.x = Math.PI;
    fL.position.set(0.34 * s, 1.5 * s, 0.06 * s);
    const fR = fL.clone();
    fR.position.z = -0.06 * s;
    add(jaw, fL, fR);
  };
  const tusksPair = (color = '#f0ead8'): void => {
    const tL = cone(0.05, 0.26, color);
    tL.rotation.set(0, 0, 2.6);
    tL.position.set(0.28 * s, 1.5 * s, 0.12 * s);
    const tR = tL.clone();
    tR.position.z = -0.12 * s;
    add(tL, tR);
  };
  const orbitOrbs = (n: number, color: string, r = 0.09, ringR = 0.42, y = 1.5): void => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const o = sphere(r, color, 0x222222);
      o.position.set(0.1 * s, (y + Math.sin(a) * 0.18) * s, Math.cos(a) * ringR * s);
      add(o);
    }
  };

  switch (heroId) {
    case 'juggernaut': {
      // White Mask of the Yurnero: slit mask, teal eye-slit glow, fanned crest fins, red sash.
      const mask = box(0.1, 0.36, 0.3, '#f3e3c2');
      mask.position.set(0.25 * s, 1.84 * s, 0);
      const visor = box(0.1, 0.05, 0.24, '#7adfc4', 0x0c2a26);
      visor.position.set(0.31 * s, 1.9 * s, 0);
      const fins = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const fin = cone(0.07, 0.34 + i * 0.06, i === 1 ? '#e07d2c' : '#c8742c');
        fin.rotation.z = -0.7 + (i - 1) * 0.18;
        fin.position.set(-0.02 * s, 2.12 * s, (i - 1) * 0.16 * s);
        fins.add(fin);
      }
      const sash = box(0.06, 0.18, 0.5, '#b8331f');
      sash.position.set(0.18 * s, 0.7 * s, 0);
      const padL = sphere(0.17, '#c8742c');
      padL.scale.set(1.1, 0.7, 1);
      padL.position.set(0, 1.5 * s, 0.46 * s);
      const padR = padL.clone();
      padR.position.z = -0.46 * s;
      add(mask, visor, fins, sash, padL, padR);
      break;
    }
    case 'crystal-maiden': {
      // Rylai: fur hood ring, layered ice crown, frost cloak, chest gem, frosty breath glow.
      const fur = torus(0.27, 0.06, '#f4fbff');
      fur.position.set(0, 1.76 * s, 0);
      fur.rotation.x = Math.PI / 2;
      const crownG = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const spike = cone(0.07, 0.3 + i * 0.08, '#d8f4ff', 0x163a52);
        spike.position.set(0.04 * s, 2.06 * s, (i - 1) * 0.13 * s);
        crownG.add(spike);
      }
      const gem = mesh(new THREE.OctahedronGeometry(0.12 * s), lam('#9fe6ff', 0x16465e));
      gem.position.set(0.3 * s, 1.24 * s, 0);
      const cloak = box(0.06, 1.0, 0.72, '#9fd0ec');
      cloak.position.set(-0.32 * s, 0.92 * s, 0);
      const robeL = box(0.05, 0.78, 0.2, '#d8f4ff');
      robeL.position.set(0.32 * s, 0.8 * s, 0.2 * s);
      const robeR = robeL.clone();
      robeR.position.z = -0.2 * s;
      add(fur, crownG, gem, cloak, robeL, robeR, ...eyes(0.34, 1.86, 0.08, 0.04, '#bff0ff'));
      break;
    }
    case 'pudge': {
      // The Butcher: bloated stitched belly, hook on the back, blood apron, sagging jaw.
      const belly = sphere(0.52, '#9fae6a');
      belly.scale.set(1.15, 0.92, 0.85);
      belly.position.set(0.14 * s, 0.98 * s, 0);
      const jaw = sphere(0.2, '#9fae6a');
      jaw.scale.set(0.8, 0.6, 1);
      jaw.position.set(0.22 * s, 1.62 * s, 0);
      const scar = box(0.05, 0.56, 0.04, '#6b2a1f');
      scar.position.set(0.6 * s, 0.98 * s, 0);
      scar.rotation.z = 0.4;
      const stitches = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const st = box(0.02, 0.02, 0.16, '#2c1410');
        st.position.set(0.62 * s, (0.78 + i * 0.11) * s, 0);
        st.rotation.z = 0.4;
        stitches.add(st);
      }
      const apron = box(0.08, 0.74, 0.46, '#5d2f21');
      apron.position.set(0.54 * s, 0.84 * s, 0);
      const hookHaft = cyl(0.04, 0.04, 0.7, '#3a2a1c');
      hookHaft.position.set(-0.42 * s, 1.4 * s, -0.1 * s);
      hookHaft.rotation.z = 0.3;
      const hook = torus(0.16, 0.05, '#b8b0a0', 0, Math.PI * 1.4);
      hook.position.set(-0.5 * s, 1.05 * s, -0.1 * s);
      add(belly, jaw, scar, stitches, apron, hookHaft, hook);
      break;
    }
    case 'earthshaker': {
      // Raigor: curved horns, golden beard, stone shoulder slabs, glowing totem rune.
      const hornL = cone(0.07, 0.42, '#e8dcc0');
      hornL.position.set(0.05 * s, 2.0 * s, 0.18 * s);
      hornL.rotation.set(0.4, 0, 0.5);
      const hornR = hornL.clone();
      hornR.position.z = -0.18 * s;
      hornR.rotation.set(-0.4, 0, 0.5);
      const beard = cone(0.22, 0.46, '#e8b15c');
      beard.rotation.z = Math.PI;
      beard.position.set(0.16 * s, 1.56 * s, 0);
      const stoneL = mesh(new THREE.DodecahedronGeometry(0.28 * s, 0), lam('#5b6b7c'));
      stoneL.scale.set(1.15, 0.7, 0.95);
      stoneL.position.set(0, 1.56 * s, 0.7 * s);
      const stoneR = stoneL.clone();
      stoneR.position.z = -0.7 * s;
      const rune = mesh(new THREE.OctahedronGeometry(0.12 * s), lam('#6fd0ff', 0x12506e));
      rune.position.set(0.34 * s, 1.18 * s, 0);
      add(hornL, hornR, beard, stoneL, stoneR, rune);
      break;
    }
    case 'sniper': {
      // Kardel: wide brimmed hat, glowing amber goggles, dwarf beard, ammo pack + scope.
      const brim = cyl(0.36, 0.36, 0.05, '#5c4a32');
      brim.position.set(0, 1.95 * s, 0);
      const dome = sphere(0.22, '#6b573a');
      dome.scale.y = 0.8;
      dome.position.set(0, 2.04 * s, 0);
      const goggles = box(0.08, 0.1, 0.34, '#ffd27f', 0x4a3208);
      goggles.position.set(0.24 * s, 1.86 * s, 0);
      const beard = cone(0.17, 0.4, '#d7b07a');
      beard.rotation.z = Math.PI;
      beard.position.set(0.15 * s, 1.54 * s, 0);
      const pack = box(0.26, 0.4, 0.36, '#46371f');
      pack.position.set(-0.34 * s, 1.34 * s, 0);
      const ammo = torus(0.16, 0.04, '#caa24a');
      ammo.position.set(0.1 * s, 1.18 * s, 0);
      ammo.rotation.x = 0.6;
      add(brim, dome, goggles, beard, pack, ammo);
      break;
    }
    case 'lich': {
      // Ethreain: bare skull, glowing eye sockets, jagged ice crown, ragged blue cape, ice shoulders.
      const skull = sphere(0.24, '#e8e8d8');
      skull.position.set(0.16 * s, 1.86 * s, 0);
      const jaw = box(0.16, 0.16, 0.2, '#dcdcc8');
      jaw.position.set(0.18 * s, 1.62 * s, 0);
      const crown = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const spike = cone(0.05, 0.36 + (i % 2) * 0.16, '#cdeeff', 0x176084);
        spike.position.set(0.04 * s, (2.06 + (i % 2) * 0.05) * s, (i - 2) * 0.11 * s);
        crown.add(spike);
      }
      const shL = mesh(new THREE.ConeGeometry(0.16 * s, 0.4 * s, 6), lam('#bfeaff', 0x12516e));
      shL.position.set(0, 1.56 * s, 0.5 * s);
      const shR = shL.clone();
      shR.position.z = -0.5 * s;
      const cape = box(0.05, 1.18, 0.66, '#28406e');
      cape.position.set(-0.34 * s, 1.04 * s, 0);
      add(skull, jaw, crown, shL, shR, cape, ...eyes(0.36, 1.9, 0.08, 0.04, '#8fe6ff'));
      break;
    }
    case 'luna': {
      // Moon rider: crescent helm, silver pauldrons, glowing eyes, short cloak.
      const crescent = torus(0.27, 0.04, '#dce8ff', 0x1a2a44, Math.PI * 1.25);
      crescent.rotation.z = Math.PI / 2;
      crescent.position.set(0.03 * s, 2.06 * s, 0);
      const padL = sphere(0.2, '#cfd8ee');
      padL.scale.set(1.2, 0.6, 1);
      padL.position.set(0, 1.52 * s, 0.5 * s);
      const padR = padL.clone();
      padR.position.z = -0.5 * s;
      const cloak = box(0.05, 0.78, 0.6, '#2f3f6e');
      cloak.position.set(-0.3 * s, 1.0 * s, 0);
      add(crescent, padL, padR, cloak, ...eyes(0.3, 1.86, 0.08, 0.04, '#bfd4ff'));
      break;
    }
    case 'sven': {
      // Rogue Knight: winged helm, slit visor glow, massive pauldrons, cape.
      const visor = box(0.1, 0.16, 0.34, '#d8dde8');
      visor.position.set(0.24 * s, 1.88 * s, 0);
      const slit = box(0.06, 0.04, 0.26, '#6fd0ff', 0x123a52);
      slit.position.set(0.31 * s, 1.9 * s, 0);
      const wingL = box(0.04, 0.22, 0.12, '#aeb6c4');
      wingL.position.set(0, 2.0 * s, 0.22 * s);
      wingL.rotation.x = -0.5;
      const wingR = wingL.clone();
      wingR.position.z = -0.22 * s;
      wingR.rotation.x = 0.5;
      const padL = sphere(0.26, '#b8c0cf');
      padL.scale.set(1.2, 0.8, 1.1);
      padL.position.set(0, 1.52 * s, 0.56 * s);
      const padR = padL.clone();
      padR.position.z = -0.56 * s;
      const cape = box(0.05, 1.0, 0.66, '#2a3a6e');
      cape.position.set(-0.32 * s, 1.0 * s, 0);
      add(visor, slit, wingL, wingR, padL, padR, cape);
      break;
    }
    case 'axe': {
      // Mogul Khan: red skin, black mohawk, braided beard, spiked pauldrons.
      const mohawk = box(0.09, 0.44, 0.13, '#1a1a1a');
      mohawk.position.set(0, 2.04 * s, 0);
      const beard = cone(0.19, 0.38, '#3a1410');
      beard.rotation.z = Math.PI;
      beard.position.set(0.14 * s, 1.54 * s, 0);
      const spikeL = cone(0.16, 0.4, '#7c2218');
      spikeL.position.set(0, 1.66 * s, 0.5 * s);
      spikeL.rotation.z = -0.3;
      const spikeR = spikeL.clone();
      spikeR.position.z = -0.5 * s;
      const plate = box(0.1, 0.5, 0.5, '#8c2a1e');
      plate.position.set(0.32 * s, 1.1 * s, 0);
      add(mohawk, beard, spikeL, spikeR, plate, ...eyes(0.26, 1.82, 0.09, 0.035, '#ffd27f'));
      break;
    }
    case 'legion-commander': {
      const crest = cone(0.12, 0.5, '#f0d48a');
      crest.rotation.z = -0.2;
      crest.position.set(0, 2.1 * s, 0);
      const plate = box(0.1, 0.55, 0.56, '#f0d48a');
      plate.position.set(0.31 * s, 1.15 * s, 0);
      const banner = box(0.05, 0.8, 0.42, '#c23b2a');
      banner.position.set(-0.42 * s, 1.38 * s, 0);
      const sash = box(0.07, 0.2, 0.62, '#f0d48a');
      sash.position.set(0.22 * s, 0.78 * s, 0);
      add(crest, plate, banner, sash);
      break;
    }
    case 'shadow-fiend': {
      const core = sphere(0.18, '#d84a32', 0x3a0505);
      core.position.set(0.34 * s, 1.18 * s, 0);
      const hornL = cone(0.08, 0.42, '#1a0a0a');
      hornL.position.set(0.02 * s, 2.0 * s, 0.2 * s);
      hornL.rotation.x = 0.45;
      const hornR = hornL.clone();
      hornR.position.z = -0.2 * s;
      hornR.rotation.x = -0.45;
      const wingL = box(0.05, 0.8, 0.32, '#111111');
      wingL.position.set(-0.42 * s, 1.28 * s, 0.42 * s);
      wingL.rotation.z = 0.35;
      const wingR = wingL.clone();
      wingR.position.z = -0.42 * s;
      wingR.rotation.z = 0.35;
      add(core, hornL, hornR, wingL, wingR, ...eyes(0.3, 1.82, 0.09, 0.04, '#ff563d'));
      break;
    }
    case 'lion': {
      const horn = cone(0.09, 0.48, '#ffca66');
      horn.position.set(0.05 * s, 2.08 * s, 0);
      horn.rotation.z = -0.35;
      const collar = torus(0.3, 0.045, '#ffca66');
      collar.position.set(0.03 * s, 1.64 * s, 0);
      collar.rotation.x = Math.PI / 2;
      const claw = sphere(0.2, '#7d2cb8', 0x1c0824);
      claw.scale.set(1.05, 1.35, 0.9);
      claw.position.set(0.06 * s, 1.05 * s, 0.62 * s);
      const rune = sphere(0.12, '#c882ff', 0x25043c);
      rune.position.set(0.36 * s, 1.22 * s, 0);
      add(horn, collar, claw, rune, ...eyes(0.3, 1.84, 0.08, 0.035, '#ffd27f'));
      break;
    }
    case 'doom': {
      const hornL = cone(0.11, 0.58, '#201010');
      hornL.position.set(0.04 * s, 2.08 * s, 0.22 * s);
      hornL.rotation.x = 0.55;
      const hornR = hornL.clone();
      hornR.position.z = -0.22 * s;
      hornR.rotation.x = -0.55;
      const chest = sphere(0.18, '#ff9a3a', 0x4a1604);
      chest.position.set(0.36 * s, 1.2 * s, 0);
      const wingL = box(0.06, 0.95, 0.36, '#201010');
      wingL.position.set(-0.46 * s, 1.34 * s, 0.5 * s);
      wingL.rotation.z = 0.42;
      const wingR = wingL.clone();
      wingR.position.z = -0.5 * s;
      const flame = cone(0.12, 0.46, '#ff7a3d', 0x451004);
      flame.position.set(0.46 * s, 1.78 * s, 0);
      add(hornL, hornR, chest, wingL, wingR, flame);
      break;
    }
    case 'wraith-king': {
      const skull = sphere(0.24, '#d8ffd8', 0x0c2e16);
      skull.position.set(0.15 * s, 1.86 * s, 0);
      const crown = cyl(0.2, 0.26, 0.18, '#d8ffd8', 0x0c2e16);
      crown.position.set(0.04 * s, 2.1 * s, 0);
      const core = sphere(0.14, '#41d878', 0x0c3a18);
      core.position.set(0.36 * s, 1.18 * s, 0);
      const cape = box(0.05, 1.1, 0.7, '#143821');
      cape.position.set(-0.34 * s, 1.02 * s, 0);
      add(skull, crown, core, cape, ...eyes(0.34, 1.9, 0.08, 0.04, '#7aff9a'));
      break;
    }
    case 'invoker': {
      const collar = box(0.08, 0.62, 0.82, '#f8d36a');
      collar.position.set(-0.22 * s, 1.42 * s, 0);
      const cape = box(0.05, 1.12, 0.78, '#7a3cff');
      cape.position.set(-0.38 * s, 1.02 * s, 0);
      const orbs = [
        ['#a8e8ff', 0.48, 1.55, 0.34],
        ['#7a3cff', 0.48, 1.32, 0],
        ['#f8d36a', 0.48, 1.55, -0.34]
      ] as const;
      add(collar, cape, ...orbs.map(([col, x, y, z]) => {
        const o = sphere(0.1, col, 0x111111);
        o.position.set(x * s, y * s, z * s);
        return o;
      }));
      break;
    }
    case 'medusa': {
      const snakes = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const snake = cone(0.045, 0.42, i % 2 ? '#2aa86b' : '#d8f5a2');
        snake.position.set(0.02 * s, (2.0 + (i % 2) * 0.06) * s, (i - 2) * 0.1 * s);
        snake.rotation.z = -0.5;
        snakes.add(snake);
      }
      const scaledTail = cyl(0.16, 0.28, 0.75, '#2aa86b');
      scaledTail.position.set(0.0, 0.48 * s, 0);
      scaledTail.rotation.z = Math.PI / 2;
      const bow = torus(0.28, 0.035, '#d8f5a2', 0, Math.PI * 1.6);
      bow.position.set(0.52 * s, 1.2 * s, 0.44 * s);
      bow.rotation.y = Math.PI / 2;
      add(snakes, scaledTail, bow, ...eyes(0.3, 1.84, 0.08, 0.04, '#f0ffa8'));
      break;
    }
    case 'tidehunter': {
      const jaw = sphere(0.32, '#b4f0dd');
      jaw.scale.set(1.2, 0.62, 1);
      jaw.position.set(0.26 * s, 1.62 * s, 0);
      const shellL = sphere(0.24, '#13453e');
      shellL.scale.set(1.25, 0.65, 1);
      shellL.position.set(0.0, 1.48 * s, 0.62 * s);
      const shellR = shellL.clone();
      shellR.position.z = -0.62 * s;
      const anchor = torus(0.2, 0.045, '#b4f0dd', 0, Math.PI * 1.35);
      anchor.position.set(-0.46 * s, 1.15 * s, 0);
      add(jaw, shellL, shellR, anchor);
      break;
    }
    case 'tiny': {
      const crown = mesh(new THREE.DodecahedronGeometry(0.23 * s, 0), lam('#e0e0d0'));
      crown.position.set(0.02 * s, 2.1 * s, 0);
      const shL = mesh(new THREE.DodecahedronGeometry(0.34 * s, 0), lam('#9a9a8a'));
      shL.position.set(0, 1.5 * s, 0.6 * s);
      const shR = shL.clone();
      shR.position.z = -0.6 * s;
      const crack = box(0.05, 0.62, 0.04, '#e0e0d0', 0x202010);
      crack.position.set(0.48 * s, 1.12 * s, 0);
      crack.rotation.z = -0.18;
      add(crown, shL, shR, crack);
      break;
    }
    case 'storm-spirit': {
      const hat = cyl(0.34, 0.34, 0.06, '#ffffff');
      hat.position.set(0, 1.98 * s, 0);
      const moustache = torus(0.18, 0.035, '#ffffff', 0, Math.PI);
      moustache.position.set(0.23 * s, 1.72 * s, 0);
      moustache.rotation.z = Math.PI / 2;
      const belt = torus(0.34, 0.035, '#58a8ff', 0x0b2450);
      belt.position.set(0.02 * s, 1.0 * s, 0);
      belt.rotation.x = Math.PI / 2;
      const orbL = sphere(0.1, '#7ddcff', 0x11385a);
      orbL.position.set(0.18 * s, 1.42 * s, 0.42 * s);
      const orbR = orbL.clone();
      orbR.position.z = -0.42 * s;
      add(hat, moustache, belt, orbL, orbR);
      break;
    }
    case 'kunkka': {
      const hat = cyl(0.28, 0.32, 0.12, '#112940');
      hat.position.set(0, 1.98 * s, 0);
      const coat = box(0.06, 1.02, 0.68, '#2a6d9a');
      coat.position.set(-0.28 * s, 1.0 * s, 0);
      const medal = sphere(0.08, '#e8d8a0', 0x202010);
      medal.position.set(0.34 * s, 1.38 * s, 0);
      const wheel = torus(0.2, 0.025, '#e8d8a0');
      wheel.position.set(-0.42 * s, 1.45 * s, 0);
      add(hat, coat, medal, wheel);
      break;
    }
    case 'natures-prophet': {
      const antlerL = cone(0.05, 0.48, '#8b5a2b');
      antlerL.position.set(0, 2.1 * s, 0.18 * s);
      antlerL.rotation.x = 0.52;
      const antlerR = antlerL.clone();
      antlerR.position.z = -0.18 * s;
      antlerR.rotation.x = -0.52;
      const leafCape = box(0.05, 1.0, 0.68, '#4dbd62');
      leafCape.position.set(-0.36 * s, 1.0 * s, 0);
      const seedL = sphere(0.09, '#d8ffd8', 0x103a16);
      seedL.position.set(0.42 * s, 1.4 * s, 0.34 * s);
      const seedR = seedL.clone();
      seedR.position.z = -0.34 * s;
      add(antlerL, antlerR, leafCape, seedL, seedR);
      break;
    }

    // ---------- Phase 2 cohort ----------
    case 'mirana': {
      crownSpikes(3, '#f3f7ff', 0x2a3a66, 2.04);
      cape('#4a5c94', 0.7);
      bowCrest('#cfe0ff');
      const star = octa(0.1, '#e9f3ff', 0x3a4c84);
      star.position.set(0.32 * s, 1.26 * s, 0);
      add(star, ...eyes(0.32, 1.86, 0.08, 0.04, '#dceaff'));
      break;
    }
    case 'lina': {
      const ponytail = cone(0.12, 0.7, '#ff6b30', 0x5a1404);
      ponytail.rotation.z = 0.5;
      ponytail.position.set(-0.22 * s, 1.96 * s, 0);
      const emberL = sphere(0.1, '#ffd36b', 0x6a2a04);
      emberL.position.set(0.42 * s, 1.18 * s, 0.28 * s);
      const emberR = emberL.clone();
      emberR.position.z = -0.28 * s;
      cape('#7a1f12', 0.6);
      add(ponytail, emberL, emberR, ...eyes(0.32, 1.86, 0.08, 0.04, '#ffd36b'));
      break;
    }
    case 'zeus': {
      beard('#eef2ff', 1.56);
      crownSpikes(5, '#f5e76b', 0x4a4410, 2.04);
      const boltL = box(0.04, 0.4, 0.04, '#fff28a', 0x6a6010);
      boltL.rotation.z = 0.4;
      boltL.position.set(0.04 * s, 1.6 * s, 0.46 * s);
      const boltR = boltL.clone();
      boltR.position.z = -0.46 * s;
      add(boltL, boltR, ...eyes(0.3, 1.86, 0.08, 0.04, '#fff6c0'));
      break;
    }
    case 'drow-ranger': {
      hoodCowl('#1e406b');
      bowCrest('#d8f0ff');
      const quiver = cyl(0.07, 0.07, 0.5, '#16304f');
      quiver.position.set(-0.34 * s, 1.4 * s, -0.12 * s);
      quiver.rotation.z = 0.3;
      add(quiver, ...eyes(0.3, 1.84, 0.08, 0.04, '#bfe6ff'));
      break;
    }
    case 'jakiro': {
      const headFire = sphere(0.2, '#ff7a3c', 0x5a1a04);
      headFire.position.set(0.2 * s, 1.86 * s, 0.18 * s);
      const headIce = sphere(0.2, '#9fd8ff', 0x163a52);
      headIce.position.set(0.2 * s, 1.86 * s, -0.18 * s);
      horns('#ffb16b', 0.28, 1.98, 0.32, 0.5, 0.4);
      wings('#2f3f6b', 0.8, 1.3);
      add(headFire, headIce);
      break;
    }
    case 'witch-doctor': {
      const mask = box(0.1, 0.34, 0.28, '#f4e37a');
      mask.position.set(0.26 * s, 1.84 * s, 0);
      const charm1 = sphere(0.06, '#39c46a', 0x0c3a18);
      charm1.position.set(0.3 * s, 1.5 * s, 0.18 * s);
      const charm2 = charm1.clone();
      charm2.position.z = -0.18 * s;
      const charm3 = charm1.clone();
      charm3.position.set(0.34 * s, 1.34 * s, 0);
      cape('#7c4bd8', 0.56);
      add(mask, charm1, charm2, charm3, ...eyes(0.34, 1.88, 0.07, 0.035, '#7dff9a'));
      break;
    }
    case 'omniknight': {
      wings('#ffffff', 0.3, 2.0);
      const halo = torus(0.2, 0.03, '#fff4b0', 0x6a6020);
      halo.position.set(0, 2.16 * s, 0);
      halo.rotation.x = Math.PI / 2;
      shoulderSlabs('#f8e59a', 0.24);
      cape('#5a7cc8', 0.62);
      add(halo);
      break;
    }
    case 'windranger': {
      hoodCowl('#6fd46f');
      const scarf = torus(0.24, 0.06, '#b84028', 0, Math.PI * 1.4);
      scarf.position.set(0.06 * s, 1.62 * s, 0);
      scarf.rotation.x = Math.PI / 2;
      const quiver = cyl(0.07, 0.07, 0.5, '#5a3a18');
      quiver.position.set(-0.32 * s, 1.4 * s, -0.14 * s);
      quiver.rotation.z = 0.3;
      add(scarf, quiver, ...eyes(0.3, 1.84, 0.08, 0.04, '#d8ffb0'));
      break;
    }
    case 'phantom-assassin': {
      hoodCowl('#1c2038');
      const veil = box(0.08, 0.24, 0.26, '#cfd6ff', 0x1a2038);
      veil.position.set(0.28 * s, 1.82 * s, 0);
      cape('#1c2038', 0.6);
      add(veil, ...eyes(0.32, 1.84, 0.08, 0.038, '#ff5a5a'));
      break;
    }
    case 'tusk': {
      tusksPair('#eef8ff');
      const coat = box(0.08, 0.7, 0.7, '#6c8ca8');
      coat.position.set(-0.2 * s, 1.0 * s, 0);
      shoulderSlabs('#d8f4ff', 0.24);
      const gauntL = sphere(0.16, '#bfe6ff', 0x163a52);
      gauntL.position.set(0.34 * s, 1.0 * s, 0.4 * s);
      const gauntR = gauntL.clone();
      gauntR.position.z = -0.4 * s;
      add(coat, gauntL, gauntR, ...eyes(0.26, 1.8, 0.09, 0.035, '#bfe6ff'));
      break;
    }
    case 'ancient-apparition': {
      crownSpikes(5, '#e4fbff', 0x2a5c7e, 2.0);
      const wisp = cone(0.3, 0.95, '#9fe8ff', 0x244a6a);
      wisp.rotation.z = Math.PI;
      wisp.position.set(0, 0.78 * s, 0);
      const trailL = cone(0.08, 0.5, '#e4fbff', 0x244a6a);
      trailL.rotation.z = Math.PI;
      trailL.position.set(-0.12 * s, 0.4 * s, 0.16 * s);
      const trailR = trailL.clone();
      trailR.position.z = -0.16 * s;
      add(wisp, trailL, trailR, ...eyes(0.3, 1.86, 0.08, 0.045, '#e4fbff'));
      break;
    }

    // ---------- Phase 3 cohort ----------
    case 'vengeful-spirit': {
      wings('#252a72', 0.78, 1.32);
      horns('#c7d4ff', 0.3, 2.0, 0.16, 0.3, 0.6);
      cape('#252a72', 0.58);
      add(...eyes(0.3, 1.86, 0.08, 0.04, '#c7d4ff'));
      break;
    }
    case 'riki': {
      hoodCowl('#1c1436');
      const smokeL = sphere(0.16, '#6a4cff', 0x1c1436);
      smokeL.position.set(-0.2 * s, 0.7 * s, 0.24 * s);
      const smokeR = smokeL.clone();
      smokeR.position.set(-0.24 * s, 0.6 * s, -0.2 * s);
      add(smokeL, smokeR, ...eyes(0.3, 1.84, 0.08, 0.038, '#c8b8ff'));
      break;
    }
    case 'bounty-hunter': {
      const mask = box(0.08, 0.28, 0.3, '#f2df7a');
      mask.position.set(0.26 * s, 1.84 * s, 0);
      const scarf = torus(0.22, 0.06, '#d99a28', 0, Math.PI * 1.4);
      scarf.position.set(0.04 * s, 1.6 * s, 0);
      scarf.rotation.x = Math.PI / 2;
      const shuriken = torus(0.12, 0.03, '#f2df7a');
      shuriken.position.set(-0.34 * s, 1.4 * s, 0);
      add(mask, scarf, shuriken, ...eyes(0.3, 1.86, 0.08, 0.035, '#fff0a0'));
      break;
    }
    case 'winter-wyvern': {
      wings('#3d75b8', 0.9, 1.36);
      crownSpikes(3, '#e4fbff', 0x2a5c7e, 2.0);
      fangedMaw('#9fe8ff');
      add(...eyes(0.3, 1.84, 0.08, 0.04, '#e4fbff'));
      break;
    }
    case 'sand-king': {
      const carapace = sphere(0.34, '#7a4b1c');
      carapace.scale.set(1.2, 0.7, 1.1);
      carapace.position.set(-0.14 * s, 1.28 * s, 0);
      tailSerpent('#d9a441', '#fff0a8');
      const mandL = cone(0.04, 0.18, '#fff0a8');
      mandL.rotation.z = 2.4;
      mandL.position.set(0.32 * s, 1.6 * s, 0.1 * s);
      const mandR = mandL.clone();
      mandR.position.z = -0.1 * s;
      add(carapace, mandL, mandR, ...eyes(0.3, 1.82, 0.08, 0.035, '#fff0a8'));
      break;
    }
    case 'nyx-assassin': {
      const shell = sphere(0.34, '#5d3b9a');
      shell.scale.set(1.15, 0.75, 1.15);
      shell.position.set(-0.12 * s, 1.34 * s, 0);
      const spikeG = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const sp = cone(0.05, 0.2, '#c4a3ff');
        sp.position.set((-0.3 + i * 0.12) * s, 1.62 * s, 0);
        spikeG.add(sp);
      }
      const mandL = cone(0.04, 0.16, '#c4a3ff');
      mandL.rotation.z = 2.4;
      mandL.position.set(0.3 * s, 1.6 * s, 0.1 * s);
      const mandR = mandL.clone();
      mandR.position.z = -0.1 * s;
      add(shell, spikeG, mandL, mandR, ...eyes(0.3, 1.8, 0.08, 0.038, '#d8c4ff'));
      break;
    }
    case 'viper': {
      wings('#273a18', 0.78, 1.32);
      fangedMaw('#6fc247');
      const scaleL = box(0.06, 0.4, 0.18, '#4a8a2a');
      scaleL.position.set(0.28 * s, 1.1 * s, 0.18 * s);
      const scaleR = scaleL.clone();
      scaleR.position.z = -0.18 * s;
      add(scaleL, scaleR, ...eyes(0.3, 1.82, 0.08, 0.04, '#c8ff7a'));
      break;
    }
    case 'slardar': {
      const fin = cone(0.06, 0.5, '#cbb8ff', 0x2a1a4a);
      fin.position.set(-0.04 * s, 2.12 * s, 0);
      fin.rotation.z = -0.2;
      shoulderSlabs('#2a1a4a', 0.24);
      const plate = box(0.1, 0.5, 0.5, '#8050d8');
      plate.position.set(0.32 * s, 1.1 * s, 0);
      add(fin, plate, ...eyes(0.28, 1.82, 0.09, 0.04, '#cbb8ff'));
      break;
    }
    case 'naga-siren': {
      tailSerpent('#4bb8d8', '#f0d08a');
      const finL = cone(0.04, 0.34, '#f0d08a');
      finL.rotation.z = 0.6;
      finL.position.set(0.02 * s, 1.96 * s, 0.16 * s);
      const finR = finL.clone();
      finR.position.z = -0.16 * s;
      finR.rotation.z = 0.6;
      add(finL, finR, ...eyes(0.3, 1.84, 0.08, 0.04, '#d8f6ff'));
      break;
    }
    case 'slark': {
      const fin = cone(0.07, 0.42, '#9bdcff', 0x16344a);
      fin.position.set(-0.06 * s, 2.04 * s, 0);
      fin.rotation.z = -0.5;
      hoodCowl('#1b2730');
      add(fin, ...eyes(0.3, 1.84, 0.08, 0.04, '#9bdcff'));
      break;
    }
    case 'lifestealer': {
      const clawL = cone(0.05, 0.28, '#e8b082');
      clawL.rotation.z = -1.0;
      clawL.position.set(0.4 * s, 0.95 * s, 0.3 * s);
      const clawR = clawL.clone();
      clawR.position.z = -0.3 * s;
      const ribs = box(0.1, 0.42, 0.4, '#34120d');
      ribs.position.set(0.3 * s, 1.16 * s, 0);
      add(clawL, clawR, ribs, ...eyes(0.28, 1.82, 0.09, 0.04, '#ff5a3a'));
      break;
    }
    case 'undying': {
      const tomb = box(0.26, 0.5, 0.18, '#d8e8aa', 0x1c2814);
      tomb.position.set(0.36 * s, 1.1 * s, 0.36 * s);
      cape('#233323', 0.66);
      const jaw = sphere(0.18, '#5aa36a');
      jaw.scale.set(0.9, 0.6, 1);
      jaw.position.set(0.24 * s, 1.6 * s, 0);
      add(tomb, jaw, ...eyes(0.28, 1.82, 0.09, 0.04, '#d8e8aa'));
      break;
    }
    case 'night-stalker': {
      wings('#050814', 0.9, 1.34);
      fangedMaw('#1b2a58');
      horns('#7a8cff', 0.26, 2.0, 0.18, 0.4, 0.6);
      add(...eyes(0.3, 1.82, 0.09, 0.045, '#7a8cff'));
      break;
    }
    case 'silencer': {
      hoodCowl('#332255');
      const glaive = box(0.5, 0.1, 0.03, '#b78cff', 0x332255);
      glaive.rotation.z = 0.5;
      glaive.position.set(0.5 * s, 1.3 * s, 0.18 * s);
      const sigil = octa(0.09, '#e8e8ff', 0x332255);
      sigil.position.set(0.34 * s, 1.26 * s, 0);
      add(glaive, sigil, ...eyes(0.3, 1.84, 0.08, 0.038, '#e8e8ff'));
      break;
    }
    case 'outworld-destroyer': {
      const orbHead = sphere(0.26, '#64d8ff', 0x163a52);
      orbHead.position.set(0.12 * s, 1.92 * s, 0);
      cape('#222244', 0.62);
      orbitOrbs(3, '#d8f7ff', 0.07, 0.4, 1.5);
      add(orbHead, ...eyes(0.3, 1.92, 0.06, 0.03, '#ffffff'));
      break;
    }
    case 'skywrath-mage': {
      wings('#244d86', 0.8, 1.34);
      const beak = cone(0.1, 0.3, '#f7e39a');
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.34 * s, 1.84 * s, 0);
      crownSpikes(3, '#f7e39a', 0x4a4014, 2.02);
      add(beak, ...eyes(0.3, 1.88, 0.08, 0.035, '#f7e39a'));
      break;
    }
    case 'tinker': {
      const goggles = box(0.08, 0.12, 0.32, '#f8e07a', 0x4a3208);
      goggles.position.set(0.26 * s, 1.86 * s, 0);
      const pack = box(0.26, 0.4, 0.34, '#30405a');
      pack.position.set(-0.32 * s, 1.34 * s, 0);
      const laser = cyl(0.05, 0.05, 0.42, '#606878');
      laser.position.set(0.46 * s, 1.2 * s, 0.2 * s);
      laser.rotation.z = Math.PI / 2;
      const tip = sphere(0.06, '#e05040', 0x5a1408);
      tip.position.set(0.7 * s, 1.2 * s, 0.2 * s);
      add(goggles, pack, laser, tip);
      break;
    }
    case 'enchantress': {
      antlers('#fff2a6');
      const dress = cone(0.34, 0.8, '#345d2f');
      dress.rotation.z = Math.PI;
      dress.position.set(0, 0.78 * s, 0);
      add(dress, ...eyes(0.3, 1.86, 0.08, 0.04, '#d8ffb0'));
      break;
    }
    case 'chen': {
      wings('#ffffff', 0.3, 2.0);
      const halo = torus(0.2, 0.03, '#fff4b0', 0x6a6020);
      halo.position.set(0, 2.16 * s, 0);
      halo.rotation.x = Math.PI / 2;
      shoulderSlabs('#f4e4a0', 0.24);
      cape('#67513a', 0.62);
      add(halo);
      break;
    }
    case 'beastmaster': {
      tusksPair('#f0c080');
      const boarHelm = sphere(0.26, '#3d2716');
      boarHelm.scale.set(1, 0.9, 1.15);
      boarHelm.position.set(0.04 * s, 1.88 * s, 0);
      shoulderSlabs('#b8723a', 0.24);
      add(boarHelm, ...eyes(0.28, 1.84, 0.09, 0.04, '#f0c080'));
      break;
    }
    case 'broodmother': {
      const legs = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const sideZ = i < 2 ? 1 : -1;
        const lg = box(0.04, 0.06, 0.6, '#111111');
        lg.position.set((-0.1 + (i % 2) * 0.24) * s, 1.3 * s, sideZ * 0.5 * s);
        lg.rotation.x = sideZ * 0.7;
        legs.add(lg);
      }
      const abdomen = sphere(0.32, '#5b2b72');
      abdomen.scale.set(1.1, 0.9, 1);
      abdomen.position.set(-0.42 * s, 1.0 * s, 0);
      add(legs, abdomen, ...eyes(0.3, 1.82, 0.1, 0.03, '#d38cff'));
      break;
    }
    case 'warlock': {
      hoodCowl('#3a1010');
      horns('#f2c06b', 0.3, 2.0, 0.2, 0.4, 0.5);
      const tome = box(0.14, 0.22, 0.3, '#9b2d2d', 0x2a0606);
      tome.position.set(0.3 * s, 1.1 * s, 0.24 * s);
      add(tome, ...eyes(0.3, 1.84, 0.08, 0.04, '#f2c06b'));
      break;
    }
    case 'visage': {
      wings('#22222f', 0.82, 1.34);
      crownSpikes(3, '#c8c8e8', 0x22222f, 2.02);
      const clawL = cone(0.05, 0.24, '#c8c8e8');
      clawL.rotation.z = -1.0;
      clawL.position.set(0.38 * s, 0.95 * s, 0.28 * s);
      const clawR = clawL.clone();
      clawR.position.z = -0.28 * s;
      add(clawL, clawR, ...eyes(0.3, 1.84, 0.08, 0.04, '#c8c8e8'));
      break;
    }
    case 'magnus': {
      tusksPair('#d8b080');
      mountQuad('#7a4a32');
      horns('#d8b080', 0.34, 1.98, 0.22, 0.4, 0.7);
      add(...eyes(0.3, 1.84, 0.09, 0.04, '#f0d8b0'));
      break;
    }
    case 'elder-titan': {
      shoulderSlabs('#8a6a4a', 0.3);
      const core = sphere(0.16, '#e0d0b0', 0x4a4030);
      core.position.set(0.34 * s, 1.22 * s, 0);
      const crown = dodeca(0.24, '#e0d0b0');
      crown.position.set(0.02 * s, 2.1 * s, 0);
      add(core, crown, ...eyes(0.28, 1.84, 0.09, 0.04, '#fff0c0'));
      break;
    }
    case 'treant-protector': {
      const branchL = cone(0.04, 0.4, '#6b4f2a');
      branchL.position.set(0, 2.1 * s, 0.18 * s);
      branchL.rotation.x = 0.6;
      const branchR = branchL.clone();
      branchR.position.z = -0.18 * s;
      branchR.rotation.x = -0.6;
      const leaves = sphere(0.3, '#3f7a3a');
      leaves.scale.set(1.1, 0.7, 1.1);
      leaves.position.set(0, 2.32 * s, 0);
      const bark = box(0.12, 0.7, 0.5, '#6b4f2a');
      bark.position.set(0.16 * s, 1.1 * s, 0);
      add(branchL, branchR, leaves, bark, ...eyes(0.3, 1.82, 0.09, 0.04, '#d8f0a8'));
      break;
    }
    case 'centaur-warrunner': {
      mountQuad('#9a5a32');
      shoulderSlabs('#4a2712', 0.26);
      const beardC = cone(0.16, 0.36, '#4a2712');
      beardC.rotation.z = Math.PI;
      beardC.position.set(0.14 * s, 1.56 * s, 0);
      add(beardC, ...eyes(0.28, 1.84, 0.09, 0.04, '#f0c090'));
      break;
    }
    case 'ember-spirit': {
      const topknot = cone(0.09, 0.34, '#ff6b2a', 0x5a1404);
      topknot.position.set(-0.04 * s, 2.06 * s, 0);
      const emberL = sphere(0.07, '#ffd27a', 0x6a3008);
      emberL.position.set(-0.2 * s, 1.2 * s, 0.2 * s);
      const emberR = emberL.clone();
      emberR.position.set(-0.26 * s, 1.0 * s, -0.16 * s);
      add(topknot, emberL, emberR, ...eyes(0.3, 1.86, 0.08, 0.04, '#ffd27a'));
      break;
    }
    case 'spectre': {
      const smoke = cone(0.3, 0.95, '#7a67ff', 0x1d1838);
      smoke.rotation.z = Math.PI;
      smoke.position.set(0, 0.78 * s, 0);
      const bladeL = box(0.4, 0.06, 0.03, '#d8d0ff', 0x1d1838);
      bladeL.rotation.z = -0.4;
      bladeL.position.set(0.32 * s, 1.0 * s, 0.34 * s);
      const bladeR = bladeL.clone();
      bladeR.position.z = -0.34 * s;
      add(smoke, bladeL, bladeR, ...eyes(0.3, 1.86, 0.08, 0.045, '#d8d0ff'));
      break;
    }
    case 'faceless-void': {
      const facePlate = box(0.1, 0.34, 0.3, '#1c163a');
      facePlate.position.set(0.27 * s, 1.84 * s, 0);
      const shell = sphere(0.3, '#5a46c8');
      shell.scale.set(1, 1.1, 1.1);
      shell.position.set(-0.08 * s, 1.5 * s, 0);
      const gaunt = sphere(0.18, '#c2b8ff', 0x1c163a);
      gaunt.position.set(0.36 * s, 1.0 * s, 0.4 * s);
      add(facePlate, shell, gaunt);
      break;
    }
    case 'terrorblade': {
      wings('#101426', 0.86, 1.34);
      horns('#d8f5ff', 0.34, 2.0, 0.2, 0.4, 0.6);
      const bladeL = box(0.5, 0.08, 0.03, '#4bb8ff', 0x101426);
      bladeL.rotation.z = -0.4;
      bladeL.position.set(0.4 * s, 1.1 * s, 0.3 * s);
      const bladeR = bladeL.clone();
      bladeR.position.z = -0.3 * s;
      add(bladeL, bladeR, ...eyes(0.3, 1.84, 0.08, 0.045, '#d8f5ff'));
      break;
    }
    case 'phoenix': {
      wings('#ff7a30', 0.95, 1.36, 0x5a1e04);
      const beak = cone(0.1, 0.3, '#ffe07a');
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.34 * s, 1.84 * s, 0);
      const ember = sphere(0.18, '#ffe07a', 0x6a3008);
      ember.position.set(0.32 * s, 1.2 * s, 0);
      add(beak, ember, ...eyes(0.3, 1.88, 0.08, 0.04, '#ffe07a'));
      break;
    }
    case 'io': {
      const orb = sphere(0.34, '#c8f6ff', 0x4a7cae);
      orb.position.set(0, 1.3 * s, 0);
      const tendrilL = cyl(0.02, 0.04, 0.6, '#7aa8ff', 0x2a3c6a);
      tendrilL.position.set(-0.1 * s, 0.6 * s, 0.2 * s);
      tendrilL.rotation.z = 0.4;
      const tendrilR = tendrilL.clone();
      tendrilR.position.z = -0.2 * s;
      add(orb, tendrilL, tendrilR, ...eyes(0.22, 1.36, 0.1, 0.05, '#ffffff'));
      break;
    }

    // ---------- Standard: Strength ----------
    case 'abaddon': {
      horns('#d8fff8', 0.3, 2.0, 0.2, 0.4, 0.6);
      cape('#1d3340', 0.66);
      const shield = cyl(0.26, 0.26, 0.06, '#58d8c8', 0x163a36);
      shield.position.set(0.34 * s, 1.1 * s, 0.4 * s);
      shield.rotation.z = Math.PI / 2;
      add(shield, ...eyes(0.28, 1.84, 0.09, 0.04, '#d8fff8'));
      break;
    }
    case 'alchemist': {
      const barrel = cyl(0.24, 0.24, 0.5, '#5b3318');
      barrel.position.set(-0.3 * s, 1.2 * s, 0);
      const vialL = cyl(0.05, 0.05, 0.18, '#b8d84a', 0x3a4a14);
      vialL.position.set(0.3 * s, 1.4 * s, 0.24 * s);
      const vialR = vialL.clone();
      vialR.position.z = -0.24 * s;
      add(barrel, vialL, vialR, ...eyes(0.3, 1.84, 0.09, 0.04, '#f0d46a'));
      break;
    }
    case 'bristleback': {
      const quills = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const q = cone(0.05, 0.3 + (i % 2) * 0.12, '#6a3520');
        q.position.set((-0.36 + (i % 3) * 0.16) * s, 1.5 * s, (i < 3 ? 0.4 : -0.4) * s);
        q.rotation.z = 0.6;
        quills.add(q);
      }
      const snout = cone(0.12, 0.26, '#d8a04a');
      snout.rotation.z = -Math.PI / 2;
      snout.position.set(0.32 * s, 1.78 * s, 0);
      add(quills, snout, ...eyes(0.3, 1.86, 0.08, 0.035, '#f7e0a0'));
      break;
    }
    case 'dawnbreaker': {
      const halo = torus(0.22, 0.035, '#fff3c0', 0x6a5020);
      halo.position.set(0, 2.18 * s, 0);
      halo.rotation.x = Math.PI / 2;
      shoulderSlabs('#ffd36a', 0.26);
      add(halo, ...eyes(0.28, 1.84, 0.09, 0.04, '#fff3c0'));
      break;
    }
    case 'dragon-knight': {
      crownSpikes(3, '#f0b05a', 0x4a3014, 2.02);
      cape('#314a38', 0.66);
      const scaleL = box(0.06, 0.42, 0.18, '#314a38');
      scaleL.position.set(0.28 * s, 1.1 * s, 0.2 * s);
      const scaleR = scaleL.clone();
      scaleR.position.z = -0.2 * s;
      add(scaleL, scaleR, ...eyes(0.28, 1.84, 0.09, 0.04, '#ff9a5a'));
      break;
    }
    case 'huskar': {
      const topknot = cone(0.08, 0.32, '#401510');
      topknot.position.set(-0.04 * s, 2.04 * s, 0);
      const spearOnBack = cyl(0.03, 0.03, 0.7, '#ffd06a');
      spearOnBack.position.set(-0.3 * s, 1.4 * s, -0.12 * s);
      spearOnBack.rotation.z = 0.3;
      chestCore('#ff5a2a', 0x5a1404);
      add(topknot, spearOnBack, ...eyes(0.3, 1.84, 0.08, 0.04, '#ffd06a'));
      break;
    }
    case 'mars': {
      const plume = cone(0.09, 0.46, '#d83a2e');
      plume.position.set(-0.04 * s, 2.22 * s, 0);
      plume.rotation.z = -0.18;
      const shield = cyl(0.32, 0.32, 0.07, '#d8b05a', 0x3a2408);
      shield.position.set(0.35 * s, 1.16 * s, 0.44 * s);
      shield.rotation.z = Math.PI / 2;
      const spear = cyl(0.035, 0.04, 1.1, '#d8b05a', 0x2a1a08);
      spear.position.set(0.48 * s, 1.28 * s, -0.34 * s);
      spear.rotation.z = Math.PI / 2;
      const spearTip = cone(0.08, 0.24, '#f1d38a', 0x2a1a08);
      spearTip.position.set(1.08 * s, 1.28 * s, -0.34 * s);
      spearTip.rotation.z = -Math.PI / 2;
      cape('#3a1010', 0.76);
      crownSpikes(3, '#d8b05a', 0x3a2408, 2.02);
      add(plume, shield, spear, spearTip, ...eyes(0.3, 1.86, 0.09, 0.04, '#ffd66b'));
      break;
    }
    case 'ogre-magi': {
      const head2 = sphere(0.22, '#3d8cff');
      head2.position.set(0.16 * s, 1.82 * s, 0.22 * s);
      const head1 = sphere(0.22, '#3d8cff');
      head1.position.set(0.16 * s, 1.82 * s, -0.22 * s);
      const club = cyl(0.12, 0.16, 0.5, '#4a2a12');
      club.position.set(0.5 * s, 1.3 * s, 0.2 * s);
      add(head2, head1, club);
      break;
    }
    case 'primal-beast': {
      tusksPair('#f0a05a');
      const mane = sphere(0.34, '#2b1a12');
      mane.scale.set(1.1, 1.1, 1.2);
      mane.position.set(0.02 * s, 1.7 * s, 0);
      const fistL = sphere(0.22, '#9a4a2f');
      fistL.position.set(0.4 * s, 0.9 * s, 0.42 * s);
      const fistR = fistL.clone();
      fistR.position.z = -0.42 * s;
      add(mane, fistL, fistR, ...eyes(0.3, 1.78, 0.09, 0.04, '#f0a05a'));
      break;
    }
    case 'spirit-breaker': {
      mountQuad('#1b2148');
      horns('#c8d8ff', 0.34, 1.98, 0.22, 0.4, 0.7);
      const star = octa(0.1, '#c8d8ff', 0x2a3a6a);
      star.position.set(0.34 * s, 1.2 * s, 0);
      add(star, ...eyes(0.3, 1.84, 0.09, 0.045, '#c8d8ff'));
      break;
    }
    case 'underlord': {
      tusksPair('#f0a05a');
      shoulderSlabs('#301830', 0.28);
      const maul = box(0.2, 0.3, 0.2, '#301830', 0x180c18);
      maul.position.set(0.52 * s, 1.4 * s, 0.2 * s);
      add(maul, ...eyes(0.3, 1.8, 0.09, 0.04, '#6fd84f'));
      break;
    }

    // ---------- Standard: Agility ----------
    case 'anti-mage': {
      const mark = box(0.02, 0.16, 0.16, '#d8c8ff', 0x3a2a5a);
      mark.position.set(0.3 * s, 1.92 * s, 0);
      const glaiveL = torus(0.16, 0.03, '#d8c8ff', 0x3a2a5a, Math.PI * 1.2);
      glaiveL.position.set(0.32 * s, 1.0 * s, 0.4 * s);
      const glaiveR = glaiveL.clone();
      glaiveR.position.z = -0.4 * s;
      const sash = box(0.06, 0.18, 0.5, '#7c4dff');
      sash.position.set(0.18 * s, 0.74 * s, 0);
      add(mark, glaiveL, glaiveR, sash, ...eyes(0.3, 1.86, 0.08, 0.038, '#d8c8ff'));
      break;
    }
    case 'bloodseeker': {
      const fin = cone(0.06, 0.46, '#ff9a5a', 0x5a1408);
      fin.position.set(-0.04 * s, 2.1 * s, 0);
      fin.rotation.z = -0.4;
      const clawL = cone(0.045, 0.24, '#ff9a5a');
      clawL.rotation.z = -1.0;
      clawL.position.set(0.4 * s, 0.95 * s, 0.3 * s);
      const clawR = clawL.clone();
      clawR.position.z = -0.3 * s;
      add(fin, clawL, clawR, ...eyes(0.3, 1.84, 0.08, 0.04, '#ff5a3a'));
      break;
    }
    case 'clinkz': {
      const ribs = box(0.1, 0.5, 0.42, '#1a1010');
      ribs.position.set(0.26 * s, 1.16 * s, 0);
      gunArm('#1a1010', '#ff6b2f');
      bowCrest('#ff6b2f');
      add(ribs, ...eyes(0.3, 1.86, 0.08, 0.045, '#ffd08a'));
      break;
    }
    case 'gyrocopter': {
      const rotor = box(0.9, 0.02, 0.06, '#606878');
      rotor.position.set(0, 2.2 * s, 0);
      const cockpit = sphere(0.24, '#606878', 0x202830);
      cockpit.position.set(0.1 * s, 1.4 * s, 0);
      gunArm('#606878', '#ffe0a0');
      add(rotor, cockpit, ...eyes(0.3, 1.5, 0.07, 0.03, '#ffe0a0'));
      break;
    }
    case 'hoodwink': {
      hoodCowl('#2e5a2e');
      const tail = cone(0.18, 0.8, '#d88a3a');
      tail.rotation.z = 0.8;
      tail.position.set(-0.36 * s, 1.0 * s, 0);
      gunArm('#5a3a18', '#ffe0a0');
      add(tail, ...eyes(0.3, 1.84, 0.08, 0.04, '#ffe0a0'));
      break;
    }
    case 'razor': {
      const smoke = cone(0.28, 0.9, '#1c2a5a', 0x162a5a);
      smoke.rotation.z = Math.PI;
      smoke.position.set(0, 0.8 * s, 0);
      const whip = cyl(0.025, 0.025, 0.8, '#72d8ff', 0x163a52);
      whip.position.set(0.42 * s, 1.1 * s, 0.2 * s);
      whip.rotation.z = 0.7;
      add(smoke, whip, ...eyes(0.3, 1.86, 0.08, 0.045, '#72d8ff'));
      break;
    }
    case 'templar-assassin': {
      crownSpikes(3, '#ffe8ff', 0x4a2a5a, 2.0);
      const shardG = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const sh = octa(0.08, '#d88cff', 0x3a1a5a);
        sh.position.set(-0.3 * s, (1.2 + i * 0.18) * s, ((i % 2) - 0.5) * 0.4 * s);
        shardG.add(sh);
      }
      add(shardG, ...eyes(0.3, 1.84, 0.08, 0.038, '#ffe8ff'));
      break;
    }
    case 'troll-warlord': {
      tusksPair('#f0e0a0');
      const axeL = box(0.18, 0.22, 0.03, '#d85a2a');
      axeL.position.set(0.46 * s, 1.2 * s, 0.34 * s);
      const axeR = axeL.clone();
      axeR.position.z = -0.34 * s;
      add(axeL, axeR, ...eyes(0.3, 1.84, 0.08, 0.04, '#f0e0a0'));
      break;
    }
    case 'ursa': {
      const bearHead = sphere(0.26, '#9a5a32');
      bearHead.scale.set(1, 0.95, 1.1);
      bearHead.position.set(0.06 * s, 1.86 * s, 0);
      const earL = sphere(0.08, '#9a5a32');
      earL.position.set(0.02 * s, 2.06 * s, 0.16 * s);
      const earR = earL.clone();
      earR.position.z = -0.16 * s;
      const clawL = cone(0.045, 0.22, '#f0c090');
      clawL.rotation.z = -1.0;
      clawL.position.set(0.4 * s, 0.95 * s, 0.32 * s);
      const clawR = clawL.clone();
      clawR.position.z = -0.32 * s;
      add(bearHead, earL, earR, clawL, clawR, ...eyes(0.28, 1.86, 0.09, 0.035, '#f0c090'));
      break;
    }
    case 'venomancer': {
      tailSerpent('#75d84a', '#d8ff7a');
      const spikes = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const sp = cone(0.04, 0.18, '#d8ff7a');
        sp.position.set((-0.3 + i * 0.14) * s, 1.5 * s, 0);
        spikes.add(sp);
      }
      add(spikes, ...eyes(0.3, 1.82, 0.08, 0.04, '#d8ff7a'));
      break;
    }
    case 'weaver': {
      wings('#2a1a58', 0.7, 1.3, 0x2a1a58);
      const shell = sphere(0.3, '#7ad8ff', 0x163a52);
      shell.scale.set(1.1, 0.8, 1.1);
      shell.position.set(-0.12 * s, 1.36 * s, 0);
      const mandL = cone(0.04, 0.16, '#ffd86a');
      mandL.rotation.z = 2.4;
      mandL.position.set(0.3 * s, 1.6 * s, 0.1 * s);
      const mandR = mandL.clone();
      mandR.position.z = -0.1 * s;
      add(shell, mandL, mandR, ...eyes(0.3, 1.8, 0.08, 0.04, '#ffd86a'));
      break;
    }

    // ---------- Standard: Intelligence ----------
    case 'death-prophet': {
      hoodCowl('#243830');
      cape('#243830', 0.66);
      const skull = sphere(0.1, '#d8fff0', 0x14281e);
      skull.position.set(0.5 * s, 1.5 * s, 0.18 * s);
      add(skull, ...eyes(0.3, 1.84, 0.08, 0.04, '#d8fff0'));
      break;
    }
    case 'disruptor': {
      hoodCowl('#223a5a');
      const totemL = cyl(0.05, 0.05, 0.3, '#70c8ff', 0x163a52);
      totemL.position.set(-0.3 * s, 1.4 * s, 0.2 * s);
      const totemR = totemL.clone();
      totemR.position.z = -0.2 * s;
      add(totemL, totemR, ...eyes(0.3, 1.84, 0.08, 0.04, '#ffffff'));
      break;
    }
    case 'grimstroke': {
      const mask = box(0.09, 0.32, 0.28, '#f0d8ff');
      mask.position.set(0.26 * s, 1.84 * s, 0);
      const quill = cone(0.04, 0.6, '#d84a7a', 0x401020);
      quill.position.set(0.5 * s, 1.3 * s, 0.18 * s);
      quill.rotation.z = -0.5;
      cape('#201020', 0.62);
      add(mask, quill, ...eyes(0.32, 1.86, 0.07, 0.035, '#f0d8ff'));
      break;
    }
    case 'keeper-of-the-light': {
      beard('#ffffff', 1.54);
      const lantern = sphere(0.12, '#ffe78a', 0x6a5814);
      lantern.position.set(0.5 * s, 1.5 * s, 0.18 * s);
      cape('#7aa8ff', 0.62);
      add(lantern, ...eyes(0.3, 1.86, 0.08, 0.035, '#fff6c0'));
      break;
    }
    case 'leshrac': {
      tailSerpent('#9a70ff', '#70d8ff');
      horns('#70d8ff', 0.34, 2.0, 0.2, 0.4, 0.6);
      crownSpikes(3, '#e8e8ff', 0x2a164a, 2.06);
      add(...eyes(0.3, 1.84, 0.08, 0.04, '#70d8ff'));
      break;
    }
    case 'necrophos': {
      hoodCowl('#283820');
      const scythe = box(0.04, 0.7, 0.04, '#84d86a', 0x14280c);
      scythe.position.set(0.5 * s, 1.4 * s, 0.18 * s);
      const blade = box(0.3, 0.06, 0.03, '#d8ffb0', 0x14280c);
      blade.position.set(0.6 * s, 1.7 * s, 0.18 * s);
      blade.rotation.z = 0.6;
      add(scythe, blade, ...eyes(0.3, 1.84, 0.08, 0.045, '#d8ffb0'));
      break;
    }
    case 'puck': {
      wings('#7650ff', 0.6, 1.4, 0x2a1a5a);
      horns('#d8f0ff', 0.24, 1.98, 0.16, 0.4, 0.5);
      add(...eyes(0.3, 1.84, 0.08, 0.045, '#ff9ad8'));
      break;
    }
    case 'pugna': {
      const skull = sphere(0.24, '#f0ffd8', 0x16280c);
      skull.position.set(0.16 * s, 1.86 * s, 0);
      orbitOrbs(2, '#9aff70', 0.07, 0.42, 1.4);
      cape('#243818', 0.6);
      add(skull, ...eyes(0.34, 1.88, 0.07, 0.035, '#9aff70'));
      break;
    }
    case 'queen-of-pain': {
      wings('#2a102e', 0.72, 1.32, 0x2a102e);
      horns('#ffb0d8', 0.3, 2.0, 0.18, 0.3, 0.6);
      const clawL = cone(0.04, 0.22, '#ffb0d8');
      clawL.rotation.z = -1.0;
      clawL.position.set(0.38 * s, 0.95 * s, 0.3 * s);
      const clawR = clawL.clone();
      clawR.position.z = -0.3 * s;
      add(clawL, clawR, ...eyes(0.3, 1.84, 0.08, 0.04, '#ffb0d8'));
      break;
    }
    case 'shadow-demon': {
      hoodCowl('#120a24');
      horns('#c8b8ff', 0.32, 2.0, 0.2, 0.4, 0.6);
      cape('#120a24', 0.64);
      const clawL = cone(0.04, 0.22, '#c8b8ff');
      clawL.rotation.z = -1.0;
      clawL.position.set(0.38 * s, 0.95 * s, 0.3 * s);
      const clawR = clawL.clone();
      clawR.position.z = -0.3 * s;
      add(clawL, clawR, ...eyes(0.3, 1.84, 0.08, 0.04, '#c8b8ff'));
      break;
    }
    case 'shadow-shaman': {
      const mask = box(0.09, 0.34, 0.3, '#70d8ff');
      mask.position.set(0.26 * s, 1.84 * s, 0);
      const featherG = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const f = cone(0.04, 0.3, '#f0c45c');
        f.position.set(-0.06 * s, 2.04 * s, (i - 1) * 0.12 * s);
        f.rotation.z = -0.3;
        featherG.add(f);
      }
      add(mask, featherG, ...eyes(0.32, 1.86, 0.07, 0.035, '#70d8ff'));
      break;
    }

    // ---------- Standard: Universal ----------
    case 'bane': {
      const tentL = cone(0.08, 0.6, '#160d28');
      tentL.rotation.z = 0.6;
      tentL.position.set(-0.12 * s, 0.7 * s, 0.22 * s);
      const tentR = tentL.clone();
      tentR.position.set(-0.16 * s, 0.7 * s, -0.2 * s);
      tentR.rotation.z = -0.6;
      const eyeBig = sphere(0.12, '#c8b8ff', 0x2a1a4a);
      eyeBig.position.set(0.3 * s, 1.5 * s, 0);
      add(tentL, tentR, eyeBig, ...eyes(0.3, 1.7, 0.12, 0.05, '#c8b8ff'));
      break;
    }
    case 'batrider': {
      wings('#2a1408', 0.85, 1.3, 0x2a1408);
      const torch = cyl(0.04, 0.04, 0.4, '#5a3418');
      torch.position.set(0.46 * s, 1.3 * s, 0.2 * s);
      const flame = cone(0.08, 0.2, '#ff7a2f', 0x5a1404);
      flame.position.set(0.46 * s, 1.56 * s, 0.2 * s);
      add(torch, flame, ...eyes(0.3, 1.84, 0.08, 0.04, '#ffe08a'));
      break;
    }
    case 'clockwerk': {
      const gearL = torus(0.16, 0.05, '#303848', 0x101820);
      gearL.position.set(0, 1.5 * s, 0.5 * s);
      const gearR = gearL.clone();
      gearR.position.z = -0.5 * s;
      const cog = torus(0.12, 0.04, '#ffd48a');
      cog.position.set(0.34 * s, 1.2 * s, 0);
      add(gearL, gearR, cog, ...eyes(0.3, 1.84, 0.08, 0.04, '#ffd48a'));
      break;
    }
    case 'dark-seer': {
      const dome = sphere(0.28, '#201838');
      dome.scale.set(1, 1.25, 1.1);
      dome.position.set(0, 1.92 * s, 0);
      const thirdEye = sphere(0.06, '#80d8ff', 0x163a52);
      thirdEye.position.set(0.26 * s, 1.96 * s, 0);
      cape('#201838', 0.62);
      add(dome, thirdEye, ...eyes(0.3, 1.82, 0.08, 0.038, '#80d8ff'));
      break;
    }
    case 'dark-willow': {
      wings('#1c1028', 0.6, 1.4, 0x2a1a4a);
      const mask = box(0.08, 0.26, 0.26, '#ffb8e8');
      mask.position.set(0.26 * s, 1.84 * s, 0);
      add(mask, ...eyes(0.3, 1.84, 0.08, 0.04, '#d85cff'));
      break;
    }
    case 'dazzle': {
      const mask = box(0.09, 0.34, 0.3, '#ffd8ff');
      mask.position.set(0.26 * s, 1.84 * s, 0);
      const wand = cyl(0.03, 0.03, 0.5, '#302040');
      wand.position.set(0.46 * s, 1.4 * s, 0.18 * s);
      const tip = sphere(0.07, '#f05cff', 0x401040);
      tip.position.set(0.46 * s, 1.68 * s, 0.18 * s);
      add(mask, wand, tip, ...eyes(0.32, 1.86, 0.07, 0.035, '#f05cff'));
      break;
    }
    case 'earth-spirit': {
      shoulderSlabs('#203820', 0.3);
      const totem = box(0.16, 0.4, 0.16, '#58b86a', 0x14280c);
      totem.position.set(0.42 * s, 1.3 * s, 0.2 * s);
      add(totem, ...eyes(0.28, 1.82, 0.09, 0.04, '#d8f0b0'));
      break;
    }
    case 'enigma': {
      const mass = sphere(0.4, '#050510');
      mass.position.set(0, 1.3 * s, 0);
      const starG = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const st = sphere(0.04, '#b8a8ff', 0x2a1c5a);
        st.position.set((0.1 + (i % 2) * 0.1) * s, (1.2 + i * 0.16) * s, ((i % 2) - 0.5) * 0.5 * s);
        starG.add(st);
      }
      add(mass, starG, ...eyes(0.34, 1.4, 0.1, 0.05, '#b8a8ff'));
      break;
    }
    case 'lone-druid': {
      hoodCowl('#3a2a18');
      const bearHead = sphere(0.2, '#8ac06a');
      bearHead.position.set(-0.34 * s, 1.0 * s, 0.3 * s);
      const earL = sphere(0.06, '#8ac06a');
      earL.position.set(-0.36 * s, 1.16 * s, 0.4 * s);
      add(bearHead, earL, ...eyes(0.3, 1.84, 0.08, 0.04, '#f0d0a0'));
      break;
    }
    case 'lycan': {
      const wolfHead = sphere(0.24, '#8a8a8a');
      wolfHead.scale.set(1.15, 0.95, 1);
      wolfHead.position.set(0.1 * s, 1.86 * s, 0);
      const snout = cone(0.1, 0.24, '#8a8a8a');
      snout.rotation.z = -Math.PI / 2;
      snout.position.set(0.34 * s, 1.82 * s, 0);
      const clawL = cone(0.045, 0.22, '#f0c090');
      clawL.rotation.z = -1.0;
      clawL.position.set(0.4 * s, 0.95 * s, 0.32 * s);
      const clawR = clawL.clone();
      clawR.position.z = -0.32 * s;
      add(wolfHead, snout, clawL, clawR, ...eyes(0.3, 1.88, 0.08, 0.04, '#f0c090'));
      break;
    }
    case 'marci': {
      const braid = cone(0.08, 0.6, '#3a2418');
      braid.rotation.z = 0.3;
      braid.position.set(-0.2 * s, 1.8 * s, 0);
      const gauntL = sphere(0.16, '#f0b06a', 0x4a2a10);
      gauntL.position.set(0.34 * s, 0.95 * s, 0.4 * s);
      const gauntR = gauntL.clone();
      gauntR.position.z = -0.4 * s;
      const satchel = box(0.16, 0.2, 0.12, '#3a2418');
      satchel.position.set(-0.28 * s, 1.0 * s, 0.2 * s);
      add(braid, gauntL, gauntR, satchel, ...eyes(0.3, 1.86, 0.08, 0.035, '#ffe8c0'));
      break;
    }
    case 'pangolier': {
      const hat = cyl(0.26, 0.3, 0.1, '#2c2440');
      hat.position.set(0, 1.98 * s, 0);
      const plume = cone(0.06, 0.3, '#80d8ff');
      plume.position.set(-0.04 * s, 2.18 * s, 0);
      plume.rotation.z = 0.4;
      const scaleL = box(0.06, 0.4, 0.2, '#d8a04a');
      scaleL.position.set(-0.2 * s, 1.1 * s, 0.18 * s);
      const scaleR = scaleL.clone();
      scaleR.position.z = -0.18 * s;
      add(hat, plume, scaleL, scaleR, ...eyes(0.3, 1.86, 0.08, 0.035, '#80d8ff'));
      break;
    }
    case 'snapfire': {
      mountQuad('#5a3418');
      const goggles = box(0.08, 0.1, 0.3, '#ffe0a0', 0x4a3208);
      goggles.position.set(0.26 * s, 1.88 * s, 0);
      gunArm('#5a3418', '#e86a32');
      add(goggles, ...eyes(0.3, 1.86, 0.08, 0.03, '#ffe0a0'));
      break;
    }
    case 'timbersaw': {
      const frame = box(0.36, 0.5, 0.5, '#4a4a4a');
      frame.position.set(-0.04 * s, 1.2 * s, 0);
      const saw = torus(0.18, 0.04, '#b8f0ff', 0x163a52);
      saw.position.set(0.42 * s, 1.2 * s, 0.34 * s);
      const sawR = saw.clone();
      sawR.position.z = -0.34 * s;
      add(frame, saw, sawR, ...eyes(0.3, 1.84, 0.08, 0.04, '#b8f0ff'));
      break;
    }
    case 'void-spirit': {
      hoodCowl('#181028');
      const riftL = octa(0.08, '#ff8ad8', 0x3a1a2e);
      riftL.position.set(-0.28 * s, 1.4 * s, 0.3 * s);
      const riftR = riftL.clone();
      riftR.position.set(-0.32 * s, 1.2 * s, -0.26 * s);
      add(riftL, riftR, ...eyes(0.3, 1.84, 0.08, 0.04, '#ff8ad8'));
      break;
    }

    // ---------- Complex ----------
    case 'chaos-knight': {
      crownSpikes(4, '#f0c060', 0x4a3010, 2.02);
      cape('#1a0a0a', 0.66);
      shoulderSlabs('#1a0a0a', 0.26);
      add(...eyes(0.3, 1.84, 0.09, 0.045, '#ff4a2a'));
      break;
    }
    case 'phantom-lancer': {
      crownSpikes(3, '#d8e8ff', 0x18224a, 2.02);
      const lance = cyl(0.03, 0.03, 0.9, '#4a8cff', 0x18224a);
      lance.position.set(0.5 * s, 1.3 * s, 0.18 * s);
      lance.rotation.z = 0.2;
      const sash = box(0.06, 0.18, 0.5, '#4a8cff');
      sash.position.set(0.18 * s, 0.74 * s, 0);
      add(lance, sash, ...eyes(0.3, 1.86, 0.08, 0.038, '#d8e8ff'));
      break;
    }
    case 'monkey-king': {
      const mask = box(0.09, 0.3, 0.28, '#fff0a0');
      mask.position.set(0.26 * s, 1.84 * s, 0);
      const circlet = torus(0.24, 0.03, '#d8a048', 0x4a2410);
      circlet.position.set(0.04 * s, 1.98 * s, 0);
      circlet.rotation.x = Math.PI / 2;
      cape('#4a2410', 0.6);
      add(mask, circlet, ...eyes(0.32, 1.86, 0.07, 0.035, '#fff0a0'));
      break;
    }
    case 'rubick': {
      hoodCowl('#204020');
      const cube = box(0.16, 0.16, 0.16, '#d8ffd0', 0x14280c);
      cube.position.set(0.34 * s, 1.5 * s, 0);
      cape('#204020', 0.62);
      add(cube, ...eyes(0.3, 1.84, 0.08, 0.04, '#d8ffd0'));
      break;
    }
    case 'techies': {
      const goggles = box(0.08, 0.12, 0.34, '#f0f060', 0x4a4a08);
      goggles.position.set(0.26 * s, 1.86 * s, 0);
      const satchel = box(0.22, 0.26, 0.3, '#304030');
      satchel.position.set(-0.3 * s, 1.2 * s, 0);
      const mine = sphere(0.1, '#ff8a2f', 0x5a2808);
      mine.position.set(0.32 * s, 1.0 * s, 0.34 * s);
      add(goggles, satchel, mine, ...eyes(0.28, 1.86, 0.08, 0.03, '#f0f060'));
      break;
    }
    case 'arc-warden': {
      hoodCowl('#1c2440');
      const arcCore = sphere(0.14, '#65d8ff', 0x163a52);
      arcCore.position.set(0.34 * s, 1.4 * s, 0);
      orbitOrbs(3, '#f6f0a8', 0.05, 0.34, 1.4);
      cape('#1c2440', 0.6);
      add(arcCore, ...eyes(0.3, 1.84, 0.08, 0.04, '#65d8ff'));
      break;
    }
    case 'meepo': {
      const cap = cyl(0.24, 0.26, 0.12, '#4a2a18');
      cap.position.set(0, 1.96 * s, 0);
      const scarf = torus(0.22, 0.05, '#78b85a', 0, Math.PI * 1.4);
      scarf.position.set(0.04 * s, 1.62 * s, 0);
      scarf.rotation.x = Math.PI / 2;
      add(cap, scarf, ...eyes(0.3, 1.84, 0.08, 0.04, '#d8f0a0'));
      break;
    }
    case 'morphling': {
      const crest = cone(0.1, 0.4, '#5ad8ff', 0x16344a);
      crest.position.set(-0.06 * s, 2.04 * s, 0);
      crest.rotation.z = -0.5;
      const ripple = torus(0.3, 0.04, '#d8fbff', 0x16344a);
      ripple.position.set(-0.02 * s, 0.7 * s, 0);
      ripple.rotation.x = Math.PI / 2;
      add(crest, ripple, ...eyes(0.3, 1.86, 0.08, 0.045, '#d8fbff'));
      break;
    }
    case 'brewmaster': {
      const band = torus(0.26, 0.04, '#70c8ff', 0x163a52);
      band.position.set(0.04 * s, 1.92 * s, 0);
      band.rotation.x = Math.PI / 2;
      const keg = cyl(0.18, 0.18, 0.4, '#3a2410');
      keg.position.set(-0.3 * s, 1.2 * s, 0);
      beard('#3a2410', 1.56);
      add(band, keg, ...eyes(0.28, 1.84, 0.09, 0.04, '#70c8ff'));
      break;
    }
  }
}

export function buildWeapon(
  kind: SilhouetteSpec['weapon'] | ItemWeaponVisualKind,
  s: number,
  matS: THREE.MeshStandardMaterial,
  matA: THREE.MeshStandardMaterial
): THREE.Group | null {
  if (!kind || kind === 'none') return null;
  const g = new THREE.Group();
  switch (kind) {
    case 'sword': {
      const blade = mesh(new THREE.BoxGeometry(0.85 * s, 0.14 * s, 0.04 * s), lam('#d8dce8'));
      blade.position.x = 0.5 * s;
      const guard = mesh(new THREE.BoxGeometry(0.06 * s, 0.26 * s, 0.08 * s), matA);
      guard.position.x = 0.08 * s;
      g.add(blade, guard);
      break;
    }
    case 'staff': {
      const shaft = mesh(new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 1.5 * s, 10), matS);
      const gem = mesh(new THREE.OctahedronGeometry(0.14 * s), matA);
      gem.position.y = 0.85 * s;
      g.add(shaft, gem);
      break;
    }
    case 'hook': {
      const chain = mesh(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.5 * s, 10), matS);
      const hook = mesh(new THREE.TorusGeometry(0.16 * s, 0.05 * s, 8, 18, Math.PI * 1.4), lam('#a8b0b8'));
      hook.position.y = -0.35 * s;
      g.add(chain, hook);
      break;
    }
    case 'totem': {
      const head = mesh(new THREE.BoxGeometry(0.45 * s, 0.6 * s, 0.45 * s), matA);
      head.position.y = -0.2 * s;
      const haft = mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.9 * s, 10), matS);
      haft.position.y = 0.3 * s;
      g.add(head, haft);
      break;
    }
    case 'rifle': {
      const barrel = mesh(new THREE.CylinderGeometry(0.045 * s, 0.05 * s, 1.3 * s, 10), matS);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.x = 0.4 * s;
      const stock = mesh(new THREE.BoxGeometry(0.35 * s, 0.12 * s, 0.08 * s), matA);
      stock.position.x = -0.15 * s;
      const scope = mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.18 * s, 10), matA);
      scope.rotation.z = Math.PI / 2;
      scope.position.set(0.25 * s, 0.1 * s, 0);
      g.add(barrel, stock, scope);
      break;
    }
    case 'cleaver': {
      const blade = mesh(new THREE.BoxGeometry(0.6 * s, 0.4 * s, 0.05 * s), lam('#b8bcc8'));
      blade.position.x = 0.35 * s;
      g.add(blade);
      break;
    }
    case 'broad-cleaver': {
      const blade = mesh(new THREE.BoxGeometry(0.92 * s, 0.52 * s, 0.06 * s), matS);
      blade.position.x = 0.48 * s;
      const bite = mesh(new THREE.BoxGeometry(0.26 * s, 0.16 * s, 0.07 * s), lam('#1d2430'));
      bite.position.set(0.82 * s, 0.2 * s, 0);
      const guard = mesh(new THREE.BoxGeometry(0.07 * s, 0.38 * s, 0.08 * s), matA);
      guard.position.x = 0.1 * s;
      g.add(blade, bite, guard);
      break;
    }
    case 'glowing-blade': {
      const blade = mesh(new THREE.BoxGeometry(1.05 * s, 0.16 * s, 0.05 * s), lam('#ffe27d', 0x3a3008));
      blade.position.x = 0.58 * s;
      const halo = mesh(
        new THREE.BoxGeometry(1.16 * s, 0.26 * s, 0.06 * s),
        new THREE.MeshBasicMaterial({ color: '#fff2b8', transparent: true, opacity: 0.26, depthWrite: false })
      );
      halo.position.x = 0.58 * s;
      const guard = mesh(new THREE.BoxGeometry(0.06 * s, 0.34 * s, 0.08 * s), matA);
      guard.position.x = 0.08 * s;
      g.add(halo, blade, guard);
      break;
    }
    case 'long-pole': {
      const shaft = mesh(new THREE.CylinderGeometry(0.035 * s, 0.04 * s, 1.95 * s, 10), matS);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = 0.68 * s;
      const tip = mesh(new THREE.ConeGeometry(0.12 * s, 0.36 * s, 8), matA);
      tip.rotation.z = -Math.PI / 2;
      tip.position.x = 1.72 * s;
      g.add(shaft, tip);
      break;
    }
    case 'storm-haft': {
      const haft = mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 1.08 * s, 10), matS);
      haft.position.y = 0.18 * s;
      const head = mesh(new THREE.BoxGeometry(0.38 * s, 0.38 * s, 0.38 * s), lam('#7ddcff', 0x11385a));
      head.position.y = -0.42 * s;
      const coil = mesh(
        new THREE.TorusGeometry(0.2 * s, 0.025 * s, 6, 18),
        new THREE.MeshBasicMaterial({ color: '#c8f6ff', transparent: true, opacity: 0.82 })
      );
      coil.position.y = -0.42 * s;
      g.add(haft, head, coil);
      break;
    }
  }
  return g;
}

export function applyItemAppearances(rig: UnitRig, apps: ItemAppearanceSpec[]): void {
  rig.itemLayer.clear();
  replaceWeapon(rig, apps.find((a) => a.weapon)?.weapon);

  for (const app of apps) {
    if (app.tint) addTintShell(rig, app.tint);
    for (const part of app.parts ?? []) addPart(rig, part);
    if (app.aura) addAura(rig, app.aura.color, app.aura.color2);
  }
}

function replaceWeapon(rig: UnitRig, weapon: ItemAppearanceSpec['weapon'] | undefined): void {
  if (!weapon) return;
  if (rig.weapon?.parent) rig.weapon.parent.remove(rig.weapon);
  rig.attackWeapon = weapon.kind;
  const matS = lam(weapon.color ?? '#d8dce8', weapon.emissive ? 0x111111 : 0);
  const matA = lam(weapon.emissive ?? '#ffe27d', weapon.emissive ? 0x181818 : 0);
  const next = buildWeapon(weapon.kind, rig.scale, matS, matA);
  if (!next) return;
  const host = rig.rightHand ?? rig.itemLayer;
  next.position.set(
    rig.rightHand ? 0.15 * rig.scale : 0.42 * rig.scale,
    rig.rightHand ? -0.72 * rig.scale : rig.height * 0.52,
    rig.rightHand ? 0 : -0.56 * rig.scale
  );
  if (!rig.rightHand) next.rotation.z = -0.45;
  host.add(next);
  rig.weapon = next;
}

function addPart(rig: UnitRig, part: NonNullable<ItemAppearanceSpec['parts']>[number]): void {
  const s = rig.scale;
  switch (part) {
    case 'pauldrons': {
      const mat = lam('#d4d9e6');
      for (const side of [1, -1] as const) {
        const pad = mesh(new THREE.SphereGeometry(0.27 * s, 10, 8), mat);
        pad.scale.set(1.2, 0.6, 0.9);
        pad.position.set(0, 1.5 * s, side * 0.58 * s);
        rig.itemLayer.add(pad);
      }
      break;
    }
    case 'heart-core': {
      const core = mesh(new THREE.OctahedronGeometry(0.23 * s), lam('#d64a3f', 0x250606));
      core.position.set(0.33 * s, 1.12 * s, 0);
      rig.itemLayer.add(core);
      break;
    }
    case 'frost-shards': {
      const mat = lam('#a8e8ff');
      for (let i = 0; i < 5; i++) {
        const shard = mesh(new THREE.ConeGeometry(0.06 * s, 0.38 * s, 6), mat);
        const a = (i / 5) * Math.PI * 2;
        shard.position.set(Math.cos(a) * 0.42 * s, 1.48 * s + (i % 2) * 0.18 * s, Math.sin(a) * 0.42 * s);
        shard.rotation.z = 0.45;
        rig.itemLayer.add(shard);
      }
      break;
    }
    case 'boot-trail': {
      const mat = new THREE.MeshBasicMaterial({ color: '#f1d58a', transparent: true, opacity: 0.35, depthWrite: false });
      for (const side of [1, -1] as const) {
        const trail = mesh(new THREE.CircleGeometry(0.18 * s, 12), mat);
        trail.rotation.x = -Math.PI / 2;
        trail.position.set(-0.16 * s, 0.04, side * 0.18 * s);
        rig.itemLayer.add(trail);
      }
      break;
    }
    case 'wing-blades': {
      const mat = lam('#c8ffd8');
      for (const side of [1, -1] as const) {
        const wing = mesh(new THREE.BoxGeometry(0.06 * s, 0.72 * s, 0.22 * s), mat);
        wing.position.set(-0.34 * s, 1.28 * s, side * 0.46 * s);
        wing.rotation.z = side * 0.32;
        rig.itemLayer.add(wing);
      }
      break;
    }
    case 'crystal-edge': {
      const mat = lam('#ffb8c8', 0x2a080f);
      for (const side of [1, -1] as const) {
        const shard = mesh(new THREE.ConeGeometry(0.08 * s, 0.44 * s, 6), mat);
        shard.position.set(0.18 * s, 1.42 * s, side * 0.5 * s);
        shard.rotation.z = side * 0.55;
        rig.itemLayer.add(shard);
      }
      break;
    }
    case 'mana-orb': {
      const orb = mesh(
        new THREE.SphereGeometry(0.18 * s, 14, 10),
        new THREE.MeshBasicMaterial({ color: '#73d9ff', transparent: true, opacity: 0.76, depthWrite: false })
      );
      orb.position.set(-0.36 * s, 1.34 * s, -0.34 * s);
      rig.itemLayer.add(orb);
      break;
    }
    case 'hex-sigil': {
      const sigil = mesh(
        new THREE.TorusKnotGeometry(0.16 * s, 0.025 * s, 32, 6),
        new THREE.MeshBasicMaterial({ color: '#c8a0ff', transparent: true, opacity: 0.86, depthWrite: false })
      );
      sigil.position.set(0.0, 1.66 * s, 0.48 * s);
      rig.itemLayer.add(sigil);
      break;
    }
  }
}

function addTintShell(rig: UnitRig, color: string): void {
  const shell = mesh(
    new THREE.SphereGeometry(0.82 * rig.scale, 12, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false })
  );
  shell.scale.y = 1.35;
  shell.position.y = rig.height * 0.48;
  rig.itemLayer.add(shell);
}

function addAura(rig: UnitRig, color: string, color2?: string): void {
  const ring = mesh(
    new THREE.TorusGeometry(0.72 * rig.scale, 0.035 * rig.scale, 6, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.52, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.16;
  rig.itemLayer.add(ring);
  if (color2) {
    const ring2 = ring.clone();
    (ring2 as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: color2, transparent: true, opacity: 0.24, depthWrite: false });
    ring2.scale.setScalar(1.25);
    rig.itemLayer.add(ring2);
  }
}

/** Team/selection ring shown under units. */
export function buildSelectionRing(radiusWorld: number, color: number): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radiusWorld * 0.85, radiusWorld, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  return ring;
}
