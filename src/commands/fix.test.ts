import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentAdapter, AdapterContext } from "../adapters/types.js";
import type { AgentPresence, FixAction, HomeMap } from "../engine/types.js";
import { saveMap } from "../map/save.js";
import {
  defaultConfirm,
  parseFixFlags,
  runFix,
} from "./fix.js";

const temps: string[] = [];

function tempDir(prefix = "fix-cmd-"): string {
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

function baseMap(skills: HomeMap["skills"], agents: HomeMap["agents"] = []): HomeMap {
  return {
    version: 1,
    skills,
    vaults: [],
    agents,
    projects: { roots: [], entries: [] },
  };
}

function stubAdapter(
  id: string,
  roots: string[],
  home: string,
  wire: FixAction[] = [],
): AgentAdapter {
  return {
    id,
    async detect(): Promise<AgentPresence> {
      return {
        id,
        adapter: id,
        installed: true,
        config_home: home,
        depth: "deep",
      };
    },
    async skillsRoots(_ctx?: AdapterContext): Promise<string[]> {
      return roots;
    },
    async instructionFiles(projectRoot?: string): Promise<string[]> {
      if (!projectRoot) return [];
      return [join(projectRoot, id === "claude-code" ? "CLAUDE.md" : "AGENTS.md")];
    },
    async memoryPointers(): Promise<string[]> {
      return [];
    },
    proposeWireToSkillsHub(hub: string): FixAction[] {
      if (wire.length > 0) return wire;
      const agentSkills = join(home, "skills");
      return [
        {
          id: `fix.wire_${id}_skills`,
          kind: "symlink_skills_hub",
          description: `Symlink ${agentSkills} → ${hub}`,
          target: agentSkills,
          agent_id: id,
        },
      ];
    },
    proposeWireMemory(): FixAction[] {
      return [];
    },
  };
}

describe("parseFixFlags", () => {
  it("parses --dry-run and --yes", () => {
    const flags = parseFixFlags(["--dry-run", "--yes"]);
    expect(flags.dryRun).toBe(true);
    expect(flags.yes).toBe(true);
  });

  it("parses --non-interactive as yes and optional --sync-target", () => {
    const flags = parseFixFlags([
      "--non-interactive",
      "--sync-target",
      "/chosen",
    ]);
    expect(flags.yes).toBe(true);
    expect(flags.syncTarget).toBe("/chosen");
  });

  it("defaults dryRun and yes to false", () => {
    const flags = parseFixFlags([]);
    expect(flags.dryRun).toBe(false);
    expect(flags.yes).toBe(false);
    expect(flags.syncTarget).toBeUndefined();
  });
});

describe("defaultConfirm", () => {
  it("refuses apply when stdin is not a TTY (CI-safe)", async () => {
    // Vitest runs non-TTY; default confirm must not hang and must deny apply.
    const ok = await defaultConfirm([
      {
        id: "x",
        kind: "set_sync_target",
        description: "set",
        value: "/hub",
      },
    ]);
    expect(ok).toBe(false);
  });
});

describe("runFix", () => {
  it("fix --dry-run prints fix_plan without writing user project files", async () => {
    const base = tempDir();
    const doctorHome = join(base, "doctor");
    const agentHome = join(base, "codex");
    mkdirSync(agentHome, { recursive: true });
    const hub = makePopulatedRoot(base, "hub");
    const privateRoot = makePopulatedRoot(agentHome, "skills");

    saveMap(
      baseMap(
        { global_roots: [hub], sync_target: hub },
        [
          {
            id: "codex",
            adapter: "codex",
            config_home: agentHome,
            primary: false,
            ignored: false,
          },
        ],
      ),
      { home: doctorHome },
    );

    const lines: string[] = [];
    const { exitCode, report, applied } = await runFix({
      args: ["--dry-run"],
      checks: {
        home: doctorHome,
        map: baseMap(
          { global_roots: [hub], sync_target: hub },
          [
            {
              id: "codex",
              adapter: "codex",
              config_home: agentHome,
              primary: false,
              ignored: false,
            },
          ],
        ),
        adapters: [stubAdapter("codex", [privateRoot], agentHome)],
      },
      doctorHome,
      stdout: (line) => lines.push(line),
    });

    const text = lines.join("\n");
    expect(text).toMatch(/fix plan|dry-run|DRY-RUN/i);
    expect(report.fix_plan?.length ?? 0).toBeGreaterThanOrEqual(0);
    // private skills tree must not be replaced / deleted in dry-run
    expect(existsSync(join(privateRoot, "SKILL.md"))).toBe(true);
    expect(lstatSync(privateRoot).isSymbolicLink()).toBe(false);
    expect(applied).toBe(false);
    expect(exitCode).toBeGreaterThanOrEqual(0);
  });

  it("fix --dry-run performs zero writes even for map-updating plan items", async () => {
    const base = tempDir();
    const doctorHome = join(base, "doctor");
    const hubA = makePopulatedRoot(base, "hub-a");
    const hubB = makePopulatedRoot(base, "hub-b");
    const mapFile = join(doctorHome, "map.yml");

    // No pre-existing map on disk — dry-run must not create one.
    expect(existsSync(mapFile)).toBe(false);

    const agentSkills = join(base, "would-be-symlink");
    const lines: string[] = [];
    const { applied } = await runFix({
      args: ["--dry-run", "--sync-target", hubA],
      checks: {
        home: doctorHome,
        map: baseMap({ global_roots: [hubA, hubB], sync_target: null }),
        adapters: [],
      },
      doctorHome,
      planOverride: [
        {
          id: "fix.set_sync_target",
          kind: "set_sync_target",
          description: `Set map.skills.sync_target to ${hubA}`,
          target: mapFile,
          value: hubA,
        },
        {
          id: "evil-symlink",
          kind: "symlink_skills_hub",
          description: "would symlink",
          target: agentSkills,
          value: hubA,
        },
      ],
      stdout: (line) => lines.push(line),
    });

    expect(applied).toBe(false);
    expect(existsSync(mapFile)).toBe(false);
    expect(existsSync(agentSkills)).toBe(false);
    expect(lines.join("\n")).toMatch(/dry-run|no files written/i);
  });

  it("fix without --yes prompts confirm and does not apply on decline", async () => {
    const base = tempDir();
    const doctorHome = join(base, "doctor");
    const agentHome = join(base, "codex");
    mkdirSync(agentHome, { recursive: true });
    const hub = makePopulatedRoot(base, "hub");
    // Free skills path (missing) so apply would create symlink if confirmed
    const agentSkills = join(agentHome, "skills");

    const confirm = vi.fn(async () => false);

    const lines: string[] = [];
    const { applied } = await runFix({
      args: [],
      checks: {
        home: doctorHome,
        map: baseMap(
          { global_roots: [hub], sync_target: hub },
          [
            {
              id: "codex",
              adapter: "codex",
              config_home: agentHome,
              primary: false,
              ignored: false,
            },
          ],
        ),
        adapters: [stubAdapter("codex", [], agentHome)],
      },
      doctorHome,
      confirm,
      stdout: (line) => lines.push(line),
    });

    expect(confirm).toHaveBeenCalled();
    expect(applied).toBe(false);
    expect(existsSync(agentSkills)).toBe(false);
    expect(lines.join("\n")).toMatch(/confirm|cancelled|aborted/i);
  });

  it("fix without --yes applies when interactive confirm accepts", async () => {
    const base = tempDir();
    const doctorHome = join(base, "doctor");
    const agentHome = join(base, "codex");
    mkdirSync(agentHome, { recursive: true });
    const hub = makePopulatedRoot(base, "hub");
    const agentSkills = join(agentHome, "skills");

    const confirm = vi.fn(async (plan: FixAction[]) => {
      expect(plan.length).toBeGreaterThan(0);
      return true;
    });

    const lines: string[] = [];
    const { applied, afterReport } = await runFix({
      args: [],
      checks: {
        home: doctorHome,
        map: baseMap(
          { global_roots: [hub], sync_target: hub },
          [
            {
              id: "codex",
              adapter: "codex",
              config_home: agentHome,
              primary: false,
              ignored: false,
            },
          ],
        ),
        adapters: [stubAdapter("codex", [], agentHome)],
      },
      doctorHome,
      confirm,
      stdout: (line) => lines.push(line),
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(applied).toBe(true);
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(true);
    expect(afterReport).toBeDefined();
    expect(lines.join("\n")).toMatch(/Overall:|grade|GREEN|YELLOW|RED/i);
  });

  it("fix --yes applies safe plan items, re-runs checks, prints new grade", async () => {
    const base = tempDir();
    const doctorHome = join(base, "doctor");
    const agentHome = join(base, "codex");
    mkdirSync(agentHome, { recursive: true });
    const hub = makePopulatedRoot(base, "hub");
    const agentSkills = join(agentHome, "skills");

    const lines: string[] = [];
    const { applied, afterReport, exitCode, results } = await runFix({
      args: ["--yes"],
      checks: {
        home: doctorHome,
        map: baseMap(
          { global_roots: [hub], sync_target: hub },
          [
            {
              id: "codex",
              adapter: "codex",
              config_home: agentHome,
              primary: false,
              ignored: false,
            },
          ],
        ),
        adapters: [stubAdapter("codex", [], agentHome)],
      },
      doctorHome,
      stdout: (line) => lines.push(line),
    });

    expect(applied).toBe(true);
    expect(results.some((r) => r.status === "applied")).toBe(true);
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(true);
    expect(afterReport).toBeDefined();
    const text = lines.join("\n");
    expect(text).toMatch(/Overall:|grade|GREEN|YELLOW|RED/i);
    expect(afterReport!.overall.grade).toBeDefined();
    expect(exitCode).toBeGreaterThanOrEqual(0);
  });

  it("fix --yes does not call confirm callback", async () => {
    const base = tempDir();
    const doctorHome = join(base, "doctor");
    const hub = makePopulatedRoot(base, "hub");
    const confirm = vi.fn(async () => false);

    await runFix({
      args: ["--yes"],
      checks: {
        home: doctorHome,
        map: baseMap({ global_roots: [hub], sync_target: hub }),
        adapters: [],
      },
      doctorHome,
      confirm,
      planOverride: [
        {
          id: "fix.set_sync_target",
          kind: "set_sync_target",
          description: "set hub",
          target: join(doctorHome, "map.yml"),
          value: hub,
        },
      ],
      stdout: () => {},
    });

    expect(confirm).not.toHaveBeenCalled();
  });

  it("fix --yes sets sync_target when --sync-target provided on conflict", async () => {
    const base = tempDir();
    const doctorHome = join(base, "doctor");
    const hubA = makePopulatedRoot(base, "hub-a");
    const hubB = makePopulatedRoot(base, "hub-b");

    saveMap(
      baseMap({ global_roots: [hubA, hubB], sync_target: null }),
      { home: doctorHome },
    );

    const lines: string[] = [];
    const { applied } = await runFix({
      args: ["--yes", "--sync-target", hubA],
      checks: {
        home: doctorHome,
        map: baseMap({ global_roots: [hubA, hubB], sync_target: null }),
        adapters: [],
      },
      doctorHome,
      stdout: (line) => lines.push(line),
    });

    expect(applied).toBe(true);
    const mapContent = readFileSync(join(doctorHome, "map.yml"), "utf8");
    expect(mapContent).toContain(hubA);
  });

  it("never content-copies skill trees even if plan includes copy_tree", async () => {
    const base = tempDir();
    const doctorHome = join(base, "doctor");
    const src = makePopulatedRoot(base, "src-skills");
    const dest = join(base, "dest-skills");

    const lines: string[] = [];
    await runFix({
      args: ["--yes"],
      checks: {
        home: doctorHome,
        map: baseMap({ global_roots: [src], sync_target: src }),
        adapters: [],
      },
      doctorHome,
      // Inject a hostile plan via planOverrides after checks
      planOverride: [
        {
          id: "evil-copy",
          kind: "copy_tree",
          description: "copy",
          target: dest,
          value: src,
        },
      ],
      stdout: (line) => lines.push(line),
    });

    expect(existsSync(dest)).toBe(false);
    expect(lines.join("\n")).toMatch(/reject|copy|skip/i);
  });
});
