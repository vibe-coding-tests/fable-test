import * as THREE from 'three';
import { Rng, hashString } from '../core/rng';
import type { RegionDef } from '../core/types';
import { WORLD_SCALE } from './scale';
import { loadTex, loadModel, instancedFromModel } from './asset-loaders';

// ------------------------------------------------------------------
// Procedural low-poly terrain: vertex-jittered plane, painted height
// bands, scattered trees/rocks as instanced meshes (SPEC §3).
// Heights are gentle: gameplay treats the world as 2D with visual relief.
// ------------------------------------------------------------------

export interface TerrainInfo {
  group: THREE.Group;
  heightAt(simX: number, simY: number): number; // world-units height
  obstacles: { pos: { x: number; y: number }; radius: number }[];
  setStaticPropShadows?(enabled: boolean): void;
  /** Advances animated materials (water ripples). No-op when none. */
  update?(time: number): void;
}

type SceneLiveCheck = () => boolean;
interface TerrainBuildOptions {
  staticPropShadows?: boolean;
}

function markStaticShadowCaster(obj: THREE.Object3D, enabled: boolean): void {
  obj.userData.staticPropCaster = true;
  const mesh = obj as THREE.Mesh;
  if (mesh.isMesh) mesh.castShadow = enabled;
}

// Generated grayscale ground-detail texture (GRAPHICS_SPEC §5.1): mostly white
// so it barely darkens the painted height bands, with sparse speckle + soft
// blotches for a hand-painted read. Browser-only; null under node tests.
function makeGroundDetail(rng: Rng): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = 232 + rng.next() * 23; // 232..255, subtle grain
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let b = 0; b < 80; b++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = 6 + rng.next() * 46;
    const dark = rng.next() < 0.55;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, dark ? 'rgba(70,66,56,0.22)' : 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function valueNoise(rng: Rng, gridN: number): number[][] {
  const g: number[][] = [];
  for (let i = 0; i <= gridN; i++) {
    g.push([]);
    for (let j = 0; j <= gridN; j++) g[i].push(rng.next());
  }
  return g;
}

