import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { applyAuthoredSilhouette, applyHeroLikeness, applyItemAppearances, attachHeroWeaponModel, attachHoldoutSignatureModel, buildUnitRig, heroProportions, modelGeometryCacheSize, mountHeroModel, recolorToPalette } from '../engine/models';
import { ENABLED_HERO_MODELS, ENABLED_HERO_BASES, ENABLED_HOLDOUT_MODELS, ENABLED_HOLDOUT_SIGNATURES, HERO_BASE, heroAssetEntry, heroBaseId, heroBaseUrl, holdoutReplacementUrl, holdoutSignatureUrl, PHASE5_STARTER_ASSETS } from '../engine/assets';
import { ALL_HEROES } from '../data/index';

/** A stand-in mounted base: a 2×6×2 box the loader would normally fit + seat. */
function mountStandIn(heroId: string): { rig: ReturnType<typeof buildUnitRig>; model: THREE.Mesh } {
  const hero = ALL_HEROES.find((h) => h.id === heroId)!;
  const rig = buildUnitRig(hero.silhouette, hero.palette);
  const model = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), new THREE.MeshStandardMaterial());
  mountHeroModel(rig, model);
  return { rig, model };
}

describe('procedural model cache', () => {
  it('shares canonical geometry across repeated rigs', () => {
    const before = modelGeometryCacheSize();
    const a = buildUnitRig({ build: 'blob', scale: 1 }, ['#88aaff', '#446688', '#ffffff']);
    const b = buildUnitRig({ build: 'blob', scale: 1 }, ['#88aaff', '#446688', '#ffffff']);

    const firstMeshA = a.body.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    const firstMeshB = b.body.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);

    expect(firstMeshA?.geometry).toBe(firstMeshB?.geometry);
    expect(modelGeometryCacheSize()).toBeGreaterThan(before);
  });

  it('builds a procedural likeness for every shipped hero without throwing (WS-A render smoke)', () => {
    for (const hero of ALL_HEROES) {
      const rig = buildUnitRig(hero.silhouette, hero.palette);
      const basePartCount = rig.body.children.length;
      expect(() => applyHeroLikeness(rig, hero.id)).not.toThrow();
      // The likeness overlay should add at least one detail mesh to the body.
      expect(rig.body.children.length, `${hero.id} likeness parts`).toBeGreaterThan(basePartCount);
    }
  });

  it('builds D2 item parts without external assets', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1 }, ['#88aaff', '#446688', '#ffffff']);
    applyItemAppearances(rig, [{ parts: ['cloak', 'halo'], tint: '#b89fff' }]);

    expect(rig.itemLayer.children.length).toBeGreaterThanOrEqual(3);
  });
});

