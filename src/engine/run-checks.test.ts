import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentAdapter, AdapterContext } from "../adapters/types.js";
import type { AgentPresence, FixAction, HomeMap } from "./types.js";
import { isAgentOnHub, runChecks } from "./run-checks.js";

const temps: string[] = [];

function tempDir(prefix = "run-checks-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

function makePopulatedRoot(parent: string, name: string): string {
  const root = join(parent, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "SKILL.md"), "# skill\n");
  return root;
}

function baseMap(overrides: Partial<HomeMap> = {}): HomeMap {
  const { skills: skillsOverride, ...rest } = overrides;
  return {
    version: 1,
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
    ...rest,
    skills: {
      global_roots: [],
      sync_target: null,
      ...skillsOverride,
    },
  };
}

function stubAdapter(
  id: string,
  opts: {
    installed?: boolean;
    home?: string;
    roots?: string[];
    depth?: AgentPresence["depth"];
  } = {},
): AgentAdapter {
  const installed = opts.installed ?? true;
  const depth = opts.depth ?? "deep";
  const roots = opts.roots ?? [];
  const home = opts.home ?? `/tmp/${id}`;

  return {
    id,
    async detect(): Promise<AgentPresence> {
      if (!installed) {
        return { id, adapter: id, installed: false, depth };
      }
      return {
        id,
        adapter: id,
        installed: true,
        config_home: home,
        depth,
      };
    },
    async skillsRoots(_ctx?: AdapterContext): Promise<string[]> {
      return roots;
    },
    async instructionFiles(): Promise<string[]> {
      return [];
    },
    async memoryPointers(): Promise<string[]> {
      return [];
    },
    proposeWireToSkillsHub(_hub: string): FixAction[] {
      return [];
    },
    proposeWireMemory(_paths: string[]): FixAction[] {
      return [];
    },
  };
}

