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
// - Flocking repulsion, comfort, and vision attraction
// - Formation movement and stuck detection for shepherds

import { GAME_CONFIG } from './config';
import { Direction4, Direction8, SheepEntity, ShepherdEntity, Vector2 } from './types';

// Convert (dx, dy) angle to 8-way direction for shepherds (45 degree sectors)
export function getShepherdDirection8(dx: number, dy: number): Direction8 {
  const angle = Math.atan2(dy, dx); // radians from -PI to PI
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

// Clamps an entity's coordinates within the walkable map bounds
export function clampToMap(x: number, y: number, radius: number): Vector2 {
  const margin = radius + 10;
  return {
    x: Math.max(margin, Math.min(GAME_CONFIG.world.width - margin, x)),
    y: Math.max(margin, Math.min(GAME_CONFIG.world.height - margin, y)),
  };
}

// ============================================================================
// SHEEP STEERING LOGIC
// ============================================================================
export function calculateSheepSteering(
  sheep: SheepEntity,
  allSheep: SheepEntity[],
  shepherds: ShepherdEntity[]
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

    // Check if probe falls outside walkable area [margin, worldW - margin], [margin, worldH - margin]
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
      // Push in opposite direction of the probe
      steerX -= dirX * pushStrength;
      steerY -= dirY * pushStrength;
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
      // Repulse away from other sheep
      const awayX = -dx / d;
      const awayY = -dy / d;
      const weight = 1 - d / cfg.flockRepulseDistance;
      steerX += awayX * weight;
      steerY += awayY * weight;
    } else if (d >= cfg.flockComfortDistance && d < cfg.flockVisionDistance) {
      // Vision: attract toward other sheep
      const towardX = dx / d;
      const towardY = dy / d;
      const weight = (d - cfg.flockComfortDistance) / (cfg.flockVisionDistance - cfg.flockComfortDistance);
      steerX += towardX * weight;
      steerY += towardY * weight;
    }
  }

  return { x: steerX, y: steerY };
}

// Update one fixed physics tick for shepherds
export function updateShepherds(
  shepherds: ShepherdEntity[],
  dt: number
) {
  const cfg = GAME_CONFIG.shepherd;

  for (const sh of shepherds) {
    if (sh.target) {
      const dx = sh.target.x - sh.x;
      const dy = sh.target.y - sh.y;
      const dist = Math.hypot(dx, dy);

      const step = cfg.speed * dt;

      if (dist <= step) {
        // Arrived at target
        sh.x = sh.target.x;
        sh.y = sh.target.y;
        sh.target = null;
        sh.isMoving = false;
        sh.stuckFrameCount = 0;
      } else {
        // Walk toward target
        sh.direction = getShepherdDirection8(dx, dy);
        sh.x += (dx / dist) * step;
        sh.y += (dy / dist) * step;
        sh.isMoving = true;

        // Stuck detection: < 1px progress for 90 frames
        const distMoved = Math.hypot(sh.x - sh.lastStuckCheckX, sh.y - sh.lastStuckCheckY);
        if (distMoved < cfg.stuckDistanceEpsilon * dt * 60) {
          sh.stuckFrameCount++;
          if (sh.stuckFrameCount >= cfg.stuckFramesThreshold) {
            // Cancel target
            sh.target = null;
            sh.isMoving = false;
            sh.stuckFrameCount = 0;
          }
        } else {
          sh.stuckFrameCount = 0;
        }

        sh.lastStuckCheckX = sh.x;
        sh.lastStuckCheckY = sh.y;
      }

      // Clamp to map
      const clamped = clampToMap(sh.x, sh.y, sh.radius);
      sh.x = clamped.x;
      sh.y = clamped.y;
    } else {
      sh.isMoving = false;
      sh.stuckFrameCount = 0;
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
  dt: number
) {
  const cfg = GAME_CONFIG.sheep;
  const penCfg = GAME_CONFIG.pen;

  for (const shp of sheepList) {
    const steer = calculateSheepSteering(shp, sheepList, shepherds);
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

      // Clamp inside map
      const clamped = clampToMap(shp.x, shp.y, shp.radius);
      shp.x = clamped.x;
      shp.y = clamped.y;
    } else {
      shp.isMoving = false;
    }

    // Check if inside pen
    const distToPenCenter = Math.hypot(shp.x - penCfg.centerX, shp.y - penCfg.centerY);
    shp.isInPen = distToPenCenter <= penCfg.radius;

    // Animation timer update
    const animFps = shp.isMoving ? cfg.walkFps : cfg.eatFps;
    shp.animTimer += dt;
    if (shp.animTimer >= 1 / animFps) {
      shp.animTimer -= 1 / animFps;
      shp.animFrame = (shp.animFrame + 1) % 4;
    }
  }

  // Simple circle separation between sheep and sheep, and between sheep and shepherds
  resolveCollisions(sheepList, shepherds);
}

// Simple circular separation resolution
function resolveCollisions(sheepList: SheepEntity[], shepherds: ShepherdEntity[]) {
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

        const ca = clampToMap(a.x, a.y, a.radius);
        a.x = ca.x;
        a.y = ca.y;

        const cb = clampToMap(b.x, b.y, b.radius);
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

        const clamped = clampToMap(shp.x, shp.y, shp.radius);
        shp.x = clamped.x;
        shp.y = clamped.y;
      }
    }
  }
}
