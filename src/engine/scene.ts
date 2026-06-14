import * as THREE from 'three';
import type { AttackVisualSpec, DungeonRoom, GraphicsCrowdDetail, GraphicsDistance, GraphicsIntensityOverride, GraphicsTierOverride, GroundItemDrop, ItemAppearanceSpec, RegionDef, RoomTemplate, SilhouetteSpec, StageAction, Vec2, VfxSpec } from '../core/types';
import type { Sim } from '../core/sim';
import type { Unit } from '../core/unit';
import { REG } from '../core/registry';
import { buildTerrain, type TerrainInfo } from './terrain';
import { applyAuthoredSilhouette, applyHeroLikeness, applyItemAppearances, attachHeroWeaponModel, attachHoldoutSignatureModel, buildUnitRig, buildSelectionRing, mountHeroModel, recolorToPalette, type UnitRig } from './models';
import { HeroAssetLoader, heroAssetEntry, creepCreatureUrl, ENABLED_HOLDOUT_MODELS, heroBaseId, holdoutSignatureUrl } from './assets';
import { animateRig, applyCinematicGesture, newAnimState, type AnimState } from './animator';
import { loadVfxBeamRamp, loadVfxTextureAtlas, VfxManager } from './vfx';
import type { CinematicView } from './cinematic';
import { lodForDistance, shouldAnimateAtLod, shouldUseCrowdImpostor, type LodTier } from './lod';
import { WORLD_SCALE } from './scale';
import { TUNING } from '../data/tuning';
import { rarityColor } from '../data/quality';
import { clampedPixelRatio, higherQualityTier, lowerQualityTier, qualityPreset, type QualityTier, type QualityPreset } from './performance';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
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
  lastItemVisualEpoch: number;
  materialMode: 'shared' | 'unique';
  materialOriginals: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  materialClones: Set<THREE.Material>;
  shadowCasters: THREE.Mesh[];
  shadowCasting: boolean;
  removeAt: number; // time to despawn after death
}

interface UnitVisualSpec {
  sil: SilhouetteSpec;
  palette: [string, string, string];
  key: string;
}

interface CrowdImpostorBatch {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshStandardMaterial;
  capacity: number;
  count: number;
}

