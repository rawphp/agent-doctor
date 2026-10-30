import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGeminiAdapter } from '../adapters/gemini.js';
import type { AgentAdapter, AdapterContext } from '../adapters/types.js';
import { buildFixPlan } from '../fix/plan.js';
import type { AgentPresence, FixAction, HomeMap } from './types.js';
import { isAgentOnHub, runChecks, runProjectScopedDomains } from './run-checks.js';

const temps: string[] = [];

function tempDir(prefix = 'run-checks-'): string {
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

function makePopulatedRoot(parent: string, name: string): string {
  const root = join(parent, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'SKILL.md'), '# skill\n');
  return root;
}

function baseMap(overrides: Partial<HomeMap> = {}): HomeMap {
  const { skills: skillsOverride, ...rest } = overrides;
  return {
    version: 1,
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
    ...rest,
    skills: {
      global_roots: [],
      sync_target: null,
      ...skillsOverride,
    },
  };
}

function stubAdapter(
  id: string,
  opts: {
    installed?: boolean;
    home?: string;
    roots?: string[];
    depth?: AgentPresence['depth'];
  } = {},
): AgentAdapter {
  const installed = opts.installed ?? true;
  const depth = opts.depth ?? 'deep';
  const roots = opts.roots ?? [];
  const home = opts.home ?? `/tmp/${id}`;

  return {
    id,
    async detect(): Promise<AgentPresence> {
      if (!installed) {
        return { id, adapter: id, installed: false, depth };
      }
      return {
        id,
        adapter: id,
        installed: true,
        config_home: home,
        depth,
      };
    },
    async skillsRoots(_ctx?: AdapterContext): Promise<string[]> {
      return roots;
    },
    async instructionFiles(): Promise<string[]> {
      return [];
    },
    async memoryPointers(): Promise<string[]> {
      return [];
    },
    proposeWireToSkillsHub(_hub: string): FixAction[] {
      return [];
    },
    proposeWireMemory(_paths: string[]): FixAction[] {
      return [];
    },
  };
}

