import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentAdapter, AdapterContext } from '../adapters/types.js';
import type { AgentPresence, FixAction, HomeMap } from '../engine/types.js';
import { checkProduct, isPureAgentsPointer } from './product.js';

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
      adapters: [stubAdapter('claude-code', [claude]), stubAdapter('codex', [agentsMd])],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing).toEqual([]);
    expect(missing.every((f) => !f.evidence.includes(claude))).toBe(true);
  });

  it('still requires product link on vendor files with unique non-pointer body', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    const agentsMd = join(project, 'AGENTS.md');
    writeFileSync(agentsMd, '# AGENTS\n\n## Product\n\n- See [product.md](./product.md).\n');
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
      adapters: [stubAdapter('claude-code', [claude]), stubAdapter('codex', [agentsMd])],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing.every((f) => !f.evidence.includes(claude))).toBe(true);
    expect(missing.some((f) => f.evidence.includes(agentsMd))).toBe(true);
  });

  it('ignores adapter-returned user-home instruction paths for product.missing_link', async () => {
    // Regression: adapters return ~/.codex/AGENTS.md, home CLAUDE.md, config.toml
    // alongside project surfaces. Only projectRoot paths must be product-link checked.
    const project = tempDir();
    const home = tempDir('product-user-home-');
    writeFileSync(join(project, 'product.md'), '# product\n');
    const projectAgents = join(project, 'AGENTS.md');
    writeFileSync(
      projectAgents,
      '# AGENTS\n\n## Product\n\n- See [product.md](./product.md) when present.\n',
    );
    const homeAgents = join(home, 'AGENTS.md');
    writeFileSync(homeAgents, '# user-home AGENTS — deliberately no product link\n');
    const homeConfig = join(home, 'config.toml');
    writeFileSync(homeConfig, 'model = "gpt"\n');
    const homeClaude = join(home, 'CLAUDE.md');
    writeFileSync(homeClaude, '# user-home CLAUDE without product.md link\n');

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('codex'), presence('claude-code')],
      projectRoot: project,
      adapters: [
        stubAdapter('codex', [homeAgents, homeConfig, projectAgents]),
        stubAdapter('claude-code', [homeClaude]),
      ],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing).toEqual([]);
    for (const f of findings) {
      expect(f.evidence.includes(homeAgents)).toBe(false);
      expect(f.evidence.includes(homeConfig)).toBe(false);
      expect(f.evidence.includes(homeClaude)).toBe(false);
    }
  });
});

/**
 * REQ-034 AC lock: AGENTS-first product policy + message targets + fleet coverage.
 * Implementation lives in product.ts (REQ-033); this suite hardens the acceptance contract.
 */