function sampleNoise(grid: number[][], u: number, v: number): number {
  const n = grid.length - 1;
  const x = Math.min(n - 1e-6, Math.max(0, u * n));
  const y = Math.min(n - 1e-6, Math.max(0, v * n));
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = grid[i][j];
  const b = grid[i + 1][j];
  const c = grid[i][j + 1];
  const d = grid[i + 1][j + 1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

type BiomePalette = { low: number; mid: number; high: number; tree: number; trunk: number; rock: number };
type TerrainEdgeHeights = { south: number[]; east: number[]; north: number[]; west: number[] };

const BIOME_COLORS: Record<string, BiomePalette> = {
  grass: { low: 0x4a7c3a, mid: 0x5c9447, high: 0x7daf5e, tree: 0x3e7a34, trunk: 0x6b4a2c, rock: 0x8d8d99 },
  snow: { low: 0xc8d8e8, mid: 0xe8f0f8, high: 0xffffff, tree: 0x4a6b5c, trunk: 0x52404a, rock: 0x9aa6b8 },
  desert: { low: 0xc8a05c, mid: 0xd8b06c, high: 0xe8c87c, tree: 0x7a8a3a, trunk: 0x8a6a3a, rock: 0xa08a6a },
  wasteland: { low: 0x5a4a4a, mid: 0x6b5a52, high: 0x7c6a5e, tree: 0x4a3a3a, trunk: 0x3a2a2a, rock: 0x6a5a5a },
  coast: { low: 0x5c9447, mid: 0x7daf5e, high: 0xc8b87c, tree: 0x3e7a34, trunk: 0x6b4a2c, rock: 0x8d8d99 },
  forest: { low: 0x2e5c28, mid: 0x3e7a34, high: 0x5c9447, tree: 0x2a5224, trunk: 0x52402c, rock: 0x7d7d89 }
};

// Phase 1 (GRAPHICS_SPEC §13): ground each biome with a real ambientCG PBR
// surface (CC0) when the files are present. Maps are loaded async and best-
// effort, so the vertex-painted material below is always the live fallback.
const TERRAIN_PBR_SET: Record<string, string> = {
  grass: 'Grass001',
  forest: 'Grass001',
  coast: 'Grass001',
  snow: 'Snow010A',
  desert: 'Ground080',
  wasteland: 'Ground048'
};

function applyTerrainPBR(mat: THREE.MeshStandardMaterial, biome: string, repeat: number, isLive: SceneLiveCheck): void {
  const set = TERRAIN_PBR_SET[biome] ?? TERRAIN_PBR_SET.grass;
  const base = `/assets/textures/terrain/${set}`;
  void Promise.all([
    loadTex(`${base}_Color.jpg`, { srgb: true, repeat }),
    loadTex(`${base}_NormalGL.jpg`, { repeat }),
    loadTex(`${base}_Roughness.jpg`, { repeat })
  ]).then(([color, normal, rough]) => {
    if (!isLive()) return;
    if (!color && !normal && !rough) return; // headless / all failed: keep the painted floor
    if (color) mat.map = color;
    if (normal) {
      mat.normalMap = normal;
      mat.normalScale = new THREE.Vector2(0.7, 0.7);
    }
    if (rough) {
      mat.roughnessMap = rough;
      mat.roughness = 1;
    }
    mat.flatShading = false; // smooth base normals so the normal map reads cleanly
    mat.needsUpdate = true;
  });
}

function buildTerrainEdge(sizeW: number, edgeHeights: TerrainEdgeHeights, colors: BiomePalette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'terrain-edge';

  const positions: number[] = [];
  const indices: number[] = [];
  const bottomY = -2.4;
  const rimLift = 0.08;
  const seg = edgeHeights.south.length - 1;
  const step = sizeW / seg;

  const addQuad = (
    topA: [number, number, number],
    bottomA: [number, number, number],
    topB: [number, number, number],
    bottomB: [number, number, number]
  ): void => {
    const base = positions.length / 3;
    positions.push(...topA, ...bottomA, ...topB, ...bottomB);
    indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
  };

  for (let i = 0; i < seg; i++) {
    const a = i * step;
    const b = (i + 1) * step;
    addQuad([a, edgeHeights.south[i], 0], [a, bottomY, 0], [b, edgeHeights.south[i + 1], 0], [b, bottomY, 0]);
    addQuad([sizeW, edgeHeights.east[i], a], [sizeW, bottomY, a], [sizeW, edgeHeights.east[i + 1], b], [sizeW, bottomY, b]);
    addQuad([b, edgeHeights.north[i + 1], sizeW], [b, bottomY, sizeW], [a, edgeHeights.north[i], sizeW], [a, bottomY, sizeW]);
    addQuad([0, edgeHeights.west[i + 1], b], [0, bottomY, b], [0, edgeHeights.west[i], a], [0, bottomY, a]);
  }

  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  wallGeo.setIndex(indices);
  wallGeo.computeVertexNormals();
  const wallColor = new THREE.Color(colors.low).lerp(new THREE.Color(0x24313a), 0.45);
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.98,
    metalness: 0.01,
    flatShading: true,
    side: THREE.DoubleSide
  }));
  wall.receiveShadow = true;
  group.add(wall);

  const rimPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= seg; i++) rimPoints.push(new THREE.Vector3(i * step, edgeHeights.south[i] + rimLift, 0));
  for (let i = 1; i <= seg; i++) rimPoints.push(new THREE.Vector3(sizeW, edgeHeights.east[i] + rimLift, i * step));
  for (let i = seg - 1; i >= 0; i--) rimPoints.push(new THREE.Vector3(i * step, edgeHeights.north[i] + rimLift, sizeW));
  for (let i = seg - 1; i > 0; i--) rimPoints.push(new THREE.Vector3(0, edgeHeights.west[i] + rimLift, i * step));
  rimPoints.push(rimPoints[0].clone());
  const rimColor = new THREE.Color(colors.high).lerp(new THREE.Color(0xffffff), 0.25);
  const rim = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPoints), new THREE.LineBasicMaterial({
    color: rimColor,
    transparent: true,
    opacity: 0.6,
    depthWrite: false
  }));
  rim.renderOrder = 2;
  group.add(rim);

  return group;
}