describe('runChecks hybrid scope', () => {
  it('defaults scope to hybrid', async () => {
    const report = await runChecks({
      map: baseMap(),
      adapters: [],
      projectRoot: '/proj',
    });
    expect(report.scope).toBe('hybrid');
    expect(report.project_root).toBe('/proj');
  });

  it('includes overall score/grade, agents, domains, and sync block', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [stubAdapter('claude-code', { roots: [hub], home: join(base, 'claude') })],
      now: () => new Date('2026-07-14T12:00:00.000Z'),
    });

    expect(report.generated_at).toBe('2026-07-14T12:00:00.000Z');
    expect(report.overall).toMatchObject({
      score: expect.any(Number),
      grade: expect.stringMatching(/^(green|yellow|red)$/),
    });
    expect(report.sync.skills_hub).toBeDefined();
    expect(report.sync.agents_in_scope).toContain('claude-code');
    expect(report.agents.some((a) => a.id === 'claude-code')).toBe(true);
    expect(report.domains.length).toBeGreaterThan(0);
    expect(report.domains.every((d) => d.domain && d.grade)).toBe(true);
  });

  it('marks aligned when all first-class agents share the hub', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter('claude-code', { roots: [hub] }),
        stubAdapter('codex', { roots: [hub] }),
      ],
    });

    expect(report.sync.aligned).toBe(true);
    expect(report.overall.grade).toBe('green');
    expect(report.findings.filter((f) => f.id === 'skills.agent_not_on_hub')).toHaveLength(0);
  });

  it('never grades green when a non-ignored first-class agent is off hub', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    const privateRoot = makePopulatedRoot(base, 'codex-private');

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter('claude-code', { roots: [hub] }),
        stubAdapter('codex', { roots: [privateRoot] }),
      ],
    });

    expect(report.sync.aligned).toBe(false);
    expect(report.overall.grade).not.toBe('green');
    expect(
      report.findings.some(
        (f) => f.id === 'skills.agent_not_on_hub' && f.agents_affected.includes('codex'),
      ),
    ).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('flags gemini off hub when only a project .agents/skills points at the hub', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    const home = join(base, '.gemini');
    mkdirSync(home, { recursive: true });
    const project = join(base, 'project');
    mkdirSync(join(project, '.agents'), { recursive: true });
    symlinkSync(hub, join(project, '.agents', 'skills'));

    const report = await runChecks({
      projectRoot: project,
      map: baseMap({ skills: { global_roots: [hub], sync_target: hub } }),
      adapters: [createGeminiAdapter({ home })],
    });

    expect(report.sync.aligned).toBe(false);
    expect(
      report.findings.some(
        (f) => f.id === 'skills.agent_not_on_hub' && f.agents_affected.includes('gemini'),
      ),
    ).toBe(true);
  });

  it('never grades green on unresolved multi-hub conflict', async () => {
    const base = tempDir();
    const a = makePopulatedRoot(base, 'hub-a');
    const b = makePopulatedRoot(base, 'hub-b');

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [a, b], sync_target: null },
      }),
      adapters: [stubAdapter('claude-code', { roots: [a] }), stubAdapter('codex', { roots: [b] })],
    });

    expect(report.sync.skills_hub).toBeUndefined();
    expect(report.findings.some((f) => f.id === 'skills.hub_conflict')).toBe(true);
    expect(report.overall.grade).not.toBe('green');
    expect(report.sync.aligned).toBe(false);
  });

  it('ignores ignored agents for hub alignment', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    const privateRoot = makePopulatedRoot(base, 'private');

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
        agents: [
          {
            id: 'codex',
            adapter: 'codex',
            config_home: '/x',
            primary: false,
            ignored: true,
          },
        ],
      }),
      adapters: [
        stubAdapter('claude-code', { roots: [hub] }),
        stubAdapter('codex', { roots: [privateRoot] }),
      ],
    });

    expect(report.agents.find((a) => a.id === 'codex')?.ignored).toBe(true);
    expect(report.sync.agents_in_scope).not.toContain('codex');
    expect(report.sync.aligned).toBe(true);
    expect(report.overall.grade).toBe('green');
  });

  it('does not let presence-only agents block green when deep agents align', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter('claude-code', { roots: [hub] }),
        stubAdapter('cursor', { depth: 'presence-only', roots: [] }),
      ],
    });

    expect(report.sync.aligned).toBe(true);
    expect(report.overall.grade).toBe('green');
  });

  it('honors explicit machine scope', async () => {
    const report = await runChecks({
      scope: 'machine',
      map: baseMap(),
      adapters: [],
    });
    expect(report.scope).toBe('machine');
  });

  it('returns full Report for hybrid scope with projectRoot and home', async () => {
    const home = tempDir('run-checks-home-');
    const projectRoot = tempDir('run-checks-proj-');
    const hub = makePopulatedRoot(home, 'hub');
    mkdirSync(join(home, 'claude'), { recursive: true });

    const report = await runChecks({
      scope: 'hybrid',
      projectRoot,
      home,
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter('claude-code', {
          roots: [hub],
          home: join(home, 'claude'),
        }),
      ],
    });

    expect(report.scope).toBe('hybrid');
    expect(report.project_root).toBe(projectRoot);
    expect(report.generated_at).toEqual(expect.any(String));
    expect(report.overall).toMatchObject({
      score: expect.any(Number),
      grade: expect.stringMatching(/^(green|yellow|red)$/),
    });
    expect(report.sync).toMatchObject({
      skills_hub: expect.any(String),
      memory_hubs: expect.any(Array),
      agents_in_scope: expect.arrayContaining(['claude-code']),
      aligned: expect.any(Boolean),
    });
    expect(report.agents.length).toBeGreaterThan(0);
    expect(report.domains).toHaveLength(6);
    expect(report.domains.every((d) => typeof d.score === 'number' && d.grade)).toBe(true);
    expect(Array.isArray(report.findings)).toBe(true);
    expect(Array.isArray(report.recommendations)).toBe(true);
    // Domain suite ran — findings/domains use real domain checkers
    expect(report.domains.map((d) => d.domain).sort()).toEqual(
      [
        'agent_presence',
        'cross_agent_consistency',
        'instruction_files',
        'obsidian',
        'product_context',
        'shared_skills_path',
      ].sort(),
    );
  });

  it('missing map does not throw; report recommends running init', async () => {
    const home = tempDir('run-checks-nomap-');
    const projectRoot = tempDir('run-checks-nomap-proj-');

    const report = await runChecks({
      scope: 'hybrid',
      projectRoot,
      home,
      // no map injection — load from empty home (map.yml absent)
      adapters: [],
    });

    expect(report.scope).toBe('hybrid');
    expect(report.project_root).toBe(projectRoot);
    expect(report.overall).toMatchObject({
      score: expect.any(Number),
      grade: expect.stringMatching(/^(green|yellow|red)$/),
    });
    expect(report.findings.some((f) => f.id === 'map.missing' || f.id === 'map.not_found')).toBe(
      true,
    );
    expect(
      report.recommendations.some(
        (r) => r.id.includes('init') || /run\s+.*init|agent-doctor init/i.test(r.message),
      ),
    ).toBe(true);
  });

  it('access.denied on a path does not abort the entire report', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    mkdirSync(join(base, 'codex'), { recursive: true });

    const denied: AgentAdapter = {
      id: 'claude-code',
      async detect(): Promise<AgentPresence> {
        const err = new Error(
          "EACCES: permission denied, scandir '/secret/claude'",
        ) as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      },
      async skillsRoots(): Promise<string[]> {
        return [];
      },
      async instructionFiles(): Promise<string[]> {
        return [];
      },
      async memoryPointers(): Promise<string[]> {
        return [];
      },
      proposeWireToSkillsHub(): FixAction[] {
        return [];
      },
      proposeWireMemory(): FixAction[] {
        return [];
      },
    };

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [denied, stubAdapter('codex', { roots: [hub], home: join(base, 'codex') })],
      projectRoot: base,
    });

    expect(report.findings.some((f) => f.id === 'access.denied')).toBe(true);
    expect(report.agents.some((a) => a.id === 'codex')).toBe(true);
    expect(report.sync.agents_in_scope).toContain('codex');
    expect(report.overall).toMatchObject({
      score: expect.any(Number),
      grade: expect.stringMatching(/^(green|yellow|red)$/),
    });
    expect(report.domains.length).toBe(6);
  });

  it('agents_in_scope excludes ignored agents', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
        agents: [
          {
            id: 'codex',
            adapter: 'codex',
            config_home: '/x',
            primary: false,
            ignored: true,
          },
          {
            id: 'claude-code',
            adapter: 'claude-code',
            config_home: '/c',
            primary: true,
            ignored: false,
          },
        ],
      }),
      adapters: [
        stubAdapter('claude-code', { roots: [hub] }),
        stubAdapter('codex', { roots: [hub] }),
      ],
    });

    expect(report.sync.agents_in_scope).toContain('claude-code');
    expect(report.sync.agents_in_scope).not.toContain('codex');
    expect(report.agents.find((a) => a.id === 'codex')?.ignored).toBe(true);
  });
});

