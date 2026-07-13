import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentAdapter, AdapterContext } from '../adapters/types.js';
import type { AgentPresence, FixAction, HomeMap } from '../engine/types.js';
import { checkConsistency } from './consistency.js';

const temps: string[] = [];

function tempDir(prefix = 'consistency-domain-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length > 0) {
    rmSync(temps.pop()!, { recursive: true, force: true });
  }
});

function populated(parent: string, name: string): string {
  const root = join(parent, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'skill.md'), '# skill\n');
  return root;
}

function baseMap(overrides: Partial<HomeMap> = {}): HomeMap {
  return {
    version: 1,
    skills: { global_roots: [], sync_target: null },
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
    ...overrides,
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

function stubAdapter(id: string, roots: string[], memory: string[] = []): AgentAdapter {
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
      return memory;
    },
    proposeWireToSkillsHub(): FixAction[] {
      return [];
    },
    proposeWireMemory(): FixAction[] {
      return [];
    },
  };
}

describe('checkConsistency', () => {
  it('returns findings with stable ids and agents_affected', async () => {
    const base = tempDir();
    const a = populated(base, 'a');
    const b = populated(base, 'b');

    const findings = await checkConsistency({
      map: baseMap(),
      agents: [presence('claude-code'), presence('codex')],
      agentRoots: {
        'claude-code': [a],
        codex: [b],
      },
      adapters: [stubAdapter('claude-code', [a]), stubAdapter('codex', [b])],
    });

    for (const f of findings) {
      expect(f.id).toMatch(/^consistency\./);
      expect(f.domain).toBe('consistency');
      expect(Array.isArray(f.agents_affected)).toBe(true);
    }
  });

  it('flags divergent skills hubs/roots across non-ignored first-class agents', async () => {
    const base = tempDir();
    const claude = populated(base, 'claude-skills');
    const codex = populated(base, 'codex-skills');

    const findings = await checkConsistency({
      map: baseMap(),
      agents: [presence('claude-code'), presence('codex')],
      agentRoots: {
        'claude-code': [claude],
        codex: [codex],
      },
      adapters: [stubAdapter('claude-code', [claude]), stubAdapter('codex', [codex])],
    });

    const div = findings.filter((f) => f.id === 'consistency.divergent_skills_roots');
    expect(div).toHaveLength(1);
    expect(div[0]!.agents_affected.sort()).toEqual(['claude-code', 'codex']);
    expect(div[0]!.severity).toMatch(/warn|error/);
  });

  it('does not flag when all first-class agents share the same hub root', async () => {
    const base = tempDir();
    const hub = populated(base, 'hub');

    const findings = await checkConsistency({
      map: baseMap({
        skills: { global_roots: [hub], sync_target: hub },
      }),
      agents: [presence('claude-code'), presence('codex')],
      hub: realpathSync(hub),
      agentRoots: {
        'claude-code': [hub],
        codex: [hub],
      },
      adapters: [stubAdapter('claude-code', [hub]), stubAdapter('codex', [hub])],
    });

    expect(findings.filter((f) => f.id === 'consistency.divergent_skills_roots')).toEqual([]);
  });

  it('flags divergent memory pointers across agents', async () => {
    const base = tempDir();
    const vaultA = join(base, 'vault-a');
    const vaultB = join(base, 'vault-b');
    mkdirSync(vaultA);
    mkdirSync(vaultB);

    const findings = await checkConsistency({
      map: baseMap({
        vaults: [
          { path: vaultA, source: 'manual' },
          { path: vaultB, source: 'manual' },
        ],
      }),
      agents: [presence('claude-code'), presence('codex')],
      agentRoots: {},
      adapters: [stubAdapter('claude-code', [], [vaultA]), stubAdapter('codex', [], [vaultB])],
    });

    const mem = findings.filter((f) => f.id === 'consistency.divergent_memory_pointers');
    expect(mem).toHaveLength(1);
    expect(mem[0]!.agents_affected.sort()).toEqual(['claude-code', 'codex']);
  });

  it('ignores ignored agents when comparing fleet pointers', async () => {
    const base = tempDir();
    const claude = populated(base, 'claude');
    const codex = populated(base, 'codex');

    const findings = await checkConsistency({
      map: baseMap(),
      agents: [presence('claude-code'), presence('codex', { ignored: true })],
      agentRoots: {
        'claude-code': [claude],
        codex: [codex],
      },
      adapters: [stubAdapter('claude-code', [claude]), stubAdapter('codex', [codex])],
    });

    expect(findings.filter((f) => f.id === 'consistency.divergent_skills_roots')).toEqual([]);
  });

  it('ignores presence-only agents for skills divergence', async () => {
    const base = tempDir();
    const claude = populated(base, 'claude');

    const findings = await checkConsistency({
      map: baseMap(),
      agents: [presence('claude-code'), presence('gemini', { depth: 'presence-only' })],
      agentRoots: {
        'claude-code': [claude],
        gemini: [],
      },
      adapters: [stubAdapter('claude-code', [claude]), stubAdapter('gemini', [])],
    });

    expect(findings.filter((f) => f.id === 'consistency.divergent_skills_roots')).toEqual([]);
  });
});
