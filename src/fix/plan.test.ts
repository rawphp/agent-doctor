import { describe, expect, it } from "vitest";
import type { AgentAdapter, AdapterContext } from "../adapters/types.js";
import type {
  AgentPresence,
  Finding,
  FixAction,
  HomeMap,
} from "../engine/types.js";
import { buildFixPlan } from "./plan.js";

function emptyMap(overrides: Partial<HomeMap["skills"]> = {}): HomeMap {
  return {
    version: 1,
    skills: {
      global_roots: overrides.global_roots ?? [],
      sync_target:
        overrides.sync_target !== undefined ? overrides.sync_target : null,
    },
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
  };
}

function finding(partial: Partial<Finding> & Pick<Finding, "id">): Finding {
  return {
    severity: "warn",
    domain: "skills",
    message: partial.message ?? partial.id,
    evidence: [],
    agents_affected: [],
    ...partial,
  };
}

function stubAdapter(
  id: string,
  options: {
    wireSkills?: FixAction[];
    wireMemory?: FixAction[];
  } = {},
): AgentAdapter {
  return {
    id,
    async detect(): Promise<AgentPresence> {
      return {
        id,
        adapter: id,
        installed: true,
        depth: "deep",
        config_home: `/tmp/${id}`,
      };
    },
    async skillsRoots(_ctx?: AdapterContext): Promise<string[]> {
      return [];
    },
    async instructionFiles(): Promise<string[]> {
      return [];
    },
    async memoryPointers(): Promise<string[]> {
      return [];
    },
    proposeWireToSkillsHub(hub: string): FixAction[] {
      if (options.wireSkills) {
        return options.wireSkills.map((a) => ({
          ...a,
          description: a.description.includes(hub)
            ? a.description
            : `${a.description} → ${hub}`,
        }));
      }
      return [
        {
          id: `fix.wire_${id}_skills`,
          kind: "symlink_skills_hub",
          description: `Symlink /tmp/${id}/skills → ${hub}`,
          target: `/tmp/${id}/skills`,
          agent_id: id,
        },
      ];
    },
    proposeWireMemory(paths: string[]): FixAction[] {
      if (options.wireMemory) return options.wireMemory;
      return paths.map((vaultPath, index) => ({
        id: `fix.wire_${id}_memory_${index + 1}`,
        kind: "wire_memory_pointer",
        description: `Add memory pointer to ${vaultPath}`,
        target: vaultPath,
        agent_id: id,
      }));
    },
  };
}

