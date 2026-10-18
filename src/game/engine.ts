/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// GAME ENGINE & CONTROLLER
// ============================================================================
// Orchestrates the 60Hz fixed-timestep physics update, requestAnimationFrame loop,
// camera viewport clamping, touch & mouse input handling, formation target dispatch,
// and win-condition checks.

import { calculateSheepSteering, clampToMap, updateSheep, updateShepherds } from './ai';
import { assetManager } from './assets';
import { sounds } from './audio';
import { GAME_CONFIG } from './config';
import { gameRenderer } from './renderer';
import { Camera, Direction4, Direction8, GameState, SheepEntity, ShepherdEntity, Vector2 } from './types';

export class GameEngine {
  public canvas: HTMLCanvasElement | null = null;
  public ctx: CanvasRenderingContext2D | null = null;

  public state: GameState = {
    shepherds: [],
    sheep: [],
    ripples: [],
    isWon: false,
    winTime: null,
  };

  public camera: Camera = {
    x: 0,
    y: 0,
    viewportWidth: 800,
    viewportHeight: 600,
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

  // Callback to sync React UI buttons
  public onStateChange?: (shepherds: ShepherdEntity[], isWon: boolean) => void;

  constructor() {
    this.reset();
  }

  // Initialize or restart all entities to their starting positions
  public reset() {
    const mapCenter = {
      x: GAME_CONFIG.world.width / 2,
      y: GAME_CONFIG.world.height / 2,
    };

    // 3 Shepherds: start on left side, x ~ -350 from map center, spaced vertically 150px apart
    const shepherds: ShepherdEntity[] = [];
    const shStartX = mapCenter.x + GAME_CONFIG.shepherd.startOffsetX; // ~756
    const startYs = [
      mapCenter.y - GAME_CONFIG.shepherd.verticalSpacing, // 315.5
      mapCenter.y,                                         // 465.5
      mapCenter.y + GAME_CONFIG.shepherd.verticalSpacing, // 615.5
    ];

    for (let i = 0; i < GAME_CONFIG.shepherd.count; i++) {
      shepherds.push({
        id: i,
        x: shStartX,
        y: startYs[i],
        radius: GAME_CONFIG.shepherd.collisionRadius,
        target: null,
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

    // 4 Sheep: scattered across the right-hand part of the map
    // Each sheep randomly gets sheep or ram sprites (50/50). Initial facing is random.
    const directions4: Direction4[] = ['e', 's', 'w', 'n'];
    const sheep: SheepEntity[] = [];
    const presetPositions = [
      { x: 1360, y: 240 },
      { x: 1720, y: 220 },
      { x: 1390, y: 710 },
      { x: 1780, y: 680 },
    ];

    for (let i = 0; i < GAME_CONFIG.sheep.count; i++) {
      const pos = presetPositions[i] || {
        x: 1350 + Math.random() * 450,
        y: 200 + Math.random() * 500,
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

    this.state = {
      shepherds,
      sheep,
      ripples: [],
      isWon: false,
      winTime: null,
    };

    // Center camera on the action
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
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);

    this.start();
  }

  public detach() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    }
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas = null;
    this.ctx = null;
  }

  // Handle window and viewport resizing
  public handleResize = () => {
    if (!this.canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.camera.viewportWidth = w;
    this.camera.viewportHeight = h;
    this.clampCamera();
  };

  private centerCameraInitial() {
    // Focus on the midpoint between shepherds and pen
    const targetCenterX = 1120;
    const targetCenterY = GAME_CONFIG.world.height / 2;
    this.camera.x = targetCenterX - this.camera.viewportWidth / 2;
    this.camera.y = targetCenterY - this.camera.viewportHeight / 2;
    this.clampCamera();
  }

  // Clamp camera so it never shows outside the 2212x931 map
  private clampCamera() {
    const mapW = GAME_CONFIG.world.width;
    const mapH = GAME_CONFIG.world.height;

    if (this.camera.viewportWidth >= mapW) {
      this.camera.x = (mapW - this.camera.viewportWidth) / 2;
    } else {
      this.camera.x = Math.max(0, Math.min(mapW - this.camera.viewportWidth, this.camera.x));
    }

    if (this.camera.viewportHeight >= mapH) {
      this.camera.y = (mapH - this.camera.viewportHeight) / 2;
    } else {
      this.camera.y = Math.max(0, Math.min(mapH - this.camera.viewportHeight, this.camera.y));
    }
  }

  // Convert screen coordinates to world coordinates
  public screenToWorld(sx: number, sy: number): Vector2 {
    return {
      x: sx + this.camera.x,
      y: sy + this.camera.y,
    };
  }

  // ============================================================================
  // INPUT HANDLING (Click vs Drag)
  // ============================================================================
  private handlePointerDown = (e: PointerEvent) => {
    // Left click or touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;

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
    if (!this.isPointerDown) return;

    this.pointerCurrentX = e.clientX;
    this.pointerCurrentY = e.clientY;

    const dx = this.pointerCurrentX - this.pointerStartX;
    const dy = this.pointerCurrentY - this.pointerStartY;
    const dist = Math.hypot(dx, dy);

    // Rule: >5px movement = drag, otherwise click/tap
    if (dist > GAME_CONFIG.input.dragThreshold) {
      this.hasDragged = true;
      // Pan camera inversely
      this.camera.x = this.cameraStartX - dx;
      this.camera.y = this.cameraStartY - dy;
      this.clampCamera();
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;

    // If it was not a drag (>5px), treat it as a click/tap
    if (!this.hasDragged) {
      this.handleClick(e.clientX, e.clientY);
    }
  };

  // Process Click or Tap
  private handleClick(screenX: number, screenY: number) {
    const worldPos = this.screenToWorld(screenX, screenY);

    // 1. Check if clicking on a shepherd (within 32px click radius)
    // Rule: Clicking a shepherd (within 32px) selects ONLY that shepherd and syncs the buttons.
    // Clicking the only-selected shepherd deselects it.
    let clickedShepherd: ShepherdEntity | null = null;
    let closestDist = Infinity;

    for (const sh of this.state.shepherds) {
      const d = Math.hypot(worldPos.x - sh.x, worldPos.y - sh.y);
      if (d <= GAME_CONFIG.shepherd.clickRadius && d < closestDist) {
        clickedShepherd = sh;
        closestDist = d;
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
    // Rule: all selected shepherds walk to that point, keeping their relative formation
    // (each target = click + (shepherd position - centroid of selected)), clamped to the map.
    const selected = this.state.shepherds.filter((s) => s.selected);
    if (selected.length === 0) {
      return; // No shepherds selected
    }

    // Calculate centroid of selected shepherds
    let sumX = 0;
    let sumY = 0;
    for (const s of selected) {
      sumX += s.x;
      sumY += s.y;
    }
    const centroidX = sumX / selected.length;
    const centroidY = sumY / selected.length;

    // Play whistle audio
    sounds.playCommandWhistle();

    // Assign formation targets and spawn ripples
    for (const sh of selected) {
      const offsetX = sh.x - centroidX;
      const offsetY = sh.y - centroidY;
      const rawTargetX = worldPos.x + offsetX;
      const rawTargetY = worldPos.y + offsetY;

      // Clamp target to map
      const clamped = clampToMap(rawTargetX, rawTargetY, sh.radius);
      sh.target = clamped;
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
  // Toggle selection for C1 (id=0), C2 (id=1), C3 (id=2)
  public toggleShepherdSelection(id: number) {
    const sh = this.state.shepherds.find((s) => s.id === id);
    if (sh) {
      sh.selected = !sh.selected;
      this.notifyState();
    }
  }

  // Select all shepherds
  public selectAllShepherds() {
    for (const sh of this.state.shepherds) {
      sh.selected = true;
    }
    this.notifyState();
  }

  // Stop All: cancels all shepherd movement
  public stopAll() {
    for (const sh of this.state.shepherds) {
      sh.target = null;
      sh.isMoving = false;
      sh.stuckFrameCount = 0;
    }
    this.notifyState();
  }

  private notifyState() {
    if (this.onStateChange) {
      this.onStateChange([...this.state.shepherds], this.state.isWon);
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

  // Fixed 60Hz physics and AI update
  private fixedUpdate(dt: number) {
    // 1. Update shepherds
    updateShepherds(this.state.shepherds, dt);

    // 2. Update sheep flocking & flee AI
    updateSheep(this.state.sheep, this.state.shepherds, dt);

    // 3. Update ripples
    for (let i = this.state.ripples.length - 1; i >= 0; i--) {
      const rip = this.state.ripples[i];
      rip.age += dt;
      if (rip.age >= rip.duration) {
        this.state.ripples.splice(i, 1);
      }
    }

    // 4. Check win condition
    // WIN: when all 4 sheep centres are within the pen radius
    const allInPen = this.state.sheep.every((s) => s.isInPen);
    if (allInPen && !this.state.isWon) {
      this.state.isWon = true;
      this.state.winTime = performance.now();
      sounds.playWinFanfare();
      this.notifyState();
    }
  }
}

export const gameEngine = new GameEngine();
