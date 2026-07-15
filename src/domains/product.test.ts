import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentAdapter, AdapterContext } from '../adapters/types.js';
import type { AgentPresence, FixAction, HomeMap } from '../engine/types.js';
import { checkProduct } from './product.js';

const temps: string[] = [];

function tempDir(prefix = 'product-domain-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length > 0) {
    rmSync(temps.pop()!, { recursive: true, force: true });
  }
});

function emptyMap(): HomeMap {
  return {
    version: 1,
    skills: { global_roots: [], sync_target: null },
    vaults: [],
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

function stubAdapter(id: string, files: string[]): AgentAdapter {
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
      return [];
    },
    proposeWireToSkillsHub(): FixAction[] {
      return [];
    },
    proposeWireMemory(): FixAction[] {
      return [];
    },
  };
}

describe('checkProduct', () => {
  it('returns findings with stable ids and agents_affected', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    const instr = join(project, 'CLAUDE.md');
    writeFileSync(instr, '# no links\n');

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [instr])],
    });

    for (const f of findings) {
      expect(f.id).toMatch(/^product\./);
      expect(f.domain).toBe('product');
      expect(Array.isArray(f.agents_affected)).toBe(true);
    }
  });

  it('flags missing links from instruction files to product.md when it exists', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    const instr = join(project, 'CLAUDE.md');
    writeFileSync(instr, 'No product reference here.\n');

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [instr])],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing.some((f) => f.message.includes('product.md'))).toBe(true);
    expect(missing[0]!.agents_affected).toContain('claude-code');
    expect(missing[0]!.evidence).toContain(instr);
  });

  it('flags missing links to roadmap.md when it exists', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'roadmap.md'), '# roadmap\n');
    const instr = join(project, 'AGENTS.md');
    writeFileSync(instr, 'Hello\n');

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('codex')],
      projectRoot: project,
      adapters: [stubAdapter('codex', [instr])],
    });

    expect(
      findings.some((f) => f.id === 'product.missing_link' && f.message.includes('roadmap.md')),
    ).toBe(true);
  });

  it('does not flag when instruction files link product and roadmap', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    writeFileSync(join(project, 'roadmap.md'), '# roadmap\n');
    const instr = join(project, 'CLAUDE.md');
    writeFileSync(instr, 'See [product](product.md) and [roadmap](./roadmap.md).\n');

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [instr])],
    });

    expect(findings.filter((f) => f.id === 'product.missing_link')).toEqual([]);
  });

  it('returns no findings when product/roadmap files do not exist', async () => {
    const project = tempDir();
    const instr = join(project, 'CLAUDE.md');
    writeFileSync(instr, '# no product files in project\n');

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [instr])],
    });

    expect(findings).toEqual([]);
  });

  it('returns no findings without projectRoot', async () => {
    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code')],
      adapters: [stubAdapter('claude-code', [])],
    });
    expect(findings).toEqual([]);
  });

  it('accepts bare path mentions as links', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    const instr = join(project, 'CLAUDE.md');
    writeFileSync(instr, 'Product context: product.md\n');

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [instr])],
    });

    expect(findings.filter((f) => f.id === 'product.missing_link')).toEqual([]);
  });
});

describe('product link policy with hierarchy (REQ-033)', () => {
  it('flags AGENTS.md when it exists and lacks product link', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    const agentsMd = join(project, 'AGENTS.md');
    writeFileSync(agentsMd, '# AGENTS\nShared setup without product link.\n');

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('codex')],
      projectRoot: project,
      adapters: [stubAdapter('codex', [agentsMd])],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing.some((f) => f.evidence.includes(agentsMd))).toBe(true);
    expect(missing.some((f) => f.message.toLowerCase().includes('agents.md'))).toBe(true);
  });

  it('does not emit product.missing_link for pure AGENTS.md pointer vendor files', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    const agentsMd = join(project, 'AGENTS.md');
    writeFileSync(
      agentsMd,
      '# AGENTS\n\n## Product\n\n- See [product.md](./product.md) when present.\n',
    );
    const claude = join(project, 'CLAUDE.md');
    writeFileSync(
      claude,
      '# Claude Code — project entry\n\n' +
        'Read and follow **[AGENTS.md](./AGENTS.md)** for all project instructions, ' +
        'policies, and shared agent setup. Prefer AGENTS.md over duplicating rules here.\n',
    );

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code'), presence('codex')],
      projectRoot: project,
      adapters: [
        stubAdapter('claude-code', [claude]),
        stubAdapter('codex', [agentsMd]),
      ],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing).toEqual([]);
    expect(missing.every((f) => !f.evidence.includes(claude))).toBe(true);
  });

  it('still requires product link on vendor files with unique non-pointer body', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    const agentsMd = join(project, 'AGENTS.md');
    writeFileSync(
      agentsMd,
      '# AGENTS\n\n## Product\n\n- See [product.md](./product.md).\n',
    );
    const claude = join(project, 'CLAUDE.md');
    writeFileSync(
      claude,
      '# Claude local policy\n\n' +
        'Also see AGENTS.md for shared rules.\n\n' +
        '## Unique project rules (do not move)\n\n' +
        '- Always run tests before commit in this monorepo.\n' +
        '- Prefer Vitest over Jest for frontend packages.\n' +
        '- Never invent secrets in fixtures; use placeholders only.\n' +
        '- Claude-specific tooling notes live only in this file for now.\n',
    );

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [claude])],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing.some((f) => f.evidence.includes(claude))).toBe(true);
    // AGENTS already links product — should not flag AGENTS
    expect(missing.every((f) => !f.evidence.includes(agentsMd))).toBe(true);
  });

  it('emits findings only for surfaces that need product links (AGENTS, not pure pointer)', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    const agentsMd = join(project, 'AGENTS.md');
    writeFileSync(agentsMd, '# AGENTS\nShared without product.\n');
    const claude = join(project, 'CLAUDE.md');
    writeFileSync(
      claude,
      'Read and follow **[AGENTS.md](./AGENTS.md)** for all project instructions.\n',
    );

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code'), presence('codex')],
      projectRoot: project,
      adapters: [
        stubAdapter('claude-code', [claude]),
        stubAdapter('codex', [agentsMd]),
      ],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing.every((f) => !f.evidence.includes(claude))).toBe(true);
    expect(missing.some((f) => f.evidence.includes(agentsMd))).toBe(true);
  });
});
