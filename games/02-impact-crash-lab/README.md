# IMPACT — Car Crash Lab

> **Как запустить готовую сборку / How to run the ready-made build:** см. / see [HOW_TO_PLAY.md](../../HOW_TO_PLAY.md) в корне репозитория / in the repository root. Если ниже упоминаются другие файлы запуска — их в этом репозитории нет / if other launch files are mentioned below, they are not part of this repository.

A complete local 3D crash laboratory built with **TypeScript, React, Vite, Three.js, and cannon-es**. Geometry, materials, labels, and debris are generated in code. The browser makes no external asset or API requests. No backend, account, keys, or paid service is required.

This is a separate project inside `car-crash-lab`; the existing Portside application in the parent directory is preserved.

## Setup and run

Use Node.js 22.12+ (validated here on Node.js 24.14.0).

```powershell
cd <путь-к-папке-проекта>
npm install
npm run dev
```

Open the localhost URL Vite prints. On systems whose PowerShell execution policy blocks `npm.ps1`, use `npm.cmd` instead of `npm`.

```powershell
npm test
npm run build
npm run preview
```

The preview started during delivery uses `http://127.0.0.1:5186/`. A fresh normal `npm run dev` uses Vite's default available port. The app requires WebGL 2; hardware acceleration should be enabled.

## Controls

- Set **speed** from 10–200 km/h, **mass** from 700–3000 kg, and **angle** from −60° to +60°.
- Choose the fixed concrete wall, 6,000 kg steel barrier, or 250 kg lightweight barrier.
- **RUN CRASH** resets and launches an actual experiment. Inputs lock while a run is active.
- **RESET** aborts a running experiment, removes damage/debris, and restores the configured starting state. Completed history remains.
- Pause/resume and **0.25× slow motion** control playback without changing the fixed physical timestep.
- Drag the scene to orbit, scroll to zoom, or select **Overview** / **Vehicle**. The default camera follows the car after impact so long slides remain visible. Orbiting gives manual camera control.
- Hiding the browser tab pauses an active experiment; resume explicitly on return.
- **The model** describes the equations and assumptions in the app.

## Physics and assumptions

All physics uses metres, kilograms, and seconds. Input speed is converted with `v = km/h ÷ 3.6`.

The authoritative simulation uses a 4.3 × 1.24 × 1.88 m vehicle box, a 1.4 × 2.1 × 10 m obstacle box, an infinite floor, and actual small box colliders for debris. The car and movable barriers can translate and rotate in all three dimensions. Meshes are driven by the physics poses; no prerecorded animation or CSS motion controls the crash.

The launch rig maintains the selected horizontal speed on frictionless rollers. It releases the car at the first actual collision. Contact is found from 3D volumes; angle rotates both incoming trajectory and vehicle orientation. Gravity, restitution, normal impulses, angular inertia, and tangential friction determine subsequent motion. The floor coefficients after release are 0.55 for the car and 0.50 for barriers. Barrier-contact friction is 0.32.

The simulation advances at **240 Hz**, independently of rendering. At 200 km/h the car travels about 0.232 m per step, less than the collider thickness. A slow rendering frame slows wall-clock playback instead of skipping collision steps. Resets create a new physics world; debris ejection uses a fixed pattern.

`ImpulseSolver.ts` corrects the dimensional mismatch in cannon-es 0.20's friction bounds: the narrow phase supplies `μmg` in newtons, while the iterative solver clamps its accumulated impulse. The wrapper multiplies only tangential bounds by `dt` and restores them after solving. One pair of tangent equations per manifold avoids multiplying the support friction by its number of contact points. A direct regression verifies free sliding deceleration against `μg`. Normal collision forces remain solver-derived.

