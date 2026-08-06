import { describe, expect, it } from 'vitest';
import { defaultOpenBrowser } from './open-browser.js';

/**
 * Source-level guarantees for C3: browser open lives under surfaces/,
 * not as a sibling-command import from dashboard.
 */
describe('defaultOpenBrowser (surfaces)', () => {
  it('exports defaultOpenBrowser as an async-capable function', () => {
    expect(typeof defaultOpenBrowser).toBe('function');
  });

  it('resolves without throwing for a loopback URL (best-effort open)', async () => {
    await expect(defaultOpenBrowser('http://127.0.0.1:9/')).resolves.toBeUndefined();
  });
});

describe('no sibling-command coupling for browser open', () => {
  it('fix does not import from commands/dashboard', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../commands/fix.ts', import.meta.url), 'utf8'),
    );
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/from\s+['"]\.\/dashboard\.js['"]/);
    expect(codeOnly).not.toMatch(/from\s+['"]\.\.\/commands\/dashboard(?:\.js)?['"]/);
  });

  it('fix imports defaultOpenBrowser from surfaces/open-browser', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../commands/fix.ts', import.meta.url), 'utf8'),
    );
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).toMatch(
      /from\s+['"]\.\.\/surfaces\/open-browser\.js['"]/,
    );
    expect(codeOnly).toMatch(/\bdefaultOpenBrowser\b/);
  });

  it('dashboard imports defaultOpenBrowser from surfaces/open-browser', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../commands/dashboard.ts', import.meta.url), 'utf8'),
    );
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).toMatch(
      /from\s+['"]\.\.\/surfaces\/open-browser\.js['"]/,
    );
    // Implementation must not still define the helper locally under that name.
    expect(codeOnly).not.toMatch(/export\s+async\s+function\s+defaultOpenBrowser\b/);
  });

  it('surfaces/open-browser defines defaultOpenBrowser', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./open-browser.ts', import.meta.url), 'utf8'),
    );
    expect(source).toMatch(/export\s+async\s+function\s+defaultOpenBrowser\b/);
  });
});
