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
  Sparkles,
  Upload,
  FolderOpen,
  Maximize,
  Minimize,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Menu,
  X,
  ArrowRight,
  Layers,
  Trophy,
  Timer,
  Star,
  Award,
  Flame,
} from 'lucide-react';
import { gameEngine } from './game/engine';
import { GameState, ShepherdEntity, StageId } from './game/types';
import { GAME_CONFIG } from './game/config';
import { assetManager } from './game/assets';
import { gameRenderer } from './game/renderer';
import { sounds } from './game/audio';
import {
  formatTime,
  getScoresForStage,
  recordStageScore,
  resetStageScores,
  StageScoreEntry,
} from './game/scores';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reactive game state
  const [gameState, setGameState] = useState<GameState>(() => gameEngine.state);
  const [shepherds, setShepherds] = useState<ShepherdEntity[]>(() => gameEngine.state.shepherds);
  const [isWon, setIsWon] = useState<boolean>(() => gameEngine.state.isWon);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [tacticalRings, setTacticalRings] = useState<boolean>(false);
  const [minimalCircles, setMinimalCircles] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(() => gameEngine.camera.zoom);

  // Leaderboard & Live Timer state
  const [showLeaderboardModal, setShowLeaderboardModal] = useState<boolean>(false);
  const [leaderboardStage, setLeaderboardStage] = useState<StageId>(() => gameEngine.state.stage || 1);
  const [leaderboardScores, setLeaderboardScores] = useState<StageScoreEntry[]>(() => getScoresForStage(1));
  const [lastWinResult, setLastWinResult] = useState<{
    entry: StageScoreEntry;
    isTopScore: boolean;
    rank: number;
    totalEntries: number;
  } | null>(null);
  const hasRecordedWinRef = useRef<boolean>(false);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState<number>(0);

  // Fullscreen & Orientation state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerHeight > window.innerWidth;
    }
    return false;
  });
  const [dismissPortraitWarning, setDismissPortraitWarning] = useState<boolean>(false);
  const [showAndroidModal, setShowAndroidModal] = useState<boolean>(false);
  const [showMenuModal, setShowMenuModal] = useState<boolean>(false);

  // Settings & Asset Modal
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [repoUrlInput, setRepoUrlInput] = useState<string>(() => assetManager.baseUrl);
  const [assetStatuses, setAssetStatuses] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Periodic state refresh
  const [, setTick] = useState<number>(0);

  // Orientation, Fullscreen, and Zoom sync listeners
  useEffect(() => {
    const checkOrientation = () => {
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      checkOrientation();
    };

    gameEngine.onZoomChange = (z) => {
      setZoomLevel(z);
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).addEventListener?.('webkitfullscreenchange', handleFullscreenChange);

    checkOrientation();
    const t = setTimeout(checkOrientation, 300);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).removeEventListener?.('webkitfullscreenchange', handleFullscreenChange);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    gameEngine.attach(canvas);

    gameEngine.onStateChange = (updatedShepherds, won, updatedState) => {
      setShepherds(updatedShepherds);
      setIsWon(won);
      setGameState({ ...updatedState });
      setAssetStatuses({ ...assetManager.status });

      if (won && !hasRecordedWinRef.current) {
        hasRecordedWinRef.current = true;
        const elapsed =
          updatedState.completionTimeSeconds ||
          (updatedState.stageStartTime
            ? Math.max(0.1, (Date.now() - updatedState.stageStartTime) / 1000)
            : 0.1);
        setCurrentTimeSeconds(elapsed);
        const winRes = recordStageScore({
          stage: updatedState.stage,
          timeSeconds: elapsed,
          commandCount: updatedState.commandCount,
          shepherdCount: updatedState.stage === 2 ? 2 : updatedState.shepherds.length,
          playerName: 'You',
        });
        setLastWinResult(winRes);
        setLeaderboardScores(getScoresForStage(updatedState.stage));
      }
    };

    assetManager.onAssetsUpdated = () => {
      setAssetStatuses({ ...assetManager.status });
    };

    // Periodic state refresh for sheep count & live timer
    const interval = setInterval(() => {
      setTick((t) => (t + 1) % 1000);
      const st = gameEngine.state;
      setGameState({ ...st });
      setShepherds([...st.shepherds]);
      if (st.isWon) {
        setCurrentTimeSeconds(
          st.completionTimeSeconds ??
            (st.stageStartTime ? Math.max(0.1, (Date.now() - st.stageStartTime) / 1000) : 0.1)
        );
      } else if (!st.stageStartTime) {
        setCurrentTimeSeconds(0);
      } else {
        setCurrentTimeSeconds(Math.max(0, (Date.now() - st.stageStartTime) / 1000));
      }
    }, 100);

    return () => {
      clearInterval(interval);
      gameEngine.detach();
    };
  }, []);

  // Global drag & drop handler for sprite images
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        setIsDraggingOver(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const count = await assetManager.loadUserUploadedFiles(e.dataTransfer.files);
        if (count > 0) {
          showToast(`Successfully imported ${count} animation spritesheet${count > 1 ? 's' : ''}!`);
        } else {
          showToast('No matching sprite files found. Expected ram/sheep/isometric files.');
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Sync tactical mode and minimal mode
  useEffect(() => {
    gameRenderer.showTacticalRings = tacticalRings;
  }, [tacticalRings]);

  useEffect(() => {
    gameRenderer.useMinimalCircles = minimalCircles;
  }, [minimalCircles]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Audio mute/unmute
  const toggleAudio = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sounds.enabled = next;
  };

  // Switch stage
  const handleSelectStage = (stageId: StageId) => {
    hasRecordedWinRef.current = false;
    setLastWinResult(null);
    gameEngine.setStage(stageId);
    setGameState({ ...gameEngine.state });
    setShepherds([...gameEngine.state.shepherds]);
    setCurrentTimeSeconds(0);
    setLeaderboardStage(stageId);
    setLeaderboardScores(getScoresForStage(stageId));
    showToast(
      stageId === 1
        ? 'Switched to Stage 1: The Meadow (3 Shepherds)'
        : 'Switched to Stage 2: River Crossing (2 Shepherds)!'
    );
  };

  const handleRestartStage = (stageId: StageId) => {
    hasRecordedWinRef.current = false;
    setLastWinResult(null);
    gameEngine.reset(stageId);
    setGameState({ ...gameEngine.state });
    setShepherds([...gameEngine.state.shepherds]);
    setCurrentTimeSeconds(0);
    showToast(`Restarted Stage ${stageId}`);
  };

  const handleSwitchLeaderboardStage = (stg: StageId) => {
    setLeaderboardStage(stg);
    setLeaderboardScores(getScoresForStage(stg));
  };

  const handleResetLeaderboard = () => {
    const defaults = resetStageScores(leaderboardStage);
    setLeaderboardScores(defaults);
    showToast(`Reset Stage ${leaderboardStage} leaderboard to default records.`);
  };

  // Force screen into landscape orientation + fullscreen
  const forceLandscapeMode = async () => {
    try {
      if (!document.fullscreenElement) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const elem = document.documentElement as any;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (screen.orientation && (screen.orientation as any).lock) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (screen.orientation as any).lock('landscape');
        } catch {
          // May require direct gesture
        }
      }
    } catch {
      // Ignore
    }
    setDismissPortraitWarning(true);
  };

  // Fullscreen toggle
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const elem = document.documentElement as any;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (screen.orientation && (screen.orientation as any).lock) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (screen.orientation as any).lock('landscape');
          } catch {
            // Ignore
          }
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch {
      // Ignore
    }
  };

  const handleApplyRepoUrl = () => {
    assetManager.setBaseUrl(repoUrlInput);
    showToast('Updated custom GitHub repo asset URL! Reloading textures...');
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const count = await assetManager.loadUserUploadedFiles(e.target.files);
      if (count > 0) {
        showToast(`Imported ${count} sprite sheet(s) into memory!`);
      } else {
        showToast('No recognized sprites found. Check filename (ram, sheep, character).');
      }
    }
  };

  // Active target calculations
  const totalSheep = gameState.sheep.length;
  const currentStagePens = gameState.stage === 1 ? GAME_CONFIG.stage1.pens : GAME_CONFIG.stage2.pens;
  const activePenDef = currentStagePens[gameState.activePenIndex] || currentStagePens[0];

  // Active shepherds for current stage: Stage 1 has 3 (C1, C2, C3); Stage 2 strictly has 2 (C1, C2)
  const activeShepherds =
    gameState.stage === 2
      ? (shepherds.length ? shepherds : gameState.shepherds).filter((s) => s.id < 2)
      : (shepherds.length ? shepherds : gameState.shepherds);

  const sheepInActivePenCount = gameState.sheep.filter(
    (shp) => Math.hypot(shp.x - activePenDef.centerX, shp.y - activePenDef.centerY) <= activePenDef.radius
  ).length;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-neutral-950 font-sans select-none touch-none">
      {/* Hidden File Input for Sprite Loading */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Main Full-Window Game Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair active:cursor-grabbing block"
      />

      {/* 1. Android / Mobile Portrait Overlay: Prompt for Landscape Mode */}
      {isPortrait && !dismissPortraitWarning && (
        <div className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white animate-in fade-in duration-300">
          <div className="relative mb-6">
            <Smartphone className="w-16 h-16 text-yellow-400 animate-pulse" />
            <div className="absolute -bottom-1 -right-1 text-2xl animate-spin">🔄</div>
          </div>
          <h2 className="text-xl sm:text-2xl font-black mb-2 text-yellow-400">
            Rotate Device to Horizontal (Landscape)
          </h2>
          <p className="text-neutral-300 text-xs sm:text-sm max-w-xs mb-6">
            Shepherd is designed for panoramic landscape gameplay across the 2212×931 meadow.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <button
              onClick={forceLandscapeMode}
              className="w-full py-3 px-4 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-black text-sm rounded-2xl shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Maximize className="w-4 h-4" />
              Force Landscape & Fullscreen
            </button>
            <button
              onClick={() => setDismissPortraitWarning(true)}
              className="w-full py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded-xl transition-all"
            >
              Continue in Portrait Anyway
            </button>
          </div>
        </div>
      )}

      {/* 2. Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-emerald-950/85 border-4 border-dashed border-emerald-400 backdrop-blur-sm flex flex-col items-center justify-center p-6 pointer-events-none">
          <Upload className="w-16 h-16 text-emerald-300 mb-3 animate-bounce" />
          <h2 className="text-2xl font-black text-white mb-2">Drop Animation Sprites Here</h2>
          <p className="text-emerald-200 text-xs sm:text-sm max-w-md text-center">
            Drop <code className="text-white font-bold">ram eat.png</code>,{' '}
            <code className="text-white font-bold">ram_walk.png</code>,{' '}
            <code className="text-white font-bold">sheep_walk.png</code>,{' '}
            <code className="text-white font-bold">sheep_eat.png</code>, or character sheets.
          </p>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-neutral-900/95 border border-emerald-500 text-emerald-300 px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-md font-medium text-xs sm:text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200 max-w-[90vw]">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* 3. TOP-CENTER STAGE & OBJECTIVE BAR (Completely clear of C1/C2 buttons) */}
      <div
        style={{ top: 'max(0.4rem, env(safe-area-inset-top))' }}
        className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex flex-wrap sm:flex-nowrap items-center justify-center gap-1.5 sm:gap-2 max-w-[95vw]"
      >
        {/* Stage 1 / Stage 2 Selector Tabs */}
        <div className="bg-neutral-900/95 backdrop-blur-md p-1 rounded-2xl border border-neutral-700 shadow-2xl flex items-center gap-1">
          <button
            onClick={() => handleSelectStage(1)}
            className={`px-2.5 py-1 sm:px-3 sm:py-1 rounded-xl text-xs font-bold transition-all ${
              gameState.stage === 1
                ? 'bg-emerald-500 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            Stage 1 (3 Shepherds)
          </button>
          <button
            onClick={() => handleSelectStage(2)}
            className={`px-2.5 py-1 sm:px-3 sm:py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
              gameState.stage === 2
                ? 'bg-amber-400 text-neutral-950 shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <span>Stage 2 (2 Shepherds)</span>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse hidden sm:inline-block" />
          </button>
        </div>

        {/* Live Stage Digital Timer Badge */}
        <div className="bg-neutral-900/95 backdrop-blur-md px-2.5 py-1 sm:px-3 sm:py-1 rounded-2xl border border-neutral-700 shadow-2xl flex items-center gap-1.5 text-xs font-mono font-bold">
          <Timer
            className={`w-3.5 h-3.5 ${
              gameState.isWon
                ? 'text-emerald-400'
                : !gameState.timerStarted
                ? 'text-neutral-400'
                : 'text-amber-400 animate-pulse'
            }`}
          />
          <span
            className={
              gameState.isWon
                ? 'text-emerald-300 font-black'
                : !gameState.timerStarted
                ? 'text-neutral-300 font-semibold'
                : 'text-yellow-300'
            }
          >
            {formatTime(currentTimeSeconds)}
          </span>
          {!gameState.timerStarted && !gameState.isWon && (
            <span className="text-[10px] text-neutral-400 font-sans hidden sm:inline font-normal">
              (click to start)
            </span>
          )}
        </div>

        {/* Stage Status & Target Count */}
        <div className="bg-neutral-900/95 backdrop-blur-md px-2.5 py-1 sm:px-3.5 sm:py-1 rounded-2xl border border-neutral-700 shadow-2xl flex items-center gap-2">
          {gameState.stage === 1 ? (
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-neutral-400">Penned:</span>
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded-md ${
                  sheepInActivePenCount === totalSheep
                    ? 'bg-emerald-500/25 text-emerald-300 font-black animate-pulse'
                    : 'bg-neutral-800 text-yellow-300 font-bold'
                }`}
              >
                {sheepInActivePenCount} / {totalSheep}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              {/* 3 Step Sequence indicators */}
              <div className="flex items-center gap-1 font-bold">
                {[0, 1, 2].map((idx) => {
                  const isDone = gameState.completedPens[idx];
                  const isCurrent = !isDone && gameState.activePenIndex === idx;

                  return (
                    <span
                      key={idx}
                      className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono flex items-center gap-0.5 ${
                        isDone
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/50'
                          : isCurrent
                          ? 'bg-amber-400 text-neutral-950 font-black animate-pulse'
                          : 'bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      {isDone ? `✓${idx + 1}` : `P${idx + 1}`}
                    </span>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 text-[11px] font-semibold text-neutral-300">
                <span className="hidden sm:inline">Target:</span>
                <span className="font-mono text-yellow-300 bg-neutral-800 px-1.5 py-0.5 rounded">
                  {sheepInActivePenCount}/{totalSheep}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* High Scores Button */}
        <button
          onClick={() => {
            setLeaderboardStage(gameState.stage);
            setLeaderboardScores(getScoresForStage(gameState.stage));
            setShowLeaderboardModal(true);
          }}
          title="View Stage High Scores & Records"
          className="bg-neutral-900/95 hover:bg-neutral-800 text-yellow-400 hover:text-yellow-300 border border-neutral-700 hover:border-yellow-500/50 px-2.5 py-1 sm:px-3 sm:py-1 rounded-2xl shadow-2xl flex items-center gap-1 text-xs font-bold transition-all active:scale-95"
        >
          <Trophy className="w-3.5 h-3.5 text-yellow-400" />
          <span className="hidden sm:inline">Scores</span>
        </button>
      </div>

      {/* 4. FAR LEFT DOCKED COLUMN: Shepherd Controls (C1 & C2 in Stage 2, C1, C2, C3 in Stage 1) */}
      {/* Docked flush against the absolute far left screen edge so it does NOT cover the gameplay meadow! */}
      <div
        style={{ left: 'max(0px, env(safe-area-inset-left))' }}
        className="absolute top-1/2 -translate-y-1/2 left-0 flex flex-col gap-1.5 z-20 pointer-events-auto max-h-[85vh] justify-center"
      >
        {activeShepherds.map((sh) => {
          const id = sh.id;
          const isSelected = !!sh.selected;

          return (
            <button
              key={id}
              onClick={() => gameEngine.toggleShepherdSelection(id)}
              className={`relative rounded-r-xl rounded-l-none border-l-0 font-bold flex flex-col items-center justify-center transition-all shadow-xl active:scale-95 border-2 
                w-11 sm:w-13 md:w-16 
                h-9 sm:h-11 md:h-13 
                text-sm sm:text-base md:text-lg ${
                isSelected
                  ? 'bg-neutral-900 text-yellow-400 border-yellow-400 shadow-yellow-500/20'
                  : 'bg-neutral-950/90 text-neutral-200 border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900'
              }`}
            >
              <span>{`C${id + 1}`}</span>
              {isSelected && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
              )}
            </button>
          );
        })}

        {/* Stop All Button - Docked far left */}
        <button
          onClick={() => gameEngine.stopAll()}
          className="rounded-r-xl rounded-l-none border-l-0 font-bold flex flex-col items-center justify-center transition-all shadow-xl active:scale-95 border-2 bg-neutral-950/95 text-rose-300 border-rose-800/80 hover:bg-rose-950/40 hover:border-rose-500 hover:text-rose-200
            w-11 sm:w-13 md:w-16 
            h-9 sm:h-11 md:h-13 
            text-xs sm:text-xs md:text-sm"
        >
          <span>Stop</span>
        </button>

        {/* Select All Button - Docked far left */}
        <button
          onClick={() => gameEngine.selectAllShepherds()}
          className="rounded-r-lg rounded-l-none border-l-0 py-1 bg-neutral-950/80 hover:bg-neutral-900 border border-neutral-700 hover:border-neutral-500 text-[10px] md:text-xs text-neutral-300 font-medium transition-all text-center
            w-11 sm:w-13 md:w-16"
        >
          All
        </button>
      </div>

      {/* 5. TOP RIGHT ACTION CONTROLS: Streamlined to 3 clean icons */}
      <div
        style={{
          top: 'max(0.4rem, env(safe-area-inset-top))',
          right: 'max(0.5rem, env(safe-area-inset-right))',
        }}
        className="absolute flex items-center gap-1.5 sm:gap-2 pointer-events-auto z-20"
      >
        {/* Audio Mute/Unmute */}
        <button
          onClick={toggleAudio}
          title={soundEnabled ? 'Mute Audio' : 'Unmute Audio'}
          className={`p-2 rounded-xl border transition-all backdrop-blur-md shadow-lg ${
            soundEnabled
              ? 'bg-neutral-900/85 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white'
              : 'bg-rose-500/20 border-rose-500 text-rose-300'
          }`}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 md:w-5 md:h-5" /> : <VolumeX className="w-4 h-4 md:w-5 md:h-5" />}
        </button>

        {/* Instant Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className={`p-2 rounded-xl border transition-all backdrop-blur-md shadow-lg ${
            isFullscreen
              ? 'bg-yellow-500/25 border-yellow-400 text-yellow-300'
              : 'bg-neutral-900/85 border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white'
          }`}
        >
          {isFullscreen ? <Minimize className="w-4 h-4 md:w-5 md:h-5" /> : <Maximize className="w-4 h-4 md:w-5 md:h-5" />}
        </button>

        {/* Clean Unified Menu Button */}
        <button
          onClick={() => setShowMenuModal(true)}
          title="Game Menu & Settings"
          className="p-2 bg-neutral-900/85 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white rounded-xl backdrop-blur-md shadow-lg transition-all flex items-center gap-1.5"
        >
          <Menu className="w-4 h-4 md:w-5 md:h-5" />
          <span className="hidden sm:inline text-xs font-semibold">Menu</span>
        </button>
      </div>

      {/* 6. MEADOW ZOOM CONTROLS (+ / - / Reset) (Docked at bottom-right) */}
      <div
        style={{
          bottom: 'max(0.6rem, env(safe-area-inset-bottom))',
          right: 'max(0.6rem, env(safe-area-inset-right))',
        }}
        className="absolute z-20 pointer-events-auto flex items-center gap-1 bg-neutral-900/90 backdrop-blur-md p-1 rounded-xl border border-neutral-700 shadow-xl"
      >
        {/* Zoom Out Button */}
        <button
          onClick={() => gameEngine.zoomOut()}
          title="Zoom Out Meadow"
          className="p-1.5 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-lg transition-all active:scale-95"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Zoom Percentage / Reset to 100% */}
        <button
          onClick={() => gameEngine.setZoom(1.0)}
          title="Reset Zoom to 100%"
          className="px-2 py-0.5 text-[11px] font-mono font-bold text-yellow-300 hover:bg-neutral-800 rounded-md transition-all"
        >
          {Math.round(zoomLevel * 100)}%
        </button>

        {/* Zoom In Button */}
        <button
          onClick={() => gameEngine.zoomIn()}
          title="Zoom In Meadow"
          className="p-1.5 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-lg transition-all active:scale-95"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* 7. Victory Overlay with Score Summary & Actions */}
      {isWon && (
        <div className="absolute inset-0 z-30 pointer-events-auto flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-neutral-900/95 border-2 border-emerald-500/80 rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl flex flex-col items-center text-center backdrop-blur-xl">
            {/* Stars */}
            <div className="flex items-center gap-1.5 mb-2">
              {[1, 2, 3].map((starIndex) => {
                const earned = (lastWinResult?.entry.stars || 3) >= starIndex;
                return (
                  <Star
                    key={starIndex}
                    className={`w-7 h-7 sm:w-8 sm:h-8 ${
                      earned
                        ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)] animate-bounce'
                        : 'text-neutral-700'
                    }`}
                  />
                );
              })}
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white mb-1">
              {gameState.stage === 1 ? 'STAGE 1 COMPLETE!' : 'STAGE 2 MASTERED!'}
            </h2>
            <p className="text-xs sm:text-sm text-emerald-300 font-medium mb-3">
              {gameState.stage === 1
                ? 'All sheep penned safely in the meadow!'
                : 'River bridged & all 3 pens cleared with 2 shepherds!'}
            </p>

            {/* High Score / Record Banner */}
            {lastWinResult?.isTopScore ? (
              <div className="px-3.5 py-1 rounded-full bg-amber-400 text-neutral-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg mb-3 animate-pulse">
                <Trophy className="w-4 h-4" />
                <span>NEW HIGH SCORE RECORD! #1</span>
              </div>
            ) : lastWinResult ? (
              <div className="px-3 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-xs font-bold mb-3">
                Leaderboard Rank: #{lastWinResult.rank} of {lastWinResult.totalEntries}
              </div>
            ) : null}

            {/* Score & Time Display */}
            <div className="grid grid-cols-2 gap-2.5 w-full bg-neutral-950/80 p-3 rounded-2xl border border-neutral-800 mb-4">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                  Stage Score
                </span>
                <span className="text-xl sm:text-2xl font-black text-yellow-400 font-mono">
                  {(lastWinResult?.entry.score ?? 12500).toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                  Time Taken
                </span>
                <span className="text-xl sm:text-2xl font-black text-white font-mono flex items-center gap-1">
                  <Timer className="w-4 h-4 text-amber-400 inline" />
                  {formatTime(lastWinResult?.entry.timeSeconds ?? currentTimeSeconds)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 w-full">
              {gameState.stage === 1 ? (
                <button
                  onClick={() => handleSelectStage(2)}
                  className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm rounded-2xl shadow-xl hover:shadow-amber-500/40 transition-all flex items-center justify-center gap-2 border-2 border-amber-300 active:scale-95"
                >
                  <span>Play Stage 2: River Crossing (2 Shepherds)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => handleRestartStage(2)}
                  className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-sm rounded-2xl shadow-xl hover:shadow-emerald-500/40 transition-all flex items-center justify-center gap-2 border-2 border-emerald-300 active:scale-95"
                >
                  <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                  <span>Replay Stage 2 (Beat Your Time!)</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setLeaderboardStage(gameState.stage);
                    setLeaderboardScores(getScoresForStage(gameState.stage));
                    setShowLeaderboardModal(true);
                  }}
                  className="py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-yellow-300 font-bold text-xs sm:text-sm rounded-xl border border-yellow-500/40 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <span>Score Table</span>
                </button>

                <button
                  onClick={() => handleRestartStage(gameState.stage)}
                  className="py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs sm:text-sm rounded-xl border border-neutral-700 flex items-center justify-center gap-1.5 transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restart</span>
                </button>
              </div>

              {gameState.stage === 2 && (
                <button
                  onClick={() => handleSelectStage(1)}
                  className="text-xs text-neutral-400 hover:text-white py-1 transition-all"
                >
                  ← Return to Stage 1
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 8. HIGH SCORE TABLE MODAL */}
      {showLeaderboardModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl text-neutral-200 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-400" />
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">Stage Score Table</h3>
                  <p className="text-[11px] text-neutral-400">High scores & best completion times</p>
                </div>
              </div>
              <button
                onClick={() => setShowLeaderboardModal(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stage Selector Tabs */}
            <div className="grid grid-cols-2 gap-2 my-3">
              <button
                onClick={() => handleSwitchLeaderboardStage(1)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-0.5 ${
                  leaderboardStage === 1
                    ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-md'
                    : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:bg-neutral-800'
                }`}
              >
                <span>Stage 1: Meadow</span>
                <span
                  className={`text-[10px] ${
                    leaderboardStage === 1 ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
                  }`}
                >
                  3 Shepherds
                </span>
              </button>

              <button
                onClick={() => handleSwitchLeaderboardStage(2)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-0.5 ${
                  leaderboardStage === 2
                    ? 'bg-amber-400 text-neutral-950 border-amber-300 shadow-md'
                    : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:bg-neutral-800'
                }`}
              >
                <span>Stage 2: River Crossing</span>
                <span
                  className={`text-[10px] ${
                    leaderboardStage === 2 ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
                  }`}
                >
                  2 Shepherds Only
                </span>
              </button>
            </div>

            {/* Quick summary chips */}
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              <div className="bg-neutral-950/80 p-2 rounded-xl border border-neutral-800">
                <div className="text-[10px] text-neutral-500 font-semibold">RECORD SCORE</div>
                <div className="text-xs sm:text-sm font-bold text-yellow-400 font-mono">
                  {leaderboardScores[0]?.score.toLocaleString() || '-'}
                </div>
              </div>
              <div className="bg-neutral-950/80 p-2 rounded-xl border border-neutral-800">
                <div className="text-[10px] text-neutral-500 font-semibold">FASTEST TIME</div>
                <div className="text-xs sm:text-sm font-bold text-white font-mono">
                  {leaderboardScores[0] ? formatTime(leaderboardScores[0].timeSeconds) : '-'}
                </div>
              </div>
              <div className="bg-neutral-950/80 p-2 rounded-xl border border-neutral-800">
                <div className="text-[10px] text-neutral-500 font-semibold">SHEPHERDS</div>
                <div className="text-xs sm:text-sm font-bold text-emerald-400">
                  {leaderboardStage === 2 ? '2 Shepherds' : '3 Shepherds'}
                </div>
              </div>
            </div>

            {/* Score Table List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-[200px] max-h-[320px]">
              {leaderboardScores.map((item, index) => {
                const rank = index + 1;
                const isFirst = rank === 1;
                const isSecond = rank === 2;
                const isThird = rank === 3;

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                      item.isPlayer
                        ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md'
                        : isFirst
                        ? 'bg-amber-950/30 border-amber-500/40'
                        : 'bg-neutral-950/60 border-neutral-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Rank badge */}
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                          isFirst
                            ? 'bg-amber-400 text-neutral-950 shadow'
                            : isSecond
                            ? 'bg-slate-300 text-neutral-950'
                            : isThird
                            ? 'bg-amber-700 text-white'
                            : 'bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {isFirst ? '🥇' : isSecond ? '🥈' : isThird ? '🥉' : rank}
                      </span>

                      {/* Name & details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold text-white truncate">
                            {item.playerName}
                          </span>
                          {item.isPlayer && (
                            <span className="text-[9px] bg-emerald-500 text-neutral-950 px-1.5 py-0.2 rounded font-black shrink-0">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-400 flex items-center gap-2">
                          <span>{item.date}</span>
                          <span>•</span>
                          <span>{item.shepherdCount} Shepherds</span>
                        </div>
                      </div>
                    </div>

                    {/* Score & Time & Stars */}
                    <div className="text-right shrink-0">
                      <div className="text-xs sm:text-sm font-mono font-black text-yellow-400">
                        {item.score.toLocaleString()}
                      </div>
                      <div className="text-[11px] font-mono text-neutral-300 flex items-center justify-end gap-1.5">
                        <span>{formatTime(item.timeSeconds)}</span>
                        <span className="text-amber-400 text-[10px]">
                          {'★'.repeat(item.stars)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 mt-2 border-t border-neutral-800 flex items-center justify-between gap-2">
              <button
                onClick={handleResetLeaderboard}
                className="text-[11px] text-neutral-400 hover:text-rose-400 py-1 transition-all"
              >
                Reset Scores
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    handleSelectStage(leaderboardStage);
                    setShowLeaderboardModal(false);
                  }}
                  className="px-3.5 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 rounded-xl text-xs font-bold transition-all"
                >
                  Play Stage {leaderboardStage}
                </button>
                <button
                  onClick={() => setShowLeaderboardModal(false)}
                  className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 rounded-xl text-xs font-semibold transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. UNIFIED MENU DRAWER / MODAL */}
      {showMenuModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-3xl max-w-md w-full p-5 shadow-2xl text-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-yellow-400" />
                <h3 className="text-base sm:text-lg font-bold text-white">Shepherd Menu</h3>
              </div>
              <button
                onClick={() => setShowMenuModal(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 py-3">
              {/* Stage Switcher */}
              <div className="bg-neutral-950 p-3 rounded-2xl border border-neutral-800">
                <div className="flex items-center gap-2 text-xs font-bold text-white mb-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>Select Game Stage</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      handleSelectStage(1);
                      setShowMenuModal(false);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      gameState.stage === 1
                        ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-lg'
                        : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:bg-neutral-800'
                    }`}
                  >
                    Stage 1: Meadow
                  </button>
                  <button
                    onClick={() => {
                      handleSelectStage(2);
                      setShowMenuModal(false);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      gameState.stage === 2
                        ? 'bg-amber-400 text-neutral-950 border-amber-300 shadow-lg'
                        : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:bg-neutral-800'
                    }`}
                  >
                    Stage 2: River & 3 Pens
                  </button>
                </div>
              </div>

              {/* Restart Game */}
              <button
                onClick={() => {
                  handleRestartStage(gameState.stage);
                  setShowMenuModal(false);
                }}
                className="w-full py-2.5 px-3.5 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-100 rounded-xl text-sm font-semibold flex items-center justify-between transition-all"
              >
                <span className="flex items-center gap-2.5">
                  <RotateCcw className="w-4 h-4 text-emerald-400" />
                  <span>Restart Current Stage</span>
                </span>
                <span className="text-[11px] text-neutral-400">Reset</span>
              </button>

              {/* High Scores & Leaderboard Button in Menu */}
              <button
                onClick={() => {
                  setShowMenuModal(false);
                  setLeaderboardStage(gameState.stage);
                  setLeaderboardScores(getScoresForStage(gameState.stage));
                  setShowLeaderboardModal(true);
                }}
                className="w-full py-2.5 px-3.5 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/40 text-yellow-300 rounded-xl text-sm font-semibold flex items-center justify-between transition-all"
              >
                <span className="flex items-center gap-2.5">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <span>Stage High Scores & Records</span>
                </span>
                <span className="text-[11px] text-yellow-400 font-bold">View</span>
              </button>

              {/* Tactical Fear Range Rings (200px) */}
              <div className="flex items-center justify-between py-2 px-3.5 bg-neutral-950/70 rounded-xl border border-neutral-800">
                <div className="flex items-center gap-2.5">
                  <Eye className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-xs font-semibold text-white">Fear Radius Rings</div>
                    <div className="text-[10px] text-neutral-400">200px danger zone circles</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tacticalRings}
                  onChange={(e) => setTacticalRings(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-700 text-yellow-400 focus:ring-yellow-400 cursor-pointer"
                />
              </div>

              {/* Minimalist Coloured Circles */}
              <div className="flex items-center justify-between py-2 px-3.5 bg-neutral-950/70 rounded-xl border border-neutral-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-blue-400 border border-white" />
                  <div>
                    <div className="text-xs font-semibold text-white">Minimalist Mode</div>
                    <div className="text-[10px] text-neutral-400">Flat circles instead of sprites</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={minimalCircles}
                  onChange={(e) => setMinimalCircles(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-700 text-yellow-400 focus:ring-yellow-400 cursor-pointer"
                />
              </div>

              {/* Android Fullscreen & Orientation Lock */}
              <button
                onClick={() => {
                  setShowMenuModal(false);
                  setShowAndroidModal(true);
                }}
                className="w-full py-2.5 px-3.5 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-100 rounded-xl text-sm font-semibold flex items-center justify-between transition-all"
              >
                <span className="flex items-center gap-2.5">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>Android Fullscreen Guide</span>
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                  Mobile
                </span>
              </button>

              {/* How to Play Guide */}
              <button
                onClick={() => {
                  setShowMenuModal(false);
                  setShowHelp(true);
                }}
                className="w-full py-2.5 px-3.5 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-100 rounded-xl text-sm font-semibold flex items-center justify-between transition-all"
              >
                <span className="flex items-center gap-2.5">
                  <HelpCircle className="w-4 h-4 text-sky-400" />
                  <span>How to Play & River Crossing</span>
                </span>
                <span className="text-[11px] text-neutral-400">Rules</span>
              </button>

              {/* Upload Sprites from Device */}
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="w-full py-2.5 px-3.5 bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 rounded-xl text-sm font-semibold flex items-center justify-between transition-all"
              >
                <span className="flex items-center gap-2.5">
                  <FolderOpen className="w-4 h-4 text-emerald-400" />
                  <span>Import Custom Sprite Sheets</span>
                </span>
                <span className="text-[11px] text-emerald-400">Upload</span>
              </button>

              {/* GitHub Repo Input */}
              <div className="pt-2 border-t border-neutral-800">
                <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                  GitHub Repository Assets
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repoUrlInput}
                    onChange={(e) => setRepoUrlInput(e.target.value)}
                    placeholder="https://raw.githubusercontent.com/user/repo/main"
                    className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-2.5 py-1 text-xs text-neutral-100 placeholder-neutral-500 font-mono focus:outline-none focus:border-yellow-400"
                  />
                  <button
                    onClick={handleApplyRepoUrl}
                    className="px-3 py-1 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-bold text-xs rounded-xl"
                  >
                    Load
                  </button>
                </div>
              </div>

              {/* Active Sprites status */}
              <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 text-[10px] font-mono space-y-0.5">
                {['shepherdWalk', 'shepherdIdle', 'sheepWalk', 'sheepEat', 'ramWalk', 'ramEat'].map((k) => (
                  <div key={k} className="flex justify-between items-center text-neutral-300">
                    <span>{k}</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      {assetStatuses[k] === 'loaded' ? 'Loaded' : 'Active'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setShowMenuModal(false)}
                className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Help & Rules Guide Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl text-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base sm:text-lg font-bold text-white">How to Play Shepherd</h3>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 py-3 text-xs sm:text-sm leading-relaxed text-neutral-300">
              <div className="bg-emerald-950/40 border border-emerald-500/30 p-3 rounded-xl">
                <h4 className="font-bold text-emerald-300 flex items-center gap-1.5 mb-1 text-xs sm:text-sm">
                  <Sparkles className="w-3.5 h-3.5" /> Stage Objectives
                </h4>
                <p className="text-xs mb-1">
                  <strong>Stage 1 (The Meadow):</strong> Drive all 4 sheep into the circular green pen.
                </p>
                <p className="text-xs">
                  <strong>Stage 2 (River Crossing & 3 Pens):</strong> Herd the flock sequentially into <strong>Pen 1</strong>, then across the <strong>wooden river bridge</strong> to <strong>Pen 2</strong>, and finally south into <strong>Pen 3</strong>!
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1 text-xs">1. River & Wooden Bridge</h4>
                <p className="text-[11px] sm:text-xs">
                  In Stage 2, a deep flowing river divides the pasture. Sheep and shepherds <strong>cannot swim across the river</strong> and are stopped at the banks. The <strong>only way across is the sturdy wooden bridge</strong> in the center. Form up your shepherds to herd the sheep through the bridge bottleneck!
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1 text-xs">2. Shepherd Controls</h4>
                <ul className="list-disc pl-4 space-y-1 text-[11px] sm:text-xs">
                  <li>
                    <strong>Select/Deselect:</strong> Tap the C1, C2 buttons (and C3 in Stage 1) on the far left or tap directly on a shepherd (within 32px).
                  </li>
                  <li>
                    <strong>Move:</strong> Tap anywhere on the meadow. Selected shepherds walk toward that point in formation.
                  </li>
                  <li>
                    <strong>Stop:</strong> Press the red "Stop" button on the far left to halt all movement immediately.
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1 text-xs">3. Meadow Zoom & Camera</h4>
                <p className="text-[11px] sm:text-xs">
                  Use the <strong>[ + ] and [ − ]</strong> buttons at the bottom-right, or <strong>pinch-to-zoom</strong> with two fingers on mobile, or drag the meadow to pan around.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setShowHelp(false)}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-xl text-xs transition-all"
              >
                Got It!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. Android Fullscreen Guide Modal */}
      {showAndroidModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-3xl max-w-md w-full p-5 shadow-2xl text-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base sm:text-lg font-bold text-white">Full-Screen Mobile Play</h3>
              </div>
              <button
                onClick={() => setShowAndroidModal(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs sm:text-sm text-neutral-300">
              <p>
                To get the cleanest full-screen experience without browser toolbars:
              </p>
              <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 space-y-2">
                <div className="font-semibold text-white">In Google Chrome on Android:</div>
                <ol className="list-decimal pl-4 space-y-1 text-xs">
                  <li>Tap the <strong>three dots (⋮)</strong> in Chrome's top right corner.</li>
                  <li>Select <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>.</li>
                  <li>Open Shepherd from your home screen for true borderless fullscreen!</li>
                </ol>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-800 flex gap-2 justify-end">
              <button
                onClick={() => {
                  forceLandscapeMode();
                  setShowAndroidModal(false);
                }}
                className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-bold rounded-xl text-xs"
              >
                Lock Landscape
              </button>
              <button
                onClick={() => setShowAndroidModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