Primary implementation references: [cannon-es World](https://github.com/pmndrs/cannon-es/blob/v0.20.0/src/world/World.ts), [GSSolver](https://github.com/pmndrs/cannon-es/blob/v0.20.0/src/solver/GSSolver.ts), and [Narrowphase](https://github.com/pmndrs/cannon-es/blob/v0.20.0/src/world/Narrowphase.ts). The installed, pinned package source is authoritative for the wrapper.

### Force

The UI reports **estimated mean normal impact force**, not a measured peak:

```text
J = Σ normal contact multiplier × dt
Fmean = J / 0.120 s
```

The impulse is summed over all car–barrier manifold points during the first **120 ms** after first contact. Ground contacts are excluded. The averaging duration is an explicit assumption. Contact geometry and incoming speed are copied before the solver runs; multipliers are read after the solve. Force is reported in kN.

### Damage

```text
μ = 1 / (1/mcar + 1/mbarrier)   [μ = mcar for a static wall]
En = ½ μ (1 − e²) vn²
D = 100 × (1 − exp(−r En / 140,000 J))
```

`vn` is relative velocity at the contact along the collision normal. `En` is an estimate of lost **normal** kinetic energy using a central-collision approximation; it excludes tangential and rotational energy losses. The severity index uses a fixed 140 kJ reference rather than dividing by the car's initial energy, so mass and speed both affect damage.

| Obstacle | Mass | Restitution e | Rigidity r |
|---|---:|---:|---:|
| Concrete | Fixed | 0.12 | 1.00 |
| Heavy steel | 6,000 kg | 0.18 | 0.80 |
| Lightweight | 250 kg | 0.25 | 0.45 |

Severity is minor below 20%, moderate below 50%, severe below 80%, and catastrophic from 80%. The contact normal is transformed into vehicle coordinates to choose front, rear, left, or right. Predominantly vertical contacts use normalized local contact position to choose the nearest region, instead of classifying floating-point noise.

Damage deforms and darkens the correct mesh region. The rigid collider does not deform; this is not soft-body simulation. Debris has real floor collisions but is an illustrative effect excluded from primary energy accounting. Displayed vehicle kinetic energy is translational only. These values compare educational scenarios and do not predict injury, repair cost, or certified crashworthiness.

### Results and coordinates

X and Z are the ground-plane coordinates; Y is height. The result shows all three components, final yaw, and full X/Y/Z rotation in degrees. Inputs remain visible and are copied into the immutable history record, alongside force and damage. Current speed and actual pre-impact speed are shown separately.

A run finishes when the car and barrier remain below 0.15 m/s and 0.15 rad/s for 0.8 s, after at least 1.2 s of post-impact observation. An upper horizon ends observation **14 seconds after impact**. If bodies remain moving, the UI explicitly labels the sampled endpoint and final speed instead of calling it a resting position. At high speed, glancing impacts can slide around the end of the finite wall and travel hundreds of metres onto the open apron.

## File structure

```text
car-crash-lab/
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
├── README.md
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx
│   ├── physics/
│   │   ├── types.ts              # Configuration, poses, impact and result contracts
│   │   ├── obstacles.ts          # Material properties, ranges and severity
│   │   ├── ImpulseSolver.ts      # Unit-correct friction impulse bounds
│   │   └── CrashSimulation.ts    # Fixed-step 3D world, measurements and lifecycle
│   ├── render/
│   │   ├── Vehicle.ts            # Procedural sedan and local damage zones
│   │   └── LabRenderer.ts        # Perspective scene, lighting, camera and debris
│   └── ui/
│       ├── App.tsx               # Inputs, playback, live results and session history
│       ├── icons.tsx             # Local interface icons
│       ├── modelTools.ts         # Optional, feature-detected browser agent actions
│       └── styles.css            # Desktop, laptop and tablet layouts
└── tests/
    ├── simulation.test.ts        # 49 scenario, boundary and replay assertions
    ├── solver.test.ts            # Friction units, momentum and restitution
    └── vehicle.test.ts           # Exposed damage geometry and visual reset state
```

`dist/` is generated by the build and `node_modules/` by installation. They are not source files.

## Verification and acceptance

**53 automated tests pass.** Strict TypeScript compilation and the production Vite build pass without warnings. The local route responded with HTTP 200 and was handed to the Codex preview. Browser clicks, screenshots, and visual resize checks were not performed; responsive behavior and controls are implemented, with the interactive checklist below available for a manual pass. Optional WebMCP registration is feature-detected and was not validated in a supported browser context.

| Required feature | Implementation / evidence |
|---|---|
| Adjustable speed | Labeled 10–200 km/h input; high/low-speed regression |
| Adjustable mass | Labeled 700–3000 kg input; energy/impulse mass regression |
| Adjustable angle | Real trajectory and orientation changes; mirrored ±60° tests |
| Three obstacle types | Static concrete and dynamic 6,000/250 kg barriers |
| RUN CRASH starts physics | New world enters fixed-step approach and collision state |
| Contact at selected geometry | Boundary matrix reaches actual wall face without head-on tunneling |
| Visible post-impact reaction | Pose-driven rebound, slide, yaw/pitch/roll, and barrier displacement |
| Visible damage zone | Local contact classification and exposed shell deformation tests |
| Different obstacle outcomes | Regression compares force, damage and obstacle travel |
| Speed / force / damage / position | Live metrics plus full completed result and model assumptions |
| Speed changes force/damage | Doubling speed regression and measured sample below |
| Reset and repeat | Mid-crash reset removes all bodies/results/traces, then reruns |
| Last runs comparison | Most recent five completed immutable records, kept across resets |
| Repeated stability | Replay identity and 36 extreme speed/mass/angle/obstacle cases |

Additional checks cover incoming attitude and height, finite output, invalid inputs, 30/60/144 rendering-frame schedules, correct Coulomb-friction units, isolated momentum/restitution, vertical contact classification, and restoring undamaged meshes.

Measured examples from the implemented simulation, 1,500 kg:

| Speed | Angle | Obstacle | Mean force | Damage | Barrier travel |
|---:|---:|---|---:|---:|---:|
| 40 km/h | 0° | Concrete | 155.13 kN | 47.89% | 0.00 m |
| 80 km/h | 0° | Concrete | 315.53 kN | 92.63% | 0.00 m |
| 80 km/h | 0° | Steel | 259.02 kN | 80.57% | 2.89 m |
| 80 km/h | 0° | Lightweight | 49.85 kN | 14.74% | 50.18 m |
| 80 km/h | 60° | Concrete | 75.29 kN | 47.89% | 0.00 m |

For an interactive pass, run the default crash, reset mid-run, switch obstacle and angle, enable slow motion, pause/resume, complete six experiments to check the five-row history cap, and resize to laptop/tablet widths. At extreme settings, distinguish a settled result from the explicitly labeled 14-second observation endpoint.
