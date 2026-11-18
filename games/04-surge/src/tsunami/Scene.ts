import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CELL, COUNT, HALF, SIZE, center, elevationAt, indexAt, roadAt } from './terrain';
import type { FloodSimulation } from './simulation';
const WATER_CORNERS = [[0,0],[0,1],[1,0],[0,1],[1,1],[1,0]];
const WATER_COLORS = ['#83d4d7','#43b6c7','#218da8','#17627f'].map(v=>new THREE.Color(v));

export class FloodScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(43, 1, 1, 2200);
  readonly controls: OrbitControls;
  private readonly waterGeometry = new THREE.BufferGeometry();
  private readonly waterPositions = new Float32Array(COUNT*18);
  private readonly waterColors = new Float32Array(COUNT*18);
  private readonly heights = new Float32Array((SIZE+1)**2);
  private readonly waterMaterial = new THREE.MeshPhongMaterial({vertexColors:true,transparent:true,opacity:.78,shininess:95,specular:0x92dcf1,side:THREE.DoubleSide,depthWrite:false});
  private readonly terrainMaterial = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92});
  private readonly cars: THREE.Group[] = [];
  private readonly buildingMeshes: THREE.Mesh[] = [];
  private readonly foamPositions = new Float32Array(COUNT*3);
  private readonly foamGeometry = new THREE.BufferGeometry();
  private readonly textures: THREE.Texture[] = [];
  private readonly boxGeometry = new THREE.BoxGeometry(1,1,1);
  private readonly materials = new Map<string,THREE.MeshStandardMaterial>();
  private readonly batches = new Map<string,THREE.Matrix4[]>();
  private readonly object = new THREE.Object3D();
  private readonly terrainColors: Float32Array;
  private readonly terrainMesh: THREE.Mesh;
  private frame=0;
  private lastTime=-1;
  constructor(private readonly host:HTMLElement,private readonly sim:FloodSimulation) {
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.6));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.renderer.domElement.setAttribute('aria-label','Interactive 3D coastal flood simulation. Drag to orbit, scroll to zoom.');
    this.renderer.domElement.setAttribute('role','img');
    this.host.appendChild(this.renderer.domElement);
    this.scene.background=new THREE.Color('#b7cbd1');
    this.scene.fog=new THREE.Fog('#b7cbd1',900,1750);
    this.scene.add(new THREE.HemisphereLight('#e1f4ff','#4b6054',2.5));
    const sun=new THREE.DirectionalLight('#fff0d5',3.2);sun.position.set(-180,380,-170);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-280,right:280,top:280,bottom:-280,near:1,far:900});sun.shadow.bias=-.0005;sun.shadow.normalBias=.6;this.scene.add(sun);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.07;this.controls.maxPolarAngle=Math.PI*.46;this.controls.minDistance=120;this.controls.maxDistance=950;this.controls.maxTargetRadius=190;
    this.home();
    const terrainGeometry=new THREE.PlaneGeometry(SIZE*CELL,SIZE*CELL,SIZE,SIZE);terrainGeometry.rotateX(-Math.PI/2);
    const pos=terrainGeometry.getAttribute('position');this.terrainColors=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++)pos.setY(i,sim.terrain.vertices[i]);
    terrainGeometry.setAttribute('color',new THREE.BufferAttribute(this.terrainColors,3));terrainGeometry.computeVertexNormals();
    this.terrainMesh=new THREE.Mesh(terrainGeometry,this.terrainMaterial);this.terrainMesh.receiveShadow=true;this.scene.add(this.terrainMesh);this.setElevation(false);
    // The terrain edge exposes real relief, like a physical model on a table.
    const edges:number[]=[];
    for(let side=0;side<4;side++) for(let n=0;n<SIZE;n++){
      const a=-HALF+n*CELL,b=a+CELL;
      const [x1,z1,x2,z2]=side===0?[a,-HALF,b,-HALF]:side===1?[a,HALF,b,HALF]:side===2?[-HALF,a,-HALF,b]:[HALF,a,HALF,b];
      const y1=elevationAt(x1,z1),y2=elevationAt(x2,z2);
      edges.push(x1,-17,z1,x2,-17,z2,x2,y2,z2,x1,-17,z1,x2,y2,z2,x1,y1,z1);
    }
    const edgeGeom=new THREE.BufferGeometry();edgeGeom.setAttribute('position',new THREE.Float32BufferAttribute(edges,3));edgeGeom.computeVertexNormals();
    this.scene.add(new THREE.Mesh(edgeGeom,new THREE.MeshStandardMaterial({color:'#63705e',roughness:1,side:THREE.DoubleSide})));
    const base=new THREE.Mesh(new THREE.BoxGeometry(388,5,388),new THREE.MeshStandardMaterial({color:'#253e49',roughness:.8}));base.position.y=-19.5;base.receiveShadow=true;this.scene.add(base);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshStandardMaterial({color:'#b7cbd1',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-23;floor.receiveShadow=true;this.scene.add(floor);
    this.buildCity();
    this.waterGeometry.setAttribute('position',new THREE.BufferAttribute(this.waterPositions,3).setUsage(THREE.DynamicDrawUsage));
    this.waterGeometry.setAttribute('color',new THREE.BufferAttribute(this.waterColors,3).setUsage(THREE.DynamicDrawUsage));
    const water=new THREE.Mesh(this.waterGeometry,this.waterMaterial);water.frustumCulled=false;water.renderOrder=1;this.scene.add(water);
    this.foamGeometry.setAttribute('position',new THREE.BufferAttribute(this.foamPositions,3).setUsage(THREE.DynamicDrawUsage));
    const foam=new THREE.Points(this.foamGeometry,new THREE.PointsMaterial({color:'#d6faff',size:1.2,transparent:true,opacity:.82,depthWrite:false}));foam.frustumCulled=false;foam.renderOrder=2;this.scene.add(foam);
    this.label('NORTH RIDGE · 24 M',105,35,145,'#e1f6db');
    this.label('PORTSIDE',-80,26,17,'#fff5e6');
    this.label('OPEN OCEAN',-97,3,-152,'#d5f8ff');
    this.resize();this.update(0);
  }
  private material(color:string){let m=this.materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.78});this.materials.set(color,m);}return m;}
  private box(x:number,y:number,z:number,w:number,h:number,d:number,color:string,rotation=0){
    this.object.position.set(x,y,z);this.object.scale.set(w,h,d);this.object.rotation.set(0,rotation,0);this.object.updateMatrix();
    if(!this.batches.has(color))this.batches.set(color,[]);this.batches.get(color)!.push(this.object.matrix.clone());
  }
  private buildCity(){
    // Road ribbons use the same height function as the terrain, including incised channels.
    const positions:number[]=[], colors:number[]=[];
    const roadColor=new THREE.Color('#607077');
    for(let j=0;j<SIZE;j++)for(let i=0;i<SIZE;i++){
      const x=center(i),z=center(j);if(!roadAt(x,z))continue;
      for(const [di,dj] of WATER_CORNERS){
        const dx=di*CELL-CELL/2,dz=dj*CELL-CELL/2;
        positions.push(x+dx,this.sim.terrain.height(x+dx,z+dz)+.025,z+dz);colors.push(roadColor.r,roadColor.g,roadColor.b);
      }
      if((i+j)%3===0)this.box(x,this.sim.terrain.height(x,z)+.06,z,roadAt(x+4,z)?2.5:.25,.035,roadAt(x+4,z)?.25:2.5,'#d9dbbd');
    }
    const roads=new THREE.BufferGeometry();roads.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));roads.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));roads.computeVertexNormals();
    const roadMesh=new THREE.Mesh(roads,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));roadMesh.receiveShadow=true;this.scene.add(roadMesh);
    for(const b of this.sim.terrain.buildings){
      this.box(b.x,b.y-.4,b.z,b.w+1.3,1,b.d+1.3,'#8c9384');
      const mesh=new THREE.Mesh(this.boxGeometry,this.material(b.color));mesh.position.set(b.x,b.y+b.h/2,b.z);mesh.scale.set(b.w,b.h,b.d);mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);this.buildingMeshes.push(mesh);
      this.box(b.x,b.y+b.h+.35,b.z,b.w+1,.7,b.d+1,'#e9e4d6');
      this.box(b.x,b.y+b.h+.9,b.z,b.w*.74,.4,b.d*.7,'#85928e');
      this.box(b.x+2,b.y+b.h+1.6,b.z+2,3,1.2,3,'#c5c7be');
      for(let floor=2.8;floor<b.h-1;floor+=3.4)for(let wx=-b.w/2+2;wx<b.w/2-1;wx+=3.6){
        this.box(b.x+wx,b.y+floor,b.z-b.d/2-.06,1.55,1.5,.12,'#466372');
        this.box(b.x+wx,b.y+floor,b.z+b.d/2+.06,1.55,1.5,.12,'#466372');
      }
      for(let floor=2.8;floor<b.h-1;floor+=3.4)for(let wz=-b.d/2+2;wz<b.d/2-1;wz+=3.6)this.box(b.x-b.w/2-.06,b.y+floor,b.z+wz,.12,1.5,1.55,'#466372');
    }
    const leafGeometry=new THREE.IcosahedronGeometry(1,1),trunkGeometry=new THREE.CylinderGeometry(.4,.65,4,5);
    const leafMaterial=this.material('#577e5b'),trunkMaterial=this.material('#746654');
    for(let i=0;i<110;i++){
      const x=Math.sin(i*37.15)*177,z=-40+(Math.sin(i*19.78)*.5+.5)*218;
      if(roadAt(x,z)||this.sim.terrain.collision(x,z,7)||elevationAt(x,z)<.5)continue;
      const y=elevationAt(x,z);
      const trunk=new THREE.Mesh(trunkGeometry,trunkMaterial);trunk.position.set(x,y+2,z);trunk.castShadow=true;this.scene.add(trunk);
      const leaf=new THREE.Mesh(leafGeometry,leafMaterial);leaf.position.set(x,y+6,z);leaf.scale.set(3.4,4.8,3.4);leaf.castShadow=true;this.scene.add(leaf);
    }
    // Refuge pad, flag and access path on the actual elevated ridge.
    const sy=elevationAt(104,151);this.box(104,sy+.2,151,23,.6,18,'#d1d9bf');
    this.box(104,sy+.56,151,12,.07,3,'#719b72');this.box(104,sy+.57,151,3,.07,12,'#719b72');
    this.box(113,sy+6,157,.4,12,.4,'#f2ebd6');this.box(116,sy+10,157,6,3,.15,'#8bcbaa');
    for(const [color,matrices] of this.batches){const mesh=new THREE.InstancedMesh(this.boxGeometry,this.material(color),matrices.length);matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);}
    this.batches.clear();
    for(const car of this.sim.vehicles){
      const group=new THREE.Group();
      const part=(w:number,h:number,d:number,y:number,color:string,z=0)=>{const mesh=new THREE.Mesh(this.boxGeometry,this.material(color));mesh.scale.set(w,h,d);mesh.position.set(0,y,z);mesh.castShadow=true;group.add(mesh);return mesh;};
      part(2.5,.9,5,.75,car.color);part(2.25,.8,2.5,1.5,'#2d4855',-.3);part(2.2,.16,2.4,1.94,car.color,-.3);
      for(const x of [-1.27,1.27])for(const z of [-1.55,1.55]){const wheel=part(.3,.8,.8,.5,'#26333c',z);wheel.position.x=x;}
      part(2.1,.24,.12,.85,'#fff3cf',2.51);part(2.1,.22,.12,.85,'#c34e42',-2.51);
      this.scene.add(group);this.cars.push(group);
    }
  }
  private label(text:string,x:number,y:number,z:number,color:string){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#203640df';ctx.beginPath();ctx.roundRect(6,12,500,70,12);ctx.fill();ctx.font='500 26px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,256,47);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.textures.push(texture);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true,transparent:true}));sprite.position.set(x,y,z);sprite.scale.set(62,11.6,1);this.scene.add(sprite);
  }
  setElevation(enabled:boolean){
    const pos=this.terrainMesh.geometry.getAttribute('position');const c=new THREE.Color();
    for(let i=0;i<pos.count;i++){
      const h=pos.getY(i);
      if(enabled)c.set(h<0?'#7baeb8':h<2?'#c7dab7':h<5?'#a5c796':h<10?'#72a475':h<18?'#658d68':'#e2dba9');
      else c.set(h<0?'#a4bdb2':h<1.1?'#d7cba7':h<3?'#b2c39a':h<9?'#8faf83':h<17?'#789b73':'#d0d0ab');
      const shade=1+Math.sin(pos.getX(i)*.15)*Math.cos(pos.getZ(i)*.21)*.025;c.multiplyScalar(shade);
      this.terrainColors.set([c.r,c.g,c.b],i*3);
    }
    this.terrainMesh.geometry.getAttribute('color').needsUpdate=true;
  }
  home(){this.camera.position.set(-340,325,-405);this.controls.target.set(0,-12,0);this.controls.update();}
  coast(){this.camera.position.set(-230,115,-235);this.controls.target.set(0,5,-4);this.controls.update();}
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.zoom=Math.min(1,this.camera.aspect/1.3);this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);}
  update(time:number){
    if(time!==this.lastTime){this.lastTime=time;this.updateWater(time);}
    this.controls.update();this.renderer.render(this.scene,this.camera);
  }
  private updateWater(time:number){
    const {depth,terrain}=this.sim;const bed=terrain.elevation;
    for(let j=0;j<=SIZE;j++)for(let i=0;i<=SIZE;i++){
      let level=0,n=0;
      for(let dj=-1;dj<=0;dj++)for(let di=-1;di<=0;di++){
        const x=i+di,z=j+dj;if(x<0||z<0||x>=SIZE||z>=SIZE)continue;
        const k=z*SIZE+x;if(depth[k]>.025){level+=bed[k]+depth[k];n++;}
      }
      this.heights[j*(SIZE+1)+i]=n?level/n+.07+Math.sin(i*.8+j*.6-time*1.5)*.055:-12;
    }
    let count=0,foam=0;
    for(let j=0;j<SIZE;j++)for(let i=0;i<SIZE;i++){
      const k=j*SIZE+i;if(depth[k]<.04||terrain.blocked[k])continue;
      const x=-HALF+i*CELL,z=-HALF+j*CELL;
      const color=WATER_COLORS[depth[k]<.6?0:depth[k]<2?1:depth[k]<5?2:3];
      for(const [di,dj] of WATER_CORNERS){
        const corner=(j+dj)*(SIZE+1)+i+di;
        this.waterPositions[count*3]=x+di*CELL;this.waterPositions[count*3+1]=Math.max(terrain.vertices[corner]+.035,this.heights[corner]);this.waterPositions[count*3+2]=z+dj*CELL;
        this.waterColors[count*3]=color.r;this.waterColors[count*3+1]=color.g;this.waterColors[count*3+2]=color.b;count++;
      }
      const speed=Math.hypot(this.sim.velocityX[k],this.sim.velocityZ[k]);
      if((depth[k]<1.1&&terrain.land[k]||speed>1.8)&&(k*73856093%11)<2){
        const phase=(time*.45+k*.17)%1;this.foamPositions[foam*3]=x+2+this.sim.velocityX[k]*phase*.22;this.foamPositions[foam*3+1]=bed[k]+depth[k]+.23;this.foamPositions[foam*3+2]=z+2+this.sim.velocityZ[k]*phase*.22;foam++;
      }
    }
    this.waterGeometry.setDrawRange(0,count);this.waterGeometry.getAttribute('position').needsUpdate=true;this.waterGeometry.getAttribute('color').needsUpdate=true;
    if(this.frame++%3===0)this.waterGeometry.computeVertexNormals();
    this.foamGeometry.setDrawRange(0,foam);this.foamGeometry.getAttribute('position').needsUpdate=true;
    this.sim.vehicles.forEach((v,i)=>{const k=indexAt(v.x,v.z),d=depth[k],node=this.cars[i];node.position.set(v.x,Math.max(terrain.height(v.x,v.z),bed[k]+d-.65),v.z);node.rotation.set(d>.5?Math.sin(time*2+i)*.05:0,v.angle,d>.5?Math.sin(time*1.4+i)*.07:0);});
  }
  dispose(){
    this.controls.dispose();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Points||object instanceof THREE.Sprite){if('geometry' in object)geometries.add(object.geometry);const m=object.material;(Array.isArray(m)?m:[m]).forEach(v=>materials.add(v));}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.renderer.dispose();this.renderer.domElement.remove();
  }
}
