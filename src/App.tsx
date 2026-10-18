/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Settings,
  HelpCircle,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { gameEngine } from './game/engine';
import { ShepherdEntity } from './game/types';
import { GAME_CONFIG } from './game/config';
import { assetManager } from './game/assets';
import { gameRenderer } from './game/renderer';
import { sounds } from './game/audio';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  // Reactive game state
  const [shepherds, setShepherds] = useState<ShepherdEntity[]>(() => gameEngine.state.shepherds);
  const [isWon, setIsWon] = useState<boolean>(() => gameEngine.state.isWon);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [tacticalRings, setTacticalRings] = useState<boolean>(false);
  const [minimalCircles, setMinimalCircles] = useState<boolean>(false);

  // Settings & Asset Modal
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [repoUrlInput, setRepoUrlInput] = useState<string>(() => assetManager.baseUrl);
  const [assetStatuses, setAssetStatuses] = useState<Record<string, string>>({});

  // Minimap render tick
  const [, setTick] = useState<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    gameEngine.attach(canvas);

    gameEngine.onStateChange = (updatedShepherds, won) => {
      setShepherds(updatedShepherds);
      setIsWon(won);
      setAssetStatuses({ ...assetManager.status });
    };

    // Periodic state refresh for minimap and sheep count
    const interval = setInterval(() => {
      setTick((t) => (t + 1) % 1000);
      drawMinimap();
    }, 100);

    return () => {
      clearInterval(interval);
      gameEngine.detach();
    };
  }, []);

  // Sync tactical mode and minimal mode
  useEffect(() => {
    gameRenderer.showTacticalRings = tacticalRings;
  }, [tacticalRings]);

  useEffect(() => {
    gameRenderer.useMinimalCircles = minimalCircles;
  }, [minimalCircles]);

  // Audio mute/unmute
  const toggleAudio = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sounds.enabled = next;
  };

  // Draw Minimap in bottom-right corner
  const drawMinimap = () => {
    const mCanvas = minimapRef.current;
    if (!mCanvas) return;
    const mCtx = mCanvas.getContext('2d');
    if (!mCtx) return;

    const mw = mCanvas.width;
    const mh = mCanvas.height;
    const worldW = GAME_CONFIG.world.width;
    const worldH = GAME_CONFIG.world.height;
    const scaleX = mw / worldW;
    const scaleY = mh / worldH;

    mCtx.clearRect(0, 0, mw, mh);

    // Background
    mCtx.fillStyle = '#1e3a1e';
    mCtx.fillRect(0, 0, mw, mh);

    // Pen
    const pen = GAME_CONFIG.pen;
    mCtx.beginPath();
    mCtx.arc(pen.centerX * scaleX, pen.centerY * scaleY, pen.radius * scaleX, 0, Math.PI * 2);
    mCtx.fillStyle = isWon ? 'rgba(74, 222, 128, 0.6)' : 'rgba(34, 197, 94, 0.35)';
    mCtx.fill();
    mCtx.strokeStyle = isWon ? '#4ade80' : '#22c55e';
    mCtx.lineWidth = 1.5;
    mCtx.stroke();

    // Sheep dots (white/yellow)
    for (const shp of gameEngine.state.sheep) {
      mCtx.beginPath();
      mCtx.arc(shp.x * scaleX, shp.y * scaleY, 3, 0, Math.PI * 2);
      mCtx.fillStyle = shp.isInPen ? '#4ade80' : '#ffffff';
      mCtx.fill();
    }

    // Shepherd dots (blue / cyan)
    for (const sh of gameEngine.state.shepherds) {
      mCtx.beginPath();
      mCtx.arc(sh.x * scaleX, sh.y * scaleY, 4, 0, Math.PI * 2);
      mCtx.fillStyle = sh.selected ? '#eab308' : '#38bdf8';
      mCtx.fill();
      if (sh.selected) {
        mCtx.strokeStyle = '#ffffff';
        mCtx.lineWidth = 1;
        mCtx.stroke();
      }
    }

    // Camera Viewport box
    const cam = gameEngine.camera;
    const vx = cam.x * scaleX;
    const vy = cam.y * scaleY;
    const vw = cam.viewportWidth * scaleX;
    const vh = cam.viewportHeight * scaleY;

    mCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    mCtx.lineWidth = 1.5;
    mCtx.strokeRect(vx, vy, vw, vh);
  };

  // Minimap click to pan camera
  const handleMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const scaleX = GAME_CONFIG.world.width / rect.width;
    const scaleY = GAME_CONFIG.world.height / rect.height;

    const targetWorldX = clickX * scaleX;
    const targetWorldY = clickY * scaleY;

    gameEngine.camera.x = targetWorldX - gameEngine.camera.viewportWidth / 2;
    gameEngine.camera.y = targetWorldY - gameEngine.camera.viewportHeight / 2;
    // Will clamp inside engine
    (gameEngine as unknown as { clampCamera: () => void }).clampCamera();
  };

  const handleApplyRepoUrl = () => {
    assetManager.setBaseUrl(repoUrlInput);
    setAssetStatuses({ ...assetManager.status });
  };

  const pennedCount = gameEngine.state.sheep.filter((s) => s.isInPen).length;
  const totalSheep = gameEngine.state.sheep.length;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900 select-none">
      {/* 1. Main Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
      />

      {/* 2. Left UI Column: Three toggle buttons C1, C2, C3 and Stop All button */}
      {/* Exact specs: Dark fill, grey border (yellow/gold border when toggled on), 100x70px, 22px font */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-3.5 z-20 pointer-events-auto">
        {[0, 1, 2].map((id) => {
          const sh = shepherds.find((s) => s.id === id);
          const isSelected = !!sh?.selected;
          const isMoving = !!sh?.isMoving;

          return (
            <button
              key={id}
              onClick={() => gameEngine.toggleShepherdSelection(id)}
              style={{
                width: '100px',
                height: '70px',
                fontSize: '22px',
              }}
              className={`relative rounded-xl font-bold flex flex-col items-center justify-center transition-all shadow-xl active:scale-95 border-2 ${
                isSelected
                  ? 'bg-neutral-900 text-yellow-400 border-yellow-400 ring-2 ring-yellow-400/40 shadow-yellow-500/20'
                  : 'bg-neutral-900/90 text-neutral-200 border-neutral-600 hover:border-neutral-400 hover:bg-neutral-800'
              }`}
            >
              <span>{`C${id + 1}`}</span>
              <span className="text-[11px] font-normal opacity-75">
                {isMoving ? 'Walking' : isSelected ? 'Selected' : 'Idle'}
              </span>
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-yellow-400 rounded-full animate-ping" />
              )}
            </button>
          );
        })}

        {/* Stop All Button */}
        <button
          onClick={() => gameEngine.stopAll()}
          style={{
            width: '100px',
            height: '70px',
            fontSize: '18px',
          }}
          className="rounded-xl font-bold flex flex-col items-center justify-center transition-all shadow-xl active:scale-95 border-2 bg-neutral-900/95 text-rose-300 border-rose-800/80 hover:bg-rose-950/40 hover:border-rose-500 hover:text-rose-200"
        >
          <span>Stop All</span>
          <span className="text-[10px] font-normal opacity-75">Halt movement</span>
        </button>

        {/* Quick Select All */}
        <button
          onClick={() => gameEngine.selectAllShepherds()}
          className="w-[100px] py-1.5 px-1 bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 hover:border-neutral-500 rounded-lg text-xs text-neutral-300 font-medium transition-all text-center"
        >
          Select All (3)
        </button>
      </div>

      {/* 3. Top HUD Bar */}
      <header className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
        {/* Title and herd status badge */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="bg-neutral-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-neutral-700 shadow-xl flex items-center gap-3">
            <span className="text-xl">🐑</span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Shepherd Strategy
              </div>
              <div className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                Penned:
                <span
                  className={`font-mono text-base px-2 py-0.5 rounded ${
                    pennedCount === totalSheep
                      ? 'bg-emerald-500/20 text-emerald-400 font-black'
                      : 'bg-neutral-800 text-yellow-300'
                  }`}
                >
                  {pennedCount} / {totalSheep}
                </span>
              </div>
            </div>
          </div>

          {/* Quick instructions pill */}
          <div className="hidden md:flex items-center gap-2 bg-neutral-900/75 backdrop-blur-md px-3.5 py-2 rounded-xl border border-neutral-800 text-xs text-neutral-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Drag map to pan • Click C1-C3 or shepherd to select • Tap pasture to herd</span>
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Tactical rings toggle */}
          <button
            onClick={() => setTacticalRings((v) => !v)}
            title="Toggle Shepherd Fear Radius Rings"
            className={`p-2.5 rounded-xl border transition-all backdrop-blur-md shadow-lg ${
              tacticalRings
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            <Eye className="w-5 h-5" />
          </button>

          {/* Audio toggle */}
          <button
            onClick={toggleAudio}
            title={soundEnabled ? 'Mute Audio' : 'Unmute Audio'}
            className={`p-2.5 rounded-xl border transition-all backdrop-blur-md shadow-lg ${
              soundEnabled
                ? 'bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                : 'bg-rose-500/20 border-rose-500 text-rose-300'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* Restart Button */}
          <button
            onClick={() => gameEngine.reset()}
            title="Restart Game"
            className="p-2.5 bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl backdrop-blur-md shadow-lg transition-all active:scale-95"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          {/* Help & Guide */}
          <button
            onClick={() => setShowHelp(true)}
            title="Herding Rules & Guide"
            className="p-2.5 bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl backdrop-blur-md shadow-lg transition-all"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* Asset / GitHub Settings */}
          <button
            onClick={() => setShowSettings(true)}
            title="Asset & GitHub Settings"
            className="p-2.5 bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl backdrop-blur-md shadow-lg transition-all"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 4. Win Overlay with Restart Button */}
      {isWon && (
        <div className="absolute top-[62%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto flex flex-col items-center gap-3">
          <button
            onClick={() => gameEngine.reset()}
            className="px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xl rounded-2xl shadow-2xl hover:shadow-emerald-500/50 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3 border-2 border-emerald-300"
          >
            <RotateCcw className="w-6 h-6 stroke-[2.5]" />
            Play Again / Restart
          </button>
          <div className="text-xs text-emerald-200/90 font-medium bg-neutral-900/80 px-4 py-1.5 rounded-full border border-emerald-500/30 backdrop-blur-sm">
            Press to scatter the flock and test new herding tactics!
          </div>
        </div>
      )}

      {/* 5. Bottom-Right Radar / Minimap */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-auto flex flex-col items-end gap-1.5">
        <div className="bg-neutral-900/90 backdrop-blur-md p-1.5 rounded-xl border border-neutral-700 shadow-2xl">
          <div className="text-[10px] font-bold text-neutral-400 px-1 pb-1 flex items-center justify-between">
            <span>PASTURE RADAR (2212×931)</span>
            <span className="text-neutral-500">Click to Pan</span>
          </div>
          <canvas
            ref={minimapRef}
            width={180}
            height={76}
            onClick={handleMinimapClick}
            className="rounded border border-neutral-800 cursor-pointer bg-neutral-950"
          />
        </div>
      </div>

      {/* 6. Settings & Asset Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-yellow-400" />
                <h3 className="text-lg font-bold text-white">Game & Asset Settings</h3>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 py-4">
              {/* GitHub Repo / Raw Assets URL Input */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                  GitHub Repository / Asset URL
                </label>
                <p className="text-xs text-neutral-400 mb-2">
                  Paste your GitHub repo URL (e.g.{' '}
                  <code className="text-yellow-300">https://github.com/owner/shepherd-game</code> or
                  raw URL). Assets from <code className="text-neutral-300">resources/</code> will be
                  loaded dynamically.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repoUrlInput}
                    onChange={(e) => setRepoUrlInput(e.target.value)}
                    placeholder="https://raw.githubusercontent.com/user/repo/main"
                    className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-yellow-400 font-mono"
                  />
                  <button
                    onClick={handleApplyRepoUrl}
                    className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-bold text-sm rounded-xl transition-all"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Asset Loading Status Checklist */}
              <div>
                <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Asset Status & Fallbacks
                </h4>
                <div className="space-y-1.5 bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-xs font-mono">
                  {[
                    { key: 'dummyMap', label: 'resources/images/dummy_map.png' },
                    { key: 'shepherdIdle', label: 'resources/shepherd/isometric_character_idle.png' },
                    { key: 'shepherdWalk', label: 'resources/shepherd/isometric_character_walk.png' },
                    { key: 'sheepWalk', label: 'resources/sheep/sheep_walk.png' },
                    { key: 'sheepEat', label: 'resources/sheep/sheep_eat.png' },
                    { key: 'ramWalk', label: 'resources/sheep/ram_walk.png' },
                    { key: 'ramEat', label: 'resources/sheep/ram%20eat.png' },
                  ].map(({ key, label }) => {
                    const st = assetStatuses[key] || assetManager.status[key] || 'loading';
                    const isOk = st === 'loaded';
                    return (
                      <div key={key} className="flex items-center justify-between py-0.5">
                        <span className="truncate pr-2 text-neutral-300">{label}</span>
                        <span
                          className={`flex items-center gap-1 shrink-0 ${
                            isOk ? 'text-emerald-400' : 'text-neutral-400'
                          }`}
                        >
                          {isOk ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Loaded
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Procedural
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-neutral-400 mt-2">
                  * When image files are unavailable, the game automatically uses its built-in
                  high-fidelity procedural pasture and sprites so you can play immediately.
                </p>
              </div>

              {/* Rendering Mode Toggles */}
              <div className="pt-2 border-t border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-neutral-200">
                      Minimalist Coloured Circles
                    </div>
                    <div className="text-xs text-neutral-400">
                      Force simple flat circles instead of character artwork
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={minimalCircles}
                    onChange={(e) => setMinimalCircles(e.target.checked)}
                    className="w-5 h-5 rounded border-neutral-700 text-yellow-400 focus:ring-yellow-400 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-neutral-200">
                      Tactical Fear Range Rings
                    </div>
                    <div className="text-xs text-neutral-400">
                      Show 200px fear circle around each shepherd
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={tacticalRings}
                    onChange={(e) => setTacticalRings(e.target.checked)}
                    className="w-5 h-5 rounded border-neutral-700 text-yellow-400 focus:ring-yellow-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-sm font-semibold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Help & Rules Guide Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">How to Play Shepherd</h3>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 py-4 text-sm leading-relaxed text-neutral-300">
              <div className="bg-emerald-950/40 border border-emerald-500/30 p-3.5 rounded-xl">
                <h4 className="font-bold text-emerald-300 flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4" /> Objective
                </h4>
                <p>
                  Drive all <strong>4 sheep</strong> into the circular green pen located on the
                  right side of the pasture.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1">1. Shepherd Controls</h4>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>
                    <strong>Select/Deselect:</strong> Click the C1, C2, C3 buttons on the left or tap
                    directly on a shepherd (within 32px). Multi-selection is supported!
                  </li>
                  <li>
                    <strong>Move:</strong> Click anywhere on the ground. Selected shepherds will
                    advance toward that point maintaining their relative formation.
                  </li>
                  <li>
                    <strong>Stop All:</strong> Press the red "Stop All" button to instantly cancel all
                    movement orders.
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1">2. Sheep Flocking & Fear AI</h4>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>
                    <strong>Flee (&lt;200px):</strong> Sheep sense nearby shepherds within 200px and
                    bolt away. The closer the shepherd, the stronger the flee force!
                  </li>
                  <li>
                    <strong>Herd Repulsion (&lt;50px):</strong> Sheep don't like overcrowding and push
                    away from each other.
                  </li>
                  <li>
                    <strong>Herd Comfort (50px - 100px):</strong> The ideal spacing where sheep feel
                    calm.
                  </li>
                  <li>
                    <strong>Herd Attraction (100px - 200px):</strong> Sheep feel lonely and steer back
                    toward their flock mates.
                  </li>
                  <li>
                    <strong>Grazing:</strong> When peaceful, sheep stop and munch on grass.
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1">3. Camera & Pan</h4>
                <p className="text-xs">
                  Drag anywhere on the pasture (&gt;5px movement) or click the mini-radar in the
                  bottom right to pan across the 2212×931 world.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setShowHelp(false)}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-xl text-sm transition-all"
              >
                Got It, Let's Herd!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
