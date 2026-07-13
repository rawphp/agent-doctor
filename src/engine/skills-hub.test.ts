import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentAdapter, AdapterContext } from '../adapters/types.js';
import type { AgentPresence, FixAction, HomeMap } from './types.js';
import { resolveSkillsHub } from './skills-hub.js';

/** Normalize existing paths the same way resolution does (realpath). */
function resolved(path: string): string {
  return realpathSync(path);
}

const temps: string[] = [];

function tempDir(prefix = 'skills-hub-'): string {
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

/** Directory that exists and contains at least one entry (populated). */
function makePopulatedRoot(parent: string, name: string): string {
  const root = join(parent, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'skill.md'), '# skill\n');
  return root;
}

/** Directory that exists but is empty (not populated). */
function makeEmptyRoot(parent: string, name: string): string {
  const root = join(parent, name);
  mkdirSync(root, { recursive: true });
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

function stubAdapter(id: string, roots: string[]): AgentAdapter {
  return {
    id,
    async detect(): Promise<AgentPresence> {
      return {
        id,
        adapter: id,
        installed: true,
        depth: 'deep',
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

describe('resolveSkillsHub', () => {
  it('uses map.skills.sync_target when set', async () => {
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'chosen-hub');
    const other = makePopulatedRoot(base, 'other-hub');

    const result = await resolveSkillsHub({
      map: baseMap({
        global_roots: [hub, other],
        sync_target: hub,
      }),
      adapters: [],
    });

    expect(result.hub).toBe(resolved(hub));
    expect(result.findings.filter((f) => f.id === 'skills.hub_conflict')).toEqual([]);
    expect(result.findings.filter((f) => f.id === 'skills.no_hub')).toEqual([]);
  });

  it('uses sync_target even when other roots are also populated', async () => {
    const base = tempDir();
    const target = makePopulatedRoot(base, 'explicit');
    const rival = makePopulatedRoot(base, 'rival');

    const result = await resolveSkillsHub({
      map: baseMap({
        global_roots: [rival],
        sync_target: target,
      }),
      adapters: [stubAdapter('claude-code', [rival])],
    });

    expect(result.hub).toBe(resolved(target));
    expect(result.findings.some((f) => f.id === 'skills.hub_conflict')).toBe(false);
  });

  it('when exactly one candidate root has content, it becomes hub', async () => {
    const base = tempDir();
    const only = makePopulatedRoot(base, 'only-hub');
    const empty = makeEmptyRoot(base, 'empty-dir');

    const result = await resolveSkillsHub({
      map: baseMap({
        global_roots: [only, empty],
        sync_target: null,
      }),
      adapters: [],
    });

    expect(result.hub).toBe(resolved(only));
    expect(result.findings.filter((f) => f.id === 'skills.hub_conflict')).toEqual([]);
    expect(result.findings.filter((f) => f.id === 'skills.no_hub')).toEqual([]);
  });

  it('treats a single populated adapter root as hub when map roots empty', async () => {
    const base = tempDir();
    const adapterRoot = makePopulatedRoot(base, 'adapter-skills');

    const result = await resolveSkillsHub({
      map: baseMap({ global_roots: [], sync_target: null }),
      adapters: [stubAdapter('claude-code', [adapterRoot])],
    });

    expect(result.hub).toBe(resolved(adapterRoot));
  });

  it('when two+ populated roots and no sync_target, result is conflict and hub undefined', async () => {
    const base = tempDir();
    const a = makePopulatedRoot(base, 'hub-a');
    const b = makePopulatedRoot(base, 'hub-b');

    const result = await resolveSkillsHub({
      map: baseMap({
        global_roots: [a, b],
        sync_target: null,
      }),
      adapters: [],
    });

    expect(result.hub).toBeUndefined();
    const conflicts = result.findings.filter((f) => f.id === 'skills.hub_conflict');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.domain).toBe('skills');
    expect(conflicts[0]!.severity).toMatch(/warn|error/);
    expect(conflicts[0]!.evidence.length).toBeGreaterThanOrEqual(2);
    expect(result.findings.some((f) => f.id === 'skills.no_hub')).toBe(false);
  });

  it('conflict includes populated roots from adapters and map', async () => {
    const base = tempDir();
    const mapRoot = makePopulatedRoot(base, 'map-root');
    const agentRoot = makePopulatedRoot(base, 'agent-root');

    const result = await resolveSkillsHub({
      map: baseMap({
        global_roots: [mapRoot],
        sync_target: null,
      }),
      adapters: [stubAdapter('codex', [agentRoot])],
    });

    expect(result.hub).toBeUndefined();
    expect(result.findings.some((f) => f.id === 'skills.hub_conflict')).toBe(true);
  });

  it('empty roots produce explicit no-hub finding, not a fake path', async () => {
    const result = await resolveSkillsHub({
      map: baseMap({ global_roots: [], sync_target: null }),
      adapters: [],
    });

    expect(result.hub).toBeUndefined();
    const noHub = result.findings.filter((f) => f.id === 'skills.no_hub');
    expect(noHub).toHaveLength(1);
    expect(noHub[0]!.domain).toBe('skills');
    expect(noHub[0]!.message.length).toBeGreaterThan(0);
    // Must not invent a hard-coded hero path
    expect(result.hub).not.toBeTruthy();
  });

  it('empty directories alone do not count as populated and yield no-hub', async () => {
    const base = tempDir();
    const empty1 = makeEmptyRoot(base, 'empty-a');
    const empty2 = makeEmptyRoot(base, 'empty-b');

    const result = await resolveSkillsHub({
      map: baseMap({
        global_roots: [empty1, empty2],
        sync_target: null,
      }),
      adapters: [],
    });

    expect(result.hub).toBeUndefined();
    expect(result.findings.some((f) => f.id === 'skills.no_hub')).toBe(true);
    expect(result.findings.some((f) => f.id === 'skills.hub_conflict')).toBe(false);
  });

  it('collects per-agent roots from adapters', async () => {
    const base = tempDir();
    const claudeRoot = makePopulatedRoot(base, 'claude-skills');
    const codexRoot = makeEmptyRoot(base, 'codex-skills');

    const result = await resolveSkillsHub({
      map: baseMap({ global_roots: [], sync_target: null }),
      adapters: [stubAdapter('claude-code', [claudeRoot]), stubAdapter('codex', [codexRoot])],
    });

    expect(result.agentRoots['claude-code']).toEqual([claudeRoot]);
    expect(result.agentRoots['codex']).toEqual([codexRoot]);
    // Single populated → hub resolved from adapter root
    expect(result.hub).toBe(resolved(claudeRoot));
  });

  it('dedupes candidate roots by resolved path when comparing populated set', async () => {
    const base = tempDir();
    const only = makePopulatedRoot(base, 'shared');
    // Same path via different string form still one candidate when resolved
    const sameViaJoin = join(base, 'shared');

    const result = await resolveSkillsHub({
      map: baseMap({
        global_roots: [only, sameViaJoin],
        sync_target: null,
      }),
      adapters: [stubAdapter('claude-code', [only])],
    });

    expect(result.hub).toBe(resolved(only));
    expect(result.findings.some((f) => f.id === 'skills.hub_conflict')).toBe(false);
  });
});
