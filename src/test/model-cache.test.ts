import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildUnitRig, modelGeometryCacheSize } from '../engine/models';

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
});
