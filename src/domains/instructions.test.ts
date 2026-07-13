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
import type { AgentPresence, FixAction, HomeMap } from "../engine/types.js";
import type { DomainCheckContext } from "./context.js";
import { checkInstructions } from "./instructions.js";

const temps: string[] = [];

function tempDir(prefix = "instr-domain-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length > 0) {
    rmSync(temps.pop()!, { recursive: true, force: true });
  }
});

function emptyMap(): HomeMap {
  return {
    version: 1,
    skills: { global_roots: [], sync_target: null },
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
  };
}

function presence(id: string): AgentPresence {
  return {
    id,
    adapter: id,
    installed: true,
    depth: "deep",
    config_home: `/tmp/${id}`,
  };
}

function stubAdapter(
  id: string,
  files: string[],
  expected: string[] = [],
): AgentAdapter & { expectedInstructionFiles?: (projectRoot?: string) => string[] } {
  return {
    id,
    async detect(): Promise<AgentPresence> {
      return presence(id);
    },
    async skillsRoots(_ctx?: AdapterContext): Promise<string[]> {
      return [];
    },
    async instructionFiles(): Promise<string[]> {
      return files;
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
    expectedInstructionFiles(projectRoot?: string): string[] {
      return expected.length > 0
        ? expected
        : projectRoot
          ? [join(projectRoot, id === "claude-code" ? "CLAUDE.md" : "AGENTS.md")]
          : [];
    },
  };
}

describe("checkInstructions", () => {
  it("returns findings with stable ids and agents_affected", async () => {
    const project = tempDir();
    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence("claude-code")],
      projectRoot: project,
      adapters: [
        stubAdapter("claude-code", [], [join(project, "CLAUDE.md")]),
      ],
    });

    for (const f of findings) {
      expect(f.id).toMatch(/^instructions\./);
      expect(f.domain).toBe("instructions");
      expect(Array.isArray(f.agents_affected)).toBe(true);
    }
  });

  it("flags missing expected project instruction files", async () => {
    const project = tempDir();
    // no CLAUDE.md created

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence("claude-code")],
      projectRoot: project,
      adapters: [
        stubAdapter("claude-code", [], [join(project, "CLAUDE.md")]),
      ],
    });

    const missing = findings.filter(
      (f) => f.id === "instructions.missing_file",
    );
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing[0]!.agents_affected).toContain("claude-code");
    expect(missing[0]!.evidence.some((e) => e.endsWith("CLAUDE.md"))).toBe(
      true,
    );
  });

  it("does not flag when expected instruction files exist", async () => {
    const project = tempDir();
    const claudeMd = join(project, "CLAUDE.md");
    writeFileSync(claudeMd, "# project\n");

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence("claude-code")],
      projectRoot: project,
      adapters: [stubAdapter("claude-code", [claudeMd], [claudeMd])],
    });

    expect(
      findings.filter((f) => f.id === "instructions.missing_file"),
    ).toEqual([]);
  });

  it("without projectRoot, only checks user-level expected files when provided", async () => {
    const home = tempDir();
    const userAgents = join(home, "AGENTS.md");
    // missing on purpose

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence("codex")],
      adapters: [stubAdapter("codex", [], [userAgents])],
    });

    expect(
      findings.some(
        (f) =>
          f.id === "instructions.missing_file" &&
          f.agents_affected.includes("codex"),
      ),
    ).toBe(true);
  });

  it("skips ignored agents", async () => {
    const project = tempDir();
    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [{ ...presence("claude-code"), ignored: true }],
      projectRoot: project,
      adapters: [
        stubAdapter("claude-code", [], [join(project, "CLAUDE.md")]),
      ],
    });
    expect(findings).toEqual([]);
  });

  it("skips uninstalled agents", async () => {
    const project = tempDir();
    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [{ ...presence("claude-code"), installed: false }],
      projectRoot: project,
      adapters: [
        stubAdapter("claude-code", [], [join(project, "CLAUDE.md")]),
      ],
    });
    expect(findings).toEqual([]);
  });
});
