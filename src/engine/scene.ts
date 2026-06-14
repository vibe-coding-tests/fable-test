import * as THREE from 'three';
import type { AttackVisualSpec, DungeonRoom, ItemAppearanceSpec, RegionDef, RoomTemplate, StageAction, VfxSpec } from '../core/types';
import type { Sim } from '../core/sim';
import type { Unit } from '../core/unit';
import { REG } from '../core/registry';
import { buildTerrain, type TerrainInfo } from './terrain';
import { applyAuthoredSilhouette, applyHeroLikeness, applyItemAppearances, attachHeroWeaponModel, buildUnitRig, buildSelectionRing, mountHeroModel, recolorToPalette, type UnitRig } from './models';
import { HeroAssetLoader, heroAssetEntry, creepCreatureUrl, heroBaseId } from './assets';
import { animateRig, applyCinematicGesture, newAnimState, type AnimState } from './animator';
import { loadVfxTextureAtlas, VfxManager } from './vfx';
import type { CinematicView } from './cinematic';
import { lodForDistance, shouldAnimateAtLod } from './lod';
import { WORLD_SCALE } from './scale';
import { TUNING } from '../data/tuning';
import { clampedPixelRatio, qualityPreset, type QualityTier, type QualityPreset } from './performance';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadHdr, loadModelAsset, cloneModel } from './asset-loaders';

// ------------------------------------------------------------------
// GameScene: owns the three.js world. Reads sim state every frame,
// renders units/terrain/vfx, drives cameras and the day/night cycle.
// Never mutates the sim.
// ------------------------------------------------------------------

interface UnitView {
  rig: UnitRig;
  anim: AnimState;
  ring: THREE.Mesh;
  hpBar: THREE.Group;
  hpFill: THREE.Mesh;
  manaFill: THREE.Mesh;
  hpMaterial: THREE.MeshBasicMaterial;
  lastHpPct: number;
  lastManaPct: number;
  lastTeamColor: string;
  stars: THREE.Group;
  immuneShell: THREE.Mesh;
  lastItemVisualKey: string;
  removeAt: number; // time to despawn after death
}

interface MapMarker {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

export type CameraMode = 'follow' | 'map' | 'cinematic';

export interface GraphicsRenderStats {
  frameMsAvg: number;
  frameMsP95: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number | null;
  qualityTier: QualityTier;
  dpr: number;
  adaptiveScale: number;
}

// Hemi is deliberately low: the PBR env map now supplies most of the ambient
// fill, so a strong hemisphere light on top would wash the scene out.
const DAY = {
  sky: new THREE.Color('#8fc3e8'),
  fog: new THREE.Color('#a8d0e8'),
  sun: new THREE.Color('#fff2d8'),
  hemi: 0.42,
  sunI: 1.1
};
const DUSK = {
  sky: new THREE.Color('#d98a5e'),
  fog: new THREE.Color('#caa07a'),
  sun: new THREE.Color('#ffb36a'),
  hemi: 0.3,
  sunI: 0.66
};
const NIGHT = {
  sky: new THREE.Color('#16213b'),
  fog: new THREE.Color('#1d2a48'),
  sun: new THREE.Color('#9db8e8'),
  // Moonlit, not pitch-black: enough hemi + moon key to read terrain and units
  // (GRAPHICS_SPEC §3.2). The cool sun color + dark sky + grade keep it night.
  hemi: 0.46,
  sunI: 0.4
};

// Color-grade + vignette post pass (GRAPHICS_SPEC §3.1). Tint/saturation/
// contrast are driven per-frame from the active biome blended toward a cool
// night look. Keeps the Dota-style painterly, high-contrast read.
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.06 },
    uBrightness: { value: 1.0 },
    uVignette: { value: 0.8 },
    uStrength: { value: 1.0 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uTint;
    uniform float uSaturation, uContrast, uBrightness, uVignette, uStrength;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb * uBrightness * uTint;
      c = (c - 0.5) * uContrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      float d = distance(vUv, vec2(0.5));
      float vig = smoothstep(0.85, uVignette * 0.5, d);
      c *= mix(1.0, vig, 0.42);
      // uStrength scales the whole grade (incl. vignette) toward the raw image,
      // so the settings slider can dial it down to off or up past the default.
      c = mix(src.rgb, c, uStrength);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }
  `
};

// Gradient sky dome (GRAPHICS_SPEC §5.3): a back-side sphere shaded from a
// hazy horizon up to a deeper zenith, tinted live by the day/night palette.
const SKY_SHADER = {
  uniforms: {
    uTop: { value: new THREE.Color('#6ea8d8') },
    uBottom: { value: new THREE.Color('#a8d0e8') },
    uExp: { value: 0.55 }
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    uniform vec3 uTop, uBottom;
    uniform float uExp;
    void main() {
      float h = pow(max(normalize(vDir).y, 0.0), uExp);
      gl_FragColor = vec4(mix(uBottom, uTop, h), 1.0);
    }
  `
};

// Per-biome ambient weather (GRAPHICS_SPEC §5.6). count scales with the quality
// tier's weatherDensity; fall/sway/colour give each region its own air.
interface WeatherSpec { count: number; color: number; size: number; fall: number; sway: number; }
const BIOME_WEATHER: Record<string, WeatherSpec> = {
  snow: { count: 420, color: 0xffffff, size: 0.16, fall: 1.6, sway: 0.7 },
  desert: { count: 180, color: 0xe8d6a8, size: 0.1, fall: 0.5, sway: 1.1 },
  wasteland: { count: 240, color: 0x8a7a6a, size: 0.12, fall: 1.0, sway: 0.6 },
  forest: { count: 150, color: 0xbfe89a, size: 0.13, fall: 0.7, sway: 0.9 },
  grass: { count: 120, color: 0xdfe8b0, size: 0.11, fall: 0.5, sway: 0.9 },
  coast: { count: 140, color: 0xdfeefc, size: 0.11, fall: 0.45, sway: 1.0 }
};
const WEATHER_BOX = { w: 90, h: 46, d: 90 };

// Soft round particle sprite (radial alpha) for additive weather/VFX. Built
// numerically as a DataTexture so it needs no DOM or GL context.
let SOFT_SPRITE: THREE.DataTexture | null = null;
function softSprite(): THREE.DataTexture {
  if (SOFT_SPRITE) return SOFT_SPRITE;
  const s = 32;
  const data = new Uint8Array(s * s * 4);
  const c = (s - 1) / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = Math.hypot(x - c, y - c) / c;
      const a = Math.max(0, 1 - d);
      const i = (y * s + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.floor(255 * a * a);
    }
  }
  const tex = new THREE.DataTexture(data, s, s);
  tex.needsUpdate = true;
  return (SOFT_SPRITE = tex);
}

