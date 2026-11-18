import type { Configuration, ObstacleType } from './types';
export const DEFAULT_CONFIG: Configuration = { speed: 80, mass: 1500, angle: 0, obstacle: 'concrete' };
export const OBSTACLES: Record<ObstacleType, { name: string; short: string; mass: number; restitution: number; rigidity: number; color: number; description: string }> = {
  concrete: { name: 'Concrete wall', short: 'CONCRETE', mass: 0, restitution: 0.12, rigidity: 1, color: 0xb9bdb7, description: 'Fixed · high rigidity' },
  steel: { name: 'Heavy steel barrier', short: 'STEEL', mass: 6000, restitution: 0.18, rigidity: 0.8, color: 0x718787, description: '6,000 kg · movable' },
  light: { name: 'Lightweight barrier', short: 'LIGHTWEIGHT', mass: 250, restitution: 0.25, rigidity: 0.45, color: 0xe79451, description: '250 kg · easily displaced' },
};
export const IMPACT_DURATION = 0.12;
export const FIXED_DT = 1 / 240;
export function severity(damage: number) { return damage < 20 ? 'Minor' : damage < 50 ? 'Moderate' : damage < 80 ? 'Severe' : 'Catastrophic'; }
export function validateConfig(config: Configuration): Configuration {
  if (!Number.isFinite(config.speed) || config.speed < 10 || config.speed > 200 || !Number.isFinite(config.mass) || config.mass < 700 || config.mass > 3000 || !Number.isFinite(config.angle) || config.angle < -60 || config.angle > 60 || !Object.hasOwn(OBSTACLES, config.obstacle)) throw new Error('Configuration is outside the supported test range.');
  return { ...config };
}