describe('runChecks machine scope multi-project', () => {
  it('enumerates projects under map.projects.roots with instruction findings per project', async () => {
    const base = tempDir('machine-projects-');
    const hub = makePopulatedRoot(base, 'hub');
    const projectsRoot = join(base, 'Projects');
    const projA = join(projectsRoot, 'app-a');
    const projB = join(projectsRoot, 'app-b');
    mkdirSync(projA, { recursive: true });
    mkdirSync(projB, { recursive: true });
    // Neither project has CLAUDE.md — instruction findings expected for both

    const report = await runChecks({
      scope: 'machine',
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
        projects: { roots: [projectsRoot], entries: [] },
      }),
      adapters: [stubAdapter('claude-code', { roots: [hub] })],
      // cwd is unrelated — machine must walk mapped roots, not only cwd
      projectRoot: join(base, 'unrelated-cwd'),
    });

    expect(report.scope).toBe('machine');

    const missingInstr = report.findings.filter((f) => f.id === 'instructions.missing_file');
    expect(missingInstr.length).toBeGreaterThanOrEqual(2);

    const evidenceBlobs = missingInstr.map((f) => f.evidence.join('\n'));
    expect(evidenceBlobs.some((e) => e.includes(projA))).toBe(true);
    expect(evidenceBlobs.some((e) => e.includes(projB))).toBe(true);
  });

  it('includes per-project product findings with project path in evidence', async () => {
    const base = tempDir('machine-product-');
    const hub = makePopulatedRoot(base, 'hub');
    const projectsRoot = join(base, 'Projects');
    const projA = join(projectsRoot, 'with-product');
    const projB = join(projectsRoot, 'also-product');
    mkdirSync(projA, { recursive: true });
    mkdirSync(projB, { recursive: true });
    writeFileSync(join(projA, 'product.md'), '# product A\n');
    writeFileSync(join(projB, 'product.md'), '# product B\n');
    // Instruction files exist but do not link product.md
    writeFileSync(join(projA, 'CLAUDE.md'), '# no product link\n');
    writeFileSync(join(projB, 'CLAUDE.md'), '# no product link\n');

    const dynamicAdapter: AgentAdapter = {
      id: 'claude-code',
      async detect(): Promise<AgentPresence> {
        return {
          id: 'claude-code',
          adapter: 'claude-code',
          installed: true,
          config_home: join(base, 'claude'),
          depth: 'deep',
        };
      },
      async skillsRoots(): Promise<string[]> {
        return [hub];
      },
      async instructionFiles(projectRoot?: string): Promise<string[]> {
        if (!projectRoot) return [];
        return [join(projectRoot, 'CLAUDE.md')];
      },
      async memoryPointers(): Promise<string[]> {
        return [];
      },
      proposeWireToSkillsHub(): FixAction[] {
        return [];
      },
      proposeWireMemory(): FixAction[] {
        return [];
      },
    };

    const report = await runChecks({
      scope: 'machine',
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
        projects: { roots: [projectsRoot], entries: [] },
      }),
      adapters: [dynamicAdapter],
      projectRoot: join(base, 'cwd-not-used'),
    });

    const productFindings = report.findings.filter((f) => f.id === 'product.missing_link');
    expect(productFindings.length).toBeGreaterThanOrEqual(2);
    expect(
      productFindings.some((f) => f.evidence.some((e) => e.includes(projA) || e === projA)),
    ).toBe(true);
    expect(
      productFindings.some((f) => f.evidence.some((e) => e.includes(projB) || e === projB)),
    ).toBe(true);
  });

  it('has no artificial max project count in v1 machine paths', async () => {
    const base = tempDir('machine-many-');
    const hub = makePopulatedRoot(base, 'hub');
    const projectsRoot = join(base, 'Projects');
    mkdirSync(projectsRoot, { recursive: true });

    const projectCount = 30;
    const projectPaths: string[] = [];
    for (let i = 0; i < projectCount; i++) {
      const p = join(projectsRoot, `proj-${String(i).padStart(2, '0')}`);
      mkdirSync(p, { recursive: true });
      projectPaths.push(p);
    }

    const report = await runChecks({
      scope: 'machine',
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
        projects: { roots: [projectsRoot], entries: [] },
      }),
      adapters: [stubAdapter('claude-code', { roots: [hub] })],
      projectRoot: join(base, 'cwd'),
    });

    const missingInstr = report.findings.filter((f) => f.id === 'instructions.missing_file');
    // At least one instruction finding evidence path per project (no silent truncation)
    const covered = projectPaths.filter((proj) =>
      missingInstr.some((f) => f.evidence.some((e) => e.includes(proj))),
    );
    expect(covered).toHaveLength(projectCount);
  });

  it('machine scope with empty project roots still returns a valid report', async () => {
    const report = await runChecks({
      scope: 'machine',
      map: baseMap({ projects: { roots: [], entries: [] } }),
      adapters: [],
    });
    expect(report.scope).toBe('machine');
    expect(report.overall).toMatchObject({
      score: expect.any(Number),
      grade: expect.stringMatching(/^(green|yellow|red)$/),
    });
  });
});

