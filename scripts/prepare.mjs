/**
 * Build dist/ when missing (git installs). Skip when dist is already packed (npm tarball).
 * Uses the local TypeScript package — never `npx tsc` (that resolves the wrong npm package).
 */
import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
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

const require = createRequire(path.join(root, 'package.json'));

let tscEntry;
try {
  tscEntry = require.resolve('typescript/lib/tsc.js');
} catch {
  console.error(
    'prepare: typescript is not installed. Run npm install (with devDependencies) so the project can build.',
  );
  process.exit(1);
}

const r = spawnSync(process.execPath, [tscEntry, '-p', 'tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (r.status !== 0) {
  console.error('prepare: tsc failed');
  process.exit(r.status === null ? 1 : r.status);
}

try {
  await access(cli);
} catch {
  console.error('prepare: build finished but dist/cli.js is missing');
  process.exit(1);
}

process.exit(0);
