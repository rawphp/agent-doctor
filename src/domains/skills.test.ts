import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentAdapter, AdapterContext } from '../adapters/types.js';
import type { AgentPresence, FixAction, HomeMap } from '../engine/types.js';
import type { DomainCheckContext } from './context.js';
import { checkSkills } from './skills.js';

const temps: string[] = [];

function tempDir(prefix = 'skills-domain-'): string {
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

function populated(parent: string, name: string): string {
  const root = join(parent, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'skill.md'), '# skill\n');
  return root;
}

function baseMap(overrides: Partial<HomeMap['skills']> = {}): HomeMap {
  return {
    version: 1,
    skills: {
      global_roots: [],
      sync_target: null,
      ...overrides,
    },
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
  };
}

function presence(id: string, overrides: Partial<AgentPresence> = {}): AgentPresence {
  return {
    id,
    adapter: id,
    installed: true,
    depth: 'deep',
    config_home: `/tmp/${id}`,
    ...overrides,
  };
}

function stubAdapter(id: string, roots: string[], wire: FixAction[] = []): AgentAdapter {
  return {
    id,
    async detect(): Promise<AgentPresence> {
      return presence(id);
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
    proposeWireToSkillsHub(hub: string): FixAction[] {
      if (wire.length > 0) return wire;
      return [
        {
          id: `fix.wire_${id}_skills`,
          kind: 'symlink_skills_hub',
          description: `Symlink ${id} skills → ${hub}`,
          target: roots[0] ?? `/tmp/${id}/skills`,
          agent_id: id,
        },
      ];
    },
    proposeWireMemory(): FixAction[] {
      return [];
    },
  };
}

describe('checkSkills', () => {
  it('returns findings with stable ids and agents_affected', async () => {
    const base = tempDir();
    const hub = populated(base, 'hub');
    const privateTree = populated(base, 'codex-skills');

    const ctx: DomainCheckContext = {
      map: baseMap({ sync_target: hub, global_roots: [hub] }),
      agents: [presence('codex')],
      hub: realpathSync(hub),
      agentRoots: { codex: [privateTree] },
      adapters: [stubAdapter('codex', [privateTree])],
    };

    const { findings } = await checkSkills(ctx);
    for (const f of findings) {
      expect(f.id).toMatch(/^skills\./);
      expect(f.domain).toBe('skills');
      expect(Array.isArray(f.agents_affected)).toBe(true);
    }
  });

  it('flags agents not on the hub', async () => {
    const base = tempDir();
    const hub = populated(base, 'hub');
    const privateTree = populated(base, 'codex-private');

    const { findings } = await checkSkills({
      map: baseMap({ sync_target: hub }),
      agents: [presence('codex'), presence('claude-code')],
      hub: realpathSync(hub),
      agentRoots: {
        codex: [privateTree],
        'claude-code': [hub],
      },
      adapters: [stubAdapter('codex', [privateTree]), stubAdapter('claude-code', [hub])],
    });

    const offHub = findings.filter((f) => f.id === 'skills.agent_not_on_hub');
    expect(offHub.length).toBeGreaterThanOrEqual(1);
    expect(offHub.some((f) => f.agents_affected.includes('codex'))).toBe(true);
    expect(offHub.every((f) => !f.agents_affected.includes('claude-code'))).toBe(true);
  });

  it('treats symlink-to-hub as on hub', async () => {
    const base = tempDir();
    const hub = populated(base, 'hub');
    const agentHome = join(base, 'codex-home');
    mkdirSync(agentHome, { recursive: true });
    const link = join(agentHome, 'skills');
    symlinkSync(hub, link);

    const { findings } = await checkSkills({
      map: baseMap({ sync_target: hub }),
      agents: [presence('codex')],
      hub: realpathSync(hub),
      agentRoots: { codex: [link] },
      adapters: [stubAdapter('codex', [link])],
    });

    expect(findings.filter((f) => f.id === 'skills.agent_not_on_hub')).toEqual([]);
  });

  it('flags duplicated skill trees across agent homes', async () => {
    const base = tempDir();
    const hub = populated(base, 'hub');
    const claudeSkills = populated(base, 'claude-skills');
    const codexSkills = populated(base, 'codex-skills');

    const { findings } = await checkSkills({
      map: baseMap({ sync_target: hub }),
      agents: [presence('claude-code'), presence('codex')],
      hub: realpathSync(hub),
      agentRoots: {
        'claude-code': [claudeSkills],
        codex: [codexSkills],
      },
      adapters: [stubAdapter('claude-code', [claudeSkills]), stubAdapter('codex', [codexSkills])],
    });

    const dup = findings.filter((f) => f.id === 'skills.duplicated_trees');
    expect(dup).toHaveLength(1);
    expect(dup[0]!.agents_affected.sort()).toEqual(['claude-code', 'codex']);
    expect(dup[0]!.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it('emits symlink-capable fix metadata when agent private tree is off hub', async () => {
    const base = tempDir();
    const hub = populated(base, 'hub');
    const privateTree = populated(base, 'grok-private');

    const { findings, fix_actions } = await checkSkills({
      map: baseMap({ sync_target: hub }),
      agents: [presence('grok')],
      hub: realpathSync(hub),
      agentRoots: { grok: [privateTree] },
      adapters: [stubAdapter('grok', [privateTree])],
    });

    expect(findings.some((f) => f.id === 'skills.agent_not_on_hub')).toBe(true);
    expect(fix_actions.length).toBeGreaterThanOrEqual(1);
    const wire = fix_actions.find((a) => a.kind === 'symlink_skills_hub');
    expect(wire).toBeDefined();
    expect(wire!.agent_id).toBe('grok');
    expect(wire!.finding_ids).toContain('skills.agent_not_on_hub');
  });

  it('skips ignored agents for off-hub and duplication', async () => {
    const base = tempDir();
    const hub = populated(base, 'hub');
    const privateTree = populated(base, 'private');

    const { findings } = await checkSkills({
      map: baseMap({ sync_target: hub }),
      agents: [presence('codex', { ignored: true })],
      hub: realpathSync(hub),
      agentRoots: { codex: [privateTree] },
      adapters: [stubAdapter('codex', [privateTree])],
    });

    expect(findings.filter((f) => f.id === 'skills.agent_not_on_hub')).toEqual([]);
    expect(findings.filter((f) => f.id === 'skills.duplicated_trees')).toEqual([]);
  });

  it('when hub is missing, does not invent on-hub status', async () => {
    const base = tempDir();
    const privateTree = populated(base, 'private');

    const { findings } = await checkSkills({
      map: baseMap(),
      agents: [presence('codex')],
      hub: undefined,
      agentRoots: { codex: [privateTree] },
      adapters: [stubAdapter('codex', [privateTree])],
    });

    // No agent_not_on_hub without a hub — desync is reported only relative to a hub
    // (hub absence/conflict is skills-hub resolver's job; optional passthrough ok).
    expect(findings.every((f) => f.id !== 'skills.agent_not_on_hub' || f.sync_target)).toBe(true);
  });
});
