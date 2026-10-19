/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StageId } from './types';

export interface ScoreBreakdown {
  base: number;
  timeBonus: number;
  sheepBonus: number;
  efficiencyBonus: number;
  stageBonus: number;
}

export interface StageScoreEntry {
  id: string;
  stage: StageId;
  playerName: string;
  score: number;
  timeSeconds: number;
  stars: 1 | 2 | 3;
  shepherdCount: number;
  date: string;
  isPlayer?: boolean;
  breakdown: ScoreBreakdown;
}

const STORAGE_KEY_PREFIX = 'shepherd_leaderboard_stage_';

// Initial default hall-of-fame records to challenge the player
const DEFAULT_STAGE_1_SCORES: StageScoreEntry[] = [
  {
    id: 's1-seed-1',
    stage: 1,
    playerName: 'Highland Champion',
    score: 9350,
    timeSeconds: 31.4,
    stars: 3,
    shepherdCount: 3,
    date: 'Champion',
    isPlayer: false,
    breakdown: { base: 4000, timeBonus: 2850, sheepBonus: 2000, efficiencyBonus: 500, stageBonus: 0 },
  },
  {
    id: 's1-seed-2',
    stage: 1,
    playerName: 'Border Collie Pro',
    score: 8420,
    timeSeconds: 42.0,
    stars: 3,
    shepherdCount: 3,
    date: 'Veteran',
    isPlayer: false,
    breakdown: { base: 4000, timeBonus: 2100, sheepBonus: 2000, efficiencyBonus: 320, stageBonus: 0 },
  },
  {
    id: 's1-seed-3',
    stage: 1,
    playerName: 'Meadow Ranger',
    score: 7180,
    timeSeconds: 56.5,
    stars: 2,
    shepherdCount: 3,
    date: 'Skilled',
    isPlayer: false,
    breakdown: { base: 4000, timeBonus: 1080, sheepBonus: 2000, efficiencyBonus: 100, stageBonus: 0 },
  },
  {
    id: 's1-seed-4',
    stage: 1,
    playerName: 'Green Pasture',
    score: 5900,
    timeSeconds: 78.2,
    stars: 2,
    shepherdCount: 3,
    date: 'Regular',
    isPlayer: false,
    breakdown: { base: 4000, timeBonus: 0, sheepBonus: 1900, efficiencyBonus: 0, stageBonus: 0 },
  },
  {
    id: 's1-seed-5',
    stage: 1,
    playerName: 'Apprentice Shepherd',
    score: 4600,
    timeSeconds: 105.1,
    stars: 1,
    shepherdCount: 3,
    date: 'Novice',
    isPlayer: false,
    breakdown: { base: 3500, timeBonus: 0, sheepBonus: 1100, efficiencyBonus: 0, stageBonus: 0 },
  },
];

const DEFAULT_STAGE_2_SCORES: StageScoreEntry[] = [
  {
    id: 's2-seed-1',
    stage: 2,
    playerName: 'Bridge Grandmaster',
    score: 16400,
    timeSeconds: 49.8,
    stars: 3,
    shepherdCount: 2,
    date: 'Grandmaster',
    isPlayer: false,
    breakdown: { base: 8000, timeBonus: 4400, sheepBonus: 2000, efficiencyBonus: 500, stageBonus: 1500 },
  },
  {
    id: 's2-seed-2',
    stage: 2,
    playerName: 'River Duo Maestro',
    score: 14250,
    timeSeconds: 68.3,
    stars: 3,
    shepherdCount: 2,
    date: 'Expert',
    isPlayer: false,
    breakdown: { base: 8000, timeBonus: 2350, sheepBonus: 2000, efficiencyBonus: 400, stageBonus: 1500 },
  },
  {
    id: 's2-seed-3',
    stage: 2,
    playerName: 'Twin Collie Legend',
    score: 12800,
    timeSeconds: 85.0,
    stars: 2,
    shepherdCount: 2,
    date: 'Veteran',
    isPlayer: false,
    breakdown: { base: 8000, timeBonus: 1100, sheepBonus: 2000, efficiencyBonus: 200, stageBonus: 1500 },
  },
  {
    id: 's2-seed-4',
    stage: 2,
    playerName: 'Stream Navigator',
    score: 10950,
    timeSeconds: 114.6,
    stars: 2,
    shepherdCount: 2,
    date: 'Skilled',
    isPlayer: false,
    breakdown: { base: 7500, timeBonus: 0, sheepBonus: 1950, efficiencyBonus: 0, stageBonus: 1500 },
  },
  {
    id: 's2-seed-5',
    stage: 2,
    playerName: 'Island Herder',
    score: 8500,
    timeSeconds: 155.2,
    stars: 1,
    shepherdCount: 2,
    date: 'Novice',
    isPlayer: false,
    breakdown: { base: 6000, timeBonus: 0, sheepBonus: 1500, efficiencyBonus: 0, stageBonus: 1000 },
  },
];