describe('pluggable hero rig (Phase 5)', () => {
  it('resolves an asset entry only for heroes whose GLB is enabled', () => {
    // Every hero in an enabled KayKit cohort ships a retextured CC0 GLB + resolves an entry.
    for (const a of PHASE5_STARTER_ASSETS) {
      expect(ENABLED_HERO_MODELS.has(a.heroId), `${a.heroId} enabled`).toBe(true);
      expect(heroAssetEntry(a.heroId), `${a.heroId} entry`).not.toBeNull();
      expect(a.weaponUrl, `${a.heroId} weapon`).toBe(`/assets/weapons/heroes/${a.heroId}.glb`);
    }
    // Creature-cohort heroes mount through shared bases, not per-hero GLB entries.
    expect(heroAssetEntry('broodmother')).toBeNull();
    expect(heroAssetEntry('io')?.modelUrl).toBe('/assets/holdouts/replacements/io.glb');
    expect(heroAssetEntry('unknown-hero')).toBeNull();
    expect(heroAssetEntry(undefined)).toBeNull();
    // The gate matches all dedicated hero-model entries: 80 humanoids + 11 holdout replacements.
    expect(ENABLED_HERO_MODELS.size).toBe(PHASE5_STARTER_ASSETS.length + ENABLED_HOLDOUT_MODELS.size);
  });

  it('mounts an authored model over the procedural body, fitting height + seating feet', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1 }, ['#888899', '#666677', '#aaaabb']);
    applyHeroLikeness(rig, 'juggernaut');
    const proceduralCount = rig.body.children.length;

    // A stand-in authored mesh, deliberately the wrong size and off the ground.
    const model = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), new THREE.MeshStandardMaterial());
    model.position.set(1, 5, 2);
    mountHeroModel(rig, model);

    // Procedural parts hidden (fallback-ready), authored model added + flagged.
    for (let i = 0; i < proceduralCount; i++) expect(rig.body.children[i].visible).toBe(false);
    expect(rig.body.children).toContain(model);
    expect(model.userData.heroModel).toBe(true);

    const box = new THREE.Box3().setFromObject(model);
    expect(box.max.y - box.min.y).toBeCloseTo(rig.height, 2); // fit to silhouette height
    expect(box.min.y).toBeCloseTo(0, 2); // feet seated on the ground
    expect(model.castShadow).toBe(true);
  });

  it('can mount creature models without hiding the procedural fallback', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 0.55 }, ['#b8743c', '#7a4a22', '#e8d8a0']);
    const proceduralCount = rig.body.children.length;
    const model = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());

    mountHeroModel(rig, model, [], undefined, { hideProcedural: false });

    for (let i = 0; i < proceduralCount; i++) expect(rig.body.children[i].visible).toBe(true);
    expect(rig.body.children).toContain(model);
  });

  it('resolves base-mesh sockets and hangs the weapon off the authored hand (WS-B)', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1, weapon: 'sword' }, ['#888899', '#666677', '#aaaabb']);

    // Stand-in base mesh exposing KayKit-style bone names for hand/head/back.
    const model = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), new THREE.MeshStandardMaterial());
    const hand = new THREE.Object3D(); hand.name = 'Hand_R';
    const headBone = new THREE.Object3D(); headBone.name = 'Head';
    const backBone = new THREE.Object3D(); backBone.name = 'Spine';
    model.add(torso, hand, headBone, backBone);
    mountHeroModel(rig, model);

    expect(rig.sockets?.weapon).toBe(hand);
    expect(rig.sockets?.head).toBe(headBone);
    expect(rig.sockets?.back).toBe(backBone);
    expect(rig.rightHand).toBe(hand);

    // The worn weapon should parent to the resolved hand bone (visible), not the
    // hidden procedural arm, and be counter-scaled for the model's height fit.
    applyItemAppearances(rig, [{ weapon: { kind: 'sword', color: '#d8dce8' } }]);
    expect(rig.weapon?.parent).toBe(hand);
    const k = model.scale.x;
    expect(rig.weapon?.scale.x).toBeCloseTo(1 / k, 4);
  });

  it('keeps the weapon visible when a base mesh exposes no hand bone (WS-B fallback)', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1, weapon: 'sword' }, ['#888899', '#666677', '#aaaabb']);
    const model = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), new THREE.MeshStandardMaterial());
    mountHeroModel(rig, model);

    expect(rig.sockets?.weapon).toBeUndefined();
    expect(rig.rightHand).toBeUndefined();
    applyItemAppearances(rig, [{ weapon: { kind: 'sword', color: '#d8dce8' } }]);
    // Falls back to the item layer (on root, always visible) rather than vanishing.
    expect(rig.weapon?.parent).toBe(rig.itemLayer);
  });

  it('attaches generated hero weapon GLBs as the default and lets item weapons override them', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1, weapon: 'sword' }, ['#888899', '#666677', '#aaaabb']);
    const model = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), new THREE.MeshStandardMaterial());
    const hand = new THREE.Object3D(); hand.name = 'Hand_R';
    model.add(torso, hand);
    mountHeroModel(rig, model);

    const heroWeapon = new THREE.Group();
    heroWeapon.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.1), new THREE.MeshStandardMaterial()));
    attachHeroWeaponModel(rig, heroWeapon);

    expect(rig.defaultWeapon).toBe(heroWeapon);
    expect(rig.weapon).toBe(heroWeapon);
    expect(heroWeapon.parent).toBe(hand);

    applyItemAppearances(rig, [{ weapon: { kind: 'glowing-blade', color: '#ffd86a' } }]);
    expect(rig.weapon).not.toBe(heroWeapon);
    expect(heroWeapon.parent).toBeNull();

    applyItemAppearances(rig, []);
    expect(rig.weapon).toBe(heroWeapon);
    expect(heroWeapon.parent).toBe(hand);
  });

  it('attaches holdout signature GLBs additively without hiding the procedural rig (A6)', () => {
    const rig = buildUnitRig({ build: 'blob', scale: 1.25 }, ['#88aaff', '#446688', '#ffffff']);
    const proceduralCount = rig.body.children.length;
    const signatureA = new THREE.Group();
    signatureA.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial()));

    attachHoldoutSignatureModel(rig, signatureA);

    expect(rig.body.children.slice(0, proceduralCount).every((child) => child.visible)).toBe(true);
    expect(signatureA.parent).toBe(rig.body);
    expect(signatureA.userData.holdoutSignatureModel).toBe(true);
    expect(signatureA.scale.x).toBeCloseTo(1.25, 4);

    const signatureB = new THREE.Group();
    signatureB.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial()));
    attachHoldoutSignatureModel(rig, signatureB);

    expect(signatureA.parent).toBeNull();
    expect(signatureB.parent).toBe(rig.body);
    expect(rig.body.children.filter((c) => c.userData.holdoutSignatureModel)).toHaveLength(1);
  });
});

