import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Vehicle } from '../src/render/Vehicle';

test('front deformation is proportional, and reset restores exact mesh bounds', () => {
  const car = new Vehicle(); const original = new THREE.Box3().setFromObject(car.zones.front);
  car.damage('front', 90); const damaged = new THREE.Box3().setFromObject(car.zones.front);
  assert.ok(damaged.max.x < original.max.x - 0.3);
  car.damage(undefined); const restored = new THREE.Box3().setFromObject(car.zones.front);
  assert.deepEqual(restored, original);
});
test('high side damage remains on the exposed vehicle shell', () => {
  for (const side of ['left', 'right'] as const) {
    const car = new Vehicle(); car.damage(side, 100);
    const core = new THREE.Box3().setFromObject(car.root.children[0]);
    const damaged = new THREE.Box3().setFromObject(car.zones[side]);
    assert.equal(core.containsBox(damaged), false, 'The entire damaged panel cannot disappear inside the core');
    assert.ok(side === 'right' ? damaged.max.z > core.max.z + 0.07 : damaged.min.z < core.min.z - 0.07);
  }
});
