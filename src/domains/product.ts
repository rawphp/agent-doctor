/**
 * Product domain (design §7.4).
 * If product.md / roadmap.md (and variants) exist, instruction files must link them.
 *
 * Hierarchy-aware product link policy (REQ-033 / skill LOCAL POLICY):
 * - AGENTS.md is the primary product surface — must link product docs when present.
 * - Pure AGENTS.md pointer vendor files (thin stubs that only delegate) are exempt
 *   from product.missing_link.
 * - Vendor files with unique non-pointer body still require a product link.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import type { Finding } from '../engine/types.js';
import { agentsInScope, type DomainCheckContext } from './context.js';
import { contentPointsToAgentsMd } from './instructions.js';
import { pathExists, resolvePath } from './paths.js';

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

function resolveAgentsMd(projectRoot: string): string | undefined {
  let entries: string[] = [];
  try {
    entries = readdirSync(projectRoot);
  } catch {
    return undefined;
  }
  const actual = entries.find((e) => e.toLowerCase() === 'agents.md');
  if (!actual) return undefined;
  const full = join(projectRoot, actual);
  return pathExists(full) ? full : undefined;
}

function isAgentsMdPath(filePath: string): boolean {
  return basename(filePath).toLowerCase() === 'agents.md';
}

/**
 * True when filePath resolves under projectRoot (project-scoped instruction surface).
 * User-home adapter paths (~/.codex/AGENTS.md, home CLAUDE.md, config.toml) must not
 * be checked against project product.md.
 */
function isUnderProjectRoot(filePath: string, projectRoot: string): boolean {
  const root = resolvePath(projectRoot);
  const resolved = resolvePath(filePath);
  if (resolved === root) return true;
  const prefix = root.endsWith(sep) ? root : root + sep;
  return resolved.startsWith(prefix);
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
 * True when content is a thin AGENTS.md pointer/stub: references AGENTS.md and has
 * no substantial unique body beyond pointer boilerplate (skill hierarchy policy).
 * AGENTS.md itself is never classified as a pure pointer for product checks.
 */
export function isPureAgentsPointer(content: string): boolean {
  if (!contentPointsToAgentsMd(content)) return false;

  const residual = content
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      // Headings / titles are boilerplate for pointer stubs
      if (/^#{1,6}\s/.test(t)) return false;
      // Any line that is the AGENTS.md pointer itself
      if (/agents\.md/i.test(t)) return false;
      // Common pointer phrasing without the basename on the same line
      if (
        /^(read and follow|prefer agents|do not (duplicate|fork|paste)|project entry|shared (project )?instructions|for all project instructions)/i.test(
          t,
        )
      ) {
        return false;
      }
      return true;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Allow tiny residual (punctuation / one short note); unique policy is larger
  return residual.length <= 80;
}

type InstrSurface = {
  path: string;
  agentIds: string[];
};

/**
 * Collect project instruction surfaces that participate in product-link policy:
 * AGENTS.md (always when present) + adapter-reported files under projectRoot only.
 * User-home instruction files returned by adapters are excluded.
 */
async function collectInstructionSurfaces(ctx: DomainCheckContext): Promise<InstrSurface[]> {
  const byPath = new Map<string, string[]>();
  const projectRoot = ctx.projectRoot!;

  const agentsMd = resolveAgentsMd(projectRoot);
  if (agentsMd) {
    byPath.set(agentsMd, []);
  }

  const inScope = agentsInScope(ctx.agents).filter((a) => a.installed);

  for (const agent of inScope) {
    if (agent.depth === 'presence-only') continue;

    const adapter = ctx.adapters?.find((a) => a.id === agent.id);
    if (!adapter) continue;

    const instructionFiles = await adapter.instructionFiles(projectRoot);
    for (const f of instructionFiles) {
      if (f.endsWith('.json')) continue;
      if (!pathExists(f)) continue;
      // Only project-scoped surfaces — never user-home AGENTS.md / CLAUDE.md / config.toml
      if (!isUnderProjectRoot(f, projectRoot)) continue;

      const agents = byPath.get(f) ?? [];
      if (!agents.includes(agent.id)) agents.push(agent.id);
      byPath.set(f, agents);
    }
  }

  return [...byPath.entries()].map(([path, agentIds]) => ({ path, agentIds }));
}

/**
 * Flag instruction surfaces that do not link existing product/roadmap docs.
 * Pure AGENTS.md pointer files are exempt; AGENTS.md and unique vendor bodies are not.
 */
export async function checkProduct(ctx: DomainCheckContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (!ctx.projectRoot) return findings;

  const productFiles = findProductFiles(ctx.projectRoot);
  if (productFiles.length === 0) return findings;

  const surfaces = await collectInstructionSurfaces(ctx);
  const deepAgents = agentsInScope(ctx.agents)
    .filter((a) => a.installed && a.depth !== 'presence-only')
    .map((a) => a.id);

  if (surfaces.length === 0) {
    // No instruction surface — one finding per product file (per in-scope deep agent)
    const agents =
      deepAgents.length > 0
        ? deepAgents
        : agentsInScope(ctx.agents)
            .filter((a) => a.installed)
            .map((a) => a.id);
    for (const product of productFiles) {
      const base = product.split(/[/\\]/).pop() ?? product;
      if (agents.length === 0) {
        findings.push({
          id: 'product.missing_link',
          severity: 'warn',
          domain: 'product',
          message: `No instruction file links ${base}`,
          evidence: [product],
          agents_affected: [],
        });
        continue;
      }
      for (const agentId of agents) {
        // Only emit for agents that have an adapter (deep path) — match prior behaviour
        const adapter = ctx.adapters?.find((a) => a.id === agentId);
        if (!adapter) continue;
        findings.push({
          id: 'product.missing_link',
          severity: 'warn',
          domain: 'product',
          message: `No instruction file for ${agentId} links ${base}`,
          evidence: [product],
          agents_affected: [agentId],
        });
      }
    }
    return findings;
  }

  for (const surface of surfaces) {
    const instr = surface.path;
    if (!pathExists(instr)) continue;

    let content = '';
    let unreadable = false;
    try {
      content = readFileSync(instr, 'utf8');
    } catch {
      unreadable = true;
      content = '';
    }

    const isAgents = isAgentsMdPath(instr);
    // Pure pointer vendor files: exempt from product.missing_link
    if (!isAgents && !unreadable && isPureAgentsPointer(content)) {
      continue;
    }

    const agentIds =
      surface.agentIds.length > 0
        ? surface.agentIds
        : deepAgents.length > 0
          ? deepAgents
          : [];

    for (const product of productFiles) {
      const base = product.split(/[/\\]/).pop() ?? product;
      if (!unreadable && contentLinksProduct(content, product)) {
        continue;
      }

      const fileBase = basename(instr);
      findings.push({
        id: 'product.missing_link',
        severity: 'warn',
        domain: 'product',
        message: `${fileBase} missing link to ${base}`,
        evidence: [instr, product],
        agents_affected: agentIds,
      });
    }
  }

  return findings;
}