describe("buildFixPlan", () => {
  it("maps findings to stable fix action ids", () => {
    const hub = "/hub/skills";
    const plan = buildFixPlan({
      findings: [
        finding({
          id: "skills.agent_not_on_hub",
          severity: "error",
          domain: "skills",
          agents_affected: ["codex"],
          sync_target: hub,
        }),
        finding({
          id: "product.missing_link",
          severity: "warn",
          domain: "product",
          message: "Instruction file(s) for claude-code missing link to product.md",
          evidence: ["/proj/CLAUDE.md", "/proj/product.md"],
          agents_affected: ["claude-code"],
        }),
        finding({
          id: "obsidian.missing_vault_link",
          severity: "warn",
          domain: "obsidian",
          evidence: ["/vaults/notes"],
          agents_affected: ["claude-code"],
        }),
      ],
      map: emptyMap({ sync_target: hub, global_roots: [hub] }),
      hub,
      adapters: [stubAdapter("codex"), stubAdapter("claude-code")],
      projectRoot: "/proj",
    });

    expect(plan.length).toBeGreaterThanOrEqual(3);
    for (const action of plan) {
      expect(action.id).toMatch(/^fix\./);
      expect(typeof action.kind).toBe("string");
      expect(action.kind.length).toBeGreaterThan(0);
      expect(typeof action.description).toBe("string");
    }

    // Stable, predictable ids (not random / timestamp-based)
    expect(plan.map((a) => a.id).sort()).toEqual(
      expect.arrayContaining([
        "fix.wire_codex_skills",
        "fix.link_product_claude-code_product.md",
        "fix.wire_claude-code_memory_1",
      ]),
    );

    // finding_ids attach source findings
    const wire = plan.find((a) => a.id === "fix.wire_codex_skills");
    expect(wire?.finding_ids).toContain("skills.agent_not_on_hub");

    const product = plan.find(
      (a) => a.id === "fix.link_product_claude-code_product.md",
    );
    expect(product?.finding_ids).toContain("product.missing_link");
    expect(product?.kind).toBe("append_link_block");
    expect(product?.agent_id).toBe("claude-code");
    expect(product?.target).toBe("/proj/product.md");
  });

  it("hub conflict without sync_target yields set_sync_target only, not wire", () => {
    const roots = ["/hub/a", "/hub/b"];
    const plan = buildFixPlan({
      findings: [
        finding({
          id: "skills.hub_conflict",
          severity: "error",
          domain: "skills",
          message:
            "Multiple populated skills roots with no sync_target; choose one hub before wire fixes.",
          evidence: roots,
          agents_affected: ["claude-code", "codex"],
        }),
        // Even if off-hub findings were present, wire must be blocked
        finding({
          id: "skills.agent_not_on_hub",
          severity: "error",
          domain: "skills",
          agents_affected: ["codex"],
        }),
      ],
      map: emptyMap({ sync_target: null, global_roots: roots }),
      hub: undefined,
      adapters: [
        stubAdapter("codex", {
          wireSkills: [
            {
              id: "fix.wire_codex_skills",
              kind: "symlink_skills_hub",
              description: "should not appear",
              agent_id: "codex",
            },
          ],
        }),
        stubAdapter("claude-code"),
      ],
    });

    expect(plan.some((a) => a.id === "fix.set_sync_target")).toBe(true);
    const setTarget = plan.find((a) => a.id === "fix.set_sync_target")!;
    expect(setTarget.kind).toBe("set_sync_target");
    expect(setTarget.finding_ids).toContain("skills.hub_conflict");

    const wireKinds = new Set([
      "symlink_skills_hub",
      "wire_skills_hub",
      "wire_memory_pointer",
    ]);
    expect(plan.filter((a) => wireKinds.has(a.kind))).toEqual([]);
    expect(plan.filter((a) => a.id.startsWith("fix.wire_"))).toEqual([]);
  });

  it("includes symlink actions when adapter proposes them for off-hub agents", () => {
    const hub = "/Users/me/skills-hub";
    const plan = buildFixPlan({
      findings: [
        finding({
          id: "skills.agent_not_on_hub",
          severity: "error",
          domain: "skills",
          agents_affected: ["grok"],
          sync_target: hub,
        }),
      ],
      map: emptyMap({ sync_target: hub, global_roots: [hub] }),
      hub,
      adapters: [
        stubAdapter("grok", {
          wireSkills: [
            {
              id: "fix.wire_grok_skills",
              kind: "symlink_skills_hub",
              description: `Symlink /tmp/grok/skills → ${hub} (hub wiring via symlink)`,
              target: "/tmp/grok/skills",
              agent_id: "grok",
            },
          ],
        }),
      ],
    });

    const symlink = plan.find((a) => a.kind === "symlink_skills_hub");
    expect(symlink).toBeDefined();
    expect(symlink!.id).toBe("fix.wire_grok_skills");
    expect(symlink!.agent_id).toBe("grok");
    expect(symlink!.target).toBe("/tmp/grok/skills");
    expect(symlink!.finding_ids).toContain("skills.agent_not_on_hub");
  });

  it("does not invent wire actions for presence-only adapters that propose nothing", () => {
    const hub = "/hub";
    const plan = buildFixPlan({
      findings: [
        finding({
          id: "skills.agent_not_on_hub",
          severity: "error",
          domain: "skills",
          agents_affected: ["cursor"],
          sync_target: hub,
        }),
      ],
      map: emptyMap({ sync_target: hub }),
      hub,
      adapters: [
        {
          ...stubAdapter("cursor"),
          proposeWireToSkillsHub: () => [],
          proposeWireMemory: () => [],
        },
      ],
    });

    expect(plan.filter((a) => a.agent_id === "cursor")).toEqual([]);
  });

  it("when hub conflict but sync_target is set, allows wire proposals", () => {
    // Stale/edge: conflict finding present while map already has a choice
    const hub = "/hub/chosen";
    const plan = buildFixPlan({
      findings: [
        finding({
          id: "skills.hub_conflict",
          severity: "error",
          domain: "skills",
          evidence: ["/hub/a", hub],
        }),
        finding({
          id: "skills.agent_not_on_hub",
          severity: "error",
          domain: "skills",
          agents_affected: ["codex"],
          sync_target: hub,
        }),
      ],
      map: emptyMap({ sync_target: hub, global_roots: ["/hub/a", hub] }),
      hub,
      adapters: [stubAdapter("codex")],
    });

    expect(plan.some((a) => a.kind === "symlink_skills_hub")).toBe(true);
    // No forced set_sync_target when already set
    expect(plan.some((a) => a.id === "fix.set_sync_target")).toBe(false);
  });

  it("dedupes actions by id across multiple off-hub findings for same agent", () => {
    const hub = "/hub";
    const plan = buildFixPlan({
      findings: [
        finding({
          id: "skills.agent_not_on_hub",
          severity: "error",
          domain: "skills",
          agents_affected: ["codex"],
        }),
        finding({
          id: "skills.agent_not_on_hub",
          severity: "error",
          domain: "skills",
          agents_affected: ["codex"],
          message: "duplicate finding row",
        }),
      ],
      map: emptyMap({ sync_target: hub }),
      hub,
      adapters: [stubAdapter("codex")],
    });

    const wires = plan.filter((a) => a.id === "fix.wire_codex_skills");
    expect(wires).toHaveLength(1);
  });
});
