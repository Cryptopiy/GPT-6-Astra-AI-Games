export const SIZE = 96;
export const CELL = 4;
export const HALF = SIZE * CELL / 2;
export const COUNT = SIZE * SIZE;
export const FIXED_DT = 1 / 30;
export interface Building { x: number; z: number; w: number; d: number; h: number; y: number; color: string }
export interface Vehicle { x: number; z: number; vx: number; vz: number; angle: number; spin: number; mass: number; originX: number; originZ: number; originAngle: number; color: string; displaced: boolean }
export const roadXs = [-104, -24, 64, 144];
export const roadZs = [-36, 36, 108];
export const indexAt = (x: number, z: number) => Math.max(0, Math.min(SIZE - 1, Math.floor((z + HALF) / CELL))) * SIZE + Math.max(0, Math.min(SIZE - 1, Math.floor((x + HALF) / CELL)));
export const center = (i: number) => -HALF + (i + .5) * CELL;
export const coastAt = (x: number) => -76 + 7 * Math.sin(x / 55) + 4 * Math.cos(x / 21);
export function roadAt(x: number, z: number) {
  return z > coastAt(x) + 8 && (roadXs.some(v => Math.abs(x - v) < 4) || roadZs.some(v => Math.abs(z - v) < 4));
}
export function elevationAt(x: number, z: number) {
  const inland = z - coastAt(x);
  if (inland < 0) return Math.max(-9, inland * .18);
  const hill = 19 * Math.exp(-((x - 95) ** 2 / 5300 + (z - 140) ** 2 / 3000));
  const basin = 2.3 * Math.exp(-((x + 77) ** 2 / 2800 + (z - 50) ** 2 / 1600));
  const rise = .45 + inland * .032 + hill - basin + .32 * Math.sin(x / 25) * Math.sin(z / 29);
  return Math.max(.18, rise - (roadAt(x, z) ? .45 : 0));
}
export class Terrain {
  readonly vertices = new Float64Array((SIZE + 1) ** 2);
  readonly elevation = new Float64Array(COUNT);
  readonly land = new Uint8Array(COUNT);
  readonly blocked = new Uint8Array(COUNT);
  readonly buildings: Building[] = [];
  readonly landCount: number;
  constructor() {
    for (let j=0;j<=SIZE;j++) for(let i=0;i<=SIZE;i++) this.vertices[j*(SIZE+1)+i]=elevationAt(-HALF+i*CELL,-HALF+j*CELL);
    let landCount = 0;
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
      const k = j * SIZE + i, x = center(i), z = center(j);
      // Exact height at the center of the renderer's BL--TR triangle diagonal.
      this.elevation[k] = this.height(x, z);
      this.land[k] = Number(z >= coastAt(x));
      landCount += this.land[k];
    }
    const colors = ['#dfded2', '#e9d8bc', '#b6c6ca', '#e4c5ab', '#d2d6c1'];
    for (const [row, z] of [-14, 62, 137].entries()) for (const [col, x] of [-151, -67, 20, 108].entries()) {
      for (let n = 0; n < 2; n++) {
        const bx = x + (n ? 15 : -9), bz = z + (col % 2 ? -7 : 5);
        if (row === 2 && col === 3) continue;
        const w = 12 + ((row + col + n) % 3) * 3, d = 15 + (col % 2) * 4;
        const y = Math.max(this.height(bx-w/2,bz-d/2),this.height(bx+w/2,bz+d/2),this.height(bx-w/2,bz+d/2),this.height(bx+w/2,bz-d/2));
        this.buildings.push({ x: bx, z: bz, w, d, h: 7 + ((col * 3 + row + n) % 5) * 3, y, color: colors[(row+col+n)%colors.length] });
      }
    }
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
      const x = center(i), z = center(j);
      this.blocked[j*SIZE+i] = Number(this.buildings.some(b => Math.abs(x-b.x)<b.w/2 && Math.abs(z-b.z)<b.d/2));
    }
    this.landCount = landCount;
  }
  height(x: number, z: number) {
    const gx=Math.max(0,Math.min(SIZE-1e-8,(x+HALF)/CELL)),gz=Math.max(0,Math.min(SIZE-1e-8,(z+HALF)/CELL));
    const i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j,k=j*(SIZE+1)+i;
    const tl=this.vertices[k],tr=this.vertices[k+1],bl=this.vertices[k+SIZE+1],br=this.vertices[k+SIZE+2];
    return u+v<=1?tl+(tr-tl)*u+(bl-tl)*v:br+(bl-br)*(1-u)+(tr-br)*(1-v);
  }
  collision(x: number, z: number, radius = 3) {
    return Math.abs(x) > HALF-radius || Math.abs(z) > HALF-radius || this.buildings.some(b => Math.abs(x-b.x)<b.w/2+radius && Math.abs(z-b.z)<b.d/2+radius);
  }
}
export function createVehicles(): Vehicle[] {
  const positions = [[-104,-57],[-104,-6],[-104,53],[-24,-43],[-24,14],[-24,88],[64,-50],[64,22],[64,80],[144,-33],[144,42],[-143,36],[-62,-36],[18,36],[107,108],[-66,108]];
  return positions.map(([x,z],i)=>({x,z,vx:0,vz:0,angle:i<11?0:Math.PI/2,spin:0,mass:950+(i%4)*200,originX:x,originZ:z,originAngle:i<11?0:Math.PI/2,color:['#f6b74d','#ee6b56','#dae8dc','#68a5b9'][i%4],displaced:false}));
}
