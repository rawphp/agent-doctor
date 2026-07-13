import { describe, expect, it } from 'vitest';
import {
  FINDING_SEVERITIES,
  HOME_MAP_VERSION,
  REPORT_GRADES,
  REPORT_SCOPES,
  type AgentPresence,
  type DomainResult,
  type Finding,
  type FixAction,
  type HomeMap,
  type Recommendation,
  type Report,
} from './types.js';

describe('Report schema', () => {
  it('constructs a sample Report matching design §7', () => {
    const agents: AgentPresence[] = [
      {
        id: 'claude-code',
        adapter: 'claude-code',
        installed: true,
        config_home: '/Users/me/.claude',
        depth: 'deep',
        primary: true,
        ignored: false,
      },
      {
        id: 'codex',
        adapter: 'codex',
        installed: true,
        config_home: '/Users/me/.codex',
        depth: 'deep',
        primary: false,
        ignored: false,
      },
    ];

    const domains: DomainResult[] = [
      {
        domain: 'agent_presence',
        score: 100,
        grade: 'green',
        summary: 'All first-class agents detected',
      },
      {
        domain: 'shared_skills_path',
        score: 40,
        grade: 'red',
        summary: 'Agents disagree on skills hub',
      },
    ];

    const findings: Finding[] = [
      {
        id: 'skills.agent_not_on_hub',
        severity: 'error',
        domain: 'shared_skills_path',
        message: 'Codex is not wired to the skills sync target',
        evidence: ['/Users/me/.codex/skills'],
        agents_affected: ['codex'],
        sync_target: '/Users/me/skills-hub',
      },
    ];

    const recommendations: Recommendation[] = [
      {
        id: 'rec.wire_codex_skills',
        finding_ids: ['skills.agent_not_on_hub'],
        message: 'Wire Codex to /Users/me/skills-hub (no copy)',
        priority: 1,
      },
    ];

    const fix_plan: FixAction[] = [
      {
        id: 'fix.wire_codex_skills',
        kind: 'wire_skills_hub',
        description: 'Point Codex skills path at sync target',
        target: '/Users/me/.codex',
        agent_id: 'codex',
        finding_ids: ['skills.agent_not_on_hub'],
      },
    ];

    const report: Report = {
      generated_at: '2026-07-14T12:00:00.000Z',
      scope: 'hybrid',
      project_root: '/Users/me/projects/app',
      sync: {
        skills_hub: '/Users/me/skills-hub',
        memory_hubs: ['/Users/me/vaults/notes'],
        agents_in_scope: ['claude-code', 'codex'],
        aligned: false,
      },
      overall: { score: 55, grade: 'yellow' },
      agents,
      domains,
      findings,
      recommendations,
      fix_plan,
    };

    expect(REPORT_SCOPES).toContain(report.scope);
    expect(REPORT_GRADES).toContain(report.overall.grade);
    expect(FINDING_SEVERITIES).toContain(report.findings[0]?.severity);
    expect(report.scope).toBe('hybrid');
    expect(report.sync.aligned).toBe(false);
    expect(report.overall.grade).toBe('yellow');
    expect(report.findings[0]?.id).toBe('skills.agent_not_on_hub');
    expect(report.findings[0]?.agents_affected).toEqual(['codex']);
    expect(report.sync.memory_hubs).toHaveLength(1);
    expect(report.agents).toHaveLength(2);
    expect(report.domains).toHaveLength(2);
    expect(report.recommendations[0]?.finding_ids).toContain('skills.agent_not_on_hub');
    expect(report.fix_plan?.[0]?.kind).toBe('wire_skills_hub');
  });

  it('allows machine scope and optional project_root omission', () => {
    const report: Report = {
      generated_at: '2026-07-14T12:00:00.000Z',
      scope: 'machine',
      sync: {
        memory_hubs: [],
        agents_in_scope: [],
        aligned: true,
      },
      overall: { score: 100, grade: 'green' },
      agents: [],
      domains: [],
      findings: [],
      recommendations: [],
    };

    expect(report.scope).toBe('machine');
    expect(REPORT_SCOPES).toContain('machine');
    expect(report.project_root).toBeUndefined();
    expect(report.sync.aligned).toBe(true);
    expect(report.overall.grade).toBe('green');
    expect(report.fix_plan).toBeUndefined();
  });
});

describe('HomeMap schema', () => {
  it('constructs a sample HomeMap matching map.yml v1 fields', () => {
    const map: HomeMap = {
      version: HOME_MAP_VERSION,
      skills: {
        global_roots: ['/Users/me/skills-hub', '/Users/me/.agents/skills'],
        sync_target: '/Users/me/skills-hub',
      },
      vaults: [
        { path: '/Users/me/vaults/notes', source: 'discovered' },
        { path: '/Users/me/vaults/work', source: 'manual' },
      ],
      agents: [
        {
          id: 'claude-code',
          adapter: 'claude-code',
          config_home: '/Users/me/.claude',
          primary: true,
          ignored: false,
        },
        {
          id: 'codex',
          adapter: 'codex',
          config_home: '/Users/me/.codex',
          primary: false,
          ignored: false,
        },
        {
          id: 'grok',
          adapter: 'grok',
          config_home: '/Users/me/.grok',
          primary: false,
          ignored: false,
        },
      ],
      projects: {
        roots: ['/Users/me/projects'],
        entries: ['/Users/me/projects/app'],
      },
    };

    expect(map.version).toBe(1);
    expect(map.version).toBe(HOME_MAP_VERSION);
    expect(map.skills.global_roots).toContain('/Users/me/skills-hub');
    expect(map.skills.sync_target).toBe('/Users/me/skills-hub');
    expect(map.vaults).toHaveLength(2);
    expect(map.vaults[0]?.source).toBe('discovered');
    expect(map.agents.map((a) => a.id)).toEqual(['claude-code', 'codex', 'grok']);
    expect(map.projects.roots).toEqual(['/Users/me/projects']);
    expect(map.projects.entries).toEqual(['/Users/me/projects/app']);
  });

  it('allows null sync_target when unresolved', () => {
    const map: HomeMap = {
      version: 1,
      skills: {
        global_roots: [],
        sync_target: null,
      },
      vaults: [],
      agents: [],
      projects: {
        roots: [],
        entries: [],
      },
    };

    expect(map.skills.sync_target).toBeNull();
    expect(map.skills.global_roots).toEqual([]);
  });
});
