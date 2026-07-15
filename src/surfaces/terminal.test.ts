import { describe, expect, it } from 'vitest';
import type { Report } from '../engine/types.js';
import { formatTerminalReport } from './terminal.js';

function sampleReport(overrides: Partial<Report> = {}): Report {
  return {
    generated_at: '2026-07-14T12:00:00.000Z',
    scope: 'hybrid',
    project_root: '/proj',
    sync: {
      skills_hub: '/hub/skills',
      memory_hubs: ['/vaults/notes'],
      agents_in_scope: ['claude-code', 'codex'],
      aligned: false,
    },
    overall: { score: 62, grade: 'yellow' },
    agents: [
      {
        id: 'claude-code',
        adapter: 'claude-code',
        installed: true,
        config_home: '/h/.claude',
        depth: 'deep',
      },
      {
        id: 'codex',
        adapter: 'codex',
        installed: true,
        config_home: '/h/.codex',
        depth: 'deep',
      },
      {
        id: 'grok',
        adapter: 'grok',
        installed: true,
        config_home: '/h/.grok',
        depth: 'deep',
        ignored: true,
      },
    ],
    domains: [
      {
        domain: 'agent_presence',
        score: 100,
        grade: 'green',
        summary: '2 first-class agent(s) detected',
      },
      {
        domain: 'shared_skills_path',
        score: 50,
        grade: 'yellow',
        summary: '1 agent(s) off skills hub',
      },
    ],
    findings: [
      {
        id: 'skills.agent_not_on_hub',
        severity: 'error',
        domain: 'shared_skills_path',
        message: 'codex is not wired to the skills sync target',
        evidence: ['/h/.codex/skills'],
        agents_affected: ['codex'],
        sync_target: '/hub/skills',
      },
    ],
    recommendations: [
      {
        id: 'rec.wire_off_hub_agents',
        finding_ids: ['skills.agent_not_on_hub'],
        message: 'Wire codex to /hub/skills (no copy)',
        priority: 1,
      },
      {
        id: 'rec.lower_priority',
        finding_ids: [],
        message: 'Optional cleanup',
        priority: 5,
      },
    ],
    ...overrides,
  };
}