// Generated micro-surface detail (Phase 5 hero textures). A tiling value-noise +
// faint scratches used as a bump map so cloth/metal catch light unevenly instead of
// reading as flat plastic. Canvas-only → null in headless tests (buildUnitRig stays
// texture-free and node-safe); the scene applies this at view-creation time.
let HERO_DETAIL: THREE.Texture | null | undefined;
function heroDetailTexture(): THREE.Texture | null {
  if (HERO_DETAIL !== undefined) return HERO_DETAIL;
  if (typeof document === 'undefined') return (HERO_DETAIL = null);
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return (HERO_DETAIL = null);
  const img = ctx.createImageData(size, size);
  let seed = 1337;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  for (let i = 0; i < size * size; i++) {
    const v = 150 + rnd() * 105; // bright base → gentle bump only
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(60,60,60,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 22; i++) {
    ctx.beginPath();
    ctx.moveTo(rnd() * size, rnd() * size);
    ctx.lineTo(rnd() * size, rnd() * size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 2;
  return (HERO_DETAIL = tex);
}

interface GradeTarget { tint: [number, number, number]; sat: number; contrast: number; }
const BIOME_GRADE: Record<string, GradeTarget> = {
  grass: { tint: [1.03, 1.01, 0.94], sat: 1.12, contrast: 1.06 },
  forest: { tint: [0.98, 1.04, 0.96], sat: 1.14, contrast: 1.07 },
  snow: { tint: [0.96, 0.99, 1.07], sat: 0.96, contrast: 1.08 },
  desert: { tint: [1.07, 1.0, 0.88], sat: 1.06, contrast: 1.05 },
  wasteland: { tint: [1.06, 0.95, 0.9], sat: 0.86, contrast: 1.1 },
  coast: { tint: [0.98, 1.01, 1.05], sat: 1.1, contrast: 1.05 }
};
const NIGHT_GRADE: GradeTarget = { tint: [0.82, 0.9, 1.14], sat: 0.78, contrast: 1.06 };

const HP_BAR_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const HP_BAR_WIDTH = 1.5;
const HP_BAR_HEIGHT = 0.16;
const MANA_BAR_HEIGHT = 0.035;

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly terrain: TerrainInfo;
  readonly vfx: VfxManager;

  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private rim: THREE.DirectionalLight;
  private quality: QualityPreset;
  // Day/night IBL (VFX_ASSETS WS-G): a daytime + a night HDRI, swapped by the
  // cycle. Both cached so the swap is a reference change, never a reload.
  private envDay: THREE.Texture | null = null;
  private envNight: THREE.Texture | null = null;
  private envPhase: 'day' | 'night' | null = null;
  private lastNight = false;
  private readonly biome: string;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private smaaPass: SMAAPass | null = null;
  private skyMat: THREE.ShaderMaterial;
  private skyDome: THREE.Mesh;
  private weather: THREE.Points | null = null;
  private weatherVel: Float32Array | null = null;
  private views = new Map<number, UnitView>();
  private heroAssets = new HeroAssetLoader();
  private disposed = false;
  private sceneToken = 0;
  private readonly onResize = (): void => this.resize();
  // Live, user-tunable graphics state (GRAPHICS_SPEC §6 settings).
  private exposureBase = 0.92;
  private gradeScale = 1;
  private reducedMotion = false;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private mapMarkers: MapMarker[] = [];
  private dungeonRoomGroup: THREE.Group | null = null;

  cameraMode: CameraMode = 'follow';
  private gameplayCameraMode: 'follow' | 'map' = 'follow';
  private camTarget = new THREE.Vector3();
  private cinematicTarget = new THREE.Vector3();
  private cinematicLookAt = new THREE.Vector3();
  private cinematicBeatKey = '';
  private camZoom = 1; // user wheel zoom within mode
  private modeBlend = 0; // 0 = follow, 1 = map
  selectedUid = -1;
  playerTeam = 0;
  private time = 0;
  private frameParity = 0; // flips 0/1 each frame to drive reduced-LOD animation cadence
  private frameMsSamples: number[] = [];
  private adaptiveScale = 1;
  private adaptiveOverBudgetSec = 0;
  private adaptiveCooldownSec = 0;
  // WS-H micro-feedback: bounded camera shake (crits / big stuns) and a transient
  // per-element grade accent during marquee casts. Both decay every frame and are
  // disabled under reducedMotion / when the grade pass is off.
  private shakeTrauma = 0;
  private accent = new THREE.Color(1, 1, 1);
  private accentStrength = 0;

  constructor(canvas: HTMLCanvasElement, region: RegionDef, quality: QualityTier = 'high') {
    const qualityCfg = qualityPreset(quality);
    this.quality = qualityCfg;
    this.biome = region.biome;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !qualityCfg.smaa });
    this.applyPixelRatio();
    this.renderer.shadowMap.enabled = qualityCfg.shadows;
    this.renderer.shadowMap.type = qualityCfg.shadowType === 'pcf' ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    // Filmic tonemap + sRGB so PBR highlights and bloom read like Dota (§3.1).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.exposureBase;

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 700);
    this.scene.fog = new THREE.Fog(DAY.fog.getHex(), 60, 300);

    // Image-based lighting: a neutral room env map gives PBR materials real
    // specular response. Built once on the GPU, then released.
    if (qualityCfg.envMap) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      // Keep IBL as a subtle fill: RoomEnvironment's bright panels would
      // otherwise throw hot specular highlights that the bloom pass blows out.
      // updateDayNight() drives the live value with the cycle.
      (this.scene as unknown as { environmentIntensity: number }).environmentIntensity = 0.3;
      pmrem.dispose();
      this.installHdrEnvironment();
    }

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x46584a, DAY.hemi);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(DAY.sun, DAY.sunI);
    this.sun.castShadow = qualityCfg.shadows;
    this.sun.shadow.mapSize.set(qualityCfg.shadowMapSize, qualityCfg.shadowMapSize);
    this.sun.shadow.bias = -0.0004;
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60;
    sc.near = 1; sc.far = 400;
    this.scene.add(this.sun, this.sun.target);

    // Cool rim/back light opposite the sun for hero separation (§3.2).
    this.rim = new THREE.DirectionalLight(0x9fc6ff, 0.4);
    this.scene.add(this.rim, this.rim.target);

    // Gradient sky dome: follows the camera, tinted by the cycle (§5.3).
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color('#6ea8d8') },
        uBottom: { value: new THREE.Color('#a8d0e8') },
        uExp: { value: SKY_SHADER.uniforms.uExp.value }
      },
      vertexShader: SKY_SHADER.vertexShader,
      fragmentShader: SKY_SHADER.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), this.skyMat);
    this.skyDome.renderOrder = -1;
    this.scene.add(this.skyDome);

    this.terrain = buildTerrain(region, () => this.isLive());
    this.scene.add(this.terrain.group);

    if (qualityCfg.weatherDensity > 0) this.buildWeather(region.biome, qualityCfg.weatherDensity);

    this.vfx = new VfxManager((x, y) => this.terrain.heightAt(x, y), qualityCfg.transientVfxCap);
    this.scene.add(this.vfx.group);
    if (qualityCfg.tier !== 'low') void loadVfxTextureAtlas();

    this.createMapMarkers(region);

    if (qualityCfg.postFx) this.setupComposer(qualityCfg);
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  private isLive(): boolean {
    return !this.disposed;
  }

  private applyPixelRatio(): void {
    const base = clampedPixelRatio(window.devicePixelRatio, this.quality.tier);
    this.renderer.setPixelRatio(Math.max(0.75, base * this.adaptiveScale));
  }

  /** Build the EffectComposer stack: render → bloom → grade → output → SMAA.
   *  Each pass is gated by the quality preset (GRAPHICS_SPEC §1.5, §9.6). */
  private setupComposer(q: QualityPreset): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), q.bloomStrength, q.bloomRadius, 1.0);
      composer.addPass(this.bloomPass);
    }
    if (q.grade) {
      this.gradePass = new ShaderPass(GRADE_SHADER);
      composer.addPass(this.gradePass);
    }
    composer.addPass(new OutputPass());
    if (q.smaa) {
      this.smaaPass = new SMAAPass();
      composer.addPass(this.smaaPass);
    }
    this.composer = composer;
  }

  /** Ambient weather: a camera-following cloud of additive soft particles
   *  whose count/fall/colour come from the biome and quality tier (§5.6). */
  private buildWeather(biome: string, density: number): void {
    const spec = BIOME_WEATHER[biome] ?? BIOME_WEATHER.grass;
    const count = Math.max(1, Math.floor(spec.count * density));
    const positions = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * WEATHER_BOX.w;
      positions[i * 3 + 1] = Math.random() * WEATHER_BOX.h;
      positions[i * 3 + 2] = (Math.random() - 0.5) * WEATHER_BOX.d;
      vel[i * 3] = (Math.random() - 0.5) * spec.sway;
      vel[i * 3 + 1] = -(0.5 + Math.random()) * spec.fall;
      vel[i * 3 + 2] = (Math.random() - 0.5) * spec.sway;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: spec.color,
      size: spec.size,
      map: softSprite(),
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    this.weather = new THREE.Points(geo, mat);
    this.weather.frustumCulled = false;
    this.weather.renderOrder = 5;
    this.weatherVel = vel;
    this.scene.add(this.weather);
  }

  private updateWeather(dt: number): void {
    if (!this.weather || !this.weatherVel || this.reducedMotion) return;
    this.weather.position.set(this.camera.position.x, this.camTarget.y, this.camera.position.z);
    const pos = this.weather.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const vel = this.weatherVel;
    const hw = WEATHER_BOX.w / 2;
    const hd = WEATHER_BOX.d / 2;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += vel[i] * dt;
      arr[i + 1] += vel[i + 1] * dt;
      arr[i + 2] += vel[i + 2] * dt;
      if (arr[i + 1] < 0) {
        arr[i + 1] += WEATHER_BOX.h;
        arr[i] = (Math.random() - 0.5) * WEATHER_BOX.w;
        arr[i + 2] = (Math.random() - 0.5) * WEATHER_BOX.d;
      }
      if (arr[i] < -hw) arr[i] += WEATHER_BOX.w; else if (arr[i] > hw) arr[i] -= WEATHER_BOX.w;
      if (arr[i + 2] < -hd) arr[i + 2] += WEATHER_BOX.d; else if (arr[i + 2] > hd) arr[i + 2] -= WEATHER_BOX.d;
    }
    pos.needsUpdate = true;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.bloomPass?.setSize(w, h);
    this.smaaPass?.setSize(w, h);
  }

  /** Pre-compile the programs for everything currently in the scene against the
   *  camera, so the first rendered frame doesn't pay the GLSL compile/link cost
   *  as one visible hitch (GRAPHICS_SPEC §9.4). Call behind a loading screen. */
  prewarm(): void {
    this.renderer.compile(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sceneToken++;
    window.removeEventListener('resize', this.onResize);
    this.resetUnitViews();
    this.scene.remove(this.vfx.group);
    this.vfx.reset();
    if (this.weather) {
      this.scene.remove(this.weather);
      this.weather.geometry.dispose();
      (this.weather.material as THREE.Material).dispose();
      this.weather = null;
      this.weatherVel = null;
    }
    this.composer?.dispose();
    this.composer = null;
    this.disposeHdrEnvs();
    this.scene.environment?.dispose();
    this.scene.environment = null;
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
  }

  /** Live-apply user graphics settings: exposure, grade strength, reduced motion. */
  setGraphics(g: { exposure?: number; grade?: number; reducedMotion?: boolean }): void {
    if (g.exposure !== undefined) {
      this.exposureBase = Math.max(0.5, Math.min(1.5, g.exposure));
      this.renderer.toneMappingExposure = this.exposureBase;
    }
    if (g.grade !== undefined) {
      this.gradeScale = Math.max(0, Math.min(1.5, g.grade));
      if (this.gradePass) this.gradePass.uniforms.uStrength.value = this.gradeScale;
    }
    if (g.reducedMotion !== undefined) {
      this.reducedMotion = g.reducedMotion;
      if (this.weather) this.weather.visible = !this.reducedMotion;
    }
  }

  /** Add bounded camera-shake trauma (0..1). No-op under reducedMotion. Applied
   *  with a squared falloff in updateCamera so small hits barely move and big
   *  ones punch, then decay back to rest (WS-H hit-stop/shake feedback). */
  addShake(amount: number): void {
    if (this.reducedMotion) return;
    this.shakeTrauma = Math.min(1, this.shakeTrauma + amount);
  }

  /** Push the color grade toward an element color for a beat (big casts). The
   *  accent decays each frame; off when the grade pass is disabled (low/medium). */
  accentGrade(color: string, strength: number): void {
    if (!this.gradePass || this.reducedMotion) return;
    this.accent.set(color);
    this.accentStrength = Math.min(0.6, Math.max(this.accentStrength, strength));
  }

  /** Rebuild quality-gated systems for a new tier at runtime (Settings UI §6).
   *  Disposes the old post stack/weather/shadow map so switching is leak-free. */
  setQuality(tier: QualityTier): void {
    const q = qualityPreset(tier);
    this.quality = q;
    this.adaptiveScale = 1;
    this.adaptiveOverBudgetSec = 0;
    this.adaptiveCooldownSec = 0;
    this.applyPixelRatio();

    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = q.shadowType === 'pcf' ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget; // re-alloc at new size

    if (q.envMap && !this.scene.environment) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      this.installHdrEnvironment();
    } else if (!q.envMap && this.scene.environment) {
      this.disposeHdrEnvs();
      this.scene.environment.dispose();
      this.scene.environment = null;
    }

    if (this.weather) {
      this.scene.remove(this.weather);
      this.weather.geometry.dispose();
      (this.weather.material as THREE.Material).dispose();
      this.weather = null;
      this.weatherVel = null;
    }
    if (q.weatherDensity > 0) {
      this.buildWeather(this.biome, q.weatherDensity);
      if (this.weather) (this.weather as THREE.Points).visible = !this.reducedMotion;
    }

    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
      this.gradePass = null;
      this.smaaPass = null;
    }
    if (q.postFx) this.setupComposer(q);

    this.resize();
    this.renderer.toneMappingExposure = this.exposureBase;
    if (this.gradePass) this.gradePass.uniforms.uStrength.value = this.gradeScale;
  }

  /**
   * Phase 1 (GRAPHICS_SPEC §13): upgrade IBL from the neutral RoomEnvironment to
   * a real Poly Haven outdoor HDRI (CC0) for grounded specular + sky reflections.
   * Async + best-effort: the RoomEnvironment fill set above stays if the .hdr is
   * missing or we're headless. The day/night cycle keeps driving environmentIntensity.
   */
  private installHdrEnvironment(): void {
    if (!this.quality.envMap) return;
    const token = this.sceneToken;
    const toEnv = (hdr: THREE.DataTexture): THREE.Texture => {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const env = pmrem.fromEquirectangular(hdr).texture;
      pmrem.dispose();
      hdr.dispose();
      return env;
    };
    void loadHdr('/assets/env/vale_day_1k.hdr').then((hdr) => {
      if (!hdr || !this.isLive() || token !== this.sceneToken || !this.quality.envMap) { hdr?.dispose(); return; }
      this.envDay = toEnv(hdr);
      this.applyEnvPhase(this.lastNight);
    });
    // Night bed (vendored, previously unused): grounds reflections at night.
    void loadHdr('/assets/env/night_1k.hdr').then((hdr) => {
      if (!hdr || !this.isLive() || token !== this.sceneToken || !this.quality.envMap) { hdr?.dispose(); return; }
      this.envNight = toEnv(hdr);
      this.applyEnvPhase(this.lastNight);
    });
  }

  /** Swap the assigned IBL between the cached day/night envs (no reload). The
   *  neutral RoomEnvironment fill is disposed once a real HDRI takes over. */
  private applyEnvPhase(night: boolean): void {
    const next = night && this.envNight ? this.envNight : this.envDay;
    if (!next) return;
    const phase: 'day' | 'night' = night && this.envNight ? 'night' : 'day';
    if (this.envPhase === phase && this.scene.environment === next) return;
    const current = this.scene.environment;
    if (current && current !== this.envDay && current !== this.envNight) current.dispose();
    this.scene.environment = next;
    this.envPhase = phase;
  }

  private disposeHdrEnvs(): void {
    this.envDay?.dispose();
    this.envNight?.dispose();
    this.envDay = null;
    this.envNight = null;
    this.envPhase = null;
  }

  /** Wheel zoom: clamped per mode. */
  zoomBy(deltaY: number): void {
    this.camZoom = Math.min(1.6, Math.max(0.55, this.camZoom * (deltaY > 0 ? 1.08 : 0.93)));
  }

  toggleCameraMode(): CameraMode {
    const current = this.cameraMode === 'cinematic' ? this.gameplayCameraMode : this.cameraMode;
    this.cameraMode = current === 'follow' ? 'map' : 'follow';
    this.gameplayCameraMode = this.cameraMode;
    return this.cameraMode;
  }

  // ---------- per-frame ----------

  update(sim: Sim, followUnit: Unit | null, renderDt: number, timeOfDay01: number, cinematicView: CinematicView | null = null): void {
    this.recordFrameMs(renderDt * 1000, renderDt);
    this.time += renderDt;
    this.frameParity ^= 1;
    // Decay the WS-H micro-feedback envelopes (shake fades fast, accent slower).
    if (this.shakeTrauma > 0) this.shakeTrauma = Math.max(0, this.shakeTrauma - renderDt * 1.9);
    if (this.accentStrength > 0) this.accentStrength = Math.max(0, this.accentStrength - renderDt * 0.85);
    this.syncUnits(sim, renderDt);
    this.applyCinematicStage(cinematicView, sim, followUnit);
    this.vfx.syncProjectiles(sim.projectiles);
    this.vfx.syncZoneFollow((uid) => {
      const u = sim.unit(uid);
      return u ? { x: u.pos.x, y: u.pos.y, h: 0 } : null;
    });
    this.vfx.update(renderDt);
    this.updateDayNight(timeOfDay01);
    this.updateCamera(followUnit, renderDt, sim, cinematicView);
    this.updateMapMarkers();
    if (!this.reducedMotion) this.terrain.update?.(this.time);
    this.skyDome.position.copy(this.camera.position);
    this.updateWeather(renderDt);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private recordFrameMs(frameMs: number, dt: number): void {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    this.frameMsSamples.push(frameMs);
    if (this.frameMsSamples.length > 180) this.frameMsSamples.shift();
    this.updateAdaptiveDpr(frameMs, dt);
  }

  private frameStats(): { avg: number; p95: number } {
    if (!this.frameMsSamples.length) return { avg: 0, p95: 0 };
    const sum = this.frameMsSamples.reduce((a, b) => a + b, 0);
    const sorted = [...this.frameMsSamples].sort((a, b) => a - b);
    return {
      avg: sum / this.frameMsSamples.length,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
    };
  }

  private updateAdaptiveDpr(frameMs: number, dt: number): void {
    if (this.quality.tier === 'low' || this.quality.tier === 'medium') return;
    this.adaptiveCooldownSec = Math.max(0, this.adaptiveCooldownSec - dt);
    if (frameMs > 22) this.adaptiveOverBudgetSec += dt;
    else if (frameMs < 17) this.adaptiveOverBudgetSec = Math.max(0, this.adaptiveOverBudgetSec - dt * 2);
    if (this.adaptiveOverBudgetSec < 4 || this.adaptiveCooldownSec > 0 || this.adaptiveScale <= 0.75) return;
    this.adaptiveScale = Math.max(0.75, this.adaptiveScale * 0.9);
    this.applyPixelRatio();
    this.resize();
    this.adaptiveCooldownSec = 8;
    this.adaptiveOverBudgetSec = 0;
  }

  graphicsStats(): GraphicsRenderStats {
    const frames = this.frameStats();
    const info = this.renderer.info;
    const programs = (info as unknown as { programs?: unknown[] | null }).programs;
    return {
      frameMsAvg: frames.avg,
      frameMsP95: frames.p95,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: programs ? programs.length : null,
      qualityTier: this.quality.tier,
      dpr: this.renderer.getPixelRatio(),
      adaptiveScale: this.adaptiveScale
    };
  }

  /** Drop every cached unit view + transient VFX. Used when the rendered sim
   *  is swapped (e.g. entering/leaving a live gym fight) so unit ids from the
   *  new sim never alias views built for the old one. */
  resetUnitViews(): void {
    this.sceneToken++;
    for (const [, view] of this.views) this.scene.remove(view.rig.root);
    this.views.clear();
    this.selectedUid = -1;
    this.vfx.reset();
  }

  setDungeonRoom(template: RoomTemplate | null, room: DungeonRoom | null = null): void {
    this.clearDungeonRoomVisuals();
    if (!template) return;

    const group = new THREE.Group();
    group.name = `dungeon-room:${template.id}`;
    const w = template.size.x / WORLD_SCALE;
    const h = template.size.y / WORLD_SCALE;
    const roomColor = room?.type === 'boss'
      ? 0xe4ae39
      : room?.type === 'elite'
        ? 0xd32ce6
        : room?.type === 'treasure'
          ? 0xade55c
          : 0x5e98d9;

    const floorMat = new THREE.MeshBasicMaterial({
      color: roomColor,
      transparent: true,
      opacity: 0.09,
      depthWrite: false
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w / 2, 0.05, h / 2);
    floor.renderOrder = 6;
    group.add(floor);

    const edgePoints = [
      new THREE.Vector3(0, 0.12, 0),
      new THREE.Vector3(w, 0.12, 0),
      new THREE.Vector3(w, 0.12, h),
      new THREE.Vector3(0, 0.12, h),
      new THREE.Vector3(0, 0.12, 0)
    ];
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePoints);
    const edge = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ color: roomColor, transparent: true, opacity: 0.75 }));
    edge.renderOrder = 7;
    group.add(edge);

    const doorGeo = new THREE.RingGeometry(0.25, 0.42, 24);
    const doorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
    for (const c of template.connectors) {
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.rotation.x = -Math.PI / 2;
      door.position.set(c.at.x / WORLD_SCALE, 0.14, c.at.y / WORLD_SCALE);
      door.renderOrder = 8;
      group.add(door);
    }

    const anchorGeo = new THREE.CircleGeometry(0.18, 18);
    const anchorMat = new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.32, depthWrite: false });
    for (const a of template.spawnAnchors) {
      const marker = new THREE.Mesh(anchorGeo, anchorMat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(a.x / WORLD_SCALE, 0.13, a.y / WORLD_SCALE);
      marker.renderOrder = 8;
      group.add(marker);
    }

    this.dungeonRoomGroup = group;
    this.scene.add(group);
  }

  private clearDungeonRoomVisuals(): void {
    if (!this.dungeonRoomGroup) return;
    const group = this.dungeonRoomGroup;
    this.scene.remove(group);
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const line = obj as THREE.Line;
      const geo = mesh.geometry ?? line.geometry;
      if (geo) geo.dispose();
      const material = mesh.material ?? line.material;
      const dispose = (m: unknown) => {
        if (m && typeof (m as { dispose?: unknown }).dispose === 'function') (m as { dispose: () => void }).dispose();
      };
      Array.isArray(material) ? material.forEach(dispose) : dispose(material);
    });
    this.dungeonRoomGroup = null;
  }

  private createMapMarkers(region: RegionDef): void {
    const add = (x: number, y: number, radius: number, color: number, shape: 'ring' | 'disc' = 'disc'): void => {
      const geo = shape === 'ring'
        ? new THREE.RingGeometry(radius * 0.55, radius, 24)
        : new THREE.CircleGeometry(radius, 24);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x / WORLD_SCALE, this.terrain.heightAt(x, y) + 0.28, y / WORLD_SCALE);
      mesh.renderOrder = 50;
      mesh.visible = false;
      this.scene.add(mesh);
      this.mapMarkers.push({ mesh, material });
    };

    add(region.town.pos.x, region.town.pos.y, 0.72, 0xf5d76e, 'ring');
    add(region.shrine.pos.x, region.shrine.pos.y, 0.46, 0x67d7ff, 'disc');
    for (const camp of region.camps) add(camp.pos.x, camp.pos.y, 0.28, 0xdb6b55, 'disc');
    for (const spawn of region.heroSpawns) add(spawn.pos.x, spawn.pos.y, 0.38, 0xb88cff, 'ring');
    for (const echo of region.echoSpawns ?? []) add(echo.pos.x, echo.pos.y, 0.42, 0x8fe8ff, 'ring');
    for (const gate of region.gates ?? []) add(gate.pos.x, gate.pos.y, 0.5, 0x7aff9a, 'ring');
    for (const gym of region.gyms ?? []) add(gym.pos.x, gym.pos.y, 0.58, 0xff9ad5, 'ring');
  }

  /** Game layer forwards sim events here (it also consumes them for UI). */
  pushEvent(ev: Parameters<VfxManager['handleEvent']>[0], sim: Sim): void {
    if (ev.t === 'attack-impact') this.playAttackVisuals(ev.uid, ev.target, sim);
    if (ev.t === 'damage') {
      const view = this.views.get(ev.uid);
      if (view) view.anim.hitFlash = Math.max(view.anim.hitFlash, ev.crit ? 1.4 : 1);
      if (ev.crit) this.addShake(0.42);
    }
    if (ev.t === 'attack-launch') {
      const view = this.views.get(ev.uid);
      if (view) view.anim.lungeFlash = Math.max(view.anim.lungeFlash, 0.35);
    }
    // WS-H: marquee casts tint the frame toward their element and (for the big
    // containment/pull ults) give a small shake. Cheap, decays on its own.
    if (ev.t === 'cast') {
      const a = ev.vfx.archetype;
      const strong = a === 'vortex' || a === 'dome';
      this.accentGrade(ev.vfx.color, strong ? 0.5 : a === 'storm' || a === 'global-mark' || a === 'beam' ? 0.38 : 0.22);
      if (strong) this.addShake(0.3);
    }
    this.vfx.handleEvent(ev, (uid) => {
      const u = sim.unit(uid);
      return u ? { x: u.pos.x, y: u.pos.y, h: 0 } : null;
    });
  }

  private syncUnits(sim: Sim, dt: number): void {
    const seen = new Set<number>();
    for (const u of sim.unitsArr) {
      if (u.kind === 'npc' && !u.alive) continue;
      seen.add(u.uid);
      let view = this.views.get(u.uid);
      if (!view) {
        view = this.createView(u);
        this.views.set(u.uid, view);
      }
      this.updateView(u, view, dt, sim.time);
    }
    // remove views for despawned units or finished death anims
    for (const [uid, view] of this.views) {
      const u = sim.unit(uid);
      const gone = !u || !seen.has(uid);
      const deadLong = u && !u.alive && view.removeAt > 0 && this.time > view.removeAt;
      if (gone || deadLong) {
        this.scene.remove(view.rig.root);
        this.views.delete(uid);
      }
    }
  }

  /** Apply the generated bump detail to a hero's PBR materials (browser only). */
  private applyHeroDetail(rig: UnitRig): void {
    const tex = heroDetailTexture();
    if (!tex) return;
    for (const m of rig.materials) {
      m.bumpMap = tex;
      m.bumpScale = 0.014;
      m.needsUpdate = true;
    }
  }

  private createView(u: Unit): UnitView {
    let sil = u.kind === 'hero' && u.heroId ? REG.hero(u.heroId).silhouette : undefined;
    let palette: [string, string, string] | undefined =
      u.kind === 'hero' && u.heroId ? REG.hero(u.heroId).palette : undefined;
    if (u.kind === 'creep' && u.creepId) {
      const def = REG.creep(u.creepId);
      sil = def.silhouette;
      palette = def.palette;
    }
    if (u.visual) {
      sil = u.visual.silhouette;
      palette = u.visual.palette;
    }
    if (!sil) sil = { build: 'biped', scale: 1 };
    if (!palette) palette = ['#888899', '#666677', '#aaaabb'];

    const rig = buildUnitRig(sil, palette);
    if (u.kind === 'hero' && u.heroId) {
      applyHeroLikeness(rig, u.heroId);
      this.applyHeroDetail(rig);
    }
    applyItemAppearances(rig, this.itemAppearancesFor(u));
    this.scene.add(rig.root);
    const token = this.sceneToken;

    // Pluggable rig (Phase 5): prefer a dedicated hero GLB; otherwise try the
    // shared-base cohort path. If neither asset exists, the procedural rig stays.
    const mountSharedBase = (): void => {
      if (u.kind !== 'hero' || !u.heroId) return;
      const base = heroBaseId(u.heroId);
      if (base === 'procedural') return;
      void this.heroAssets.loadBase(base).then((asset) => {
        if (asset && this.isLive() && token === this.sceneToken && this.views.get(u.uid)?.rig === rig) {
          const model = cloneModel(asset.scene);
          recolorToPalette(model, palette);
          mountHeroModel(rig, model, asset.animations);
          applyItemAppearances(rig, this.itemAppearancesFor(u));
        }
      });
    };
    const assetEntry = u.kind === 'hero' ? heroAssetEntry(u.heroId) : null;
    if (assetEntry) {
      void this.heroAssets.loadHero(assetEntry).then((asset) => {
        if (asset && this.isLive() && token === this.sceneToken && this.views.get(u.uid)?.rig === rig) {
          mountHeroModel(rig, cloneModel(asset.scene), asset.animations, assetEntry.clips);
          // WS-A within-cohort variation: stretch the shared base to this hero's
          // proportions and layer its innate identity gear over the authored body,
          // before items so the weapon counter-scale reads the final model scale.
          applyAuthoredSilhouette(rig, u.heroId!, palette);
          // WS-B: re-apply worn items now that sockets resolved, so the weapon hangs
          // off the authored hand bone instead of the hidden procedural one.
          applyItemAppearances(rig, this.itemAppearancesFor(u));
          void this.heroAssets.loadHeroWeapon(assetEntry).then((weapon) => {
            if (weapon && this.isLive() && token === this.sceneToken && this.views.get(u.uid)?.rig === rig) {
              attachHeroWeaponModel(rig, cloneModel(weapon.scene));
              applyItemAppearances(rig, this.itemAppearancesFor(u));
            }
          });
        } else if (!asset) {
          mountSharedBase();
        }
      });
    } else {
      mountSharedBase();
    }

    // Phase 3 (GRAPHICS_SPEC §13): mount an authored Quaternius creature (CC0)
    // for creeps; mountHeroModel hides the procedural body, so the rig stays the
    // live fallback if the GLB is missing. The model rides rig.body (bob/lean).
    if (u.kind === 'creep') {
      const creatureUrl = creepCreatureUrl(u.creepId, sil.build);
      if (creatureUrl) {
        void loadModelAsset(creatureUrl).then((asset) => {
          if (asset && this.isLive() && token === this.sceneToken && this.views.get(u.uid)?.rig === rig) {
            mountHeroModel(rig, cloneModel(asset.scene), asset.animations);
          }
        });
      }
    }

    const ringColor = u.team === this.playerTeam ? 0x5ad95a : 0xe05a5a;
    const ring = buildSelectionRing(u.radius / WORLD_SCALE + 0.15, ringColor);
    ring.visible = false;
    rig.root.add(ring);

    // mesh HP bars avoid per-unit canvases/textures and share one plane geometry.
    const hpBar = new THREE.Group();
    hpBar.position.y = rig.height + 0.55;
    hpBar.renderOrder = 40;
    const hpBg = new THREE.Mesh(
      HP_BAR_GEOMETRY,
      new THREE.MeshBasicMaterial({ color: '#080a0e', transparent: true, opacity: 0.82, depthTest: false, depthWrite: false })
    );
    hpBg.scale.set(HP_BAR_WIDTH, HP_BAR_HEIGHT, 1);
    const hpMaterial = new THREE.MeshBasicMaterial({ color: '#5ad95a', depthTest: false, depthWrite: false });
    const hpFill = new THREE.Mesh(HP_BAR_GEOMETRY, hpMaterial);
    hpFill.position.z = 0.002;
    hpFill.scale.set(HP_BAR_WIDTH, HP_BAR_HEIGHT * 0.68, 1);
    const manaFill = new THREE.Mesh(
      HP_BAR_GEOMETRY,
      new THREE.MeshBasicMaterial({ color: '#4a90e2', depthTest: false, depthWrite: false })
    );
    manaFill.position.set(0, -HP_BAR_HEIGHT * 0.38, 0.004);
    manaFill.scale.set(HP_BAR_WIDTH, MANA_BAR_HEIGHT, 1);
    hpBar.add(hpBg, hpFill, manaFill);
    rig.root.add(hpBar);

    // stun stars
    const stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09),
        new THREE.MeshBasicMaterial({ color: '#ffe27d' })
      );
      star.userData.i = i;
      stars.add(star);
    }
    stars.position.y = rig.height + 0.25;
    stars.visible = false;
    rig.root.add(stars);

    // magic immunity shell
    const immuneShell = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.9, u.radius / WORLD_SCALE + 0.45), 10, 8),
      new THREE.MeshBasicMaterial({ color: '#7adf6a', transparent: true, opacity: 0.16, depthWrite: false })
    );
    immuneShell.position.y = rig.height * 0.55;
    immuneShell.visible = false;
    rig.root.add(immuneShell);

    return {
      rig, anim: newAnimState(), ring, hpBar, hpFill, manaFill, hpMaterial,
      lastHpPct: -1, lastManaPct: -1, lastTeamColor: '',
      stars, immuneShell, lastItemVisualKey: this.itemVisualKey(u), removeAt: 0
    };
  }

  private updateView(u: Unit, view: UnitView, dt: number, simTime: number): void {
    const { rig } = view;
    const visualKey = this.itemVisualKey(u);
    if (visualKey !== view.lastItemVisualKey) {
      applyItemAppearances(rig, this.itemAppearancesFor(u));
      view.lastItemVisualKey = visualKey;
    }
    const wx = u.pos.x / WORLD_SCALE;
    const wz = u.pos.y / WORLD_SCALE;
    const wy = this.terrain.heightAt(u.pos.x, u.pos.y);

    // smooth visual position (sim ticks at 30 Hz; render is faster)
    const k = Math.min(1, dt * 18);
    if (rig.root.position.lengthSq() === 0) rig.root.position.set(wx, wy, wz);
    rig.root.position.x += (wx - rig.root.position.x) * k;
    rig.root.position.z += (wz - rig.root.position.z) * k;
    rig.root.position.y = wy;

    // facing: sim dir (cos f, sin f) on (x,z); rig forward is +z
    const targetRotY = Math.atan2(Math.cos(u.facing), Math.sin(u.facing));
    let dr = targetRotY - rig.root.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    rig.root.rotation.y += dr * Math.min(1, dt * 12);

    // Overworld LOD (§3.16): far units freeze their pose, mid units animate at
    // a reduced cadence. The active hero and nearby combat always animate full.
    const distLod = Math.hypot(wx - this.camTarget.x, wz - this.camTarget.z);
    const tier = lodForDistance(distLod);
    if (shouldAnimateAtLod(tier, this.frameParity)) {
      animateRig(rig, u, view.anim, dt, this.time, simTime);
    }

    // death cleanup timer
    if (!u.alive && view.removeAt === 0) view.removeAt = this.time + 2.2;
    if (u.alive) view.removeAt = 0;

    // visibility (fog of war is not in P1; invis only)
    const visible = u.alive ? u.isVisibleTo(this.playerTeam, simTime) : true;
    rig.root.visible = visible || u.team === this.playerTeam;
    if (u.summary.invisible && u.team === this.playerTeam) {
      for (const m of rig.materials) {
        m.transparent = true;
        m.opacity = 0.4;
      }
    } else if (u.isEcho && u.alive) {
      // echo flag (§3.3): translucent, desaturated read
      for (const m of rig.materials) {
        m.transparent = true;
        m.opacity = 0.5;
      }
    } else if (u.alive) {
      for (const m of rig.materials) {
        if (m.transparent && view.anim.deathT === 0) {
          m.transparent = false;
          m.opacity = 1;
        }
      }
    }

    // selection ring + team color
    view.ring.visible = u.uid === this.selectedUid && u.alive;

    // hp bar
    view.hpBar.visible = u.alive && u.kind !== 'npc';
    if (view.hpBar.visible) {
      view.hpBar.rotation.y = -rig.root.rotation.y;
      this.redrawHpBar(u, view);
    }

    // status indicators
    const stunned = u.summary.stunned || u.summary.hexed || u.summary.frozen || u.summary.sleeping;
    view.stars.visible = u.alive && stunned;
    if (view.stars.visible) {
      for (const star of view.stars.children) {
        const i = star.userData.i as number;
        const a = this.time * 3 + (i * Math.PI * 2) / 3;
        star.position.set(Math.cos(a) * 0.45, Math.sin(this.time * 5 + i) * 0.06, Math.sin(a) * 0.45);
      }
    }
    view.immuneShell.visible = u.alive && u.summary.magicImmune;
    if (view.immuneShell.visible) {
      (view.immuneShell.material as THREE.MeshBasicMaterial).opacity = 0.13 + Math.sin(this.time * 6) * 0.05;
    }
    if (tier === 'full') rig.itemLayer.rotation.y = Math.sin(this.time * 1.6 + u.uid) * 0.035;
  }

  private itemVisualKey(u: Unit): string {
    return u.items.map((it) => it?.defId ?? '-').join('|');
  }

  private itemAppearancesFor(u: Unit): ItemAppearanceSpec[] {
    return u.items
      .map((it) => (it ? REG.items.get(it.defId)?.appearance : undefined))
      .filter((app): app is ItemAppearanceSpec => !!app);
  }

  private attackVisualsFor(u: Unit): AttackVisualSpec[] {
    return u.items.flatMap((it) => (it ? (REG.items.get(it.defId)?.attackVisual ?? []) : []));
  }

  private playAttackVisuals(attackerUid: number, targetUid: number, sim: Sim): void {
    const attacker = sim.unit(attackerUid);
    const target = sim.unit(targetUid);
    if (!attacker || !target) return;
    const visuals = this.attackVisualsFor(attacker);
    if (visuals.length === 0) return;
    const view = this.views.get(attacker.uid);
    if (view && visuals.some((v) => v.kind === 'crit-lunge')) view.anim.lungeFlash = 1;
    for (const visual of visuals) this.vfx.attackVisual(visual, attacker.pos, target.pos);
  }

  private redrawHpBar(u: Unit, view: UnitView): void {
    const hpPct = Math.max(0, u.hp / u.stats.maxHp);
    const manaPct = u.stats.maxMana > 0 ? u.mana / u.stats.maxMana : 0;
    const teamColor = u.team === this.playerTeam ? '#5ad95a' : u.team === 2 ? '#d9b75a' : '#e05a5a';
    if (
      Math.abs(hpPct - view.lastHpPct) < 0.004 &&
      Math.abs(manaPct - view.lastManaPct) < 0.01 &&
      teamColor === view.lastTeamColor
    ) {
      return;
    }
    view.lastHpPct = hpPct;
    view.lastManaPct = manaPct;
    view.lastTeamColor = teamColor;
    const isHero = u.kind === 'hero';
    view.hpMaterial.color.set(teamColor);
    const hpWidth = HP_BAR_WIDTH * Math.max(0, Math.min(1, hpPct));
    view.hpFill.scale.x = hpWidth;
    view.hpFill.position.x = -HP_BAR_WIDTH / 2 + hpWidth / 2;
    view.hpFill.scale.y = HP_BAR_HEIGHT * (isHero ? 0.58 : 0.74);
    view.hpFill.position.y = isHero ? HP_BAR_HEIGHT * 0.12 : 0;
    const manaWidth = HP_BAR_WIDTH * Math.max(0, Math.min(1, manaPct));
    view.manaFill.visible = isHero;
    view.manaFill.scale.x = manaWidth;
    view.manaFill.position.x = -HP_BAR_WIDTH / 2 + manaWidth / 2;
  }

  // ---------- day/night ----------

  private updateDayNight(t01: number): void {
    // t in [0,1): 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.5..1 = night
    const isDay = t01 < 0.5;
    if (this.lastNight !== !isDay) {
      this.lastNight = !isDay;
      this.applyEnvPhase(this.lastNight);
    }
    const sunT = isDay ? t01 / 0.5 : (t01 - 0.5) / 0.5;
    const elev = Math.sin(sunT * Math.PI); // 0..1..0
    const az = sunT * Math.PI; // east → west

    // pick palette: blend near transitions
    const edge = 0.08;
    let a = DAY, b = DAY, mix = 0;
    if (isDay) {
      if (sunT < edge) { a = DUSK; b = DAY; mix = sunT / edge; }
      else if (sunT > 1 - edge) { a = DAY; b = DUSK; mix = (sunT - (1 - edge)) / edge; }
      else { a = DAY; b = DAY; mix = 0; }
    } else {
      if (sunT < edge) { a = DUSK; b = NIGHT; mix = sunT / edge; }
      else if (sunT > 1 - edge) { a = NIGHT; b = DUSK; mix = (sunT - (1 - edge)) / edge; }
      else { a = NIGHT; b = NIGHT; mix = 0; }
    }
    const sky = a.sky.clone().lerp(b.sky, mix);
    const fog = a.fog.clone().lerp(b.fog, mix);
    const sunC = a.sun.clone().lerp(b.sun, mix);
    const hemiI = a.hemi + (b.hemi - a.hemi) * mix;
    const sunI = (a.sunI + (b.sunI - a.sunI) * mix) * (isDay ? 0.35 + elev * 0.65 : 1);

    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(fog);
    this.hemi.intensity = hemiI;
    this.sun.color.copy(sunC);
    this.sun.intensity = sunI;

    // IBL is a constant fill, so modulate it with the cycle. The night floor was
    // near-zero (~0.02) which read as black; lift it so PBR materials keep an
    // ambient read at night while staying clearly dimmer than noon (§3.2).
    const envI = (isDay ? 0.4 + 0.6 * elev : 0.34 + 0.16 * elev) * 0.32;
    (this.scene as unknown as { environmentIntensity: number }).environmentIntensity = envI;

    // Sky dome gradient: deepened zenith over a hazy horizon that matches fog.
    (this.skyMat.uniforms.uTop.value as THREE.Color).copy(sky).multiplyScalar(0.78);
    (this.skyMat.uniforms.uBottom.value as THREE.Color).copy(fog);

    const r = 160;
    const sunY = Math.max(0.12, elev);
    this.sun.position.set(
      this.camTarget.x + Math.cos(az) * r * 0.8,
      sunY * r,
      this.camTarget.z + Math.sin(az) * r * 0.4 - r * 0.3
    );
    this.sun.target.position.copy(this.camTarget);

    // Rim light sits opposite the sun and stays cool; a touch stronger at night
    // so silhouettes keep their moonlit edge.
    this.rim.position.set(
      this.camTarget.x - Math.cos(az) * r * 0.7,
      r * 0.45,
      this.camTarget.z - Math.sin(az) * r * 0.4 + r * 0.35
    );
    this.rim.target.position.copy(this.camTarget);
    this.rim.intensity = isDay ? 0.28 + elev * 0.28 : 0.42;

    // Drive the color-grade pass from biome + day/night (§3.1).
    if (this.gradePass) {
      const u = this.gradePass.uniforms;
      const night = Math.min(0.9, Math.max(0, 1 - sunI / 1.0));
      const bg = BIOME_GRADE[this.biome] ?? BIOME_GRADE.grass;
      const lerp = (x: number, y: number) => x + (y - x) * night;
      (u.uTint.value as THREE.Color).setRGB(
        lerp(bg.tint[0], NIGHT_GRADE.tint[0]),
        lerp(bg.tint[1], NIGHT_GRADE.tint[1]),
        lerp(bg.tint[2], NIGHT_GRADE.tint[2])
      );
      u.uSaturation.value = lerp(bg.sat, NIGHT_GRADE.sat);
      u.uContrast.value = lerp(bg.contrast, NIGHT_GRADE.contrast);
      u.uBrightness.value = lerp(1.0, 0.92);
      u.uVignette.value = lerp(0.82, 0.6);

      // WS-H per-element accent: nudge the whole frame toward the dominant cast's
      // hue without darkening (the accent is normalized to unit luminance), so a
      // Black Hole pushes violet, an inferno pushes warm, for the beat of the cast.
      if (this.accentStrength > 0.001) {
        const avg = (this.accent.r + this.accent.g + this.accent.b) / 3 || 1;
        const s = this.accentStrength;
        const tint = u.uTint.value as THREE.Color;
        tint.setRGB(
          tint.r * (1 - s) + (this.accent.r / avg) * s,
          tint.g * (1 - s) + (this.accent.g / avg) * s,
          tint.b * (1 - s) + (this.accent.b / avg) * s
        );
        u.uSaturation.value *= 1 + s * 0.18;
      }
      u.uStrength.value = this.gradeScale;
    }
  }

  /** Is it night for gameplay flags? */
  static isNight(t01: number): boolean {
    return t01 >= 0.5;
  }

  // ---------- camera ----------

  private worldPosForUnit(u: Unit): THREE.Vector3 {
    return new THREE.Vector3(
      u.pos.x / WORLD_SCALE,
      this.terrain.heightAt(u.pos.x, u.pos.y),
      u.pos.y / WORLD_SCALE
    );
  }

  private stageUnit(target: 'player' | 'ally' | 'boss' | 'region' | 'item' | 'tower', sim: Sim, follow: Unit | null): Unit | null {
    if (target === 'player') return follow ?? sim.unitsArr.find((u) => u.alive && u.team === this.playerTeam) ?? null;
    if (target === 'ally') return sim.unitsArr.find((u) => u.alive && u.team === this.playerTeam && u.uid !== follow?.uid) ?? follow ?? null;
    if (target === 'boss') {
      return sim.unitsArr.find((u) => u.alive && u.team !== this.playerTeam && u.ctrl.kind === 'boss')
        ?? sim.unitsArr.find((u) => u.alive && u.team !== this.playerTeam)
        ?? null;
    }
    return null;
  }

  private primaryStageTarget(view: CinematicView): 'player' | 'ally' | 'boss' | 'region' | 'item' | 'tower' | null {
    const explicit = view.stage.find((s): s is Extract<StageAction, { kind: 'focus' }> => s.kind === 'focus');
    if (explicit) return explicit.target;
    const gesture = view.stage.find((s): s is Extract<StageAction, { kind: 'gesture' }> => s.kind === 'gesture');
    if (gesture) return gesture.target;
    const narrative = view.stage.find((s) =>
      (s.kind === 'develop-character' || s.kind === 'advance-plot' || s.kind === 'introduce-conflict' || s.kind === 'reveal-mystery') && !!s.target
    );
    return narrative && 'target' in narrative ? narrative.target ?? null : null;
  }

  private stageWorldTarget(view: CinematicView, sim: Sim, follow: Unit | null): THREE.Vector3 {
    const target = this.primaryStageTarget(view);
    if (target === 'region') return this.camTarget.clone();
    if (target === 'tower') return new THREE.Vector3(this.camTarget.x, this.camTarget.y + 2.5, this.camTarget.z - 8);
    if (target === 'item') {
      const base = follow ? this.worldPosForUnit(follow) : this.camTarget.clone();
      return base.add(new THREE.Vector3(0, 1.1, 0));
    }
    if (target) {
      const u = this.stageUnit(target, sim, follow);
      if (u) return this.worldPosForUnit(u).add(new THREE.Vector3(0, 0.9, 0));
    }
    if (follow) return this.worldPosForUnit(follow).add(new THREE.Vector3(0, 0.9, 0));
    return this.camTarget.clone();
  }

  private stageSimTarget(view: CinematicView, sim: Sim, follow: Unit | null): { x: number; y: number } {
    const target = this.primaryStageTarget(view);
    if (target && target !== 'region' && target !== 'tower' && target !== 'item') {
      const u = this.stageUnit(target, sim, follow);
      if (u) return { x: u.pos.x, y: u.pos.y };
    }
    if (follow) return { x: follow.pos.x, y: follow.pos.y };
    return { x: this.camTarget.x * WORLD_SCALE, y: this.camTarget.z * WORLD_SCALE };
  }

  private applyCinematicStage(view: CinematicView | null, sim: Sim, follow: Unit | null): void {
    if (!view) {
      this.cinematicBeatKey = '';
      return;
    }
    const firstFrameOfBeat = view.beatKey !== this.cinematicBeatKey;
    if (firstFrameOfBeat) {
      this.cinematicBeatKey = view.beatKey;
      for (const action of view.stage) {
        if (action.kind !== 'vfx') continue;
        const vfx: VfxSpec = { archetype: action.archetype, color: view.photosensitive ? '#d8d0aa' : action.color };
        this.vfx.cinematicStage(this.stageSimTarget(view, sim, follow), vfx);
        this.accentGrade(vfx.color, view.photosensitive ? 0.12 : 0.38);
        if (!this.reducedMotion && !view.photosensitive) this.addShake(action.archetype === 'storm' || action.archetype === 'global-mark' ? 0.22 : 0.12);
      }
    }

    for (const action of view.stage) {
      const gesture = action.kind === 'gesture' ? action.gesture : action.kind === 'develop-character' ? action.gesture : undefined;
      const target = action.kind === 'gesture' || action.kind === 'develop-character' ? action.target : undefined;
      if (!gesture || !target) continue;
      const u = this.stageUnit(target, sim, follow);
      const unitView = u ? this.views.get(u.uid) : undefined;
      if (unitView) applyCinematicGesture(unitView.rig, gesture, this.time);
    }
  }

  private updateCinematicCamera(view: CinematicView, sim: Sim, follow: Unit | null, dt: number): void {
    if (this.cameraMode !== 'cinematic') {
      if (this.cameraMode === 'follow' || this.cameraMode === 'map') this.gameplayCameraMode = this.cameraMode;
      this.cameraMode = 'cinematic';
      this.cinematicTarget.copy(this.stageWorldTarget(view, sim, follow));
      this.cinematicLookAt.copy(this.cinematicTarget);
    }

    const target = this.stageWorldTarget(view, sim, follow);
    const shotT = Math.max(0, Math.min(1, view.beatElapsed / Math.max(0.1, view.beatHold)));
    const ease = shotT * shotT * (3 - 2 * shotT);
    const move =
      view.shot.move === 'push-in' ? 1.18 + (0.72 - 1.18) * ease :
      view.shot.move === 'pull-back' ? 0.82 + (1.42 - 0.82) * ease :
      view.shot.move === 'rack-focus' ? 1.06 + Math.sin(ease * Math.PI) * -0.24 :
      1;

    let back = 15;
    let up = 12;
    let side = 0;
    switch (view.shot.angle) {
      case 'close':
        back = 6.8; up = 4.8; break;
      case 'low':
        back = 9.5; up = 3.2; break;
      case 'high':
        back = 9; up = 23; break;
      case 'bird-eye':
        back = 4; up = 31; break;
      case 'over-shoulder':
        back = 8; up = 5.5; side = 2.8; break;
      case 'through-objects':
        back = 13; up = 6.2; side = -4.2; break;
      case 'reflection':
        back = 7.5; up = 2.8; side = 1.5; break;
      case 'title-card':
        back = 14; up = 15; break;
      case 'wide':
      default:
        back = 21; up = 15; break;
    }
    if (view.shot.move === 'crane') up += 8 * ease;
    if (view.shot.move === 'orbit') side += 5.5 * Math.sin(ease * Math.PI * 2);
    if (view.shot.move === 'snap') {
      back *= 0.78;
      up *= 0.86;
    }

    const k = view.shot.move === 'snap' ? 1 : Math.min(1, dt * 5.5);
    this.cinematicTarget.lerp(target, k);
    const orbit = this.time * 0.08;
    const desired = new THREE.Vector3(
      this.cinematicTarget.x + (side * Math.cos(orbit) - back * 0.45) * move,
      this.cinematicTarget.y + up * move,
      this.cinematicTarget.z + (back + side * Math.sin(orbit)) * move
    );
    this.camera.position.lerp(desired, k);
    this.cinematicLookAt.lerp(this.cinematicTarget, Math.min(1, dt * 8));
    this.camera.lookAt(this.cinematicLookAt.x, this.cinematicLookAt.y, this.cinematicLookAt.z);
  }

  private updateCamera(follow: Unit | null, dt: number, sim: Sim, cinematicView: CinematicView | null): void {
    if (cinematicView) {
      this.updateCinematicCamera(cinematicView, sim, follow, dt);
      return;
    }
    if (this.cameraMode === 'cinematic') this.cameraMode = this.gameplayCameraMode;
    const targetBlend = this.cameraMode === 'map' ? 1 : 0;
    this.modeBlend += (targetBlend - this.modeBlend) * Math.min(1, dt * 5);

    if (follow) {
      const wx = follow.pos.x / WORLD_SCALE;
      const wz = follow.pos.y / WORLD_SCALE;
      const wy = this.terrain.heightAt(follow.pos.x, follow.pos.y);
      const k = Math.min(1, dt * 6);
      this.camTarget.x += (wx - this.camTarget.x) * k;
      this.camTarget.y += (wy - this.camTarget.y) * k;
      this.camTarget.z += (wz - this.camTarget.z) * k;
    }

    // follow mode: 16 back / 13 up. map mode: 5 back / 42 up (near top-down).
    const m = this.modeBlend;
    const back = (16 + (5 - 16) * m) * this.camZoom;
    const up = (13 + (42 - 13) * m) * this.camZoom;
    this.camera.position.set(this.camTarget.x, this.camTarget.y + up, this.camTarget.z + back);

    // Bounded camera shake: squared trauma so it's subtle until a real spike,
    // capped to a small world offset and skipped entirely under reducedMotion.
    if (!this.reducedMotion && this.shakeTrauma > 0.001) {
      const tr = this.shakeTrauma * this.shakeTrauma;
      const t = this.time * 41;
      const amp = 0.55 * tr * this.camZoom;
      this.camera.position.x += Math.sin(t * 1.31) * amp;
      this.camera.position.y += Math.sin(t * 1.73 + 1.1) * amp * 0.6;
      this.camera.position.z += Math.cos(t * 1.07) * amp;
    }
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 0.8 * (1 - m), this.camTarget.z);
  }

  private updateMapMarkers(): void {
    const opacity = Math.max(0, Math.min(1, (this.modeBlend - 0.18) / 0.5));
    for (const marker of this.mapMarkers) {
      marker.mesh.visible = opacity > 0.02;
      marker.material.opacity = 0.18 + opacity * 0.58;
      const pulse = 1 + Math.sin(this.time * 3 + marker.mesh.position.x) * 0.04 * opacity;
      marker.mesh.scale.setScalar(pulse);
    }
  }

  // ---------- picking ----------

  /** Raycast from screen coords; returns hovered unit uid or ground sim-point. */
  pick(clientX: number, clientY: number, sim: Sim): { uid?: number; ground?: { x: number; y: number } } {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    // units first: ray vs cylinder approx (distance from ray to unit axis)
    let best: { uid: number; d: number } | null = null;
    for (const u of sim.unitsArr) {
      if (!u.alive) continue;
      const view = this.views.get(u.uid);
      if (!view || !view.rig.root.visible) continue;
      const center = new THREE.Vector3(
        view.rig.root.position.x,
        view.rig.root.position.y + view.rig.height * 0.55,
        view.rig.root.position.z
      );
      const r = Math.max(0.55, u.radius / WORLD_SCALE + 0.25);
      const distToRay = this.raycaster.ray.distanceToPoint(center);
      if (distToRay < r) {
        const along = center.clone().sub(this.raycaster.ray.origin).dot(this.raycaster.ray.direction);
        if (!best || along < best.d) best = { uid: u.uid, d: along };
      }
    }
    if (best) return { uid: best.uid };

    // ground: intersect y≈avg plane then refine with height fn
    const pt = new THREE.Vector3();
    this.groundPlane.constant = -this.camTarget.y;
    if (this.raycaster.ray.intersectPlane(this.groundPlane, pt)) {
      return { ground: { x: pt.x * WORLD_SCALE, y: pt.z * WORLD_SCALE } };
    }
    return {};
  }

  worldDayLength(): number {
    return TUNING.dayLengthSec;
  }
}
