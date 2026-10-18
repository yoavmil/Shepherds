/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// ASSETS LOADER & PROCEDURAL FALLBACK GENERATOR
// ============================================================================
// Manages image assets loading from GitHub / local resources, provides
// spritesheet frame extraction, and renders procedural fallbacks when
// assets are not present.

import { Direction4, Direction8, SheepKind } from './types';
import { GAME_CONFIG } from './config';

export interface LoadedImages {
  dummyMap: HTMLImageElement | null;
  shepherdIdle: HTMLImageElement | null;
  shepherdWalk: HTMLImageElement | null;
  sheepWalk: HTMLImageElement | null;
  sheepEat: HTMLImageElement | null;
  ramWalk: HTMLImageElement | null;
  ramEat: HTMLImageElement | null;
}

export type AssetStatus = 'loading' | 'loaded' | 'failed' | 'fallback';

export class AssetManager {
  public baseUrl: string = '';
  public status: Record<string, AssetStatus> = {};
  public images: LoadedImages = {
    dummyMap: null,
    shepherdIdle: null,
    shepherdWalk: null,
    sheepWalk: null,
    sheepEat: null,
    ramWalk: null,
    ramEat: null,
  };

  // Fallback procedural map canvas (cached)
  public proceduralMapCanvas: HTMLCanvasElement | null = null;

  // Direction row indices for shepherd spritesheets:
  // Rows: e, se, s, sw, w, nw, n, ne
  public static readonly SHEPHERD_DIR_ROWS: Record<Direction8, number> = {
    e: 0,
    se: 1,
    s: 2,
    sw: 3,
    w: 4,
    nw: 5,
    n: 6,
    ne: 7,
  };

  // Direction row indices for sheep spritesheets (4x4):
  // Row 0 = north, Row 1 = east, Row 2 = south, Row 3 = west
  public static readonly SHEEP_DIR_ROWS: Record<Direction4, number> = {
    n: 0,
    e: 1,
    s: 2,
    w: 3,
  };

  constructor() {
    // Check localStorage for saved custom repo URL
    const savedRepo = typeof window !== 'undefined' ? localStorage.getItem('shepherd_custom_repo_url') : null;
    this.baseUrl = savedRepo || '';
    this.createProceduralMap();
  }

  public setBaseUrl(url: string) {
    let clean = url.trim();
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    // If it's a standard github.com repo link like https://github.com/user/repo, convert to raw.githubusercontent.com/user/repo/main
    if (clean.includes('github.com') && !clean.includes('raw.githubusercontent.com')) {
      clean = clean.replace('github.com/', 'raw.githubusercontent.com/');
      if (!clean.includes('/main') && !clean.includes('/master')) {
        clean += '/main';
      }
    }
    this.baseUrl = clean;
    if (typeof window !== 'undefined') {
      localStorage.setItem('shepherd_custom_repo_url', clean);
    }
    this.loadAll();
  }

  // Generate complete asset URLs
  private getAssetUrl(relPath: string): string {
    if (this.baseUrl) {
      return `${this.baseUrl}/${relPath}`.replace(/([^:]\/)\/+/g, '$1');
    }
    // Default to relative root
    return `/${relPath}`.replace(/([^:]\/)\/+/g, '$1');
  }

