import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentAdapter, AdapterContext } from '../adapters/types.js';
import {
  INSTRUCTION_FINDING_IDS,
  type AgentPresence,
  type FixAction,
  type HomeMap,
} from '../engine/types.js';
import {
  HIERARCHY_FINDING_IDS,
  VENDOR_POINTER_BASENAMES,
  checkInstructionHierarchy,
  checkInstructions,
  contentPointsToAgentsMd,
  requiredPointerBasenames,
  requiredVendorPointers,
} from './instructions.js';

const temps: string[] = [];

function tempDir(prefix = 'instr-domain-'): string {
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

function stubAdapter(
  id: string,
  files: string[],
  expected: string[] = [],
): AgentAdapter & { expectedInstructionFiles?: (projectRoot?: string) => string[] } {
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
    expectedInstructionFiles(projectRoot?: string): string[] {
      return expected.length > 0
        ? expected
        : projectRoot
          ? [join(projectRoot, id === 'claude-code' ? 'CLAUDE.md' : 'AGENTS.md')]
          : [];
    },
  };
}

describe('checkInstructions', () => {
  it('returns findings with stable ids and agents_affected', async () => {
    const project = tempDir();
    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [], [join(project, 'CLAUDE.md')])],
    });

    for (const f of findings) {
      expect(f.id).toMatch(/^instructions\./);
      expect(f.domain).toBe('instructions');
      expect(Array.isArray(f.agents_affected)).toBe(true);
    }
  });

  it('flags missing expected project instruction files', async () => {
    const project = tempDir();
    // no CLAUDE.md created

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [], [join(project, 'CLAUDE.md')])],
    });

    const missing = findings.filter((f) => f.id === 'instructions.missing_file');
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing[0]!.agents_affected).toContain('claude-code');
    expect(missing[0]!.evidence.some((e) => e.endsWith('CLAUDE.md'))).toBe(true);
  });

  it('does not flag when expected instruction files exist', async () => {
    const project = tempDir();
    const claudeMd = join(project, 'CLAUDE.md');
    writeFileSync(claudeMd, '# project\n');

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [claudeMd], [claudeMd])],
    });

    expect(findings.filter((f) => f.id === 'instructions.missing_file')).toEqual([]);
  });

  it('without projectRoot, only checks user-level expected files when provided', async () => {
    const home = tempDir();
    const userAgents = join(home, 'AGENTS.md');
    // missing on purpose

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('codex')],
      adapters: [stubAdapter('codex', [], [userAgents])],
    });

    expect(
      findings.some(
        (f) => f.id === 'instructions.missing_file' && f.agents_affected.includes('codex'),
      ),
    ).toBe(true);
  });

  it('skips ignored agents for missing_file checks', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS\n');
    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [{ ...presence('claude-code'), ignored: true }],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [], [join(project, 'CLAUDE.md')])],
    });
    expect(findings.filter((f) => f.id === 'instructions.missing_file')).toEqual([]);
  });

  it('skips uninstalled agents for missing_file checks', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS\n');
    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [{ ...presence('claude-code'), installed: false }],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [], [join(project, 'CLAUDE.md')])],
    });
    expect(findings.filter((f) => f.id === 'instructions.missing_file')).toEqual([]);
  });
});