// Phase 2 (GRAPHICS_SPEC §13): authored Quaternius foliage/props + buildings
// (CC0). Loaded async; the instanced primitives / box huts stay live until the
// GLBs arrive, so no-asset and headless runs keep the procedural silhouette.
const FOLIAGE_BASE = '/assets/props/foliage';
const TOWN_BASE = '/assets/props/town';

const TREE_MODELS: Record<string, string[]> = {
  grass: ['oak_1', 'oak_2', 'pine_1'],
  forest: ['oak_1', 'oak_2', 'oak_4', 'pine_1', 'pine_2'],
  coast: ['oak_1', 'pine_1'],
  snow: ['pine_2', 'pine_4'],
  desert: ['oak_4'],
  wasteland: ['oak_4', 'pine_4']
};
const ROCK_MODELS = ['rock_1', 'rock_2', 'rock_3'];
const TOWN_BUILDINGS = ['house_1', 'house_2', 'house_3', 'inn', 'blacksmith'];

function modelUrls(base: string, names: string[]): string[] {
  return names.map((n) => `${base}/${n}.glb`);
}

/** Clone an authored scene, seat its base at y=0, and scale it to `targetHeight`. */
function normalizedClone(scene: THREE.Object3D, targetHeight: number): THREE.Group {
  const clone = scene.clone(true) as THREE.Group;
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const k = targetHeight / (size.y || 1);
  clone.scale.setScalar(k);
  clone.position.y = -box.min.y * k;
  clone.updateMatrixWorld(true);
  return clone;
}

/** Once authored GLBs load, instance them across the placements and hide the fallback. */
function swapToInstancedModels(
  group: THREE.Group,
  fallback: THREE.Object3D[],
  urls: string[],
  matrices: THREE.Matrix4[],
  targetHeight: number,
  isLive: SceneLiveCheck,
  staticPropShadows: boolean
): void {
  if (!matrices.length || !urls.length) return;
  void Promise.all(urls.map((u) => loadModel(u))).then((scenes) => {
    if (!isLive()) return;
    const loaded = scenes.filter((s): s is THREE.Group => !!s);
    if (!loaded.length) return; // keep the procedural fallback
    const models = loaded.map((s) => normalizedClone(s, targetHeight));
    const buckets: THREE.Matrix4[][] = models.map(() => []);
    matrices.forEach((m, i) => buckets[i % models.length].push(m));
    models.forEach((model, idx) => {
      if (!buckets[idx].length) return;
      for (const inst of instancedFromModel(model, buckets[idx])) {
        markStaticShadowCaster(inst, staticPropShadows);
        group.add(inst);
      }
    });
    for (const f of fallback) f.visible = false;
  });
}

/** Once building GLBs load, place a varied one per hut slot and hide the box huts. */
function swapTownBuildings(
  g: THREE.Group,
  fallback: THREE.Object3D[],
  placements: { x: number; z: number; baseY: number; rotY: number }[],
  isLive: SceneLiveCheck,
  staticPropShadows: boolean
): void {
  if (!placements.length) return;
  void Promise.all(modelUrls(TOWN_BASE, TOWN_BUILDINGS).map((u) => loadModel(u))).then((scenes) => {
    if (!isLive()) return;
    const loaded = scenes.filter((s): s is THREE.Group => !!s);
    if (!loaded.length) return;
    placements.forEach((p, i) => {
      const b = normalizedClone(loaded[i % loaded.length], 3.6);
      b.position.x = p.x;
      b.position.z = p.z;
      b.position.y += p.baseY;
      b.rotation.y = p.rotY;
      b.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          markStaticShadowCaster(m, staticPropShadows);
          m.receiveShadow = true;
        }
      });
      g.add(b);
    });
    for (const f of fallback) f.visible = false;
  });
}

