/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// CANVAS RENDERER
// ============================================================================
// Renders the clamped camera viewport, background map, river & bridge (Stage 2),
// sequential numbered pens (Stage 2), ripples, Y-sorted shepherds and sheep,
// selection highlights, and UI win banner.

import { assetManager, AssetManager } from './assets';
import { GAME_CONFIG } from './config';
import { Camera, Direction4, Direction8, GameState, SheepEntity, ShepherdEntity, StageId } from './types';

export class GameRenderer {
  public showTacticalRings: boolean = false;
  public useMinimalCircles: boolean = false;

  // Render a full frame
  public render(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    camera: Camera,
    canvasWidth: number,
    canvasHeight: number
  ) {
    // Clear screen
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Save camera translation and scale
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // 1. Render Map Background
    this.renderMap(ctx, state.stage);

    // 2. Render River & Bridge in Stage 2
    if (state.stage === 2) {
      this.renderRiverAndBridge(ctx);
    }

    // 3. Render Pens (1 pen in Stage 1, 3 numbered sequential pens in Stage 2)
    this.renderPens(ctx, state);

    // 4. Render Target Ripples
    this.renderRipples(ctx, state);

    // 5. Render Entities sorted by Y coordinate (depth sorting)
    this.renderEntities(ctx, state);

    // Restore from world space
    ctx.restore();

    // 6. Render Screen Space Overlays
    if (state.stageNotification && Date.now() - state.stageNotification.timestamp < 5000) {
      this.renderStageNotification(ctx, state.stageNotification, canvasWidth);
    }

    if (state.isWon) {
      this.renderWinBanner(ctx, state, canvasWidth, canvasHeight);
    }
  }

