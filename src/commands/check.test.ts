import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentAdapter, AdapterContext } from '../adapters/types.js';
import type { AgentPresence, FixAction, HomeMap } from '../engine/types.js';
import { CHECK_DOMAIN_KEYS, parseCheckArgs, runCheck } from './check.js';

const temps: string[] = [];

function tempDir(prefix = 'check-cmd-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
  process.exitCode = undefined;
});

function makePopulatedRoot(parent: string, name: string): string {
  const root = join(parent, name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'SKILL.md'), '# skill\n');
  return root;
}

function baseMap(skills: HomeMap['skills']): HomeMap {
  return {
    version: 1,
    skills,
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
        config_home: `/tmp/${id}`,
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

describe('parseCheckArgs', () => {
  it('parses domain positional and --json', () => {
    expect(parseCheckArgs(['skills'])).toEqual({
      domain: 'skills',
      json: false,
    });
    expect(parseCheckArgs(['skills', '--json'])).toEqual({
      domain: 'skills',
      json: true,
    });
    expect(parseCheckArgs(['--json'])).toEqual({
      domain: undefined,
      json: true,
    });
  });

  it('exposes known domain keys', () => {
    expect(CHECK_DOMAIN_KEYS).toContain('skills');
    expect(CHECK_DOMAIN_KEYS).toContain('presence');
    expect(CHECK_DOMAIN_KEYS).toContain('instructions');
  });
});

describe('runCheck', () => {
  it('check skills runs skills-related findings only with exit codes', async () => {
    const lines: string[] = [];
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');
    const privateRoot = makePopulatedRoot(base, 'private');

    // Off-hub private tree ⇒ skills.agent_not_on_hub finding
    const { report, exitCode } = await runCheck({
      args: ['skills'],
      checks: {
        map: baseMap({ global_roots: [hub], sync_target: hub }),
        adapters: [stubAdapter('claude-code', [privateRoot]), stubAdapter('codex', [hub])],
      },
      stdout: (line) => lines.push(line),
      applyProcessExitCode: false,
    });

    // Only skills-domain findings (and hub findings under skills)
    for (const f of report.findings) {
      expect(f.domain).toBe('skills');
    }
    expect(report.findings.some((f) => f.id === 'skills.agent_not_on_hub')).toBe(true);

    // Domain results filtered to skills
    expect(report.domains.length).toBe(1);
    expect(report.domains[0]?.domain).toMatch(/skills|shared_skills/);

    // Exit code reflects grade (desync ⇒ not green)
    expect(exitCode).toBeGreaterThanOrEqual(1);
    expect(exitCode).toBeLessThanOrEqual(2);

    const text = lines.join('\n');
    expect(text.toLowerCase()).toMatch(/skill/);
  });

  it('check skills green when all agents on hub', async () => {
    const lines: string[] = [];
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');

    const { report, exitCode } = await runCheck({
      args: ['skills'],
      checks: {
        map: baseMap({ global_roots: [hub], sync_target: hub }),
        adapters: [stubAdapter('claude-code', [hub])],
      },
      stdout: (line) => lines.push(line),
      applyProcessExitCode: false,
    });

    expect(report.findings.every((f) => f.domain === 'skills' || f.domain === 'map')).toBe(true);
    // With aligned hub and no map missing, skills domain should be healthy
    expect(report.domains[0]?.grade).toBe('green');
    expect(exitCode).toBe(0);
  });

  it('invalid domain name exits non-zero with helpful error', async () => {
    const errLines: string[] = [];
    const outLines: string[] = [];

    const { exitCode } = await runCheck({
      args: ['not-a-real-domain'],
      stdout: (line) => outLines.push(line),
      stderr: (line) => errLines.push(line),
      applyProcessExitCode: false,
    });

    expect(exitCode).toBeGreaterThan(0);
    const err = errLines.join('\n');
    expect(err).toMatch(/not-a-real-domain|unknown domain|invalid domain/i);
    expect(err).toMatch(/skills|presence|instructions/i); // lists known domains
    expect(outLines.join('\n')).not.toMatch(/Overall:/);
  });

  it('check without domain runs full report', async () => {
    const lines: string[] = [];
    const base = tempDir();
    const hub = makePopulatedRoot(base, 'hub');

    const { report, exitCode } = await runCheck({
      args: [],
      checks: {
        map: baseMap({ global_roots: [hub], sync_target: hub }),
        adapters: [stubAdapter('claude-code', [hub])],
      },
      stdout: (line) => lines.push(line),
      applyProcessExitCode: false,
    });

    expect(report.domains.length).toBeGreaterThan(1);
    expect(exitCode).toBe(0);
    expect(lines.join('\n')).toMatch(/Overall:/);
  });

  it('check instructions runs hierarchy checks with stable finding ids (REQ-029)', async () => {
    const lines: string[] = [];
    const base = tempDir('check-hierarchy-');
    const hub = makePopulatedRoot(base, 'hub');
    const projectRoot = join(base, 'project');
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, 'CLAUDE.md'), '# no AGENTS pointer\n');

    const { report, exitCode } = await runCheck({
      args: ['instructions', '--json'],
      checks: {
        map: baseMap({ global_roots: [hub], sync_target: hub }),
        adapters: [stubAdapter('claude-code', [hub])],
        projectRoot,
      },
      stdout: (line) => lines.push(line),
      applyProcessExitCode: false,
    });

    // Domain filter keeps only instructions findings (hierarchy is same domain)
    for (const f of report.findings) {
      expect(f.domain).toBe('instructions');
    }
    expect(report.findings.some((f) => f.id === 'instructions.hierarchy_missing_agents_md')).toBe(
      true,
    );
    expect(report.findings.some((f) => f.id === 'instructions.hierarchy_missing_pointer')).toBe(
      true,
    );

    // JSON stdout carries the same ids (no special-case stripping)
    const parsed = JSON.parse(lines.join('\n')) as { findings: { id: string; domain: string }[] };
    const jsonIds = parsed.findings.map((f) => f.id);
    expect(jsonIds).toContain('instructions.hierarchy_missing_agents_md');
    expect(jsonIds).toContain('instructions.hierarchy_missing_pointer');

    expect(report.domains.length).toBe(1);
    expect(report.domains[0]?.domain).toMatch(/instruction/);
    expect(exitCode).toBeGreaterThan(0);
  });
});
