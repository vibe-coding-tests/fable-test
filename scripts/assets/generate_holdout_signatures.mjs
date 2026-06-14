// Generate original low-poly GLBs for the 11 abstract holdout heroes.
//
// Outputs two fallback-safe sets:
// - holdouts/<id>.glb: additive identity kits for the procedural rig.
// - holdouts/replacements/<id>.glb: hierarchy-animated replacement models with
//   idle/run/attack/cast/channel/death clips for the authored-model mixer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'holdouts');
const REPLACEMENT_DIR = path.join(OUT_DIR, 'replacements');

const MATERIALS = ['primary', 'secondary', 'accent', 'dark'];

const HOLDOUTS = {
  io: { palette: ['#9fe8ff', '#356a9a', '#ffffff'], style: 'wisp' },
  enigma: { palette: ['#241a5f', '#070714', '#b78cff'], style: 'void' },
  morphling: { palette: ['#42c8ff', '#0f5e9a', '#bdf5ff'], style: 'water' },
  bane: { palette: ['#6c3aa4', '#221333', '#ff77cc'], style: 'nightmare' },
  'ancient-apparition': { palette: ['#b8f4ff', '#2e5d8a', '#ffffff'], style: 'ice-wraith' },
  leshrac: { palette: ['#6847ff', '#251745', '#85f4ff'], style: 'tormented' },
  phoenix: { palette: ['#ff8a2a', '#7a1e14', '#ffd85a'], style: 'firebird' },
  'naga-siren': { palette: ['#49b7d8', '#155d78', '#ffd37a'], style: 'siren' },
  medusa: { palette: ['#55b86a', '#1d5030', '#f0d36a'], style: 'gorgon' },
  batrider: { palette: ['#c65a26', '#312018', '#ffd26a'], style: 'bat-rider' },
  'lone-druid': { palette: ['#5d8f4a', '#2d3b26', '#d8b36a'], style: 'bear-druid' }
};

function hexToLinearFactor(hex) {
  const h = hex.replace('#', '');
  const to = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [to(parseInt(h.slice(0, 2), 16)), to(parseInt(h.slice(2, 4), 16)), to(parseInt(h.slice(4, 6), 16)), 1];
}

function align4(n) {
  return (n + 3) & ~3;
}

function quatFromEuler(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2);
  const cy = Math.cos(ry / 2), sy = Math.sin(ry / 2);
  const cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz
  ];
}

function transformPoint(p, opts = {}) {
  const rz = opts.rz ?? 0;
  const c = Math.cos(rz);
  const s = Math.sin(rz);
  const x = p[0] * c - p[1] * s;
  const y = p[0] * s + p[1] * c;
  return [x + (opts.x ?? 0), y + (opts.y ?? 0), p[2] + (opts.z ?? 0)];
}

function transformNormal(n, opts = {}) {
  const rz = opts.rz ?? 0;
  const c = Math.cos(rz);
  const s = Math.sin(rz);
  return [n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2]];
}

function pushFace(positions, normals, indices, verts, normal) {
  const base = positions.length / 3;
  for (const v of verts) {
    positions.push(v[0], v[1], v[2]);
    normals.push(normal[0], normal[1], normal[2]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function box(name, mat, sx, sy, sz, opts = {}) {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const faces = [
    [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z], [1, 0, 0]],
    [[-x, y, -z], [-x, -y, -z], [-x, -y, z], [-x, y, z], [-1, 0, 0]],
    [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z], [0, 1, 0]],
    [[-x, -y, -z], [-x, -y, z], [x, -y, z], [x, -y, -z], [0, -1, 0]],
    [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]],
    [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]]
  ];
  const positions = [], normals = [], indices = [];
  for (const face of faces) {
    pushFace(positions, normals, indices, face.slice(0, 4).map((p) => transformPoint(p, opts)), transformNormal(face[4], opts));
  }
  return { name, mat, positions, normals, indices };
}