interface MapMarker {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

interface GroundItemView {
  root: THREE.Group;
  disc: THREE.Mesh;
  glow: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  glowMaterial: THREE.MeshBasicMaterial;
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
  qualityCeiling: QualityTier;
  dpr: number;
  adaptiveScale: number;
  adaptiveAuto: boolean;
  frameTarget: 30 | 60;
}

type SceneGraphicsControls = {
  exposure?: number;
  grade?: number;
  reducedMotion?: boolean;
  autoAdjustQuality?: boolean;
  frameTarget?: 30 | 60;
  bloom?: GraphicsIntensityOverride;
  ambientOcclusion?: GraphicsTierOverride;
  antiAliasing?: GraphicsTierOverride;
  shadows?: GraphicsIntensityOverride;
  drawDistance?: GraphicsDistance;
  crowdDetail?: GraphicsCrowdDetail;
  vfxDensity?: number;
  screenShake?: number;
};

// Hemi is deliberately low: the PBR env map now supplies most of the ambient
// fill, so a strong hemisphere light on top would wash the scene out.
const DAY = {
  sky: new THREE.Color('#8fc3e8'),
  fog: new THREE.Color('#a8d0e8'),
  sun: new THREE.Color('#fff2d8'),
  hemi: 0.6,
  sunI: 1.15
};
const DUSK = {
  sky: new THREE.Color('#d98a5e'),
  fog: new THREE.Color('#caa07a'),
  sun: new THREE.Color('#ffb36a'),
  hemi: 0.46,
  sunI: 0.78
};
const NIGHT = {
  sky: new THREE.Color('#16213b'),
  fog: new THREE.Color('#1d2a48'),
  sun: new THREE.Color('#9db8e8'),
  // Moonlit, not pitch-black: enough hemi + moon key to read terrain and units
  // (GRAPHICS_SPEC §3.2). The cool sun color + dark sky + grade keep it night.
  hemi: 0.56,
  sunI: 0.5
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
    uVignette: { value: 0.9 },
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
      float vig = smoothstep(0.9, uVignette * 0.5, d);
      c *= mix(1.0, vig, 0.3);
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

interface GradeTarget { tint: [number, number, number]; sat: number; contrast: number; brightness?: number; vignette?: number; }
const BIOME_GRADE: Record<string, GradeTarget> = {
  grass: { tint: [1.03, 1.01, 0.94], sat: 1.12, contrast: 1.06 },
  forest: { tint: [0.98, 1.04, 0.96], sat: 1.14, contrast: 1.07 },
  snow: { tint: [0.96, 0.99, 1.07], sat: 0.96, contrast: 1.08 },
  desert: { tint: [1.07, 1.0, 0.88], sat: 1.06, contrast: 1.05 },
  wasteland: { tint: [1.06, 0.95, 0.9], sat: 0.86, contrast: 1.1 },
  coast: { tint: [0.98, 1.01, 1.05], sat: 1.1, contrast: 1.05 }
};
const NIGHT_GRADE: GradeTarget = { tint: [0.82, 0.9, 1.14], sat: 0.78, contrast: 1.06 };
const CINEMATIC_GRADES: { re: RegExp; grade: GradeTarget; strength: number }[] = [
  { re: /lightless|black|shadow|dark|severed|void/i, grade: { tint: [0.78, 0.82, 1.08], sat: 0.82, contrast: 1.24, brightness: 0.9, vignette: 0.5 }, strength: 0.48 },
  { re: /cryo|frost|ice|snow|banshee|blue|moon|silver|night|zet|violet/i, grade: { tint: [0.78, 0.92, 1.2], sat: 0.98, contrast: 1.14, brightness: 0.95, vignette: 0.56 }, strength: 0.42 },
  { re: /hell|rift|red|blood|terror|dragon|ember|fire|rot|wasteland/i, grade: { tint: [1.18, 0.84, 0.72], sat: 1.12, contrast: 1.18, brightness: 0.96, vignette: 0.52 }, strength: 0.44 },
  { re: /fel|green|jungle|old green|wild|toxic/i, grade: { tint: [0.82, 1.16, 0.78], sat: 1.1, contrast: 1.11, brightness: 0.98, vignette: 0.62 }, strength: 0.38 },
  { re: /gold|dawn|radiant|badge|crown|sun|pit|aegis|victory|warm/i, grade: { tint: [1.17, 1.05, 0.78], sat: 1.12, contrast: 1.1, brightness: 1.02, vignette: 0.66 }, strength: 0.36 },
  { re: /sepia|sand|star|desert|amber|hollow/i, grade: { tint: [1.12, 0.98, 0.74], sat: 1.0, contrast: 1.12, brightness: 0.98, vignette: 0.58 }, strength: 0.4 },
  { re: /teal|reef|coast|drowned|water|salt/i, grade: { tint: [0.78, 1.02, 1.1], sat: 1.02, contrast: 1.12, brightness: 0.96, vignette: 0.58 }, strength: 0.38 },
  { re: /desaturated|memory|history|flashback|ghost/i, grade: { tint: [0.92, 0.94, 1.02], sat: 0.62, contrast: 1.18, brightness: 0.94, vignette: 0.52 }, strength: 0.52 }
];

function cinematicGradeFor(shot: CinematicView['shot']): { grade: GradeTarget; strength: number } | null {
  const text = `${shot.palette} ${shot.mood}`;
  return CINEMATIC_GRADES.find((entry) => entry.re.test(text)) ?? null;
}

const HP_BAR_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const HP_BAR_WIDTH = 1.5;
const HP_BAR_HEIGHT = 0.16;
const MANA_BAR_HEIGHT = 0.035;
const UNIT_PICK_MIN_RADIUS = 0.85;
const UNIT_PICK_RADIUS_PADDING = 0.38;
const UNIT_PICK_VISUAL_RADIUS_FACTOR = 0.64;
const UNIT_PICK_BOTTOM_FRAC = 0.12;
const UNIT_PICK_TOP_PADDING = 0.35;
const GROUND_ITEM_PICK_RADIUS = 0.72;
const BLOOM_RESOLUTION_SCALE = 0.5;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const CROWD_IMPOSTOR_GEOMETRY = new THREE.ConeGeometry(0.45, 1.45, 6);
CROWD_IMPOSTOR_GEOMETRY.translate(0, 0.725, 0);

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
  private gtaoPass: GTAOPass | null = null;
  private skyMat: THREE.ShaderMaterial;
  private skyDome: THREE.Mesh;
  private weather: THREE.Points | null = null;
  private weatherVel: Float32Array | null = null;
  private views = new Map<number, UnitView>();
  private crowdImpostors = new Map<string, CrowdImpostorBatch>();
  private heroAssets = new HeroAssetLoader();
  private disposed = false;
  private sceneToken = 0;
  private readonly onResize = (): void => this.resize();
  // Live, user-tunable graphics state (GRAPHICS_SPEC §6 settings).
  private exposureBase = 0.92;
  private gradeScale = 1;
  private reducedMotion = false;
  private bloomOverride: GraphicsIntensityOverride = 'tier';
  private ambientOcclusionOverride: GraphicsTierOverride = 'tier';
  private antiAliasingOverride: GraphicsTierOverride = 'tier';
  private shadowOverride: GraphicsIntensityOverride = 'tier';
  private drawDistanceScale = 1;
  private crowdDetail: GraphicsCrowdDetail = 'auto';
  private vfxDensity = 1;
  private screenShakeScale = 1;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pickSegmentStart = new THREE.Vector3();
  private pickSegmentEnd = new THREE.Vector3();
  private pickRayPoint = new THREE.Vector3();
  private groundItemPoint = new THREE.Vector3();
  private groundItemViews = new Map<number, GroundItemView>();
  private groundItemGroup = new THREE.Group();
  private mapMarkers: MapMarker[] = [];
  private dungeonRoomGroup: THREE.Group | null = null;
  private dungeonRoomFloorY: number | null = null;

  cameraMode: CameraMode = 'follow';
  private gameplayCameraMode: 'follow' | 'map' = 'follow';
  private camTarget = new THREE.Vector3();
  private viewFrustum = new THREE.Frustum();
  private viewFrustumMatrix = new THREE.Matrix4();
  private unitCullSphere = new THREE.Sphere();
  private crowdMatrix = new THREE.Matrix4();
  private crowdQuat = new THREE.Quaternion();
  private crowdScale = new THREE.Vector3();
  private crowdPos = new THREE.Vector3();
  private cinematicTarget = new THREE.Vector3();
  private cinematicLookAt = new THREE.Vector3();
  private cinematicBeatKey = '';
  private cinematicGrade: GradeTarget | null = null;
  private cinematicGradeStrength = 0;
  private camZoom = 1; // user wheel zoom within mode
  private modeBlend = 0; // 0 = follow, 1 = map
  selectedUid = -1;
  playerTeam = 0;
  private time = 0;
  private frameParity = 0; // flips 0/1 each frame to drive reduced-LOD animation cadence
  private frameMsSamples: number[] = [];
  private lastRenderCalls = 0;
  private lastRenderTriangles = 0;
  private qualityCeiling: QualityTier;
  private adaptiveAuto = true;
  private adaptiveFrameTargetMs = 1000 / 60;
  private adaptiveScale = 1;
  private adaptiveOverBudgetSec = 0;
  private adaptiveUnderBudgetSec = 0;
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
    this.qualityCeiling = quality;
    this.biome = region.biome;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !qualityCfg.smaa });
    // EffectComposer performs multiple renders per frame. Keep renderer.info
    // accumulating until update() captures the full frame, then reset next frame.
    this.renderer.info.autoReset = false;
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
      (this.scene as unknown as { environmentIntensity: number }).environmentIntensity = 0.45;
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

    this.terrain = buildTerrain(region, () => this.isLive(), { staticPropShadows: qualityCfg.staticPropShadows });
    this.scene.add(this.terrain.group);

    if (qualityCfg.weatherDensity > 0) this.buildWeather(region.biome, qualityCfg.weatherDensity);

    this.vfx = new VfxManager((x, y) => this.visualGroundHeightAt(x, y), qualityCfg.transientVfxCap);
    this.scene.add(this.vfx.group);
    this.groundItemGroup.name = 'ground-item-drops';
    this.scene.add(this.groundItemGroup);
    if (qualityCfg.tier !== 'low') {
      void loadVfxTextureAtlas();
      void loadVfxBeamRamp();
    }

    this.createMapMarkers(region);

    if (qualityCfg.postFx) this.setupComposer(qualityCfg);
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  private isLive(): boolean {
    return !this.disposed;
  }

  groundHeightAt(simX: number, simY: number): number {
    return this.visualGroundHeightAt(simX, simY);
  }

  private visualGroundHeightAt(simX: number, simY: number): number {
    return this.dungeonRoomFloorY ?? this.terrain.heightAt(simX, simY);
  }

  private applyPixelRatio(): void {
    const base = clampedPixelRatio(window.devicePixelRatio, this.quality.tier);
    this.renderer.setPixelRatio(Math.max(0.75, base * this.adaptiveScale));
  }

  /** Build the EffectComposer stack: render → bloom → grade → output → SMAA.
   *  Each pass is gated by the quality preset (GRAPHICS_SPEC §1.5, §9.6). */
  private effectiveQuality(base: QualityPreset): QualityPreset {
    const q: QualityPreset = { ...base };
    if (this.bloomOverride === 'off') q.bloom = false;
    else if (this.bloomOverride !== 'tier') {
      q.bloom = true;
      q.bloomStrength = this.bloomOverride === 'low' ? Math.min(q.bloomStrength, 0.45) : Math.max(q.bloomStrength, 0.75);
      q.bloomRadius = this.bloomOverride === 'low' ? Math.min(q.bloomRadius, 0.35) : Math.max(q.bloomRadius, 0.55);
    }
    if (this.ambientOcclusionOverride !== 'tier') q.ao = this.ambientOcclusionOverride === 'on';
    if (this.antiAliasingOverride !== 'tier') q.smaa = this.antiAliasingOverride === 'on';
    if (this.shadowOverride === 'off') {
      q.shadows = false;
      q.staticPropShadows = false;
    } else if (this.shadowOverride === 'low') {
      q.shadows = true;
      q.staticPropShadows = false;
      q.shadowType = 'basic';
      q.shadowMapSize = Math.min(q.shadowMapSize, 1024);
    } else if (this.shadowOverride === 'high') {
      q.shadows = true;
      q.shadowType = 'pcf';
      q.shadowMapSize = Math.max(q.shadowMapSize, 2048);
    }
    q.transientVfxCap = Math.max(0, Math.round(q.transientVfxCap * this.vfxDensity));
    if (this.crowdDetail === 'full') q.fullRigAnimationBudget = Math.max(q.fullRigAnimationBudget, 64);
    else if (this.crowdDetail === 'balanced') q.fullRigAnimationBudget = Math.min(q.fullRigAnimationBudget, 24);
    else if (this.crowdDetail === 'reduced') q.fullRigAnimationBudget = Math.min(q.fullRigAnimationBudget, 12);
    return q;
  }

  private setupComposer(q: QualityPreset): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) {
      // Ground-contact AO right after the beauty pass so bloom/grade see the
      // occluded image. GTAO renders its own depth+normal pass internally, so
      // it scales with resolution, not scene complexity — hence ultra-only.
      const gtao = new GTAOPass(this.scene, this.camera, w, h);
      gtao.output = GTAOPass.OUTPUT.Default;
      this.gtaoPass = gtao;
      composer.addPass(gtao);
    }
    if (q.bloom) {
      const [bloomW, bloomH] = this.bloomSize(w, h);
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(bloomW, bloomH), q.bloomStrength, q.bloomRadius, 1.0);
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

  private bloomSize(w = window.innerWidth, h = window.innerHeight): [number, number] {
    return [
      Math.max(1, Math.floor(w * BLOOM_RESOLUTION_SCALE)),
      Math.max(1, Math.floor(h * BLOOM_RESOLUTION_SCALE))
    ];
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
    if (this.bloomPass) {
      const [bloomW, bloomH] = this.bloomSize(w, h);
      this.bloomPass.setSize(bloomW, bloomH);
    }
    this.smaaPass?.setSize(w, h);
    this.gtaoPass?.setSize(w, h);
  }

  /** Pre-compile the programs for everything currently in the scene against the
   *  camera, so the first rendered frame doesn't pay the GLSL compile/link cost
   *  as one visible hitch (GRAPHICS_SPEC §9.4). Call behind a loading screen. */
  prewarm(): void {
    this.renderer.compile(this.scene, this.camera);
    this.composer?.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sceneToken++;
    window.removeEventListener('resize', this.onResize);
    this.resetUnitViews();
    this.clearDungeonRoomVisuals();
    this.clearGroundItemViews();
    this.scene.remove(this.vfx.group);
    this.scene.remove(this.groundItemGroup);
    this.vfx.reset();
    this.disposeCrowdImpostors();
    if (this.weather) {
      this.scene.remove(this.weather);
      this.weather.geometry.dispose();
      (this.weather.material as THREE.Material).dispose();
      this.weather = null;
      this.weatherVel = null;
    }
    this.composer?.dispose();
    this.gtaoPass?.dispose();
    this.composer = null;
    this.gtaoPass = null;
    this.disposeHdrEnvs();
    this.scene.environment?.dispose();
    this.scene.environment = null;
    this.disposeOwnedObjectTree(this.scene);
    this.sun.shadow.map?.dispose();
    // NB: do NOT forceContextLoss() here. The canvas owns a single WebGL context
    // that every region rebuild reuses via getContext; losing it would break the
    // next GameScene. renderer.dispose() already frees this scene's GPU objects.
    this.renderer.dispose();
  }

  private disposeOwnedObjectTree(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if (obj.userData.sharedAsset) return;
      const mesh = obj as THREE.Mesh;
      const line = obj as THREE.Line;
      const points = obj as THREE.Points;
      const geometry = mesh.geometry ?? line.geometry ?? points.geometry;
      if (geometry) geometry.dispose();
      const material = mesh.material ?? line.material ?? points.material;
      const disposeMaterial = (m: unknown): void => {
        if (m instanceof THREE.Material) m.dispose();
      };
      if (Array.isArray(material)) material.forEach(disposeMaterial);
      else disposeMaterial(material);
    });
  }

  /** Live-apply user graphics settings: cheap scalar updates apply in place;
   *  pass/shadow/LOD controls rebuild only the quality-gated systems. */
  setGraphics(g: SceneGraphicsControls): void {
    let rebuildQuality = false;
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
    if (g.frameTarget !== undefined) {
      this.adaptiveFrameTargetMs = g.frameTarget === 30 ? 1000 / 30 : 1000 / 60;
      this.resetAdaptiveCounters();
    }
    if (g.autoAdjustQuality !== undefined) {
      this.adaptiveAuto = g.autoAdjustQuality;
      this.resetAdaptiveCounters();
      if (!this.adaptiveAuto) this.restoreQualityCeiling();
    }
    if (g.bloom !== undefined && g.bloom !== this.bloomOverride) {
      this.bloomOverride = g.bloom;
      rebuildQuality = true;
    }
    if (g.ambientOcclusion !== undefined && g.ambientOcclusion !== this.ambientOcclusionOverride) {
      this.ambientOcclusionOverride = g.ambientOcclusion;
      rebuildQuality = true;
    }
    if (g.antiAliasing !== undefined && g.antiAliasing !== this.antiAliasingOverride) {
      this.antiAliasingOverride = g.antiAliasing;
      rebuildQuality = true;
    }
    if (g.shadows !== undefined && g.shadows !== this.shadowOverride) {
      this.shadowOverride = g.shadows;
      rebuildQuality = true;
    }
    if (g.drawDistance !== undefined) {
      this.drawDistanceScale = g.drawDistance === 'low' ? 0.72 : g.drawDistance === 'high' ? 1.35 : 1;
    }
    if (g.crowdDetail !== undefined && g.crowdDetail !== this.crowdDetail) {
      this.crowdDetail = g.crowdDetail;
      rebuildQuality = true;
    }
    if (g.vfxDensity !== undefined) {
      const next = Math.max(0.5, Math.min(1.5, g.vfxDensity));
      if (Math.abs(next - this.vfxDensity) > 0.001) {
        this.vfxDensity = next;
        rebuildQuality = true;
      }
    }
    if (g.screenShake !== undefined) {
      this.screenShakeScale = Math.max(0, Math.min(1, g.screenShake));
    }
    if (rebuildQuality) this.applyQualityTier(this.quality.tier, true);
  }

  /** Add bounded camera-shake trauma (0..1). No-op under reducedMotion. Applied
   *  with a squared falloff in updateCamera so small hits barely move and big
   *  ones punch, then decay back to rest (WS-H hit-stop/shake feedback). */
  addShake(amount: number): void {
    if (this.reducedMotion) return;
    this.shakeTrauma = Math.min(1, this.shakeTrauma + amount * this.screenShakeScale);
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
    this.qualityCeiling = tier;
    this.adaptiveScale = 1;
    this.resetAdaptiveCounters();
    this.applyQualityTier(tier);
  }

  private restoreQualityCeiling(): void {
    if (this.quality.tier === this.qualityCeiling && this.adaptiveScale === 1) return;
    this.adaptiveScale = 1;
    this.applyQualityTier(this.qualityCeiling, false);
  }

  private resetAdaptiveCounters(): void {
    this.adaptiveOverBudgetSec = 0;
    this.adaptiveUnderBudgetSec = 0;
    this.adaptiveCooldownSec = 0;
  }

  private applyQualityTier(tier: QualityTier, resetCounters = false): void {
    const q = this.effectiveQuality(qualityPreset(tier));
    this.quality = q;
    if (resetCounters) this.resetAdaptiveCounters();
    this.applyPixelRatio();
    this.vfx.setTransientCap(q.transientVfxCap);

    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = q.shadowType === 'pcf' ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget; // re-alloc at new size
    this.terrain.setStaticPropShadows?.(q.staticPropShadows);
    if (!q.shadows) {
      for (const view of this.views.values()) this.setUnitShadowCasting(view, false);
    }

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
      // EffectComposer.dispose() does not dispose child passes, and GTAO owns
      // several render targets; release them explicitly so a tier switch is leak-free.
      this.gtaoPass?.dispose();
      this.composer = null;
      this.bloomPass = null;
      this.gradePass = null;
      this.smaaPass = null;
      this.gtaoPass = null;
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

  update(sim: Sim, followUnit: Unit | null, renderDt: number, timeOfDay01: number, cinematicView: CinematicView | null = null, groundItems: readonly GroundItemDrop[] = []): void {
    this.recordFrameMs(renderDt * 1000, renderDt);
    this.time += renderDt;
    this.frameParity ^= 1;
    // Decay the WS-H micro-feedback envelopes (shake fades fast, accent slower).
    if (this.shakeTrauma > 0) this.shakeTrauma = Math.max(0, this.shakeTrauma - renderDt * 1.9);
    if (this.accentStrength > 0) this.accentStrength = Math.max(0, this.accentStrength - renderDt * 0.85);
    this.refreshViewFrustum();
    this.syncUnits(sim, renderDt);
    this.syncGroundItems(groundItems);
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
    this.renderer.info.reset();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.lastRenderCalls = this.renderer.info.render.calls;
    this.lastRenderTriangles = this.renderer.info.render.triangles;
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
    if (!this.adaptiveAuto) return;
    this.adaptiveCooldownSec = Math.max(0, this.adaptiveCooldownSec - dt);
    const overBudgetMs = this.adaptiveFrameTargetMs * 1.32;
    const recoverMs = this.adaptiveFrameTargetMs * 0.9;

    if (frameMs > overBudgetMs) {
      this.adaptiveOverBudgetSec += dt;
      this.adaptiveUnderBudgetSec = 0;
    } else if (frameMs < recoverMs) {
      this.adaptiveUnderBudgetSec += dt;
      this.adaptiveOverBudgetSec = Math.max(0, this.adaptiveOverBudgetSec - dt * 2);
    } else {
      this.adaptiveOverBudgetSec = Math.max(0, this.adaptiveOverBudgetSec - dt);
      this.adaptiveUnderBudgetSec = Math.max(0, this.adaptiveUnderBudgetSec - dt);
    }

    if (this.adaptiveCooldownSec > 0) return;

    if (this.adaptiveOverBudgetSec >= 4) {
      if (this.adaptiveScale > 0.75) {
        this.adaptiveScale = Math.max(0.75, this.adaptiveScale * 0.9);
        this.applyPixelRatio();
        this.resize();
      } else {
        this.degradeAdaptiveTier();
      }
      this.adaptiveCooldownSec = 8;
      this.adaptiveOverBudgetSec = 0;
      this.adaptiveUnderBudgetSec = 0;
      return;
    }

    if (this.adaptiveUnderBudgetSec >= 12) {
      if (this.adaptiveScale < 1) {
        this.adaptiveScale = Math.min(1, this.adaptiveScale * 1.1);
        this.applyPixelRatio();
        this.resize();
      } else {
        this.recoverAdaptiveTier();
      }
      this.adaptiveCooldownSec = 8;
      this.adaptiveOverBudgetSec = 0;
      this.adaptiveUnderBudgetSec = 0;
    }
  }

  private degradeAdaptiveTier(): void {
    const next = lowerQualityTier(this.quality.tier);
    if (!next) return;
    this.adaptiveScale = 1;
    this.applyQualityTier(next, false);
  }

  private recoverAdaptiveTier(): void {
    const next = higherQualityTier(this.quality.tier, this.qualityCeiling);
    if (!next) return;
    this.adaptiveScale = 1;
    this.applyQualityTier(next, false);
  }

  graphicsStats(): GraphicsRenderStats {
    const frames = this.frameStats();
    const info = this.renderer.info;
    const programs = (info as unknown as { programs?: unknown[] | null }).programs;
    return {
      frameMsAvg: frames.avg,
      frameMsP95: frames.p95,
      drawCalls: this.lastRenderCalls,
      triangles: this.lastRenderTriangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: programs ? programs.length : null,
      qualityTier: this.quality.tier,
      qualityCeiling: this.qualityCeiling,
      dpr: this.renderer.getPixelRatio(),
      adaptiveScale: this.adaptiveScale,
      adaptiveAuto: this.adaptiveAuto,
      frameTarget: this.adaptiveFrameTargetMs > 25 ? 30 : 60
    };
  }

  resetGraphicsStats(): void {
    this.frameMsSamples = [];
    this.adaptiveOverBudgetSec = 0;
    this.adaptiveUnderBudgetSec = 0;
    this.adaptiveCooldownSec = 0;
  }

  private refreshViewFrustum(): void {
    this.camera.updateMatrixWorld();
    this.viewFrustumMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.viewFrustum.setFromProjectionMatrix(this.viewFrustumMatrix);
  }

  /** Drop every cached unit view + transient VFX. Used when the rendered sim
   *  is swapped (e.g. entering/leaving a live gym fight) so unit ids from the
   *  new sim never alias views built for the old one. */
  resetUnitViews(): void {
    this.sceneToken++;
    for (const [, view] of this.views) {
      this.restoreSharedMaterials(view);
      this.scene.remove(view.rig.root);
    }
    this.views.clear();
    this.disposeCrowdImpostors();
    this.selectedUid = -1;
    this.vfx.reset();
  }

  private createGroundItemView(drop: GroundItemDrop): GroundItemView {
    const color = rarityColor(REG.item(drop.item.id).rarity);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.52,
      depthWrite: false
    });
    const root = new THREE.Group();
    root.name = `ground-item:${drop.uid}`;
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.48, 24), material);
    disc.rotation.x = -Math.PI / 2;
    disc.renderOrder = 35;
    const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), glowMaterial);
    glow.position.y = 0.34;
    glow.renderOrder = 36;
    root.add(disc, glow);
    this.groundItemGroup.add(root);
    return { root, disc, glow, material, glowMaterial };
  }

  private syncGroundItems(drops: readonly GroundItemDrop[]): void {
    const seen = new Set<number>();
    for (const drop of drops) {
      seen.add(drop.uid);
      let view = this.groundItemViews.get(drop.uid);
      if (!view) {
        view = this.createGroundItemView(drop);
        this.groundItemViews.set(drop.uid, view);
      }
      const y = this.visualGroundHeightAt(drop.pos.x, drop.pos.y) + 0.05;
      view.root.position.set(drop.pos.x / WORLD_SCALE, y, drop.pos.y / WORLD_SCALE);
      const pulse = 1 + Math.sin(this.time * 3.2 + drop.uid) * 0.08;
      view.disc.scale.setScalar(pulse);
      view.glow.position.y = 0.32 + Math.sin(this.time * 4.1 + drop.uid) * 0.08;
    }
    for (const [uid, view] of this.groundItemViews) {
      if (seen.has(uid)) continue;
      this.disposeGroundItemView(view);
      this.groundItemViews.delete(uid);
    }
  }

  private disposeGroundItemView(view: GroundItemView): void {
    this.groundItemGroup.remove(view.root);
    view.disc.geometry.dispose();
    view.glow.geometry.dispose();
    view.material.dispose();
    view.glowMaterial.dispose();
  }

  private clearGroundItemViews(): void {
    for (const [, view] of this.groundItemViews) this.disposeGroundItemView(view);
    this.groundItemViews.clear();
  }

  private disposeCrowdImpostors(): void {
    for (const batch of this.crowdImpostors.values()) {
      this.scene.remove(batch.mesh);
      batch.material.dispose();
    }
    this.crowdImpostors.clear();
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
      depthTest: false,
      depthWrite: false
    });
    const floorY = this.terrain.heightAt(template.size.x / 2, template.size.y / 2) + 0.08;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w / 2, floorY, h / 2);
    floor.renderOrder = 6;
    group.add(floor);

    const edgePoints: THREE.Vector3[] = [];
    const edgeSegments = 24;
    const pushEdgePoint = (x: number, y: number): void => {
      edgePoints.push(new THREE.Vector3(x / WORLD_SCALE, floorY + 0.16, y / WORLD_SCALE));
    };
    for (let i = 0; i <= edgeSegments; i++) pushEdgePoint(template.size.x * (i / edgeSegments), 0);
    for (let i = 1; i <= edgeSegments; i++) pushEdgePoint(template.size.x, template.size.y * (i / edgeSegments));
    for (let i = 1; i <= edgeSegments; i++) pushEdgePoint(template.size.x * (1 - i / edgeSegments), template.size.y);
    for (let i = 1; i <= edgeSegments; i++) pushEdgePoint(0, template.size.y * (1 - i / edgeSegments));
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePoints);
    const edge = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ color: roomColor, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false }));
    edge.renderOrder = 7;
    group.add(edge);

    const doorGeo = new THREE.RingGeometry(0.25, 0.42, 24);
    const doorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false });
    for (const c of template.connectors) {
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.rotation.x = -Math.PI / 2;
      door.position.set(c.at.x / WORLD_SCALE, floorY + 0.22, c.at.y / WORLD_SCALE);
      door.renderOrder = 8;
      group.add(door);
    }

    const anchorGeo = new THREE.CircleGeometry(0.18, 18);
    const anchorMat = new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.32, depthTest: false, depthWrite: false });
    for (const a of template.spawnAnchors) {
      const marker = new THREE.Mesh(anchorGeo, anchorMat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(a.x / WORLD_SCALE, floorY + 0.2, a.y / WORLD_SCALE);
      marker.renderOrder = 8;
      group.add(marker);
    }

    this.dungeonRoomGroup = group;
    this.dungeonRoomFloorY = floorY;
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
    this.dungeonRoomFloorY = null;
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
    for (const dungeon of region.dungeons ?? []) add(dungeon.pos.x, dungeon.pos.y, 0.6, 0xb28cff, 'ring');
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
    if (ev.t === 'loot-drop') {
      this.accentGrade(ev.color, ev.signature || ev.grade === 'pristine' ? 0.45 : 0.28);
      if (ev.signature || ev.grade === 'pristine') this.addShake(0.18);
    }
    this.vfx.handleEvent(ev, (uid) => {
      const u = sim.unit(uid);
      return u ? { x: u.pos.x, y: u.pos.y, h: 0 } : null;
    });
  }

  showOrderFeedback(point: Vec2, kind: 'move' | 'attack-move' | 'attack-unit', queued = false): void {
    this.vfx.orderPing(point, kind, queued);
  }

  private syncUnits(sim: Sim, dt: number): void {
    const seen = new Set<number>();
    let fullAnimationBudget = this.quality.fullRigAnimationBudget;
    this.beginCrowdImpostors();
    for (const u of sim.unitsArr) {
      if (u.kind === 'npc' && !u.alive) continue;
      seen.add(u.uid);
      const tier = this.lodTierForUnit(u);
      if (shouldUseCrowdImpostor({
        tier,
        crowdDetail: this.crowdDetail,
        fullAnimationBudget,
        selected: u.uid === this.selectedUid,
        alive: u.alive,
        isHero: u.kind === 'hero',
        isNpc: u.kind === 'npc'
      })) {
        const view = this.views.get(u.uid);
        if (view) this.hideViewForCrowd(view);
        this.syncCrowdImpostor(u, sim.time);
        continue;
      }
      let view = this.views.get(u.uid);
      if (!view) {
        if (!u.alive) continue;
        view = this.createView(u);
        this.views.set(u.uid, view);
      }
      fullAnimationBudget = this.updateView(u, view, dt, sim.time, fullAnimationBudget);
    }
    this.endCrowdImpostors();
    // remove views for despawned units or finished death anims
    for (const [uid, view] of this.views) {
      const u = sim.unit(uid);
      const gone = !u || !seen.has(uid);
      const deadLong = u && !u.alive && view.removeAt > 0 && this.time > view.removeAt;
      if (gone || deadLong) {
        this.restoreSharedMaterials(view);
        this.scene.remove(view.rig.root);
        this.views.delete(uid);
      }
    }
  }

  private lodTierForUnit(u: Unit): LodTier {
    const wx = u.pos.x / WORLD_SCALE;
    const wz = u.pos.y / WORLD_SCALE;
    const distLod = Math.hypot(wx - this.camTarget.x, wz - this.camTarget.z);
    return lodForDistance(distLod / this.drawDistanceScale);
  }

  private hideViewForCrowd(view: UnitView): void {
    view.rig.root.visible = false;
    this.setUnitShadowCasting(view, false);
    this.restoreSharedMaterials(view);
  }

  private beginCrowdImpostors(): void {
    for (const batch of this.crowdImpostors.values()) {
      batch.count = 0;
      batch.mesh.visible = false;
    }
  }

  private endCrowdImpostors(): void {
    for (const batch of this.crowdImpostors.values()) {
      batch.mesh.count = batch.count;
      batch.mesh.visible = batch.count > 0;
      if (batch.count > 0) {
        batch.mesh.instanceMatrix.needsUpdate = true;
        batch.mesh.computeBoundingSphere();
      }
    }
  }

  private syncCrowdImpostor(u: Unit, simTime: number): void {
    const visible = u.alive ? u.isVisibleTo(this.playerTeam, simTime) : true;
    if (!visible && u.team !== this.playerTeam) return;
    const spec = this.unitVisualSpec(u);
    const batch = this.ensureCrowdImpostorBatch(spec, TUNING.scaleCeilings.raidUnits);
    if (batch.count >= batch.capacity) return;
    const wx = u.pos.x / WORLD_SCALE;
    const wz = u.pos.y / WORLD_SCALE;
    const y = this.visualGroundHeightAt(u.pos.x, u.pos.y);
    const s = Math.max(0.55, spec.sil.scale ?? 1);
    const rotY = Math.atan2(Math.cos(u.facing), Math.sin(u.facing));
    this.crowdPos.set(wx, y, wz);
    this.crowdQuat.setFromAxisAngle(Y_AXIS, rotY);
    this.crowdScale.set(s, s, s);
    this.crowdMatrix.compose(this.crowdPos, this.crowdQuat, this.crowdScale);
    batch.mesh.setMatrixAt(batch.count, this.crowdMatrix);
    batch.count++;
  }

  private ensureCrowdImpostorBatch(spec: UnitVisualSpec, minCapacity: number): CrowdImpostorBatch {
    const existing = this.crowdImpostors.get(spec.key);
    if (existing && existing.capacity >= minCapacity) return existing;
    return this.growCrowdImpostorBatch(spec, Math.max(8, minCapacity));
  }

  private growCrowdImpostorBatch(spec: UnitVisualSpec, capacity: number): CrowdImpostorBatch {
    const old = this.crowdImpostors.get(spec.key);
    if (old) {
      this.scene.remove(old.mesh);
      old.material.dispose();
    }
    const material = new THREE.MeshStandardMaterial({
      color: spec.palette[0],
      emissive: spec.palette[2],
      emissiveIntensity: 0.08,
      roughness: 0.76,
      metalness: 0.12
    });
    const mesh = new THREE.InstancedMesh(CROWD_IMPOSTOR_GEOMETRY, material, capacity);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.visible = false;
    this.scene.add(mesh);
    const batch = { mesh, material, capacity, count: 0 };
    this.crowdImpostors.set(spec.key, batch);
    return batch;
  }

  private unitVisualSpec(u: Unit): UnitVisualSpec {
    let sil = u.kind === 'hero' && u.heroId ? REG.hero(u.heroId).silhouette : undefined;
    let palette: [string, string, string] | undefined =
      u.kind === 'hero' && u.heroId ? REG.hero(u.heroId).palette : undefined;
    let id = u.kind === 'hero' ? u.heroId ?? 'hero' : u.kind;
    if (u.kind === 'creep' && u.creepId) {
      const def = REG.creep(u.creepId);
      sil = def.silhouette;
      palette = def.palette;
      id = u.creepId;
    }
    if (u.visual) {
      sil = u.visual.silhouette;
      palette = u.visual.palette;
      id = `visual:${u.visual.silhouette.build}:${u.name}`;
    }
    if (!sil) sil = { build: 'biped', scale: 1 };
    if (!palette) palette = ['#888899', '#666677', '#aaaabb'];
    return { sil, palette, key: `${u.kind}:${id}:${sil.build}:${palette.join('/')}` };
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
    const { sil, palette } = this.unitVisualSpec(u);

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
    const mountHoldoutSignatureFallback = (): void => {
      // If a generated holdout replacement is absent or fails, keep the animated
      // procedural rig live and add the older signature kit over it.
      const signatureUrl = u.kind === 'hero' ? holdoutSignatureUrl(u.heroId) : null;
      if (!signatureUrl) return;
      void loadModelAsset(signatureUrl).then((asset) => {
        if (asset && this.isLive() && token === this.sceneToken && this.views.get(u.uid)?.rig === rig) {
          attachHoldoutSignatureModel(rig, cloneModel(asset.scene));
        }
      });
    };
    const assetEntry = u.kind === 'hero' ? heroAssetEntry(u.heroId) : null;
    const isHoldoutReplacement = !!(u.kind === 'hero' && u.heroId && ENABLED_HOLDOUT_MODELS.has(u.heroId));
    if (assetEntry) {
      void this.heroAssets.loadHero(assetEntry).then((asset) => {
        if (asset && this.isLive() && token === this.sceneToken && this.views.get(u.uid)?.rig === rig) {
          mountHeroModel(rig, cloneModel(asset.scene), asset.animations, assetEntry.clips);
          // WS-A within-cohort variation: stretch the shared base to this hero's
          // proportions and layer its innate identity gear over the authored body,
          // before items so the weapon counter-scale reads the final model scale.
          if (!isHoldoutReplacement) applyAuthoredSilhouette(rig, u.heroId!, palette);
          // WS-B: re-apply worn items now that sockets resolved, so the weapon hangs
          // off the authored hand bone instead of the hidden procedural one.
          applyItemAppearances(rig, this.itemAppearancesFor(u));
          if (!isHoldoutReplacement) {
            void this.heroAssets.loadHeroWeapon(assetEntry).then((weapon) => {
              if (weapon && this.isLive() && token === this.sceneToken && this.views.get(u.uid)?.rig === rig) {
                attachHeroWeaponModel(rig, cloneModel(weapon.scene));
                applyItemAppearances(rig, this.itemAppearancesFor(u));
              }
            });
          }
        } else if (!asset) {
          mountSharedBase();
          if (isHoldoutReplacement) mountHoldoutSignatureFallback();
        }
      });
    } else {
      mountSharedBase();
      mountHoldoutSignatureFallback();
    }

    // Phase 3 (GRAPHICS_SPEC §13): mount an authored Quaternius creature (CC0)
    // for creeps. Keep the procedural body visible underneath as a guaranteed
    // readable fallback; creature assets are an enhancement layer, not the floor.
    if (u.kind === 'creep') {
      const creatureUrl = creepCreatureUrl(u.creepId, sil.build);
      if (creatureUrl) {
        void loadModelAsset(creatureUrl).then((asset) => {
          if (asset && this.isLive() && token === this.sceneToken && this.views.get(u.uid)?.rig === rig) {
            const model = cloneModel(asset.scene);
            recolorToPalette(model, palette, undefined, { solid: true, opaque: true });
            mountHeroModel(rig, model, asset.animations, undefined, { hideProcedural: false });
          }
        });
      }
    }

    const ringColor = u.team === this.playerTeam ? 0x5ad95a : 0xe05a5a;
    const ring = buildSelectionRing(u.radius / WORLD_SCALE + 0.15, ringColor);
    ring.visible = false;
    rig.root.add(ring);

    // Elite camp variant (ITEM_REHAUL §10.3): a standing gold ring plus a larger
    // silhouette so the player reads "this one is a fight" from across the screen.
    if (u.elite) {
      const eliteRing = buildSelectionRing(u.radius / WORLD_SCALE + 0.34, 0xffd86a);
      eliteRing.visible = true;
      rig.root.add(eliteRing);
      rig.root.scale.multiplyScalar(1.2);
    }

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

    const view: UnitView = {
      rig, anim: newAnimState(), ring, hpBar, hpFill, manaFill, hpMaterial,
      lastHpPct: -1, lastManaPct: -1, lastTeamColor: '',
      stars, immuneShell, lastItemVisualEpoch: u.visualEpoch,
      materialMode: 'shared', materialOriginals: new Map(), materialClones: new Set(),
      shadowCasters: [], shadowCasting: true,
      removeAt: 0
    };
    this.refreshShadowCasters(view);
    return view;
  }

  private updateView(u: Unit, view: UnitView, dt: number, simTime: number, fullAnimationBudget: number): number {
    const { rig } = view;
    const wx = u.pos.x / WORLD_SCALE;
    const wz = u.pos.y / WORLD_SCALE;
    const tier = this.lodTierForUnit(u);

    // death cleanup timer
    if (!u.alive && view.removeAt === 0) view.removeAt = this.time + 2.2;
    if (u.alive) view.removeAt = 0;

    if (this.shouldSkipOffscreenUnit(u, view, wx, wz)) {
      rig.root.visible = false;
      this.setUnitShadowCasting(view, false);
      this.restoreSharedMaterials(view);
      return fullAnimationBudget;
    }
    this.setUnitShadowCasting(view, this.shouldUnitCastShadow(tier));

    if (this.itemVisualChanged(u, view)) {
      applyItemAppearances(rig, this.itemAppearancesFor(u));
      if (view.materialMode === 'unique') this.ensureUniqueMaterials(view);
    }

    const wy = this.visualGroundHeightAt(u.pos.x, u.pos.y);

    // smooth visual position (sim ticks at 30 Hz; render is faster)
    const k = Math.min(1, dt * 18);
    if (rig.root.position.lengthSq() === 0) rig.root.position.set(wx, wy, wz);
    rig.root.position.x += (wx - rig.root.position.x) * k;
    rig.root.position.z += (wz - rig.root.position.z) * k;
    rig.root.position.y = this.visualGroundHeightAt(
      rig.root.position.x * WORLD_SCALE,
      rig.root.position.z * WORLD_SCALE
    );

    // facing: sim dir (cos f, sin f) on (x,z); rig forward is +z
    const targetRotY = Math.atan2(Math.cos(u.facing), Math.sin(u.facing));
    let dr = targetRotY - rig.root.rotation.y;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    rig.root.rotation.y += dr * Math.min(1, dt * 12);

    const needsUniqueMaterials = this.needsUniqueMaterials(u, view, simTime);
    if (needsUniqueMaterials) this.ensureUniqueMaterials(view);
    else this.restoreSharedMaterials(view);

    // Overworld LOD (§3.16): far units freeze their pose, mid units animate at
    // a reduced cadence. The crowd budget prevents same-screen armies from all
    // paying full authored-mixer cost at once; overflow drops to reduced cadence.
    const animationTier = tier === 'full' && u.uid !== this.selectedUid && fullAnimationBudget <= 0 ? 'reduced' : tier;
    if (tier === 'full' && u.uid !== this.selectedUid && fullAnimationBudget > 0) fullAnimationBudget--;
    if (shouldAnimateAtLod(animationTier, this.frameParity)) {
      animateRig(rig, u, view.anim, dt, this.time, simTime);
    }

    // visibility (fog of war is not in P1; invis only)
    const visible = u.alive ? u.isVisibleTo(this.playerTeam, simTime) : true;
    rig.root.visible = visible || u.team === this.playerTeam;
    this.applyOpacityState(u, view, simTime);

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
    return fullAnimationBudget;
  }

  private shouldSkipOffscreenUnit(u: Unit, view: UnitView, wx: number, wz: number): boolean {
    if (u.uid === this.selectedUid || !u.alive) return false;
    const centerY = view.rig.root.position.lengthSq() > 0
      ? view.rig.root.position.y + view.rig.height * 0.55
      : this.camTarget.y + view.rig.height * 0.55;
    const radius = Math.max(1.2, u.radius / WORLD_SCALE + view.rig.height * 0.6);
    this.unitCullSphere.center.set(wx, centerY, wz);
    this.unitCullSphere.radius = radius;
    return !this.viewFrustum.intersectsSphere(this.unitCullSphere);
  }

  private shouldUnitCastShadow(tier: ReturnType<typeof lodForDistance>): boolean {
    if (!this.quality.shadows) return false;
    if (this.quality.tier === 'medium') return tier === 'full';
    return tier !== 'culled';
  }

  private refreshShadowCasters(view: UnitView): void {
    view.shadowCasters = [];
    view.rig.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || (!mesh.castShadow && !mesh.userData.unitShadowCaster)) return;
      mesh.userData.unitShadowCaster = true;
      view.shadowCasters.push(mesh);
    });
  }

  private setUnitShadowCasting(view: UnitView, enabled: boolean): void {
    if (view.shadowCasting === enabled) return;
    // Authored models can arrive after the procedural view was created; refresh
    // only when the state flips, not on every frame.
    this.refreshShadowCasters(view);
    for (const mesh of view.shadowCasters) mesh.castShadow = enabled;
    view.shadowCasting = enabled;
  }

  private needsUniqueMaterials(u: Unit, view: UnitView, simTime: number): boolean {
    const visibleToPlayer = u.alive ? u.isVisibleTo(this.playerTeam, simTime) : true;
    return (
      !u.alive ||
      (u.summary.invisible && u.team === this.playerTeam) ||
      (u.alive && u.isEcho) ||
      view.anim.hitFlash > 0 ||
      u.summary.frozen ||
      u.summary.rooted ||
      !visibleToPlayer
    );
  }

  private ensureUniqueMaterials(view: UnitView): void {
    let changed = false;
    view.rig.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const cloneOne = (mat: THREE.Material): THREE.Material => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
        if (view.materialClones.has(mat)) return mat;
        const clone = mat.clone();
        view.materialClones.add(clone);
        changed = true;
        return clone;
      };
      if (Array.isArray(mesh.material)) {
        const original = mesh.material;
        const next = original.map(cloneOne);
        if (next.some((mat, i) => mat !== original[i])) {
          if (!view.materialOriginals.has(mesh)) view.materialOriginals.set(mesh, original);
          mesh.material = next;
        }
      } else {
        const next = cloneOne(mesh.material);
        if (next !== mesh.material) {
          if (!view.materialOriginals.has(mesh)) view.materialOriginals.set(mesh, mesh.material);
          mesh.material = next;
        }
      }
    });
    if (changed || view.materialMode !== 'unique') {
      view.materialMode = 'unique';
      this.refreshRigMaterials(view);
    }
  }

  private restoreSharedMaterials(view: UnitView): void {
    if (view.materialMode === 'shared' && view.materialOriginals.size === 0) return;
    for (const [mesh, material] of view.materialOriginals) mesh.material = material;
    for (const material of view.materialClones) material.dispose();
    view.materialOriginals.clear();
    view.materialClones.clear();
    view.materialMode = 'shared';
    this.refreshRigMaterials(view);
  }

  private refreshRigMaterials(view: UnitView): void {
    view.rig.materials.length = 0;
    view.rig.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const add = (mat: THREE.Material): void => {
        if (mat instanceof THREE.MeshStandardMaterial && !view.rig.materials.includes(mat)) view.rig.materials.push(mat);
      };
      if (Array.isArray(mesh.material)) mesh.material.forEach(add);
      else add(mesh.material);
    });
  }

  private applyOpacityState(u: Unit, view: UnitView, simTime: number): void {
    const visibleToPlayer = u.alive ? u.isVisibleTo(this.playerTeam, simTime) : true;
    let opacity = 1;
    if (u.summary.invisible && u.team === this.playerTeam) opacity = 0.4;
    else if (u.isEcho && u.alive) opacity = 0.5;
    else if (!visibleToPlayer) opacity = 0;
    for (const m of view.rig.materials) {
      if (opacity < 1) {
        m.transparent = true;
        m.opacity = opacity;
      } else if (u.alive && view.anim.deathT === 0 && m.transparent) {
        m.transparent = false;
        m.opacity = 1;
      }
    }
  }

  private itemVisualChanged(u: Unit, view: UnitView): boolean {
    if (view.lastItemVisualEpoch === u.visualEpoch) return false;
    view.lastItemVisualEpoch = u.visualEpoch;
    return true;
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
    // Keep noon at full key but lift low-sun mornings/evenings so dawn/dusk never
    // dim out to a near-black ground (the old 0.35 floor read too dark).
    const sunI = (a.sunI + (b.sunI - a.sunI) * mix) * (isDay ? 0.6 + elev * 0.4 : 1);

    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(fog);
    this.hemi.intensity = hemiI;
    this.sun.color.copy(sunC);
    this.sun.intensity = sunI;

    // IBL is a constant fill, so modulate it with the cycle. The floor was too low
    // (day ~0.27, night ~0.13) and the photographic terrain albedo is darker than
    // the procedural floor, so the ground read near-black; lift the ambient read
    // day and night while keeping night clearly dimmer than noon (§3.2).
    const envI = (isDay ? 0.55 + 0.45 * elev : 0.42 + 0.18 * elev) * 0.46;
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
      let tintR = lerp(bg.tint[0], NIGHT_GRADE.tint[0]);
      let tintG = lerp(bg.tint[1], NIGHT_GRADE.tint[1]);
      let tintB = lerp(bg.tint[2], NIGHT_GRADE.tint[2]);
      let sat = lerp(bg.sat, NIGHT_GRADE.sat);
      let contrast = lerp(bg.contrast, NIGHT_GRADE.contrast);
      let brightness = lerp(bg.brightness ?? 1.06, NIGHT_GRADE.brightness ?? 1.0);
      let vignette = lerp(bg.vignette ?? 0.92, NIGHT_GRADE.vignette ?? 0.72);

      // STORY §4.1 / Appendix A: cut-scene palettes are not just captions.
      // Blend the authored shot grade over the biome grade while a cinematic beat owns the frame.
      if (this.cinematicGrade && this.cinematicGradeStrength > 0) {
        const cg = this.cinematicGrade;
        const s = this.cinematicGradeStrength;
        tintR = tintR * (1 - s) + cg.tint[0] * s;
        tintG = tintG * (1 - s) + cg.tint[1] * s;
        tintB = tintB * (1 - s) + cg.tint[2] * s;
        sat = sat * (1 - s) + cg.sat * s;
        contrast = contrast * (1 - s) + cg.contrast * s;
        brightness = brightness * (1 - s) + (cg.brightness ?? brightness) * s;
        vignette = vignette * (1 - s) + (cg.vignette ?? vignette) * s;
      }
      (u.uTint.value as THREE.Color).setRGB(tintR, tintG, tintB);
      u.uSaturation.value = sat;
      u.uContrast.value = contrast;
      u.uBrightness.value = brightness;
      u.uVignette.value = vignette;

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
      this.visualGroundHeightAt(u.pos.x, u.pos.y),
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
      this.cinematicGrade = null;
      this.cinematicGradeStrength = 0;
      return;
    }
    const grade = cinematicGradeFor(view.shot);
    this.cinematicGrade = grade?.grade ?? null;
    this.cinematicGradeStrength = view.reducedMotion || view.photosensitive ? Math.min(0.32, grade?.strength ?? 0) : (grade?.strength ?? 0);
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
      const wy = this.visualGroundHeightAt(follow.pos.x, follow.pos.y);
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

  private unitPickRadius(u: Unit, view: UnitView): number {
    const rootScale = Math.max(view.rig.root.scale.x, view.rig.root.scale.z, 1);
    const simRadius = u.radius / WORLD_SCALE;
    const visualRadius = view.rig.scale * UNIT_PICK_VISUAL_RADIUS_FACTOR;
    return Math.max(UNIT_PICK_MIN_RADIUS, simRadius + UNIT_PICK_RADIUS_PADDING, visualRadius) * rootScale;
  }

  private unitPickHeight(view: UnitView): number {
    const rootScaleY = Math.max(view.rig.root.scale.y, 1);
    return view.rig.height * rootScaleY;
  }

  /** Raycast from screen coords; returns hovered unit, ground item, or ground sim-point. */
  pick(clientX: number, clientY: number, sim: Sim, groundItems: readonly GroundItemDrop[] = []): { uid?: number; itemUid?: number; ground?: { x: number; y: number } } {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    // Units first: forgiving vertical capsules around visible rigs. This only
    // affects mouse targeting; sim radii remain combat/pathing radii.
    let best: { uid: number; d: number } | null = null;
    for (const u of sim.unitsArr) {
      if (!u.alive) continue;
      const view = this.views.get(u.uid);
      if (!view || !view.rig.root.visible) continue;
      const height = this.unitPickHeight(view);
      this.pickSegmentStart.set(
        view.rig.root.position.x,
        view.rig.root.position.y + height * UNIT_PICK_BOTTOM_FRAC,
        view.rig.root.position.z
      );
      this.pickSegmentEnd.set(
        view.rig.root.position.x,
        view.rig.root.position.y + height + UNIT_PICK_TOP_PADDING,
        view.rig.root.position.z
      );
      const radius = this.unitPickRadius(u, view);
      const distSq = this.raycaster.ray.distanceSqToSegment(this.pickSegmentStart, this.pickSegmentEnd, this.pickRayPoint);
      if (distSq < radius * radius) {
        const along = this.pickRayPoint.sub(this.raycaster.ray.origin).dot(this.raycaster.ray.direction);
        if (along < 0) continue;
        if (!best || along < best.d) best = { uid: u.uid, d: along };
      }
    }
    if (best) return { uid: best.uid };

    let bestItem: { uid: number; d: number } | null = null;
    for (const drop of groundItems) {
      this.groundItemPoint.set(
        drop.pos.x / WORLD_SCALE,
        this.visualGroundHeightAt(drop.pos.x, drop.pos.y) + 0.42,
        drop.pos.y / WORLD_SCALE
      );
      const distSq = this.raycaster.ray.distanceSqToPoint(this.groundItemPoint);
      if (distSq >= GROUND_ITEM_PICK_RADIUS * GROUND_ITEM_PICK_RADIUS) continue;
      const along = this.groundItemPoint.clone().sub(this.raycaster.ray.origin).dot(this.raycaster.ray.direction);
      if (along < 0) continue;
      if (!bestItem || along < bestItem.d) bestItem = { uid: drop.uid, d: along };
    }
    if (bestItem) return { itemUid: bestItem.uid };

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
