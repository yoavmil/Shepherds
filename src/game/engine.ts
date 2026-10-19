/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// GAME ENGINE & CONTROLLER
// ============================================================================
// Orchestrates the 60Hz fixed-timestep physics update, requestAnimationFrame loop,
// camera viewport clamping, touch & mouse input handling, formation target dispatch,
// stage selection (Stage 1 & Stage 2 River Crossing with 3 Pens), and win checks.

import { clampEntityPosition, isPointInRiverWater, planShepherdPath, updateSheep, updateShepherds } from './ai';
import { assetManager } from './assets';
import { sounds } from './audio';
import { GAME_CONFIG } from './config';
import { gameRenderer } from './renderer';
import { Camera, Direction4, GameState, SheepEntity, ShepherdEntity, StageId, Vector2 } from './types';

export class GameEngine {
  public canvas: HTMLCanvasElement | null = null;
  public ctx: CanvasRenderingContext2D | null = null;

  public state: GameState = {
    stage: 1,
    activePenIndex: 0,
    completedPens: [false],
    shepherds: [],
    sheep: [],
    ripples: [],
    isWon: false,
    winTime: null,
    stageStartTime: null,
    timerStarted: false,
    completionTimeSeconds: null,
    commandCount: 0,
    stageNotification: null,
  };

  public camera: Camera = {
    x: 0,
    y: 0,
    viewportWidth: 800,
    viewportHeight: 600,
    zoom: GAME_CONFIG.camera.defaultZoom,
  };

  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastTime: number = 0;
  private accumulator: number = 0;
  private rippleIdCounter: number = 0;

  // Input drag / pan tracking
  private isPointerDown: boolean = false;
  private pointerStartX: number = 0;
  private pointerStartY: number = 0;
  private pointerCurrentX: number = 0;
  private pointerCurrentY: number = 0;
  private cameraStartX: number = 0;
  private cameraStartY: number = 0;
  private hasDragged: boolean = false;

  // Multi-touch pinch-to-zoom tracking
  private activePointers = new Map<number, { x: number; y: number }>();
  private pinchInitialDistance: number = 0;
  private pinchInitialZoom: number = 1.0;

  // Callbacks to sync React UI
  public onStateChange?: (shepherds: ShepherdEntity[], isWon: boolean, state: GameState) => void;
  public onZoomChange?: (zoom: number) => void;

  constructor() {
    this.reset(1);
  }

  // Switch stage
  public setStage(stageId: StageId) {
    this.reset(stageId);
  }

  // Initialize or restart all entities to their starting positions
  public reset(stageId: StageId = this.state.stage || 1) {
    const stageCfg = stageId === 1 ? GAME_CONFIG.stage1 : GAME_CONFIG.stage2;

    // Shepherds setup - Stage 1 has 3 shepherds, Stage 2 has 2 shepherds
    const shepherds: ShepherdEntity[] = [];
    const shStartX = stageCfg.shepherdsStart.x;
    const startYs = stageCfg.shepherdsStart.ys;

    for (let i = 0; i < startYs.length; i++) {
      shepherds.push({
        id: i,
        x: shStartX,
        y: startYs[i],
        radius: GAME_CONFIG.shepherd.collisionRadius,
        target: null,
        waypoint: null,
        waypoints: [],
        direction: 'e',
        isMoving: false,
        selected: false,
        lastStuckCheckX: shStartX,
        lastStuckCheckY: startYs[i],
        stuckFrameCount: 0,
        animTimer: 0,
        animFrame: 0,
      });
    }

    // Sheep setup
    const directions4: Direction4[] = ['e', 's', 'w', 'n'];
    const sheep: SheepEntity[] = [];
    const presetPositions = stageCfg.sheepPositions;

    for (let i = 0; i < GAME_CONFIG.sheep.count; i++) {
      const pos = presetPositions[i] || {
        x: 600 + Math.random() * 200,
        y: 300 + Math.random() * 300,
      };
      sheep.push({
        id: i,
        x: pos.x,
        y: pos.y,
        radius: GAME_CONFIG.sheep.collisionRadius,
        kind: Math.random() < 0.5 ? 'sheep' : 'ram',
        direction: directions4[Math.floor(Math.random() * directions4.length)],
        isMoving: false,
        velocity: { x: 0, y: 0 },
        isInPen: false,
        animTimer: Math.random() * 0.5,
        animFrame: Math.floor(Math.random() * 4),
      });
    }

    const penCount = stageCfg.pens.length;
    const completedPens = new Array(penCount).fill(false);

    this.state = {
      stage: stageId,
      activePenIndex: 0,
      completedPens,
      shepherds,
      sheep,
      ripples: [],
      isWon: false,
      winTime: null,
      stageStartTime: null,
      timerStarted: false,
      completionTimeSeconds: null,
      commandCount: 0,
      stageNotification:
        stageId === 2
          ? {
              message: 'Stage 2: River Crossing (2 Shepherds)',
              submessage: 'Herd the sheep into Pen 1 first!',
              timestamp: Date.now(),
            }
          : null,
    };

    // Center camera on the starting action
    this.centerCameraInitial();
    this.notifyState();
  }