  // Render map image or procedural pasture
  private renderMap(ctx: CanvasRenderingContext2D, stage: StageId) {
    const w = GAME_CONFIG.world.width;
    const h = GAME_CONFIG.world.height;
    const mapImg = assetManager.images.dummyMap;

    if (mapImg && assetManager.status.dummyMap === 'loaded' && !this.useMinimalCircles) {
      ctx.drawImage(mapImg, 0, 0, w, h);
    } else if (assetManager.proceduralMapCanvas) {
      ctx.drawImage(assetManager.proceduralMapCanvas, 0, 0);
    } else {
      ctx.fillStyle = '#4f772d';
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Render River & Wooden Bridge for Stage 2
  private renderRiverAndBridge(ctx: CanvasRenderingContext2D) {
    const river = GAME_CONFIG.stage2.river;
    const worldH = GAME_CONFIG.world.height;
    const now = performance.now() * 0.0015;

    ctx.save();

    // 1. Riverbed and flowing water
    const riverW = river.xMax - river.xMin;
    const waterGrad = ctx.createLinearGradient(river.xMin, 0, river.xMax, 0);
    waterGrad.addColorStop(0, '#1e40af'); // deep navy blue
    waterGrad.addColorStop(0.2, '#2563eb'); // royal blue
    waterGrad.addColorStop(0.5, '#3b82f6'); // bright azure center
    waterGrad.addColorStop(0.8, '#2563eb');
    waterGrad.addColorStop(1, '#1d4ed8');

    ctx.fillStyle = waterGrad;
    ctx.fillRect(river.xMin, 0, riverW, worldH);

    // Animated water current ripples
    ctx.strokeStyle = 'rgba(191, 219, 254, 0.4)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    for (let y = 14; y < worldH; y += 38) {
      const waveShift = Math.sin(y * 0.04 + now * 2.5) * 10;
      const xStart = river.xMin + 16 + ((y * 11) % 30);
      const xEnd = river.xMax - 16 - ((y * 19) % 30);

      ctx.beginPath();
      ctx.moveTo(xStart, y + waveShift);
      ctx.bezierCurveTo(
        (xStart + xEnd) / 2,
        y + waveShift + 6 * Math.cos(now * 3 + y * 0.03),
        (xStart + xEnd) / 2,
        y + waveShift - 6 * Math.sin(now * 3 + y * 0.03),
        xEnd,
        y + waveShift
      );
      ctx.stroke();
    }

    // River bank foam flecks
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let y = 12; y < worldH; y += 32) {
      const foamY = (y + (now * 24)) % worldH;
      ctx.fillRect(river.xMin + 2, foamY, 4, 8);
      ctx.fillRect(river.xMax - 6, (foamY + 16) % worldH, 4, 8);
    }

    // Stone riverbanks
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    // West bank line (with gap for bridge)
    ctx.beginPath();
    ctx.moveTo(river.xMin, 0);
    ctx.lineTo(river.xMin, river.bridgeYMin);
    ctx.moveTo(river.xMin, river.bridgeYMax);
    ctx.lineTo(river.xMin, worldH);
    ctx.stroke();

    // East bank line (with gap for bridge)
    ctx.beginPath();
    ctx.moveTo(river.xMax, 0);
    ctx.lineTo(river.xMax, river.bridgeYMin);
    ctx.moveTo(river.xMax, river.bridgeYMax);
    ctx.lineTo(river.xMax, worldH);
    ctx.stroke();

    // Bank river foliage / reeds
    ctx.fillStyle = '#15803d';
    for (let y = 18; y < worldH; y += 50) {
      if (y >= river.bridgeYMin - 15 && y <= river.bridgeYMax + 15) continue;
      // West reeds
      ctx.fillRect(river.xMin - 6, y, 5, 12);
      // East reeds
      ctx.fillRect(river.xMax + 1, y + 8, 5, 12);
    }

    // Dirt path leading up to bridge entrances
    ctx.fillStyle = 'rgba(215, 185, 133, 0.65)';
    // West entrance path
    ctx.beginPath();
    ctx.ellipse(river.bridgeXMin - 24, (river.bridgeYMin + river.bridgeYMax) / 2, 35, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    // East entrance path
    ctx.beginPath();
    ctx.ellipse(river.bridgeXMax + 24, (river.bridgeYMin + river.bridgeYMax) / 2, 35, 60, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. The Bridge
    const bridgeW = river.bridgeXMax - river.bridgeXMin;
    const bridgeH = river.bridgeYMax - river.bridgeYMin;

    // Bridge shadow on water
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(river.xMin, river.bridgeYMax, riverW, 16);

    // Stone bridge piers / abutments
    ctx.fillStyle = '#475569';
    ctx.fillRect(river.bridgeXMin - 6, river.bridgeYMin - 6, 20, bridgeH + 12);
    ctx.fillRect(river.bridgeXMax - 14, river.bridgeYMin - 6, 20, bridgeH + 12);

    // Wooden deck base
    ctx.fillStyle = '#78350f';
    ctx.fillRect(river.bridgeXMin, river.bridgeYMin, bridgeW, bridgeH);

    // Individual wooden floor planks
    const plankW = 14;
    for (let px = river.bridgeXMin; px < river.bridgeXMax; px += plankW) {
      ctx.fillStyle = (Math.floor(px / plankW) % 2 === 0) ? '#92400e' : '#b45309';
      ctx.fillRect(px, river.bridgeYMin + 4, plankW - 2, bridgeH - 8);

      // Plank nail fasteners
      ctx.fillStyle = '#292524';
      ctx.fillRect(px + 3, river.bridgeYMin + 10, 2, 2);
      ctx.fillRect(px + 3, river.bridgeYMax - 12, 2, 2);
    }

    // Heavy wooden handrails (top and bottom)
    ctx.fillStyle = '#451a03';
    // Top handrail
    ctx.fillRect(river.bridgeXMin - 8, river.bridgeYMin - 3, bridgeW + 16, 8);
    // Bottom handrail
    ctx.fillRect(river.bridgeXMin - 8, river.bridgeYMax - 5, bridgeW + 16, 8);

    // Railing upright posts
    for (let px = river.bridgeXMin; px <= river.bridgeXMax; px += 28) {
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(px - 3, river.bridgeYMin - 6, 6, 13);
      ctx.fillRect(px - 3, river.bridgeYMax - 8, 6, 13);
    }

    // Bridge name signpost
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BRIDGE CROSSING', (river.xMin + river.xMax) / 2, river.bridgeYMin - 16);

    ctx.restore();
  }

  // Render pens (Stage 1 has 1 pen; Stage 2 has 3 numbered sequential pens)
  private renderPens(ctx: CanvasRenderingContext2D, state: GameState) {
    const pens = state.stage === 1 ? GAME_CONFIG.stage1.pens : GAME_CONFIG.stage2.pens;

    pens.forEach((pen, idx) => {
      const isCompleted = state.stage === 1 ? state.isWon : state.completedPens[idx];
      const isActive = !isCompleted && (state.stage === 1 ? !state.isWon : state.activePenIndex === idx);
      const isUpcoming = !isCompleted && !isActive;

      // Count sheep currently inside this pen
      const sheepInThisPen = state.sheep.filter(
        (shp) => Math.hypot(shp.x - pen.centerX, shp.y - pen.centerY) <= pen.radius
      ).length;

      ctx.save();
      ctx.beginPath();
      ctx.arc(pen.centerX, pen.centerY, pen.radius, 0, Math.PI * 2);

      if (isCompleted) {
        // Bright victory emerald
        ctx.fillStyle = 'rgba(74, 222, 128, 0.4)';
        ctx.fill();
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 7;
        ctx.stroke();

        // Aura
        ctx.beginPath();
        ctx.arc(pen.centerX, pen.centerY, pen.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(134, 239, 172, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (isActive) {
        // Glowing gold / vibrant green active goal
        const pulse = (Math.sin(performance.now() * 0.005) + 1) * 0.5;
        ctx.fillStyle = `rgba(56, 161, 105, ${0.25 + pulse * 0.15})`;
        ctx.fill();
        ctx.strokeStyle = pulse > 0.5 ? '#facc15' : '#4ade80';
        ctx.lineWidth = 5 + pulse * 2;
        ctx.stroke();

        // Animated dashed inner ring
        ctx.beginPath();
        ctx.arc(pen.centerX, pen.centerY, pen.radius - 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -performance.now() * 0.02;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Locked / upcoming pen
        ctx.fillStyle = 'rgba(100, 116, 139, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw Big Circular Number Badge at Pen Center
      const badgeRadius = 26;
      ctx.beginPath();
      ctx.arc(pen.centerX, pen.centerY, badgeRadius, 0, Math.PI * 2);
      ctx.fillStyle = isCompleted ? '#166534' : isActive ? '#854d0e' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = isCompleted ? '#86efac' : isActive ? '#fef08a' : '#64748b';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Number / Checkmark
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.fillStyle = isCompleted ? '#dcfce7' : isActive ? '#fef08a' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (isCompleted) {
        ctx.fillText(`✓ ${pen.id}`, pen.centerX, pen.centerY);
      } else {
        ctx.fillText(`${pen.id}`, pen.centerX, pen.centerY);
      }

      // Top Pen Status Header
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const tagY = pen.centerY - pen.radius - 16;
      if (isCompleted) {
        ctx.fillStyle = '#86efac';
        ctx.fillText(`PEN ${pen.id}: CLEARED (4/4)`, pen.centerX, tagY);
      } else if (isActive) {
        ctx.fillStyle = '#fef08a';
        ctx.fillText(`★ TARGET PEN ${pen.id} [${sheepInThisPen}/4]`, pen.centerX, tagY);
      } else {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(`PEN ${pen.id} (NEXT STEP)`, pen.centerX, tagY);
      }

      ctx.restore();
    });
  }

  // Render expanding fading ripples at shepherd move targets
  private renderRipples(ctx: CanvasRenderingContext2D, state: GameState) {
    const cfg = GAME_CONFIG.input;

    for (const rip of state.ripples) {
      const progress = Math.min(1, rip.age / rip.duration);
      const radius = cfg.rippleStartRadius + (cfg.rippleEndRadius - cfg.rippleStartRadius) * progress;
      const alpha = Math.max(0, 1 - progress) * 0.9;

      ctx.save();
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 217, 64, ${alpha})`;
      ctx.lineWidth = cfg.rippleLineWidth;
      ctx.stroke();

      // Center point
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 217, 64, ${alpha * 0.8})`;
      ctx.fill();

      ctx.restore();
    }
  }

  // Render all entities (Shepherds and Sheep) depth-sorted by Y
  private renderEntities(ctx: CanvasRenderingContext2D, state: GameState) {
    type Renderable =
      | { type: 'shepherd'; entity: ShepherdEntity; y: number }
      | { type: 'sheep'; entity: SheepEntity; y: number };

    const items: Renderable[] = [
      ...state.shepherds.map((s) => ({ type: 'shepherd' as const, entity: s, y: s.y })),
      ...state.sheep.map((s) => ({ type: 'sheep' as const, entity: s, y: s.y })),
    ];

    // Sort by Y (lower on screen = drawn in front)
    items.sort((a, b) => a.y - b.y);

    for (const item of items) {
      if (item.type === 'shepherd') {
        this.renderShepherd(ctx, item.entity);
      } else {
        this.renderSheep(ctx, item.entity);
      }
    }
  }

  // Render Shepherd
  private renderShepherd(ctx: CanvasRenderingContext2D, sh: ShepherdEntity) {
    const cfg = GAME_CONFIG.shepherd;

    // Draw planned path / bridge waypoint routing if selected
    if (sh.selected && sh.waypoints && sh.waypoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(sh.x, sh.y);
      for (const wp of sh.waypoints) {
        ctx.lineTo(wp.x, wp.y);
      }
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 1. Selection ring: "A selected shepherd shows a green ring (~collision radius) around it"
    if (sh.selected) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = cfg.selectionRingColor;
      ctx.lineWidth = cfg.selectionRingWidth;
      ctx.stroke();

      // Outer gentle pulse
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Tactical collision ring if enabled
    if (this.showTacticalRings) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, sh.radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Sprite drawing
    const walkImg = assetManager.images.shepherdWalk;
    const idleImg = assetManager.images.shepherdIdle;

    if (walkImg && idleImg && !this.useMinimalCircles) {
      this.drawShepherdSprite(ctx, sh, walkImg, idleImg);
    } else {
      // Fallback: simple coloured circles
      this.drawShepherdFallbackCircle(ctx, sh);
    }

    // 4. Shepherd ID label (C1, C2, C3)
    ctx.save();
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = sh.selected ? '#fef08a' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.strokeText(`C${sh.id + 1}`, sh.x, sh.y - sh.radius - 8);
    ctx.fillText(`C${sh.id + 1}`, sh.x, sh.y - sh.radius - 8);
    ctx.restore();
  }

  // Draw Shepherd from spritesheet
  private drawShepherdSprite(
    ctx: CanvasRenderingContext2D,
    sh: ShepherdEntity,
    walkSheet: HTMLImageElement,
    idleSheet: HTMLImageElement
  ) {
    const frameSize = 64;
    const row = AssetManager.SHEPHERD_DIR_ROWS[sh.direction];
    const sheet = sh.isMoving ? walkSheet : idleSheet;

    const col = sh.isMoving ? (sh.animFrame % 12) : (sh.animFrame % 8);

    const sx = col * frameSize;
    const sy = row * frameSize;

    const renderSize = 64;
    const dx = Math.round(sh.x - renderSize / 2);
    const dy = Math.round(sh.y - renderSize / 2 - 8);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, sx, sy, frameSize, frameSize, dx, dy, renderSize, renderSize);
    ctx.restore();
  }

  // Draw Shepherd fallback circle
  private drawShepherdFallbackCircle(ctx: CanvasRenderingContext2D, sh: ShepherdEntity) {
    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y + sh.radius * 0.7, sh.radius * 0.8, sh.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = sh.selected ? '#eab308' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(sh.x, sh.y, sh.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Direction indicator
    const dirAngles: Record<Direction8, number> = {
      e: 0,
      se: Math.PI / 4,
      s: Math.PI / 2,
      sw: (3 * Math.PI) / 4,
      w: Math.PI,
      nw: (-3 * Math.PI) / 4,
      n: -Math.PI / 2,
      ne: -Math.PI / 4,
    };
    const angle = dirAngles[sh.direction];
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(sh.x + Math.cos(angle) * (sh.radius + 6), sh.y + Math.sin(angle) * (sh.radius + 6));
    ctx.stroke();

    ctx.restore();
  }

  // Render Sheep
  private renderSheep(ctx: CanvasRenderingContext2D, shp: SheepEntity) {
    const cfg = GAME_CONFIG.sheep;

    // Tactical fear radius if enabled
    if (this.showTacticalRings) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(shp.x, shp.y, cfg.fleeFearRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(shp.x, shp.y, shp.radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    const isRam = shp.kind === 'ram';
    const walkImg = isRam ? assetManager.images.ramWalk : assetManager.images.sheepWalk;
    const eatImg = isRam ? assetManager.images.ramEat : assetManager.images.sheepEat;

    if (walkImg && eatImg && !this.useMinimalCircles) {
      this.drawSheepSprite(ctx, shp, walkImg, eatImg);
    } else {
      this.drawSheepFallbackCircle(ctx, shp);
    }
  }

  // Draw Sheep from spritesheet
  private drawSheepSprite(
    ctx: CanvasRenderingContext2D,
    shp: SheepEntity,
    walkSheet: HTMLImageElement,
    eatSheet: HTMLImageElement
  ) {
    const frameSize = 128;
    const row = AssetManager.SHEEP_DIR_ROWS[shp.direction];
    const sheet = shp.isMoving ? walkSheet : eatSheet;
    const col = shp.animFrame % 4;

    const sx = col * frameSize;
    const sy = row * frameSize;

    const renderSize = 72;
    const dx = Math.round(shp.x - renderSize / 2);
    const dy = Math.round(shp.y - renderSize / 2 - 4);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, sx, sy, frameSize, frameSize, dx, dy, renderSize, renderSize);
    ctx.restore();
  }

  // Draw Sheep fallback circle
  private drawSheepFallbackCircle(ctx: CanvasRenderingContext2D, shp: SheepEntity) {
    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(shp.x, shp.y + shp.radius * 0.7, shp.radius * 0.8, shp.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = shp.kind === 'ram' ? '#e2e8f0' : '#ffffff';
    ctx.beginPath();
    ctx.arc(shp.x, shp.y, shp.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shp.kind === 'ram' ? '#b45309' : '#475569';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Ram horns
    if (shp.kind === 'ram') {
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(shp.x - 10, shp.y - 8, 7, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(shp.x + 10, shp.y - 8, 7, -Math.PI * 0.5, Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Floating banner notification for Stage 2 progression
  private renderStageNotification(
    ctx: CanvasRenderingContext2D,
    notif: { message: string; submessage?: string; timestamp: number },
    screenWidth: number
  ) {
    const elapsed = Date.now() - notif.timestamp;
    if (elapsed > 5000) return;

    const alpha = elapsed < 4000 ? 1 : Math.max(0, 1 - (elapsed - 4000) / 1000);

    ctx.save();
    const cx = screenWidth / 2;
    const cy = 60;
    const boxW = Math.min(520, screenWidth - 40);
    const boxH = notif.submessage ? 62 : 46;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.font = '800 16px system-ui, sans-serif';
    ctx.fillStyle = '#4ade80';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(notif.message, cx, notif.submessage ? cy - 10 : cy);

    if (notif.submessage) {
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(notif.submessage, cx, cy + 12);
    }

    ctx.restore();
  }

  // Render atmospheric celebration vignette when stage is won
  private renderWinBanner(
    ctx: CanvasRenderingContext2D,
    _state: GameState,
    screenWidth: number,
    screenHeight: number
  ) {
    ctx.save();
    const cx = screenWidth / 2;
    const cy = screenHeight / 2;

    // Soft emerald/gold celebration glow around edges
    const grad = ctx.createRadialGradient(cx, cy, screenHeight * 0.2, cx, cy, Math.max(screenWidth, screenHeight) * 0.75);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(0.5, 'rgba(6, 78, 59, 0.45)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    ctx.restore();
  }
}

export const gameRenderer = new GameRenderer();
