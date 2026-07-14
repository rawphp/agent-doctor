import { describe, expect, it } from 'vitest';
import type { AgentAdapter, AdapterContext } from '../adapters/types.js';
import type { AgentPresence, Finding, FixAction, HomeMap, Report } from '../engine/types.js';
import {
  buildFixPlan,
  isRejectedCopyAction,
  SAFE_FIX_KINDS,
  blocksWireForHubConflict,
  explainEmptyFixPlan,
  formatFixPlan,
} from './plan.js';

function emptyMap(overrides: Partial<HomeMap['skills']> = {}): HomeMap {
  return {
    version: 1,
    skills: {
      global_roots: overrides.global_roots ?? [],
      sync_target: overrides.sync_target !== undefined ? overrides.sync_target : null,
    },
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
  };
}

function finding(partial: Partial<Finding> & Pick<Finding, 'id'>): Finding {
  return {
    severity: 'warn',
    domain: 'skills',
    message: partial.message ?? partial.id,
    evidence: [],
    agents_affected: [],
    ...partial,
  };
}

function stubAdapter(
  id: string,
  options: {
    wireSkills?: FixAction[];
    wireMemory?: FixAction[];
  } = {},
): AgentAdapter {
  return {
    id,
    async detect(): Promise<AgentPresence> {
      return {
        id,
        adapter: id,
        installed: true,
        depth: 'deep',
        config_home: `/tmp/${id}`,
      };
    },
    async skillsRoots(_ctx?: AdapterContext): Promise<string[]> {
      return [];
    },
    async instructionFiles(): Promise<string[]> {
      return [];
    },
    async memoryPointers(): Promise<string[]> {
      return [];
    },
    proposeWireToSkillsHub(hub: string): FixAction[] {
      if (options.wireSkills) {
        return options.wireSkills.map((a) => ({
          ...a,
          description: a.description.includes(hub) ? a.description : `${a.description} → ${hub}`,
        }));
      }
      return [
        {
          id: `fix.wire_${id}_skills`,
          kind: 'symlink_skills_hub',
          description: `Symlink /tmp/${id}/skills → ${hub}`,
          target: `/tmp/${id}/skills`,
          agent_id: id,
        },
      ];
    },
    proposeWireMemory(paths: string[]): FixAction[] {
      if (options.wireMemory) return options.wireMemory;
      return paths.map((vaultPath, index) => ({
        id: `fix.wire_${id}_memory_${index + 1}`,
        kind: 'wire_memory_pointer',
        description: `Add memory pointer to ${vaultPath}`,
        target: vaultPath,
        agent_id: id,
      }));
    },
  };
}