function cylinder(name, mat, radius, length, axis = 'y', opts = {}, sides = 10) {
  const positions = [], normals = [], indices = [];
  const axisPoint = (t, a, r = radius) => {
    const c = Math.cos(a) * r;
    const s = Math.sin(a) * r;
    if (axis === 'x') return [t * length / 2, c, s];
    if (axis === 'z') return [c, s, t * length / 2];
    return [c, t * length / 2, s];
  };
  const axisNormal = (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    if (axis === 'x') return [0, c, s];
    if (axis === 'z') return [c, s, 0];
    return [c, 0, s];
  };
  const capNormal = (t) => axis === 'x' ? [t, 0, 0] : axis === 'z' ? [0, 0, t] : [0, t, 0];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    pushFace(
      positions,
      normals,
      indices,
      [axisPoint(-1, a0), axisPoint(1, a0), axisPoint(1, a1), axisPoint(-1, a1)].map((p) => transformPoint(p, opts)),
      transformNormal(axisNormal((a0 + a1) / 2), opts)
    );
    for (const t of [-1, 1]) {
      const center = axisPoint(t, 0, 0);
      const verts = t > 0 ? [center, axisPoint(t, a0), axisPoint(t, a1)] : [center, axisPoint(t, a1), axisPoint(t, a0)];
      const base = positions.length / 3;
      const n = transformNormal(capNormal(t), opts);
      for (const p of verts.map((v) => transformPoint(v, opts))) {
        positions.push(p[0], p[1], p[2]);
        normals.push(n[0], n[1], n[2]);
      }
      indices.push(base, base + 1, base + 2);
    }
  }
  return { name, mat, positions, normals, indices };
}

function cone(name, mat, radius, length, axis = 'y', opts = {}, sides = 10) {
  const positions = [], normals = [], indices = [];
  const point = (t, a, r = radius) => {
    const c = Math.cos(a) * r;
    const s = Math.sin(a) * r;
    if (axis === 'x') return [t * length / 2, c, s];
    if (axis === 'z') return [c, s, t * length / 2];
    return [c, t * length / 2, s];
  };
  const tip = point(1, 0, 0);
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const base0 = point(-1, a0);
    const base1 = point(-1, a1);
    const base = positions.length / 3;
    for (const p of [base0, tip, base1].map((v) => transformPoint(v, opts))) positions.push(p[0], p[1], p[2]);
    const n = transformNormal([0, 0.7, 0.7], opts);
    normals.push(...n, ...n, ...n);
    indices.push(base, base + 1, base + 2);
    const cb = positions.length / 3;
    for (const p of [[0, -length / 2, 0], base1, base0].map((v) => transformPoint(v, opts))) positions.push(p[0], p[1], p[2]);
    const cn = transformNormal(axis === 'x' ? [-1, 0, 0] : axis === 'z' ? [0, 0, -1] : [0, -1, 0], opts);
    normals.push(...cn, ...cn, ...cn);
    indices.push(cb, cb + 1, cb + 2);
  }
  return { name, mat, positions, normals, indices };
}

const shard = (name, mat, x, y, z, rz = 0, h = 0.42) => cone(name, mat, 0.07, h, 'y', { x, y, z, rz }, 8);

function wings(add, mat, y = 1.2, span = 0.9) {
  add(box('wing-l', mat, 0.08, span, 0.34, { x: -0.28, y, z: 0.42, rz: 0.38 }));
  add(box('wing-r', mat, 0.08, span, 0.34, { x: -0.28, y, z: -0.42, rz: 0.38 }));
}

// Shared accent flair on every holdout: a small ring of floating accent motes so
// each abstract kit reads as charged/animated regardless of its style.
function commonFlair() {
  const p = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    p.push(box(`flair-mote-${i}`, 'accent', 0.07, 0.07, 0.07, { x: Math.cos(a) * 0.48, y: 1.42 + (i % 2) * 0.22, z: Math.sin(a) * 0.48, rz: a }));
  }
  return p;
}

