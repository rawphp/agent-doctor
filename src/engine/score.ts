/**
 * Overall score → grade and desync caps (design §7, UR clarification).
 * Exit codes: 0 green, 1 yellow, 2 red, 3 tool error (CLI layer).
 */

import type { Grade } from "./types.js";

/** Score thresholds for overall / domain grades. */
export const GRADE_THRESHOLDS = {
  green: 80,
  yellow: 50,
} as const;

/**
 * Map a 0–100 score to green | yellow | red.
 */
export function scoreToGrade(score: number): Grade {
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped >= GRADE_THRESHOLDS.green) return "green";
  if (clamped >= GRADE_THRESHOLDS.yellow) return "yellow";
  return "red";
}

/**
 * Average domain scores (empty → 100 so a no-domain edge stays green).
 */
export function averageScore(scores: number[]): number {
  if (scores.length === 0) return 100;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round(sum / scores.length);
}

export type DesyncCapOptions = {
  /** False when any non-ignored first-class agent is off hub. */
  aligned: boolean;
  /** True when multiple populated hubs and no sync_target. */
  hubConflict: boolean;
};

/**
 * Overall grade cannot be green on skills desync or unresolved multi-hub conflict.
 * Other domains cannot average up past this cap (UR clarification).
 */
export function capGradeForDesync(
  grade: Grade,
  options: DesyncCapOptions,
): Grade {
  if (options.aligned && !options.hubConflict) {
    return grade;
  }
  if (grade === "green") {
    return "yellow";
  }
  return grade;
}

/** CLI exit codes from overall grade (design §7). */
export function exitCodeForGrade(grade: Grade): number {
  switch (grade) {
    case "green":
      return 0;
    case "yellow":
      return 1;
    case "red":
      return 2;
  }
}

/** Unrecoverable tool/IO error exit code. */
export const EXIT_TOOL_ERROR = 3;
