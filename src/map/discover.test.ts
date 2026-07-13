import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discover } from "./discover.js";

describe("discover", () => {
  let fixtureHome: string;

  beforeEach(() => {
    fixtureHome = mkdtempSync(join(tmpdir(), "agent-doctor-discover-"));
  });

  afterEach(() => {
    rmSync(fixtureHome, { recursive: true, force: true });
  });

  it("populates multiple candidate skills roots without a single hard-coded hub", () => {
    const agentsSkills = join(fixtureHome, ".agents", "skills");
    const claudeSkills = join(fixtureHome, ".claude", "skills");
    const codexSkills = join(fixtureHome, ".codex", "skills");
    mkdirSync(agentsSkills, { recursive: true });
    mkdirSync(claudeSkills, { recursive: true });
    mkdirSync(codexSkills, { recursive: true });
    writeFileSync(join(agentsSkills, "README.md"), "hub-a");
    writeFileSync(join(claudeSkills, "README.md"), "hub-b");

    const result = discover({ homeDir: fixtureHome });

    expect(result.skills_roots).toEqual(
      expect.arrayContaining([agentsSkills, claudeSkills, codexSkills]),
    );
    expect(result.skills_roots.length).toBeGreaterThanOrEqual(2);
    for (const root of result.skills_roots) {
      expect(root.startsWith(fixtureHome)).toBe(true);
    }
  });

  it("does not invent skills roots that do not exist on disk", () => {
    const result = discover({ homeDir: fixtureHome });
    expect(result.skills_roots).toEqual([]);
  });

  it("discovers project root candidates under common locations", () => {
    const projects = join(fixtureHome, "Projects");
    const developer = join(fixtureHome, "Developer");
    mkdirSync(projects, { recursive: true });
    mkdirSync(developer, { recursive: true });

    const result = discover({ homeDir: fixtureHome });

    expect(result.project_roots).toEqual(
      expect.arrayContaining([projects, developer]),
    );
  });

  it("discovers vault candidates via .obsidian markers in common locations", () => {
    const vaultA = join(fixtureHome, "Documents", "Obsidian", "Notes");
    const vaultB = join(fixtureHome, "Obsidian", "Work");
    mkdirSync(join(vaultA, ".obsidian"), { recursive: true });
    mkdirSync(join(vaultB, ".obsidian"), { recursive: true });
    mkdirSync(join(fixtureHome, "Documents", "not-a-vault"), {
      recursive: true,
    });

    const result = discover({ homeDir: fixtureHome });

    expect(result.vaults.map((v) => v.path)).toEqual(
      expect.arrayContaining([vaultA, vaultB]),
    );
    expect(result.vaults.every((v) => v.source === "discovered")).toBe(true);
    expect(result.vaults.map((v) => v.path)).not.toContain(
      join(fixtureHome, "Documents", "not-a-vault"),
    );
  });

  it("returns empty arrays when nothing is present", () => {
    const result = discover({ homeDir: fixtureHome });
    expect(result.skills_roots).toEqual([]);
    expect(result.project_roots).toEqual([]);
    expect(result.vaults).toEqual([]);
  });
});