describe('shared hero bases (WS-A0)', () => {
  it('assigns every shipped hero a base or an explicit procedural holdout', () => {
    for (const hero of ALL_HEROES) {
      const base = heroBaseId(hero.id);
      expect(base, `${hero.id} base`).toBeTruthy();
      // Holdouts read worse on a base mesh; they intentionally map to procedural.
      if (base !== 'procedural') expect(HERO_BASE[hero.id], `${hero.id} cohort`).toBe(base);
    }
  });

  it('resolves shared base URLs only for shipped creature hero cohorts', () => {
    expect(ENABLED_HERO_BASES.size).toBe(12);
    expect(heroBaseUrl(heroBaseId('broodmother'))).toBe('/assets/creeps/spider.glb');
    expect(heroBaseUrl(heroBaseId('doom'))).toBe('/assets/creeps/demon.glb');
    expect(heroBaseUrl(heroBaseId('spirit-breaker'))).toBe('/assets/creeps/bull.glb');
    expect(heroBaseUrl(heroBaseId('juggernaut'))).toBeNull(); // humanoids use per-hero GLBs.
    expect(heroBaseUrl(heroBaseId('io'))).toBeNull(); // holdouts stay procedural.
  });

  it('resolves additive signature URLs for exactly the procedural holdouts (A6)', () => {
    expect(ENABLED_HOLDOUT_SIGNATURES.size).toBe(11);
    expect(holdoutSignatureUrl('io')).toBe('/assets/holdouts/io.glb');
    expect(holdoutSignatureUrl('phoenix')).toBe('/assets/holdouts/phoenix.glb');
    expect(holdoutSignatureUrl('juggernaut')).toBeNull(); // humanoids have full GLBs
    expect(holdoutSignatureUrl('broodmother')).toBeNull(); // creature-base heroes use shared creatures
    expect(holdoutSignatureUrl(undefined)).toBeNull();
    for (const hero of ALL_HEROES) {
      if (heroBaseId(hero.id) === 'procedural') {
        expect(holdoutSignatureUrl(hero.id), `${hero.id} signature`).toBe(`/assets/holdouts/${hero.id}.glb`);
      }
    }
  });

  it('resolves animated replacement URLs for exactly the procedural holdouts (A7)', () => {
    expect(ENABLED_HOLDOUT_MODELS.size).toBe(11);
    expect(holdoutReplacementUrl('io')).toBe('/assets/holdouts/replacements/io.glb');
    expect(holdoutReplacementUrl('phoenix')).toBe('/assets/holdouts/replacements/phoenix.glb');
    expect(holdoutReplacementUrl('juggernaut')).toBeNull();
    expect(holdoutReplacementUrl('broodmother')).toBeNull();
    expect(holdoutReplacementUrl(undefined)).toBeNull();
  });

  it('ships every generated holdout signature file and tracks them in the manifest', () => {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'assets', 'manifest.json'), 'utf8')) as {
      groups?: Record<string, { count: number; bytes: number }>;
      files?: { path: string; group: string; type: string }[];
    };
    expect(manifest.groups?.holdout?.count).toBe(ENABLED_HOLDOUT_SIGNATURES.size + ENABLED_HOLDOUT_MODELS.size);
    for (const heroId of ENABLED_HOLDOUT_SIGNATURES) {
      const url = holdoutSignatureUrl(heroId)!;
      const rel = url.replace('/assets/', '');
      const file = path.join(process.cwd(), 'public', 'assets', rel);
      expect(existsSync(file), `${heroId} signature file`).toBe(true);
      expect(statSync(file).size, `${heroId} signature size`).toBeGreaterThan(0);
      expect(
        manifest.files?.some((entry) => entry.path === rel && entry.group === 'holdout' && entry.type === 'model'),
        `${heroId} manifest entry`
      ).toBe(true);
    }
  });

  it('ships every generated holdout replacement file and tracks them in the manifest', () => {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'assets', 'manifest.json'), 'utf8')) as {
      files?: { path: string; group: string; type: string }[];
    };
    for (const heroId of ENABLED_HOLDOUT_MODELS) {
      const url = holdoutReplacementUrl(heroId)!;
      const rel = url.replace('/assets/', '');
      const file = path.join(process.cwd(), 'public', 'assets', rel);
      expect(existsSync(file), `${heroId} replacement file`).toBe(true);
      expect(statSync(file).size, `${heroId} replacement size`).toBeGreaterThan(0);
      expect(
        manifest.files?.some((entry) => entry.path === rel && entry.group === 'holdout' && entry.type === 'model'),
        `${heroId} replacement manifest entry`
      ).toBe(true);
    }
  });

  it('recolors a cloned base to a palette without sharing tint across clones', () => {
    const make = (): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: '#202020' }) // dark → secondary role
      );
      return mesh;
    };
    const a = make();
    const b = make();
    recolorToPalette(a, ['#ff0000', '#00ff00', '#0000ff']);
    recolorToPalette(b, ['#ffaa00', '#00aaff', '#aa00ff']);

    const colorA = (a.material as THREE.MeshStandardMaterial).color.getHexString();
    const colorB = (b.material as THREE.MeshStandardMaterial).color.getHexString();
    // Dark source bucketed to the secondary slot of each distinct palette.
    expect(colorA).toBe('00ff00');
    expect(colorB).toBe('00aaff');
    expect(colorA).not.toBe(colorB); // materials cloned, not shared
  });

  it('can make recolored creature materials solid and opaque for gameplay readability', () => {
    const source = new THREE.MeshStandardMaterial({ color: '#101010', transparent: true, opacity: 0.18 });
    source.map = new THREE.Texture();
    source.normalMap = new THREE.Texture();
    const model = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), source);

    recolorToPalette(model, ['#ff0000', '#00ff00', '#0000ff'], undefined, { solid: true, opaque: true });

    const next = model.material as THREE.MeshStandardMaterial;
    expect(next).not.toBe(source);
    expect(next.color.getHexString()).toBe('00ff00');
    expect(next.map).toBeNull();
    expect(next.normalMap).toBeNull();
    expect(next.transparent).toBe(false);
    expect(next.opacity).toBe(1);
  });
});

