/**
 * Terminal status surface (design §10).
 * Formats a Report for humans — overall grade, domain lines, sync matrix,
 * top recommendations, next commands. Does not re-score; only formats fields.
 */

import type { Grade, Report } from '../engine/types.js';

function gradeLabel(grade: Grade): string {
  switch (grade) {
    case 'green':
      return 'GREEN';
    case 'yellow':
      return 'YELLOW';
    case 'red':
      return 'RED';
  }
}

/**
 * Whether a report agent appears on the skills hub (for matrix rows).
 * Uses findings + sync evidence from the Report — never re-queries disk.
 */
function matrixMark(agentId: string, report: Report): { mark: string; note: string } {
  const presence = report.agents.find((a) => a.id === agentId);
  if (!presence) {
    return { mark: '·', note: 'in scope (details unavailable)' };
  }
  if (!presence.installed) {
    return { mark: '·', note: 'not installed' };
  }
  if (presence.ignored) {
    return { mark: '–', note: 'ignored' };
  }
  if (presence.depth === 'presence-only') {
    return { mark: '·', note: 'presence-only (limited checks)' };
  }

  const offHub = report.findings.some(
    (f) => f.id === 'skills.agent_not_on_hub' && f.agents_affected.includes(agentId),
  );
  if (offHub) {
    const finding = report.findings.find(
      (f) => f.id === 'skills.agent_not_on_hub' && f.agents_affected.includes(agentId),
    );
    const evidence = finding?.evidence?.[0] ?? '';
    const note =
      evidence.includes('no-skills-path') || evidence === ''
        ? 'no skills path'
        : 'private tree only';
    return { mark: '✗', note };
  }

  if (!report.sync.skills_hub) {
    if (report.findings.some((f) => f.id === 'skills.hub_conflict')) {
      return { mark: '✗', note: 'hub conflict' };
    }
    return { mark: '✗', note: 'no hub' };
  }

  return { mark: '✓', note: 'on hub' };
}

/**
 * Format a Report as a human-readable terminal dashboard (design §10).
 * Read-only over Report fields — no scoring or FS access.
 */
export function formatTerminalReport(report: Report): string {
  const lines: string[] = [];

  lines.push(`Agent Doctor — ${report.scope} status`);
  lines.push('');
  lines.push(`Overall: ${report.overall.score} (${gradeLabel(report.overall.grade)})`);
  lines.push('');

  // Sync matrix: one row per agents_in_scope entry (hub × agents)
  const hubDisplay = report.sync.skills_hub ?? '(unresolved)';
  lines.push(`Sync target (skills):  ${hubDisplay}`);

  const scopeIds = report.sync.agents_in_scope;
  if (scopeIds.length === 0) {
    lines.push('  (no agents in scope)');
  } else {
    const idWidth = Math.max(...scopeIds.map((id) => id.length), 8);
    for (const agentId of scopeIds) {
      const { mark, note } = matrixMark(agentId, report);
      lines.push(`  ${agentId.padEnd(idWidth)}  ${mark} ${note}`);
    }
  }

  if (report.sync.memory_hubs.length > 0) {
    lines.push('');
    lines.push('Memory hubs (vaults):');
    for (const v of report.sync.memory_hubs) {
      lines.push(`  ${v}`);
    }
  }

  // Domains
  lines.push('');
  lines.push('Domains:');
  if (report.domains.length === 0) {
    lines.push('  (none)');
  } else {
    const domainWidth = Math.max(...report.domains.map((d) => d.domain.length), 8);
    for (const domain of report.domains) {
      const score = String(domain.score).padStart(3);
      const grade = gradeLabel(domain.grade).padEnd(6);
      const summary = domain.summary ? `  ${domain.summary}` : '';
      lines.push(`  ${domain.domain.padEnd(domainWidth)}  ${score} ${grade}${summary}`);
    }
  }

  // Findings (generic list — hierarchy and all other domains; JSON remains source of truth)
  if (report.findings.length > 0) {
    lines.push('');
    lines.push('Findings:');
    const severityWidth = Math.max(...report.findings.map((f) => f.severity.length), 5);
    for (const finding of report.findings) {
      const sev = finding.severity.padEnd(severityWidth);
      lines.push(`  ${sev}  ${finding.id}  ${finding.message}`);
    }
  }

  // Top recommendations (sync-first style: print Report fields only)
  if (report.recommendations.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    const top = report.recommendations
      .slice()
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
      .slice(0, 5);
    for (let i = 0; i < top.length; i++) {
      const rec = top[i]!;
      const ids = rec.finding_ids.length > 0 ? `  [${rec.finding_ids.join(', ')}]` : '';
      lines.push(`  ${i + 1}. ${rec.message}${ids}`);
    }
  }

  lines.push('');
  lines.push('Next: agent-doctor fix --dry-run | agent-doctor dashboard');
  lines.push('');

  return lines.join('\n');
}
