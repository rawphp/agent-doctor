/** Filesystem probes shared by the agent adapters. */

import { access, lstat, readlink } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** True when `path` is a symlink whose resolved target equals `hub`. */
export async function isSymlinkToHub(path: string, hub: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (!stat.isSymbolicLink()) {
      return false;
    }
    const target = await readlink(path);
    return resolve(path, '..', target) === resolve(hub);
  } catch {
    return false;
  }
}
