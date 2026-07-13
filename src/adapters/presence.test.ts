import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectFirstClassAgents } from "./presence.js";

describe("detectFirstClassAgents (thin presence)", () => {
  let fixtureHome: string;

  beforeEach(() => {
    fixtureHome = mkdtempSync(join(tmpdir(), "agent-doctor-presence-"));
  });

  afterEach(() => {
    rmSync(fixtureHome, { recursive: true, force: true });
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
