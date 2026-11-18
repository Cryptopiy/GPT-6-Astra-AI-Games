import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, NX, NZ, SIZE, WIDTH, LENGTH, xAt, zAt, sampleBed, ROAD_X, ROAD_Z, coastAt } from '../simulation/terrain';
import { Simulation } from '../simulation/Simulation';

const RELIEF = 1.35;
const CORNER_X = [-1, 1, -1, 1];
const CORNER_Z = [-1, -1, 1, 1];
const TRIANGLE_CORNERS = [0, 2, 1, 1, 2, 3];
export type View = 'overview' | 'coast';
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1800);
  readonly controls: OrbitControls;
  private readonly observer: ResizeObserver;
  private readonly waterGeometry = new THREE.BufferGeometry();
  private readonly waterPositions = new Float32Array(SIZE * 18);
  private readonly waterColors = new Float32Array(SIZE * 18);
  private readonly waterMaterial: THREE.ShaderMaterial;
  private readonly vehicles: THREE.Group[] = [];
  private readonly labels: THREE.Sprite[] = [];
  private readonly terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, flatShading: true });
  private readonly terrainColors: Float32Array;
  private readonly naturalColors: Float32Array;
  private readonly terrain: THREE.Mesh;
  private readonly marker: THREE.Group;
  private readonly foam: THREE.Points;
  private readonly foamPositions = new Float32Array(700 * 3);
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private waterTick = -1;
  private waterStep = -1;
  private readonly corners = new Float32Array(12);
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(private readonly host: HTMLDivElement, readonly sim: Simulation) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0xd8e2df);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D coastal terrain. Drag to orbit, scroll to zoom, right-drag to pan.');
    this.renderer.domElement.style.touchAction = 'none';
    host.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.Fog(0xd8e2df, 600, 1150);
    this.scene.add(new THREE.HemisphereLight(0xe7f7ff, 0xb09a79, 2.5));
    const sun = new THREE.DirectionalLight(0xffedcc, 3.5);
    sun.position.set(-110, 240, -160); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -210, right: 210, top: 200, bottom: -200, near: 1, far: 550 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.35;
    this.scene.add(sun);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 90; this.controls.maxDistance = 650;
    this.controls.minPolarAngle = 0.15; this.controls.maxPolarAngle = Math.PI / 2 - 0.08;
    this.controls.maxTargetRadius = 140;
    this.setView('overview');
    const { geometry, colors } = this.makeTerrain();
    this.terrainColors = colors; this.naturalColors = colors.slice();
    this.terrain = new THREE.Mesh(geometry, this.terrainMaterial);
    this.terrain.receiveShadow = true; this.scene.add(this.terrain);
    this.makeSlab(); this.makeRoads(); this.makeBuildings(); this.makeTrees(); this.makeDetails();
    this.mergeMeshes(this.scene);
    for (const car of sim.vehicles) { const group = this.makeCar(car.color); this.vehicles.push(group); this.scene.add(group); }
    this.marker = this.makeSafeMarker();
    this.waterGeometry.setAttribute('position', new THREE.BufferAttribute(this.waterPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.waterGeometry.setAttribute('color', new THREE.BufferAttribute(this.waterColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.waterMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vColor; varying vec3 vWorld; void main(){vColor=color; vWorld=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform float uTime; varying vec3 vColor; varying vec3 vWorld;
        void main(){
          float a=sin(vWorld.x*1.35-vWorld.z*.47-uTime*1.8);
          float b=sin(vWorld.z*.91+vWorld.x*.4+uTime*.8);
          float glint=pow(max(0.,a*b),13.)*.19;
          float lines=smoothstep(.91,1.,sin(vWorld.x*.9+vWorld.z*.32-uTime*1.4))*.035;
          gl_FragColor=vec4(vColor+glint+lines,.84);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const water = new THREE.Mesh(this.waterGeometry, this.waterMaterial); water.frustumCulled = false; water.renderOrder = 2; this.scene.add(water);
    const foamGeometry = new THREE.BufferGeometry();
    foamGeometry.setAttribute('position', new THREE.BufferAttribute(this.foamPositions, 3).setUsage(THREE.DynamicDrawUsage));
    const foamMaterial = new THREE.PointsMaterial({ color: 0xf1ffed, size: 0.85, transparent: true, opacity: 0.7, depthWrite: false });
    this.foam = new THREE.Points(foamGeometry, foamMaterial); this.foam.frustumCulled = false; this.foam.renderOrder = 3; this.scene.add(this.foam);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
    this.updateWater(); this.render(0);
  }
  setView(view: View): void {
    if (view === 'overview') { this.camera.position.set(-285, 288, 322); this.controls.target.set(2, 3, 0); }
    else { this.camera.position.set(-195, 92, 165); this.controls.target.set(17, 9, -6); }
    this.controls.update();
  }
  setElevationOverlay(enabled: boolean): void {
    const color = new THREE.Color();
    for (let k = 0; k < SIZE; k++) {
      if (enabled && this.sim.world.land[k]) {
        const h = this.sim.world.bed[k];
        color.set(h < 3 ? 0xe1bf79 : h < 8 ? 0xaaba83 : h < 15 ? 0x6e9b7d : h < 23 ? 0x467d74 : 0xe0e6be);
        color.toArray(this.terrainColors, k * 3);
      } else this.terrainColors.set(this.naturalColors.subarray(k * 3, k * 3 + 3), k * 3);
    }
    this.terrain.geometry.getAttribute('color').needsUpdate = true;
  }
  private material(color: number, roughness = 0.8): THREE.MeshStandardMaterial {
    const key = `${color}/${roughness}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
    return this.materials.get(key)!;
  }
  private box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number, shadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.material(color));
    mesh.position.set(x,y,z); mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private makeTerrain(): { geometry: THREE.BufferGeometry; colors: Float32Array } {
    const positions = new Float32Array(SIZE * 3), colors = new Float32Array(SIZE * 3), indices: number[] = [];
    const color = new THREE.Color();
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, h = this.sim.world.bed[k];
      positions.set([xAt(i), h * RELIEF, zAt(j)], k * 3);
      if (h < 0) color.set(0xb1b9a5);
      else if (h < 1.1) color.set(0xe0c99d);
      else if (h < 4) color.set(0xb7be8b);
      else if (h < 12) color.set(0xa5b389);
      else color.set(0x839d7c);
      color.multiplyScalar(1 + 0.025 * Math.sin(i * 8.1 + j * 3.7));
      color.toArray(colors, k * 3);
      if (i < NX - 1 && j < NZ - 1) indices.push(k,k + NX,k + 1,k + 1,k + NX,k + NX + 1);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions,3)); geometry.setAttribute('color',new THREE.BufferAttribute(colors,3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return { geometry, colors };
  }
  private makeSlab(): void {
    const positions: number[] = [];
    const perimeter: number[] = [];
    for (let i = 0; i < NX; i++) perimeter.push(i);
    for (let j = 1; j < NZ; j++) perimeter.push(j * NX + NX - 1);
    for (let i = NX - 2; i >= 0; i--) perimeter.push((NZ - 1) * NX + i);
    for (let j = NZ - 2; j > 0; j--) perimeter.push(j * NX);
    for (let p = 0; p < perimeter.length; p++) {
      const a = perimeter[p], b = perimeter[(p + 1) % perimeter.length];
      const ax = xAt(a % NX), az = zAt(Math.floor(a / NX)), bx = xAt(b % NX), bz = zAt(Math.floor(b / NX));
      const ay = this.sim.world.bed[a] * RELIEF, by = this.sim.world.bed[b] * RELIEF;
      positions.push(ax,ay,az,ax,-17,az,bx,by,bz,bx,by,bz,ax,-17,az,bx,-17,bz);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geometry.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8c9886, roughness: 1, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(geometry,mat); wall.receiveShadow = true; this.scene.add(wall);
    this.box(this.scene, WIDTH - CELL, 3, LENGTH - CELL, 0,-18.5,0,0x6c817a);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2500,2500),this.material(0xd8e2df));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -21; floor.receiveShadow = true; this.scene.add(floor);
  }
  private ribbon(points: [number, number][], width: number, color: number, lift = 0.12): void {
    const vertices: number[] = [];
    for (let p = 0; p < points.length - 1; p++) {
      const [x,z] = points[p], [xx,zz] = points[p+1], len = Math.hypot(xx-x,zz-z);
      const nx = -(zz-z)/len*width/2, nz = (xx-x)/len*width/2;
      const corners = [[x+nx,z+nz],[x-nx,z-nz],[xx+nx,zz+nz],[xx-nx,zz-nz]];
      for (const index of [0,2,1,1,2,3]) { const [cx,cz] = corners[index]; vertices.push(cx, sampleBed(this.sim.world,cx,cz)*RELIEF+lift,cz); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo,this.material(color)); mesh.receiveShadow = true; this.scene.add(mesh);
  }
  private makeRoads(): void {
    for (const x of ROAD_X) {
      const points: [number,number][] = [];
      for (let z = -116; z <= 116; z += 2) points.push([x,z]);
      this.ribbon(points,5.8,0x6b7c76,0.17);
      for (let z=-110; z<110; z+=9) if (!ROAD_Z.some(v=>Math.abs(v-z)<8)) this.ribbon([[x,z],[x,z+3]],0.17,0xe8dcad,0.18);
    }
    for (const z of ROAD_Z) {
      const points: [number,number][]=[];
      for (let x=coastAt(z)+9;x<140;x+=2) points.push([x,z]);
      this.ribbon(points,5.8,0x6b7c76,0.17);
      for(let x=-62;x<135;x+=9) if(!ROAD_X.some(v=>Math.abs(v-x)<8)) this.ribbon([[x,z],[x+3,z]],0.17,0xe8dcad,0.19);
    }
    // Winding access path to the refuge follows the same height field.
    this.ribbon([[78,-27],[93,-33],[108,-44],[107,-57],[98,-66],[89,-65]],3,0xcccaac,0.18);
  }
  private makeBuildings(): void {
    for (const b of this.sim.world.buildings) {
      const y = b.base * RELIEF;
      this.box(this.scene,b.width+1,1.2,b.length+1,b.x,y+0.1,b.z,0xb1b3a3);
      this.box(this.scene,b.width,b.height,b.length,b.x,y+b.height/2,b.z,b.color);
      const roof = b.id % 4 === 0 ? 0x65847c : b.id % 3 === 0 ? 0xb87855 : 0x8e8170;
      this.box(this.scene,b.width+0.7,0.7,b.length+0.7,b.x,y+b.height+0.2,b.z,roof);
      this.box(this.scene,2.5,0.65,2,b.x+1,y+b.height+0.8,b.z-2,0xacae9e,false);
      for (let level=2;level<b.height-0.8;level+=3) {
        for (let x=-b.width/2+2; x<b.width/2-1; x+=3.4) {
          this.box(this.scene,1.4,1.5,0.08,b.x+x,y+level,b.z+b.length/2+0.05,0x4c6967,false);
          this.box(this.scene,1.4,1.5,0.08,b.x+x,y+level,b.z-b.length/2-0.05,0x4c6967,false);
        }
        for(let z=-b.length/2+2;z<b.length/2-1;z+=3.4) this.box(this.scene,0.08,1.5,1.4,b.x-b.width/2-0.05,y+level,b.z+z,0x4c6967,false);
      }
      this.box(this.scene,1.5,2.2,0.1,b.x,y+1.1,b.z+b.length/2+0.1,0x796d59,false);
    }
  }
  private makeTrees(): void {
    const positions: [number,number][]=[];
    for(let n=0;n<220;n++) {
      const x=-62+((n*47.91)%195),z=-111+((n*71.71)%220);
      if (ROAD_X.some(v=>Math.abs(v-x)<7) || ROAD_Z.some(v=>Math.abs(v-z)<7)) continue;
      if (this.sim.world.buildings.some(b=>Math.abs(b.x-x)<b.width/2+4 && Math.abs(b.z-z)<b.length/2+4)) continue;
      if (Math.hypot(x-92,z+61)<13) continue;
      positions.push([x,z]);
    }
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.35,.48,3,6),this.material(0x7b7050),positions.length);
    const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.5,0),this.material(0x688761),positions.length);
    const dummy=new THREE.Object3D();
    positions.forEach(([x,z],i)=>{
      const y=sampleBed(this.sim.world,x,z)*RELIEF, scale=0.8+(i%4)*.15;
      dummy.position.set(x,y+1.5,z);dummy.scale.set(1,1,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      dummy.position.set(x,y+4.1,z);dummy.scale.set(scale,scale*1.2,scale);dummy.rotation.y=i;dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
    });
    trunks.castShadow=true;crowns.castShadow=true;this.scene.add(trunks,crowns);
  }
  private makeDetails(): void {
    // Piers, bollards, promenade, and small waterfront sheds are generated locally.
    for(const z of [-91,66]) {
      const coast=coastAt(z);
      this.box(this.scene,19,0.7,5,coast-6,1.2,z,0xab9873);
      for(const dx of [-13,-4,2]) for(const dz of [-1.8,1.8]) this.box(this.scene,.55,5,.55,coast+dx,-0.7,z+dz,0x7a8170);
    }
    const promenade:[number,number][]=[];
    for(let z=-111;z<=111;z+=3) promenade.push([coastAt(z)+5,z]);
    this.ribbon(promenade,2,0xefe0ba,0.12);
    for(const z of [-80,-30,20,75]) {
      const x=coastAt(z)+5,y=sampleBed(this.sim.world,x,z)*RELIEF;
      this.box(this.scene,.22,5,.22,x,y+2.5,z,0x71827a);
      this.box(this.scene,1.5,.25,.55,x+.5,y+5,z,0xeae4c8);
    }
    this.label('NORTH HAVEN',102,25,102,0x36514c,25);
  }
  private makeSafeMarker(): THREE.Group {
    const group=new THREE.Group(),x=92,z=-61,y=sampleBed(this.sim.world,x,z)*RELIEF;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(9,.27,6,60),this.material(0xf0dd9c));ring.rotation.x=Math.PI/2;ring.position.set(x,y+.65,z);group.add(ring);
    this.box(group,8,.5,8,x,y+.25,z,0xdfdabe);
    this.box(group,.45,10,.45,x,y+5,z,0x516e64);
    this.box(group,4,2.5,.15,x+2,y+9,z,0xeab56e);
    this.scene.add(group);
    this.label(`HIGH GROUND  ·  ${Math.round(y/RELIEF)} m`,x,y/RELIEF+12,z,0x244c43,28);
    return group;
  }
  private label(text: string,x: number,y: number,z: number,color: number,width: number): void {
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=112;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='rgba(248,248,230,.94)';ctx.beginPath();ctx.roundRect(2,2,764,108,25);ctx.fill();
    ctx.fillStyle=`#${color.toString(16).padStart(6,'0')}`;ctx.font='600 32px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,58);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.position.set(x,y*RELIEF,z);sprite.scale.set(width,width*112/768,1);sprite.renderOrder=5;this.scene.add(sprite);this.labels.push(sprite);
  }
  private makeCar(color: number): THREE.Group {
    const car=new THREE.Group();
    this.box(car,2,0.7,4.1,0,.78,0,color);
    this.box(car,1.72,.75,2.05,0,1.45,-.1,color);
    this.box(car,1.5,.56,.07,0,1.5,.96,0x355653,false);
    this.box(car,1.5,.56,.07,0,1.5,-1.16,0x355653,false);
    for(const x of [-.88,.88]) this.box(car,.03,.5,1.75,x,1.5,-.1,0x355653,false);
    for(const x of [-1,1]) for(const z of [-1.25,1.25]) {
      const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.27,10),this.material(0x33413d));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.43,z);wheel.castShadow=true;car.add(wheel);
    }
    for(const x of [-.65,.65]) {this.box(car,.4,.18,.06,x,.9,2.08,0xffe6a0,false);this.box(car,.4,.18,.06,x,.9,-2.08,0xbb614c,false);}
    this.mergeMeshes(car);
    return car;
  }
  /** Batch static geometry by material, without altering independently moving cars. */
  private mergeMeshes(root: THREE.Object3D): void {
    const batches=new Map<string,THREE.Mesh[]>();
    root.updateMatrixWorld(true);
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||Array.isArray(object.material)||object.material===this.terrainMaterial)return;
      const key=object.material.uuid+'/'+object.castShadow;
      if(!batches.has(key))batches.set(key,[]);
      batches.get(key)!.push(object);
    });
    for(const meshes of batches.values()){
      if(meshes.length<2)continue;
      const geometries=meshes.map(mesh=>{
        const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
        geometry.deleteAttribute('uv');geometry.applyMatrix4(mesh.matrixWorld);return geometry;
      });
      const geometry=mergeGeometries(geometries,false);
      geometries.forEach(g=>g.dispose());
      if(!geometry)continue;
      const merged=new THREE.Mesh(geometry,meshes[0].material);merged.castShadow=meshes[0].castShadow;merged.receiveShadow=true;
      meshes.forEach(mesh=>{mesh.removeFromParent();mesh.geometry.dispose();});root.add(merged);
    }
  }
  private updateWater(): void {
    const {depth,world}=this.sim;
    let count=0,foamCount=0;
    const color=new THREE.Color();
    for(let j=0;j<NZ;j++) for(let i=0;i<NX;i++) {
      const k=j*NX+i;
      if(depth[k]<.028 || world.solid[k]) continue;
      const x=xAt(i),z=zAt(j),level=world.bed[k]+depth[k];
      const half=CELL/2;
      const corners=this.corners;
      for(let c=0;c<4;c++) {
        const di=CORNER_X[c],dj=CORNER_Z[c];
        let sum=level,n=1;
        for(let neighbor=0;neighbor<3;neighbor++) {
          const ii=neighbor===1?i:i+di,jj=neighbor===0?j:j+dj;
          if(ii<0||ii>=NX||jj<0||jj>=NZ) continue;
          const q=jj*NX+ii;
          if(depth[q]>.028 && !world.solid[q]) {sum+=world.bed[q]+depth[q];n++;}
        }
        corners[c*3]=x+di*half;corners[c*3+1]=(sum/n)*RELIEF+.065;corners[c*3+2]=z+dj*half;
      }
      const d=depth[k];
      color.set(world.land[k] ? (d<.7?0x6dbbb0:d<3?0x439f9d:d<8?0x257f8c:0x1e647e) : 0x368998);
      for(const c of TRIANGLE_CORNERS) {
        this.waterPositions[count*3]=corners[c*3];this.waterPositions[count*3+1]=corners[c*3+1];this.waterPositions[count*3+2]=corners[c*3+2];
        color.toArray(this.waterColors,count*3);count++;
      }
      if(foamCount<700 && world.land[k] && d>.04 && d<1.1 && Math.hypot(this.sim.flowX[k],this.sim.flowZ[k])>.25) {
        const t=this.sim.elapsed,drift=(Math.sin(k*31.1)*.5+.5);
        this.foamPositions[foamCount*3]=x+Math.sin(k)*.8+this.sim.flowX[k]*(t%1)*.08;this.foamPositions[foamCount*3+1]=level*RELIEF+.18;this.foamPositions[foamCount*3+2]=z+drift;foamCount++;
      }
    }
    this.waterGeometry.setDrawRange(0,count);this.waterGeometry.getAttribute('position').needsUpdate=true;this.waterGeometry.getAttribute('color').needsUpdate=true;
    this.foam.geometry.setDrawRange(0,foamCount);this.foam.geometry.getAttribute('position').needsUpdate=true;
  }
  render(time: number): void {
    if(this.disposed) return;
    this.controls.update();
    this.waterMaterial.uniforms.uTime.value=this.sim.phase==='running'?this.sim.elapsed:this.sim.phase==='ready'?time:this.sim.elapsed;
    // Buffer updates at most 15 Hz; the 3D camera and floating bodies render each frame.
    const tick=Math.floor(time*15);
    if(this.waterTick===-1 || (tick!==this.waterTick && this.waterStep!==this.sim.steps)) {this.updateWater();this.waterTick=tick;this.waterStep=this.sim.steps;}
    this.sim.vehicles.forEach((car,i)=>{
      const group=this.vehicles[i];group.position.set(car.x,car.y*RELIEF,car.z);group.rotation.set(0,car.yaw,car.roll);
    });
    this.renderer.render(this.scene,this.camera);
  }
  forceUpdate(): void {this.waterTick=-1;}
  private resize(): void {
    this.width=Math.max(1,this.host.clientWidth);this.height=Math.max(1,this.host.clientHeight);
    this.renderer.setSize(this.width,this.height);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();
  }
  dispose(): void {
    if(this.disposed)return;this.disposed=true;this.observer.disconnect();this.controls.dispose();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    this.scene.traverse(object=>{
      if(object instanceof THREE.DirectionalLight)object.dispose();
      if(object instanceof THREE.Mesh||object instanceof THREE.Points||object instanceof THREE.Sprite) {
        if(object.geometry)geometries.add(object.geometry);
        for(const mat of Array.isArray(object.material)?object.material:[object.material]) {
          materials.add(mat);
          for(const value of Object.values(mat))if(value instanceof THREE.Texture)textures.add(value);
        }
      }
    });
    geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());this.renderer.dispose();this.renderer.domElement.remove();
  }
}
