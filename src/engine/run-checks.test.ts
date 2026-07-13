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
