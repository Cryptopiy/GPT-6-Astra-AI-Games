import { FrictionEquation, GSSolver, type World } from 'cannon-es';

/** cannon-es 0.20 builds friction bounds in newtons (μ m g), while GSSolver
 * clamps its accumulated lambda in impulse units (N·s). Convert tangential
 * bounds to impulses at the solver boundary. Otherwise floor friction is
 * effectively multiplied by 1/dt and a sliding car can stop in one step.
 * Contact normals remain untouched. Friction reduction uses one pair of
 * tangent equations per manifold, so the support load is not counted 4 times.
 */
export class ImpulseSolver extends GSSolver {
  override solve(dt: number, world: World) {
    const bounds = this.equations.filter((eq): eq is FrictionEquation => eq instanceof FrictionEquation).map(eq => ({ eq, min: eq.minForce, max: eq.maxForce }));
    for (const { eq, min, max } of bounds) { eq.minForce = min * dt; eq.maxForce = max * dt; }
    try { return super.solve(dt, world); }
    finally { for (const { eq, min, max } of bounds) { eq.minForce = min; eq.maxForce = max; } }
  }
}
