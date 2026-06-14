import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Render-side async asset loaders for the CC0 enhancement layer (GRAPHICS_SPEC
 * §13). Everything here is optional and best-effort: every loader resolves to
 * `null` on failure or in a headless/Node context, so the procedural floor in
 * `terrain.ts` / `models.ts` always stands and the build runs with no assets
 * present (§9.5). Vendored GLBs are meshopt-compressed, so the GLTF loader is
 * wired with `MeshoptDecoder`.
 *
 * No asset is `import`ed here; URLs are plain runtime strings under
 * `/assets/...`, which keeps the no-asset-import guard (test 21) green.
 */

const hasDOM = typeof document !== 'undefined' && typeof window !== 'undefined';

type AssetKind = 'model' | 'texture' | 'hdr';

interface KindStats {
  requests: number;
  hits: number;
  misses: number;
  failures: number;
}

interface AssetManifestFile {
  path: string;
  url: string;
  bytes: number;
  type: string;
  group: string;
  preloadGroup: string;
}

interface AssetManifest {
  version: number;
  hash: string;
  totalBytes: number;
  files: AssetManifestFile[];
}

export interface AssetCacheStats {
  manifestHash: string | null;
  manifestBytes: number;
  loadedBytes: number;
  gpuTextureBytes: number;
  loadedUrls: number;
  modelCacheSize: number;
  textureCacheSize: number;
  hdrCacheSize: number;
  evictions: number;
  model: KindStats;
  texture: KindStats;
  hdr: KindStats;
}

export interface AssetPreloadProgress {
  label: string;
  total: number;
  loaded: number;
  totalBytes: number;
  loadedBytes: number;
  current?: string;
}

const kindStats: Record<AssetKind, KindStats> = {
  model: { requests: 0, hits: 0, misses: 0, failures: 0 },
  texture: { requests: 0, hits: 0, misses: 0, failures: 0 },
  hdr: { requests: 0, hits: 0, misses: 0, failures: 0 }
};
const knownBytes = new Map<string, number>();
const loadedUrls = new Set<string>();
const loadedTex = new Map<string, THREE.Texture>();
const loadedHdr = new Map<string, THREE.DataTexture>();
let manifestPromise: Promise<AssetManifest | null> | null = null;
let manifestHash: string | null = null;
let manifestBytes = 0;
let gpuTextureBytes = 0;
let evictions = 0;

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    return u.origin === window.location.origin ? `${u.pathname}${u.search}` : url;
  } catch {
    return url;
  }
}

function recordLoaded(url: string): void {
  loadedUrls.add(normalizeUrl(url));
}

function estimateTextureBytes(tex: THREE.Texture): number {
  const img = tex.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
  const w = img?.width ?? img?.naturalWidth ?? 0;
  const h = img?.height ?? img?.naturalHeight ?? 0;
  return w > 0 && h > 0 ? Math.round(w * h * 4 * 1.33) : 0;
}

export function loadAssetManifest(): Promise<AssetManifest | null> {
  if (!hasDOM || typeof fetch === 'undefined') return Promise.resolve(null);
  if (!manifestPromise) {
    manifestPromise = fetch('/assets/manifest.json', { cache: 'force-cache' })
      .then((res) => (res.ok ? res.json() as Promise<AssetManifest> : null))
      .then((manifest) => {
        if (!manifest) return null;
        manifestHash = manifest.hash ?? null;
        manifestBytes = manifest.totalBytes ?? 0;
        knownBytes.clear();
        for (const file of manifest.files ?? []) knownBytes.set(normalizeUrl(file.url), file.bytes);
        return manifest;
      })
      .catch(() => null);
  }
  return manifestPromise;
}

let gltf: GLTFLoader | null = null;
function gltfLoader(): GLTFLoader {
  if (!gltf) {
    gltf = new GLTFLoader();
    gltf.setMeshoptDecoder(MeshoptDecoder);
  }
  return gltf;
}

export interface ModelAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const modelCache = new Map<string, Promise<ModelAsset | null>>();
const texCache = new Map<string, Promise<THREE.Texture | null>>();
const hdrCache = new Map<string, Promise<THREE.DataTexture | null>>();

/** Load a meshopt-compressed .glb scene + clips once; shared + cloned by callers. Null on failure. */
export function loadModelAsset(url: string): Promise<ModelAsset | null> {
  if (!hasDOM) return Promise.resolve(null);
  kindStats.model.requests++;
  void loadAssetManifest();
  let p = modelCache.get(url);
  if (p) {
    kindStats.model.hits++;
    return p;
  }
  kindStats.model.misses++;
  p = gltfLoader()
    .loadAsync(url)
    .then((g) => {
      recordLoaded(url);
      return { scene: g.scene, animations: g.animations ?? [] };
    })
    .catch(() => {
      kindStats.model.failures++;
      return null;
    });
  modelCache.set(url, p);
  return p;
}

/** Load just the scene for static callers (terrain props/buildings). Null on failure/headless. */
export function loadModel(url: string): Promise<THREE.Group | null> {
  return loadModelAsset(url).then((asset) => asset?.scene ?? null);
}

/**
 * Clone an authored scene safely. SkeletonUtils.clone rebinds skinned meshes to
 * their cloned bones (plain `.clone()` leaves clones bound to the source
 * skeleton and renders them collapsed), and handles static meshes fine too.
 */
export function cloneModel(scene: THREE.Object3D): THREE.Object3D {
  return cloneSkeleton(scene);
}

export interface TexOpts {
  srgb?: boolean;
  repeat?: number;
  anisotropy?: number;
}