/**
 * Format raw seconds to MM:SS.t (e.g. 01:23.4)
 */
export function formatTime(totalSeconds: number): string {
  if (totalSeconds < 0 || isNaN(totalSeconds)) return '00:00.0';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

/**
 * Calculate stage score & stars based on performance
 */
export function calculateStageScore(
  stage: StageId,
  timeSeconds: number,
  commandCount: number,
  shepherdCount: number
): { score: number; stars: 1 | 2 | 3; breakdown: ScoreBreakdown } {
  const safeTime = Math.max(1, timeSeconds);

  if (stage === 1) {
    const base = 4000;
    const sheepBonus = 2000;
    // Target 75s for time bonus, up to 3500 pts
    const timeBonus = Math.max(0, Math.round((75 - safeTime) * 60));
    // Efficiency: bonus for under 40 commands
    const efficiencyBonus = Math.max(0, Math.min(500, Math.round((40 - commandCount) * 25)));
    const stageBonus = 0;
    const score = base + sheepBonus + timeBonus + efficiencyBonus + stageBonus;

    let stars: 1 | 2 | 3 = 1;
    if (safeTime <= 45) {
      stars = 3;
    } else if (safeTime <= 75) {
      stars = 2;
    }

    return {
      score,
      stars,
      breakdown: { base, timeBonus, sheepBonus, efficiencyBonus, stageBonus },
    };
  } else {
    // Stage 2: River crossing with 2 shepherds
    const base = 8000;
    const sheepBonus = 2000;
    // Target 150s for time bonus, up to 6000 pts
    const timeBonus = Math.max(0, Math.round((150 - safeTime) * 50));
    // Efficiency
    const efficiencyBonus = Math.max(0, Math.min(600, Math.round((60 - commandCount) * 20)));
    // Bonus for 2-shepherd mastery in Stage 2
    const stageBonus = shepherdCount <= 2 ? 1500 : 500;
    const score = base + sheepBonus + timeBonus + efficiencyBonus + stageBonus;

    let stars: 1 | 2 | 3 = 1;
    if (safeTime <= 75) {
      stars = 3;
    } else if (safeTime <= 135) {
      stars = 2;
    }

    return {
      score,
      stars,
      breakdown: { base, timeBonus, sheepBonus, efficiencyBonus, stageBonus },
    };
  }
}

/**
 * Load scores for a stage from localStorage
 */
export function getScoresForStage(stage: StageId): StageScoreEntry[] {
  try {
    const key = `${STORAGE_KEY_PREFIX}${stage}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      const defaults = stage === 1 ? DEFAULT_STAGE_1_SCORES : DEFAULT_STAGE_2_SCORES;
      localStorage.setItem(key, JSON.stringify(defaults));
      return defaults;
    }
    const parsed: StageScoreEntry[] = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const defaults = stage === 1 ? DEFAULT_STAGE_1_SCORES : DEFAULT_STAGE_2_SCORES;
      localStorage.setItem(key, JSON.stringify(defaults));
      return defaults;
    }
    return parsed.sort((a, b) => b.score - a.score);
  } catch {
    return stage === 1 ? DEFAULT_STAGE_1_SCORES : DEFAULT_STAGE_2_SCORES;
  }
}

/**
 * Add a new score entry and persist to localStorage
 */
export function recordStageScore(params: {
  stage: StageId;
  playerName?: string;
  timeSeconds: number;
  commandCount: number;
  shepherdCount: number;
}): { entry: StageScoreEntry; isTopScore: boolean; rank: number; totalEntries: number } {
  const { stage, playerName = 'You', timeSeconds, commandCount, shepherdCount } = params;
  const { score, stars, breakdown } = calculateStageScore(stage, timeSeconds, commandCount, shepherdCount);

  const dateStr = new Date().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const entry: StageScoreEntry = {
    id: `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    stage,
    playerName,
    score,
    timeSeconds,
    stars,
    shepherdCount,
    date: dateStr,
    isPlayer: true,
    breakdown,
  };

  const existing = getScoresForStage(stage);
  const updated = [...existing, entry].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timeSeconds - b.timeSeconds;
  });

  // Keep top 20
  const trimmed = updated.slice(0, 20);

  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${stage}`, JSON.stringify(trimmed));
  } catch {
    // Ignore localStorage write error
  }

  const rank = trimmed.findIndex((e) => e.id === entry.id) + 1;
  const isTopScore = rank === 1;

  return {
    entry,
    isTopScore,
    rank: rank > 0 ? rank : trimmed.length,
    totalEntries: trimmed.length,
  };
}

/**
 * Reset high score table for a stage back to default
 */
export function resetStageScores(stage: StageId): StageScoreEntry[] {
  const defaults = stage === 1 ? DEFAULT_STAGE_1_SCORES : DEFAULT_STAGE_2_SCORES;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${stage}`, JSON.stringify(defaults));
  } catch {
    // Ignore
  }
  return defaults;
}