function partsFor(style) {
  const p = [];
  const add = (...parts) => p.push(...parts);
  switch (style) {
    case 'wisp':
      add(cylinder('core-halo-x', 'accent', 0.04, 0.95, 'x', { y: 1.2 }, 16));
      add(cylinder('core-halo-z', 'accent', 0.04, 0.95, 'z', { y: 1.2 }, 16));
      add(cylinder('core-halo-y', 'accent', 0.035, 0.78, 'y', { y: 1.2 }, 16));
      add(box('wisp-core', 'primary', 0.34, 0.34, 0.34, { y: 1.2, rz: Math.PI / 4 }));
      add(box('wisp-core-inner', 'accent', 0.16, 0.16, 0.16, { y: 1.2, rz: Math.PI / 4 }));
      for (let i = 0; i < 6; i++) add(box(`tether-${i}`, 'secondary', 0.08, 0.62, 0.05, { x: Math.cos(i) * 0.36, y: 0.7 + (i % 2) * 0.16, z: Math.sin(i) * 0.36, rz: i * 0.4 }));
      break;
    case 'void':
      add(box('void-core', 'dark', 0.5, 0.62, 0.5, { y: 1.1, rz: 0.45 }));
      add(cylinder('event-ring', 'accent', 0.035, 1.2, 'z', { y: 1.1 }, 18));
      add(cylinder('event-ring-x', 'accent', 0.03, 1.0, 'x', { y: 1.1, rz: 0.5 }, 18));
      add(box('singularity', 'accent', 0.18, 0.18, 0.18, { y: 1.1, rz: 0.45 }));
      for (let i = 0; i < 9; i++) add(shard(`star-${i}`, i % 2 ? 'accent' : 'primary', Math.cos(i) * 0.38, 1.15 + Math.sin(i * 1.7) * 0.28, Math.sin(i) * 0.38, i * 0.2, 0.22));
      break;
    case 'water':
      add(cylinder('wave-body', 'primary', 0.18, 1.0, 'y', { y: 0.72, rz: -0.35 }, 12));
      add(box('crest-wave', 'accent', 0.12, 0.66, 0.5, { x: 0.24, y: 1.32, rz: -0.45 }));
      add(box('ripple-l', 'secondary', 0.08, 0.78, 0.16, { x: -0.14, y: 0.56, z: 0.32, rz: 0.45 }));
      add(box('ripple-r', 'secondary', 0.08, 0.78, 0.16, { x: -0.14, y: 0.56, z: -0.32, rz: 0.45 }));
      for (let i = 0; i < 3; i++) add(cone(`droplet-${i}`, 'accent', 0.07, 0.2, 'y', { x: 0.3 + Math.cos(i) * 0.1, y: 1.6 + i * 0.16, z: (i - 1) * 0.18 }, 8));
      break;
    case 'nightmare':
      add(box('nightmare-eye', 'accent', 0.42, 0.22, 0.26, { x: 0.2, y: 1.35, rz: 0.1 }));
      add(box('nightmare-brow', 'dark', 0.46, 0.08, 0.3, { x: 0.18, y: 1.52, rz: 0.16 }));
      add(box('nightmare-pupil', 'dark', 0.12, 0.12, 0.12, { x: 0.34, y: 1.35 }));
      for (let i = 0; i < 6; i++) add(cylinder(`tentacle-${i}`, i % 2 ? 'primary' : 'secondary', 0.045, 0.95, 'y', { x: -0.18 + i * 0.08, y: 0.56, z: (i - 2.5) * 0.12, rz: (i - 2.5) * 0.2 }, 8));
      break;
    case 'ice-wraith':
      add(cylinder('wraith-spine', 'secondary', 0.08, 1.25, 'y', { y: 0.95 }, 10));
      for (let i = 0; i < 5; i++) add(shard(`ice-crown-${i}`, 'accent', 0.02, 1.72 + (i % 2) * 0.08, (i - 2) * 0.13, 0, 0.38));
      for (let i = 0; i < 4; i++) add(shard(`ice-rib-${i}`, 'primary', 0.18, 1.0 + i * 0.16, (i % 2 ? 0.2 : -0.2), (i % 2 ? 1.4 : -1.4), 0.3));
      add(box('ragged-tail', 'primary', 0.08, 0.72, 0.44, { x: -0.18, y: 0.45, rz: 0.2 }));
      break;
    case 'tormented':
      add(box('bone-torso', 'secondary', 0.32, 0.72, 0.32, { y: 1.0 }));
      add(cone('horn-l', 'accent', 0.07, 0.42, 'y', { y: 1.66, z: 0.18, rz: 0.4 }));
      add(cone('horn-r', 'accent', 0.07, 0.42, 'y', { y: 1.66, z: -0.18, rz: -0.4 }));
      add(cylinder('torment-halo', 'accent', 0.03, 0.95, 'y', { y: 1.78 }, 16));
      for (let i = 0; i < 6; i++) add(box(`arc-${i}`, 'accent', 0.08, 0.5, 0.05, { x: 0.32, y: 0.7 + i * 0.2, z: (i % 2 ? 0.28 : -0.28), rz: 0.6 }));
      break;
    case 'firebird':
      add(cone('beak-flame', 'accent', 0.08, 0.34, 'x', { x: 0.48, y: 1.45 }, 8));
      add(box('ember-body', 'primary', 0.5, 0.42, 0.38, { y: 1.08, rz: 0.2 }));
      wings(add, 'accent', 1.13, 1.05);
      wings(add, 'primary', 1.05, 0.7);
      for (let i = 0; i < 3; i++) add(shard(`tail-flame-${i}`, 'accent', -0.3, 0.44 + i * 0.12, (i - 1) * 0.16, -0.2, 0.5));
      add(cone('crest-flame', 'accent', 0.06, 0.3, 'y', { x: 0.18, y: 1.5, rz: -0.3 }, 8));
      break;
    case 'siren':
      add(cylinder('serpent-tail', 'primary', 0.18, 1.15, 'y', { y: 0.48, rz: 0.25 }, 12));
      add(cone('tail-fin', 'accent', 0.22, 0.4, 'y', { x: -0.2, y: 0.0, rz: 2.4 }, 8));
      add(box('head-fin-l', 'accent', 0.06, 0.42, 0.16, { y: 1.58, z: 0.24, rz: -0.3 }));
      add(box('head-fin-r', 'accent', 0.06, 0.42, 0.16, { y: 1.58, z: -0.24, rz: -0.3 }));
      add(cylinder('song-ring', 'secondary', 0.035, 0.85, 'z', { x: 0.28, y: 1.22 }, 16));
      add(cylinder('song-ring-2', 'accent', 0.03, 0.6, 'z', { x: 0.4, y: 1.22 }, 16));
      break;
    case 'gorgon':
      add(box('gorgon-bow', 'secondary', 0.1, 0.92, 0.08, { x: 0.36, y: 1.0, rz: 0.2 }));
      add(box('bow-string', 'accent', 0.02, 0.88, 0.02, { x: 0.3, y: 1.0, rz: 0.2 }));
      for (let i = 0; i < 9; i++) add(cylinder(`snake-${i}`, i % 2 ? 'primary' : 'accent', 0.035, 0.5, 'y', { x: 0.02, y: 1.66, z: (i - 4) * 0.08, rz: (i - 4) * 0.16 }, 8));
      add(box('stone-gaze', 'accent', 0.28, 0.08, 0.24, { x: 0.25, y: 1.5 }));
      break;
    case 'bat-rider':
      wings(add, 'secondary', 1.0, 0.86);
      add(box('wing-strut-l', 'dark', 0.04, 0.7, 0.04, { x: -0.28, y: 1.0, z: 0.5, rz: 0.5 }));
      add(box('wing-strut-r', 'dark', 0.04, 0.7, 0.04, { x: -0.28, y: 1.0, z: -0.5, rz: 0.5 }));
      add(cylinder('torch', 'dark', 0.035, 0.65, 'y', { x: 0.42, y: 0.92 }, 8));
      add(cone('torch-flame', 'accent', 0.1, 0.3, 'y', { x: 0.42, y: 1.34 }, 8));
      add(box('saddle', 'primary', 0.42, 0.16, 0.42, { y: 0.9 }));
      add(box('reins', 'accent', 0.02, 0.02, 0.5, { x: 0.32, y: 1.0 }));
      break;
    case 'bear-druid':
      add(box('fur-hood', 'primary', 0.44, 0.34, 0.38, { y: 1.48 }));
      add(box('snout', 'secondary', 0.22, 0.16, 0.18, { x: 0.22, y: 1.42 }));
      add(cone('ear-l', 'secondary', 0.07, 0.18, 'y', { y: 1.78, z: 0.17 }, 8));
      add(cone('ear-r', 'secondary', 0.07, 0.18, 'y', { y: 1.78, z: -0.17 }, 8));
      add(box('shoulder-fur', 'primary', 0.5, 0.22, 0.5, { y: 1.18 }));
      add(box('bear-paw-l', 'accent', 0.24, 0.12, 0.16, { x: 0.24, y: 1.03, z: 0.28 }));
      add(box('bear-paw-r', 'accent', 0.24, 0.12, 0.16, { x: 0.24, y: 1.03, z: -0.28 }));
      for (const dz of [0.34, 0.22]) add(shard('claw', 'accent', 0.36, 0.98, dz, 1.6, 0.12));
      break;
  }
  return [...p, ...commonFlair()];
}

