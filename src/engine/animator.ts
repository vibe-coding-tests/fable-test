import type { UnitRig } from './models';
import type { Unit } from '../core/unit';

// ------------------------------------------------------------------
// Procedural animation (SPEC §3): pose layers keyed off sim state.
// No keyframe data; everything is math on the rig's named parts.
// ------------------------------------------------------------------

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
}

export function newAnimState(): AnimState {
  return { runPhase: 0, lastPos: { x: 0, y: 0 }, speedSmooth: 0, attackFlash: 0, castFlash: 0, hitFlash: 0, lungeFlash: 0, deathT: 0, spinSpeed: 0 };
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

  // run cycle
  st.runPhase += dt * (4 + st.speedSmooth / 60);
  const swing = moving ? Math.sin(st.runPhase) * 0.7 : 0;
  const bob = moving ? Math.abs(Math.sin(st.runPhase)) * 0.08 : Math.sin(time * 1.8 + unit.uid) * 0.03;

  body.position.y = bob;
  body.position.x = 0;
  if (rig.legL) rig.legL.rotation.z = swing;
  if (rig.legR) rig.legR.rotation.z = -swing;

  // arms: run swing unless attacking/casting
  let armSwingL = moving ? -swing * 0.6 : 0.05;
  let armSwingR = moving ? swing * 0.6 : -0.05;

  // attack windup/strike. The timing is still driven by attackPoint/BAT;
  // these branches just give iconic heroes different silhouettes in motion.
  if (unit.windupUntil > 0) {
    const total = Math.max(0.05, unit.stats.attackPoint);
    const t = 1 - Math.max(0, unit.windupUntil - simTime) / total;
    const ranged = unit.stats.attackRange > 260;
    if (unit.heroId === 'earthshaker') {
      armSwingL = -2.3 + t * 2.9;
      armSwingR = -2.3 + t * 2.9;
      body.rotation.z = Math.sin(t * Math.PI) * 0.18;
    } else if (unit.heroId === 'pudge') {
      armSwingR = -1.9 + t * 2.8;
      body.rotation.z = Math.sin(t * Math.PI) * 0.14;
    } else if (unit.heroId === 'sniper' || ranged) {
      armSwingL = -1.05;
      armSwingR = -1.05 + t * 0.32;
      body.position.x -= Math.sin(t * Math.PI) * 0.08;
    } else if (unit.heroId === 'juggernaut') {
      armSwingR = -1.8 + t * 3.2;
      body.rotation.y = Math.sin(t * Math.PI) * 0.42;
    } else {
      armSwingR = -1.6 + t * 2.4; // raise then strike
    }
    st.attackFlash = 1;
  } else if (st.attackFlash > 0) {
    if (unit.heroId === 'sniper' || unit.stats.attackRange > 260) {
      armSwingL = -0.85;
      armSwingR = -0.85;
    } else {
      armSwingR = 0.8 * st.attackFlash;
    }
    st.attackFlash = Math.max(0, st.attackFlash - dt * 5);
  }
  if (st.lungeFlash > 0) {
    body.position.x += st.lungeFlash * 0.28;
    st.lungeFlash = Math.max(0, st.lungeFlash - dt * 7);
  }

  // casting: both arms up
  if (unit.castingUntil > simTime) {
    if (unit.heroId === 'crystal-maiden' || unit.heroId === 'lich') {
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
  body.rotation.y = 0;
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