describe('within-cohort silhouette variation (WS-A / marquee)', () => {
  it('gives same-base marquee heroes distinct proportions instead of one body', () => {
    // Juggernaut and Sven are both Knight-base; they must not share a silhouette.
    const jug = heroProportions('juggernaut');
    const sven = heroProportions('sven');
    expect(sven.broad).toBeGreaterThan(jug.broad);
    expect(sven.height).toBeGreaterThan(jug.height);

    // Body classes read by cohort: a barbarian brute is broader than a slim mage,
    // and a dwarf rogue is markedly shorter than a tall caster.
    expect(heroProportions('pudge').broad).toBeGreaterThan(heroProportions('crystal-maiden').broad);
    expect(heroProportions('sniper').height).toBeLessThan(heroProportions('invoker').height);

    // Heroes with no explicit override still fall back to a finite cohort baseline.
    for (const hero of ALL_HEROES) {
      const p = heroProportions(hero.id);
      expect(Number.isFinite(p.broad) && p.broad > 0, `${hero.id} broad`).toBe(true);
      expect(Number.isFinite(p.height) && p.height > 0, `${hero.id} height`).toBe(true);
    }
  });

  it('stretches the mounted model to the hero proportions and re-seats the feet', () => {
    const { rig, model } = mountStandIn('pudge'); // broad 1.4, height 0.98
    const k = model.scale.x; // uniform fit factor from mountHeroModel
    const pudge = ALL_HEROES.find((h) => h.id === 'pudge')!;
    applyAuthoredSilhouette(rig, 'pudge', pudge.palette);

    const props = heroProportions('pudge');
    expect(model.scale.x).toBeCloseTo(k * props.broad, 4);
    expect(model.scale.z).toBeCloseTo(k * props.broad, 4);
    expect(model.scale.y).toBeCloseTo(k * props.height, 4);
    // Feet stay planted on the ground after the non-uniform stretch.
    const boxed = new THREE.Box3().setFromObject(model);
    expect(boxed.min.y).toBeCloseTo(0, 2);
  });

  it('layers innate identity gear over the authored body for marquee heroes', () => {
    // Wraith King reads as a crowned, caped skeleton king — both should appear as a
    // visible overlay group sitting over (not hidden behind) the mounted model.
    const { rig } = mountStandIn('wraith-king');
    applyAuthoredSilhouette(rig, 'wraith-king', ['#2f7d4f', '#13321f', '#9be3a0']);
    const overlay = rig.body.children.find((c) => c.userData.authoredOverlay);
    expect(overlay, 'wraith-king overlay').toBeDefined();
    expect(overlay!.children.length).toBeGreaterThan(0);
    expect(overlay!.visible).toBe(true);
  });

  it('is idempotent — a re-applied silhouette never stacks duplicate overlays', () => {
    const { rig } = mountStandIn('doom');
    const pal: [string, string, string] = ['#7a2222', '#2a0c0c', '#ffb14a'];
    applyAuthoredSilhouette(rig, 'doom', pal);
    const overlays1 = rig.body.children.filter((c) => c.userData.authoredOverlay);
    const count1 = overlays1[0]?.children.length ?? 0;
    applyAuthoredSilhouette(rig, 'doom', pal);
    const overlays2 = rig.body.children.filter((c) => c.userData.authoredOverlay);
    expect(overlays2.length).toBe(1); // single overlay group, not two
    expect(overlays2[0].children.length).toBe(count1); // same parts, not doubled
  });

  it('does not throw and adds no model scale when there is no mounted model', () => {
    const hero = ALL_HEROES.find((h) => h.id === 'invoker')!;
    const rig = buildUnitRig(hero.silhouette, hero.palette);
    expect(() => applyAuthoredSilhouette(rig, 'invoker', hero.palette)).not.toThrow();
    // Overlay still derived from features even without an authored model.
    expect(rig.body.children.some((c) => c.userData.authoredOverlay)).toBe(true);
  });

  it('never throws across the full authored humanoid cohort (render smoke)', () => {
    for (const heroId of ENABLED_HERO_MODELS) {
      const { rig } = mountStandIn(heroId);
      const hero = ALL_HEROES.find((h) => h.id === heroId)!;
      expect(() => applyAuthoredSilhouette(rig, heroId, hero.palette), heroId).not.toThrow();
    }
  });
});
