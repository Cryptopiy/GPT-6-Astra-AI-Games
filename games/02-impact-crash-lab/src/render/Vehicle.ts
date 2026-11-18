import * as THREE from 'three';
import type { DamageZone } from '../physics/types';

export class Vehicle {
  root = new THREE.Group();
  zones = {} as Record<DamageZone, THREE.Group>;
  wheels: THREE.Mesh[] = [];
  private applied = '';
  constructor() {
    const orange = 0xd86b3d;
    const mesh = (size: number[], at: number[], color: number, parent: THREE.Object3D = this.root, roughness = 0.45) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size as [number, number, number]), new THREE.MeshStandardMaterial({ color, roughness, metalness: color === orange ? 0.28 : 0.12 }));
      m.position.set(...at as [number, number, number]); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    // Narrow inner core leaves room for visible inward side-shell deformation.
    mesh([2.25, 0.65, 1.35], [-0.22, 0, 0], orange);
    mesh([3.5, 0.12, 1.72], [-0.18, -0.34, 0], 0x24292a);
    for (const zone of ['front', 'rear', 'left', 'right'] as DamageZone[]) { this.zones[zone] = new THREE.Group(); this.root.add(this.zones[zone]); }
    const front = this.zones.front; front.position.x = 0.85;
    mesh([1.3, 0.53, 1.82], [0.6, 0, 0], orange, front);
    mesh([1.22, 0.09, 1.71], [0.58, 0.3, 0], 0xe57847, front);
    mesh([0.09, 0.23, 1.22], [1.26, -0.04, 0], 0x222729, front);
    mesh([0.12, 0.13, 0.3], [1.29, 0.15, -0.67], 0xffecaf, front);
    mesh([0.12, 0.13, 0.3], [1.29, 0.15, 0.67], 0xffecaf, front);
    const rear = this.zones.rear; rear.position.x = -1.25;
    mesh([0.92, 0.57, 1.82], [-0.4, 0.01, 0], orange, rear);
    mesh([0.1, 0.16, 0.55], [-0.87, 0.14, 0.55], 0x802e25, rear);
    mesh([0.1, 0.16, 0.55], [-0.87, 0.14, -0.55], 0x802e25, rear);
    for (const [side, z] of [['left', -0.925], ['right', 0.925]] as const) {
      const group = this.zones[side]; group.position.z = z;
      mesh([2.15, 0.5, 0.26], [-0.2, 0.02, z > 0 ? -0.1 : 0.1], orange, group);
      mesh([0.03, 0.52, 0.03], [-0.28, 0.02, z > 0 ? 0.03 : -0.03], 0x9b4528, group);
      mesh([0.19, 0.035, 0.06], [-0.13, 0.17, 0], 0x343b39, group);
      mesh([0.19, 0.035, 0.06], [-0.96, 0.17, 0], 0x343b39, group);
    }
    mesh([1.84, 0.59, 1.63], [-0.28, 0.54, 0], 0x273b3c, this.root, 0.17);
    mesh([1.58, 0.075, 1.68], [-0.32, 0.875, 0], orange);
    const windshield = mesh([0.065, 0.57, 1.53], [0.61, 0.57, 0], 0x72938e, this.root, 0.12); windshield.rotation.z = 0.35;
    const backGlass = mesh([0.065, 0.51, 1.53], [-1.23, 0.54, 0], 0x516d6d, this.root, 0.18); backGlass.rotation.z = -0.35;
    mesh([0.075, 0.66, 1.69], [-0.37, 0.53, 0], orange);
    for (const z of [-0.79, 0.79]) {
      mesh([1.85, 0.055, 0.07], [-0.28, 0.29, z], orange);
      mesh([0.24, 0.15, 0.18], [0.53, 0.33, z * 1.3], orange);
    }
    for (const x of [-1.35, 1.3]) for (const z of [-0.93, 0.93]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 20), new THREE.MeshStandardMaterial({ color: 0x202525, roughness: 0.9 }));
      tire.rotation.x = Math.PI / 2; tire.position.set(x, -0.28, z); tire.castShadow = true; this.root.add(tire); this.wheels.push(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0xabb3ad, metalness: 0.6, roughness: 0.4 }));
      hub.rotation.x = Math.PI / 2; hub.position.copy(tire.position); this.root.add(hub);
    }
    // Procedural crash-test target decal. No external artwork or asset requests.
    const target = new THREE.Group();
    const disk = new THREE.Mesh(new THREE.CircleGeometry(0.27, 32), new THREE.MeshBasicMaterial({ color: 0xf2dd71, side: THREE.DoubleSide }));
    target.add(disk);
    for (const [a, b] of [[0, Math.PI / 2], [Math.PI, Math.PI * 1.5]]) { const wedge = new THREE.Mesh(new THREE.CircleGeometry(0.27, 12, a, b - a), new THREE.MeshBasicMaterial({ color: 0x252b29, side: THREE.DoubleSide })); wedge.position.z = 0.001; target.add(wedge); }
    target.rotation.x = -Math.PI / 2; target.position.set(-0.3, 0.918, 0); this.root.add(target);
  }
  damage(zone: DamageZone | undefined, percentage = 0) {
    const key = `${zone}:${percentage.toFixed(2)}`; if (this.applied === key) return; this.applied = key;
    for (const [name, group] of Object.entries(this.zones)) {
      group.scale.set(1, 1, 1); group.rotation.set(0, 0, 0);
      group.position.set(name === 'front' ? 0.85 : name === 'rear' ? -1.25 : 0, 0, name === 'left' ? -0.925 : name === 'right' ? 0.925 : 0);
      group.traverse(child => { if (child instanceof THREE.Mesh) { const mat = child.material as THREE.MeshStandardMaterial; if (!child.userData.originalColor) child.userData.originalColor = mat.color.clone(); mat.color.copy(child.userData.originalColor); } });
      if (name !== zone) continue;
      const d = percentage / 100;
      if (name === 'front' || name === 'rear') { group.scale.x = 1 - 0.53 * d; group.scale.y = 1 - 0.15 * d; group.rotation.z = (name === 'front' ? 1 : -1) * 0.16 * d; }
      else { group.position.z *= 1 - 0.16 * d; group.scale.y = 1 - d * 0.3; group.rotation.x = d * 0.15; }
      group.traverse(child => { if (child instanceof THREE.Mesh) (child.material as THREE.MeshStandardMaterial).color.lerp(new THREE.Color(0x4a332b), d * 0.62); });
    }
  }
}
