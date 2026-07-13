import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentAdapter, AdapterContext } from "../adapters/types.js";
import { EXIT_TOOL_ERROR } from "../engine/score.js";
import type {
  AgentPresence,
  FixAction,
  HomeMap,
  Report,
} from "../engine/types.js";
import type { DashboardServer } from "../surfaces/dashboard/server.js";
import {
  parseDashboardFlags,
  runDashboard,
  type DashboardRunOptions,
} from "./dashboard.js";

const temps: string[] = [];
const liveServers: DashboardServer[] = [];

function tempDir(prefix = "dashboard-cmd-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  while (liveServers.length > 0) {
    const s = liveServers.pop();
    await s?.close();
  }
  while (temps.length > 0) {
    const dir = temps.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
  process.exitCode = undefined;
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

function stubAdapter(id: string, roots: string[]): AgentAdapter {
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

function sampleReport(overrides: Partial<Report> = {}): Report {
  return {
    generated_at: "2026-07-14T12:00:00.000Z",
    scope: "hybrid",
    project_root: "/proj",
    sync: {
      skills_hub: "/hub/skills",
      memory_hubs: [],
      agents_in_scope: ["claude-code"],
      aligned: true,
    },
    overall: { score: 90, grade: "green" },
    agents: [
      {
        id: "claude-code",
        adapter: "claude-code",
        installed: true,
        config_home: "/h/.claude",
        depth: "deep",
      },
    ],
    domains: [
      {
        domain: "agent_presence",
        score: 100,
        grade: "green",
        summary: "ok",
      },
    ],
    findings: [
      {
        id: "finding.sample",
        severity: "info",
        domain: "agent_presence",
        message: "all good",
        evidence: [],
        agents_affected: ["claude-code"],
      },
    ],
    recommendations: [],
    ...overrides,
  };
}

function baseOpts(
  overrides: Partial<DashboardRunOptions> = {},
): DashboardRunOptions {
  return {
    // Unit tests must not hold the event loop open.
    waitUntilClose: false,
    openBrowser: async () => {},
    applyProcessExitCode: false,
    ...overrides,
  };
}

describe("parseDashboardFlags", () => {
  it("defaults: no open=false, no all, port undefined", () => {
    const flags = parseDashboardFlags([]);
    expect(flags.noOpen).toBe(false);
    expect(flags.all).toBe(false);
    expect(flags.port).toBeUndefined();
  });

  it("parses --no-open, --all, --port N and --port=N", () => {
    expect(parseDashboardFlags(["--no-open"]).noOpen).toBe(true);
    expect(parseDashboardFlags(["--all"]).all).toBe(true);
    expect(parseDashboardFlags(["--port", "4173"]).port).toBe(4173);
    expect(parseDashboardFlags(["--port=0"]).port).toBe(0);
  });
});

describe("runDashboard", () => {
  it("runs checks and serves HTML on 127.0.0.1 with overall grade + findings", async () => {
    const lines: string[] = [];
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");

    const result = await runDashboard(
      baseOpts({
        args: ["--port", "0", "--no-open"],
        checks: {
          map: baseMap({ global_roots: [hub], sync_target: hub }),
          adapters: [stubAdapter("claude-code", [hub])],
        },
        stdout: (line) => lines.push(line),
      }),
    );
    if (result.server) liveServers.push(result.server);

    expect(result.exitCode).toBe(0);
    expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
    expect(lines.join("\n")).toMatch(/http:\/\/127\.0\.0\.1:\d+/);

    const res = await fetch(result.url!);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/Agent Doctor|data-overall-grade/i);
    expect(html).toMatch(/data-overall-grade=["']green["']/i);
    expect(result.report.overall.grade).toBe("green");
  });

  it("accepts an injected report without re-running checks", async () => {
    let checksCalled = 0;
    const report = sampleReport({
      overall: { score: 40, grade: "yellow" },
      findings: [
        {
          id: "skills.agent_not_on_hub",
          severity: "warn",
          domain: "shared_skills_path",
          message: "codex off hub",
          evidence: [],
          agents_affected: ["codex"],
        },
      ],
      sync: {
        skills_hub: "/hub",
        memory_hubs: [],
        agents_in_scope: ["claude-code", "codex"],
        aligned: false,
      },
      agents: [
        {
          id: "claude-code",
          adapter: "claude-code",
          installed: true,
          depth: "deep",
        },
        {
          id: "codex",
          adapter: "codex",
          installed: true,
          depth: "deep",
        },
      ],
    });

    const result = await runDashboard(
      baseOpts({
        args: ["--port", "0", "--no-open"],
        report,
        // If checks ran despite report, this would throw / be invoked.
        checks: {
          map: baseMap({ global_roots: [], sync_target: null }),
          adapters: [
            {
              id: "should-not-run",
              async detect(): Promise<AgentPresence> {
                checksCalled += 1;
                throw new Error("runChecks should not be called");
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
      }),
    );
    if (result.server) liveServers.push(result.server);

    expect(checksCalled).toBe(0);
    expect(result.report.overall.grade).toBe("yellow");
    const html = await (await fetch(result.url!)).text();
    expect(html).toMatch(/data-overall-grade=["']yellow["']/i);
    expect(html).toContain("skills.agent_not_on_hub");
    // Sync matrix rows for agents in scope.
    expect(html).toMatch(/claude-code/);
    expect(html).toMatch(/codex/);
  });

  it("dashboard --all sets machine scope", async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, "hub");

    const result = await runDashboard(
      baseOpts({
        args: ["--all", "--port", "0", "--no-open"],
        checks: {
          map: baseMap({ global_roots: [hub], sync_target: hub }),
          adapters: [stubAdapter("claude-code", [hub])],
        },
        stdout: () => {},
      }),
    );
    if (result.server) liveServers.push(result.server);

    expect(result.report.scope).toBe("machine");
  });

  it("prints URL and opens browser unless --no-open", async () => {
    const opened: string[] = [];
    const lines: string[] = [];
    const report = sampleReport();

    const withOpen = await runDashboard(
      baseOpts({
        args: ["--port", "0"],
        report,
        openBrowser: async (url) => {
          opened.push(url);
        },
        stdout: (line) => lines.push(line),
      }),
    );
    if (withOpen.server) liveServers.push(withOpen.server);
    expect(opened).toEqual([withOpen.url]);
    expect(lines.join("\n")).toContain(withOpen.url!);

    opened.length = 0;
    const noOpen = await runDashboard(
      baseOpts({
        args: ["--port", "0", "--no-open"],
        report,
        openBrowser: async (url) => {
          opened.push(url);
        },
        stdout: () => {},
      }),
    );
    if (noOpen.server) liveServers.push(noOpen.server);
    expect(opened).toEqual([]);
  });

  it("on port conflict, tries the next port and prints the URL", async () => {
    // Occupy a free port so start on that port fails first.
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", () => resolve());
    });
    const occupied = (blocker.address() as { port: number }).port;

    const lines: string[] = [];
    try {
      const result = await runDashboard(
        baseOpts({
          args: ["--port", String(occupied), "--no-open"],
          report: sampleReport(),
          stdout: (line) => lines.push(line),
        }),
      );
      if (result.server) liveServers.push(result.server);

      expect(result.port).toBeGreaterThan(0);
      expect(result.port).not.toBe(occupied);
      expect(result.url).toMatch(
        new RegExp(`http://127\\.0\\.0\\.1:${result.port}/`),
      );
      expect(lines.join("\n")).toContain(result.url!);

      const html = await (await fetch(result.url!)).text();
      expect(html).toMatch(/Agent Doctor|data-overall-grade/i);
    } finally {
      await new Promise<void>((resolve, reject) => {
        blocker.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("does not call fix apply from the dashboard command path", async () => {
    const result = await runDashboard(
      baseOpts({
        args: ["--port", "0", "--no-open"],
        report: sampleReport(),
        stdout: () => {},
      }),
    );
    if (result.server) liveServers.push(result.server);

    const post = await fetch(result.url!, {
      method: "POST",
      body: "apply",
    });
    expect([404, 405]).toContain(post.status);

    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./dashboard.ts", import.meta.url), "utf8"),
    );
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(codeOnly).not.toMatch(
      /\bapplyFix\b|\bapplyFixPlan\b|\brunFix\b|\bfixApply\b/,
    );
    expect(codeOnly).not.toMatch(
      /from\s+["'][^"']*\/(?:fix|apply)[^"']*["']/,
    );
  });

  it("returns exit 3 on tool errors and does not start a server", async () => {
    const errs: string[] = [];
    const result = await runDashboard(
      baseOpts({
        args: ["--port", "0", "--no-open"],
        checks: {
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
      }),
    );

    expect(result.exitCode).toBe(EXIT_TOOL_ERROR);
    expect(result.server).toBeUndefined();
    expect(result.url).toBeUndefined();
    expect(errs.join("\n")).toMatch(/boom/);
  });
});
