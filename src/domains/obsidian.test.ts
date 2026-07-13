import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentAdapter, AdapterContext } from '../adapters/types.js';
import type { AgentPresence, FixAction, HomeMap } from '../engine/types.js';
import { checkObsidian } from './obsidian.js';

const temps: string[] = [];

function tempDir(prefix = 'obsidian-domain-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length > 0) {
    rmSync(temps.pop()!, { recursive: true, force: true });
  }
});

function mapWithVaults(vaults: HomeMap['vaults']): HomeMap {
  return {
    version: 1,
    skills: { global_roots: [], sync_target: null },
    vaults,
    agents: [],
    projects: { roots: [], entries: [] },
  };
}

function presence(id: string): AgentPresence {
  return {
    id,
    adapter: id,
    installed: true,
    depth: 'deep',
    config_home: `/tmp/${id}`,
  };
}

function stubAdapter(id: string, files: string[], memory: string[] = []): AgentAdapter {
  return {
    id,
    async detect(): Promise<AgentPresence> {
      return presence(id);
    },
    async skillsRoots(_ctx?: AdapterContext): Promise<string[]> {
      return [];
    },
    async instructionFiles(): Promise<string[]> {
      return files;
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

describe('checkObsidian', () => {
  it('returns findings with stable ids and agents_affected when vaults mapped', async () => {
    const vault = tempDir();
    const project = tempDir();
    const instr = join(project, 'CLAUDE.md');
    writeFileSync(instr, 'no vault mention\n');

    const findings = await checkObsidian({
      map: mapWithVaults([{ path: vault, source: 'manual' }]),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [instr])],
    });

    for (const f of findings) {
      expect(f.id).toMatch(/^obsidian\./);
      expect(f.domain).toBe('obsidian');
      expect(Array.isArray(f.agents_affected)).toBe(true);
    }
  });

  it('does not invent a vault when map has none', async () => {
    const project = tempDir();
    const instr = join(project, 'CLAUDE.md');
    writeFileSync(instr, 'anything\n');

    const findings = await checkObsidian({
      map: mapWithVaults([]),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [instr])],
    });

    // No vault path invented; may emit none_configured info only
    expect(
      findings.every(
        (f) =>
          f.id === 'obsidian.none_configured' ||
          !f.evidence.some((e) => e.includes('vault') && e.startsWith('/')),
      ),
    ).toBe(true);
    expect(
      findings.filter((f) =>
        [
          'obsidian.vault_missing',
          'obsidian.missing_vault_link',
          'obsidian.broken_vault_link',
        ].includes(f.id),
      ),
    ).toEqual([]);
  });

  it('flags missing vault path on disk when vaults are in map', async () => {
    const missing = join(tempDir(), 'gone-vault');

    const findings = await checkObsidian({
      map: mapWithVaults([{ path: missing, source: 'manual' }]),
      agents: [presence('claude-code')],
      adapters: [stubAdapter('claude-code', [])],
    });

    const broken = findings.filter((f) => f.id === 'obsidian.vault_missing');
    expect(broken).toHaveLength(1);
    expect(broken[0]!.evidence).toContain(missing);
  });

  it('flags missing vault links in instruction files when vault exists', async () => {
    const vault = tempDir();
    mkdirSync(vault, { recursive: true });
    const project = tempDir();
    const instr = join(project, 'CLAUDE.md');
    writeFileSync(instr, 'No memory path here.\n');

    const findings = await checkObsidian({
      map: mapWithVaults([{ path: vault, source: 'discovered' }]),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [instr], [])],
    });

    const missingLink = findings.filter((f) => f.id === 'obsidian.missing_vault_link');
    expect(missingLink.length).toBeGreaterThanOrEqual(1);
    expect(missingLink[0]!.agents_affected).toContain('claude-code');
  });

  it('does not flag when instruction or memoryPointers reference the vault', async () => {
    const vault = tempDir();
    mkdirSync(vault, { recursive: true });
    const project = tempDir();
    const instr = join(project, 'CLAUDE.md');
    writeFileSync(instr, `Vault at ${vault}\n`);

    const findings = await checkObsidian({
      map: mapWithVaults([{ path: vault, source: 'manual' }]),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [instr], [vault])],
    });

    expect(findings.filter((f) => f.id === 'obsidian.missing_vault_link')).toEqual([]);
  });

  it('never writes vault content (check is read-only)', async () => {
    const vault = tempDir();
    const marker = join(vault, 'only-marker.txt');
    writeFileSync(marker, 'keep\n');

    await checkObsidian({
      map: mapWithVaults([{ path: vault, source: 'manual' }]),
      agents: [presence('claude-code')],
      adapters: [stubAdapter('claude-code', [])],
    });

    // only the marker should exist; no new vault notes
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(vault)).toEqual(['only-marker.txt']);
  });
});