describe('buildFixPlan', () => {
  it('maps findings to stable fix action ids', () => {
    const hub = '/hub/skills';
    const plan = buildFixPlan({
      findings: [
        finding({
          id: 'skills.agent_not_on_hub',
          severity: 'error',
          domain: 'skills',
          agents_affected: ['codex'],
          sync_target: hub,
        }),
        finding({
          id: 'product.missing_link',
          severity: 'warn',
          domain: 'product',
          message: 'Instruction file(s) for claude-code missing link to product.md',
          evidence: ['/proj/CLAUDE.md', '/proj/product.md'],
          agents_affected: ['claude-code'],
        }),
        finding({
          id: 'obsidian.missing_vault_link',
          severity: 'warn',
          domain: 'obsidian',
          evidence: ['/vaults/notes'],
          agents_affected: ['claude-code'],
        }),
      ],
      map: emptyMap({ sync_target: hub, global_roots: [hub] }),
      hub,
      adapters: [stubAdapter('codex'), stubAdapter('claude-code')],
      projectRoot: '/proj',
    });

    expect(plan.length).toBeGreaterThanOrEqual(3);
    for (const action of plan) {
      expect(action.id).toMatch(/^fix\./);
      expect(typeof action.kind).toBe('string');
      expect(action.kind.length).toBeGreaterThan(0);
      expect(typeof action.description).toBe('string');
    }

    // Stable, predictable ids (not random / timestamp-based)
    expect(plan.map((a) => a.id).sort()).toEqual(
      expect.arrayContaining([
        'fix.wire_codex_skills',
        'fix.link_product_claude-code_product.md',
        'fix.wire_claude-code_memory_1',
      ]),
    );

    // finding_ids attach source findings
    const wire = plan.find((a) => a.id === 'fix.wire_codex_skills');
    expect(wire?.finding_ids).toContain('skills.agent_not_on_hub');

    const product = plan.find((a) => a.id === 'fix.link_product_claude-code_product.md');
    expect(product?.finding_ids).toContain('product.missing_link');
    expect(product?.kind).toBe('append_instruction_link');
    expect(product?.agent_id).toBe('claude-code');
    // target = instruction file to append to; value = product path (apply-ready)
    expect(product?.target).toBe('/proj/CLAUDE.md');
    expect(product?.value).toBe('/proj/product.md');
  });

  it('hub conflict without sync_target yields set_sync_target only, not wire', () => {
    const roots = ['/hub/a', '/hub/b'];
    const plan = buildFixPlan({
      findings: [
        finding({
          id: 'skills.hub_conflict',
          severity: 'error',
          domain: 'skills',
          message:
            'Multiple populated skills roots with no sync_target; choose one hub before wire fixes.',
          evidence: roots,
          agents_affected: ['claude-code', 'codex'],
        }),
        // Even if off-hub findings were present, wire must be blocked
        finding({
          id: 'skills.agent_not_on_hub',
          severity: 'error',
          domain: 'skills',
          agents_affected: ['codex'],
        }),
      ],
      map: emptyMap({ sync_target: null, global_roots: roots }),
      hub: undefined,
      adapters: [
        stubAdapter('codex', {
          wireSkills: [
            {
              id: 'fix.wire_codex_skills',
              kind: 'symlink_skills_hub',
              description: 'should not appear',
              agent_id: 'codex',
            },
          ],
        }),
        stubAdapter('claude-code'),
      ],
    });

    expect(plan.some((a) => a.id === 'fix.set_sync_target')).toBe(true);
    const setTarget = plan.find((a) => a.id === 'fix.set_sync_target')!;
    expect(setTarget.kind).toBe('set_sync_target');
    expect(setTarget.finding_ids).toContain('skills.hub_conflict');

    const wireKinds = new Set(['symlink_skills_hub', 'wire_skills_hub', 'wire_memory_pointer']);
    expect(plan.filter((a) => wireKinds.has(a.kind))).toEqual([]);
    expect(plan.filter((a) => a.id.startsWith('fix.wire_'))).toEqual([]);
  });

  it('includes symlink actions when adapter proposes them for off-hub agents', () => {
    const hub = '/Users/me/skills-hub';
    const plan = buildFixPlan({
      findings: [
        finding({
          id: 'skills.agent_not_on_hub',
          severity: 'error',
          domain: 'skills',
          agents_affected: ['grok'],
          sync_target: hub,
        }),
      ],
      map: emptyMap({ sync_target: hub, global_roots: [hub] }),
      hub,
      adapters: [
        stubAdapter('grok', {
          wireSkills: [
            {
              id: 'fix.wire_grok_skills',
              kind: 'symlink_skills_hub',
              description: `Symlink /tmp/grok/skills → ${hub} (hub wiring via symlink)`,
              target: '/tmp/grok/skills',
              agent_id: 'grok',
            },
          ],
        }),
      ],
    });

    const symlink = plan.find((a) => a.kind === 'symlink_skills_hub');
    expect(symlink).toBeDefined();
    expect(symlink!.id).toBe('fix.wire_grok_skills');
    expect(symlink!.agent_id).toBe('grok');
    expect(symlink!.target).toBe('/tmp/grok/skills');
    expect(symlink!.finding_ids).toContain('skills.agent_not_on_hub');
  });

  it('does not invent wire actions for presence-only adapters that propose nothing', () => {
    const hub = '/hub';
    const plan = buildFixPlan({
      findings: [
        finding({
          id: 'skills.agent_not_on_hub',
          severity: 'error',
          domain: 'skills',
          agents_affected: ['cursor'],
          sync_target: hub,
        }),
      ],
      map: emptyMap({ sync_target: hub }),
      hub,
      adapters: [
        {
          ...stubAdapter('cursor'),
          proposeWireToSkillsHub: () => [],
          proposeWireMemory: () => [],
        },
      ],
    });

    expect(plan.filter((a) => a.agent_id === 'cursor')).toEqual([]);
  });

  it('when hub conflict but sync_target is set, allows wire proposals', () => {
    // Stale/edge: conflict finding present while map already has a choice
    const hub = '/hub/chosen';
    const plan = buildFixPlan({
      findings: [
        finding({
          id: 'skills.hub_conflict',
          severity: 'error',
          domain: 'skills',
          evidence: ['/hub/a', hub],
        }),
        finding({
          id: 'skills.agent_not_on_hub',
          severity: 'error',
          domain: 'skills',
          agents_affected: ['codex'],
          sync_target: hub,
        }),
      ],
      map: emptyMap({ sync_target: hub, global_roots: ['/hub/a', hub] }),
      hub,
      adapters: [stubAdapter('codex')],
    });

    expect(plan.some((a) => a.kind === 'symlink_skills_hub')).toBe(true);
    // No forced set_sync_target when already set
    expect(plan.some((a) => a.id === 'fix.set_sync_target')).toBe(false);
  });

  it('dedupes actions by id across multiple off-hub findings for same agent', () => {
    const hub = '/hub';
    const plan = buildFixPlan({
      findings: [
        finding({
          id: 'skills.agent_not_on_hub',
          severity: 'error',
          domain: 'skills',
          agents_affected: ['codex'],
        }),
        finding({
          id: 'skills.agent_not_on_hub',
          severity: 'error',
          domain: 'skills',
          agents_affected: ['codex'],
          message: 'duplicate finding row',
        }),
      ],
      map: emptyMap({ sync_target: hub }),
      hub,
      adapters: [stubAdapter('codex')],
    });

    const wires = plan.filter((a) => a.id === 'fix.wire_codex_skills');
    expect(wires).toHaveLength(1);
  });
});