describe('Project Instruction Hierarchy (diagnose path contract)', () => {
  it('exports stable hierarchy finding ids for skill cross-reference', () => {
    // Canonical ids keep hierarchy_* form from REQ-026 (REQ-027 AC preferred shorter
    // names instructions.missing_agents_md / instructions.missing_agents_pointer are aliases).
    expect(HIERARCHY_FINDING_IDS.MISSING_AGENTS_MD).toBe(
      'instructions.hierarchy_missing_agents_md',
    );
    expect(HIERARCHY_FINDING_IDS.MISSING_POINTER).toBe('instructions.hierarchy_missing_pointer');
    expect(INSTRUCTION_FINDING_IDS.HIERARCHY_MISSING_AGENTS_MD).toBe(
      HIERARCHY_FINDING_IDS.MISSING_AGENTS_MD,
    );
    expect(INSTRUCTION_FINDING_IDS.HIERARCHY_MISSING_POINTER).toBe(
      HIERARCHY_FINDING_IDS.MISSING_POINTER,
    );
    expect(INSTRUCTION_FINDING_IDS.MISSING_FILE).toBe('instructions.missing_file');
    // Preferred AC names document the same contract (do not emit as alternate ids)
    expect(INSTRUCTION_FINDING_IDS.AC_PREFERRED.MISSING_AGENTS_MD).toBe(
      'instructions.missing_agents_md',
    );
    expect(INSTRUCTION_FINDING_IDS.AC_PREFERRED.MISSING_AGENTS_POINTER).toBe(
      'instructions.missing_agents_pointer',
    );
    expect(VENDOR_POINTER_BASENAMES).toEqual(
      expect.objectContaining({
        'claude-code': 'CLAUDE.md',
        gemini: 'GEMINI.md',
        grok: 'GROK.md',
      }),
    );
  });

  it('contentPointsToAgentsMd accepts basename or markdown link (case-insensitive)', () => {
    expect(contentPointsToAgentsMd('See AGENTS.md')).toBe(true);
    expect(contentPointsToAgentsMd('Read [agents.md](./AGENTS.md)')).toBe(true);
    expect(contentPointsToAgentsMd('# Claude only rules')).toBe(false);
  });

  it('flags missing AGENTS.md at project root with hierarchy_missing_agents_md', async () => {
    const project = tempDir();
    // no AGENTS.md

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [], [join(project, 'CLAUDE.md')])],
    });

    const missing = findings.filter((f) => f.id === HIERARCHY_FINDING_IDS.MISSING_AGENTS_MD);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.domain).toBe('instructions');
    expect(missing[0]!.severity).toBe('error');
    expect(missing[0]!.evidence.some((e) => e.endsWith('AGENTS.md'))).toBe(true);
    expect(missing[0]!.agents_affected).toContain('claude-code');
  });

  it('flags vendor file that lacks AGENTS.md pointer with evidence paths', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS\nShared rules\n');
    writeFileSync(join(project, 'CLAUDE.md'), '# Claude\nLocal only rules with no pointer\n');

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [
        stubAdapter('claude-code', [join(project, 'CLAUDE.md')], [join(project, 'CLAUDE.md')]),
      ],
    });

    const missingPtr = findings.filter((f) => f.id === HIERARCHY_FINDING_IDS.MISSING_POINTER);
    expect(missingPtr.length).toBeGreaterThanOrEqual(1);
    expect(missingPtr[0]!.domain).toBe('instructions');
    expect(missingPtr[0]!.severity).toBe('warn');
    expect(missingPtr[0]!.evidence.some((e) => e.endsWith('CLAUDE.md'))).toBe(true);
    expect(missingPtr[0]!.evidence.some((e) => /agents\.md$/i.test(e))).toBe(true);
    expect(missingPtr[0]!.agents_affected).toContain('claude-code');
  });

  it('flags required vendor pointer file when agent installed but file missing', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS\n');

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      // no expectedInstructionFiles — hierarchy still requires CLAUDE.md for claude-code
      adapters: [stubAdapter('claude-code', [], [])],
    });

    const missingPtr = findings.filter(
      (f) =>
        f.id === HIERARCHY_FINDING_IDS.MISSING_POINTER &&
        f.evidence.some((e) => e.endsWith('CLAUDE.md')),
    );
    expect(missingPtr.length).toBeGreaterThanOrEqual(1);
  });

  it('requires GEMINI.md pointer via primary or file presence (presence-only ok)', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS\n');
    writeFileSync(join(project, 'GEMINI.md'), '# Gemini\nno pointer yet\n');

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [
        {
          id: 'gemini',
          adapter: 'gemini',
          installed: true,
          depth: 'presence-only',
          config_home: '/tmp/gemini',
          primary: true,
        },
      ],
      projectRoot: project,
    });

    expect(
      findings.some(
        (f) =>
          f.id === HIERARCHY_FINDING_IDS.MISSING_POINTER &&
          f.evidence.some((e) => e.endsWith('GEMINI.md')),
      ),
    ).toBe(true);
  });

  it('requires GEMINI.md when presence-only gemini is primary even if file is missing', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS\n');
    // no GEMINI.md on disk

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [
        {
          id: 'gemini',
          adapter: 'gemini',
          installed: true,
          depth: 'presence-only',
          config_home: '/tmp/gemini',
          primary: true,
        },
      ],
      projectRoot: project,
      // No deep gemini adapter package — presence + map only
      adapters: [],
    });

    const missing = findings.filter(
      (f) =>
        f.id === HIERARCHY_FINDING_IDS.MISSING_POINTER &&
        f.evidence.some((e) => e.endsWith('GEMINI.md')),
    );
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing[0]!.agents_affected).toContain('gemini');
  });

  it('requires pointer when GEMINI.md exists without pointer content even if gemini agent is absent', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS\n');
    writeFileSync(join(project, 'GEMINI.md'), '# Gemini local rules only\n');

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [], // file presence alone is enough
      projectRoot: project,
      adapters: [],
    });

    expect(
      findings.some(
        (f) =>
          f.id === HIERARCHY_FINDING_IDS.MISSING_POINTER &&
          f.evidence.some((e) => e.endsWith('GEMINI.md')),
      ),
    ).toBe(true);
  });

  it('shared helper returns required pointer basenames from agents + project files', () => {
    const project = tempDir();
    writeFileSync(join(project, 'GEMINI.md'), '# gemini\n');

    const withClaude = requiredVendorPointers(project, [presence('claude-code')]);
    expect(withClaude.map((v) => v.basename).sort()).toEqual(['CLAUDE.md', 'GEMINI.md']);
    expect(withClaude.find((v) => v.basename === 'CLAUDE.md')?.exists).toBe(false);
    expect(withClaude.find((v) => v.basename === 'GEMINI.md')?.exists).toBe(true);

    const basenames = requiredPointerBasenames(project, [
      presence('claude-code'),
      { ...presence('codex') },
      {
        id: 'gemini',
        adapter: 'gemini',
        installed: false,
        primary: true,
        depth: 'presence-only',
      },
    ]);
    // Codex is AGENTS.md-native — not a vendor pointer basename
    expect(basenames).toEqual(expect.arrayContaining(['CLAUDE.md', 'GEMINI.md']));
    expect(basenames).not.toContain('AGENTS.md');
    expect(basenames.some((b) => b.toLowerCase() === 'codex.md')).toBe(false);
  });

  it('healthy hierarchy produces zero hierarchy findings', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS\nShared\n');
    writeFileSync(
      join(project, 'CLAUDE.md'),
      'Read and follow **[AGENTS.md](./AGENTS.md)** for all project instructions.\n',
    );

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('claude-code'), presence('codex')],
      projectRoot: project,
      adapters: [
        stubAdapter('claude-code', [join(project, 'CLAUDE.md')], [join(project, 'CLAUDE.md')]),
        stubAdapter('codex', [join(project, 'AGENTS.md')], [join(project, 'AGENTS.md')]),
      ],
    });

    const hierarchy = findings.filter(
      (f) =>
        f.id === HIERARCHY_FINDING_IDS.MISSING_AGENTS_MD ||
        f.id === HIERARCHY_FINDING_IDS.MISSING_POINTER,
    );
    expect(hierarchy).toEqual([]);
  });

  it('skips hierarchy checks without projectRoot (machine-only / global scope)', async () => {
    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('claude-code')],
      adapters: [stubAdapter('claude-code', [], [])],
    });

    expect(
      findings.filter(
        (f) =>
          f.id === HIERARCHY_FINDING_IDS.MISSING_AGENTS_MD ||
          f.id === HIERARCHY_FINDING_IDS.MISSING_POINTER,
      ),
    ).toEqual([]);
    // Direct hierarchy entry also no-ops without projectRoot
    expect(
      checkInstructionHierarchy({
        map: emptyMap(),
        agents: [presence('claude-code')],
      }),
    ).toEqual([]);
  });

  it('does not require pointer for Codex (AGENTS.md is native — pointer file not required)', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS\n');

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('codex')],
      projectRoot: project,
      adapters: [stubAdapter('codex', [join(project, 'AGENTS.md')], [join(project, 'AGENTS.md')])],
    });

    expect(findings.filter((f) => f.id === HIERARCHY_FINDING_IDS.MISSING_POINTER)).toEqual([]);
    expect(findings.filter((f) => f.id === HIERARCHY_FINDING_IDS.MISSING_AGENTS_MD)).toEqual([]);
  });

  it('does not require vendor pointer when agent uninstalled and file absent', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'AGENTS.md'), '# AGENTS\n');
    // no CLAUDE.md, claude-code not installed / not primary → pointer not required

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [{ ...presence('claude-code'), installed: false, primary: false }],
      projectRoot: project,
      adapters: [stubAdapter('claude-code', [], [join(project, 'CLAUDE.md')])],
    });

    expect(
      findings.filter(
        (f) =>
          f.id === HIERARCHY_FINDING_IDS.MISSING_POINTER &&
          f.evidence.some((e) => e.endsWith('CLAUDE.md')),
      ),
    ).toEqual([]);
    expect(findings.filter((f) => f.id === HIERARCHY_FINDING_IDS.MISSING_AGENTS_MD)).toEqual([]);
  });

  it('accepts case-insensitive AGENTS.md basename on disk', async () => {
    const project = tempDir();
    writeFileSync(join(project, 'agents.md'), '# agents hub\n');
    writeFileSync(join(project, 'CLAUDE.md'), 'Follow agents.md for project instructions.\n');

    const findings = await checkInstructions({
      map: emptyMap(),
      agents: [presence('claude-code')],
      projectRoot: project,
      adapters: [
        stubAdapter('claude-code', [join(project, 'CLAUDE.md')], [join(project, 'CLAUDE.md')]),
      ],
    });

    expect(findings.filter((f) => f.id === HIERARCHY_FINDING_IDS.MISSING_AGENTS_MD)).toEqual([]);
    expect(findings.filter((f) => f.id === HIERARCHY_FINDING_IDS.MISSING_POINTER)).toEqual([]);
  });
});
