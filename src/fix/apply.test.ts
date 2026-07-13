import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FixAction, HomeMap } from "../engine/types.js";
import { loadMap } from "../map/load.js";
import { saveMap } from "../map/save.js";
import { applyFixPlan, type ApplyContext } from "./apply.js";

const temps: string[] = [];

function tempDir(prefix = "fix-apply-"): string {
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

function baseMap(sync_target: string | null = null): HomeMap {
  return {
    version: 1,
    skills: { global_roots: [], sync_target },
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
  };
}

describe("applyFixPlan", () => {
  it("creates symlink to hub when path is free", () => {
    const base = tempDir();
    const hub = join(base, "hub");
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, "SKILL.md"), "# skill\n");
    const agentSkills = join(base, "agent", "skills");
    mkdirSync(join(base, "agent"), { recursive: true });

    const action: FixAction = {
      id: "fix.wire",
      kind: "symlink_skills_hub",
      description: `Symlink ${agentSkills} → ${hub}`,
      target: agentSkills,
      value: hub,
      agent_id: "codex",
    };

    const results = applyFixPlan([action], { hub });
    expect(results[0]!.status).toBe("applied");
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(true);
    expect(readlinkSync(agentSkills)).toBe(hub);
  });

  it("rejects copy_tree actions without writing", () => {
    const base = tempDir();
    const src = join(base, "src-skills");
    const dest = join(base, "dest-skills");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "SKILL.md"), "# skill\n");

    const action: FixAction = {
      id: "fix.copy",
      kind: "copy_tree",
      description: "Copy tree",
      target: dest,
      value: src,
    };

    const results = applyFixPlan([action], {});
    expect(results[0]!.status).toBe("rejected");
    expect(existsSync(dest)).toBe(false);
  });

  it("appends instruction link block without rewriting whole file", () => {
    const base = tempDir();
    const instr = join(base, "CLAUDE.md");
    const product = join(base, "product.md");
    writeFileSync(instr, "# Project\n\nNotes here.\n");
    writeFileSync(product, "# Product\n");

    const action: FixAction = {
      id: "fix.append_product",
      kind: "append_instruction_link",
      description: `Append link to ${product}`,
      target: instr,
      value: product,
    };

    const results = applyFixPlan([action], {});
    expect(results[0]!.status).toBe("applied");
    const content = readFileSync(instr, "utf8");
    expect(content.startsWith("# Project")).toBe(true);
    expect(content).toContain("product.md");
    expect(content).toMatch(/Notes here/);
  });

  it("sets map.skills.sync_target via set_sync_target", () => {
    const home = tempDir();
    saveMap(baseMap(null), { home });
    const mapFile = join(home, "map.yml");

    const action: FixAction = {
      id: "fix.set_sync_target",
      kind: "set_sync_target",
      description: "Set sync_target to /chosen-hub",
      target: mapFile,
      value: "/chosen-hub",
    };

    const results = applyFixPlan([action], { doctorHome: home });
    expect(results[0]!.status).toBe("applied");
    const map = loadMap({ home });
    expect(map?.skills.sync_target).toBe("/chosen-hub");
  });

  it("skips conflicting symlink target and continues with next action", () => {
    const base = tempDir();
    const hub = join(base, "hub");
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, "SKILL.md"), "# skill\n");

    const conflictPath = join(base, "agent-a", "skills");
    mkdirSync(conflictPath, { recursive: true });
    writeFileSync(join(conflictPath, "private.md"), "private\n");

    const freePath = join(base, "agent-b", "skills");
    mkdirSync(join(base, "agent-b"), { recursive: true });

    const actions: FixAction[] = [
      {
        id: "fix.a",
        kind: "symlink_skills_hub",
        description: "conflict",
        target: conflictPath,
        value: hub,
      },
      {
        id: "fix.b",
        kind: "symlink_skills_hub",
        description: "free",
        target: freePath,
        value: hub,
      },
    ];

    const results = applyFixPlan(actions, { hub });
    expect(results[0]!.status).toBe("skipped");
    expect(results[1]!.status).toBe("applied");
    expect(existsSync(join(conflictPath, "private.md"))).toBe(true);
    expect(lstatSync(freePath).isSymbolicLink()).toBe(true);
  });

  it("does not apply wire/symlink without hub (no silent pick)", () => {
    const base = tempDir();
    const agentSkills = join(base, "skills");
    mkdirSync(base, { recursive: true });

    const action: FixAction = {
      id: "fix.wire",
      kind: "symlink_skills_hub",
      description: "no hub",
      target: agentSkills,
    };

    const results = applyFixPlan([action], {} satisfies ApplyContext);
    expect(results[0]!.status).toBe("skipped");
    expect(results[0]!.reason).toMatch(/sync_target|hub/i);
    expect(existsSync(agentSkills)).toBe(false);
  });

  it("set_sync_target without value is skipped (no silent pick)", () => {
    const home = tempDir();
    saveMap(baseMap(null), { home });

    const action: FixAction = {
      id: "fix.set",
      kind: "set_sync_target",
      description: "missing value",
      target: join(home, "map.yml"),
    };

    const results = applyFixPlan([action], { doctorHome: home });
    expect(results[0]!.status).toBe("skipped");
    expect(loadMap({ home })?.skills.sync_target).toBeNull();
  });

  it("dryRun applies nothing to disk", () => {
    const base = tempDir();
    const hub = join(base, "hub");
    mkdirSync(hub, { recursive: true });
    const agentSkills = join(base, "agent", "skills");
    mkdirSync(join(base, "agent"), { recursive: true });

    const action: FixAction = {
      id: "fix.wire",
      kind: "symlink_skills_hub",
      description: "symlink",
      target: agentSkills,
      value: hub,
    };

    const results = applyFixPlan([action], { hub, dryRun: true });
    expect(results[0]!.status).toBe("applied");
    expect(existsSync(agentSkills)).toBe(false);
  });

  it("does not overwrite non-empty non-link dir when force is default off", () => {
    const base = tempDir();
    const hub = join(base, "hub");
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, "SKILL.md"), "# skill\n");

    const agentSkills = join(base, "agent", "skills");
    mkdirSync(agentSkills, { recursive: true });
    writeFileSync(join(agentSkills, "local-skill.md"), "keep me\n");

    const action: FixAction = {
      id: "fix.wire",
      kind: "symlink_skills_hub",
      description: "symlink",
      target: agentSkills,
      value: hub,
    };

    // force omitted = default off
    const results = applyFixPlan([action], { hub });
    expect(results[0]!.status).toBe("skipped");
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(agentSkills, "local-skill.md"), "utf8")).toBe(
      "keep me\n",
    );
  });

  it("does not overwrite non-empty non-link dir when force is explicitly false", () => {
    const base = tempDir();
    const hub = join(base, "hub");
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, "SKILL.md"), "# skill\n");

    const agentSkills = join(base, "agent", "skills");
    mkdirSync(agentSkills, { recursive: true });
    writeFileSync(join(agentSkills, "local-skill.md"), "keep me\n");

    const action: FixAction = {
      id: "fix.wire",
      kind: "symlink_skills_hub",
      description: "symlink",
      target: agentSkills,
      value: hub,
    };

    const results = applyFixPlan([action], { hub, force: false });
    expect(results[0]!.status).toBe("skipped");
    expect(existsSync(join(agentSkills, "local-skill.md"))).toBe(true);
  });

  it("replaces empty non-link directory with symlink (safe)", () => {
    const base = tempDir();
    const hub = join(base, "hub");
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, "SKILL.md"), "# skill\n");

    const agentSkills = join(base, "agent", "skills");
    mkdirSync(agentSkills, { recursive: true }); // empty dir occupies path

    const action: FixAction = {
      id: "fix.wire",
      kind: "symlink_skills_hub",
      description: "symlink",
      target: agentSkills,
      value: hub,
    };

    const results = applyFixPlan([action], { hub });
    expect(results[0]!.status).toBe("applied");
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(true);
    expect(readlinkSync(agentSkills)).toBe(hub);
  });

  it("with force true replaces non-empty non-link dir with symlink", () => {
    const base = tempDir();
    const hub = join(base, "hub");
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, "SKILL.md"), "# skill\n");

    const agentSkills = join(base, "agent", "skills");
    mkdirSync(agentSkills, { recursive: true });
    writeFileSync(join(agentSkills, "local-skill.md"), "will be replaced\n");

    const action: FixAction = {
      id: "fix.wire",
      kind: "symlink_skills_hub",
      description: "symlink",
      target: agentSkills,
      value: hub,
    };

    const results = applyFixPlan([action], { hub, force: true });
    expect(results[0]!.status).toBe("applied");
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(true);
    expect(readlinkSync(agentSkills)).toBe(hub);
  });

  it("link-block append is idempotent on second apply", () => {
    const base = tempDir();
    const instr = join(base, "AGENTS.md");
    const product = join(base, "product.md");
    writeFileSync(instr, "# Agents\n\nIntro.\n");
    writeFileSync(product, "# Product\n");

    const action: FixAction = {
      id: "fix.append_product",
      kind: "append_instruction_link",
      description: `Append link to ${product}`,
      target: instr,
      value: product,
    };

    const first = applyFixPlan([action], {});
    expect(first[0]!.status).toBe("applied");
    const afterFirst = readFileSync(instr, "utf8");
    const markerCountFirst = (
      afterFirst.match(/<!-- agent-doctor:link -->/g) ?? []
    ).length;
    expect(markerCountFirst).toBe(1);

    const second = applyFixPlan([action], {});
    expect(second[0]!.status).toBe("applied");
    const afterSecond = readFileSync(instr, "utf8");
    const markerCountSecond = (
      afterSecond.match(/<!-- agent-doctor:link -->/g) ?? []
    ).length;
    expect(markerCountSecond).toBe(1);
    expect(afterSecond).toBe(afterFirst);
  });

  it("rejects copy-tree-like kinds without writing", () => {
    const base = tempDir();
    const dest = join(base, "dest");
    for (const kind of ["copy_tree", "copy_skills", "content_copy"] as const) {
      const action: FixAction = {
        id: `fix.${kind}`,
        kind,
        description: kind,
        target: dest,
        value: join(base, "src"),
      };
      const results = applyFixPlan([action], {});
      expect(results[0]!.status).toBe("rejected");
    }
    expect(existsSync(dest)).toBe(false);
  });

  it("temp-dir apply + re-check proves symlink and link wiring", () => {
    const base = tempDir();
    const hub = join(base, "hub");
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, "SKILL.md"), "# skill\n");

    const agentSkills = join(base, "agent", "skills");
    mkdirSync(join(base, "agent"), { recursive: true });

    const instr = join(base, "project", "CLAUDE.md");
    const product = join(base, "project", "product.md");
    mkdirSync(join(base, "project"), { recursive: true });
    writeFileSync(instr, "# Project\n");
    writeFileSync(product, "# Product\n");

    const home = join(base, "doctor-home");
    mkdirSync(home, { recursive: true });
    saveMap(baseMap(null), { home });

    const actions: FixAction[] = [
      {
        id: "fix.wire",
        kind: "symlink_skills_hub",
        description: "wire skills",
        target: agentSkills,
        value: hub,
        agent_id: "codex",
      },
      {
        id: "fix.link",
        kind: "append_instruction_link",
        description: "link product",
        target: instr,
        value: product,
      },
      {
        id: "fix.sync",
        kind: "set_sync_target",
        description: "set hub",
        target: join(home, "map.yml"),
        value: hub,
      },
    ];

    const results = applyFixPlan(actions, { hub, doctorHome: home });
    expect(results.every((r) => r.status === "applied")).toBe(true);

    // re-check path: filesystem + map reflect applied plan
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(true);
    expect(readlinkSync(agentSkills)).toBe(hub);
    expect(existsSync(join(agentSkills, "SKILL.md"))).toBe(true);

    const content = readFileSync(instr, "utf8");
    expect(content).toContain("<!-- agent-doctor:link -->");
    expect(content).toContain("product.md");

    const map = loadMap({ home });
    expect(map?.skills.sync_target).toBe(hub);

    // re-apply is stable (idempotent re-check path)
    const again = applyFixPlan(actions, { hub, doctorHome: home });
    expect(again.every((r) => r.status === "applied")).toBe(true);
    expect(
      (readFileSync(instr, "utf8").match(/<!-- agent-doctor:link -->/g) ?? [])
        .length,
    ).toBe(1);
  });
});
