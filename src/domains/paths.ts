/**
 * Shared path helpers for domain checkers.
 */

import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/** Resolve for comparison: realpath when present, else path.resolve. */
export function resolvePath(path: string): string {
  try {
    if (existsSync(path)) {
      return realpathSync(path);
    }
  } catch {
    // fall through
  }
  return resolve(path);
}

export function pathExists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}
