import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const V1_COMMANDS = ['init', 'map', 'status', 'dashboard', 'fix', 'agents', 'check'] as const;

function runHelp(): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--help'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('agent-doctor --help', () => {
  it('exits 0', () => {
    const { status } = runHelp();
    expect(status).toBe(0);
  });

  it('lists all v1 commands from the design', () => {
    const { stdout, stderr } = runHelp();
    const text = `${stdout}\n${stderr}`;
    for (const command of V1_COMMANDS) {
      expect(text).toMatch(new RegExp(`\\b${command}\\b`));
    }
  });
});

describe('package metadata', () => {
  it('names the binary agent-doctor', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      bin?: string | Record<string, string>;
      name?: string;
    };
    expect(pkg.name).toBe('agent-doctor');
    if (typeof pkg.bin === 'string') {
      expect(pkg.bin).toBeTruthy();
      // When bin is a string, the package name is the binary name.
      expect(pkg.name).toBe('agent-doctor');
    } else {
      expect(pkg.bin).toBeDefined();
      expect(pkg.bin).toHaveProperty('agent-doctor');
    }
  });
});
