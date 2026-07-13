import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PRESENCE_ONLY_LIMITATION,
  createPresenceAdapter,
  detectFirstClassAgents,
  reportsSkillsOnHub,
} from "./presence.js";
import { createAdapterRegistry, listAdapterSupport } from "./registry.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-doctor-presence-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("detectFirstClassAgents (thin presence)", () => {
  let fixtureHome: string;

  beforeEach(() => {
    fixtureHome = mkdtempSync(join(tmpdir(), "agent-doctor-presence-map-"));
    tempDirs.push(fixtureHome);
  });

  it("returns empty when no agent homes exist", () => {
    expect(detectFirstClassAgents({ homeDir: fixtureHome })).toEqual([]);
  });

  it("detects each first-class home when present", () => {
    mkdirSync(join(fixtureHome, ".claude"), { recursive: true });
    mkdirSync(join(fixtureHome, ".codex"), { recursive: true });
    mkdirSync(join(fixtureHome, ".grok"), { recursive: true });

    const agents = detectFirstClassAgents({ homeDir: fixtureHome });
    expect(agents.map((a) => a.id).sort()).toEqual([
      "claude-code",
      "codex",
      "grok",
    ]);
    for (const agent of agents) {
      expect(agent.adapter).toBe(agent.id);
      expect(agent.primary).toBe(false);
      expect(agent.ignored).toBe(false);
      expect(agent.config_home).toBe(join(fixtureHome, homeRel(agent.id)));
    }
  });

  it("detects only homes that exist", () => {
    mkdirSync(join(fixtureHome, ".codex"), { recursive: true });
    const agents = detectFirstClassAgents({ homeDir: fixtureHome });
    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe("codex");
  });
});

function homeRel(id: string): string {
  switch (id) {
    case "claude-code":
      return ".claude";
    case "codex":
      return ".codex";
    case "grok":
      return ".grok";
    default:
      return id;
  }
}

describe("presence-only adapter", () => {
  it("detects installed agent when marker/home exists", async () => {
    const home = makeTempDir();
    mkdirSync(join(home, "config"), { recursive: true });
    const adapter = createPresenceAdapter({
      id: "gemini",
      home: join(home, "config"),
    });

    const presence = await adapter.detect();
    expect(presence.id).toBe("gemini");
    expect(presence.adapter).toBe("gemini");
    expect(presence.installed).toBe(true);
    expect(presence.config_home).toBe(join(home, "config"));
    expect(presence.depth).toBe("presence-only");
  });

  it("returns installed=false when marker is missing", async () => {
    const adapter = createPresenceAdapter({
      id: "cursor",
      home: join(makeTempDir(), "does-not-exist"),
    });

    const presence = await adapter.detect();
    expect(presence.installed).toBe(false);
    expect(presence.config_home).toBeUndefined();
    expect(presence.depth).toBe("presence-only");
  });

  it("never invents skills roots as healthy", async () => {
    const home = makeTempDir();
    // Even with a skills-looking dir present, presence-only does not claim roots
    mkdirSync(join(home, "skills"), { recursive: true });
    writeFileSync(join(home, "skills", "x.md"), "nope");

    const adapter = createPresenceAdapter({ id: "gemini", home });
    const roots = await adapter.skillsRoots({ projectRoot: home });
    expect(roots).toEqual([]);
  });

  it("never reports skills on hub true without evidence", async () => {
    const home = makeTempDir();
    mkdirSync(join(home, "skills"), { recursive: true });
    const adapter = createPresenceAdapter({ id: "gemini", home });

    expect(reportsSkillsOnHub(adapter)).toBe(false);
    expect(reportsSkillsOnHub(adapter, "/any/hub")).toBe(false);

    // No wire actions that would claim hub alignment
    expect(adapter.proposeWireToSkillsHub("/hub")).toEqual([]);
    expect(await adapter.instructionFiles(home)).toEqual([]);
    expect(await adapter.memoryPointers(home)).toEqual([]);
  });

  it("exposes honest limited-checks limitation message", () => {
    const adapter = createPresenceAdapter({ id: "gemini" });
    expect(adapter.id).toBe("gemini");
    expect(PRESENCE_ONLY_LIMITATION).toMatch(/limited checks/i);
    expect(PRESENCE_ONLY_LIMITATION).toMatch(/limited auto-fix/i);
  });
});

describe("adapter registry", () => {
  it("returns deep adapters for claude-code, codex, grok", async () => {
    const registry = createAdapterRegistry();

    for (const id of ["claude-code", "codex", "grok"] as const) {
      const adapter = registry.getAdapter(id);
      expect(adapter, `expected adapter for ${id}`).toBeDefined();
      expect(adapter!.id).toBe(id);
      expect(registry.getSupportLevel(id)).toBe("full");

      const presence = await adapter!.detect();
      expect(presence.depth).toBe("deep");
    }
  });

  it("returns presence adapters for configured unknown ids", async () => {
    const registry = createAdapterRegistry({
      presenceIds: ["gemini", "cursor"],
    });

    for (const id of ["gemini", "cursor"] as const) {
      const adapter = registry.getAdapter(id);
      expect(adapter, `expected presence adapter for ${id}`).toBeDefined();
      expect(adapter!.id).toBe(id);
      expect(registry.getSupportLevel(id)).toBe("presence");

      const presence = await adapter!.detect();
      expect(presence.depth).toBe("presence-only");
      // No invented skills claims
      expect(await adapter!.skillsRoots()).toEqual([]);
      expect(reportsSkillsOnHub(adapter!)).toBe(false);
    }
  });

  it("lists support level full|presence for agents command", () => {
    const listing = listAdapterSupport();
    const byId = Object.fromEntries(listing.map((e) => [e.id, e.supportLevel]));

    expect(byId["claude-code"]).toBe("full");
    expect(byId["codex"]).toBe("full");
    expect(byId["grok"]).toBe("full");
    expect(byId["gemini"]).toBe("presence");
    expect(byId["cursor"]).toBe("presence");

    // Shape is stable for a future agents command
    for (const entry of listing) {
      expect(["full", "presence"]).toContain(entry.supportLevel);
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
    }
  });
});
