import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentAdapter, AdapterContext } from "../adapters/types.js";
import type { AgentPresence, FixAction, HomeMap, Report } from "../engine/types.js";
import {
  parseStatusFlags,
  runStatus,
  scopeFromFlags,
} from "./status.js";

const temps: string[] = [];

function tempDir(prefix = "status-cmd-"): string {
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

function baseMap(skills: HomeMap["skills"]): HomeMap {
  return {
    version: 1,
    skills,
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
  };
}

function stubAdapter(
  id: string,
  roots: string[],
): AgentAdapter {
  return {
    id,
    async detect(): Promise<AgentPresence> {
      return {
        id,
        adapter: id,
        installed: true,
        config_home: `/tmp/${id}`,
        depth: "deep",
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

describe("parseStatusFlags", () => {
  it("defaults to non-json hybrid (no --all)", () => {
    const flags = parseStatusFlags([]);
    expect(flags.json).toBe(false);
    expect(flags.all).toBe(false);
    expect(scopeFromFlags(flags)).toBe("hybrid");
  });

  it("detects --json and --all", () => {
    const flags = parseStatusFlags(["--json", "--all"]);
    expect(flags.json).toBe(true);
    expect(flags.all).toBe(true);
    expect(scopeFromFlags(flags)).toBe("machine");
  });
});

describe("runStatus", () => {
  it("status without flags uses scope hybrid", async () => {
    const lines: string[] = [];
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");

    const { report, exitCode } = await runStatus({
      args: [],
      checks: {
        map: baseMap({ global_roots: [hub], sync_target: hub }),
        adapters: [stubAdapter("claude-code", [hub])],
      },
      stdout: (line) => lines.push(line),
    });

    expect(report.scope).toBe("hybrid");
    expect(lines.join("\n")).toMatch(/hybrid status/);
    expect(exitCode).toBe(0);
  });

  it("prints overall grade and sync matrix in terminal mode", async () => {
    const lines: string[] = [];
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");
    const privateRoot = makePopulatedRoot(base, "private");

    const { report, exitCode } = await runStatus({
      args: [],
      checks: {
        map: baseMap({ global_roots: [hub], sync_target: hub }),
        adapters: [
          stubAdapter("claude-code", [hub]),
          stubAdapter("codex", [privateRoot]),
        ],
      },
      stdout: (line) => lines.push(line),
    });

    const text = lines.join("\n");
    expect(text).toMatch(/Overall:/);
    expect(text).toMatch(/Sync target \(skills\)/);
    expect(text).toMatch(/claude-code/);
    expect(text).toMatch(/codex/);
    expect(report.overall.grade).not.toBe("green");
    expect(exitCode).toBeGreaterThan(0);
  });

  it("status --json prints Report JSON matching engine types", async () => {
    const lines: string[] = [];
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");

    const { report, exitCode } = await runStatus({
      args: ["--json"],
      checks: {
        map: baseMap({ global_roots: [hub], sync_target: hub }),
        adapters: [stubAdapter("claude-code", [hub])],
      },
      stdout: (line) => lines.push(line),
    });

    const parsed = JSON.parse(lines.join("\n")) as Report;
    expect(parsed.scope).toBe("hybrid");
    expect(parsed.overall.grade).toMatch(/^(green|yellow|red)$/);
    expect(parsed.sync).toMatchObject({
      agents_in_scope: expect.any(Array),
      aligned: expect.any(Boolean),
      memory_hubs: expect.any(Array),
    });
    expect(Array.isArray(parsed.agents)).toBe(true);
    expect(Array.isArray(parsed.domains)).toBe(true);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(Array.isArray(parsed.recommendations)).toBe(true);
    expect(report.scope).toBe(parsed.scope);
    expect(exitCode).toBe(0);
  });

  it("exit codes follow grade: 0 green, 1 yellow, 2 red", async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");
    const privateRoot = makePopulatedRoot(base, "private");

    const green = await runStatus({
      args: ["--json"],
      checks: {
        map: baseMap({ global_roots: [hub], sync_target: hub }),
        adapters: [stubAdapter("claude-code", [hub])],
      },
      stdout: () => {},
    });
    expect(green.report.overall.grade).toBe("green");
    expect(green.exitCode).toBe(0);

    const yellowOrRed = await runStatus({
      args: ["--json"],
      checks: {
        map: baseMap({ global_roots: [hub], sync_target: hub }),
        adapters: [
          stubAdapter("claude-code", [hub]),
          stubAdapter("codex", [privateRoot]),
        ],
      },
      stdout: () => {},
    });
    expect(yellowOrRed.report.overall.grade).not.toBe("green");
    expect([1, 2]).toContain(yellowOrRed.exitCode);
  });

  it("returns exit 3 on tool errors", async () => {
    const errs: string[] = [];
    const { exitCode } = await runStatus({
      args: ["--json"],
      checks: {
        // Force failure inside runChecks by providing a map that load would reject —
        // inject via adapters throwing.
        map: baseMap({ global_roots: [], sync_target: null }),
        adapters: [
          {
            id: "claude-code",
            async detect(): Promise<AgentPresence> {
              throw new Error("boom");
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
          },
        ],
      },
      stdout: () => {},
      stderr: (line) => errs.push(line),
    });

    expect(exitCode).toBe(3);
    expect(errs.join("\n")).toMatch(/boom/);
  });
});