  // Mount canvas and register listeners
  public attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.handleResize();

    // Load assets
    assetManager.loadAll();

    // Event listeners
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleOrientationChange);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });

    this.start();
  }

  // Unmount canvas
  public detach() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleOrientationChange);
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
      this.canvas.removeEventListener('wheel', this.handleWheel);
    }
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas = null;
    this.ctx = null;
  }

  // Handle window resize and re-clamp camera
  public handleResize = () => {
    if (!this.canvas) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = width;
    this.canvas.height = height;

    this.camera.viewportWidth = width;
    this.camera.viewportHeight = height;

    this.clampCamera();
  };

  private handleOrientationChange = () => {
    setTimeout(() => {
      this.handleResize();
    }, 200);
  };

  // Set zoom level and clamp camera
  public setZoom(newZoom: number) {
    const minZ = GAME_CONFIG.camera.minZoom;
    const maxZ = GAME_CONFIG.camera.maxZoom;
    const clampedZoom = Math.max(minZ, Math.min(maxZ, newZoom));

    if (Math.abs(clampedZoom - this.camera.zoom) < 0.001) return;

    // Zoom centered on the viewport middle
    const screenCenterX = this.camera.viewportWidth / 2;
    const screenCenterY = this.camera.viewportHeight / 2;
    const worldCenterBefore = this.screenToWorld(screenCenterX, screenCenterY);

    this.camera.zoom = clampedZoom;

    // Adjust camera x/y so world center remains under the screen center
    this.camera.x = worldCenterBefore.x - screenCenterX / this.camera.zoom;
    this.camera.y = worldCenterBefore.y - screenCenterY / this.camera.zoom;

    this.clampCamera();
    this.onZoomChange?.(this.camera.zoom);
  }

  public zoomIn() {
    this.setZoom(this.camera.zoom + GAME_CONFIG.camera.zoomStep);
  }

  public zoomOut() {
    this.setZoom(this.camera.zoom - GAME_CONFIG.camera.zoomStep);
  }

  // Mouse wheel zoom
  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    this.setZoom(this.camera.zoom * zoomFactor);
  };

  // Center camera initially
  private centerCameraInitial() {
    const defaultZoom = GAME_CONFIG.camera.defaultZoom;
    this.camera.zoom = defaultZoom;

    if (this.state.stage === 2) {
      // Focus on the shepherds and Pen 1 area (West bank)
      const targetCenterX = 650;
      const targetCenterY = 465.5;
      this.camera.x = targetCenterX - this.camera.viewportWidth / (2 * defaultZoom);
      this.camera.y = targetCenterY - this.camera.viewportHeight / (2 * defaultZoom);
    } else {
      // Center of world
      const mapCenterX = GAME_CONFIG.world.width / 2;
      const mapCenterY = GAME_CONFIG.world.height / 2;
      this.camera.x = mapCenterX - this.camera.viewportWidth / (2 * defaultZoom);
      this.camera.y = mapCenterY - this.camera.viewportHeight / (2 * defaultZoom);
    }

    this.clampCamera();
  }

  // Clamps camera so it NEVER shows outside the map
  private clampCamera() {
    const worldW = GAME_CONFIG.world.width;
    const worldH = GAME_CONFIG.world.height;
    const viewW = this.camera.viewportWidth / this.camera.zoom;
    const viewH = this.camera.viewportHeight / this.camera.zoom;

    // Clamp X
    if (viewW >= worldW) {
      this.camera.x = (worldW - viewW) / 2;
    } else {
      this.camera.x = Math.max(0, Math.min(worldW - viewW, this.camera.x));
    }

    // Clamp Y
    if (viewH >= worldH) {
      this.camera.y = (worldH - viewH) / 2;
    } else {
      this.camera.y = Math.max(0, Math.min(worldH - viewH, this.camera.y));
    }
  }

  // Convert Screen Coordinates (pixels) to World Coordinates
  public screenToWorld(screenX: number, screenY: number): Vector2 {
    return {
      x: this.camera.x + screenX / this.camera.zoom,
      y: this.camera.y + screenY / this.camera.zoom,
    };
  }

  // Convert World Coordinates to Screen Coordinates
  public worldToScreen(worldX: number, worldY: number): Vector2 {
    return {
      x: (worldX - this.camera.x) * this.camera.zoom,
      y: (worldY - this.camera.y) * this.camera.zoom,
    };
  }

  // ============================================================================
  // INPUT HANDLING (Mouse & Mobile Touch)
  // ============================================================================
  private handlePointerDown = (e: PointerEvent) => {
    // Only handle primary clicks or multi-touch
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Multi-touch pinch detection
    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      this.pinchInitialDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.pinchInitialZoom = this.camera.zoom;
      return;
    }

    if (this.activePointers.size > 2) return;

    this.isPointerDown = true;
    this.hasDragged = false;
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.pointerCurrentX = e.clientX;
    this.pointerCurrentY = e.clientY;
    this.cameraStartX = this.camera.x;
    this.cameraStartY = this.camera.y;
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch-to-zoom update
    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.pinchInitialDistance > 5) {
        const ratio = currentDist / this.pinchInitialDistance;
        this.setZoom(this.pinchInitialZoom * ratio);
      }
      return;
    }

    if (!this.isPointerDown) return;

    this.pointerCurrentX = e.clientX;
    this.pointerCurrentY = e.clientY;

    const dx = this.pointerCurrentX - this.pointerStartX;
    const dy = this.pointerCurrentY - this.pointerStartY;
    const dist = Math.hypot(dx, dy);

    // Threshold: >5px movement = drag/pan
    if (dist > GAME_CONFIG.input.dragThreshold) {
      this.hasDragged = true;
      this.camera.x = this.cameraStartX - dx / this.camera.zoom;
      this.camera.y = this.cameraStartY - dy / this.camera.zoom;
      this.clampCamera();
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size === 1) {
      // Transition from pinch back to pan
      const pt = Array.from(this.activePointers.values())[0];
      this.pointerStartX = pt.x;
      this.pointerStartY = pt.y;
      this.cameraStartX = this.camera.x;
      this.cameraStartY = this.camera.y;
      return;
    }

    if (!this.isPointerDown) return;
    this.isPointerDown = false;

    // If not dragged beyond 5px threshold, handle as a click/tap
    if (!this.hasDragged) {
      this.handleClickOrTap(this.pointerStartX, this.pointerStartY);
    }
  };

  // Process Click or Tap on canvas
  private handleClickOrTap(screenX: number, screenY: number) {
    this.startTimerIfNeeded();

    const worldPos = this.screenToWorld(screenX, screenY);

    // 1. Check if clicked a shepherd (within clickRadius 32px)
    let clickedShepherd: ShepherdEntity | null = null;
    for (const sh of this.state.shepherds) {
      const d = Math.hypot(sh.x - worldPos.x, sh.y - worldPos.y);
      if (d <= GAME_CONFIG.shepherd.clickRadius) {
        clickedShepherd = sh;
        break;
      }
    }

    if (clickedShepherd) {
      const onlyThisSelected =
        clickedShepherd.selected &&
        this.state.shepherds.filter((s) => s.selected).length === 1;

      if (onlyThisSelected) {
        // Deselect it
        clickedShepherd.selected = false;
      } else {
        // Select ONLY that shepherd
        for (const sh of this.state.shepherds) {
          sh.selected = sh.id === clickedShepherd.id;
        }
      }
      this.notifyState();
      return;
    }

    // 2. Click on ground:
    // All selected shepherds walk to that point, keeping relative formation
    const selected = this.state.shepherds.filter((s) => s.selected);
    if (selected.length === 0) {
      return;
    }

    // Centroid of selected shepherds
    let sumX = 0;
    let sumY = 0;
    for (const s of selected) {
      sumX += s.x;
      sumY += s.y;
    }
    const centroidX = sumX / selected.length;
    const centroidY = sumY / selected.length;

    // Whistle audio and increment command counter
    sounds.playCommandWhistle();
    this.state.commandCount++;

    // In Stage 2, if ground target clicked is in river water, snap target to nearest bank or bridge
    let targetGroundX = worldPos.x;
    let targetGroundY = worldPos.y;

    if (this.state.stage === 2 && isPointInRiverWater(targetGroundX, targetGroundY, 0, 2)) {
      const river = GAME_CONFIG.stage2.river;
      const bridgeCenterY = (river.bridgeYMin + river.bridgeYMax) / 2;
      const distToBridge = Math.abs(targetGroundY - bridgeCenterY);

      if (distToBridge < 120) {
        targetGroundY = bridgeCenterY;
      } else {
        // Snap to closest bank
        targetGroundX =
          Math.abs(targetGroundX - river.xMin) < Math.abs(targetGroundX - river.xMax)
            ? river.xMin - 35
            : river.xMax + 35;
      }
    }

    // Assign formation targets and spawn ripples
    for (const sh of selected) {
      const offsetX = sh.x - centroidX;
      const offsetY = sh.y - centroidY;
      const rawTargetX = targetGroundX + offsetX;
      const rawTargetY = targetGroundY + offsetY;

      // Clamp target to map and river
      const clamped = clampEntityPosition(rawTargetX, rawTargetY, sh.radius, this.state.stage);
      sh.target = clamped;
      sh.waypoints = planShepherdPath(sh.x, sh.y, clamped.x, clamped.y, this.state.stage, sh.id);
      sh.waypoint = sh.waypoints[0] || null;
      sh.isMoving = true;
      sh.stuckFrameCount = 0;
      sh.lastStuckCheckX = sh.x;
      sh.lastStuckCheckY = sh.y;

      // Spawn ripple effect at target: expanding, fading yellow ring (radius 8 -> 42 over 0.45s)
      this.spawnRipple(clamped.x, clamped.y);
    }

    this.notifyState();
  }

  // Spawn ripple effect
  private spawnRipple(x: number, y: number) {
    this.state.ripples.push({
      id: ++this.rippleIdCounter,
      x,
      y,
      age: 0,
      duration: GAME_CONFIG.input.rippleDuration,
    });
  }

  // ============================================================================
  // UI COMMANDS
  // ============================================================================
  // Starts stage timer on the very first player click/action
  public startTimerIfNeeded() {
    if (!this.state.timerStarted || this.state.stageStartTime === null) {
      this.state.timerStarted = true;
      this.state.stageStartTime = Date.now();
      this.notifyState();
    }
  }

  // Toggle selection for C1, C2, C3
  public toggleShepherdSelection(id: number) {
    this.startTimerIfNeeded();
    const sh = this.state.shepherds.find((s) => s.id === id);
    if (sh) {
      sh.selected = !sh.selected;
      this.notifyState();
    }
  }

  // Select all shepherds
  public selectAllShepherds() {
    this.startTimerIfNeeded();
    for (const sh of this.state.shepherds) {
      sh.selected = true;
    }
    this.notifyState();
  }

  // Stop All: cancels all shepherd movement
  public stopAll() {
    this.startTimerIfNeeded();
    for (const sh of this.state.shepherds) {
      sh.target = null;
      sh.waypoint = null;
      sh.waypoints = [];
      sh.isMoving = false;
      sh.stuckFrameCount = 0;
    }
    this.notifyState();
  }

  private notifyState() {
    if (this.onStateChange) {
      this.onStateChange([...this.state.shepherds], this.state.isWon, { ...this.state });
    }
  }

  // ============================================================================
  // MAIN GAME LOOP (Fixed Timestep Physics at 60 Hz + rAF)
  // ============================================================================
  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.loop(this.lastTime);
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private loop = (currentTime: number) => {
    if (!this.isRunning) return;

    const frameTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;
    this.accumulator += frameTime;

    const dt = GAME_CONFIG.physics.fixedDeltaTime;
    let subSteps = 0;

    // Fixed timestep update at 60 Hz
    while (this.accumulator >= dt && subSteps < GAME_CONFIG.physics.maxSubSteps) {
      this.fixedUpdate(dt);
      this.accumulator -= dt;
      subSteps++;
    }

    // Render frame
    if (this.ctx && this.canvas) {
      gameRenderer.render(
        this.ctx,
        this.state,
        this.camera,
        this.canvas.width,
        this.canvas.height
      );
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  // Fixed 60Hz physics, AI, and stage objective update
  private fixedUpdate(dt: number) {
    // 1. Update shepherds
    updateShepherds(this.state.shepherds, dt, this.state.stage);

    // 2. Update sheep flocking & flee AI
    updateSheep(
      this.state.sheep,
      this.state.shepherds,
      dt,
      this.state.stage,
      this.state.activePenIndex
    );

    // 3. Update ripples
    for (let i = this.state.ripples.length - 1; i >= 0; i--) {
      const rip = this.state.ripples[i];
      rip.age += dt;
      if (rip.age >= rip.duration) {
        this.state.ripples.splice(i, 1);
      }
    }

    // 4. Check stage objective & win conditions
    const allInPen = this.state.sheep.every((s) => s.isInPen);

    if (allInPen && !this.state.isWon) {
      if (this.state.stage === 1) {
        // Stage 1 Victory
        this.state.isWon = true;
        this.state.winTime = performance.now();
        this.state.completionTimeSeconds = this.state.stageStartTime
          ? Math.max(0.1, (Date.now() - this.state.stageStartTime) / 1000)
          : 0.1;
        sounds.playWinFanfare();
        this.notifyState();
      } else if (this.state.stage === 2) {
        // Stage 2 Sequential progression: Pen 1 -> Pen 2 -> Pen 3
        if (this.state.activePenIndex === 0) {
          // Pen 1 Complete! Move to Pen 2 (across the river!)
          this.state.completedPens[0] = true;
          this.state.activePenIndex = 1;
          this.state.stageNotification = {
            message: 'Pen 1 Cleared! (Step 1/3)',
            submessage: 'Now guide the sheep across the river bridge to Pen 2!',
            timestamp: Date.now(),
          };
          sounds.playCheckpointChime();
          this.notifyState();
        } else if (this.state.activePenIndex === 1) {
          // Pen 2 Complete! Move to Pen 3
          this.state.completedPens[1] = true;
          this.state.activePenIndex = 2;
          this.state.stageNotification = {
            message: 'Pen 2 Cleared! (Step 2/3)',
            submessage: 'Awesome river crossing! Final step: herd them to Pen 3!',
            timestamp: Date.now(),
          };
          sounds.playCheckpointChime();
          this.notifyState();
        } else if (this.state.activePenIndex === 2) {
          // Pen 3 Complete! Stage 2 Victory!
          this.state.completedPens[2] = true;
          this.state.isWon = true;
          this.state.winTime = performance.now();
          this.state.completionTimeSeconds = this.state.stageStartTime
            ? Math.max(0.1, (Date.now() - this.state.stageStartTime) / 1000)
            : 0.1;
          sounds.playWinFanfare();
          this.notifyState();
        }
      }
    }
  }
}

export const gameEngine = new GameEngine();
