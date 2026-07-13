/**
 * HTML dashboard template (design §10).
 * Renders the same Report JSON — no second scoring path.
 * Apply stays in CLI; this surface is read-only.
 */

import type { Grade, Report } from "../../engine/types.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function gradeLabel(grade: Grade): string {
  switch (grade) {
    case "green":
      return "GREEN";
    case "yellow":
      return "YELLOW";
    case "red":
      return "RED";
  }
}

function matrixMark(
  agentId: string,
  report: Report,
): { mark: string; note: string } {
  const presence = report.agents.find((a) => a.id === agentId);
  if (!presence?.installed) {
    return { mark: "·", note: "not installed" };
  }
  if (presence.ignored) {
    return { mark: "–", note: "ignored" };
  }
  if (presence.depth === "presence-only") {
    return { mark: "·", note: "presence-only (limited checks)" };
  }

  const offHub = report.findings.some(
    (f) =>
      f.id === "skills.agent_not_on_hub" &&
      f.agents_affected.includes(agentId),
  );
  if (offHub) {
    const finding = report.findings.find(
      (f) =>
        f.id === "skills.agent_not_on_hub" &&
        f.agents_affected.includes(agentId),
    );
    const evidence = finding?.evidence?.[0] ?? "";
    const note =
      evidence.includes("no-skills-path") || evidence === ""
        ? "no skills path"
        : "private tree only";
    return { mark: "✗", note };
  }

  if (!report.sync.skills_hub) {
    if (report.findings.some((f) => f.id === "skills.hub_conflict")) {
      return { mark: "✗", note: "hub conflict" };
    }
    return { mark: "✗", note: "no hub" };
  }

  return { mark: "✓", note: "on hub" };
}

/**
 * Render a Report as a static HTML dashboard page.
 * Views: Overview, Agents (fleet + sync matrix), Findings, Fix plan (CLI copy hints).
 */
export function renderDashboardHtml(report: Report): string {
  const grade = report.overall.grade;
  const hubDisplay = report.sync.skills_hub ?? "(unresolved)";
  const matrixAgents = report.agents.filter((a) => a.installed);

  const agentRows =
    matrixAgents.length === 0
      ? `<tr><td colspan="4">(no agents detected)</td></tr>`
      : matrixAgents
          .map((agent) => {
            const { mark, note } = matrixMark(agent.id, report);
            return `<tr>
  <td>${escapeHtml(agent.id)}</td>
  <td>${escapeHtml(agent.depth)}</td>
  <td>${escapeHtml(mark)}</td>
  <td>${escapeHtml(note)}</td>
</tr>`;
          })
          .join("\n");

  const domainRows = report.domains
    .map(
      (d) => `<tr>
  <td>${escapeHtml(d.domain)}</td>
  <td>${d.score}</td>
  <td>${escapeHtml(gradeLabel(d.grade))}</td>
  <td>${escapeHtml(d.summary ?? "")}</td>
</tr>`,
    )
    .join("\n");

  const findingRows =
    report.findings.length === 0
      ? `<tr><td colspan="4">(no findings)</td></tr>`
      : report.findings
          .map(
            (f) => `<tr data-finding-id="${escapeHtml(f.id)}">
  <td><code>${escapeHtml(f.id)}</code></td>
  <td>${escapeHtml(f.severity)}</td>
  <td>${escapeHtml(f.domain)}</td>
  <td>${escapeHtml(f.message)}</td>
</tr>`,
          )
          .join("\n");

  const fixRows =
    !report.fix_plan || report.fix_plan.length === 0
      ? `<tr><td colspan="3">(no fix actions planned)</td></tr>`
      : report.fix_plan
          .map(
            (a) => `<tr data-fix-id="${escapeHtml(a.id)}">
  <td><code>${escapeHtml(a.id)}</code></td>
  <td>${escapeHtml(a.kind)}</td>
  <td>${escapeHtml(a.description)}</td>
</tr>`,
          )
          .join("\n");

  const memoryHubs =
    report.sync.memory_hubs.length === 0
      ? "<li>(none)</li>"
      : report.sync.memory_hubs
          .map((v) => `<li><code>${escapeHtml(v)}</code></li>`)
          .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Doctor — Dashboard</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0 auto; max-width: 52rem; padding: 1.25rem; line-height: 1.45; }
    nav { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem; }
    nav a { text-decoration: none; }
    section { margin-bottom: 2rem; }
    h1, h2 { margin-top: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
    th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #8884; }
    code { font-size: 0.9em; }
    .grade { font-weight: 700; letter-spacing: 0.02em; }
    .grade-green { color: #0a7; }
    .grade-yellow { color: #c80; }
    .grade-red { color: #c33; }
    .hint { background: #8881; padding: 0.75rem 1rem; border-radius: 6px; }
    .hint code { user-select: all; }
  </style>
</head>
<body data-overall-grade="${escapeHtml(grade)}" data-fix-applied="false">
  <h1>Agent Doctor — ${escapeHtml(report.scope)} dashboard</h1>
  <nav>
    <a href="#overview">Overview</a>
    <a href="#agents">Agents</a>
    <a href="#findings">Findings</a>
    <a href="#fix-plan">Fix plan</a>
  </nav>

  <section id="overview">
    <h2>Overview</h2>
    <p>
      Overall:
      <span class="grade grade-${escapeHtml(grade)}">${report.overall.score}
      (${escapeHtml(gradeLabel(grade))})</span>
    </p>
    <p>Generated: <code>${escapeHtml(report.generated_at)}</code></p>
    ${
      report.project_root
        ? `<p>Project: <code>${escapeHtml(report.project_root)}</code></p>`
        : ""
    }
    <p>Sync aligned: <strong>${report.sync.aligned ? "yes" : "no"}</strong></p>
    <p>Skills hub: <code>${escapeHtml(hubDisplay)}</code></p>
    <p>Memory hubs:</p>
    <ul>${memoryHubs}</ul>
    <h3>Domains</h3>
    <table>
      <thead><tr><th>Domain</th><th>Score</th><th>Grade</th><th>Summary</th></tr></thead>
      <tbody>
${domainRows}
      </tbody>
    </table>
  </section>

  <section id="agents">
    <h2>Agents</h2>
    <p>Fleet + skills sync matrix (same report data as terminal status).</p>
    <table>
      <thead><tr><th>Agent</th><th>Depth</th><th>Hub</th><th>Note</th></tr></thead>
      <tbody>
${agentRows}
      </tbody>
    </table>
  </section>

  <section id="findings">
    <h2>Findings</h2>
    <table>
      <thead><tr><th>Id</th><th>Severity</th><th>Domain</th><th>Message</th></tr></thead>
      <tbody>
${findingRows}
      </tbody>
    </table>
  </section>

  <section id="fix-plan">
    <h2>Fix plan</h2>
    <p>Apply stays in the CLI for safer confirmation. Copy and run:</p>
    <div class="hint">
      <p><code>agent-doctor fix --dry-run</code></p>
      <p><code>agent-doctor fix</code></p>
    </div>
    <table>
      <thead><tr><th>Action id</th><th>Kind</th><th>Description</th></tr></thead>
      <tbody>
${fixRows}
      </tbody>
    </table>
  </section>
</body>
</html>
`;
}
