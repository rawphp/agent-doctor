/**
 * Single package version source for CLI and public API.
 * Reads package.json from the package root (works from src/ via tsx and dist/).
 */

import { createRequire } from 'node:module';

function readPackageVersion(): string {
  try {
    // dist/version.js and src/version.ts both resolve ../package.json
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version?: string };
    if (typeof pkg.version === 'string' && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch {
    // fall through
  }
  return '0.0.0';
}

/** Package version string (matches package.json when readable). */
export const PACKAGE_VERSION = readPackageVersion();
