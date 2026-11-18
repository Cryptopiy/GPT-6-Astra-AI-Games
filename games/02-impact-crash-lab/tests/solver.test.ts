import test from 'node:test';
import assert from 'node:assert/strict';
import { Body, Box, ContactMaterial, Material, Plane, Vec3, World } from 'cannon-es';
import { ImpulseSolver } from '../src/physics/ImpulseSolver';

test('friction impulse has correct units: ground slide decelerates approximately μg', () => {
  const solver = new ImpulseSolver(); solver.iterations = 30;
  const world = new World({ gravity: new Vec3(0, -9.81, 0), solver });
  world.narrowphase.enableFrictionReduction = true;
  const mat = new Material(); world.addContactMaterial(new ContactMaterial(mat, mat, { friction: 0.55, restitution: 0 }));
  const ground = new Body({ mass: 0, shape: new Plane(), material: mat }); ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(ground);
  const car = new Body({ mass: 1500, shape: new Box(new Vec3(2.15, 0.62, 0.94)), position: new Vec3(0, 0.62, 0), material: mat, linearDamping: 0, angularDamping: 0 }); world.addBody(car);
  car.velocity.set(20, 0, 0); car.angularFactor.set(0, 0, 0);
  for (let i = 0; i < 240; i++) world.step(1 / 240);
  assert.ok(Math.abs(car.velocity.x - (20 - 0.55 * 9.81)) < 0.12);
});
test('isolated 3D head-on momentum and restitution agree with central-impact solution', () => {
  const solver = new ImpulseSolver(); solver.iterations = 50;
  const world = new World({ gravity: new Vec3(0, 0, 0), solver });
  const mat = new Material(); world.addContactMaterial(new ContactMaterial(mat, mat, { friction: 0, restitution: 0.12, contactEquationStiffness: 1e9, contactEquationRelaxation: 20 }));
  const a = new Body({ mass: 1500, shape: new Box(new Vec3(1, 1, 1)), position: new Vec3(-2, 0, 0), material: mat, linearDamping: 0, angularDamping: 0 });
  const b = new Body({ mass: 1500, shape: new Box(new Vec3(1, 1, 1)), position: new Vec3(0, 0, 0), material: mat, linearDamping: 0, angularDamping: 0 });
  a.velocity.x = 10; world.addBody(a); world.addBody(b);
  let impulse = 0;
  for (let i = 0; i < 24; i++) { world.step(1 / 240); for (const c of world.contacts) impulse += Math.max(0, c.multiplier) / 240; }
  assert.ok(Math.abs(1500 * (a.velocity.x + b.velocity.x) - 15000) < 0.01);
  assert.ok(Math.abs(a.velocity.x - 4.4) < 0.2); assert.ok(Math.abs(b.velocity.x - 5.6) < 0.2);
  assert.ok(Math.abs(impulse - 8400) < 300);
});
