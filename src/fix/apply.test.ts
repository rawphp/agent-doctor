import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FixAction, HomeMap } from '../engine/types.js';
import { loadMap } from '../map/load.js';
import { saveMap } from '../map/save.js';
import {
  applyFixPlan,
  agentsPointerBlock,
  MINIMAL_AGENTS_MD_STUB,
  type ApplyContext,
} from './apply.js';

const temps: string[] = [];

function tempDir(prefix = 'fix-apply-'): string {
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

function baseMap(sync_target: string | null = null): HomeMap {
  return {
    version: 1,
    skills: { global_roots: [], sync_target },
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
  };
}

describe('applyFixPlan', () => {
  it('creates symlink to hub when path is free', () => {
    const base = tempDir();
    const hub = join(base, 'hub');
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, 'SKILL.md'), '# skill\n');
    const agentSkills = join(base, 'agent', 'skills');
    mkdirSync(join(base, 'agent'), { recursive: true });

    const action: FixAction = {
      id: 'fix.wire',
      kind: 'symlink_skills_hub',
      description: `Symlink ${agentSkills} → ${hub}`,
      target: agentSkills,
      value: hub,
      agent_id: 'codex',
    };

    const results = applyFixPlan([action], { hub });
    expect(results[0]!.status).toBe('applied');
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(true);
    expect(readlinkSync(agentSkills)).toBe(hub);
  });

  it('rejects copy_tree actions without writing', () => {
    const base = tempDir();
    const src = join(base, 'src-skills');
    const dest = join(base, 'dest-skills');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'SKILL.md'), '# skill\n');

    const action: FixAction = {
      id: 'fix.copy',
      kind: 'copy_tree',
      description: 'Copy tree',
      target: dest,
      value: src,
    };

    const results = applyFixPlan([action], {});
    expect(results[0]!.status).toBe('rejected');
    expect(existsSync(dest)).toBe(false);
  });

  it('appends instruction link block without rewriting whole file', () => {
    const base = tempDir();
    const instr = join(base, 'CLAUDE.md');
    const product = join(base, 'product.md');
    writeFileSync(instr, '# Project\n\nNotes here.\n');
    writeFileSync(product, '# Product\n');

    const action: FixAction = {
      id: 'fix.append_product',
      kind: 'append_instruction_link',
      description: `Append link to ${product}`,
      target: instr,
      value: product,
    };

    const results = applyFixPlan([action], {});
    expect(results[0]!.status).toBe('applied');
    const content = readFileSync(instr, 'utf8');
    expect(content.startsWith('# Project')).toBe(true);
    expect(content).toContain('product.md');
    expect(content).toMatch(/Notes here/);
  });

  it('sets map.skills.sync_target via set_sync_target', () => {
    const home = tempDir();
    saveMap(baseMap(null), { home });
    const mapFile = join(home, 'map.yml');

    const action: FixAction = {
      id: 'fix.set_sync_target',
      kind: 'set_sync_target',
      description: 'Set sync_target to /chosen-hub',
      target: mapFile,
      value: '/chosen-hub',
    };

    const results = applyFixPlan([action], { doctorHome: home });
    expect(results[0]!.status).toBe('applied');
    const map = loadMap({ home });
    expect(map?.skills.sync_target).toBe('/chosen-hub');
  });

  it('skips conflicting symlink target and continues with next action', () => {
    const base = tempDir();
    const hub = join(base, 'hub');
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, 'SKILL.md'), '# skill\n');

    const conflictPath = join(base, 'agent-a', 'skills');
    mkdirSync(conflictPath, { recursive: true });
    writeFileSync(join(conflictPath, 'private.md'), 'private\n');

    const freePath = join(base, 'agent-b', 'skills');
    mkdirSync(join(base, 'agent-b'), { recursive: true });

    const actions: FixAction[] = [
      {
        id: 'fix.a',
        kind: 'symlink_skills_hub',
        description: 'conflict',
        target: conflictPath,
        value: hub,
      },
      {
        id: 'fix.b',
        kind: 'symlink_skills_hub',
        description: 'free',
        target: freePath,
        value: hub,
      },
    ];

    const results = applyFixPlan(actions, { hub });
    expect(results[0]!.status).toBe('skipped');
    expect(results[1]!.status).toBe('applied');
    expect(existsSync(join(conflictPath, 'private.md'))).toBe(true);
    expect(lstatSync(freePath).isSymbolicLink()).toBe(true);
  });

  it('does not apply wire/symlink without hub (no silent pick)', () => {
    const base = tempDir();
    const agentSkills = join(base, 'skills');
    mkdirSync(base, { recursive: true });

    const action: FixAction = {
      id: 'fix.wire',
      kind: 'symlink_skills_hub',
      description: 'no hub',
      target: agentSkills,
    };

    const results = applyFixPlan([action], {} satisfies ApplyContext);
    expect(results[0]!.status).toBe('skipped');
    expect(results[0]!.reason).toMatch(/sync_target|hub/i);
    expect(existsSync(agentSkills)).toBe(false);
  });

  it('set_sync_target without value is skipped (no silent pick)', () => {
    const home = tempDir();
    saveMap(baseMap(null), { home });

    const action: FixAction = {
      id: 'fix.set',
      kind: 'set_sync_target',
      description: 'missing value',
      target: join(home, 'map.yml'),
    };

    const results = applyFixPlan([action], { doctorHome: home });
    expect(results[0]!.status).toBe('skipped');
    expect(loadMap({ home })?.skills.sync_target).toBeNull();
  });

  it('dryRun applies nothing to disk', () => {
    const base = tempDir();
    const hub = join(base, 'hub');
    mkdirSync(hub, { recursive: true });
    const agentSkills = join(base, 'agent', 'skills');
    mkdirSync(join(base, 'agent'), { recursive: true });

    const action: FixAction = {
      id: 'fix.wire',
      kind: 'symlink_skills_hub',
      description: 'symlink',
      target: agentSkills,
      value: hub,
    };

    const results = applyFixPlan([action], { hub, dryRun: true });
    expect(results[0]!.status).toBe('applied');
    expect(existsSync(agentSkills)).toBe(false);
  });

  it('does not overwrite non-empty non-link dir when force is default off', () => {
    const base = tempDir();
    const hub = join(base, 'hub');
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, 'SKILL.md'), '# skill\n');

    const agentSkills = join(base, 'agent', 'skills');
    mkdirSync(agentSkills, { recursive: true });
    writeFileSync(join(agentSkills, 'local-skill.md'), 'keep me\n');

    const action: FixAction = {
      id: 'fix.wire',
      kind: 'symlink_skills_hub',
      description: 'symlink',
      target: agentSkills,
      value: hub,
    };

    // force omitted = default off
    const results = applyFixPlan([action], { hub });
    expect(results[0]!.status).toBe('skipped');
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(agentSkills, 'local-skill.md'), 'utf8')).toBe('keep me\n');
  });

  it('does not overwrite non-empty non-link dir when force is explicitly false', () => {
    const base = tempDir();
    const hub = join(base, 'hub');
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, 'SKILL.md'), '# skill\n');

    const agentSkills = join(base, 'agent', 'skills');
    mkdirSync(agentSkills, { recursive: true });
    writeFileSync(join(agentSkills, 'local-skill.md'), 'keep me\n');

    const action: FixAction = {
      id: 'fix.wire',
      kind: 'symlink_skills_hub',
      description: 'symlink',
      target: agentSkills,
      value: hub,
    };

    const results = applyFixPlan([action], { hub, force: false });
    expect(results[0]!.status).toBe('skipped');
    expect(existsSync(join(agentSkills, 'local-skill.md'))).toBe(true);
  });

  it('replaces empty non-link directory with symlink (safe)', () => {
    const base = tempDir();
    const hub = join(base, 'hub');
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, 'SKILL.md'), '# skill\n');

    const agentSkills = join(base, 'agent', 'skills');
    mkdirSync(agentSkills, { recursive: true }); // empty dir occupies path

    const action: FixAction = {
      id: 'fix.wire',
      kind: 'symlink_skills_hub',
      description: 'symlink',
      target: agentSkills,
      value: hub,
    };

    const results = applyFixPlan([action], { hub });
    expect(results[0]!.status).toBe('applied');
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(true);
    expect(readlinkSync(agentSkills)).toBe(hub);
  });

  it('with force true replaces non-empty non-link dir with symlink', () => {
    const base = tempDir();
    const hub = join(base, 'hub');
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, 'SKILL.md'), '# skill\n');

    const agentSkills = join(base, 'agent', 'skills');
    mkdirSync(agentSkills, { recursive: true });
    writeFileSync(join(agentSkills, 'local-skill.md'), 'will be replaced\n');

    const action: FixAction = {
      id: 'fix.wire',
      kind: 'symlink_skills_hub',
      description: 'symlink',
      target: agentSkills,
      value: hub,
    };

    const results = applyFixPlan([action], { hub, force: true });
    expect(results[0]!.status).toBe('applied');
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(true);
    expect(readlinkSync(agentSkills)).toBe(hub);
  });

  it('link-block append is idempotent on second apply', () => {
    const base = tempDir();
    const instr = join(base, 'AGENTS.md');
    const product = join(base, 'product.md');
    writeFileSync(instr, '# Agents\n\nIntro.\n');
    writeFileSync(product, '# Product\n');

    const action: FixAction = {
      id: 'fix.append_product',
      kind: 'append_instruction_link',
      description: `Append link to ${product}`,
      target: instr,
      value: product,
    };

    const first = applyFixPlan([action], {});
    expect(first[0]!.status).toBe('applied');
    const afterFirst = readFileSync(instr, 'utf8');
    const markerCountFirst = (afterFirst.match(/<!-- agent-doctor:link -->/g) ?? []).length;
    expect(markerCountFirst).toBe(1);

    const second = applyFixPlan([action], {});
    expect(second[0]!.status).toBe('applied');
    const afterSecond = readFileSync(instr, 'utf8');
    const markerCountSecond = (afterSecond.match(/<!-- agent-doctor:link -->/g) ?? []).length;
    expect(markerCountSecond).toBe(1);
    expect(afterSecond).toBe(afterFirst);
  });

  it('rejects copy-tree-like kinds without writing', () => {
    const base = tempDir();
    const dest = join(base, 'dest');
    for (const kind of ['copy_tree', 'copy_skills', 'content_copy'] as const) {
      const action: FixAction = {
        id: `fix.${kind}`,
        kind,
        description: kind,
        target: dest,
        value: join(base, 'src'),
      };
      const results = applyFixPlan([action], {});
      expect(results[0]!.status).toBe('rejected');
    }
    expect(existsSync(dest)).toBe(false);
  });

  it('temp-dir apply + re-check proves symlink and link wiring', () => {
    const base = tempDir();
    const hub = join(base, 'hub');
    mkdirSync(hub, { recursive: true });
    writeFileSync(join(hub, 'SKILL.md'), '# skill\n');

    const agentSkills = join(base, 'agent', 'skills');
    mkdirSync(join(base, 'agent'), { recursive: true });

    const instr = join(base, 'project', 'CLAUDE.md');
    const product = join(base, 'project', 'product.md');
    mkdirSync(join(base, 'project'), { recursive: true });
    writeFileSync(instr, '# Project\n');
    writeFileSync(product, '# Product\n');

    const home = join(base, 'doctor-home');
    mkdirSync(home, { recursive: true });
    saveMap(baseMap(null), { home });

    const actions: FixAction[] = [
      {
        id: 'fix.wire',
        kind: 'symlink_skills_hub',
        description: 'wire skills',
        target: agentSkills,
        value: hub,
        agent_id: 'codex',
      },
      {
        id: 'fix.link',
        kind: 'append_instruction_link',
        description: 'link product',
        target: instr,
        value: product,
      },
      {
        id: 'fix.sync',
        kind: 'set_sync_target',
        description: 'set hub',
        target: join(home, 'map.yml'),
        value: hub,
      },
    ];

    const results = applyFixPlan(actions, { hub, doctorHome: home });
    expect(results.every((r) => r.status === 'applied')).toBe(true);

    // re-check path: filesystem + map reflect applied plan
    expect(lstatSync(agentSkills).isSymbolicLink()).toBe(true);
    expect(readlinkSync(agentSkills)).toBe(hub);
    expect(existsSync(join(agentSkills, 'SKILL.md'))).toBe(true);

    const content = readFileSync(instr, 'utf8');
    expect(content).toContain('<!-- agent-doctor:link -->');
    expect(content).toContain('product.md');

    const map = loadMap({ home });
    expect(map?.skills.sync_target).toBe(hub);

    // re-apply is stable (idempotent re-check path)
    const again = applyFixPlan(actions, { hub, doctorHome: home });
    expect(again.every((r) => r.status === 'applied')).toBe(true);
    expect((readFileSync(instr, 'utf8').match(/<!-- agent-doctor:link -->/g) ?? []).length).toBe(1);
  });
});