function replacementBase(style) {
  switch (style) {
    case 'wisp':
    case 'void':
      return [];
    case 'water':
    case 'siren':
      return [
        box('replacement-torso', 'secondary', 0.24, 0.52, 0.28, { y: 1.06 }),
        box('replacement-shoulders', 'primary', 0.18, 0.18, 0.72, { y: 1.28 })
      ];
    case 'firebird':
      return [
        box('replacement-neck', 'primary', 0.18, 0.34, 0.16, { x: 0.24, y: 1.34, rz: -0.24 }),
        box('replacement-tail-root', 'dark', 0.26, 0.2, 0.24, { x: -0.28, y: 0.78 })
      ];
    case 'bat-rider':
      return [
        box('replacement-bat-body', 'dark', 0.56, 0.34, 0.34, { y: 0.9 }),
        cone('replacement-bat-head', 'secondary', 0.14, 0.28, 'x', { x: 0.42, y: 1.06 }, 8)
      ];
    case 'gorgon':
      return [
        box('replacement-torso', 'primary', 0.34, 0.66, 0.32, { y: 0.98 }),
        cylinder('replacement-serpent-tail', 'secondary', 0.14, 0.9, 'y', { y: 0.34, rz: 0.24 }, 12)
      ];
    case 'bear-druid':
      return [
        box('replacement-robed-body', 'secondary', 0.36, 0.86, 0.34, { y: 0.85 }),
        box('replacement-cloak-back', 'dark', 0.08, 0.92, 0.58, { x: -0.24, y: 0.86 })
      ];
    case 'nightmare':
      return [
        box('replacement-nightmare-body', 'dark', 0.34, 0.68, 0.36, { y: 0.95 }),
        box('replacement-shoulder-eye', 'primary', 0.18, 0.18, 0.62, { y: 1.2 })
      ];
    case 'ice-wraith':
      return [
        box('replacement-ghost-core', 'primary', 0.24, 0.72, 0.26, { y: 0.82 }),
        box('replacement-ghost-shroud', 'secondary', 0.08, 0.9, 0.58, { x: -0.18, y: 0.76 })
      ];
    case 'tormented':
      return [
        box('replacement-torso', 'dark', 0.34, 0.82, 0.34, { y: 0.92 }),
        box('replacement-shoulders', 'secondary', 0.2, 0.16, 0.7, { y: 1.32 })
      ];
    default:
      return [box('replacement-core', 'primary', 0.34, 0.72, 0.34, { y: 0.9 })];
  }
}

