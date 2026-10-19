/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// CONFIGURATION & TUNING VALUES
// ============================================================================
// All core gameplay parameters, speeds, radii, dimensions, and animation rates
// are kept in this single configuration object for easy tweaking and balancing.
export const GAME_CONFIG = {
  // World dimensions (exact size of the original dummy_map.png)
  world: {
    width: 2212,
    height: 931,
  },

  // Pen settings (circular pen for default / single pen)
  pen: {
    radius: 110,
    centerX: 1480,
    centerY: 465.5,
    normalFill: 'rgba(56, 161, 105, 0.28)',
    normalStroke: 'rgba(72, 187, 120, 0.85)',
    normalLineWidth: 4,
    winFill: 'rgba(72, 199, 116, 0.45)',
    winStroke: 'rgba(104, 235, 148, 1)',
    winLineWidth: 8,
  },

  // Stage 1 configuration (Classic single pen)
  stage1: {
    name: 'Stage 1: Pastoral Meadow',
    description: 'Gather all 4 sheep into the circular pasture pen.',
    shepherdsStart: {
      x: 756,
      ys: [315.5, 465.5, 615.5],
    },
    sheepPositions: [
      { x: 1360, y: 240 },
      { x: 1720, y: 220 },
      { x: 1390, y: 710 },
      { x: 1780, y: 680 },
    ],
    pens: [
      {
        id: 1,
        centerX: 1480,
        centerY: 465.5,
        radius: 110,
        label: 'PEN 1',
      },
    ],
    hasRiver: false,
  },

  // Stage 2 configuration (River, bridge crossing, and 3 sequential pens)
  stage2: {
    name: 'Stage 2: River Crossing & 3 Pens',
    description: 'Herd sheep sequentially with 2 shepherds: Pen 1 ➔ Cross Bridge to Pen 2 ➔ Final Pen 3.',
    river: {
      xMin: 1040,
      xMax: 1190,
      bridgeYMin: 395,
      bridgeYMax: 535,
      bridgeXMin: 1020,
      bridgeXMax: 1210,
    },
    shepherdsStart: {
      x: 350,
      ys: [390, 540], // 2 Shepherds for Stage 2
    },
    sheepPositions: [
      { x: 620, y: 410 },
      { x: 690, y: 560 },
      { x: 740, y: 320 },
      { x: 790, y: 610 },
    ],
    pens: [
      {
        id: 1,
        centerX: 550,
        centerY: 240,
        radius: 105,
        label: 'PEN 1',
      },
      {
        id: 2,
        centerX: 1560,
        centerY: 280,
        radius: 105,
        label: 'PEN 2',
      },
      {
        id: 3,
        centerX: 1760,
        centerY: 720,
        radius: 105,
        label: 'PEN 3',
      },
    ],
    hasRiver: true,
  },

  // Shepherd parameters
  shepherd: {
    count: 3,
    speed: 70, // pixels per second
    collisionRadius: 26,
    clickRadius: 32, // click within 32px selects shepherd
    stuckFramesThreshold: 90, // < 1px progress for 90 frames cancels target
    stuckDistanceEpsilon: 1.0,
    // Relative start offset: x ~ -350 from map center, spaced vertically 150px apart
    startOffsetX: -350,
    verticalSpacing: 150,
    selectionRingColor: 'rgba(74, 222, 128, 0.95)',
    selectionRingWidth: 3,
    idleFps: 6,
    walkFps: 8,
  },

  // Sheep & Ram parameters
  sheep: {
    count: 4,
    speed: 70, // pixels per second
    collisionRadius: 24,
    fleeFearRadius: 200, // shepherds within 200px trigger flee
    borderProbeDistance: 40, // probes 8 directions at 40px
    flockRepulseDistance: 50, // d < 50 repulse
    flockComfortDistance: 100, // 50 <= d < 100 no force
    flockVisionDistance: 200, // 100 <= d < 200 attract toward
    minSteerMagnitude: 0.1, // if combined vector length < 0.1, stand still and graze
    steerTargetLookahead: 200, // moves toward position + dir * 200
    walkFps: 6,
    eatFps: 3,
    initialXMin: 1250,
    initialXMax: 1850,
    initialYMin: 180,
    initialYMax: 760,
  },

  // Controls & Camera
  camera: {
    minZoom: 0.35,
    maxZoom: 2.2,
    defaultZoom: 1.0,
    zoomStep: 0.15,
  },
  input: {
    dragThreshold: 5, // >5px movement = drag/pan, otherwise click/tap
    rippleStartRadius: 8,
    rippleEndRadius: 42,
    rippleDuration: 0.45, // seconds
    rippleLineWidth: 3,
    rippleColor: 'rgba(255, 217, 64, 0.9)',
  },

  // Physics & Simulation
  physics: {
    fixedDeltaTime: 1 / 60, // 60 Hz physics tick
    maxSubSteps: 5,
  },

  // Asset defaults (fallback and GitHub raw repo support)
  assets: {
    // Default GitHub repo raw URL if none specified
    defaultRepoUrl: '',
    relativeBase: '/resources',
  },
} as const;

export type GameConfig = typeof GAME_CONFIG;
