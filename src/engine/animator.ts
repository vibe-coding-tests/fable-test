import * as THREE from 'three';
import type { AuthoredActionName, UnitRig } from './models';
import type { Unit } from '../core/unit';
import type { AnimGesture } from '../core/types';

// ------------------------------------------------------------------
// Procedural animation (SPEC §3): pose layers keyed off sim state.
// No keyframe data; everything is math on the rig's named parts.
//
// Phase 6 §3.11: casts play a gesture from the closed AnimGesture
// vocabulary (set on the unit when the cast begins), shaped by the
// hero's animProfile.castStyle and weighted by silhouette scale so a
// dainty caster and a heavy brute read differently. The old iconic
// heroId branches survive only as the fallback for units without a
// resolved gesture (sparse animProfile / summons).
// ------------------------------------------------------------------

interface CastPose {
  l: number;          // left arm rotation.z
  r: number;          // right arm rotation.z
  bodyZ: number;      // body roll (set, not added)
  bodyY: number;      // body bob (added)
  bodyX: number;      // body shift (added)
}

// Reused across frames so the cast path never allocates in the render hot loop.
const POSE: CastPose = { l: 0, r: 0, bodyZ: 0, bodyY: 0, bodyX: 0 };
const GROUND_BOX = new THREE.Box3();
const GROUND_ROOT_POS = new THREE.Vector3();
const DEATH_GROUND_MARGIN = 0.02;

type AttackStyle =
  | 'heavy-chop'
  | 'sword-slash'
  | 'hook-fling'
  | 'rifle-shot'
  | 'staff-jab'
  | 'creature-lunge'
  | 'bird-dive'
  | 'generic-strike';

function attackStyleFor(rig: UnitRig, unit: Unit): AttackStyle {
  const weapon = rig.attackWeapon;
  if (rig.attackBuild === 'bird') return 'bird-dive';
  if ((rig.attackBuild === 'quad' || rig.attackBuild === 'blob') && weapon === 'none') return 'creature-lunge';
  if (weapon === 'hook') return 'hook-fling';
  if (weapon === 'rifle') return 'rifle-shot';
  if (weapon === 'staff' || weapon === 'long-pole') return 'staff-jab';
  if (weapon === 'sword' || weapon === 'glowing-blade') return 'sword-slash';
  if (weapon === 'cleaver' || weapon === 'totem' || weapon === 'broad-cleaver' || weapon === 'storm-haft') {
    return 'heavy-chop';
  }
  if (unit.stats.attackRange > 260) return 'rifle-shot';
  return 'generic-strike';
}

function applyAttackWindup(
  style: AttackStyle,
  rig: UnitRig,
  body: UnitRig['body'],
  t: number
): { l: number; r: number } {
  const w = rig.scale;
  const strike = Math.sin(t * Math.PI);
  switch (style) {
    case 'heavy-chop':
      body.rotation.z = strike * 0.16 * w;
      body.position.x += strike * 0.05;
      return { l: -2.3 + t * 2.9, r: -2.3 + t * 2.9 };
    case 'sword-slash':
      body.rotation.y = strike * 0.38;
      body.rotation.z = strike * 0.05;
      return { l: 0.1 - t * 0.35, r: -1.8 + t * 3.2 };
    case 'hook-fling':
      body.rotation.z = strike * 0.14;
      body.position.x -= strike * 0.04;
      return { l: -0.35, r: -1.95 + t * 2.95 };
    case 'rifle-shot':
      body.position.x -= strike * 0.08;
      return { l: -1.05, r: -1.05 + t * 0.32 };
    case 'staff-jab':
      body.rotation.z = strike * 0.04;
      body.position.x += strike * 0.04;
      return { l: -0.7, r: -1.55 + t * 1.25 };
    case 'creature-lunge':
      body.position.x += strike * 0.18 * w;
      body.position.y += strike * 0.06;
      body.rotation.z = strike * 0.04 * w;
      return { l: 0.45 - t * 0.55, r: 0.45 - t * 0.55 };
    case 'bird-dive':
      body.position.x += strike * 0.14 * w;
      body.position.y -= strike * 0.08;
      body.rotation.z = strike * 0.08;
      return { l: -0.35 + strike * 0.45, r: -0.35 + strike * 0.45 };
    case 'generic-strike':
    default:
      body.rotation.z = strike * 0.05 * w;
      return { l: 0.05, r: (-1.4 - 0.4 * w) + t * (2.0 + 0.6 * w) };
  }
}

