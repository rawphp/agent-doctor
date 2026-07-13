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
import { checkProduct } from "./product.js";

const temps: string[] = [];

function tempDir(prefix = "product-domain-"): string {
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

function stubAdapter(id: string, files: string[]): AgentAdapter {
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
  };
}

describe("checkProduct", () => {
  it("returns findings with stable ids and agents_affected", async () => {
    const project = tempDir();
    writeFileSync(join(project, "product.md"), "# product\n");
    const instr = join(project, "CLAUDE.md");
    writeFileSync(instr, "# no links\n");

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence("claude-code")],
      projectRoot: project,
      adapters: [stubAdapter("claude-code", [instr])],
    });

    for (const f of findings) {
      expect(f.id).toMatch(/^product\./);
      expect(f.domain).toBe("product");
      expect(Array.isArray(f.agents_affected)).toBe(true);
    }
  });

  it("flags missing links from instruction files to product.md when it exists", async () => {
    const project = tempDir();
    writeFileSync(join(project, "product.md"), "# product\n");
    const instr = join(project, "CLAUDE.md");
    writeFileSync(instr, "No product reference here.\n");

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence("claude-code")],
      projectRoot: project,
      adapters: [stubAdapter("claude-code", [instr])],
    });

    const missing = findings.filter((f) => f.id === "product.missing_link");
    expect(missing.some((f) => f.message.includes("product.md"))).toBe(true);
    expect(missing[0]!.agents_affected).toContain("claude-code");
    expect(missing[0]!.evidence).toContain(instr);
  });

  it("flags missing links to roadmap.md when it exists", async () => {
    const project = tempDir();
    writeFileSync(join(project, "roadmap.md"), "# roadmap\n");
    const instr = join(project, "AGENTS.md");
    writeFileSync(instr, "Hello\n");

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence("codex")],
      projectRoot: project,
      adapters: [stubAdapter("codex", [instr])],
    });

    expect(
      findings.some(
        (f) =>
          f.id === "product.missing_link" && f.message.includes("roadmap.md"),
      ),
    ).toBe(true);
  });

  it("does not flag when instruction files link product and roadmap", async () => {
    const project = tempDir();
    writeFileSync(join(project, "product.md"), "# product\n");
    writeFileSync(join(project, "roadmap.md"), "# roadmap\n");
    const instr = join(project, "CLAUDE.md");
    writeFileSync(
      instr,
      "See [product](product.md) and [roadmap](./roadmap.md).\n",
    );

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence("claude-code")],
      projectRoot: project,
      adapters: [stubAdapter("claude-code", [instr])],
    });

    expect(findings.filter((f) => f.id === "product.missing_link")).toEqual(
      [],
    );
  });

  it("returns no findings when product/roadmap files do not exist", async () => {
    const project = tempDir();
    const instr = join(project, "CLAUDE.md");
    writeFileSync(instr, "# no product files in project\n");

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence("claude-code")],
      projectRoot: project,
      adapters: [stubAdapter("claude-code", [instr])],
    });

    expect(findings).toEqual([]);
  });

  it("returns no findings without projectRoot", async () => {
    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence("claude-code")],
      adapters: [stubAdapter("claude-code", [])],
    });
    expect(findings).toEqual([]);
  });

  it("accepts bare path mentions as links", async () => {
    const project = tempDir();
    writeFileSync(join(project, "product.md"), "# product\n");
    const instr = join(project, "CLAUDE.md");
    writeFileSync(instr, "Product context: product.md\n");

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence("claude-code")],
      projectRoot: project,
      adapters: [stubAdapter("claude-code", [instr])],
    });

    expect(findings.filter((f) => f.id === "product.missing_link")).toEqual(
      [],
    );
  });
});
