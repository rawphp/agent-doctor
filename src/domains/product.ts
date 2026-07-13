/**
 * Product domain (design §7.4).
 * If product.md / roadmap.md (and variants) exist, instruction files must link them.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding } from '../engine/types.js';
import { agentsInScope, type DomainCheckContext } from './context.js';
import { pathExists } from './paths.js';

/** Basenames considered product-context files (case variants on disk). */
const PRODUCT_BASENAMES = ['product.md', 'roadmap.md'] as const;

function findProductFiles(projectRoot: string): string[] {
  const found: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(projectRoot);
  } catch {
    return found;
  }

  const lowerMap = new Map(entries.map((e) => [e.toLowerCase(), e]));
  for (const base of PRODUCT_BASENAMES) {
    const actual = lowerMap.get(base.toLowerCase());
    if (actual) {
      const full = join(projectRoot, actual);
      if (pathExists(full)) found.push(full);
    }
  }
  return found;
}

/**
 * Whether file content references the product file (md link, bare path, or basename).
 */
function contentLinksProduct(content: string, productPath: string): boolean {
  const base = productPath.split(/[/\\]/).pop() ?? productPath;
  const baseLower = base.toLowerCase();
  const contentLower = content.toLowerCase();

  if (contentLower.includes(baseLower)) return true;
  // markdown link patterns already covered by basename include
  // also accept relative ./product.md style via basename
  return false;
}

/**
 * Flag instruction files that do not link existing product/roadmap docs.
 */
export async function checkProduct(ctx: DomainCheckContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (!ctx.projectRoot) return findings;

  const productFiles = findProductFiles(ctx.projectRoot);
  if (productFiles.length === 0) return findings;

  const inScope = agentsInScope(ctx.agents).filter((a) => a.installed);

  for (const agent of inScope) {
    if (agent.depth === 'presence-only') continue;

    const adapter = ctx.adapters?.find((a) => a.id === agent.id);
    if (!adapter) continue;

    const instructionFiles = await adapter.instructionFiles(ctx.projectRoot);
    // Prefer project-level instruction files under projectRoot
    const projectInstr = instructionFiles.filter(
      (f) =>
        f.startsWith(ctx.projectRoot!) ||
        f.includes(`${ctx.projectRoot}/`) ||
        // also allow exact relative resolution
        pathExists(f),
    );

    // If adapter only returns existing files, use those that live under project
    const filesToCheck = projectInstr.filter((f) => {
      try {
        return f.startsWith(ctx.projectRoot!) || f.includes(ctx.projectRoot!);
      } catch {
        return false;
      }
    });

    // Fall back: any instruction files returned for this agent
    const targets = filesToCheck.length > 0 ? filesToCheck : instructionFiles;
    if (targets.length === 0) {
      // No instruction surface — one finding per product file
      for (const product of productFiles) {
        const base = product.split(/[/\\]/).pop() ?? product;
        findings.push({
          id: 'product.missing_link',
          severity: 'warn',
          domain: 'product',
          message: `No instruction file for ${agent.id} links ${base}`,
          evidence: [product],
          agents_affected: [agent.id],
        });
      }
      continue;
    }

    for (const product of productFiles) {
      const base = product.split(/[/\\]/).pop() ?? product;
      let linked = false;
      const unchecked: string[] = [];

      for (const instr of targets) {
        if (!pathExists(instr)) continue;
        // Skip pure JSON settings — only markdown-ish instruction surfaces
        if (instr.endsWith('.json')) continue;
        unchecked.push(instr);
        let content = '';
        try {
          content = readFileSync(instr, 'utf8');
        } catch {
          continue;
        }
        if (contentLinksProduct(content, product)) {
          linked = true;
          break;
        }
      }

      if (!linked) {
        findings.push({
          id: 'product.missing_link',
          severity: 'warn',
          domain: 'product',
          message: `Instruction file(s) for ${agent.id} missing link to ${base}`,
          evidence: [...unchecked, product],
          agents_affected: [agent.id],
        });
      }
    }
  }

  return findings;
}
