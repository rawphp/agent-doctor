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
import { loadMap } from "./load.js";
import { runInit, runMap } from "./init.js";

describe("init / map path-unit", () => {
  let doctorHome: string;
  let fixtureHome: string;
  let previousEnv: string | undefined;

  beforeEach(() => {
    doctorHome = mkdtempSync(join(tmpdir(), "agent-doctor-init-"));
    fixtureHome = mkdtempSync(join(tmpdir(), "agent-doctor-user-"));
    previousEnv = process.env.AGENT_DOCTOR_HOME;
    process.env.AGENT_DOCTOR_HOME = doctorHome;
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

  it("init writes versioned map.yml under agent-doctor config home", async () => {
    mkdirSync(join(fixtureHome, ".claude"), { recursive: true });
    mkdirSync(join(fixtureHome, ".agents", "skills"), { recursive: true });
    mkdirSync(join(fixtureHome, "Projects"), { recursive: true });

    const map = await runInit({
      homeDir: fixtureHome,
      nonInteractive: true,
    });

    expect(map.version).toBe(1);
    expect(existsSync(join(doctorHome, "map.yml"))).toBe(true);

    const raw = readFileSync(join(doctorHome, "map.yml"), "utf8");
    expect(raw).toMatch(/version:\s*1\b/);

    const loaded = loadMap();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.skills.global_roots).toContain(
      join(fixtureHome, ".agents", "skills"),
    );
    expect(loaded!.projects.roots).toContain(join(fixtureHome, "Projects"));
    expect(loaded!.agents.some((a) => a.id === "claude-code")).toBe(true);
  });

  it("detects Claude Code, Codex, and Grok homes when present", async () => {
    mkdirSync(join(fixtureHome, ".claude"), { recursive: true });
    mkdirSync(join(fixtureHome, ".codex"), { recursive: true });
    mkdirSync(join(fixtureHome, ".grok"), { recursive: true });

    const map = await runInit({
      homeDir: fixtureHome,
      nonInteractive: true,
    });

    const ids = map.agents.map((a) => a.id).sort();
    expect(ids).toEqual(["claude-code", "codex", "grok"]);
    expect(map.agents.find((a) => a.id === "claude-code")?.config_home).toBe(
      join(fixtureHome, ".claude"),
    );
    expect(map.agents.find((a) => a.id === "codex")?.config_home).toBe(
      join(fixtureHome, ".codex"),
    );
    expect(map.agents.find((a) => a.id === "grok")?.config_home).toBe(
      join(fixtureHome, ".grok"),
    );
  });

  it("omits agents whose homes are absent", async () => {
    mkdirSync(join(fixtureHome, ".claude"), { recursive: true });

    const map = await runInit({
      homeDir: fixtureHome,
      nonInteractive: true,
    });

    expect(map.agents.map((a) => a.id)).toEqual(["claude-code"]);
  });

  it("when zero vaults discovered, init prompts and records manual vault path", async () => {
    const vaultPath = join(fixtureHome, "MyVault");
    mkdirSync(join(vaultPath, ".obsidian"), { recursive: true });

    const promptVault = vi.fn(async () => vaultPath);

    const map = await runInit({
      homeDir: fixtureHome,
      nonInteractive: false,
      promptVault,
    });

    expect(promptVault).toHaveBeenCalledTimes(1);
    expect(map.vaults).toEqual([{ path: vaultPath, source: "manual" }]);
  });

  it("when zero vaults discovered, init records explicit skip", async () => {
    const promptVault = vi.fn(async () => null);

    const map = await runInit({
      homeDir: fixtureHome,
      nonInteractive: false,
      promptVault,
    });

    expect(promptVault).toHaveBeenCalledTimes(1);
    expect(map.vaults).toEqual([]);
    // skip marker recorded so later runs know the user chose no vault
    expect(map.skills.sync_target).toBeNull();
    const raw = readFileSync(join(doctorHome, "map.yml"), "utf8");
    expect(raw).toMatch(/vaults:\s*\[\]|vaults:\s*\n/);
  });

  it("non-interactive init skips vault prompt when none discovered", async () => {
    const promptVault = vi.fn(async () => "/should-not-be-used");

    const map = await runInit({
      homeDir: fixtureHome,
      nonInteractive: true,
      promptVault,
    });

    expect(promptVault).not.toHaveBeenCalled();
    expect(map.vaults).toEqual([]);
  });

  it("init does not prompt when vaults are discovered", async () => {
    const vault = join(fixtureHome, "Documents", "Obsidian", "Notes");
    mkdirSync(join(vault, ".obsidian"), { recursive: true });
    const promptVault = vi.fn(async () => null);

    const map = await runInit({
      homeDir: fixtureHome,
      nonInteractive: false,
      promptVault,
    });

    expect(promptVault).not.toHaveBeenCalled();
    expect(map.vaults).toEqual([{ path: vault, source: "discovered" }]);
  });

  it("map refreshes discovery without vault prompt (no wizard chrome)", async () => {
    mkdirSync(join(fixtureHome, ".claude"), { recursive: true });

    await runInit({
      homeDir: fixtureHome,
      nonInteractive: true,
    });

    // New agent appears after init
    mkdirSync(join(fixtureHome, ".grok"), { recursive: true });
    mkdirSync(join(fixtureHome, ".agents", "skills"), { recursive: true });

    const promptVault = vi.fn(async () => null);
    const map = await runMap({
      homeDir: fixtureHome,
      promptVault,
    });

    expect(promptVault).not.toHaveBeenCalled();
    expect(map.agents.map((a) => a.id).sort()).toEqual([
      "claude-code",
      "grok",
    ]);
    expect(map.skills.global_roots).toContain(
      join(fixtureHome, ".agents", "skills"),
    );
  });

  it("map preserves previously recorded manual vaults", async () => {
    const vaultPath = join(fixtureHome, "ManualVault");
    mkdirSync(join(vaultPath, ".obsidian"), { recursive: true });

    await runInit({
      homeDir: fixtureHome,
      nonInteractive: false,
      promptVault: async () => vaultPath,
    });

    const map = await runMap({ homeDir: fixtureHome });
    expect(map.vaults).toEqual(
      expect.arrayContaining([{ path: vaultPath, source: "manual" }]),
    );
  });
});
