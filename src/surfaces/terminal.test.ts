import { describe, expect, it } from "vitest";
import type { Report } from "../engine/types.js";
import { formatTerminalReport } from "./terminal.js";

function sampleReport(overrides: Partial<Report> = {}): Report {
  return {
    generated_at: "2026-07-14T12:00:00.000Z",
    scope: "hybrid",
    project_root: "/proj",
    sync: {
      skills_hub: "/hub/skills",
      memory_hubs: [],
      agents_in_scope: ["claude-code", "codex"],
      aligned: false,
    },
    overall: { score: 62, grade: "yellow" },
    agents: [
      {
        id: "claude-code",
        adapter: "claude-code",
        installed: true,
        config_home: "/h/.claude",
        depth: "deep",
      },
      {
        id: "codex",
        adapter: "codex",
        installed: true,
        config_home: "/h/.codex",
        depth: "deep",
      },
    ],
    domains: [
      {
        domain: "agent_presence",
        score: 100,
        grade: "green",
        summary: "2 first-class agent(s) detected",
      },
      {
        domain: "shared_skills_path",
        score: 50,
        grade: "yellow",
        summary: "1 agent(s) off skills hub",
      },
    ],
    findings: [
      {
        id: "skills.agent_not_on_hub",
        severity: "error",
        domain: "shared_skills_path",
        message: "codex is not wired to the skills sync target",
        evidence: ["/h/.codex/skills"],
        agents_affected: ["codex"],
        sync_target: "/hub/skills",
      },
    ],
    recommendations: [
      {
        id: "rec.wire_off_hub_agents",
        finding_ids: ["skills.agent_not_on_hub"],
        message: "Wire codex to /hub/skills (no copy)",
        priority: 1,
      },
    ],
    ...overrides,
  };
}

describe("formatTerminalReport", () => {
  it("shows overall score and grade first", () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatch(/Overall:\s*62\s*\(YELLOW\)/);
    expect(text).toMatch(/hybrid status/);
  });

  it("renders per-agent hub alignment matrix", () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatch(/Sync target \(skills\):\s*\/hub\/skills/);
    expect(text).toMatch(/claude-code\s+✓\s+on hub/);
    expect(text).toMatch(/codex\s+✗\s+private tree only/);
  });

  it("includes domain lines", () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatch(/Domains:/);
    expect(text).toMatch(/agent_presence/);
    expect(text).toMatch(/shared_skills_path/);
  });

  it("lists top recommendations with finding ids", () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatch(/Recommendations:/);
    expect(text).toMatch(/Wire codex to \/hub\/skills/);
    expect(text).toMatch(/skills\.agent_not_on_hub/);
  });

  it("points to next commands", () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatch(/fix --dry-run/);
    expect(text).toMatch(/dashboard/);
  });
});
