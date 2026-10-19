/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// AI SYSTEM (Sheep Flocking & Shepherd Movement)
// ============================================================================
// Faithful implementation of the original Godot game's steering behaviors:
// - Flee from shepherds within fear_radius (200px)
// - Boundary probe repulsion
// - River & Bridge obstacle avoidance (Stage 2)
// - Flocking repulsion, comfort, and vision attraction
// - Formation movement, bridge waypoint traversal, and stuck detection

import { GAME_CONFIG } from './config';
import { Direction4, Direction8, SheepEntity, ShepherdEntity, StageId, Vector2 } from './types';

// Convert (dx, dy) angle to 8-way direction for shepherds (45 degree sectors)
export function getShepherdDirection8(dx: number, dy: number): Direction8 {
  const angle = Math.atan2(dy, dx);
  const deg = (angle * 180) / Math.PI;

  if (deg >= -22.5 && deg < 22.5) return 'e';
  if (deg >= 22.5 && deg < 67.5) return 'se';
  if (deg >= 67.5 && deg < 112.5) return 's';
  if (deg >= 112.5 && deg < 157.5) return 'sw';
  if (deg >= 157.5 || deg < -157.5) return 'w';
  if (deg >= -157.5 && deg < -112.5) return 'nw';
  if (deg >= -112.5 && deg < -67.5) return 'n';
  return 'ne';
}

// Convert (dx, dy) angle to 4-way direction for sheep (90 degree sectors offset by 45 deg)
export function getSheepDirection4(dx: number, dy: number): Direction4 {
  const angle = Math.atan2(dy, dx);
  const deg = (angle * 180) / Math.PI;

  if (deg >= -45 && deg < 45) return 'e';
  if (deg >= 45 && deg < 135) return 's';
  if (deg >= 135 || deg < -135) return 'w';
  return 'n';
}

