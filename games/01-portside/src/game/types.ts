export interface Point { x: number; z: number }
export interface Solid extends Point {
  id: string; width: number; depth: number; height: number; yaw: number;
  kind: 'building' | 'tree' | 'barrier' | 'planter' | 'bench' | 'bin';
  color: string;
}
export interface Building extends Solid {
  kind: 'building'; style: number; label?: string;
}
export interface World {
  size: number; roads: number[]; roadWidth: number;
  buildings: Building[]; obstacles: Solid[];
  pickup: Point; destination: Point; restricted: Point & { radius: number };
}
export interface Vehicle extends Point {
  id: string; yaw: number; speed: number; steer: number;
  kind: 'parked' | 'traffic' | 'police' | 'mission';
  color: string; width: number; depth: number;
  route: Point[]; waypoint: number; blocked: number; active: boolean;
}
export interface Pedestrian extends Point {
  id: string; yaw: number; color: string; speed: number;
  route: Point[]; waypoint: number; phase: number;
  state: 'walking' | 'waiting' | 'fleeing'; timer: number;
}
export interface Player extends Point { yaw: number; vehicleId: string | null; moving: boolean }
export type MissionPhase = 'available' | 'collect' | 'deliver' | 'success' | 'failed';
export interface Mission { phase: MissionPhase; elapsed: number; best: number | null; deliveryHold: number }
export interface PoliceState { wanted: number; escape: number; caught: number; cooldown: number }
export interface GameState {
  time: number; player: Player; vehicles: Vehicle[]; pedestrians: Pedestrian[];
  mission: Mission; police: PoliceState;
  message: string; messageUntil: number; collisions: number;
}
export interface InputFrame {
  forward: number; turn: number; brake: boolean; sprint: boolean;
  interact: boolean; restart: boolean;
}
export const NO_INPUT: InputFrame = { forward: 0, turn: 0, brake: false, sprint: false, interact: false, restart: false };
export interface SimulationApi {
  world: World; state: GameState;
  step(dt: number, input: InputFrame): void;
  interact(): void;
  restartMission(): void;
  getControlled(): Point & { yaw: number };
  getHint(): string;
}
