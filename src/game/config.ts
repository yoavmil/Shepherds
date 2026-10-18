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

  // Pen settings (circular pen located near the center-right of the map)
  pen: {
    radius: 110,
    // Map center is (1106, 465.5). Center-right is ~1500, 465.5
    centerX: 1480,
    centerY: 465.5,
    normalFill: 'rgba(56, 161, 105, 0.28)',
    normalStroke: 'rgba(72, 187, 120, 0.85)',
    normalLineWidth: 4,
    winFill: 'rgba(72, 199, 116, 0.45)',
    winStroke: 'rgba(104, 235, 148, 1)',
    winLineWidth: 8,
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
