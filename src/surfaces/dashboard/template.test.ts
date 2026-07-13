import { describe, expect, it } from "vitest";
import type { Report } from "../../engine/types.js";
import { renderDashboardHtml } from "./template.js";

function sampleReport(overrides: Partial<Report> = {}): Report {
  return {
    generated_at: "2026-07-14T12:00:00.000Z",
    scope: "hybrid",
    project_root: "/proj",
    sync: {
      skills_hub: "/hub/skills",
      memory_hubs: ["/vaults/notes"],
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
      {
        id: "presence.ok",
        severity: "info",
        domain: "agent_presence",
        message: "Agents detected",
        evidence: [],
        agents_affected: [],
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
    fix_plan: [
      {
        id: "fix.wire_codex_skills",
        kind: "wire_skills_hub",
        description: "Point Codex skills path at sync target",
        target: "/h/.codex",
        agent_id: "codex",
        finding_ids: ["skills.agent_not_on_hub"],
      },
    ],
    ...overrides,
  };
}

describe("renderDashboardHtml", () => {
  it("includes overall.grade in the HTML", () => {
    const html = renderDashboardHtml(sampleReport());
    expect(html).toMatch(/yellow/i);
    expect(html).toMatch(/data-overall-grade=["']yellow["']/i);
    expect(html).toMatch(/62/);
  });

  it("includes each finding id", () => {
    const html = renderDashboardHtml(sampleReport());
    expect(html).toContain("skills.agent_not_on_hub");
    expect(html).toContain("presence.ok");
  });

  it("renders Overview, Agents, Findings, and Fix plan sections", () => {
    const html = renderDashboardHtml(sampleReport());
    expect(html).toMatch(/id=["']overview["']/i);
    expect(html).toMatch(/id=["']agents["']/i);
    expect(html).toMatch(/id=["']findings["']/i);
    expect(html).toMatch(/id=["']fix-plan["']/i);
    expect(html).toMatch(/Overview/i);
    expect(html).toMatch(/Agents/i);
    expect(html).toMatch(/Findings/i);
    expect(html).toMatch(/Fix plan/i);
  });

  it("shows agents and skills hub in the matrix area", () => {
    const html = renderDashboardHtml(sampleReport());
    expect(html).toContain("claude-code");
    expect(html).toContain("codex");
    expect(html).toContain("/hub/skills");
  });

  it("includes CLI copy hints for fix plan (apply stays in CLI)", () => {
    const html = renderDashboardHtml(sampleReport());
    expect(html).toMatch(/agent-doctor fix --dry-run/);
    expect(html).toMatch(/agent-doctor fix/);
    // Must not claim apply happened in-browser
    expect(html).not.toMatch(/data-fix-applied=["']true["']/i);
    expect(html).toContain("fix.wire_codex_skills");
  });

  it("escapes untrusted report strings in HTML", () => {
    const html = renderDashboardHtml(
      sampleReport({
        findings: [
          {
            id: "xss.probe",
            severity: "error",
            domain: "test",
            message: '<script>alert("x")</script>',
            evidence: [],
            agents_affected: [],
          },
        ],
      }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("xss.probe");
    expect(html).toMatch(/&lt;script&gt;/);
  });
});