describe('product domain AGENTS-first AC (REQ-034)', () => {
  it('AC: AGENTS.md missing product link → product.missing_link naming AGENTS.md + product.md', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    const agentsMd = join(project, 'AGENTS.md');
    writeFileSync(agentsMd, '# AGENTS\nNo product reference.\n');

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('codex'), presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('codex', [agentsMd]), stubAdapter('claude-code', [])],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing.length).toBeGreaterThanOrEqual(1);
    const agentsFinding = missing.find((f) => f.evidence.includes(agentsMd));
    expect(agentsFinding).toBeDefined();
    expect(agentsFinding!.message).toMatch(/AGENTS\.md/i);
    expect(agentsFinding!.message).toMatch(/product\.md/i);
    expect(agentsFinding!.message).toBe('AGENTS.md missing link to product.md');
    expect(agentsFinding!.evidence).toEqual(
      expect.arrayContaining([agentsMd, join(project, 'product.md')]),
    );
  });

  it('AC: pointer-only CLAUDE.md is exempt from product.missing_link', async () => {
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
      '# Claude Code\n\nRead and follow **[AGENTS.md](./AGENTS.md)** for all project instructions.\n',
    );
    expect(isPureAgentsPointer(readFileSync(claude, 'utf8'))).toBe(true);

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code'), presence('codex')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [claude]), stubAdapter('codex', [agentsMd])],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing).toEqual([]);
    expect(missing.every((f) => !f.evidence.includes(claude))).toBe(true);
    expect(missing.every((f) => !/CLAUDE\.md/i.test(f.message))).toBe(true);
  });

  it('AC: fat (non-pointer) CLAUDE.md is still flagged with correct target names', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    const agentsMd = join(project, 'AGENTS.md');
    writeFileSync(agentsMd, '# AGENTS\n\n## Product\n\n- See [product.md](./product.md).\n');
    const claude = join(project, 'CLAUDE.md');
    const fatBody =
      '# Claude local policy\n\n' +
      'Also see AGENTS.md for shared rules.\n\n' +
      '## Unique project rules (do not move)\n\n' +
      '- Always run tests before commit in this monorepo.\n' +
      '- Prefer Vitest over Jest for frontend packages.\n' +
      '- Never invent secrets in fixtures; use placeholders only.\n' +
      '- Claude-specific tooling notes live only in this file for now.\n';
    writeFileSync(claude, fatBody);
    expect(isPureAgentsPointer(fatBody)).toBe(false);

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [claude])],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    const claudeFinding = missing.find((f) => f.evidence.includes(claude));
    expect(claudeFinding).toBeDefined();
    expect(claudeFinding!.message).toBe('CLAUDE.md missing link to product.md');
    expect(claudeFinding!.evidence).toEqual(
      expect.arrayContaining([claude, join(project, 'product.md')]),
    );
    // AGENTS already links product — must not be re-flagged
    expect(missing.every((f) => !f.evidence.includes(agentsMd))).toBe(true);
    expect(missing.every((f) => !/^AGENTS\.md missing/i.test(f.message))).toBe(true);
  });

  it('AC: no projectRoot → no product findings (even with adapters)', async () => {
    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code'), presence('codex')],
      adapters: [
        stubAdapter('claude-code', ['/tmp/does-not-matter/CLAUDE.md']),
        stubAdapter('codex', ['/tmp/does-not-matter/AGENTS.md']),
      ],
    });
    expect(findings).toEqual([]);
    expect(findings.filter((f) => f.id === 'product.missing_link')).toEqual([]);
  });

  it('AC: finding messages name the correct instruction + product target files', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    writeFileSync(join(project, 'roadmap.md'), '# roadmap\n');
    const agentsMd = join(project, 'AGENTS.md');
    writeFileSync(agentsMd, '# AGENTS\nShared without links.\n');
    const claude = join(project, 'CLAUDE.md');
    writeFileSync(
      claude,
      '# Fat vendor body\n\n' +
        'Also see AGENTS.md.\n\n' +
        '## Unique rules for Claude only\n\n' +
        '- Always run the full monorepo suite before merge.\n' +
        '- Prefer typed fixtures over free-form mocks in tests.\n' +
        '- Keep Claude-only notes out of AGENTS.md for this repo.\n' +
        '- Document local slash-command habits only here.\n',
    );

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code'), presence('codex')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [claude]), stubAdapter('codex', [agentsMd])],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    const messages = missing.map((f) => f.message).sort();

    // Messages must name instruction basename + product basename (not agent ids only)
    expect(messages).toEqual(
      expect.arrayContaining([
        'AGENTS.md missing link to product.md',
        'AGENTS.md missing link to roadmap.md',
        'CLAUDE.md missing link to product.md',
        'CLAUDE.md missing link to roadmap.md',
      ]),
    );
    for (const f of missing) {
      expect(f.message).toMatch(/^(AGENTS|CLAUDE)\.md missing link to (product|roadmap)\.md$/);
      expect(f.evidence.length).toBe(2);
      expect(f.evidence[0]).toMatch(/(AGENTS|CLAUDE)\.md$/);
      expect(f.evidence[1]).toMatch(/(product|roadmap)\.md$/);
    }
  });

  it('AC: AGENTS.md product coverage is enough for the fleet — pure pointers need no per-agent product link', async () => {
    // Multi-agent project: AGENTS links product; CLAUDE + GROK are thin pointers.
    // Must NOT require product.missing_link on every agent id / vendor file.
    const project = tempDir();
    writeFileSync(join(project, 'product.md'), '# product\n');
    writeFileSync(join(project, 'roadmap.md'), '# roadmap\n');
    const agentsMd = join(project, 'AGENTS.md');
    writeFileSync(
      agentsMd,
      '# AGENTS\n\n## Product\n\n' +
        '- See [product.md](./product.md) and [roadmap.md](./roadmap.md).\n',
    );
    const claude = join(project, 'CLAUDE.md');
    writeFileSync(
      claude,
      'Read and follow **[AGENTS.md](./AGENTS.md)** for all project instructions.\n',
    );
    const grok = join(project, 'GROK.md');
    writeFileSync(
      grok,
      '# Grok\n\nPrefer AGENTS.md for shared project instructions. Do not duplicate policy here.\n',
    );

    const findings = await checkProduct({
      map: emptyMap(),
      agents: [presence('claude-code'), presence('codex'), presence('grok')],
      projectRoot: project,
      adapters: [
        stubAdapter('claude-code', [claude]),
        stubAdapter('codex', [agentsMd]),
        stubAdapter('grok', [grok, agentsMd]),
      ],
    });

    const missing = findings.filter((f) => f.id === 'product.missing_link');
    expect(missing).toEqual([]);
    // No per-agent "instruction file for <id> links …" requirement when AGENTS covers fleet
    expect(missing.every((f) => !/No instruction file for /.test(f.message))).toBe(true);
    expect(missing.every((f) => !f.evidence.includes(claude))).toBe(true);
    expect(missing.every((f) => !f.evidence.includes(grok))).toBe(true);
  });
});
