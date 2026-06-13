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
  materials: THREE.MeshLambertMaterial[];
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
  { heroId: 'luna', readsAs: 'silver-blue glaive rider', features: ['crescent helm', 'moon glaive', 'silver shoulders'] },
  { heroId: 'sven', readsAs: 'masked heavy knight', features: ['horned helm', 'greatsword', 'broad pauldrons'] },
  { heroId: 'axe', readsAs: 'red axe berserker', features: ['bald head', 'red body', 'two-handed axe'] }
];

function lam(color: string | number, emissive = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: false, emissive });
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
  const matP = lam(primary);
  const matS = lam(secondary);
  const matA = lam(accent);
  const materials = [matP, matS, matA];
  const s = sil.scale;

  const root = new THREE.Group();
  const body = new THREE.Group();
  const itemLayer = new THREE.Group();
  root.add(body);
  root.add(itemLayer);

  const rig: UnitRig = { root, body, itemLayer, height: 1.8 * s, scale: s, materials };

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

  switch (heroId) {
    case 'juggernaut': {
      const mask = box(0.08, 0.34, 0.28, '#f3e3c2');
      mask.position.set(0.25 * s, 1.84 * s, 0);
      const visor = box(0.09, 0.06, 0.22, '#7adfc4', 0x081817);
      visor.position.set(0.3 * s, 1.88 * s, 0);
      const crestA = cone(0.08, 0.36, '#c8742c');
      crestA.rotation.z = -0.7;
      crestA.position.set(-0.04 * s, 2.1 * s, 0.16 * s);
      const crestB = crestA.clone();
      crestB.position.z = -0.16 * s;
      add(mask, visor, crestA, crestB);
      break;
    }
    case 'crystal-maiden': {
      const fur = new THREE.Mesh(
        new THREE.TorusGeometry(0.26 * s, 0.055 * s, 8, 24),
        lam('#f4fbff')
      );
      fur.position.set(0, 1.76 * s, 0);
      fur.rotation.x = Math.PI / 2;
      const crown = cone(0.12, 0.34, '#d8f4ff', 0x102438);
      crown.position.set(0.02 * s, 2.1 * s, 0);
      const robeL = box(0.05, 0.76, 0.18, '#d8f4ff');
      robeL.position.set(0.34 * s, 0.82 * s, 0.18 * s);
      const robeR = robeL.clone();
      robeR.position.z = -0.18 * s;
      add(fur, crown, robeL, robeR);
      break;
    }
    case 'pudge': {
      const belly = sphere(0.48, '#d8a39b');
      belly.scale.set(1.1, 0.9, 0.8);
      belly.position.set(0.12 * s, 1.0 * s, 0);
      const scar = box(0.04, 0.54, 0.03, '#5b2118');
      scar.position.set(0.55 * s, 1.0 * s, 0);
      scar.rotation.z = 0.45;
      const apron = box(0.08, 0.7, 0.42, '#5d2f21');
      apron.position.set(0.52 * s, 0.86 * s, 0);
      add(belly, scar, apron);
      break;
    }
    case 'earthshaker': {
      const beard = cone(0.2, 0.42, '#e8b15c');
      beard.rotation.z = Math.PI;
      beard.position.set(0.16 * s, 1.58 * s, 0);
      const stoneL = sphere(0.25, '#5b8cc8');
      stoneL.scale.set(1.15, 0.65, 0.9);
      stoneL.position.set(0, 1.55 * s, 0.68 * s);
      const stoneR = stoneL.clone();
      stoneR.position.z = -0.68 * s;
      add(beard, stoneL, stoneR);
      break;
    }
    case 'sniper': {
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34 * s, 0.34 * s, 0.05 * s, 18),
        lam('#5c4a32')
      );
      brim.position.set(0, 1.96 * s, 0);
      brim.rotation.x = Math.PI / 2;
      const goggles = box(0.08, 0.08, 0.32, '#ffd27f', 0x201002);
      goggles.position.set(0.24 * s, 1.86 * s, 0);
      const beard = cone(0.16, 0.36, '#d7b07a');
      beard.rotation.z = Math.PI;
      beard.position.set(0.15 * s, 1.56 * s, 0);
      add(brim, goggles, beard);
      break;
    }
    case 'lich': {
      const jaw = box(0.16, 0.18, 0.18, '#e8e8d8');
      jaw.position.set(0.12 * s, 1.6 * s, 0);
      const crown = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const spike = cone(0.045, 0.34 + i % 2 * 0.12, '#d8f4ff', 0x0d2838);
        spike.position.set(0, (2.05 + (i % 2) * 0.04) * s, (i - 2) * 0.11 * s);
        crown.add(spike);
      }
      const cape = box(0.05, 1.16, 0.64, '#2c4a78');
      cape.position.set(-0.34 * s, 1.05 * s, 0);
      add(jaw, crown, cape);
      break;
    }
    case 'luna': {
      const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.26 * s, 0.035 * s, 8, 24, Math.PI * 1.25), lam('#dce8ff'));
      crescent.rotation.z = Math.PI / 2;
      crescent.position.set(0.03 * s, 2.05 * s, 0);
      add(crescent);
      break;
    }
    case 'sven': {
      const visor = box(0.1, 0.16, 0.34, '#d8dde8');
      visor.position.set(0.24 * s, 1.88 * s, 0);
      const plume = cone(0.09, 0.5, '#3a5bd8');
      plume.position.set(-0.08 * s, 2.16 * s, 0);
      add(visor, plume);
      break;
    }
    case 'axe': {
      const mohawk = box(0.08, 0.42, 0.12, '#b51f1f');
      mohawk.position.set(0, 2.02 * s, 0);
      const beard = cone(0.18, 0.34, '#5a160f');
      beard.rotation.z = Math.PI;
      beard.position.set(0.14 * s, 1.55 * s, 0);
      add(mohawk, beard);
      break;
    }
  }
}

export function buildWeapon(
  kind: SilhouetteSpec['weapon'] | ItemWeaponVisualKind,
  s: number,
  matS: THREE.MeshLambertMaterial,
  matA: THREE.MeshLambertMaterial
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