function baseReport(overrides: Partial<Report> = {}): Report {
  return {
    generated_at: '2026-07-14T12:00:00.000Z',
    scope: 'hybrid',
    sync: {
      skills_hub: '/hub',
      memory_hubs: [],
      agents_in_scope: ['claude-code'],
      aligned: false,
    },
    overall: { score: 55, grade: 'yellow' },
    agents: [],
    domains: [],
    findings: [],
    recommendations: [],
    ...overrides,
  };
}

describe('buildFixPlan (report API)', () => {
  it('passes through adapter symlink proposals when hub is known', () => {
    const symlink: FixAction = {
      id: 'fix.wire_codex_skills',
      kind: 'symlink_skills_hub',
      description: 'Symlink /agent/skills → /hub',
      target: '/agent/skills',
      agent_id: 'codex',
      finding_ids: ['skills.agent_not_on_hub'],
    };
    const plan = buildFixPlan(
      baseReport({
        fix_plan: [symlink],
        sync: {
          skills_hub: '/hub',
          memory_hubs: [],
          agents_in_scope: ['codex'],
          aligned: false,
        },
      }),
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]!.kind).toBe('symlink_skills_hub');
    expect(plan[0]!.value).toBe('/hub');
  });

  it('rejects copy-tree actions (never content-copy skill trees)', () => {
    const copy: FixAction = {
      id: 'fix.copy_skills',
      kind: 'copy_tree',
      description: 'Copy skills tree from private to hub',
      target: '/private/skills',
    };
    const symlink: FixAction = {
      id: 'fix.wire',
      kind: 'symlink_skills_hub',
      description: 'Symlink',
      target: '/agent/skills',
    };
    const plan = buildFixPlan(baseReport({ fix_plan: [copy, symlink] }));
    expect(plan.every((a) => a.kind !== 'copy_tree')).toBe(true);
    expect(plan.some((a) => a.kind === 'symlink_skills_hub')).toBe(true);
    expect(isRejectedCopyAction(copy)).toBe(true);
  });

  it('does not silently pick a hub when hub_conflict (no wire without sync_target)', () => {
    const symlink: FixAction = {
      id: 'fix.wire',
      kind: 'symlink_skills_hub',
      description: 'Would wire to guessed hub',
      target: '/agent/skills',
    };
    const plan = buildFixPlan(
      baseReport({
        fix_plan: [symlink],
        sync: {
          skills_hub: undefined,
          memory_hubs: [],
          agents_in_scope: ['codex'],
          aligned: false,
        },
        findings: [
          {
            id: 'skills.hub_conflict',
            severity: 'error',
            domain: 'skills',
            message: 'Multiple hubs',
            evidence: ['/hub-a', '/hub-b'],
            agents_affected: [],
          },
        ],
      }),
    );
    expect(plan.filter((a) => a.kind === 'symlink_skills_hub')).toEqual([]);
    expect(plan.some((a) => a.kind === 'set_sync_target')).toBe(false);
  });

  it('includes set_sync_target only when explicit target provided on conflict', () => {
    const plan = buildFixPlan(
      baseReport({
        sync: {
          skills_hub: undefined,
          memory_hubs: [],
          agents_in_scope: [],
          aligned: false,
        },
        findings: [
          {
            id: 'skills.hub_conflict',
            severity: 'error',
            domain: 'skills',
            message: 'Multiple hubs',
            evidence: ['/hub-a', '/hub-b'],
            agents_affected: [],
          },
        ],
      }),
      { syncTarget: '/hub-a' },
    );
    const set = plan.find((a) => a.kind === 'set_sync_target');
    expect(set).toBeDefined();
    expect(set!.value).toBe('/hub-a');
    expect(set!.target).toMatch(/map\.yml$/);
  });

  it('generates append_instruction_link from product.missing_link findings', () => {
    const plan = buildFixPlan(
      baseReport({
        project_root: '/proj',
        findings: [
          {
            id: 'product.missing_link',
            severity: 'warn',
            domain: 'product',
            message: 'Instruction file(s) for claude-code missing link to product.md',
            evidence: ['/proj/CLAUDE.md', '/proj/product.md'],
            agents_affected: ['claude-code'],
          },
        ],
      }),
    );
    const append = plan.find((a) => a.kind === 'append_instruction_link');
    expect(append).toBeDefined();
    expect(append!.target).toBe('/proj/CLAUDE.md');
    expect(append!.value).toBe('/proj/product.md');
  });

  it('SAFE_FIX_KINDS covers required v1 actions', () => {
    expect(SAFE_FIX_KINDS.has('symlink_skills_hub')).toBe(true);
    expect(SAFE_FIX_KINDS.has('append_instruction_link')).toBe(true);
    expect(SAFE_FIX_KINDS.has('set_sync_target')).toBe(true);
    expect(SAFE_FIX_KINDS.has('copy_tree')).toBe(false);
  });
});