function applyAttackFollowThrough(style: AttackStyle, body: UnitRig['body'], flash: number): { l?: number; r?: number } {
  switch (style) {
    case 'rifle-shot':
      return { l: -0.85, r: -0.85 };
    case 'staff-jab':
      return { l: -0.25, r: 0.45 * flash };
    case 'heavy-chop':
      body.rotation.z -= 0.08 * flash;
      return { l: 0.45 * flash, r: 0.65 * flash };
    case 'hook-fling':
      return { r: 0.9 * flash };
    case 'creature-lunge':
    case 'bird-dive':
      body.position.x += 0.12 * flash;
      return {};
    case 'sword-slash':
    case 'generic-strike':
    default:
      return { r: 0.8 * flash };
  }
}

/** Closed-vocabulary gesture player: one pose per AnimGesture, weight-shaped. */
function castPose(g: AnimGesture, castStyle: string | undefined, time: number, weight: number): CastPose {
  // Heavier silhouettes sway slower and lean more; daintier ones flit.
  const sway = Math.sin(time * (12 / Math.max(0.6, weight)));
  const lean = 0.06 * weight;
  const spellHands = castStyle === 'spell'; // robed casters splay both hands
  POSE.bodyZ = 0; POSE.bodyY = 0; POSE.bodyX = 0;
  switch (g) {
    case 'staff-cast':
      POSE.l = -2.4 + sway * 0.08; POSE.r = (spellHands ? -2.1 : -1.4) + sway * 0.06; POSE.bodyZ = sway * 0.05; break;
    case 'global-cast':
      POSE.l = -2.75; POSE.r = -2.75; POSE.bodyY = Math.abs(sway) * 0.05; POSE.bodyZ = sway * 0.04; break;
    case 'ground-slam':
      POSE.l = -2.3; POSE.r = -2.3; POSE.bodyY = sway * 0.03 * weight; break;
    case 'summon-gesture':
      POSE.l = -1.0 - sway * 0.1; POSE.r = -1.0 + sway * 0.1; POSE.bodyZ = -lean * 0.4; break;
    case 'channel-loop': {
      const tremble = Math.sin(time * 24) * 0.06;
      POSE.l = -1.1 + tremble; POSE.r = -1.1 - tremble; break;
    }
    case 'ranged-shot':
      POSE.l = -1.45; POSE.r = -1.1 + sway * 0.04; POSE.bodyX = -0.05; break;
    case 'dash':
      POSE.l = 0.5; POSE.r = 0.6; POSE.bodyZ = lean; POSE.bodyX = 0.05; break;
    case 'item-use':
      POSE.l = -0.2; POSE.r = -1.7 + sway * 0.05; break;
    case 'toggle-stance':
      POSE.l = -0.75; POSE.r = -0.75; POSE.bodyY = Math.abs(sway) * 0.06; POSE.bodyZ = lean * 0.8; break;
    case 'melee-swing':
    default:
      POSE.l = 0.1; POSE.r = -1.7; POSE.bodyZ = lean * 0.5; break;
  }
  return POSE;
}

export interface AnimState {
  runPhase: number;
  lastPos: { x: number; y: number };
  speedSmooth: number;
  attackFlash: number;   // 1 at windup-impact, decays
  castFlash: number;
  hitFlash: number;
  lungeFlash: number;
  deathT: number;        // 0..1 after death
  spinSpeed: number;     // blade fury style spin
  clipLockUntil: number; // authored one-shot clip lockout, in sim time
  lastWindupUntil: number;
  lastCastUntil: number;
  deathClipStarted: boolean;
}

export function newAnimState(): AnimState {
  return {
    runPhase: 0,
    lastPos: { x: 0, y: 0 },
    speedSmooth: 0,
    attackFlash: 0,
    castFlash: 0,
    hitFlash: 0,
    lungeFlash: 0,
    deathT: 0,
    spinSpeed: 0,
    clipLockUntil: 0,
    lastWindupUntil: 0,
    lastCastUntil: 0,
    deathClipStarted: false
  };
}

function switchAuthoredAction(rig: UnitRig, name: AuthoredActionName, fade = 0.12): void {
  const next = rig.actions?.[name];
  if (!next || rig.activeAction === name) return;
  const prev = rig.activeAction ? rig.actions?.[rig.activeAction] : undefined;
  next.enabled = true;
  next.paused = false;
  next.setEffectiveWeight(1);
  if (name === 'attack' || name === 'cast' || name === 'death') next.reset();
  next.play();
  if (prev && prev !== next) next.crossFadeFrom(prev, fade, false);
  rig.activeAction = name;
}