describe("runChecks hybrid scope", () => {
  it("defaults scope to hybrid", async () => {
    const report = await runChecks({
      map: baseMap(),
      adapters: [],
      projectRoot: "/proj",
    });
    expect(report.scope).toBe("hybrid");
    expect(report.project_root).toBe("/proj");
  });

  it("includes overall score/grade, agents, domains, and sync block", async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");
    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter("claude-code", { roots: [hub], home: join(base, "claude") }),
      ],
      now: () => new Date("2026-07-14T12:00:00.000Z"),
    });

    expect(report.generated_at).toBe("2026-07-14T12:00:00.000Z");
    expect(report.overall).toMatchObject({
      score: expect.any(Number),
      grade: expect.stringMatching(/^(green|yellow|red)$/),
    });
    expect(report.sync.skills_hub).toBeDefined();
    expect(report.sync.agents_in_scope).toContain("claude-code");
    expect(report.agents.some((a) => a.id === "claude-code")).toBe(true);
    expect(report.domains.length).toBeGreaterThan(0);
    expect(report.domains.every((d) => d.domain && d.grade)).toBe(true);
  });

  it("marks aligned when all first-class agents share the hub", async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");
    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter("claude-code", { roots: [hub] }),
        stubAdapter("codex", { roots: [hub] }),
      ],
    });

    expect(report.sync.aligned).toBe(true);
    expect(report.overall.grade).toBe("green");
    expect(
      report.findings.filter((f) => f.id === "skills.agent_not_on_hub"),
    ).toHaveLength(0);
  });

  it("never grades green when a non-ignored first-class agent is off hub", async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");
    const privateRoot = makePopulatedRoot(base, "codex-private");

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter("claude-code", { roots: [hub] }),
        stubAdapter("codex", { roots: [privateRoot] }),
      ],
    });

    expect(report.sync.aligned).toBe(false);
    expect(report.overall.grade).not.toBe("green");
    expect(
      report.findings.some(
        (f) =>
          f.id === "skills.agent_not_on_hub" &&
          f.agents_affected.includes("codex"),
      ),
    ).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("never grades green on unresolved multi-hub conflict", async () => {
    const base = tempDir();
    const a = makePopulatedRoot(base, "hub-a");
    const b = makePopulatedRoot(base, "hub-b");

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [a, b], sync_target: null },
      }),
      adapters: [
        stubAdapter("claude-code", { roots: [a] }),
        stubAdapter("codex", { roots: [b] }),
      ],
    });

    expect(report.sync.skills_hub).toBeUndefined();
    expect(
      report.findings.some((f) => f.id === "skills.hub_conflict"),
    ).toBe(true);
    expect(report.overall.grade).not.toBe("green");
    expect(report.sync.aligned).toBe(false);
  });

  it("ignores ignored agents for hub alignment", async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");
    const privateRoot = makePopulatedRoot(base, "private");

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
        agents: [
          {
            id: "codex",
            adapter: "codex",
            config_home: "/x",
            primary: false,
            ignored: true,
          },
        ],
      }),
      adapters: [
        stubAdapter("claude-code", { roots: [hub] }),
        stubAdapter("codex", { roots: [privateRoot] }),
      ],
    });

    expect(report.agents.find((a) => a.id === "codex")?.ignored).toBe(true);
    expect(report.sync.agents_in_scope).not.toContain("codex");
    expect(report.sync.aligned).toBe(true);
    expect(report.overall.grade).toBe("green");
  });

  it("does not let presence-only agents block green when deep agents align", async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter("claude-code", { roots: [hub] }),
        stubAdapter("cursor", { depth: "presence-only", roots: [] }),
      ],
    });

    expect(report.sync.aligned).toBe(true);
    expect(report.overall.grade).toBe("green");
  });

  it("honors explicit machine scope", async () => {
    const report = await runChecks({
      scope: "machine",
      map: baseMap(),
      adapters: [],
    });
    expect(report.scope).toBe("machine");
  });

  it("returns full Report for hybrid scope with projectRoot and home", async () => {
    const home = tempDir("run-checks-home-");
    const projectRoot = tempDir("run-checks-proj-");
    const hub = makePopulatedRoot(home, "hub");
    mkdirSync(join(home, "claude"), { recursive: true });

    const report = await runChecks({
      scope: "hybrid",
      projectRoot,
      home,
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter("claude-code", {
          roots: [hub],
          home: join(home, "claude"),
        }),
      ],
    });

    expect(report.scope).toBe("hybrid");
    expect(report.project_root).toBe(projectRoot);
    expect(report.generated_at).toEqual(expect.any(String));
    expect(report.overall).toMatchObject({
      score: expect.any(Number),
      grade: expect.stringMatching(/^(green|yellow|red)$/),
    });
    expect(report.sync).toMatchObject({
      skills_hub: expect.any(String),
      memory_hubs: expect.any(Array),
      agents_in_scope: expect.arrayContaining(["claude-code"]),
      aligned: expect.any(Boolean),
    });
    expect(report.agents.length).toBeGreaterThan(0);
    expect(report.domains).toHaveLength(6);
    expect(report.domains.every((d) => typeof d.score === "number" && d.grade)).toBe(
      true,
    );
    expect(Array.isArray(report.findings)).toBe(true);
    expect(Array.isArray(report.recommendations)).toBe(true);
    // Domain suite ran — findings/domains use real domain checkers
    expect(
      report.domains.map((d) => d.domain).sort(),
    ).toEqual(
      [
        "agent_presence",
        "cross_agent_consistency",
        "instruction_files",
        "obsidian",
        "product_context",
        "shared_skills_path",
      ].sort(),
    );
  });

  it("missing map does not throw; report recommends running init", async () => {
    const home = tempDir("run-checks-nomap-");
    const projectRoot = tempDir("run-checks-nomap-proj-");

    const report = await runChecks({
      scope: "hybrid",
      projectRoot,
      home,
      // no map injection — load from empty home (map.yml absent)
      adapters: [],
    });

    expect(report.scope).toBe("hybrid");
    expect(report.project_root).toBe(projectRoot);
    expect(report.overall).toMatchObject({
      score: expect.any(Number),
      grade: expect.stringMatching(/^(green|yellow|red)$/),
    });
    expect(
      report.findings.some(
        (f) => f.id === "map.missing" || f.id === "map.not_found",
      ),
    ).toBe(true);
    expect(
      report.recommendations.some(
        (r) =>
          r.id.includes("init") ||
          /run\s+.*init|agent-doctor init/i.test(r.message),
      ),
    ).toBe(true);
  });

  it("access.denied on a path does not abort the entire report", async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");
    mkdirSync(join(base, "codex"), { recursive: true });

    const denied: AgentAdapter = {
      id: "claude-code",
      async detect(): Promise<AgentPresence> {
        const err = new Error(
          "EACCES: permission denied, scandir '/secret/claude'",
        ) as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      },
      async skillsRoots(): Promise<string[]> {
        return [];
      },
      async instructionFiles(): Promise<string[]> {
        return [];
      },
      async memoryPointers(): Promise<string[]> {
        return [];
      },
      proposeWireToSkillsHub(): FixAction[] {
        return [];
      },
      proposeWireMemory(): FixAction[] {
        return [];
      },
    };

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        denied,
        stubAdapter("codex", { roots: [hub], home: join(base, "codex") }),
      ],
      projectRoot: base,
    });

    expect(report.findings.some((f) => f.id === "access.denied")).toBe(true);
    expect(report.agents.some((a) => a.id === "codex")).toBe(true);
    expect(report.sync.agents_in_scope).toContain("codex");
    expect(report.overall).toMatchObject({
      score: expect.any(Number),
      grade: expect.stringMatching(/^(green|yellow|red)$/),
    });
    expect(report.domains.length).toBe(6);
  });

  it("agents_in_scope excludes ignored agents", async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
        agents: [
          {
            id: "codex",
            adapter: "codex",
            config_home: "/x",
            primary: false,
            ignored: true,
          },
          {
            id: "claude-code",
            adapter: "claude-code",
            config_home: "/c",
            primary: true,
            ignored: false,
          },
        ],
      }),
      adapters: [
        stubAdapter("claude-code", { roots: [hub] }),
        stubAdapter("codex", { roots: [hub] }),
      ],
    });

    expect(report.sync.agents_in_scope).toContain("claude-code");
    expect(report.sync.agents_in_scope).not.toContain("codex");
    expect(report.agents.find((a) => a.id === "codex")?.ignored).toBe(true);
  });
});

describe("isAgentOnHub", () => {
  it("matches resolved paths", () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");
    expect(isAgentOnHub([hub], hub)).toBe(true);
    expect(isAgentOnHub([realpathSync(hub)], hub)).toBe(true);
    expect(isAgentOnHub([makePopulatedRoot(base, "other")], hub)).toBe(false);
  });
});
