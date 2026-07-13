import { describe, expect, it } from "vitest";
import type { FixAction, HomeMap, Report } from "../engine/types.js";
import { buildFixPlan, isRejectedCopyAction, SAFE_FIX_KINDS } from "./plan.js";

function baseReport(overrides: Partial<Report> = {}): Report {
  return {
    generated_at: "2026-07-14T12:00:00.000Z",
    scope: "hybrid",
    sync: {
      skills_hub: "/hub",
      memory_hubs: [],
      agents_in_scope: ["claude-code"],
      aligned: false,
    },
    overall: { score: 55, grade: "yellow" },
    agents: [],
    domains: [],
    findings: [],
    recommendations: [],
    ...overrides,
  };
}

describe("buildFixPlan", () => {
  it("passes through adapter symlink proposals when hub is known", () => {
    const symlink: FixAction = {
      id: "fix.wire_codex_skills",
      kind: "symlink_skills_hub",
      description: "Symlink /agent/skills → /hub",
      target: "/agent/skills",
      agent_id: "codex",
      finding_ids: ["skills.agent_not_on_hub"],
    };
    const plan = buildFixPlan(
      baseReport({
        fix_plan: [symlink],
        sync: {
          skills_hub: "/hub",
          memory_hubs: [],
          agents_in_scope: ["codex"],
          aligned: false,
        },
      }),
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]!.kind).toBe("symlink_skills_hub");
    expect(plan[0]!.value).toBe("/hub");
  });

  it("rejects copy-tree actions (never content-copy skill trees)", () => {
    const copy: FixAction = {
      id: "fix.copy_skills",
      kind: "copy_tree",
      description: "Copy skills tree from private to hub",
      target: "/private/skills",
    };
    const symlink: FixAction = {
      id: "fix.wire",
      kind: "symlink_skills_hub",
      description: "Symlink",
      target: "/agent/skills",
    };
    const plan = buildFixPlan(
      baseReport({ fix_plan: [copy, symlink] }),
    );
    expect(plan.every((a) => a.kind !== "copy_tree")).toBe(true);
    expect(plan.some((a) => a.kind === "symlink_skills_hub")).toBe(true);
    expect(isRejectedCopyAction(copy)).toBe(true);
  });

  it("does not silently pick a hub when hub_conflict (no wire without sync_target)", () => {
    const symlink: FixAction = {
      id: "fix.wire",
      kind: "symlink_skills_hub",
      description: "Would wire to guessed hub",
      target: "/agent/skills",
    };
    const plan = buildFixPlan(
      baseReport({
        fix_plan: [symlink],
        sync: {
          skills_hub: undefined,
          memory_hubs: [],
          agents_in_scope: ["codex"],
          aligned: false,
        },
        findings: [
          {
            id: "skills.hub_conflict",
            severity: "error",
            domain: "skills",
            message: "Multiple hubs",
            evidence: ["/hub-a", "/hub-b"],
            agents_affected: [],
          },
        ],
      }),
    );
    expect(plan.filter((a) => a.kind === "symlink_skills_hub")).toEqual([]);
    expect(plan.some((a) => a.kind === "set_sync_target")).toBe(false);
  });

  it("includes set_sync_target only when explicit target provided on conflict", () => {
    const plan = buildFixPlan(
      baseReport({
        sync: {
          skills_hub: undefined,
          memory_hubs: [],
          agents_in_scope: [],
          aligned: false,
        },
        findings: [
          {
            id: "skills.hub_conflict",
            severity: "error",
            domain: "skills",
            message: "Multiple hubs",
            evidence: ["/hub-a", "/hub-b"],
            agents_affected: [],
          },
        ],
      }),
      { syncTarget: "/hub-a" },
    );
    const set = plan.find((a) => a.kind === "set_sync_target");
    expect(set).toBeDefined();
    expect(set!.value).toBe("/hub-a");
    expect(set!.target).toMatch(/map\.yml$/);
  });

  it("generates append_instruction_link from product.missing_link findings", () => {
    const plan = buildFixPlan(
      baseReport({
        project_root: "/proj",
        findings: [
          {
            id: "product.missing_link",
            severity: "warn",
            domain: "product",
            message: "Instruction file(s) for claude-code missing link to product.md",
            evidence: ["/proj/CLAUDE.md", "/proj/product.md"],
            agents_affected: ["claude-code"],
          },
        ],
      }),
    );
    const append = plan.find((a) => a.kind === "append_instruction_link");
    expect(append).toBeDefined();
    expect(append!.target).toBe("/proj/CLAUDE.md");
    expect(append!.value).toBe("/proj/product.md");
  });

  it("SAFE_FIX_KINDS covers required v1 actions", () => {
    expect(SAFE_FIX_KINDS.has("symlink_skills_hub")).toBe(true);
    expect(SAFE_FIX_KINDS.has("append_instruction_link")).toBe(true);
    expect(SAFE_FIX_KINDS.has("set_sync_target")).toBe(true);
    expect(SAFE_FIX_KINDS.has("copy_tree")).toBe(false);
  });
});

describe("HomeMap type smoke for set_sync_target plan", () => {
  it("map skills.sync_target is nullable", () => {
    const map: HomeMap = {
      version: 1,
      skills: { global_roots: ["/a", "/b"], sync_target: null },
      vaults: [],
      agents: [],
      projects: { roots: [], entries: [] },
    };
    expect(map.skills.sync_target).toBeNull();
  });
});