function playAuthoredOneShot(
  rig: UnitRig,
  name: AuthoredActionName,
  desiredSec: number,
  lockUntil: number
): void {
  const action = rig.actions?.[name];
  if (!action) return;
  const clipDur = action.getClip().duration || desiredSec || 0.4;
  action.timeScale = clipDur / Math.max(0.05, desiredSec || clipDur);
  switchAuthoredAction(rig, name, 0.06);
  action.reset().play();
  action.clampWhenFinished = true;
  rig.activeAction = name;
  void lockUntil;
}

function keepDeathPoseAboveGround(rig: UnitRig): void {
  rig.root.updateMatrixWorld(true);
  GROUND_BOX.setFromObject(rig.body);
  if (GROUND_BOX.isEmpty() || !Number.isFinite(GROUND_BOX.min.y)) return;
  const rootY = rig.root.getWorldPosition(GROUND_ROOT_POS).y;
  const lift = rootY + DEATH_GROUND_MARGIN - GROUND_BOX.min.y;
  if (lift <= 0) return;
  rig.body.position.y += lift / Math.max(0.001, rig.root.scale.y);
  rig.root.updateMatrixWorld(true);
}

function restoreAuthoredLoop(rig: UnitRig, moving: boolean, channeling: boolean): void {
  if (channeling && rig.actions?.channel) switchAuthoredAction(rig, 'channel', 0.16);
  else if (moving && rig.actions?.run) switchAuthoredAction(rig, 'run', 0.16);
  else if (rig.actions?.idle) switchAuthoredAction(rig, 'idle', 0.18);
  else if (rig.actions?.run) switchAuthoredAction(rig, 'run', 0.18);
}

function animateAuthoredRig(
  rig: UnitRig,
  unit: Unit,
  st: AnimState,
  dt: number,
  time: number,
  simTime: number,
  moving: boolean,
  bob: number
): void {
  const body = rig.body;

  if (!unit.alive) {
    st.deathT = Math.min(1, st.deathT + dt * 1.4);
    if (!st.deathClipStarted && rig.actions?.death) {
      playAuthoredOneShot(rig, 'death', 0.8, Infinity);
      st.deathClipStarted = true;
    } else if (!rig.actions?.death) {
      body.rotation.z = (Math.PI / 2) * st.deathT;
      body.position.y = -st.deathT * 0.4;
    }
    rig.mixer?.update(dt);
    keepDeathPoseAboveGround(rig);
    return;
  }

  st.deathT = 0;
  st.deathClipStarted = false;
  body.rotation.z = 0;
  body.position.y = bob;
  body.position.x = 0;
  body.rotation.x = moving ? Math.min(0.14, st.speedSmooth / 3600) : 0;
  body.rotation.y = 0;

  if (unit.windupUntil > simTime && unit.windupUntil !== st.lastWindupUntil && rig.actions?.attack) {
    const desired = Math.max(0.08, unit.stats.attackPoint || 0.35);
    playAuthoredOneShot(rig, 'attack', desired, unit.windupUntil);
    st.clipLockUntil = Math.max(st.clipLockUntil, unit.windupUntil);
    st.lastWindupUntil = unit.windupUntil;
    st.attackFlash = 1;
  }

  if (unit.castingUntil > simTime && unit.castingUntil !== st.lastCastUntil && (rig.actions?.cast || rig.actions?.channel)) {
    const channeled = !!(unit.channel || unit.captureCh);
    const name: AuthoredActionName = channeled && rig.actions?.channel ? 'channel' : rig.actions?.cast ? 'cast' : 'channel';
    const desired = Math.max(0.12, unit.castingUntil - simTime);
    playAuthoredOneShot(rig, name, desired, unit.castingUntil);
    st.clipLockUntil = Math.max(st.clipLockUntil, unit.castingUntil);
    st.lastCastUntil = unit.castingUntil;
    st.castFlash = 1;
  }

  if (simTime >= st.clipLockUntil || !rig.activeAction || rig.activeAction === 'idle' || rig.activeAction === 'run' || rig.activeAction === 'channel') {
    restoreAuthoredLoop(rig, moving, !!(unit.channel || unit.captureCh));
  }

  if (st.lungeFlash > 0) {
    body.position.x += st.lungeFlash * 0.2;
    st.lungeFlash = Math.max(0, st.lungeFlash - dt * 7);
  }

  const spinning =
    unit.statuses.some((s) => s.tag.includes('blade-fury') || s.status === 'cyclone') ||
    unit.summary.cycloned;
  st.spinSpeed = spinning ? Math.min(22, st.spinSpeed + dt * 60) : Math.max(0, st.spinSpeed - dt * 40);
  if (st.spinSpeed > 0.1) body.rotation.y = (time * st.spinSpeed) % (Math.PI * 2);
  if (unit.summary.cycloned) body.position.y += 1.6 + Math.sin(time * 9) * 0.2;

  if (st.hitFlash > 0) {
    st.hitFlash = Math.max(0, st.hitFlash - dt * 6);
    for (const m of rig.materials) m.emissive.setRGB(st.hitFlash * 0.7, st.hitFlash * 0.15, st.hitFlash * 0.1);
  } else if (unit.summary.frozen || unit.summary.rooted) {
    const p = 0.25 + Math.sin(time * 6) * 0.1;
    for (const m of rig.materials) m.emissive.setRGB(p * 0.2, p * 0.45, p * 0.8);
  } else {
    for (const m of rig.materials) {
      if (m.emissive.r !== 0 || m.emissive.g !== 0 || m.emissive.b !== 0) m.emissive.setRGB(0, 0, 0);
    }
  }

  rig.mixer?.update(dt);
}