function replacementPartsFor(style) {
  return [...replacementBase(style), ...partsFor(style)];
}

function bounds(values) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < values.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], values[i + k]);
      max[k] = Math.max(max[k], values[i + k]);
    }
  }
  return { min, max };
}

function addAccessor(json, chunks, array, type, target, minMax) {
  const raw = Buffer.from(array.buffer);
  const offset = chunks.reduce((sum, b) => sum + b.length, 0);
  chunks.push(Buffer.concat([raw, Buffer.alloc(align4(raw.length) - raw.length)]));
  const view = json.bufferViews.length;
  const bufferView = { buffer: 0, byteOffset: offset, byteLength: raw.length };
  if (target) bufferView.target = target;
  json.bufferViews.push(bufferView);
  const accessor = json.accessors.length;
  json.accessors.push({
    bufferView: view,
    componentType: 5126,
    count: array.length / (type === 'VEC4' ? 4 : type === 'VEC3' ? 3 : 1),
    type,
    ...(minMax ?? {})
  });
  return accessor;
}

function addAnimationClip(json, chunks, rigNode, name, frames) {
  const times = new Float32Array(frames.map((f) => f.t));
  const timeAccessor = addAccessor(json, chunks, times, 'SCALAR', undefined, {
    min: [frames[0].t],
    max: [frames[frames.length - 1].t]
  });
  const samplers = [];
  const channels = [];
  const addChannel = (pathName, values, type) => {
    const out = new Float32Array(values.flat());
    const output = addAccessor(json, chunks, out, type);
    const sampler = samplers.length;
    samplers.push({ input: timeAccessor, output, interpolation: 'LINEAR' });
    channels.push({ sampler, target: { node: rigNode, path: pathName } });
  };
  addChannel('translation', frames.map((f) => f.translation ?? [0, 0, 0]), 'VEC3');
  addChannel('rotation', frames.map((f) => f.rotation ?? quatFromEuler()), 'VEC4');
  if (frames.some((f) => f.scale)) addChannel('scale', frames.map((f) => f.scale ?? [1, 1, 1]), 'VEC3');
  json.animations.push({ name, samplers, channels });
}

