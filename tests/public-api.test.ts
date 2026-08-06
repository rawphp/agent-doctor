import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'src/index.ts');

/** Stable public API surface for skill/automation consumers (ORI-782 / UR-003 C4). */
const VALUE_EXPORTS = [
  'PACKAGE_NAME',
  'PACKAGE_VERSION',
  'runChecks',
  'buildFixPlan',
  'applyFixPlan',
  'loadMap',
  'saveMap',
] as const;

const TYPE_EXPORTS = ['Report', 'HomeMap', 'Finding'] as const;

describe('package public API (src/index.ts)', () => {
  it('re-exports stable value contracts without deep imports', async () => {
    const mod = (await import(pathToFileURL(indexPath).href)) as Record<string, unknown>;

    for (const name of VALUE_EXPORTS) {
      expect(mod, `missing export: ${name}`).toHaveProperty(name);
    }

    expect(mod.PACKAGE_NAME).toBe('agent-doctor');
    expect(typeof mod.PACKAGE_VERSION).toBe('string');
    expect(typeof mod.runChecks).toBe('function');
    expect(typeof mod.buildFixPlan).toBe('function');
    expect(typeof mod.applyFixPlan).toBe('function');
    expect(typeof mod.loadMap).toBe('function');
    expect(typeof mod.saveMap).toBe('function');
  });

  it('documents type exports Report, HomeMap, Finding on the package entry', () => {
    const src = readFileSync(indexPath, 'utf8');
    for (const name of TYPE_EXPORTS) {
      // type-only re-export: export type { Report, ... } or export type { Report } from
      expect(src).toMatch(new RegExp(`\\b${name}\\b`));
      expect(src).toMatch(/export\s+type\s*\{[^}]*\bReport\b/s);
    }
    expect(src).toMatch(/export\s+type\s*\{[^}]*\bHomeMap\b/s);
    expect(src).toMatch(/export\s+type\s*\{[^}]*\bFinding\b/s);
  });

  it('points package root at dist public entry for published consumers', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      main?: string;
      types?: string;
      exports?: Record<string, unknown> | string;
    };

    expect(pkg.main).toMatch(/dist\/index\.js$/);
    expect(pkg.types).toMatch(/dist\/index\.d\.ts$/);

    // exports "." must resolve to the same public entry
    const exp = pkg.exports;
    expect(exp).toBeDefined();
    if (typeof exp === 'string') {
      expect(exp).toMatch(/dist\/index\.js$/);
    } else {
      const rootExport = exp['.'] as { import?: string; types?: string; default?: string } | string;
      expect(rootExport).toBeDefined();
      if (typeof rootExport === 'string') {
        expect(rootExport).toMatch(/dist\/index\.js$/);
      } else {
        const importPath = rootExport.import ?? rootExport.default;
        expect(importPath).toMatch(/dist\/index\.js$/);
        if (rootExport.types) {
          expect(rootExport.types).toMatch(/dist\/index\.d\.ts$/);
        }
      }
    }
  });
});
