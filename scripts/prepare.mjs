/**
 * Build dist/ when missing (git installs). Skip when dist is already packed (npm tarball).
 */
import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'dist', 'cli.js');

try {
  await access(cli);
  process.exit(0);
} catch {
  // need build
}

const r = spawnSync('npx', ['tsc', '-p', 'tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

process.exit(r.status === null ? 1 : r.status);
