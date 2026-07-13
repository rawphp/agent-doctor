import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMap } from "../map/load.js";
import {
  formatMapSummary,
  parseYesFlag,
  runInitCommand,
} from "./init.js";
import { runMapCommand } from "./map.js";
import type { HomeMap } from "../engine/types.js";
import { HOME_MAP_VERSION } from "../engine/types.js";

describe("CLI init / map commands (REQ-006)", () => {
  let doctorHome: string;
  let fixtureHome: string;
  let previousEnv: string | undefined;
  let logs: string[];

  beforeEach(() => {
    doctorHome = mkdtempSync(join(tmpdir(), "agent-doctor-cmd-"));
    fixtureHome = mkdtempSync(join(tmpdir(), "agent-doctor-user-"));
    previousEnv = process.env.AGENT_DOCTOR_HOME;
    process.env.AGENT_DOCTOR_HOME = doctorHome;
    logs = [];
  });

  afterEach(() => {
    if (previousEnv === undefined) {
      delete process.env.AGENT_DOCTOR_HOME;
    } else {
      process.env.AGENT_DOCTOR_HOME = previousEnv;
    }
    rmSync(doctorHome, { recursive: true, force: true });
    rmSync(fixtureHome, { recursive: true, force: true });
  });

  const log = (line: string) => {
    logs.push(line);
  };

  it("parseYesFlag accepts --yes and --non-interactive", () => {
    expect(parseYesFlag(["init", "--yes"])).toBe(true);
    expect(parseYesFlag(["init", "--non-interactive"])).toBe(true);
    expect(parseYesFlag(["init"])).toBe(false);
    expect(parseYesFlag(["map", "--yes", "--other"])).toBe(true);
  });

  it("init creates map and prints summary of agents/skills/vaults found", async () => {
    mkdirSync(join(fixtureHome, ".claude"), { recursive: true });
    mkdirSync(join(fixtureHome, ".agents", "skills"), { recursive: true });
    const vault = join(fixtureHome, "Documents", "Obsidian", "Notes");
    mkdirSync(join(vault, ".obsidian"), { recursive: true });

    const result = await runInitCommand({
      args: ["--yes"],
      homeDir: fixtureHome,
      log,
    });

    expect(result.code).toBe(0);
    expect(existsSync(join(doctorHome, "map.yml"))).toBe(true);

    const summary = logs.join("\n");
    expect(summary).toMatch(/Wrote home map:/);
    expect(summary).toMatch(/agents:/);
    expect(summary).toMatch(/claude-code/);
    expect(summary).toMatch(/skills roots:\s*1/);
    expect(summary).toMatch(/vaults:\s*1/);
  });

  it("interactive init with zero vaults: empty skip records no vault + vaults_skipped marker", async () => {
    const promptVault = vi.fn(async () => "");

    const result = await runInitCommand({
      args: [],
      homeDir: fixtureHome,
      promptVault,
      log,
    });

    expect(result.code).toBe(0);
    expect(promptVault).toHaveBeenCalledTimes(1);
    expect(result.map.vaults).toEqual([]);
    expect(result.map.vaults_skipped).toBe(true);

    const raw = readFileSync(join(doctorHome, "map.yml"), "utf8");
    expect(raw).toMatch(/vaults_skipped:\s*true/);
    expect(raw).toMatch(/vaults:\s*\[\]|vaults:\s*\n/);
  });

  it("--yes / non-interactive mode does not hang on prompts", async () => {
    const promptVault = vi.fn(async () => {
      throw new Error("prompt must not be called in non-interactive mode");
    });

    const yesResult = await runInitCommand({
      args: ["--yes"],
      homeDir: fixtureHome,
      promptVault,
      log,
    });
    expect(yesResult.code).toBe(0);
    expect(promptVault).not.toHaveBeenCalled();
    expect(yesResult.map.vaults).toEqual([]);
    expect(yesResult.map.vaults_skipped).toBe(true);

    const nonIntResult = await runInitCommand({
      args: ["--non-interactive"],
      homeDir: fixtureHome,
      promptVault,
      log,
    });
    expect(nonIntResult.code).toBe(0);
    expect(promptVault).not.toHaveBeenCalled();
  });

  it("map refreshes discovery without wiping user sync_target/ignored flags", async () => {
    const skillsHub = join(fixtureHome, ".agents", "skills");
    mkdirSync(skillsHub, { recursive: true });
    mkdirSync(join(fixtureHome, ".claude"), { recursive: true });
    mkdirSync(join(fixtureHome, ".codex"), { recursive: true });

    await runInitCommand({
      args: ["--yes"],
      homeDir: fixtureHome,
      log,
    });

    // Simulate user edits: set sync_target and mark codex ignored
    const current = loadMap()!;
    const edited: HomeMap = {
      ...current,
      skills: {
        global_roots: current.skills.global_roots,
        sync_target: skillsHub,
      },
      agents: current.agents.map((a) =>
        a.id === "codex" ? { ...a, ignored: true } : a,
      ),
    };
    const { saveMap } = await import("../map/save.js");
    saveMap(edited);

    // New discovery appears after map refresh
    mkdirSync(join(fixtureHome, ".grok"), { recursive: true });

    const result = await runMapCommand({
      args: ["--yes"],
      homeDir: fixtureHome,
      log,
    });

    expect(result.code).toBe(0);
    expect(result.map.skills.sync_target).toBe(skillsHub);
    expect(result.map.agents.find((a) => a.id === "codex")?.ignored).toBe(true);
    expect(result.map.agents.map((a) => a.id).sort()).toEqual([
      "claude-code",
      "codex",
      "grok",
    ]);
    expect(logs.join("\n")).toMatch(/Refreshed home map:/);
  });

  it("formatMapSummary lists agents, skills, vaults counts", () => {
    const map: HomeMap = {
      version: HOME_MAP_VERSION,
      skills: {
        global_roots: ["/hub"],
        sync_target: "/hub",
      },
      vaults: [{ path: "/v", source: "manual" }],
      agents: [
        {
          id: "claude-code",
          adapter: "claude-code",
          config_home: "/c",
          primary: true,
          ignored: false,
        },
      ],
      projects: { roots: [], entries: [] },
    };
    const text = formatMapSummary(map, "/tmp/map.yml", "init");
    expect(text).toContain("Wrote home map: /tmp/map.yml");
    expect(text).toContain("agents: claude-code");
    expect(text).toContain("skills roots: 1");
    expect(text).toContain("vaults: 1");
  });
});
