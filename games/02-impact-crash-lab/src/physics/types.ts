export type ObstacleType = 'concrete' | 'steel' | 'light';
export type DamageZone = 'front' | 'rear' | 'left' | 'right';
export type RunPhase = 'ready' | 'approach' | 'impact' | 'settling' | 'complete';
export interface Configuration { speed: number; mass: number; angle: number; obstacle: ObstacleType }
export interface XYZ { x: number; y: number; z: number }
export interface XYZW extends XYZ { w: number }
export interface Pose { position: XYZ; quaternion: XYZW }
export interface Impact { speed: number; normalSpeed: number; impulse: number; force: number; energy: number; damage: number; zone: DamageZone; point: XYZ; time: number }
export interface Telemetry { time: number; speed: number; force: number }
export interface RunResult { id: number; config: Configuration; impact: Impact; finalPosition: XYZ; rotation: XYZ; finalSpeed: number; obstacleDisplacement: number; elapsed: number; settled: boolean; kineticBefore: number; kineticAfter: number; trace: Telemetry[] }
export interface Snapshot { phase: RunPhase; config: Configuration; elapsed: number; speed: number; car: Pose; obstacle: Pose; debris: Pose[]; impact: Impact | null; trace: Telemetry[]; result: RunResult | null }