function addHoldoutAnimations(json, chunks, rigNode) {
  addAnimationClip(json, chunks, rigNode, 'idle', [
    { t: 0, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, -0.025) },
    { t: 0.8, translation: [0, 0.07, 0], rotation: quatFromEuler(0, 0, 0.025) },
    { t: 1.6, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, -0.025) }
  ]);
  addAnimationClip(json, chunks, rigNode, 'run', [
    { t: 0, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, -0.08) },
    { t: 0.25, translation: [0.04, 0.1, 0], rotation: quatFromEuler(0, 0, 0.08) },
    { t: 0.5, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, -0.08) }
  ]);
  addAnimationClip(json, chunks, rigNode, 'attack', [
    { t: 0, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, 0), scale: [1, 1, 1] },
    { t: 0.16, translation: [0.14, 0.02, 0], rotation: quatFromEuler(0, 0, -0.24), scale: [1.08, 0.96, 1.08] },
    { t: 0.34, translation: [-0.03, 0, 0], rotation: quatFromEuler(0, 0, 0.08), scale: [1, 1, 1] }
  ]);
  addAnimationClip(json, chunks, rigNode, 'cast', [
    { t: 0, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, 0), scale: [1, 1, 1] },
    { t: 0.35, translation: [0, 0.16, 0], rotation: quatFromEuler(0, 0.18, 0), scale: [1.12, 1.12, 1.12] },
    { t: 0.7, translation: [0, 0.03, 0], rotation: quatFromEuler(0, 0, 0), scale: [1, 1, 1] }
  ]);
  addAnimationClip(json, chunks, rigNode, 'channel', [
    { t: 0, translation: [0, 0.02, 0], rotation: quatFromEuler(0, 0, -0.04), scale: [1.02, 1.02, 1.02] },
    { t: 0.5, translation: [0, 0.14, 0], rotation: quatFromEuler(0, 0.28, 0.04), scale: [1.1, 1.1, 1.1] },
    { t: 1, translation: [0, 0.02, 0], rotation: quatFromEuler(0, 0, -0.04), scale: [1.02, 1.02, 1.02] }
  ]);
  addAnimationClip(json, chunks, rigNode, 'death', [
    { t: 0, translation: [0, 0, 0], rotation: quatFromEuler(0, 0, 0), scale: [1, 1, 1] },
    { t: 0.45, translation: [-0.08, -0.16, 0], rotation: quatFromEuler(0, 0, 0.55), scale: [0.9, 0.62, 0.9] },
    { t: 0.9, translation: [-0.08, -0.34, 0], rotation: quatFromEuler(0, 0, 1.08), scale: [0.72, 0.32, 0.72] }
  ]);
}