export function animateRig(rig: UnitRig, unit: Unit, st: AnimState, dt: number, time: number, simTime: number): void {
  const body = rig.body;

  // measure actual movement (render-space speed)
  const dx = unit.pos.x - st.lastPos.x;
  const dy = unit.pos.y - st.lastPos.y;
  st.lastPos.x = unit.pos.x;
  st.lastPos.y = unit.pos.y;
  const speed = Math.hypot(dx, dy) / Math.max(dt, 1e-4);
  st.speedSmooth += (speed - st.speedSmooth) * Math.min(1, dt * 10);
  const moving = st.speedSmooth > 30;

  if (!unit.alive) {
    st.deathT = Math.min(1, st.deathT + dt * 1.4);
    const t = st.deathT;
    body.rotation.z = (Math.PI / 2) * t;
    body.position.y = -t * 0.4;
    keepDeathPoseAboveGround(rig);
    rig.root.traverse((o) => {
      const m = (o as { material?: { transparent?: boolean; opacity?: number } }).material;
      if (m && typeof m.opacity === 'number') {
        m.transparent = true;
        m.opacity = Math.max(0, 1 - Math.max(0, t - 0.5) * 2);
      }
    });
    return;
  }
  st.deathT = 0;
  body.rotation.z = 0;
  body.rotation.y = 0;

  // run cycle
  st.runPhase += dt * (4 + st.speedSmooth / 60);
  const swing = moving ? Math.sin(st.runPhase) * 0.7 : 0;
  const bob = moving ? Math.abs(Math.sin(st.runPhase)) * 0.08 : Math.sin(time * 1.8 + unit.uid) * 0.03;

  if (rig.mixer && rig.actions && Object.keys(rig.actions).length > 0) {
    animateAuthoredRig(rig, unit, st, dt, time, simTime, moving, bob);
    return;
  }

  body.position.y = bob;
  body.position.x = 0;
  if (rig.legL) rig.legL.rotation.z = swing;
  if (rig.legR) rig.legR.rotation.z = -swing;

  // arms: run swing unless attacking/casting
  let armSwingL = moving ? -swing * 0.6 : 0.05;
  let armSwingR = moving ? swing * 0.6 : -0.05;

  // attack windup/strike. The timing is still driven by attackPoint/BAT;
  // weapon/build only changes the silhouette of the motion.
  if (unit.windupUntil > 0) {
    const total = Math.max(0.05, unit.stats.attackPoint);
    const t = 1 - Math.max(0, unit.windupUntil - simTime) / total;
    const pose = applyAttackWindup(attackStyleFor(rig, unit), rig, body, t);
    armSwingL = pose.l;
    armSwingR = pose.r;
    st.attackFlash = 1;
  } else if (st.attackFlash > 0) {
    const pose = applyAttackFollowThrough(attackStyleFor(rig, unit), body, st.attackFlash);
    if (pose.l !== undefined) armSwingL = pose.l;
    if (pose.r !== undefined) armSwingR = pose.r;
    st.attackFlash = Math.max(0, st.attackFlash - dt * 5);
  }
  if (st.lungeFlash > 0) {
    body.position.x += st.lungeFlash * 0.28;
    st.lungeFlash = Math.max(0, st.lungeFlash - dt * 7);
  }

  // casting: gesture-driven pose, shaped by animProfile + silhouette weight
  if (unit.castingUntil > simTime) {
    if (unit.castGesture) {
      const pose = castPose(unit.castGesture, unit.animProfile?.castStyle, time, rig.scale);
      armSwingL = pose.l;
      armSwingR = pose.r;
      body.rotation.z = pose.bodyZ;
      body.position.y += pose.bodyY;
      body.position.x += pose.bodyX;
    } else if (unit.heroId === 'crystal-maiden' || unit.heroId === 'lich') {
      armSwingL = -2.55 + Math.sin(time * 12) * 0.08;
      armSwingR = -1.35 + Math.sin(time * 10) * 0.05;
      body.rotation.z = Math.sin(time * 5) * 0.07;
    } else if (unit.heroId === 'earthshaker') {
      armSwingL = -1.9;
      armSwingR = -1.9;
      body.position.y += Math.sin(time * 18) * 0.025;
    } else {
      armSwingL = -2.2;
      armSwingR = -2.2;
    }
    st.castFlash = 1;
  } else if (st.castFlash > 0) {
    st.castFlash = Math.max(0, st.castFlash - dt * 4);
  }

  // channeling: arms forward, slight tremble
  if (unit.channel || unit.captureCh) {
    const tremble = Math.sin(time * 24) * 0.06;
    armSwingL = -1.1 + tremble;
    armSwingR = -1.1 - tremble;
  }

  if (rig.armL) rig.armL.rotation.z = armSwingL;
  if (rig.armR) rig.armR.rotation.z = armSwingR;

  // lean into motion
  body.rotation.x = 0;
  if (moving) body.rotation.x = Math.min(0.18, st.speedSmooth / 3000);

  // spin (Blade Fury / cyclone visuals)
  const spinning =
    unit.statuses.some((s) => s.tag.includes('blade-fury') || s.status === 'cyclone') ||
    unit.summary.cycloned;
  if (spinning) {
    st.spinSpeed = Math.min(22, st.spinSpeed + dt * 60);
  } else {
    st.spinSpeed = Math.max(0, st.spinSpeed - dt * 40);
  }
  if (st.spinSpeed > 0.1) {
    body.rotation.y = (time * st.spinSpeed) % (Math.PI * 2);
    if (rig.armL) rig.armL.rotation.z = -1.4;
    if (rig.armR) rig.armR.rotation.z = -1.4;
  }

  // cyclone lift
  const lift = unit.summary.cycloned ? 1.6 + Math.sin(time * 9) * 0.2 : 0;
  rig.root.position.y += (lift - 0) * 0; // root y handled by scene layer; body offset:
  body.position.y += lift;

  // hit flash on materials
  if (st.hitFlash > 0) {
    st.hitFlash = Math.max(0, st.hitFlash - dt * 6);
    for (const m of rig.materials) m.emissive.setRGB(st.hitFlash * 0.7, st.hitFlash * 0.15, st.hitFlash * 0.1);
  } else {
    for (const m of rig.materials) {
      if (m.emissive.r !== 0 || m.emissive.g !== 0 || m.emissive.b !== 0) m.emissive.setRGB(0, 0, 0);
    }
  }

  // status tint: frozen/rooted = icy blue emissive pulse
  if (unit.summary.frozen || unit.summary.rooted) {
    const p = 0.25 + Math.sin(time * 6) * 0.1;
    for (const m of rig.materials) m.emissive.setRGB(p * 0.2, p * 0.45, p * 0.8);
  }

  // ward eye spin
  const eye = rig.head;
  if (eye && eye.name === 'ward-eye') {
    eye.rotation.y = time * 2.5;
  }
}

/** Presentation-only gesture pose for STORY cut-scene beats.
 *  The sim continues unchanged; the scene applies this after the normal pose update. */
export function applyCinematicGesture(rig: UnitRig, gesture: AnimGesture, time: number): void {
  const pose = castPose(gesture, undefined, time, rig.scale);
  if (rig.armL) rig.armL.rotation.z = pose.l;
  if (rig.armR) rig.armR.rotation.z = pose.r;
  rig.body.rotation.z = pose.bodyZ;
  rig.body.position.y += pose.bodyY;
  rig.body.position.x += pose.bodyX;
}
