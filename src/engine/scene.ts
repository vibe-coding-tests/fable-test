import * as THREE from 'three';
import type { AttackVisualSpec, ItemAppearanceSpec, RegionDef } from '../core/types';
import type { Sim } from '../core/sim';
import type { Unit } from '../core/unit';
import { REG } from '../core/registry';
import { buildTerrain, type TerrainInfo } from './terrain';
import { applyHeroLikeness, applyItemAppearances, buildUnitRig, buildSelectionRing, type UnitRig } from './models';
import { animateRig, newAnimState, type AnimState } from './animator';
import { VfxManager } from './vfx';
import { WORLD_SCALE } from './scale';
import { TUNING } from '../data/tuning';
import { clampedPixelRatio, qualityPreset, type QualityTier } from './performance';

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

export type CameraMode = 'follow' | 'map';

const DAY = {
  sky: new THREE.Color('#8fc3e8'),
  fog: new THREE.Color('#a8d0e8'),
  sun: new THREE.Color('#fff2d8'),
  hemi: 0.75,
  sunI: 1.15
};
const DUSK = {
  sky: new THREE.Color('#d98a5e'),
  fog: new THREE.Color('#caa07a'),
  sun: new THREE.Color('#ffb36a'),
  hemi: 0.5,
  sunI: 0.7
};
const NIGHT = {
  sky: new THREE.Color('#101828'),
  fog: new THREE.Color('#16203a'),
  sun: new THREE.Color('#9db8e8'),
  hemi: 0.28,
  sunI: 0.22
};

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
  private views = new Map<number, UnitView>();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private mapMarkers: MapMarker[] = [];

  cameraMode: CameraMode = 'follow';
  private camTarget = new THREE.Vector3();
  private camZoom = 1; // user wheel zoom within mode
  private modeBlend = 0; // 0 = follow, 1 = map
  selectedUid = -1;
  playerTeam = 0;
  private time = 0;

  constructor(canvas: HTMLCanvasElement, region: RegionDef, quality: QualityTier = 'high') {
    const qualityCfg = qualityPreset(quality);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(clampedPixelRatio(window.devicePixelRatio, quality));
    this.renderer.shadowMap.enabled = qualityCfg.shadows;
    this.renderer.shadowMap.type = qualityCfg.shadowType === 'pcf' ? THREE.PCFShadowMap : THREE.BasicShadowMap;

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 700);
    this.scene.fog = new THREE.Fog(DAY.fog.getHex(), 60, 300);

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x46584a, DAY.hemi);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(DAY.sun, DAY.sunI);
    this.sun.castShadow = qualityCfg.shadows;
    this.sun.shadow.mapSize.set(qualityCfg.shadowMapSize, qualityCfg.shadowMapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60;
    sc.near = 1; sc.far = 400;
    this.scene.add(this.sun, this.sun.target);

    this.terrain = buildTerrain(region);
    this.scene.add(this.terrain.group);

    this.vfx = new VfxManager((x, y) => this.terrain.heightAt(x, y), qualityCfg.transientVfxCap);
    this.scene.add(this.vfx.group);

    this.createMapMarkers(region);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Wheel zoom: clamped per mode. */
  zoomBy(deltaY: number): void {
    this.camZoom = Math.min(1.6, Math.max(0.55, this.camZoom * (deltaY > 0 ? 1.08 : 0.93)));
  }

  toggleCameraMode(): CameraMode {
    this.cameraMode = this.cameraMode === 'follow' ? 'map' : 'follow';
    return this.cameraMode;
  }

  // ---------- per-frame ----------

  update(sim: Sim, followUnit: Unit | null, renderDt: number, timeOfDay01: number): void {
    this.time += renderDt;
    this.syncUnits(sim, renderDt);
    this.vfx.syncProjectiles(sim.projectiles);
    this.vfx.syncZoneFollow((uid) => {
      const u = sim.unit(uid);
      return u ? { x: u.pos.x, y: u.pos.y, h: 0 } : null;
    });
    this.vfx.update(renderDt);
    this.updateDayNight(timeOfDay01);
    this.updateCamera(followUnit, renderDt);
    this.updateMapMarkers();
    this.renderer.render(this.scene, this.camera);
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
    }
    if (ev.t === 'attack-launch') {
      const view = this.views.get(ev.uid);
      if (view) view.anim.lungeFlash = Math.max(view.anim.lungeFlash, 0.35);
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
    if (u.kind === 'hero' && u.heroId) applyHeroLikeness(rig, u.heroId);
    applyItemAppearances(rig, this.itemAppearancesFor(u));
    this.scene.add(rig.root);

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

    animateRig(rig, u, view.anim, dt, this.time, simTime);

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
    rig.itemLayer.rotation.y = Math.sin(this.time * 1.6 + u.uid) * 0.035;
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

    const r = 160;
    const sunY = Math.max(0.12, elev);
    this.sun.position.set(
      this.camTarget.x + Math.cos(az) * r * 0.8,
      sunY * r,
      this.camTarget.z + Math.sin(az) * r * 0.4 - r * 0.3
    );
    this.sun.target.position.copy(this.camTarget);
  }

  /** Is it night for gameplay flags? */
  static isNight(t01: number): boolean {
    return t01 >= 0.5;
  }

  // ---------- camera ----------

  private updateCamera(follow: Unit | null, dt: number): void {
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
