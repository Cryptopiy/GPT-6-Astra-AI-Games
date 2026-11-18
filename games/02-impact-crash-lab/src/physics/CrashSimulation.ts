import { Body, Box, ContactMaterial, Material, Plane, Vec3, World, type ContactEquation } from 'cannon-es';
import { ImpulseSolver } from './ImpulseSolver';
import { DEFAULT_CONFIG, FIXED_DT, IMPACT_DURATION, OBSTACLES, validateConfig } from './obstacles';
import type { Configuration, DamageZone, Impact, Pose, RunPhase, RunResult, Snapshot, Telemetry, XYZ } from './types';

const xyz = (v: XYZ): XYZ => ({ x: v.x, y: v.y, z: v.z });
const pose = (b: Body): Pose => ({ position: xyz(b.position), quaternion: { ...xyz(b.quaternion), w: b.quaternion.w } });
export function damageZone(localNormal: XYZ, localPoint: XYZ = { x: 1, y: 0, z: 0 }): DamageZone {
  // A roof/underbody contact has no meaningful horizontal normal. Attribute
  // it to the nearest longitudinal/side region using normalized contact position.
  if (Math.abs(localNormal.y) > Math.hypot(localNormal.x, localNormal.z)) return damageZone({ x: localPoint.x / 2.15, y: 0, z: localPoint.z / 0.94 });
  return Math.abs(localNormal.x) >= Math.abs(localNormal.z) ? (localNormal.x >= 0 ? 'front' : 'rear') : (localNormal.z < 0 ? 'left' : 'right');
}

/** SI units throughout. Cannon resolves 3D box contacts, angular inertia, normal
 * impulses and Coulomb friction. The car has all six rigid-body degrees of freedom.
 * A 240 Hz fixed step limits travel at 200 km/h to 0.232 m, below collider thickness.
 * Speed is prescribed on the approach (a launch rig); after contact it is free motion.
 * No force or result is synthesized by rendering or frame rate.
 */
export class CrashSimulation {
  world!: World;
  car!: Body;
  obstacle!: Body;
  debris: Body[] = [];
  config: Configuration = { ...DEFAULT_CONFIG };
  phase: RunPhase = 'ready';
  elapsed = 0;
  impact: Impact | null = null;
  result: RunResult | null = null;
  trace: Telemetry[] = [];
  private accumulator = 0;
  private tick = 0;
  private runId = 0;
  private stableTime = 0;
  private contactEnergy = 0;
  private pendingContact: { normal: Vec3; point: Vec3; localNormal: Vec3; localPoint: Vec3; speed: number; normalSpeed: number } | null = null;
  private carMaterial!: Material;
  private groundContact!: ContactMaterial;
  constructor(config: Configuration = DEFAULT_CONFIG) { this.reset(config); }