function writeGlb(file, heroId, palette, parts, opts = {}) {
  const json = {
    asset: { version: '2.0', generator: 'ancients generate_holdout_signatures.mjs' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: MATERIALS.map((role) => {
      const color = role === 'primary' ? palette[0] : role === 'secondary' ? palette[1] : role === 'accent' ? palette[2] : '#101018';
      return {
        name: role,
        pbrMetallicRoughness: {
          baseColorFactor: hexToLinearFactor(color),
          metallicFactor: role === 'secondary' ? 0.3 : role === 'accent' ? 0.2 : 0.05,
          roughnessFactor: role === 'accent' ? 0.36 : 0.72
        },
        emissiveFactor: role === 'accent' ? hexToLinearFactor(color).slice(0, 3).map((v) => v * 0.3) : [0, 0, 0]
      };
    }),
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    accessors: [],
    animations: []
  };
  const chunks = [];
  const pushTyped = (array, target) => {
    const raw = Buffer.from(array.buffer);
    const offset = chunks.reduce((sum, b) => sum + b.length, 0);
    chunks.push(Buffer.concat([raw, Buffer.alloc(align4(raw.length) - raw.length)]));
    const view = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: raw.length, target });
    return view;
  };
  const rigNode = opts.animated ? json.nodes.length : null;
  if (rigNode !== null) {
    json.nodes.push({ name: `${heroId}-replacement-rig`, children: [] });
    json.scenes[0].nodes.push(rigNode);
  }
  for (const part of parts) {
    const pos = new Float32Array(part.positions);
    const nor = new Float32Array(part.normals);
    const idx = new Uint16Array(part.indices);
    const posView = pushTyped(pos, 34962);
    const norView = pushTyped(nor, 34962);
    const idxView = pushTyped(idx, 34963);
    const posAccessor = json.accessors.length;
    json.accessors.push({ bufferView: posView, componentType: 5126, count: pos.length / 3, type: 'VEC3', ...bounds(part.positions) });
    const norAccessor = json.accessors.length;
    json.accessors.push({ bufferView: norView, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
    const idxAccessor = json.accessors.length;
    json.accessors.push({ bufferView: idxView, componentType: 5123, count: idx.length, type: 'SCALAR' });
    const mesh = json.meshes.length;
    json.meshes.push({
      name: `${heroId}-${part.name}`,
      primitives: [{ attributes: { POSITION: posAccessor, NORMAL: norAccessor }, indices: idxAccessor, material: MATERIALS.indexOf(part.mat), mode: 4 }]
    });
    const node = json.nodes.length;
    json.nodes.push({ name: `${heroId}-${part.name}`, mesh });
    if (rigNode !== null) json.nodes[rigNode].children.push(node);
    else json.scenes[0].nodes.push(node);
  }
  if (rigNode !== null) addHoldoutAnimations(json, chunks, rigNode);
  if (json.animations.length === 0) delete json.animations;
  const bin = Buffer.concat(chunks);
  json.buffers[0].byteLength = bin.length;
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc(align4(bin.length) - bin.length)]);
  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(0x46546c67, o); o += 4;
  out.writeUInt32LE(2, o); o += 4;
  out.writeUInt32LE(total, o); o += 4;
  out.writeUInt32LE(jsonPadded.length, o); o += 4;
  out.writeUInt32LE(0x4e4f534a, o); o += 4;
  jsonPadded.copy(out, o); o += jsonPadded.length;
  out.writeUInt32LE(binPadded.length, o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4;
  binPadded.copy(out, o);
  fs.writeFileSync(file, out);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(REPLACEMENT_DIR, { recursive: true });
  let signatures = 0;
  let replacements = 0;
  for (const [heroId, def] of Object.entries(HOLDOUTS)) {
    writeGlb(path.join(OUT_DIR, `${heroId}.glb`), heroId, def.palette, partsFor(def.style));
    signatures++;
    writeGlb(
      path.join(REPLACEMENT_DIR, `${heroId}.glb`),
      heroId,
      def.palette,
      replacementPartsFor(def.style),
      { animated: true }
    );
    replacements++;
  }
  console.log(`generated ${signatures} holdout signature GLBs in ${path.relative(ROOT, OUT_DIR)}`);
  console.log(`generated ${replacements} holdout replacement GLBs in ${path.relative(ROOT, REPLACEMENT_DIR)}`);
}

main();
