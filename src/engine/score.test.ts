import { describe, expect, it } from "vitest";
import type { Finding } from "./types.js";
import {
  DESYNC_FINDING_IDS,
  EXIT_TOOL_ERROR,
  averageScore,
  capGradeForDesync,
  computeOverall,
  exitCodeForGrade,
  findingsBlockGreen,
  scoreToGrade,
} from "./score.js";

function finding(
  partial: Pick<Finding, "id"> & Partial<Finding>,
): Finding {
  return {
    severity: "error",
    domain: "skills",
    message: partial.message ?? partial.id,
    evidence: [],
    agents_affected: ["claude"],
    ...partial,
  };
}

describe("scoreToGrade", () => {
  it("maps high scores to green", () => {
    expect(scoreToGrade(100)).toBe("green");
    expect(scoreToGrade(80)).toBe("green");
  });

  it("maps mid scores to yellow", () => {
    expect(scoreToGrade(79)).toBe("yellow");
    expect(scoreToGrade(50)).toBe("yellow");
  });

  it("maps low scores to red", () => {
    expect(scoreToGrade(49)).toBe("red");
    expect(scoreToGrade(0)).toBe("red");
  });
});

describe("averageScore", () => {
  it("averages domain scores", () => {
    expect(averageScore([100, 50])).toBe(75);
  });

  it("returns 100 for empty domain list", () => {
    expect(averageScore([])).toBe(100);
  });
});

describe("capGradeForDesync", () => {
  it("does not change grade when aligned and no hub conflict", () => {
    expect(
      capGradeForDesync("green", { aligned: true, hubConflict: false }),
    ).toBe("green");
  });

  it("never allows green when skills desync (aligned false)", () => {
    expect(
      capGradeForDesync("green", { aligned: false, hubConflict: false }),
    ).toBe("yellow");
  });

  it("never allows green on unresolved multi-hub conflict", () => {
    expect(
      capGradeForDesync("green", { aligned: true, hubConflict: true }),
    ).toBe("yellow");
  });

  it("does not raise yellow or red on desync", () => {
    expect(
      capGradeForDesync("yellow", { aligned: false, hubConflict: false }),
    ).toBe("yellow");
    expect(
      capGradeForDesync("red", { aligned: false, hubConflict: true }),
    ).toBe("red");
  });
});

describe("findingsBlockGreen / DESYNC_FINDING_IDS", () => {
  it("documents desync finding ids that cap overall grade", () => {
    expect([...DESYNC_FINDING_IDS]).toEqual([
      "skills.agent_not_on_hub",
      "skills.hub_conflict",
    ]);
  });

  it("returns true for skills.agent_not_on_hub (non-ignored first-class off hub)", () => {
    expect(
      findingsBlockGreen([
        finding({ id: "skills.agent_not_on_hub", agents_affected: ["claude"] }),
      ]),
    ).toBe(true);
  });

  it("returns true for skills.hub_conflict", () => {
    expect(
      findingsBlockGreen([finding({ id: "skills.hub_conflict" })]),
    ).toBe(true);
  });

  it("returns false for empty findings", () => {
    expect(findingsBlockGreen([])).toBe(false);
  });

  it("returns false for only info findings (aligned fleet noise)", () => {
    expect(
      findingsBlockGreen([
        finding({
          id: "presence.agent_detected",
          severity: "info",
          domain: "agent_presence",
          message: "claude detected",
        }),
      ]),
    ).toBe(false);
  });
});

describe("computeOverall", () => {
  it("never grades green when findings include skills.agent_not_on_hub", () => {
    const overall = computeOverall({
      domainScores: [100, 100, 100, 100],
      findings: [
        finding({
          id: "skills.agent_not_on_hub",
          agents_affected: ["codex"],
        }),
      ],
    });
    expect(overall.grade).not.toBe("green");
    expect(["yellow", "red"]).toContain(overall.grade);
  });

  it("never grades green when findings include skills.hub_conflict", () => {
    const overall = computeOverall({
      domainScores: [95, 90, 100],
      findings: [finding({ id: "skills.hub_conflict" })],
    });
    expect(overall.grade).not.toBe("green");
  });

  it("can be green for aligned fleet with only info findings", () => {
    const overall = computeOverall({
      domainScores: [100, 100, 90, 95],
      findings: [
        finding({
          id: "presence.agent_detected",
          severity: "info",
          domain: "agent_presence",
          message: "claude installed",
        }),
        finding({
          id: "skills.hub_resolved",
          severity: "info",
          domain: "skills",
          message: "hub ok",
        }),
      ],
    });
    expect(overall.grade).toBe("green");
    expect(overall.score).toBeGreaterThanOrEqual(80);
  });

  it("stays red when domain average is already red even without desync findings", () => {
    const overall = computeOverall({
      domainScores: [10, 20],
      findings: [],
    });
    expect(overall.grade).toBe("red");
    expect(overall.score).toBeLessThan(50);
  });

  it("caps score so it cannot report green thresholds while grade is capped", () => {
    const overall = computeOverall({
      domainScores: [100, 100],
      findings: [finding({ id: "skills.agent_not_on_hub" })],
    });
    expect(overall.grade).not.toBe("green");
    expect(overall.score).toBeLessThan(80);
  });
});

/**
 * Exit grade mapping (design §7) — also documented on score.ts module header:
 *   green  → 0
 *   yellow → 1
 *   red    → 2
 *   tool/IO error (not a grade) → 3 (EXIT_TOOL_ERROR)
 */
describe("exitCodeForGrade — exit grade mapping", () => {
  it("maps green/yellow/red to 0/1/2", () => {
    expect(exitCodeForGrade("green")).toBe(0);
    expect(exitCodeForGrade("yellow")).toBe(1);
    expect(exitCodeForGrade("red")).toBe(2);
  });

  it("reserves 3 for tool errors", () => {
    expect(EXIT_TOOL_ERROR).toBe(3);
  });
});
