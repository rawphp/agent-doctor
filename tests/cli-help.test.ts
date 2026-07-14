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

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 15_000,
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

describe('agent-doctor <command> --help', () => {
  it('dashboard --help prints usage and does not start the server', () => {
    const { status, stdout, stderr } = runCli(['dashboard', '--help']);
    const text = `${stdout}\n${stderr}`;
    expect(status).toBe(0);
    expect(text).toMatch(/Usage:\s*agent-doctor dashboard/i);
    expect(text).toMatch(/--no-open/);
    expect(text).toMatch(/--port/);
    // Must not launch the server
    expect(text).not.toMatch(/Agent Doctor dashboard:\s*http/i);
    expect(text).not.toMatch(/127\.0\.0\.1/);
  });

  it('status --help prints usage without running a full check report header', () => {
    const { status, stdout, stderr } = runCli(['status', '--help']);
    const text = `${stdout}\n${stderr}`;
    expect(status).toBe(0);
    expect(text).toMatch(/Usage:\s*agent-doctor status/i);
    expect(text).not.toMatch(/Overall:\s*\d+/);
  });

  it('accepts -h as help for dashboard', () => {
    const { status, stdout } = runCli(['dashboard', '-h']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Usage:\s*agent-doctor dashboard/i);
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