describe('applyFixPlan hierarchy (REQ-030)', () => {
  it('creates minimal AGENTS.md stub when missing', () => {
    const base = tempDir();
    const agentsMd = join(base, 'AGENTS.md');

    const results = applyFixPlan(
      [
        {
          id: 'fix.create_agents_stub',
          kind: 'create_agents_stub',
          description: 'Create minimal AGENTS.md stub',
          target: agentsMd,
          finding_ids: ['instructions.hierarchy_missing_agents_md'],
        },
      ],
      {},
    );

    expect(results[0]!.status).toBe('applied');
    expect(existsSync(agentsMd)).toBe(true);
    const content = readFileSync(agentsMd, 'utf8');
    expect(content).toMatch(/# AGENTS\.md/);
    expect(content).toMatch(/Shared project instructions/i);
    // Minimal stub only — not a long invented policy dump
    expect(content.length).toBeLessThan(800);
  });

  it('does not overwrite existing AGENTS.md body on create_agents_stub', () => {
    const base = tempDir();
    const agentsMd = join(base, 'AGENTS.md');
    const original = '# Existing project policy\n\nDo not wipe me.\n';
    writeFileSync(agentsMd, original);

    const results = applyFixPlan(
      [
        {
          id: 'fix.create_agents_stub',
          kind: 'create_agents_stub',
          description: 'stub',
          target: agentsMd,
        },
      ],
      {},
    );

    expect(results[0]!.status).toBe('applied');
    expect(results[0]!.reason).toMatch(/already exists|present/i);
    expect(readFileSync(agentsMd, 'utf8')).toBe(original);
  });

  it('appends AGENTS.md pointer without deleting existing vendor body', () => {
    const base = tempDir();
    const claude = join(base, 'CLAUDE.md');
    const agentsMd = join(base, 'AGENTS.md');
    writeFileSync(claude, '# Claude local notes\n\nUnique rules stay here.\n');
    writeFileSync(agentsMd, '# AGENTS\n');

    const results = applyFixPlan(
      [
        {
          id: 'fix.append_agents_pointer_CLAUDE.md',
          kind: 'append_agents_pointer',
          description: 'Append AGENTS.md pointer in CLAUDE.md',
          target: claude,
          value: agentsMd,
        },
      ],
      {},
    );

    expect(results[0]!.status).toBe('applied');
    const content = readFileSync(claude, 'utf8');
    expect(content.startsWith('# Claude local notes')).toBe(true);
    expect(content).toMatch(/Unique rules stay here/);
    expect(content).toMatch(/agents\.md/i);
    // Must not be a wholesale rewrite to pointer-only
    expect(content).not.toBe(
      'Read and follow **[AGENTS.md](./AGENTS.md)** for all project instructions, policies, and shared agent setup. Prefer AGENTS.md over duplicating rules here.\n',
    );
  });

  it('creates missing vendor pointer file with minimal pointer content', () => {
    const base = tempDir();
    const claude = join(base, 'CLAUDE.md');
    const agentsMd = join(base, 'AGENTS.md');
    writeFileSync(agentsMd, '# AGENTS\n');

    const results = applyFixPlan(
      [
        {
          id: 'fix.append_agents_pointer_CLAUDE.md',
          kind: 'append_agents_pointer',
          description: 'Create CLAUDE.md pointer',
          target: claude,
          value: agentsMd,
        },
      ],
      {},
    );

    expect(results[0]!.status).toBe('applied');
    expect(existsSync(claude)).toBe(true);
    expect(readFileSync(claude, 'utf8')).toMatch(/agents\.md/i);
  });

  it('append_agents_pointer is idempotent', () => {
    const base = tempDir();
    const claude = join(base, 'CLAUDE.md');
    const agentsMd = join(base, 'AGENTS.md');
    writeFileSync(claude, '# Claude\n');
    writeFileSync(agentsMd, '# AGENTS\n');

    const action: FixAction = {
      id: 'fix.append_agents_pointer_CLAUDE.md',
      kind: 'append_agents_pointer',
      description: 'pointer',
      target: claude,
      value: agentsMd,
    };

    const first = applyFixPlan([action], {});
    expect(first[0]!.status).toBe('applied');
    const afterFirst = readFileSync(claude, 'utf8');

    const second = applyFixPlan([action], {});
    expect(second[0]!.status).toBe('applied');
    expect(second[0]!.reason).toMatch(/already present|pointer already/i);
    expect(readFileSync(claude, 'utf8')).toBe(afterFirst);
  });

  it('dry-run hierarchy actions never write', () => {
    const base = tempDir();
    const agentsMd = join(base, 'AGENTS.md');
    const claude = join(base, 'CLAUDE.md');
    writeFileSync(claude, '# Claude only\n');

    const results = applyFixPlan(
      [
        {
          id: 'fix.create_agents_stub',
          kind: 'create_agents_stub',
          description: 'stub',
          target: agentsMd,
        },
        {
          id: 'fix.append_agents_pointer_CLAUDE.md',
          kind: 'append_agents_pointer',
          description: 'pointer',
          target: claude,
          value: agentsMd,
        },
      ],
      { dryRun: true },
    );

    expect(results.every((r) => r.status === 'applied')).toBe(true);
    expect(results.every((r) => r.reason?.match(/dry-run/i))).toBe(true);
    expect(existsSync(agentsMd)).toBe(false);
    expect(readFileSync(claude, 'utf8')).toBe('# Claude only\n');
  });

  it('apply stub + pointer then hierarchy re-check would clear those findings', () => {
    const base = tempDir();
    const agentsMd = join(base, 'AGENTS.md');
    const claude = join(base, 'CLAUDE.md');
    writeFileSync(claude, '# Vendor body\n\nLocal only.\n');

    const results = applyFixPlan(
      [
        {
          id: 'fix.create_agents_stub',
          kind: 'create_agents_stub',
          description: 'stub',
          target: agentsMd,
        },
        {
          id: 'fix.append_agents_pointer_CLAUDE.md',
          kind: 'append_agents_pointer',
          description: 'pointer',
          target: claude,
          value: agentsMd,
        },
      ],
      {},
    );

    expect(results.every((r) => r.status === 'applied')).toBe(true);
    expect(existsSync(agentsMd)).toBe(true);
    const vendor = readFileSync(claude, 'utf8');
    expect(vendor).toMatch(/Local only/);
    expect(vendor).toMatch(/agents\.md/i);
  });
});

/**
 * REQ-032 harden ACs: create minimal stub; skip non-empty AGENTS;
 * marker/clear-block pointer append; idempotent; already-linked.
 */
describe('applyFixPlan hierarchy harden (REQ-032)', () => {
  it('create: missing AGENTS.md gets skill-matching minimal stub with soft product wording', () => {
    const base = tempDir();
    const agentsMd = join(base, 'AGENTS.md');

    const results = applyFixPlan(
      [
        {
          id: 'fix.create_agents_stub',
          kind: 'create_agents_stub',
          description: 'Create minimal AGENTS.md stub',
          target: agentsMd,
          finding_ids: ['instructions.hierarchy_missing_agents_md'],
        },
      ],
      {},
    );

    expect(results[0]!.status).toBe('applied');
    const content = readFileSync(agentsMd, 'utf8');
    expect(content).toBe(MINIMAL_AGENTS_MD_STUB);
    // Soft product wording (skill: omit or soften when product.md may be absent)
    expect(content).toMatch(/product\.md/i);
    expect(content).toMatch(/when present/i);
    expect(content.length).toBeLessThan(800);
  });

  it('skip-existing: non-empty AGENTS.md is left unchanged (no-op / applied already)', () => {
    const base = tempDir();
    const agentsMd = join(base, 'AGENTS.md');
    const original = '# Real policy\n\n- Do not invent overwrites\n';
    writeFileSync(agentsMd, original);

    const results = applyFixPlan(
      [
        {
          id: 'fix.create_agents_stub',
          kind: 'create_agents_stub',
          description: 'stub',
          target: agentsMd,
        },
      ],
      {},
    );

    expect(results[0]!.status).toBe('applied');
    expect(results[0]!.reason).toMatch(/already exists|unchanged|present/i);
    expect(readFileSync(agentsMd, 'utf8')).toBe(original);
  });

  it('create: empty AGENTS.md is treated as missing content and filled with minimal stub', () => {
    const base = tempDir();
    const agentsMd = join(base, 'AGENTS.md');
    writeFileSync(agentsMd, '');

    const results = applyFixPlan(
      [
        {
          id: 'fix.create_agents_stub',
          kind: 'create_agents_stub',
          description: 'stub empty',
          target: agentsMd,
        },
      ],
      {},
    );

    expect(results[0]!.status).toBe('applied');
    expect(readFileSync(agentsMd, 'utf8')).toBe(MINIMAL_AGENTS_MD_STUB);
  });

  it('append: pointer uses marker block and preserves existing vendor body', () => {
    const base = tempDir();
    const claude = join(base, 'CLAUDE.md');
    const agentsMd = join(base, 'AGENTS.md');
    writeFileSync(claude, '# Claude local\n\nKeep unique rules.\n');
    writeFileSync(agentsMd, '# AGENTS\n');

    const results = applyFixPlan(
      [
        {
          id: 'fix.append_agents_pointer_CLAUDE.md',
          kind: 'append_agents_pointer',
          description: 'Append AGENTS.md pointer',
          target: claude,
          value: agentsMd,
        },
      ],
      {},
    );

    expect(results[0]!.status).toBe('applied');
    const content = readFileSync(claude, 'utf8');
    expect(content.startsWith('# Claude local')).toBe(true);
    expect(content).toMatch(/Keep unique rules/);
    expect(content).toContain('<!-- agent-doctor:agents-pointer -->');
    expect(content).toContain('<!-- /agent-doctor:agents-pointer -->');
    expect(content).toMatch(/agents\.md/i);
    // Marker block matches exported template
    expect(content).toContain(agentsPointerBlock().trim());
  });

  it('already-linked: informal AGENTS.md reference is no-op (no second block)', () => {
    const base = tempDir();
    const claude = join(base, 'CLAUDE.md');
    const agentsMd = join(base, 'AGENTS.md');
    // Hand-written pointer without our marker — still "already linked"
    const original =
      '# Claude Code\n\nSee AGENTS.md for shared project instructions.\n';
    writeFileSync(claude, original);
    writeFileSync(agentsMd, '# AGENTS\n');

    const results = applyFixPlan(
      [
        {
          id: 'fix.append_agents_pointer_CLAUDE.md',
          kind: 'append_agents_pointer',
          description: 'pointer',
          target: claude,
          value: agentsMd,
        },
      ],
      {},
    );

    expect(results[0]!.status).toBe('applied');
    expect(results[0]!.reason).toMatch(/already present|pointer already|already linked/i);
    expect(readFileSync(claude, 'utf8')).toBe(original);
    expect(original.match(/agents\.md/gi)?.length).toBe(1);
  });

  it('append: second apply is idempotent (marker not duplicated)', () => {
    const base = tempDir();
    const gemini = join(base, 'GEMINI.md');
    const agentsMd = join(base, 'AGENTS.md');
    writeFileSync(gemini, '# Gemini notes\n');
    writeFileSync(agentsMd, '# AGENTS\n');

    const action: FixAction = {
      id: 'fix.append_agents_pointer_GEMINI.md',
      kind: 'append_agents_pointer',
      description: 'pointer',
      target: gemini,
      value: agentsMd,
    };

    const first = applyFixPlan([action], {});
    expect(first[0]!.status).toBe('applied');
    const afterFirst = readFileSync(gemini, 'utf8');
    const markerCountFirst = (
      afterFirst.match(/<!-- agent-doctor:agents-pointer -->/g) ?? []
    ).length;
    expect(markerCountFirst).toBe(1);

    const second = applyFixPlan([action], {});
    expect(second[0]!.status).toBe('applied');
    expect(second[0]!.reason).toMatch(/already present|pointer already/i);
    const afterSecond = readFileSync(gemini, 'utf8');
    expect(afterSecond).toBe(afterFirst);
    expect((afterSecond.match(/<!-- agent-doctor:agents-pointer -->/g) ?? []).length).toBe(1);
  });
});
