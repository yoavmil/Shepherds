/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Vector2 {
  x: number;
  y: number;
}

export type Direction8 = 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'n' | 'ne';
export type Direction4 = 'e' | 's' | 'w' | 'n';

export type StageId = 1 | 2;

export interface PenDefinition {
  id: number;
  centerX: number;
  centerY: number;
  radius: number;
  label: string;
}

export interface RiverObstacle {
  xMin: number;
  xMax: number;
  bridgeYMin: number;
  bridgeYMax: number;
  bridgeXMin: number;
  bridgeXMax: number;
}

export interface ShepherdEntity {
  id: number; // 0, 1, 2 (corresponds to C1, C2, C3)
  x: number;
  y: number;
  radius: number;
  target: Vector2 | null;
  waypoint: Vector2 | null; // For routing across bridge
  waypoints?: Vector2[]; // Complete waypoint path
  direction: Direction8;
  isMoving: boolean;
  selected: boolean;
  // Stuck detection counters
  lastStuckCheckX: number;
  lastStuckCheckY: number;
  stuckFrameCount: number;
  // Animation state
  animTimer: number;
  animFrame: number;
}

export type SheepKind = 'sheep' | 'ram';

export interface SheepEntity {
  id: number;
  x: number;
  y: number;
  radius: number;
  kind: SheepKind;
  direction: Direction4;
  isMoving: boolean;
  // Steering velocity vector
  velocity: Vector2;
  // State: whether inside active pen
  isInPen: boolean;
  // Animation state
  animTimer: number;
  animFrame: number;
}

export interface RippleEffect {
  id: number;
  x: number;
  y: number;
  age: number; // 0 to rippleDuration
  duration: number;
}

export interface Camera {
  x: number; // top-left world x
  y: number; // top-left world y
  viewportWidth: number;
  viewportHeight: number;
  zoom: number;
}

export interface GameState {
  stage: StageId;
  activePenIndex: number;
  completedPens: boolean[];
  shepherds: ShepherdEntity[];
  sheep: SheepEntity[];
  ripples: RippleEffect[];
  isWon: boolean;
  winTime: number | null;
  stageStartTime: number | null;
  timerStarted: boolean;
  completionTimeSeconds: number | null;
  commandCount: number;
  stageNotification: {
    message: string;
    submessage?: string;
    timestamp: number;
  } | null;
}