export function buildTerrain(region: RegionDef, isLive: SceneLiveCheck = () => true, opts: TerrainBuildOptions = {}): TerrainInfo {
  const group = new THREE.Group();
  const staticPropShadows = opts.staticPropShadows ?? true;
  const sizeW = region.size / WORLD_SCALE;
  const rng = new Rng(region.seed ^ hashString(region.id));
  const noise = valueNoise(rng, 10);
  const colors = BIOME_COLORS[region.biome] ?? BIOME_COLORS.grass;

  const heightAtUV = (u: number, v: number): number => {
    const base = sampleNoise(noise, u, v);
    // flatten near town
    const tx = region.town.pos.x / region.size;
    const ty = region.town.pos.y / region.size;
    const dTown = Math.hypot(u - tx, v - ty) * region.size;
    const townFlat = Math.min(1, Math.max(0, (dTown - region.town.radius) / 1200));
    return base * 4.2 * townFlat;
  };

  // ground mesh
  const seg = 96;
  const geo = new THREE.PlaneGeometry(sizeW, sizeW, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const heightSamples = new Float32Array((seg + 1) * (seg + 1));
  const colorArr: number[] = [];
  const cLow = new THREE.Color(colors.low);
  const cMid = new THREE.Color(colors.mid);
  const cHigh = new THREE.Color(colors.high);
  const WHITE_TINT = new THREE.Color(0xffffff);
  const jitter = new Rng(region.seed + 77);
  const edgeHeights: TerrainEdgeHeights = {
    south: new Array<number>(seg + 1).fill(0),
    east: new Array<number>(seg + 1).fill(0),
    north: new Array<number>(seg + 1).fill(0),
    west: new Array<number>(seg + 1).fill(0)
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + sizeW / 2;
    const z = pos.getZ(i) + sizeW / 2;
    const u = x / sizeW;
    const v = z / sizeW;
    let h = heightAtUV(u, v);
    // low-poly jitter
    h += (jitter.next() - 0.5) * 0.35;
    pos.setY(i, h);
    const ix = Math.max(0, Math.min(seg, Math.round(u * seg)));
    const iz = Math.max(0, Math.min(seg, Math.round(v * seg)));
    heightSamples[iz * (seg + 1) + ix] = h;
    if (iz === 0) edgeHeights.south[ix] = h;
    if (iz === seg) edgeHeights.north[ix] = h;
    if (ix === 0) edgeHeights.west[iz] = h;
    if (ix === seg) edgeHeights.east[iz] = h;
    const t = Math.min(1, h / 4.2);
    const c = t < 0.45 ? cLow.clone().lerp(cMid, t / 0.45) : cMid.clone().lerp(cHigh, (t - 0.45) / 0.55);
    // Ease the painted band toward neutral so the photographic albedo map (when
    // present) reads through the vertex tint instead of double-saturating it. The
    // CC0 grass/ground albedos are fairly dark, so bias a bit further toward white
    // to keep the lit ground from reading near-black at gameplay zoom.
    c.lerp(WHITE_TINT, 0.32);
    // subtle patchiness
    const shade = 0.92 + jitter.next() * 0.16;
    colorArr.push(c.r * shade, c.g * shade, c.b * shade);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colorArr, 3));
  geo.computeVertexNormals();
  const detail = makeGroundDetail(new Rng(region.seed + 999));
  if (detail) detail.repeat.set(26, 26);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.96,
    metalness: 0.02,
    envMapIntensity: 0.5,
    map: detail ?? null
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.position.set(sizeW / 2, 0, sizeW / 2);
  ground.receiveShadow = true;
  group.add(ground);
  group.add(buildTerrainEdge(sizeW, edgeHeights, colors));
  applyTerrainPBR(mat, region.biome, Math.max(8, Math.round(sizeW / 8)), isLive);

  // Animated shader water ring outside the playfield (GRAPHICS_SPEC §5.4):
  // summed sines ripple the surface and paint deeper troughs / foamy crests.
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x123247) },
      uShallow: { value: new THREE.Color(0x3f86a8) },
      uFoam: { value: new THREE.Color(0x9fd8e8) },
      // Optional tiling normal map (VFX_ASSETS WS-G). uHasNormal stays 0 until
      // the texture loads, so the procedural summed-sine ripple is the floor.
      uNormal: { value: null as THREE.Texture | null },
      uHasNormal: { value: 0 }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying float vWave;
      varying vec2 vUv;
      void main() {
        float w = sin(position.x * 0.55 + uTime * 1.3) * 0.18
                + sin(position.y * 0.5 - uTime * 1.05) * 0.15
                + sin((position.x + position.y) * 0.3 + uTime * 0.7) * 0.11;
        vWave = w;
        vUv = uv;
        vec3 p = position;
        p.z += w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep, uShallow, uFoam;
      uniform sampler2D uNormal;
      uniform float uHasNormal;
      uniform float uTime;
      varying float vWave;
      varying vec2 vUv;
      void main() {
        float t = clamp(vWave * 2.2 + 0.5, 0.0, 1.0);
        vec3 col = mix(uDeep, uShallow, t);
        col = mix(col, uFoam, smoothstep(0.2, 0.3, vWave));
        if (uHasNormal > 0.5) {
          // Two scrolling samples of the tiling normal break up the surface and
          // add a moving specular sparkle the pure sine ripple can't.
          vec2 uv = vUv * 9.0;
          vec3 n1 = texture2D(uNormal, uv + vec2(uTime * 0.013, uTime * 0.008)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uNormal, uv * 1.7 - vec2(uTime * 0.009, uTime * 0.011)).xyz * 2.0 - 1.0;
          vec3 n = normalize(n1 + n2);
          float spec = pow(clamp(n.z, 0.0, 1.0), 6.0);
          col += uFoam * spec * 0.35;
        }
        gl_FragColor = vec4(col, 0.94);
      }
    `
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(sizeW * 3, sizeW * 3, 90, 90), waterMat);
  water.rotateX(-Math.PI / 2);
  water.position.set(sizeW / 2, -1.2, sizeW / 2);
  group.add(water);
  void loadTex('/assets/textures/water/water_normal.webp', { repeat: 1 }).then((tex) => {
    if (!tex || !isLive()) return;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    waterMat.uniforms.uNormal.value = tex;
    waterMat.uniforms.uHasNormal.value = 1;
  });

  const heightAt = (simX: number, simY: number): number => {
    const u = simX / region.size;
    const v = simY / region.size;
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const gx = Math.max(0, Math.min(seg, u * seg));
    const gz = Math.max(0, Math.min(seg, v * seg));
    const ix = Math.min(seg - 1, Math.floor(gx));
    const iz = Math.min(seg - 1, Math.floor(gz));
    const fx = gx - ix;
    const fz = gz - iz;
    const h00 = heightSamples[iz * (seg + 1) + ix];
    const h10 = heightSamples[iz * (seg + 1) + ix + 1];
    const h01 = heightSamples[(iz + 1) * (seg + 1) + ix];
    const h11 = heightSamples[(iz + 1) * (seg + 1) + ix + 1];
    const hx0 = h00 + (h10 - h00) * fx;
    const hx1 = h01 + (h11 - h01) * fx;
    return hx0 + (hx1 - hx0) * fz;
  };

  // scatter props (deterministic), keeping clearings around town/shrine/camps/spawns
  const obstacles: { pos: { x: number; y: number }; radius: number }[] = [];
  const clearings: { x: number; y: number; r: number }[] = [
    { x: region.town.pos.x, y: region.town.pos.y, r: region.town.radius + 250 },
    ...region.camps.map((c) => ({ x: c.pos.x, y: c.pos.y, r: c.radius + 320 })),
    ...region.heroSpawns.map((h) => ({ x: h.pos.x, y: h.pos.y, r: 420 })),
    ...(region.dungeons ?? []).map((d) => ({ x: d.pos.x, y: d.pos.y, r: d.radius + 260 }))
  ];
  const isClear = (x: number, y: number) => clearings.every((c) => Math.hypot(x - c.x, y - c.y) > c.r);

  const propRng = new Rng(region.seed + 1234);
  const treeCount = Math.floor(220 * region.props.treeDensity);
  const rockCount = Math.floor(90 * region.props.rockDensity);

  // trees: instanced cone + trunk
  const treeGeo = new THREE.ConeGeometry(0.95, 2.6, 6);
  const treeMat = new THREE.MeshStandardMaterial({ color: colors.tree, flatShading: true, roughness: 0.85, metalness: 0.02 });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.0, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: colors.trunk, flatShading: true, roughness: 0.9, metalness: 0.02 });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const m4 = new THREE.Matrix4();
  const yUp = new THREE.Vector3(0, 1, 0);
  // Feet-based transforms reused to instance authored GLB props (Phase 2) over
  // the same deterministic placements once the models load.
  const treeMatrices: THREE.Matrix4[] = [];
  let placedTrees = 0;
  for (let i = 0; i < treeCount * 4 && placedTrees < treeCount; i++) {
    const x = propRng.range(400, region.size - 400);
    const y = propRng.range(400, region.size - 400);
    if (!isClear(x, y)) continue;
    const s = propRng.range(0.8, 1.7);
    const h = heightAt(x, y);
    const wx = x / WORLD_SCALE;
    const wz = y / WORLD_SCALE;
    const qY = new THREE.Quaternion().setFromAxisAngle(yUp, propRng.range(0, Math.PI * 2));
    m4.compose(new THREE.Vector3(wx, h + 1.3 * s + 0.7, wz), qY, new THREE.Vector3(s, s, s));
    trees.setMatrixAt(placedTrees, m4);
    m4.compose(new THREE.Vector3(wx, h + 0.5, wz), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(placedTrees, m4);
    treeMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(wx, h, wz), qY, new THREE.Vector3(s, s, s)));
    obstacles.push({ pos: { x, y }, radius: 55 * s });
    placedTrees++;
  }
  trees.count = placedTrees;
  trunks.count = placedTrees;
  markStaticShadowCaster(trees, staticPropShadows);
  group.add(trees);
  group.add(trunks);
  swapToInstancedModels(group, [trees, trunks], modelUrls(FOLIAGE_BASE, TREE_MODELS[region.biome] ?? TREE_MODELS.grass), treeMatrices, 4.6, isLive, staticPropShadows);

  // rocks
  const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: colors.rock, flatShading: true, roughness: 0.7, metalness: 0.08 });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  const rockMatrices: THREE.Matrix4[] = [];
  let placedRocks = 0;
  for (let i = 0; i < rockCount * 4 && placedRocks < rockCount; i++) {
    const x = propRng.range(400, region.size - 400);
    const y = propRng.range(400, region.size - 400);
    if (!isClear(x, y)) continue;
    const s = propRng.range(0.6, 2.2);
    const qR = new THREE.Quaternion().setFromEuler(new THREE.Euler(propRng.range(0, 1), propRng.range(0, Math.PI * 2), propRng.range(0, 1)));
    m4.compose(new THREE.Vector3(x / WORLD_SCALE, heightAt(x, y) + 0.3 * s, y / WORLD_SCALE), qR, new THREE.Vector3(s, s * 0.8, s));
    rocks.setMatrixAt(placedRocks, m4);
    rockMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(x / WORLD_SCALE, heightAt(x, y), y / WORLD_SCALE), qR, new THREE.Vector3(s, s, s)));
    obstacles.push({ pos: { x, y }, radius: 60 * s });
    placedRocks++;
  }
  rocks.count = placedRocks;
  markStaticShadowCaster(rocks, staticPropShadows);
  group.add(rocks);
  swapToInstancedModels(group, [rocks], modelUrls(FOLIAGE_BASE, ROCK_MODELS), rockMatrices, 1.5, isLive, staticPropShadows);

  // town: stone circle + simple huts + shrine crystal
  const town = buildTown(region, heightAt, isLive, staticPropShadows);
  group.add(town);

  const dungeonPortals = buildDungeonPortals(region, heightAt, staticPropShadows);
  group.add(dungeonPortals);

  return {
    group,
    heightAt,
    obstacles,
    setStaticPropShadows: (enabled: boolean) => {
      group.traverse((obj) => {
        if (!obj.userData.staticPropCaster) return;
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = enabled;
      });
    },
    update: (time: number) => { waterMat.uniforms.uTime.value = time; }
  };
}

function buildTown(region: RegionDef, heightAt: (x: number, y: number) => number, isLive: SceneLiveCheck, staticPropShadows: boolean): THREE.Group {
  const g = new THREE.Group();
  const t = region.town.pos;
  const baseY = heightAt(t.x, t.y);
  const wx = t.x / WORLD_SCALE;
  const wz = t.y / WORLD_SCALE;
  const townRadius = region.town.radius / WORLD_SCALE;

  // plaza
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(townRadius * 0.36, townRadius * 0.39, 0.3, 24),
    new THREE.MeshStandardMaterial({ color: 0xb8a888, flatShading: true, roughness: 0.85, metalness: 0.04 })
  );
  plaza.position.set(wx, baseY + 0.12, wz);
  g.add(plaza);

  // huts around the plaza (procedural fallback; swapped for authored buildings below)
  const hutMat = new THREE.MeshStandardMaterial({ color: 0x9a7a52, flatShading: true, roughness: 0.88, metalness: 0.03 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xb84a32, flatShading: true, roughness: 0.7, metalness: 0.05 });
  const hutMeshes: THREE.Object3D[] = [];
  const townPlacements: { x: number; z: number; baseY: number; rotY: number }[] = [];
  const buildingRadius = townRadius * 0.76;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.4;
    const hx = wx + Math.cos(ang) * buildingRadius;
    const hz = wz + Math.sin(ang) * buildingRadius;
    const hut = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2.4), hutMat);
    const hutBaseY = heightAt(t.x + Math.cos(ang) * (buildingRadius * WORLD_SCALE), t.y + Math.sin(ang) * (buildingRadius * WORLD_SCALE));
    hut.position.set(hx, hutBaseY + 1.0, hz);
    hut.rotation.y = ang;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.4, 4), roofMat);
    roof.position.set(hx, hutBaseY + 2.6, hz);
    roof.rotation.y = ang + Math.PI / 4;
    g.add(hut, roof);
    hutMeshes.push(hut, roof);
    // Buildings face the plaza centre.
    townPlacements.push({ x: hx, z: hz, baseY: hutBaseY, rotY: ang + Math.PI });
  }
  for (const mesh of hutMeshes) {
    const m = mesh as THREE.Mesh;
    if (m.isMesh) {
      markStaticShadowCaster(m, staticPropShadows);
      m.receiveShadow = true;
    }
  }
  swapTownBuildings(g, hutMeshes, townPlacements, isLive, staticPropShadows);

  // shrine: floating crystal on a plinth
  const sx = region.shrine.pos.x / WORLD_SCALE;
  const sz = region.shrine.pos.y / WORLD_SCALE;
  const shrineBaseY = heightAt(region.shrine.pos.x, region.shrine.pos.y);
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.3, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: 0x8d8d99, flatShading: true, roughness: 0.6, metalness: 0.15 })
  );
  plinth.position.set(sx, shrineBaseY + 0.6, sz);
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.8),
    new THREE.MeshStandardMaterial({ color: 0x7adfc4, emissive: 0x49f0c0, emissiveIntensity: 1.7, roughness: 0.15, metalness: 0.1 })
  );
  crystal.position.set(sx, shrineBaseY + 2.4, sz);
  crystal.name = 'shrine-crystal';
  markStaticShadowCaster(plinth, staticPropShadows);
  plinth.receiveShadow = true;
  markStaticShadowCaster(crystal, staticPropShadows);
  g.add(plinth, crystal);

  // Standing-stone ring around the shrine (VFX_ASSETS WS-G set dressing): one
  // InstancedMesh of weathered monoliths, deterministic + carved-world flavour.
  const STONES = 7;
  const stoneGeo = new THREE.DodecahedronGeometry(0.9, 0);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6f6c75, flatShading: true, roughness: 0.82, metalness: 0.06 });
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, STONES);
  const stoneRng = new Rng(region.seed + 4242);
  const sm = new THREE.Matrix4();
  const stoneRingRadius = Math.max(1.25, Math.min(1.65, townRadius * 0.18));
  for (let i = 0; i < STONES; i++) {
    const ang = (i / STONES) * Math.PI * 2;
    const px = sx + Math.cos(ang) * stoneRingRadius;
    const pz = sz + Math.sin(ang) * stoneRingRadius;
    const h = 2.0 + stoneRng.next() * 1.4;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((stoneRng.next() - 0.5) * 0.18, ang, (stoneRng.next() - 0.5) * 0.18));
    sm.compose(new THREE.Vector3(px, shrineBaseY + h * 0.5, pz), q, new THREE.Vector3(0.52, h, 0.42));
    stones.setMatrixAt(i, sm);
  }
  markStaticShadowCaster(stones, staticPropShadows);
  stones.receiveShadow = true;
  g.add(stones);

  // shop stall: counter + awning
  const shopAngle = 0.4 + Math.PI / 6;
  const shopRadius = townRadius * 0.35;
  const shopX = wx + Math.cos(shopAngle) * shopRadius;
  const shopZ = wz + Math.sin(shopAngle) * shopRadius;
  const shopBaseY = heightAt(t.x + Math.cos(shopAngle) * (shopRadius * WORLD_SCALE), t.y + Math.sin(shopAngle) * (shopRadius * WORLD_SCALE));
  const shopRot = shopAngle + Math.PI;
  const shopPoint = (lx: number, ly: number, lz: number): THREE.Vector3 => {
    const c = Math.cos(shopRot);
    const s = Math.sin(shopRot);
    return new THREE.Vector3(shopX + lx * c - lz * s, shopBaseY + ly, shopZ + lx * s + lz * c);
  };
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: 0x7a5a36, flatShading: true, roughness: 0.9, metalness: 0.03 }));
  counter.position.copy(shopPoint(0, 0.7, 0));
  counter.rotation.y = shopRot;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 2.0), new THREE.MeshStandardMaterial({ color: 0xd8b04a, flatShading: true, roughness: 0.65, metalness: 0.1 }));
  awning.position.copy(shopPoint(0, 2.3, 0));
  awning.rotation.y = counter.rotation.y;
  const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 5), new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.8, metalness: 0.05 }));
  pole1.position.copy(shopPoint(-1.5, 1.4, 0.8));
  const pole2 = pole1.clone();
  pole2.position.copy(shopPoint(1.5, 1.4, 0.8));
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: 0xe8c87c, emissive: 0x6a5a2c, emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.1 }));
  sign.position.copy(shopPoint(0, 3.0, -0.65));
  sign.rotation.y = counter.rotation.y;
  sign.name = 'shop-sign';
  for (const mesh of [counter, awning, pole1, pole2, sign]) {
    markStaticShadowCaster(mesh, staticPropShadows);
    mesh.receiveShadow = true;
  }
  g.add(counter, awning, pole1, pole2, sign);

  return g;
}

function buildDungeonPortals(region: RegionDef, heightAt: (x: number, y: number) => number, staticPropShadows = true): THREE.Group {
  const g = new THREE.Group();
  const portalMat = new THREE.MeshStandardMaterial({
    color: 0x6f4cff,
    emissive: 0x6f4cff,
    emissiveIntensity: 1.1,
    roughness: 0.35,
    metalness: 0.15
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xb28cff,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x2b2442, roughness: 0.7, metalness: 0.08 });

  for (const portal of region.dungeons ?? []) {
    const x = portal.pos.x / WORLD_SCALE;
    const z = portal.pos.y / WORLD_SCALE;
    const baseY = heightAt(portal.pos.x, portal.pos.y);
    const p = new THREE.Group();
    p.name = `dungeon-portal-${portal.dungeonId}`;
    p.position.set(x, baseY, z);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.95, 0.2, 24), padMat);
    pad.position.y = 0.1;
    pad.receiveShadow = true;

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.12, 10, 36), portalMat);
    ring.position.y = 1.55;
    markStaticShadowCaster(ring, staticPropShadows);

    const core = new THREE.Mesh(new THREE.CircleGeometry(1.08, 32), coreMat);
    core.position.y = 1.55;
    core.position.z = 0.02;

    const beacon = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.2, 6), portalMat);
    beacon.position.y = 2.85;
    markStaticShadowCaster(beacon, staticPropShadows);

    p.add(pad, ring, core, beacon);
    g.add(p);
  }

  return g;
}