// Helper: Vector length and normalization
export function vecLength(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function normalizeVec(x: number, y: number): Vector2 {
  const len = Math.hypot(x, y);
  if (len < 0.0001) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

// Check if a point is in the impassable river water (Stage 2)
export function isPointInRiverWater(x: number, y: number, radius: number = 0, stage: StageId = 1): boolean {
  if (stage !== 2) return false;
  const river = GAME_CONFIG.stage2.river;

  const inRiverX = x + radius > river.xMin && x - radius < river.xMax;
  if (!inRiverX) return false;

  // On the bridge opening corridor
  const onBridgeY = y >= river.bridgeYMin && y <= river.bridgeYMax;
  return !onBridgeY;
}

// Clamps an entity's coordinates within the walkable map bounds and river obstacles
export function clampEntityPosition(x: number, y: number, radius: number, stage: StageId = 1): Vector2 {
  const margin = radius + 10;
  const worldW = GAME_CONFIG.world.width;
  const worldH = GAME_CONFIG.world.height;

  let cx = Math.max(margin, Math.min(worldW - margin, x));
  let cy = Math.max(margin, Math.min(worldH - margin, y));

  if (stage === 2) {
    const river = GAME_CONFIG.stage2.river;
    const isHorizontallyInRiver = cx + radius > river.xMin && cx - radius < river.xMax;

    if (isHorizontallyInRiver) {
      const bridgeDeckMinY = river.bridgeYMin + radius + 2;
      const bridgeDeckMaxY = river.bridgeYMax - radius - 2;

      // Generous bridge vertical corridor with tolerance for entry and exit
      if (cy >= river.bridgeYMin - 6 && cy <= river.bridgeYMax + 6) {
        // Safe on the wooden bridge deck - keep within bridge railings
        cy = Math.max(bridgeDeckMinY, Math.min(bridgeDeckMaxY, cy));
      } else {
        // In the impassable river water! Push back to nearest bank
        const midRiverX = (river.xMin + river.xMax) / 2;
        if (cx <= midRiverX) {
          cx = river.xMin - radius - 1;
        } else {
          cx = river.xMax + radius + 1;
        }
      }
    }
  }

  return { x: cx, y: cy };
}

// Legacy clamp compatibility
export function clampToMap(x: number, y: number, radius: number, stage: StageId = 1): Vector2 {
  return clampEntityPosition(x, y, radius, stage);
}

// ============================================================================
// SHEEP STEERING LOGIC
// ============================================================================
export function calculateSheepSteering(
  sheep: SheepEntity,
  allSheep: SheepEntity[],
  shepherds: ShepherdEntity[],
  stage: StageId = 1
): Vector2 {
  const cfg = GAME_CONFIG.sheep;
  const worldW = GAME_CONFIG.world.width;
  const worldH = GAME_CONFIG.world.height;
  const margin = sheep.radius + 8;

  let steerX = 0;
  let steerY = 0;

  // 1. FLEE: for every shepherd within fear_radius (200px)
  // add (sheep - shepherd).normalized() * (1 - d / 200)
  for (const sh of shepherds) {
    const dx = sheep.x - sh.x;
    const dy = sheep.y - sh.y;
    const d = Math.hypot(dx, dy);

    if (d < cfg.fleeFearRadius && d > 0.0001) {
      const normX = dx / d;
      const normY = dy / d;
      const weight = 1 - d / cfg.fleeFearRadius;
      steerX += normX * weight;
      steerY += normY * weight;
    }
  }

  // Map-border bias: probe 8 directions at 40px; for each that falls outside the walkable area, push away by (1 - dist/40)
  const probeDist = cfg.borderProbeDistance;
  const probeAngles = [
    0,
    Math.PI / 4,
    Math.PI / 2,
    (3 * Math.PI) / 4,
    Math.PI,
    (-3 * Math.PI) / 4,
    -Math.PI / 2,
    -Math.PI / 4,
  ];

  for (const angle of probeAngles) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const probeX = sheep.x + dirX * probeDist;
    const probeY = sheep.y + dirY * probeDist;

    // Check if probe falls outside outer walkable area
    let distToEdge: number = probeDist;
    let outside = false;

    if (probeX < margin) {
      outside = true;
      distToEdge = Math.min(distToEdge, Math.max(0, sheep.x - margin));
    } else if (probeX > worldW - margin) {
      outside = true;
      distToEdge = Math.min(distToEdge, Math.max(0, worldW - margin - sheep.x));
    }

    if (probeY < margin) {
      outside = true;
      distToEdge = Math.min(distToEdge, Math.max(0, sheep.y - margin));
    } else if (probeY > worldH - margin) {
      outside = true;
      distToEdge = Math.min(distToEdge, Math.max(0, worldH - margin - sheep.y));
    }

    if (outside) {
      const pushStrength = Math.max(0, 1 - distToEdge / probeDist);
      steerX -= dirX * pushStrength;
      steerY -= dirY * pushStrength;
    }

    // Stage 2: Probe river water collision
    if (stage === 2) {
      const river = GAME_CONFIG.stage2.river;
      const isProbeInRiverX = probeX > river.xMin && probeX < river.xMax;
      const isProbeOnBridgeY = probeY >= river.bridgeYMin && probeY <= river.bridgeYMax;

      if (isProbeInRiverX && !isProbeOnBridgeY) {
        // Probe points into impassable water
        if (sheep.x >= river.xMin && sheep.x <= river.xMax) {
          // On the bridge deck: deflect away from north/south bridge railings
          if (probeY < river.bridgeYMin) {
            steerY += 1.4; // Push south into bridge
          } else {
            steerY -= 1.4; // Push north into bridge
          }
        } else {
          // On riverbank: repel away from water
          const awayFromRiverX = sheep.x < (river.xMin + river.xMax) / 2 ? -1.3 : 1.3;
          steerX += awayFromRiverX;

          // If near bridge latitude, guide vertical direction toward bridge center
          const bridgeCenterY = (river.bridgeYMin + river.bridgeYMax) / 2;
          const bridgeDiffY = bridgeCenterY - sheep.y;
          if (Math.abs(bridgeDiffY) < 220) {
            steerY += (bridgeDiffY / 220) * 0.55;
          }
        }
      }
    }
  }

  // 2. HERD (flocking) vs every other sheep at distance d:
  // - d < 50 (repulse): add (away direction) * (1 - d/50)
  // - 50 <= d < 100 (comfort): no force
  // - 100 <= d < 200 (vision): add (toward direction) * ((d - 100) / 100)
  // - d >= 200: ignore
  for (const other of allSheep) {
    if (other.id === sheep.id) continue;
    const dx = other.x - sheep.x;
    const dy = other.y - sheep.y;
    const d = Math.hypot(dx, dy);

    if (d < cfg.flockRepulseDistance && d > 0.0001) {
      const awayX = -dx / d;
      const awayY = -dy / d;
      const weight = 1 - d / cfg.flockRepulseDistance;
      steerX += awayX * weight;
      steerY += awayY * weight;
    } else if (d >= cfg.flockComfortDistance && d < cfg.flockVisionDistance) {
      const towardX = dx / d;
      const towardY = dy / d;
      const weight = (d - cfg.flockComfortDistance) / (cfg.flockVisionDistance - cfg.flockComfortDistance);
      steerX += towardX * weight;
      steerY += towardY * weight;
    }
  }

  return { x: steerX, y: steerY };
}

// Plan complete waypoint path for a shepherd (handles Stage 2 bridge crossings seamlessly)
export function planShepherdPath(
  startX: number,
  startY: number,
  destX: number,
  destY: number,
  stage: StageId = 1,
  shepherdId: number = 0
): Vector2[] {
  if (stage !== 2) {
    return [{ x: destX, y: destY }];
  }

  const river = GAME_CONFIG.stage2.river;
  const bridgeCenterY = (river.bridgeYMin + river.bridgeYMax) / 2;
  // Offset Y by shepherd ID so 3 shepherds can cross in parallel lanes without blocking
  const laneOffsetY = (shepherdId - 1) * 22;
  const bridgeY = bridgeCenterY + laneOffsetY;

  const westGateX = river.xMin - 40; // ~1000
  const eastGateX = river.xMax + 40; // ~1230

  const isStartWest = startX < river.xMin;
  const isStartEast = startX > river.xMax;
  const isStartBridge = !isStartWest && !isStartEast;

  const isDestWest = destX < river.xMin;
  const isDestEast = destX > river.xMax;
  const isDestBridge = !isDestWest && !isDestEast;

  const waypoints: Vector2[] = [];

  if (isStartWest) {
    if (isDestEast) {
      // Cross entire bridge from West to East
      waypoints.push({ x: westGateX, y: bridgeY });
      waypoints.push({ x: eastGateX, y: bridgeY });
      waypoints.push({ x: destX, y: destY });
    } else if (isDestBridge) {
      // Walk onto bridge from West
      waypoints.push({ x: westGateX, y: bridgeY });
      waypoints.push({ x: destX, y: bridgeY });
    } else {
      // West to West direct path
      waypoints.push({ x: destX, y: destY });
    }
  } else if (isStartEast) {
    if (isDestWest) {
      // Cross entire bridge from East to West
      waypoints.push({ x: eastGateX, y: bridgeY });
      waypoints.push({ x: westGateX, y: bridgeY });
      waypoints.push({ x: destX, y: destY });
    } else if (isDestBridge) {
      // Walk onto bridge from East
      waypoints.push({ x: eastGateX, y: bridgeY });
      waypoints.push({ x: destX, y: bridgeY });
    } else {
      // East to East direct path
      waypoints.push({ x: destX, y: destY });
    }
  } else {
    // Already on bridge deck
    if (isDestWest) {
      waypoints.push({ x: westGateX, y: bridgeY });
      waypoints.push({ x: destX, y: destY });
    } else if (isDestEast) {
      waypoints.push({ x: eastGateX, y: bridgeY });
      waypoints.push({ x: destX, y: destY });
    } else {
      // Moving to another spot on bridge
      waypoints.push({ x: destX, y: bridgeY });
    }
  }

  return waypoints;
}

// Legacy helper for compatibility
export function getShepherdMoveStep(
  sh: ShepherdEntity,
  stage: StageId = 1
): { targetX: number; targetY: number; isCrossRiver: boolean } | null {
  if (!sh.target) return null;
  if (!sh.waypoints || sh.waypoints.length === 0) {
    sh.waypoints = planShepherdPath(sh.x, sh.y, sh.target.x, sh.target.y, stage, sh.id);
  }
  const nextWp = sh.waypoints[0] || sh.target;
  return { targetX: nextWp.x, targetY: nextWp.y, isCrossRiver: stage === 2 };
}

// Update one fixed physics tick for shepherds
export function updateShepherds(
  shepherds: ShepherdEntity[],
  dt: number,
  stage: StageId = 1
) {
  const cfg = GAME_CONFIG.shepherd;

  for (const sh of shepherds) {
    // If shepherd has a target but waypoints queue is empty/missing, plan path
    if (sh.target && (!sh.waypoints || sh.waypoints.length === 0)) {
      sh.waypoints = planShepherdPath(sh.x, sh.y, sh.target.x, sh.target.y, stage, sh.id);
    }

    if (sh.waypoints && sh.waypoints.length > 0) {
      const currentWp = sh.waypoints[0];
      const dx = currentWp.x - sh.x;
      const dy = currentWp.y - sh.y;
      const dist = Math.hypot(dx, dy);

      const step = cfg.speed * dt;
      const isFinal = sh.waypoints.length === 1;
      // Waypoint arrival radius: smooth transition past gates
      const arrivalRadius = isFinal ? Math.max(step, 6) : Math.max(step * 1.5, 16);

      if (dist <= arrivalRadius) {
        // Reached this waypoint, pop it
        sh.waypoints.shift();

        if (sh.waypoints.length === 0) {
          // Arrived at final destination!
          sh.x = currentWp.x;
          sh.y = currentWp.y;
          sh.target = null;
          sh.waypoint = null;
          sh.isMoving = false;
          sh.stuckFrameCount = 0;
        } else {
          // Advance immediately to next waypoint
          sh.waypoint = sh.waypoints[0];
          sh.isMoving = true;
        }
      } else {
        // Walk directly towards current waypoint
        sh.direction = getShepherdDirection8(dx, dy);
        sh.x += (dx / dist) * step;
        sh.y += (dy / dist) * step;
        sh.isMoving = true;
        sh.waypoint = currentWp;

        // Stuck detection (only triggers if stuck for 90 consecutive frames)
        const distMoved = Math.hypot(sh.x - sh.lastStuckCheckX, sh.y - sh.lastStuckCheckY);
        if (distMoved < cfg.stuckDistanceEpsilon * dt * 60) {
          sh.stuckFrameCount++;
          if (sh.stuckFrameCount >= cfg.stuckFramesThreshold) {
            sh.target = null;
            sh.waypoints = [];
            sh.waypoint = null;
            sh.isMoving = false;
            sh.stuckFrameCount = 0;
          }
        } else {
          sh.stuckFrameCount = 0;
        }

        sh.lastStuckCheckX = sh.x;
        sh.lastStuckCheckY = sh.y;
      }

      // Clamp to map bounds and bridge/river boundaries
      const clamped = clampEntityPosition(sh.x, sh.y, sh.radius, stage);
      sh.x = clamped.x;
      sh.y = clamped.y;
    } else {
      sh.isMoving = false;
      sh.stuckFrameCount = 0;
      sh.waypoint = null;
    }

    // Animation timer update
    const animFps = sh.isMoving ? cfg.walkFps : cfg.idleFps;
    sh.animTimer += dt;
    if (sh.animTimer >= 1 / animFps) {
      sh.animTimer -= 1 / animFps;
      sh.animFrame = (sh.animFrame + 1) % 8;
    }
  }
}

// Update one fixed physics tick for sheep
export function updateSheep(
  sheepList: SheepEntity[],
  shepherds: ShepherdEntity[],
  dt: number,
  stage: StageId = 1,
  activePenIndex: number = 0
) {
  const cfg = GAME_CONFIG.sheep;
  const pens = stage === 1 ? GAME_CONFIG.stage1.pens : GAME_CONFIG.stage2.pens;
  const activePen = pens[activePenIndex] || pens[0];

  for (const shp of sheepList) {
    const steer = calculateSheepSteering(shp, sheepList, shepherds, stage);
    const mag = vecLength(steer.x, steer.y);

    if (mag >= cfg.minSteerMagnitude) {
      const dirX = steer.x / mag;
      const dirY = steer.y / mag;

      shp.direction = getSheepDirection4(dirX, dirY);
      shp.isMoving = true;

      // Move at 70 px/s in resulting direction
      const step = cfg.speed * dt;
      shp.x += dirX * step;
      shp.y += dirY * step;

      // Clamp inside map & river
      const clamped = clampEntityPosition(shp.x, shp.y, shp.radius, stage);
      shp.x = clamped.x;
      shp.y = clamped.y;
    } else {
      shp.isMoving = false;
    }

    // Check if inside currently active pen
    if (activePen) {
      const distToPenCenter = Math.hypot(shp.x - activePen.centerX, shp.y - activePen.centerY);
      shp.isInPen = distToPenCenter <= activePen.radius;
    } else {
      shp.isInPen = false;
    }

    // Animation timer update
    const animFps = shp.isMoving ? cfg.walkFps : cfg.eatFps;
    shp.animTimer += dt;
    if (shp.animTimer >= 1 / animFps) {
      shp.animTimer -= 1 / animFps;
      shp.animFrame = (shp.animFrame + 1) % 4;
    }
  }

  // Circular separation between sheep and sheep, and between sheep and shepherds
  resolveCollisions(sheepList, shepherds, stage);
}

// Simple circular separation resolution
function resolveCollisions(sheepList: SheepEntity[], shepherds: ShepherdEntity[], stage: StageId = 1) {
  // Sheep vs Sheep separation
  for (let i = 0; i < sheepList.length; i++) {
    for (let j = i + 1; j < sheepList.length; j++) {
      const a = sheepList[i];
      const b = sheepList[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;

      if (dist < minDist && dist > 0.0001) {
        const overlap = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const ca = clampEntityPosition(a.x, a.y, a.radius, stage);
        a.x = ca.x;
        a.y = ca.y;

        const cb = clampEntityPosition(b.x, b.y, b.radius, stage);
        b.x = cb.x;
        b.y = cb.y;
      }
    }
  }

  // Sheep vs Shepherd separation
  for (const shp of sheepList) {
    for (const sh of shepherds) {
      const dx = shp.x - sh.x;
      const dy = shp.y - sh.y;
      const dist = Math.hypot(dx, dy);
      const minDist = shp.radius + sh.radius;

      if (dist < minDist && dist > 0.0001) {
        const push = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        shp.x += nx * push;
        shp.y += ny * push;

        const clamped = clampEntityPosition(shp.x, shp.y, shp.radius, stage);
        shp.x = clamped.x;
        shp.y = clamped.y;
      }
    }
  }
}
