import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Vehicle } from './Vehicle';
import { OBSTACLES } from '../physics/obstacles';
import type { Configuration, Snapshot } from '../physics/types';

export class LabRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  controls: OrbitControls;
  vehicle = new Vehicle();
  obstacle = new THREE.Group();
  private obstacleBlocks: THREE.Mesh[] = [];
  private debrisMeshes: THREE.Mesh[] = [];
  private observer: ResizeObserver;
  private textures: THREE.Texture[] = [];
  private trajectory: THREE.Line;
  private trail: THREE.Line;
  private trailPoints: THREE.Vector3[] = [];
  private lastTime = -1;
  private focusMode = false;
  private lastConfig = '';
  private autoFollow = true;
  private inPostImpact = false;
  constructor(private host: HTMLElement, onOrbit?: () => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0xd7dcd3); this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.22;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D crash test scene. Drag to orbit. Scroll to zoom.');
    this.renderer.domElement.setAttribute('role', 'img'); host.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.Fog(0xd7dcd3, 150, 400);
    this.scene.add(new THREE.HemisphereLight(0xf7fff1, 0x6d8076, 2.8));
    const sun = new THREE.DirectionalLight(0xfff1d8, 4.1); sun.position.set(-15, 35, 20); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 60, top: 45, bottom: -45, near: 0.5, far: 110 });
    sun.shadow.normalBias = 0.045; sun.shadow.bias = -0.0002; this.scene.add(sun);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.06; this.controls.minDistance = 8; this.controls.maxDistance = 110;
    this.controls.addEventListener('start', () => { this.focusMode = false; this.autoFollow = false; onOrbit?.(); });
    this.home();
    this.makeEnvironment(); this.scene.add(this.vehicle.root, this.obstacle);
    this.makeObstacle();
    this.trajectory = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x72816b, dashSize: 0.6, gapSize: 0.45, transparent: true, opacity: 0.6 })); this.scene.add(this.trajectory);
    this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x5d564a, transparent: true, opacity: 0.6 })); this.scene.add(this.trail);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
  }
  private box(size: [number, number, number], at: [number, number, number], color: number, parent: THREE.Object3D = this.scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.88 })); m.position.set(...at); m.receiveShadow = true; m.castShadow = true; parent.add(m); return m;
  }
  private label(text: string, at: [number, number, number], width = 3, color = '#707b70', flat = true, parent: THREE.Object3D = this.scene) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.font = '600 48px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 64);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.push(texture);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(...at); if (flat) { mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = Math.PI / 2; } parent.add(mesh); return mesh;
  }
  private makeEnvironment() {
    this.box([1600, 0.4, 1600], [25, -0.28, 0], 0xc9cec3);
    const apronGrid = new THREE.GridHelper(1400, 140, 0xb5beb0, 0xbcc4b6); apronGrid.position.y = -0.074; this.scene.add(apronGrid);
    this.box([93, 0.08, 64], [12, -0.045, 0], 0xb4bcae);
    const grid = new THREE.GridHelper(100, 50, 0x9fa99a, 0xaab3a3); grid.position.set(12, 0.004, 0); (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.27; this.scene.add(grid);
    this.box([64, 0.008, 11.5], [-1, 0.015, 0], 0xa1aa9c);
    for (const z of [-5.7, 5.7]) this.box([64, 0.01, 0.09], [-1, 0.025, z], 0xe7e8d3);
    for (let x = -30; x <= 29; x += 3) this.box([1.5, 0.009, 0.08], [x, 0.029, 0], 0xdde0c8);
    for (let x = -30; x <= 35; x += 5) {
      this.box([0.06, 0.01, 0.65], [x, 0.027, 6.3], 0xe9ebd7);
      this.label(`${x > 0 ? '+' : ''}${x} m`, [x, 0.03, 7.2], 2.2);
    }
    // The impact zone is a floor marking, not a collision trigger.
    this.box([5.5, 0.01, 12], [0, 0.033, 0], 0xb5b783);
    for (let z = -5.6; z <= 5.6; z += 0.7) { const stripe = this.box([0.75, 0.012, 0.23], [-2.35, 0.04, z], 0x515c4a); stripe.rotation.y = -Math.PI / 4; }
    this.label('IMPACT ZONE', [1.9, 0.055, 0], 4.5, '#555f48');
    this.label('TEST LANE  /  01', [-17, 0.04, -4.4], 7.5, '#d7decc');
    for (let z = -13; z <= 13; z += 6.5) for (const x of [-31, 35]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.75, 16), new THREE.MeshStandardMaterial({ color: 0xbf693e })); cone.position.set(x, 0.38, z); cone.castShadow = true; this.scene.add(cone); this.box([0.5, 0.07, 0.5], [x, 0.04, z], 0x4f594e);
    }
    for (const z of [-10, 10]) {
      this.box([0.14, 2.6, 0.14], [-2.5, 1.3, z], 0x515c52);
      this.box([0.62, 0.3, 0.32], [-2.5, 2.65, z], 0x323e39);
      this.box([0.04, 0.16, 0.21], [-2.15, 2.65, z], 0x97ab9c);
    }
  }
  private makeObstacle() {
    for (let z = -4; z <= 4; z += 2) {
      const block = this.box([1.4, 2.1, 1.97], [0, 0, z], OBSTACLES.concrete.color, this.obstacle); this.obstacleBlocks.push(block);
      this.box([0.015, 0.34, 1.9], [-0.709, 0.43, z], 0xd5ca75, this.obstacle);
      for (let off = -0.7; off < 0.9; off += 0.45) { const slash = this.box([0.017, 0.38, 0.17], [-0.72, 0.43, z + off], 0x3d483d, this.obstacle); slash.rotation.x = 0.48; }
      this.box([1.08, 0.07, 0.08], [0, 1.08, z - 0.55], 0x8a9487, this.obstacle);
    }
  }
  configure(config: Configuration) {
    const key = JSON.stringify(config); if (key === this.lastConfig) return; this.lastConfig = key;
    for (const m of this.obstacleBlocks) (m.material as THREE.MeshStandardMaterial).color.setHex(OBSTACLES[config.obstacle].color);
    const a = config.angle * Math.PI / 180;
    this.trajectory.geometry.dispose(); this.trajectory.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-28 * Math.cos(a) - 0.7, 0.08, 28 * Math.sin(a)), new THREE.Vector3(-0.7, 0.08, 0)]); this.trajectory.computeLineDistances();
  }
  update(state: Snapshot) {
    this.configure(state.config);
    this.vehicle.root.position.copy(state.car.position); this.vehicle.root.quaternion.copy(state.car.quaternion);
    this.obstacle.position.copy(state.obstacle.position); this.obstacle.quaternion.copy(state.obstacle.quaternion);
    this.vehicle.damage(state.impact?.zone, state.impact?.damage ?? 0);
    if (state.elapsed < this.lastTime) { this.trailPoints = []; this.trail.geometry.dispose(); this.trail.geometry = new THREE.BufferGeometry(); this.inPostImpact = false; if (this.autoFollow) this.home(); }
    if (state.impact && state.elapsed !== this.lastTime && state.car.position.y < 2 && (this.trailPoints.length === 0 || this.trailPoints.at(-1)!.distanceTo(new THREE.Vector3(state.car.position.x, 0.07, state.car.position.z)) > 0.2)) {
      this.trailPoints.push(new THREE.Vector3(state.car.position.x, 0.07, state.car.position.z));
      if (this.trailPoints.length > 2000) this.trailPoints.shift(); this.trail.geometry.dispose(); this.trail.geometry = new THREE.BufferGeometry().setFromPoints(this.trailPoints);
    }
    this.lastTime = state.elapsed;
    while (this.debrisMeshes.length < state.debris.length) { const i = this.debrisMeshes.length; const m = this.box([0.14 + i % 3 * 0.05, 0.09, 0.12], [0, 0, 0], i % 3 ? 0xc96237 : 0x454a42); this.debrisMeshes.push(m); }
    this.debrisMeshes.forEach((m, i) => { const p = state.debris[i]; m.visible = Boolean(p); if (p) { m.position.copy(p.position); m.quaternion.copy(p.quaternion); } });
    if (this.focusMode) { const target = new THREE.Vector3(state.car.position.x, 0.4, state.car.position.z); const delta = target.clone().sub(this.controls.target).multiplyScalar(0.07); this.controls.target.add(delta); this.camera.position.add(delta); }
    else if (state.impact && this.autoFollow) {
      // After contact follow the physical car onto the open apron. High-energy
      // glancing runs can slide hundreds of metres; never leave them offscreen.
      this.inPostImpact = true;
      const target = new THREE.Vector3(state.car.position.x, 0.4, state.car.position.z);
      this.controls.target.lerp(target, 0.045);
      this.camera.position.lerp(target.clone().add(new THREE.Vector3(-16, 15, 20)), 0.035);
    }
    {
      const sun = this.scene.children.find(o => o instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
      sun.position.set(state.car.position.x - 15, 35, state.car.position.z + 20);
      sun.target.position.set(state.car.position.x, 0, state.car.position.z);
      if (!sun.target.parent) this.scene.add(sun.target);
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
  home() { this.focusMode = false; this.autoFollow = true; this.camera.position.set(-31, 26, 34); this.controls.target.set(-9, 0, 0); this.controls.update(); }
  focus() { this.focusMode = true; const p = this.vehicle.root.position; this.controls.target.copy(p); this.camera.position.set(p.x - 10, 9, p.z + 12); this.controls.update(); }
  private resize() { const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h); }
  dispose() { this.observer.disconnect(); this.controls.dispose(); this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } }); this.textures.forEach(t => t.dispose()); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