/** Load a plain image texture (terrain PBR maps, sprites). Null on failure/headless. */
export function loadTex(url: string, opts: TexOpts = {}): Promise<THREE.Texture | null> {
  if (!hasDOM) return Promise.resolve(null);
  kindStats.texture.requests++;
  void loadAssetManifest();
  const key = `${url}|${opts.srgb ? 's' : 'l'}|${opts.repeat ?? 0}`;
  let p = texCache.get(key);
  if (!p) {
    kindStats.texture.misses++;
    p = new THREE.TextureLoader()
      .loadAsync(url)
      .then((tex) => {
        tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        if (opts.repeat) {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(opts.repeat, opts.repeat);
        }
        tex.anisotropy = opts.anisotropy ?? 4;
        recordLoaded(url);
        loadedTex.set(key, tex);
        gpuTextureBytes += estimateTextureBytes(tex);
        return tex;
      })
      .catch(() => {
        kindStats.texture.failures++;
        return null;
      });
    texCache.set(key, p);
  } else {
    kindStats.texture.hits++;
  }
  return p;
}

/** Equirectangular Radiance .hdr for IBL. Null on failure/headless. */
export function loadHdr(url: string): Promise<THREE.DataTexture | null> {
  if (!hasDOM) return Promise.resolve(null);
  kindStats.hdr.requests++;
  void loadAssetManifest();
  let p = hdrCache.get(url);
  if (!p) {
    kindStats.hdr.misses++;
    p = new HDRLoader()
      .loadAsync(url)
      .then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        recordLoaded(url);
        loadedHdr.set(url, tex as THREE.DataTexture);
        gpuTextureBytes += estimateTextureBytes(tex);
        return tex as THREE.DataTexture;
      })
      .catch(() => {
        kindStats.hdr.failures++;
        return null;
      });
    hdrCache.set(url, p);
  } else {
    kindStats.hdr.hits++;
  }
  return p;
}

function manifestEntryLoad(entry: AssetManifestFile): Promise<unknown> {
  if (entry.type === 'model') return loadModelAsset(entry.url);
  if (entry.type === 'hdr') return loadHdr(entry.url);
  if (entry.type === 'texture') return loadTex(entry.url, { srgb: /_Color\.(jpg|jpeg|png|webp)$/i.test(entry.path) });
  return Promise.resolve(null);
}

export async function preloadAssetGroups(
  groups: readonly string[],
  opts: {
    label?: string;
    skipModels?: boolean;
    paths?: readonly string[];
    onProgress?: (progress: AssetPreloadProgress) => void;
  } = {}
): Promise<void> {
  const manifest = await loadAssetManifest();
  if (!manifest) return;
  const wanted = new Set(groups);
  const wantedPaths = opts.paths ? new Set(opts.paths) : null;
  const files = manifest.files.filter((file) => {
    if (!wanted.has(file.preloadGroup ?? file.group)) return false;
    if (wantedPaths && !wantedPaths.has(file.path) && !wantedPaths.has(file.url)) return false;
    return !(opts.skipModels && file.type === 'model');
  });
  const label = opts.label ?? 'assets';
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  let loaded = 0;
  let loadedBytes = 0;
  opts.onProgress?.({ label, total: files.length, loaded, totalBytes, loadedBytes });
  await Promise.all(files.map(async (file) => {
    await manifestEntryLoad(file);
    loaded++;
    loadedBytes += file.bytes;
    opts.onProgress?.({ label, total: files.length, loaded, totalBytes, loadedBytes, current: file.path });
  }));
}

export function getAssetCacheStats(): AssetCacheStats {
  const loadedBytes = [...loadedUrls].reduce((sum, url) => sum + (knownBytes.get(url) ?? 0), 0);
  return {
    manifestHash,
    manifestBytes,
    loadedBytes,
    gpuTextureBytes,
    loadedUrls: loadedUrls.size,
    modelCacheSize: modelCache.size,
    textureCacheSize: texCache.size,
    hdrCacheSize: hdrCache.size,
    evictions,
    model: { ...kindStats.model },
    texture: { ...kindStats.texture },
    hdr: { ...kindStats.hdr }
  };
}

export function evictTextureAssets(predicate: (url: string) => boolean = () => true): number {
  let count = 0;
  for (const [key, tex] of loadedTex) {
    const url = key.split('|')[0];
    if (!predicate(url)) continue;
    gpuTextureBytes = Math.max(0, gpuTextureBytes - estimateTextureBytes(tex));
    tex.dispose();
    loadedTex.delete(key);
    texCache.delete(key);
    loadedUrls.delete(normalizeUrl(url));
    count++;
  }
  for (const [url, tex] of loadedHdr) {
    if (!predicate(url)) continue;
    gpuTextureBytes = Math.max(0, gpuTextureBytes - estimateTextureBytes(tex));
    tex.dispose();
    loadedHdr.delete(url);
    hdrCache.delete(url);
    loadedUrls.delete(normalizeUrl(url));
    count++;
  }
  if (count) evictions += count;
  return count;
}

/**
 * Build instanced meshes from a (possibly multi-mesh) glTF prop so hundreds of
 * trees/rocks stay a handful of draw calls. Returns one `InstancedMesh` per
 * source mesh, each baking the mesh's local transform into every instance.
 */
export function instancedFromModel(scene: THREE.Object3D, transforms: THREE.Matrix4[]): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  const local = new THREE.Matrix4();
  const composed = new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const geo = m.geometry as THREE.BufferGeometry;
    const mat = m.material as THREE.Material | THREE.Material[];
    const inst = new THREE.InstancedMesh(geo, mat, transforms.length);
    inst.userData.sharedAsset = true;
    local.copy(m.matrixWorld); // relative to the (un-positioned) scene root
    for (let i = 0; i < transforms.length; i++) {
      composed.multiplyMatrices(transforms[i], local);
      inst.setMatrixAt(i, composed);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    out.push(inst);
  });
  return out;
}