  reset(config: Configuration = this.config) {
    this.config = validateConfig(config);
    this.phase = 'ready'; this.elapsed = 0; this.tick = 0; this.accumulator = 0;
    this.impact = null; this.result = null; this.trace = []; this.debris = [];
    this.stableTime = 0; this.contactEnergy = 0; this.pendingContact = null;
    const solver = new ImpulseSolver(); solver.iterations = 24; solver.tolerance = 1e-8;
    this.world = new World({ gravity: new Vec3(0, -9.81, 0), allowSleep: true, solver });
    this.world.narrowphase.enableFrictionReduction = true;
    const groundMaterial = new Material('floor');
    this.carMaterial = new Material('vehicle');
    const obstacleMaterial = new Material('barrier');
    // Frictionless launch rollers avoid a sliding chassis pitching before contact.
    // Restore road friction when the car leaves the launch rig at first impact.
    this.groundContact = new ContactMaterial(this.carMaterial, groundMaterial, { friction: 0, restitution: 0.01 });
    this.world.addContactMaterial(this.groundContact);
    this.world.addContactMaterial(new ContactMaterial(obstacleMaterial, groundMaterial, { friction: 0.5, restitution: 0.01 }));
    this.world.addContactMaterial(new ContactMaterial(this.carMaterial, obstacleMaterial, { friction: 0.32, restitution: OBSTACLES[config.obstacle].restitution, contactEquationStiffness: 1e9, contactEquationRelaxation: 20 }));
    const ground = new Body({ mass: 0, material: groundMaterial, shape: new Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    const angle = config.angle * Math.PI / 180;
    this.car = new Body({ mass: config.mass, material: this.carMaterial, shape: new Box(new Vec3(2.15, 0.62, 0.94)), position: new Vec3(-22 * Math.cos(angle) - 0.7, 0.63, 22 * Math.sin(angle)), linearDamping: 0.005, angularDamping: 0.35, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.7 });
    this.car.quaternion.setFromEuler(0, angle, 0);
    this.world.addBody(this.car);
    this.obstacle = new Body({ mass: OBSTACLES[config.obstacle].mass, shape: new Box(new Vec3(0.7, 1.05, 5)), material: obstacleMaterial, position: new Vec3(0, 1.055, 0), linearDamping: 0.05, angularDamping: 0.3, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.7 });
    this.world.addBody(this.obstacle);
    this.car.addEventListener('collide', (event: { body: Body; contact: ContactEquation }) => {
      if (event.body !== this.obstacle || this.impact || this.pendingContact) return;
      const c = event.contact;
      const normal = c.ni.clone();
      if (c.bi !== this.car) normal.negate(normal);
      const offset = c.bi === this.car ? c.ri : c.rj;
      const point = this.car.position.vadd(offset);
      const carPointVelocity = this.car.getVelocityAtWorldPoint(point, new Vec3());
      const obstaclePointVelocity = this.obstacle.getVelocityAtWorldPoint(point, new Vec3());
      const normalSpeed = Math.max(0, carPointVelocity.vsub(obstaclePointVelocity).dot(normal));
      this.pendingContact = { normal, point, localNormal: this.car.vectorToLocalFrame(normal), localPoint: this.car.vectorToLocalFrame(offset), speed: this.car.velocity.length() * 3.6, normalSpeed };
      this.groundContact.friction = 0.55;
    });
  }
  run(config: Configuration = this.config) { this.reset(config); this.phase = 'approach'; this.setLaunchVelocity(); }
  private setLaunchVelocity() {
    const a = this.config.angle * Math.PI / 180;
    this.car.velocity.x = this.config.speed / 3.6 * Math.cos(a);
    this.car.velocity.z = -this.config.speed / 3.6 * Math.sin(a);
  }
  advance(seconds: number) {
    if (this.phase === 'ready' || this.phase === 'complete' || !Number.isFinite(seconds) || seconds <= 0) return;
    // Slow frames slow simulation time instead of dropping physical steps or tunneling.
    this.accumulator += Math.min(seconds, 0.1);
    while (this.accumulator + 1e-10 >= FIXED_DT && this.phase !== ('complete' as RunPhase)) { this.step(); this.accumulator -= FIXED_DT; }
  }
  step() {
    if (this.phase === 'ready' || this.phase === 'complete') return;
    if (this.phase === 'approach') this.setLaunchVelocity();
    this.world.step(FIXED_DT);
    this.tick++; this.elapsed = this.tick * FIXED_DT;
    if (this.pendingContact && !this.impact) {
      const contact = this.pendingContact;
      const spec = OBSTACLES[this.config.obstacle];
      // Reduced-mass normal energy is an educational estimate of energy dissipated
      // in the first collision: E = 1/2 μ (1-e²) vn². Tangential motion is excluded.
      const reducedMass = spec.mass === 0 ? this.config.mass : 1 / (1 / this.config.mass + 1 / spec.mass);
      this.contactEnergy = 0.5 * reducedMass * (1 - spec.restitution ** 2) * contact.normalSpeed ** 2;
      // A fixed 140 kJ reference makes mass matter. This is a severity index,
      // not an injury prediction or a calibrated structural damage measurement.
      const damage = 100 * (1 - Math.exp(-this.contactEnergy * spec.rigidity / 140000));
      this.impact = { speed: contact.speed, normalSpeed: contact.normalSpeed, impulse: 0, force: 0, energy: this.contactEnergy, damage, zone: damageZone(contact.localNormal, contact.localPoint), point: xyz(contact.point), time: this.elapsed };
      this.phase = 'impact';
      this.pendingContact = null;
      this.spawnDebris(contact.point, contact.normal);
    }
    let instantaneousForce = 0;
    if (this.impact) {
      const age = this.elapsed - this.impact.time;
      // Sum solved normal contact forces across ALL car/barrier manifold points.
      // Integrating λ (N) * dt (s) gives measured solver impulse in N·s.
      // Favg = J / assumed 0.12 s is an estimate, never labeled peak real force.
      if (age <= IMPACT_DURATION) {
        for (const c of this.world.contacts) {
          if ((c.bi === this.car && c.bj === this.obstacle) || (c.bj === this.car && c.bi === this.obstacle)) instantaneousForce += Math.max(0, c.multiplier);
        }
        this.impact.impulse += instantaneousForce * FIXED_DT;
        this.impact.force = this.impact.impulse / IMPACT_DURATION;
      }
      if (age > 0.28) this.phase = 'settling';
      const quiet = this.car.velocity.length() < 0.15 && this.car.angularVelocity.length() < 0.15 && this.obstacle.velocity.length() < 0.15 && this.obstacle.angularVelocity.length() < 0.15;
      this.stableTime = quiet ? this.stableTime + FIXED_DT : 0;
      if (age > 1.2 && this.stableTime > 0.8) this.finish(true);
      // Explicit observation horizon; never present a moving endpoint as rest.
      if (age >= 14 && !this.result) this.finish(false);
    }
    if (this.tick % 8 === 0) this.trace.push({ time: this.elapsed, speed: this.car.velocity.length() * 3.6, force: this.impact?.force ?? 0 });
    if (!this.isFinite()) throw new Error('Simulation produced a non-finite state. Reset to start a new test.');
    if (!this.impact && this.elapsed > 20) throw new Error('The vehicle did not reach the barrier. Reset the experiment.');
  }
  private spawnDebris(point: Vec3, normal: Vec3) {
    const count = Math.floor((this.impact?.damage ?? 0) / 8) + 3;
    for (let i = 0; i < count; i++) {
      const theta = i * 2.39996;
      // Fixed pattern, never random. Fragments collide in 3D with the floor;
      // their visual ejection energy is excluded from primary crash accounting.
      const fragment = new Body({ mass: 0.08, shape: new Box(new Vec3(0.07 + i % 3 * 0.025, 0.045, 0.06)), position: new Vec3(point.x - normal.x * 0.3, 0.35 + i * 0.09, point.z + Math.sin(theta) * 0.2), material: this.carMaterial, linearDamping: 0.2, angularDamping: 0.3, collisionFilterGroup: 2, collisionFilterMask: 1 });
      const energyScale = Math.sqrt((this.impact?.damage ?? 0) / 100);
      fragment.velocity.set(-normal.x * 2 + Math.cos(theta) * 4 * energyScale, 1 + i % 4 * energyScale, Math.sin(theta) * 5 * energyScale);
      fragment.angularVelocity.set(i % 3, 3, i % 4);
      this.world.addBody(fragment); this.debris.push(fragment);
    }
    // Fragments are cosmetic physical bodies and may contact the ground only.
    this.car.collisionFilterMask = 1; this.obstacle.collisionFilterMask = 1;
  }
  private finish(settled: boolean) {
    if (!this.impact) return;
    this.phase = 'complete';
    const angles = new Vec3(); this.car.quaternion.toEuler(angles, 'YZX');
    const degrees = 180 / Math.PI;
    this.result = { id: ++this.runId, config: { ...this.config }, impact: { ...this.impact, point: { ...this.impact.point } }, finalPosition: xyz(this.car.position), rotation: { x: angles.x * degrees, y: angles.y * degrees, z: angles.z * degrees }, finalSpeed: this.car.velocity.length() * 3.6, obstacleDisplacement: Math.hypot(this.obstacle.position.x, this.obstacle.position.z), elapsed: this.elapsed, settled, kineticBefore: 0.5 * this.config.mass * (this.config.speed / 3.6) ** 2, kineticAfter: 0.5 * this.config.mass * this.car.velocity.lengthSquared(), trace: [...this.trace] };
  }
  isFinite() { return [this.car, this.obstacle, ...this.debris].every(b => [b.position.x, b.position.y, b.position.z, b.velocity.x, b.velocity.y, b.velocity.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w, b.angularVelocity.x, b.angularVelocity.y, b.angularVelocity.z].every(Number.isFinite)); }
  snapshot(): Snapshot { return { phase: this.phase, config: { ...this.config }, elapsed: this.elapsed, speed: this.car.velocity.length() * 3.6, car: pose(this.car), obstacle: pose(this.obstacle), debris: this.debris.map(pose), impact: this.impact ? { ...this.impact, point: { ...this.impact.point } } : null, trace: [...this.trace], result: this.result }; }
}
