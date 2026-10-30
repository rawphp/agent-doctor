/**
 * Single adapter-assembly choke point (ORI-779 / UR-003 C1).
 *
 * buildDefaultAdapters is the only non-test construction path for status/check/
 * dashboard/fix. commands/fix must not keep a private dual builder.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FULL_ADAPTER_IDS } from '../adapters/index.js';
import type { HomeMap } from './types.js';
import { buildDefaultAdapters } from './run-checks.js';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const temps: string[] = [];

function tempDir(prefix = 'build-adapters-'): string {
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

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walkTsFiles(p, out);
    } else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) {
      out.push(p);
    }
  }
  return out;
}

describe('buildDefaultAdapters (shared assembly)', () => {
  it('includes full adapters when map is sparse (empty agents)', () => {
    const adapters = buildDefaultAdapters(baseMap());
    const ids = adapters.map((a) => a.id).sort();
    for (const id of FULL_ADAPTER_IDS) {
      expect(ids).toContain(id);
    }
    expect(ids).toEqual([...FULL_ADAPTER_IDS].sort());
  });

  it('uses map config_home for full adapters', async () => {
    const customHome = join(tempDir(), 'claude-home');
    mkdirSync(customHome, { recursive: true });
    const adapters = buildDefaultAdapters(
      baseMap({
        agents: [
          {
            id: 'claude-code',
            adapter: 'claude-code',
            installed: true,
            config_home: customHome,
            depth: 'deep',
            ignored: false,
          },
        ],
      }),
    );
    const claude = adapters.find((a) => a.id === 'claude-code');
    expect(claude).toBeDefined();
    const presence = await claude!.detect();
    expect(presence.config_home).toBe(customHome);
  });

  it('includes non-full map agents (presence / shallow) not in FULL_ADAPTER_IDS', () => {
    const adapters = buildDefaultAdapters(
      baseMap({
        agents: [
          {
            id: 'cursor',
            adapter: 'cursor',
            installed: true,
            config_home: join(tempDir(), 'cursor'),
            depth: 'shallow',
            ignored: false,
          },
        ],
      }),
    );
    expect(adapters.map((a) => a.id)).toContain('cursor');
    for (const id of FULL_ADAPTER_IDS) {
      expect(adapters.map((a) => a.id)).toContain(id);
    }
  });
});

describe('single adapter assembly choke point (ORI-779)', () => {
  it('commands/fix has no private adaptersForPlan dual builder', () => {
    const fixSrc = readFileSync(join(srcRoot, 'commands/fix.ts'), 'utf8');
    // Dual builder must be gone (or reduced to a 1-line wrap of the shared API).
    // Fail if a multi-line private function adaptersForPlan remains.
    const dualFn = fixSrc.match(
      /function adaptersForPlan\s*\([^)]*\)\s*:\s*AgentAdapter\[\]\s*\{[\s\S]*?\n\}/,
    );
    if (dualFn) {
      const bodyLines = dualFn[0].split('\n').length;
      // 1-line wrapper: function adaptersForPlan(...) { return buildDefaultAdapters(...); }
      // Allow at most 3 lines total (signature + return + close).
      expect(bodyLines, 'adaptersForPlan must be deleted or a 1-line wrapper').toBeLessThanOrEqual(
        3,
      );
      expect(dualFn[0]).toMatch(/buildDefaultAdapters/);
    }
    // Live construction path must call the shared API when adapters not injected.
    expect(fixSrc).toMatch(/buildDefaultAdapters/);
    expect(fixSrc).not.toMatch(/createAdapterRegistry\(\)/);
  });

  it('src has exactly one adapter-assembly implementation (buildDefaultAdapters)', () => {
    const files = walkTsFiles(srcRoot);
    const assemblyDefs: string[] = [];
    const dualBuilders: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (/export\s+function\s+buildDefaultAdapters\b/.test(src)) {
        assemblyDefs.push(file);
      }
      // Private dual builder name must not reappear outside tests.
      if (/function\s+adaptersForPlan\b/.test(src)) {
        // Allow only if it is a 1-line wrap of buildDefaultAdapters (checked above for fix.ts).
        const m = src.match(
          /function adaptersForPlan\s*\([^)]*\)\s*:\s*AgentAdapter\[\]\s*\{[\s\S]*?\n\}/,
        );
        if (!m || m[0].split('\n').length > 3 || !m[0].includes('buildDefaultAdapters')) {
          dualBuilders.push(file);
        }
      }
    }

    expect(assemblyDefs, 'expected single buildDefaultAdapters export').toHaveLength(1);
    expect(assemblyDefs[0]).toMatch(/run-checks\.ts$/);
    expect(dualBuilders, 'no private dual adapter builders').toEqual([]);
  });
});