describe('formatTerminalReport', () => {
  it('shows overall score and grade first', () => {
    const text = formatTerminalReport(sampleReport());
    const overallIdx = text.indexOf('Overall:');
    const domainsIdx = text.indexOf('Domains:');
    const recsIdx = text.indexOf('Recommendations:');

    expect(overallIdx).toBeGreaterThanOrEqual(0);
    expect(overallIdx).toBeLessThan(domainsIdx);
    expect(domainsIdx).toBeLessThan(recsIdx);
    expect(text).toMatch(/Overall:\s*62\s*\(YELLOW\)/);
    expect(text).toMatch(/hybrid status/);
  });

  it('renders sync matrix rows for each agents_in_scope entry only', () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatch(/Sync target \(skills\):\s*\/hub\/skills/);
    expect(text).toMatch(/claude-code\s+✓\s+on hub/);
    expect(text).toMatch(/codex\s+✗\s+private tree only/);
    // ignored / not-in-scope agent must not get a matrix row
    expect(text).not.toMatch(/^\s*grok\b/m);
  });

  it('includes a matrix row for every agents_in_scope id even if agents list omits it', () => {
    const text = formatTerminalReport(
      sampleReport({
        sync: {
          skills_hub: '/hub/skills',
          memory_hubs: [],
          agents_in_scope: ['claude-code', 'cursor'],
          aligned: false,
        },
        agents: [
          {
            id: 'claude-code',
            adapter: 'claude-code',
            installed: true,
            depth: 'deep',
          },
        ],
        findings: [],
      }),
    );
    expect(text).toMatch(/claude-code/);
    expect(text).toMatch(/cursor/);
  });

  it('includes domain lines with grades', () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatch(/Domains:/);
    expect(text).toMatch(/agent_presence\s+100\s+GREEN/);
    expect(text).toMatch(/shared_skills_path\s+50\s+YELLOW/);
  });

  it('lists top recommendations from report.recommendations with finding ids', () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatch(/Recommendations:/);
    expect(text).toMatch(/1\.\s+Wire codex to \/hub\/skills/);
    expect(text).toMatch(/skills\.agent_not_on_hub/);
    expect(text).toMatch(/2\.\s+Optional cleanup/);
  });

  it('renders findings with readable id, severity, and message (generic list)', () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatch(/Findings:/);
    expect(text).toMatch(/skills\.agent_not_on_hub/);
    expect(text).toMatch(/error/i);
    expect(text).toMatch(/codex is not wired to the skills sync target/);
    // Findings appear before Recommendations when both present
    const findingsIdx = text.indexOf('Findings:');
    const recsIdx = text.indexOf('Recommendations:');
    expect(findingsIdx).toBeGreaterThanOrEqual(0);
    expect(findingsIdx).toBeLessThan(recsIdx);
  });

  it('surfaces hierarchy finding messages in the findings list (REQ-037)', () => {
    const text = formatTerminalReport(
      sampleReport({
        findings: [
          {
            id: 'instructions.hierarchy_missing_agents_md',
            severity: 'error',
            domain: 'instructions',
            message:
              'Project instruction hierarchy requires AGENTS.md at the project root (canonical shared instructions).',
            evidence: ['/proj/AGENTS.md'],
            agents_affected: [],
          },
          {
            id: 'instructions.hierarchy_missing_pointer',
            severity: 'warn',
            domain: 'instructions',
            message:
              'Required vendor instruction file missing for hierarchy: CLAUDE.md must exist and point at AGENTS.md',
            evidence: ['/proj/CLAUDE.md', '/proj/AGENTS.md'],
            agents_affected: ['claude-code'],
          },
        ],
        recommendations: [
          {
            id: 'rec.ensure_agents_md',
            finding_ids: ['instructions.hierarchy_missing_agents_md'],
            message:
              'Create minimal AGENTS.md stub at the project root — preview with `agent-doctor fix --dry-run`',
            priority: 1,
          },
        ],
        domains: [
          {
            domain: 'instruction_files',
            score: 45,
            grade: 'red',
            summary: '1 error(s), 1 warning(s) (score 45)',
          },
        ],
      }),
    );

    expect(text).toMatch(/Findings:/);
    expect(text).toMatch(/instructions\.hierarchy_missing_agents_md/);
    expect(text).toMatch(/instructions\.hierarchy_missing_pointer/);
    expect(text).toMatch(/Project instruction hierarchy requires AGENTS\.md/);
    expect(text).toMatch(/CLAUDE\.md must exist and point at AGENTS\.md/);
    // Domain section still present (hierarchy not a special matrix)
    expect(text).toMatch(/instruction_files/);
  });

  it('omits Findings section when report has no findings', () => {
    const text = formatTerminalReport(sampleReport({ findings: [], recommendations: [] }));
    expect(text).not.toMatch(/Findings:/);
  });

  it('does not invent recommendations when report has none', () => {
    const text = formatTerminalReport(sampleReport({ recommendations: [] }));
    expect(text).not.toMatch(/Recommendations:/);
  });

  it('formats overall fields as-is and does not re-score', () => {
    // Intentionally inconsistent: grade red with high score and no findings.
    // Renderer must print report.overall only — never recompute.
    const text = formatTerminalReport(
      sampleReport({
        overall: { score: 99, grade: 'red' },
        findings: [],
        recommendations: [],
        domains: [
          {
            domain: 'agent_presence',
            score: 100,
            grade: 'green',
          },
        ],
        sync: {
          skills_hub: '/hub/skills',
          memory_hubs: [],
          agents_in_scope: ['claude-code'],
          aligned: true,
        },
      }),
    );
    expect(text).toMatch(/Overall:\s*99\s*\(RED\)/);
    expect(text).not.toMatch(/Overall:\s*100/);
    expect(text).not.toMatch(/\(GREEN\)/);
  });

  it('does not mutate the input report', () => {
    const report = sampleReport();
    const before = JSON.stringify(report);
    formatTerminalReport(report);
    expect(JSON.stringify(report)).toBe(before);
  });

  it('points to next commands', () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatch(/fix --dry-run/);
    expect(text).toMatch(/dashboard/);
  });

  it('locks key dashboard sections with a snapshot', () => {
    const text = formatTerminalReport(sampleReport());
    expect(text).toMatchSnapshot();
  });
});
