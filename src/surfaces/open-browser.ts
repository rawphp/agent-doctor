/**
 * Shared browser-open helper for local surface URLs (dashboard, fix-plan preview).
 * Failures are best-effort — callers still print the URL.
 */

import { spawn } from 'node:child_process';

/**
 * Open URL in the default browser (macOS `open`, Linux `xdg-open`, Windows `start`).
 * Failures are swallowed by the promise resolve path — spawn errors do not reject.
 */
export async function defaultOpenBrowser(url: string): Promise<void> {
  const platform = process.platform;
  let cmd: string;
  let args: string[];
  if (platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }

  await new Promise<void>((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'ignore',
      detached: true,
    });
    child.once('error', () => resolve());
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
