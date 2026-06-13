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
  { heroId: 'brewmaster', readsAs: 'broad drunken elemental brawler', features: ['barrel charm', 'bare headband', 'totem keg', 'tri-element wisps'] }
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
