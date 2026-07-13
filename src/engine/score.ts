/**
 * Overall score → grade and desync caps (design §7, UR clarification).
 *
 * ## Exit grade mapping (CLI process exit codes)
 * | Grade  | Exit code | Meaning                          |
 * |--------|-----------|----------------------------------|
 * | green  | 0         | Fleet healthy / aligned          |
 * | yellow | 1         | Warnings / desync (not green)    |
 * | red    | 2         | Errors / severe misconfiguration |
 * | (n/a)  | 3         | Unrecoverable tool/IO error      |
 *
 * Score → grade thresholds: ≥80 green, ≥50 yellow, else red.
 * Standing rule: overall grade cannot be green when findings include
 * `skills.agent_not_on_hub` or `skills.hub_conflict` (desync / multi-hub
 * conflict for non-ignored first-class agents). Other domains cannot
 * average the report up to green past this cap.
 */

import type { Finding, Grade } from "./types.js";

/** Finding ids that force a non-green overall grade. */
export const DESYNC_FINDING_IDS = [
  "skills.agent_not_on_hub",
  "skills.hub_conflict",
] as const;

/** Score thresholds for overall / domain grades. */
export const GRADE_THRESHOLDS = {
  green: 80,
  yellow: 50,
} as const;

/**
 * Map a 0–100 score to green | yellow | red.
 * Thresholds: score ≥ 80 → green; ≥ 50 → yellow; else red.
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

/**
 * True when findings include skills desync or unresolved multi-hub conflict.
 * These findings are only emitted for non-ignored first-class agents, so
 * presence of either id means overall grade must not be green.
 */
export function findingsBlockGreen(findings: readonly Finding[]): boolean {
  return findings.some((f) =>
    (DESYNC_FINDING_IDS as readonly string[]).includes(f.id),
  );
}

/** @deprecated Prefer findingsBlockGreen — same predicate. */
export const hasDesyncFindings = findingsBlockGreen;

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

export type ComputeOverallInput = {
  domainScores: readonly number[];
  findings: readonly Finding[];
};

/**
 * Compute overall score and grade from domain scores + findings.
 * Enforces: desync / hub_conflict findings ⇒ grade is yellow or red only
 * (never green), and score is capped below the green threshold when needed
 * so score and grade stay consistent.
 */
export function computeOverall(
  input: ComputeOverallInput,
): { score: number; grade: Grade } {
  const { domainScores, findings } = input;
  let score = averageScore([...domainScores]);
  let grade = scoreToGrade(score);

  if (!findingsBlockGreen(findings)) {
    return { score, grade };
  }

  const hubConflict = findings.some((f) => f.id === "skills.hub_conflict");

  // Cap: never green on desync / hub conflict.
  grade = capGradeForDesync(grade, {
    aligned: false,
    hubConflict,
  });

  // Keep score consistent with non-green grade.
  if (grade !== "green" && score >= GRADE_THRESHOLDS.green) {
    score = GRADE_THRESHOLDS.green - 1;
  }

  // Hub conflict is more severe: pull score into red band when still high.
  if (hubConflict && score >= GRADE_THRESHOLDS.yellow) {
    score = Math.min(score, GRADE_THRESHOLDS.yellow - 10);
    grade = scoreToGrade(score);
    grade = capGradeForDesync(grade, { aligned: false, hubConflict: true });
  }

  return { score, grade };
}

/**
 * CLI exit codes from overall grade.
 * Mapping: green → 0, yellow → 1, red → 2 (see module header).
 */
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

/** Unrecoverable tool/IO error exit code (not a grade). */
export const EXIT_TOOL_ERROR = 3;