describe('runProjectScopedDomains (machine-scope contract)', () => {
  /**
   * Contract: machine scope strips projectRoot for the global domain suite
   * (presence/skills/obsidian/consistency), then re-runs only instructions + product
   * per enumerated project via this helper.
   */
  it('is the named owner of per-project instructions + product checks', async () => {
    expect(typeof runProjectScopedDomains).toBe('function');

    const base = tempDir('scoped-domains-');
    const hub = makePopulatedRoot(base, 'hub');
    const projectsRoot = join(base, 'Projects');
    const projA = join(projectsRoot, 'a');
    const projB = join(projectsRoot, 'b');
    mkdirSync(projA, { recursive: true });
    mkdirSync(projB, { recursive: true });

    const adapters = [stubAdapter('claude-code', { roots: [hub] })];
    const map = baseMap({
      skills: { global_roots: [hub], sync_target: hub },
      projects: { roots: [projectsRoot], entries: [] },
    });

    const denied: unknown[] = [];
    const result = await runProjectScopedDomains(
      {
        map,
        agents: [],
        // Intentionally no projectRoot — mirrors machine global suite strip
        projectRoot: undefined,
        hub,
        agentRoots: {},
        adapters,
      },
      [projA, projB],
      (f) => {
        denied.push(f);
      },
    );

    expect(result.instructions.length).toBeGreaterThanOrEqual(2);
    expect(result.product.length).toBeGreaterThanOrEqual(0);

    const instrEvidence = result.instructions.map((f) => f.evidence.join('\n'));
    expect(instrEvidence.some((e) => e.includes(projA))).toBe(true);
    expect(instrEvidence.some((e) => e.includes(projB))).toBe(true);
    expect(denied).toHaveLength(0);
  });
});

describe('isAgentOnHub', () => {
  it('matches resolved paths', () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    expect(isAgentOnHub([hub], hub)).toBe(true);
    expect(isAgentOnHub([realpathSync(hub)], hub)).toBe(true);
    expect(isAgentOnHub([makePopulatedRoot(base, 'other')], hub)).toBe(false);
  });
});

