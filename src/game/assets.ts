/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// ASSETS LOADER & SPRITESHEET ENGINE
// ============================================================================
// Supports:
// 1. Direct browser File / Blob import with IndexedDB persistence
// 2. Verified directional spritesheet frame mapping
// 3. Fallback procedural pixel art generation matching the uploaded sprites
// 4. Remote GitHub repository URL fetching

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

export type AssetStatus = 'loading' | 'loaded' | 'failed' | 'custom';

const DB_NAME = 'shepherd_game_assets_db';
const STORE_NAME = 'sprites_store';

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

  public proceduralMapCanvas: HTMLCanvasElement | null = null;
  public onAssetsUpdated?: () => void;

  // VERIFIED DIRECTIONAL ROW MAPPINGS
  // Inspected from uploaded isometric_character_idle.png & walk.png:
  // Row 0: s (South / towards camera)
  // Row 1: se (South-East)
  // Row 2: e (East / facing right)
  // Row 3: ne (North-East)
  // Row 4: n (North / away from camera)
  // Row 5: nw (North-West)
  // Row 6: w (West / facing left)
  // Row 7: sw (South-West)
  public static readonly SHEPHERD_DIR_ROWS: Record<Direction8, number> = {
    s: 0,
    se: 1,
    e: 2,
    ne: 3,
    n: 4,
    nw: 5,
    w: 6,
    sw: 7,
  };

  // VERIFIED SHEEP & RAM DIRECTION ROWS:
  // Row 0 = north, Row 1 = east, Row 2 = south, Row 3 = west
  public static readonly SHEEP_DIR_ROWS: Record<Direction4, number> = {
    n: 0,
    e: 1,
    s: 2,
    w: 3,
  };

  constructor() {
    const savedRepo = typeof window !== 'undefined' ? localStorage.getItem('shepherd_custom_repo_url') : null;
    this.baseUrl = savedRepo || '';
    this.createProceduralMap();
    this.generateProceduralSprites();
    this.initFromIndexedDB();
  }

  // Open IndexedDB to load cached uploaded sprites
  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB not supported'));
      }
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  public async saveImageToIndexedDB(key: string, dataUrl: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(dataUrl, key);
    } catch (e) {
      console.warn('Failed to save to IndexedDB:', e);
    }
  }

  private async initFromIndexedDB() {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const keys: (keyof LoadedImages)[] = [
        'dummyMap',
        'shepherdIdle',
        'shepherdWalk',
        'sheepWalk',
        'sheepEat',
        'ramWalk',
        'ramEat',
      ];

      for (const key of keys) {
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result) {
            const img = new Image();
            img.onload = () => {
              this.images[key] = img;
              this.status[key] = 'loaded';
              this.onAssetsUpdated?.();
            };
            img.src = req.result;
          }
        };
      }
    } catch {
      // Ignore
    }
  }

  // Load custom file uploaded by the user via file picker or drag-and-drop
  public async loadUserUploadedFiles(files: FileList | File[]): Promise<number> {
    let matchedCount = 0;
    const fileList = Array.from(files);

    for (const file of fileList) {
      const name = file.name.toLowerCase().trim();
      let key: keyof LoadedImages | null = null;

      if (name.includes('idle') && name.includes('character')) {
        key = 'shepherdIdle';
      } else if (name.includes('walk') && name.includes('character')) {
        key = 'shepherdWalk';
      } else if (name.includes('ram') && (name.includes('eat') || name.includes('%20eat'))) {
        key = 'ramEat';
      } else if (name.includes('ram') && name.includes('walk')) {
        key = 'ramWalk';
      } else if (name.includes('sheep') && name.includes('eat')) {
        key = 'sheepEat';
      } else if (name.includes('sheep') && name.includes('walk')) {
        key = 'sheepWalk';
      } else if (name.includes('dummy_map') || name.includes('dummy map') || name.includes('map')) {
        key = 'dummyMap';
      }

      if (key) {
        const dataUrl = await this.fileToDataUrl(file);
        await this.applyImageData(key, dataUrl);
        await this.saveImageToIndexedDB(key, dataUrl);
        matchedCount++;
      }
    }

    if (matchedCount > 0) {
      this.onAssetsUpdated?.();
    }
    return matchedCount;
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  public applyImageData(key: keyof LoadedImages, dataUrl: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images[key] = img;
        this.status[key] = 'loaded';
        resolve();
      };
      img.src = dataUrl;
    });
  }

  public setBaseUrl(url: string) {
    let clean = url.trim();
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
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

  private getAssetUrl(relPath: string): string {
    if (this.baseUrl) {
      return `${this.baseUrl}/${relPath}`.replace(/([^:]\/)\/+/g, '$1');
    }
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
      // Don't overwrite if already loaded via user upload
      if (this.status[key] === 'loaded' && this.images[key]) {
        return Promise.resolve();
      }

      this.status[key] = 'loading';
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this.images[key] = img;
          this.status[key] = 'loaded';
          this.onAssetsUpdated?.();
          resolve();
        };
        img.onerror = () => {
          // If not loaded, fallback procedural is used
          this.status[key] = 'failed';
          resolve();
        };
        img.src = this.getAssetUrl(path);
      });
    });

    return Promise.all(promises).then(() => {
      this.onAssetsUpdated?.();
    });
  }

  // ============================================================================
  // PROCEDURAL PIXEL ART GENERATOR
  // ============================================================================
  // Generates canvas spritesheets that closely reflect the exact art style
  // (white mannequin shepherd with shaded muscles, fluffy sheep, and golden-horned rams)
  // so the game has pixel-art animations even prior to file import.
  private generateProceduralSprites() {
    if (typeof document === 'undefined') return;

    // 1. Procedural Sheep Walk (512x512, 4x4)
    if (!this.images.sheepWalk) {
      this.images.sheepWalk = this.createSheepSheetCanvas(false, false);
    }
    // 2. Procedural Sheep Eat (512x512, 4x4)
    if (!this.images.sheepEat) {
      this.images.sheepEat = this.createSheepSheetCanvas(false, true);
    }
    // 3. Procedural Ram Walk (512x512, 4x4)
    if (!this.images.ramWalk) {
      this.images.ramWalk = this.createSheepSheetCanvas(true, false);
    }
    // 4. Procedural Ram Eat (512x512, 4x4)
    if (!this.images.ramEat) {
      this.images.ramEat = this.createSheepSheetCanvas(true, true);
    }
    // 5. Procedural Shepherd Idle (512x512, 8x8)
    if (!this.images.shepherdIdle) {
      this.images.shepherdIdle = this.createShepherdSheetCanvas(false);
    }
    // 6. Procedural Shepherd Walk (768x512, 12x8)
    if (!this.images.shepherdWalk) {
      this.images.shepherdWalk = this.createShepherdSheetCanvas(true);
    }
  }

  // Generate 512x512 sheep/ram spritesheet
  private createSheepSheetCanvas(isRam: boolean, isEat: boolean): HTMLImageElement {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const frameSize = 128;

    // 4 rows: 0=North, 1=East, 2=South, 3=West
    // 4 cols: frames 0..3
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const cx = col * frameSize + 64;
        const cy = row * frameSize + 64;

        ctx.save();
        ctx.imageSmoothingEnabled = false;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 24, 26, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wool body
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;

        const woolPuffs = [
          [-14, -8], [0, -12], [14, -8],
          [-18, 4], [0, 6], [18, 4],
          [-12, 16], [12, 16]
        ];

        // Draw puffs
        ctx.beginPath();
        for (const [px, py] of woolPuffs) {
          ctx.arc(cx + px, cy + py, 14, 0, Math.PI * 2);
        }
        ctx.fill();

        // Direction-specific head & face
        let hx = cx;
        let hy = cy;
        let headDownOffset = isEat ? (col === 2 || col === 3 ? 12 : col === 1 ? 6 : 0) : 0;

        if (row === 0) { // North (back view)
          hy = cy - 14;
          ctx.fillStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.arc(hx, hy + headDownOffset, 12, 0, Math.PI * 2);
          ctx.fill();
        } else if (row === 1) { // East (facing right)
          hx = cx + 22;
          hy = cy + headDownOffset;
          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.ellipse(hx, hy, 12, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          // Eye
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(hx + 3, hy - 3, 3, 3);
        } else if (row === 2) { // South (front view)
          hy = cy + 12 + headDownOffset;
          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.ellipse(hx, hy, 12, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          // Eyes
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(hx - 5, hy - 2, 2.5, 2.5);
          ctx.fillRect(hx + 3, hy - 2, 2.5, 2.5);
        } else if (row === 3) { // West (facing left)
          hx = cx - 22;
          hy = cy + headDownOffset;
          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.ellipse(hx, hy, 12, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          // Eye
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(hx - 5, hy - 3, 3, 3);
        }

        // Ram Horns (golden curved)
        if (isRam) {
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          if (row === 2) { // South
            ctx.beginPath();
            ctx.arc(hx - 10, hy - 6, 8, 0.2, Math.PI * 1.3);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(hx + 10, hy - 6, 8, -Math.PI * 0.3, Math.PI);
            ctx.stroke();
          } else if (row === 1) { // East
            ctx.beginPath();
            ctx.arc(hx - 6, hy - 6, 8, 0, Math.PI * 1.5);
            ctx.stroke();
          } else if (row === 3) { // West
            ctx.beginPath();
            ctx.arc(hx + 6, hy - 6, 8, -Math.PI * 0.5, Math.PI);
            ctx.stroke();
          } else { // North
            ctx.beginPath();
            ctx.arc(hx - 8, hy - 4, 6, 0, Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(hx + 8, hy - 4, 6, 0, Math.PI);
            ctx.stroke();
          }
        }

        // Legs (walk animation)
        const walkShift = !isEat ? Math.sin((col / 4) * Math.PI * 2) * 6 : 0;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(cx - 14, cy + 20 + walkShift, 5, 12);
        ctx.fillRect(cx + 10, cy + 20 - walkShift, 5, 12);

        ctx.restore();
      }
    }

    const img = new Image();
    img.src = canvas.toDataURL();
    return img;
  }

  // Generate shepherd spritesheet (idle 512x512 8x8, or walk 768x512 12x8)
  private createShepherdSheetCanvas(isWalk: boolean): HTMLImageElement {
    const canvas = document.createElement('canvas');
    canvas.width = isWalk ? 768 : 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cols = isWalk ? 12 : 8;
    const rows = 8;
    const frameSize = 64;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = c * frameSize + 32;
        const cy = r * frameSize + 32;

        ctx.save();
        ctx.imageSmoothingEnabled = false;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 22, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Direction angle:
        // r=0: South, r=1: SE, r=2: E, r=3: NE, r=4: N, r=5: NW, r=6: W, r=7: SW
        const angles = [
          Math.PI / 2,
          Math.PI / 4,
          0,
          -Math.PI / 4,
          -Math.PI / 2,
          (-3 * Math.PI) / 4,
          Math.PI,
          (3 * Math.PI) / 4,
        ];
        const angle = angles[r];
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        // Mannequin character style
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.8;

        // Head
        ctx.beginPath();
        ctx.arc(cx + dx * 2, cy - 14 + dy * 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Torso
        ctx.beginPath();
        ctx.roundRect(cx - 5, cy - 8, 10, 16, [3]);
        ctx.fill();
        ctx.stroke();

        // Muscle shading on back or side (grey shading like uploaded image)
        ctx.fillStyle = '#94a3b8';
        if (r === 4 || r === 3 || r === 5) {
          // North view - back shading
          ctx.fillRect(cx - 3, cy - 6, 6, 12);
        } else if (r === 2 || r === 1) {
          // East view
          ctx.fillRect(cx - 4, cy - 6, 4, 12);
        } else if (r === 6 || r === 7) {
          // West view
          ctx.fillRect(cx, cy - 6, 4, 12);
        }

        // Walk cycle leg stride
        const isStride = isWalk && c >= 8;
        const step = isStride ? Math.sin(((c - 8) / 4) * Math.PI * 2) * 6 : 0;

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        // Legs
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy + 8);
        ctx.lineTo(cx - 3 - step, cy + 22);
        ctx.moveTo(cx + 3, cy + 8);
        ctx.lineTo(cx + 3 + step, cy + 22);
        ctx.stroke();

        ctx.restore();
      }
    }

    const img = new Image();
    img.src = canvas.toDataURL();
    return img;
  }

  // Pre-generate detailed 2212x931 countryside map
  private createProceduralMap() {
    const w = GAME_CONFIG.world.width;
    const h = GAME_CONFIG.world.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Grass gradient
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#5f9e43');
    bgGrad.addColorStop(0.5, '#6da84d');
    bgGrad.addColorStop(1, '#57943d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Contours
    for (let i = 0; i < 40; i++) {
      const hx = (i * 137.5) % w;
      const hy = (i * 83.1) % h;
      const grad = ctx.createRadialGradient(hx, hy, 20, hx, hy, 250);
      grad.addColorStop(0, 'rgba(128, 196, 75, 0.25)');
      grad.addColorStop(1, 'rgba(75, 130, 45, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(hx, hy, 280, 160, (i * 0.4) % Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dirt paths
    ctx.strokeStyle = '#c2a16d';
    ctx.lineWidth = 48;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(120, 480);
    ctx.bezierCurveTo(550, 460, 800, 560, 1150, 510);
    ctx.bezierCurveTo(1450, 470, 1750, 400, 2100, 420);
    ctx.stroke();

    ctx.strokeStyle = '#d7b985';
    ctx.lineWidth = 32;
    ctx.stroke();

    // Wildflower clusters
    for (let f = 0; f < 300; f++) {
      const fx = ((f * 97.3) % w);
      const fy = ((f * 71.9) % h);
      ctx.fillStyle = ['#ffffff', '#fef08a', '#fda4af', '#93c5fd', '#c4b5fd'][f % 5];
      ctx.beginPath();
      ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Border fence
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    this.proceduralMapCanvas = canvas;
  }
}

export const assetManager = new AssetManager();