describe('HomeMap type smoke for set_sync_target plan', () => {
  it('map skills.sync_target is nullable', () => {
    const map: HomeMap = {
      version: 1,
      skills: { global_roots: ['/a', '/b'], sync_target: null },
      vaults: [],
      agents: [],
      projects: { roots: [], entries: [] },
    };
    expect(map.skills.sync_target).toBeNull();
  });
});

describe('buildFixPlan with user syncTarget after hub conflict', () => {
  it('plans set_sync_target plus wire for all agents_in_scope', () => {
    const hub = '/Users/me/.agents/skills';
    const report: Report = {
      generated_at: '2026-07-14T12:00:00.000Z',
      scope: 'hybrid',
      sync: {
        memory_hubs: [],
        agents_in_scope: ['claude-code', 'codex', 'grok'],
        aligned: false,
      },
      overall: { score: 40, grade: 'red' },
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
        },
      ],
      domains: [],
      findings: [
        finding({
          id: 'skills.hub_conflict',
          severity: 'error',
          domain: 'skills',
          evidence: [hub, '/h/.claude/skills', '/h/.codex/skills'],
        }),
      ],
      recommendations: [],
    };

    const plan = buildFixPlan(report, {
      syncTarget: hub,
      adapters: [
        stubAdapter('claude-code'),
        stubAdapter('codex'),
        stubAdapter('grok'),
      ],
      map: emptyMap({ global_roots: [hub, '/h/.claude/skills'], sync_target: null }),
      doctorHome: '/h/.agent-doctor',
    });

    expect(plan.some((a) => a.kind === 'set_sync_target' && a.value === hub)).toBe(true);
    expect(plan.filter((a) => a.kind === 'symlink_skills_hub').length).toBeGreaterThanOrEqual(3);
  });
});

describe('formatFixPlan empty plan messaging', () => {
  it('explains hub conflict and next steps when plan is empty', () => {
    const text = formatFixPlan([], {
      dryRun: true,
      findings: [
        finding({
          id: 'skills.hub_conflict',
          severity: 'error',
          message: 'Multiple hubs',
          evidence: ['/a/skills', '/b/skills'],
        }),
      ],
      recommendations: [
        { message: 'Choose one skills hub before wiring', finding_id: 'skills.hub_conflict' },
      ],
    });
    expect(text).toMatch(/dry-run/i);
    expect(text).toMatch(/hub conflict/i);
    expect(text).toMatch(/--sync-target/);
    expect(text).toMatch(/\/a\/skills/);
    expect(text).not.toMatch(/^\s*\(no safe actions\)\s*$/m);
  });

  it('explainEmptyFixPlan is quiet-ish when there are no findings', () => {
    const lines = explainEmptyFixPlan({ findings: [] });
    expect(lines.join('\n')).toMatch(/No findings/i);
  });
});