/**
 * ORI-780: Report.fix_plan is always full buildFixPlan output (or empty).
 * Domain fix_actions are internal hints only — never attached as partial user-visible plans.
 */
describe('runChecks Report.fix_plan authority (ORI-780)', () => {
  it('sets report.fix_plan to buildFixPlan result for off-hub agents (not domain stubs alone)', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    const privateRoot = makePopulatedRoot(base, 'codex-private');
    const wireProposal: FixAction = {
      id: 'fix.wire_codex_skills',
      kind: 'symlink_skills_hub',
      description: `Symlink ${privateRoot} → ${hub}`,
      target: privateRoot,
      value: hub,
      agent_id: 'codex',
    };
    const adapters: AgentAdapter[] = [
      stubAdapter('claude-code', { roots: [hub] }),
      {
        ...stubAdapter('codex', { roots: [privateRoot], home: join(base, 'codex') }),
        proposeWireToSkillsHub(h: string): FixAction[] {
          return [{ ...wireProposal, value: h }];
        },
      },
    ];
    const map = baseMap({
      skills: { global_roots: [hub], sync_target: hub },
    });

    const report = await runChecks({
      map,
      adapters,
      projectRoot: base,
    });

    expect(report.findings.some((f) => f.id === 'skills.agent_not_on_hub')).toBe(true);

    const expected = buildFixPlan({
      findings: report.findings,
      map,
      adapters,
      hub: report.sync.skills_hub,
      agentsInScope: report.sync.agents_in_scope,
      projectRoot: report.project_root,
    });

    expect(report.fix_plan).toEqual(expected);
    expect(report.fix_plan?.some((a) => a.kind === 'symlink_skills_hub')).toBe(true);
  });

  it('includes hierarchy create_agents_stub from buildFixPlan when AGENTS.md is missing', async () => {
    // Domain suite does not emit hierarchy fix_actions — only skills does.
    // Partial domain attach would leave fix_plan empty/undefined; full plan must include stub.
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    const projectRoot = tempDir('hierarchy-proj-');
    // No AGENTS.md at project root

    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [stubAdapter('claude-code', { roots: [hub] })],
      projectRoot,
    });

    expect(
      report.findings.some(
        (f) =>
          f.id === 'instructions.hierarchy_missing_agents_md' ||
          f.id === 'instructions.missing_agents_md',
      ),
    ).toBe(true);

    const expected = buildFixPlan({
      findings: report.findings,
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [stubAdapter('claude-code', { roots: [hub] })],
      hub: report.sync.skills_hub,
      agentsInScope: report.sync.agents_in_scope,
      projectRoot: report.project_root,
    });

    expect(report.fix_plan).toEqual(expected);
    expect(report.fix_plan?.some((a) => a.kind === 'create_agents_stub')).toBe(true);
  });

  it('includes set_sync_target from buildFixPlan on hub conflict (domain wires blocked)', async () => {
    const base = tempDir();
    const a = makePopulatedRoot(base, 'hub-a');
    const b = makePopulatedRoot(base, 'hub-b');
    const map = baseMap({
      skills: { global_roots: [a, b], sync_target: null },
    });
    const adapters = [
      stubAdapter('claude-code', { roots: [a] }),
      stubAdapter('codex', { roots: [b] }),
    ];

    const report = await runChecks({
      map,
      adapters,
      projectRoot: base,
    });

    expect(report.findings.some((f) => f.id === 'skills.hub_conflict')).toBe(true);

    const expected = buildFixPlan({
      findings: report.findings,
      map,
      adapters,
      hub: report.sync.skills_hub,
      agentsInScope: report.sync.agents_in_scope,
      projectRoot: report.project_root,
    });

    expect(report.fix_plan).toEqual(expected);
    expect(report.fix_plan?.some((a) => a.kind === 'set_sync_target')).toBe(true);
  });

  it('omits fix_plan or sets empty when buildFixPlan yields no actions', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    // Healthy aligned fleet — no fix actions expected
    const report = await runChecks({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter('claude-code', { roots: [hub] }),
        stubAdapter('codex', { roots: [hub] }),
      ],
      projectRoot: base,
    });

    const plan = report.fix_plan ?? [];
    const expected = buildFixPlan({
      findings: report.findings,
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      adapters: [
        stubAdapter('claude-code', { roots: [hub] }),
        stubAdapter('codex', { roots: [hub] }),
      ],
      hub: report.sync.skills_hub,
      agentsInScope: report.sync.agents_in_scope,
      projectRoot: report.project_root,
    });
    expect(plan).toEqual(expected);
  });
});
