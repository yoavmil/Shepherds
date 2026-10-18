/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// CANVAS RENDERER
// ============================================================================
// Renders the clamped camera viewport, background map, pen, ripples,
// Y-sorted shepherds and sheep (using either loaded spritesheets or procedural fallbacks),
// selection highlights, and UI win banner.

import { assetManager, AssetManager } from './assets';
import { GAME_CONFIG } from './config';
import { Camera, Direction4, Direction8, GameState, SheepEntity, ShepherdEntity } from './types';

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

    // Save camera translation
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // 1. Render Map Background
    this.renderMap(ctx);

    // 2. Render Pen
    this.renderPen(ctx, state.isWon);

    // 3. Render Target Ripples
    this.renderRipples(ctx, state);

    // 4. Render Entities sorted by Y coordinate (depth sorting)
    this.renderEntities(ctx, state);

    // Restore from world space
    ctx.restore();

    // 5. Render Screen Space Overlays (e.g. Win Banner)
    if (state.isWon) {
      this.renderWinBanner(ctx, canvasWidth, canvasHeight);
    }
  }

  // Render map image or procedural pasture
  private renderMap(ctx: CanvasRenderingContext2D) {
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

  // Render circular pen
  private renderPen(ctx: CanvasRenderingContext2D, isWon: boolean) {
    const pen = GAME_CONFIG.pen;

    ctx.save();
    ctx.beginPath();
    ctx.arc(pen.centerX, pen.centerY, pen.radius, 0, Math.PI * 2);

    if (isWon) {
      ctx.fillStyle = pen.winFill;
      ctx.fill();
      ctx.strokeStyle = pen.winStroke;
      ctx.lineWidth = pen.winLineWidth;
      ctx.stroke();

      // Celebration aura
      ctx.beginPath();
      ctx.arc(pen.centerX, pen.centerY, pen.radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(134, 239, 172, 0.5)';
      ctx.lineWidth = 4;
      ctx.stroke();
    } else {
      ctx.fillStyle = pen.normalFill;
      ctx.fill();
      ctx.strokeStyle = pen.normalStroke;
      ctx.lineWidth = pen.normalLineWidth;
      ctx.stroke();

      // Subtle dashed inner boundary ring
      ctx.beginPath();
      ctx.arc(pen.centerX, pen.centerY, pen.radius - 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Pen center marker
    ctx.beginPath();
    ctx.arc(pen.centerX, pen.centerY, 3, 0, Math.PI * 2);
    ctx.fillStyle = isWon ? '#4ade80' : 'rgba(255, 255, 255, 0.4)';
    ctx.fill();

    // Pen label text in world
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = isWon ? '#86efac' : 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SHEEP PEN', pen.centerX, pen.centerY - pen.radius - 12);

    ctx.restore();
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

  // Render entities sorted by Y position
  private renderEntities(ctx: CanvasRenderingContext2D, state: GameState) {
    type Renderable =
      | { type: 'shepherd'; entity: ShepherdEntity; y: number }
      | { type: 'sheep'; entity: SheepEntity; y: number };

    const items: Renderable[] = [
      ...state.shepherds.map((s) => ({ type: 'shepherd' as const, entity: s, y: s.y })),
      ...state.sheep.map((s) => ({ type: 'sheep' as const, entity: s, y: s.y })),
    ];

    // Sort by Y ascending (lower on screen has higher Y, so it's drawn later/on top)
    items.sort((a, b) => a.y - b.y);

    for (const item of items) {
      if (item.type === 'shepherd') {
        this.renderShepherd(ctx, item.entity);
      } else {
        this.renderSheep(ctx, item.entity);
      }
    }
  }

  // Render a single shepherd
  private renderShepherd(ctx: CanvasRenderingContext2D, sh: ShepherdEntity) {
    const cfg = GAME_CONFIG.shepherd;

    // Optional Tactical Fear Ring (when enabled)
    if (this.showTacticalRings) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, GAME_CONFIG.sheep.fleeFearRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.restore();
    }

    // Selected indicator: green ring (radius ~ collision radius)
    if (sh.selected) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, cfg.collisionRadius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = cfg.selectionRingColor;
      ctx.lineWidth = cfg.selectionRingWidth;
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();
    }

    // Shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y + 12, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Check if sprite sheets are available and not minimal mode
    const idleImg = assetManager.images.shepherdIdle;
    const walkImg = assetManager.images.shepherdWalk;
    const hasSprites =
      !this.useMinimalCircles &&
      ((sh.isMoving && walkImg && assetManager.status.shepherdWalk === 'loaded') ||
        (!sh.isMoving && idleImg && assetManager.status.shepherdIdle === 'loaded'));

    if (hasSprites) {
      this.drawShepherdSprite(ctx, sh, sh.isMoving ? walkImg! : idleImg!);
    } else {
      this.drawShepherdProcedural(ctx, sh);
    }

    // Shepherd Label (C1, C2, C3)
    ctx.save();
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText(`C${sh.id + 1}`, sh.x, sh.y - 28);
    ctx.restore();
  }

  // Draw Shepherd sprite from sprite sheet
  private drawShepherdSprite(
    ctx: CanvasRenderingContext2D,
    sh: ShepherdEntity,
    img: HTMLImageElement
  ) {
    const frameSize = 64;
    const row = AssetManager.SHEPHERD_DIR_ROWS[sh.direction];

    let col = 0;
    if (sh.isMoving) {
      // Walk spritesheet is 12 columns x 8 rows. In the original, idle uses first 8 columns,
      // and walk uses columns 8-11 (or 0-7 if 8 cols). We map frame (0-3 or 0-7) safely:
      if (img.width >= 768) {
        col = 8 + (sh.animFrame % 4);
      } else {
        col = sh.animFrame % 8;
      }
    } else {
      // Idle spritesheet: 8 columns x 8 rows
      col = sh.animFrame % 8;
    }

    const sx = col * frameSize;
    const sy = row * frameSize;

    // Center sprite over collision position
    ctx.drawImage(
      img,
      sx,
      sy,
      frameSize,
      frameSize,
      sh.x - frameSize / 2,
      sh.y - frameSize / 2 - 8,
      frameSize,
      frameSize
    );
  }

  // Draw procedural Shepherd when sprites are unavailable
  private drawShepherdProcedural(ctx: CanvasRenderingContext2D, sh: ShepherdEntity) {
    ctx.save();

    // Body / Cloak
    const colors = ['#2563eb', '#0284c7', '#0d9488'];
    const cloakColor = colors[sh.id % colors.length];

    // Direction offset for head and crook
    const dirOffsets: Record<Direction8, [number, number]> = {
      e: [6, 0],
      se: [4, 4],
      s: [0, 6],
      sw: [-4, 4],
      w: [-6, 0],
      nw: [-4, -4],
      n: [0, -6],
      ne: [4, -4],
    };
    const [dx, dy] = dirOffsets[sh.direction];

    // Cloak / Torso
    ctx.fillStyle = cloakColor;
    ctx.beginPath();
    ctx.arc(sh.x, sh.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Head / Hat
    ctx.fillStyle = '#fde047'; // Straw hat
    ctx.beginPath();
    ctx.arc(sh.x + dx * 0.4, sh.y - 8 + dy * 0.4, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Shepherd's crook
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sh.x + 10, sh.y + 12);
    ctx.lineTo(sh.x + 12, sh.y - 12);
    ctx.arc(sh.x + 8, sh.y - 14, 5, 0, Math.PI, true);
    ctx.stroke();

    ctx.restore();
  }

  // Render a single sheep
  private renderSheep(ctx: CanvasRenderingContext2D, shp: SheepEntity) {
    // Shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(shp.x, shp.y + 10, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Check if sprite sheets are available and not minimal mode
    const isRam = shp.kind === 'ram';
    const walkImg = isRam ? assetManager.images.ramWalk : assetManager.images.sheepWalk;
    const eatImg = isRam ? assetManager.images.ramEat : assetManager.images.sheepEat;

    const currentImg = shp.isMoving ? walkImg : eatImg;
    const isLoaded =
      currentImg &&
      (shp.isMoving
        ? assetManager.status[isRam ? 'ramWalk' : 'sheepWalk'] === 'loaded'
        : assetManager.status[isRam ? 'ramEat' : 'sheepEat'] === 'loaded');

    if (isLoaded && !this.useMinimalCircles) {
      this.drawSheepSprite(ctx, shp, currentImg);
    } else {
      this.drawSheepProcedural(ctx, shp);
    }

    // Inside pen indicator badge
    if (shp.isInPen) {
      ctx.save();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(shp.x + 10, shp.y - 14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Draw Sheep sprite from 4x4 128x128 grid
  private drawSheepSprite(
    ctx: CanvasRenderingContext2D,
    shp: SheepEntity,
    img: HTMLImageElement
  ) {
    const frameSize = 128;
    // Row 0 = north, Row 1 = east, Row 2 = south, Row 3 = west
    const row = AssetManager.SHEEP_DIR_ROWS[shp.direction];
    const col = shp.animFrame % 4;

    const sx = col * frameSize;
    const sy = row * frameSize;

    // Drawn at half scale (64x64) so it fits nicely with the 24px collision radius
    const drawSize = 64;
    ctx.drawImage(
      img,
      sx,
      sy,
      frameSize,
      frameSize,
      shp.x - drawSize / 2,
      shp.y - drawSize / 2 - 4,
      drawSize,
      drawSize
    );
  }

  // Draw procedural Sheep or Ram when sprites are unavailable
  private drawSheepProcedural(ctx: CanvasRenderingContext2D, shp: SheepEntity) {
    ctx.save();

    const isRam = shp.kind === 'ram';

    // Fluffy wool body (puffs)
    ctx.fillStyle = isRam ? '#e2e8f0' : '#f8fafc';
    ctx.beginPath();
    ctx.arc(shp.x, shp.y, 14, 0, Math.PI * 2);
    ctx.fill();

    // Additional wool puffs for woolly look
    const puffs = [
      [-7, -5],
      [7, -5],
      [-8, 4],
      [8, 4],
      [0, -8],
    ];
    for (const [px, py] of puffs) {
      ctx.beginPath();
      ctx.arc(shp.x + px, shp.y + py, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(shp.x, shp.y, 14, 0, Math.PI * 2);
    ctx.stroke();

    // Head offset based on direction: e, s, w, n
    const headOffsets: Record<Direction4, [number, number]> = {
      e: [12, -2],
      s: [0, 8],
      w: [-12, -2],
      n: [0, -10],
    };
    const [hx, hy] = headOffsets[shp.direction];

    // Head
    ctx.fillStyle = '#334155'; // Dark face
    ctx.beginPath();
    ctx.ellipse(shp.x + hx, shp.y + hy, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(shp.x + hx + 1, shp.y + hy - 1, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Ram Horns
    if (isRam) {
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(shp.x + hx - 4, shp.y + hy - 4, 4, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(shp.x + hx + 4, shp.y + hy - 4, 4, -Math.PI * 0.5, Math.PI);
      ctx.stroke();
    }

    // Legs animation
    const legOffset = shp.isMoving ? Math.sin(shp.animFrame * Math.PI) * 3 : 0;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shp.x - 6, shp.y + 10);
    ctx.lineTo(shp.x - 6 + legOffset, shp.y + 16);
    ctx.moveTo(shp.x + 6, shp.y + 10);
    ctx.lineTo(shp.x + 6 - legOffset, shp.y + 16);
    ctx.stroke();

    ctx.restore();
  }

  // Render "YOU WIN" in the center of the screen
  // Exact requirement: "a big green 'YOU WIN' label appears in the centre of the screen (52px, with dark outline)"
  private renderWinBanner(ctx: CanvasRenderingContext2D, screenWidth: number, screenHeight: number) {
    ctx.save();

    const cx = screenWidth / 2;
    const cy = screenHeight / 2 - 30;

    // Backdrop ribbon / glow
    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 260);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.4)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 300, cy - 80, 600, 160);

    // YOU WIN text
    ctx.font = '900 52px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Dark outline
    ctx.strokeStyle = '#022c22';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeText('YOU WIN', cx, cy);

    // Green text fill
    ctx.fillStyle = '#4ade80';
    ctx.fillText('YOU WIN', cx, cy);

    // Subtitle
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.strokeStyle = '#022c22';
    ctx.lineWidth = 4;
    ctx.strokeText('All sheep safely penned!', cx, cy + 44);
    ctx.fillStyle = '#dcfce7';
    ctx.fillText('All sheep safely penned!', cx, cy + 44);

    ctx.restore();
  }
}

export const gameRenderer = new GameRenderer();