  public loadAll(): Promise<void> {
    const assetList: { key: keyof LoadedImages; path: string }[] = [
      { key: 'dummyMap', path: 'resources/images/dummy_map.png' },
      { key: 'shepherdIdle', path: 'resources/shepherd/isometric_character_idle.png' },
      { key: 'shepherdWalk', path: 'resources/shepherd/isometric_character_walk.png' },
      { key: 'sheepWalk', path: 'resources/sheep/sheep_walk.png' },
      { key: 'sheepEat', path: 'resources/sheep/sheep_eat.png' },
      { key: 'ramWalk', path: 'resources/sheep/ram_walk.png' },
      { key: 'ramEat', path: 'resources/sheep/ram%20eat.png' },
    ];

    const promises = assetList.map(({ key, path }) => {
      this.status[key] = 'loading';
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this.images[key] = img;
          this.status[key] = 'loaded';
          resolve();
        };
        img.onerror = () => {
          this.images[key] = null;
          this.status[key] = 'failed';
          resolve();
        };
        img.src = this.getAssetUrl(path);
      });
    });

    return Promise.all(promises).then(() => {
      // Finished loading attempts
    });
  }

  // Pre-generate a lush, detailed 2212x931 countryside map on an offscreen canvas
  // as the procedural fallback when dummy_map.png is not loaded.
  private createProceduralMap() {
    const w = GAME_CONFIG.world.width;
    const h = GAME_CONFIG.world.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Lush rolling grass background
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#5f9e43');
    bgGrad.addColorStop(0.5, '#6da84d');
    bgGrad.addColorStop(1, '#57943d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Grassy texture and soft contour hills
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const hx = ((i * 137.5) % w);
      const hy = ((i * 83.1) % h);
      const grad = ctx.createRadialGradient(hx, hy, 20, hx, hy, 250);
      grad.addColorStop(0, 'rgba(128, 196, 75, 0.25)');
      grad.addColorStop(1, 'rgba(75, 130, 45, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(hx, hy, 280, 160, (i * 0.4) % Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Winding dirt paths
    ctx.strokeStyle = '#c2a16d';
    ctx.lineWidth = 48;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(120, 480);
    ctx.bezierCurveTo(550, 460, 800, 560, 1150, 510);
    ctx.bezierCurveTo(1450, 470, 1750, 400, 2100, 420);
    ctx.stroke();

    // Subtle path inner shade
    ctx.strokeStyle = '#d7b985';
    ctx.lineWidth = 32;
    ctx.stroke();

    // 4. Wildflower clusters and stone patches
    const seedPrng = (seed: number) => {
      let s = seed % 2147483647;
      if (s <= 0) s += 2147483646;
      return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };
    };
    const rand = seedPrng(42);

    for (let f = 0; f < 350; f++) {
      const fx = rand() * w;
      const fy = rand() * h;
      const flowerColor = ['#ffffff', '#fef08a', '#fda4af', '#93c5fd', '#c4b5fd'][Math.floor(rand() * 5)];
      ctx.fillStyle = flowerColor;
      ctx.beginPath();
      ctx.arc(fx, fy, 2.5 + rand() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rocks / small boulders
    for (let r = 0; r < 24; r++) {
      const rx = rand() * w;
      const ry = rand() * h;
      // Skip pen area
      const distToPen = Math.hypot(rx - GAME_CONFIG.pen.centerX, ry - GAME_CONFIG.pen.centerY);
      if (distToPen < 180) continue;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.beginPath();
      ctx.ellipse(rx + 3, ry + 4, 16, 10, 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#78716c';
      ctx.beginPath();
      ctx.ellipse(rx, ry, 15, 10, 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#a8a29e';
      ctx.beginPath();
      ctx.ellipse(rx - 3, ry - 3, 10, 6, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trees around boundaries
    const treePositions: [number, number][] = [
      [140, 120], [320, 90], [540, 110], [920, 80], [1300, 95], [1780, 115], [2050, 140],
      [110, 820], [390, 850], [780, 840], [1200, 830], [1700, 850], [2080, 800],
      [70, 310], [80, 650], [2140, 260], [2130, 640]
    ];
    for (const [tx, ty] of treePositions) {
      // Tree shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.beginPath();
      ctx.ellipse(tx + 6, ty + 18, 38, 20, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tree trunk
      ctx.fillStyle = '#5c4033';
      ctx.fillRect(tx - 6, ty, 12, 22);

      // Tree foliage
      const treeGrad = ctx.createRadialGradient(tx - 6, ty - 22, 10, tx, ty - 18, 38);
      treeGrad.addColorStop(0, '#4ade80');
      treeGrad.addColorStop(0.7, '#16a34a');
      treeGrad.addColorStop(1, '#14532d');
      ctx.fillStyle = treeGrad;
      ctx.beginPath();
      ctx.arc(tx, ty - 18, 36, 0, Math.PI * 2);
      ctx.fill();
    }

    // Border perimeter fence posts
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    ctx.restore();
    this.proceduralMapCanvas = canvas;
  }
}

export const assetManager = new AssetManager();
