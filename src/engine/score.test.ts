import { describe, expect, it } from "vitest";
import {
  EXIT_TOOL_ERROR,
  averageScore,
  capGradeForDesync,
  exitCodeForGrade,
  scoreToGrade,
} from "./score.js";

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

describe("exitCodeForGrade", () => {
  it("uses design exit codes 0/1/2", () => {
    expect(exitCodeForGrade("green")).toBe(0);
    expect(exitCodeForGrade("yellow")).toBe(1);
    expect(exitCodeForGrade("red")).toBe(2);
  });

  it("reserves 3 for tool errors", () => {
    expect(EXIT_TOOL_ERROR).toBe(3);
  });
});
