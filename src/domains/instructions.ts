/**
 * Instructions domain (design §7.3).
 * Expected user/project instruction files exist.
 * Project Instruction Hierarchy diagnose path (REQ-026 / REQ-027 / skill LOCAL POLICY §6):
 *   AGENTS.md must exist; required vendor instruction files must point at it.
 * Diagnose only — does not create or rewrite files (plan/apply are separate REQs).
 *
 * Entry: `agent-doctor status` / `agent-doctor check instructions` (project/hybrid scope).
 * Terminal: hierarchy findings when AGENTS.md missing or required vendor files lack
 *   AGENTS.md pointers; healthy trees produce zero hierarchy findings.
 *
 * Stable ids (canonical, emitted on findings — keep hierarchy_* from REQ-026):
 * - instructions.hierarchy_missing_agents_md  (AC preferred alias: instructions.missing_agents_md)
 * - instructions.hierarchy_missing_pointer    (AC preferred alias: instructions.missing_agents_pointer)
 * Constants: INSTRUCTION_FINDING_IDS in engine/types; HIERARCHY_FINDING_IDS re-export below.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentAdapter } from '../adapters/types.js';
import {
  INSTRUCTION_FINDING_IDS,
  type AgentPresence,
  type Finding,
  type InstructionFindingId,
} from '../engine/types.js';
import { agentsInScope, type DomainCheckContext } from './context.js';
import { pathExists } from './paths.js';

/**
 * Hierarchy finding ids — domain-facing aliases of INSTRUCTION_FINDING_IDS.
 * Skill / fix-plan / recommendations cross-reference these strings; do not rename lightly.
 * - MISSING_AGENTS_MD: project root has no AGENTS.md (severity error)
 * - MISSING_POINTER: required vendor instruction file is absent or does not reference AGENTS.md
 *   (severity warn; evidence includes vendor path and AGENTS.md path when applicable)
 */
export const HIERARCHY_FINDING_IDS = {
  MISSING_AGENTS_MD: INSTRUCTION_FINDING_IDS.HIERARCHY_MISSING_AGENTS_MD,
  MISSING_POINTER: INSTRUCTION_FINDING_IDS.HIERARCHY_MISSING_POINTER,
} as const satisfies Record<string, InstructionFindingId>;

export type HierarchyFindingId = (typeof HIERARCHY_FINDING_IDS)[keyof typeof HIERARCHY_FINDING_IDS];

/**
 * Vendor project instruction basenames that must point at AGENTS.md when required.
 * Codex/native AGENTS.md readers are intentionally omitted (AGENTS.md is the hub).
 * Gemini is presence-only in v1 but still participates via primary/file presence.
 */
export const VENDOR_POINTER_BASENAMES: Readonly<Record<string, string>> = {
  'claude-code': 'CLAUDE.md',
  gemini: 'GEMINI.md',
  grok: 'GROK.md',
};

/** Canonical project instruction hub basename. */
export const AGENTS_MD_BASENAME = 'AGENTS.md';

/** Default expected project-level instruction basenames per adapter id (fallback). */
const DEFAULT_PROJECT_INSTRUCTIONS: Record<string, string[]> = {
  'claude-code': ['CLAUDE.md'],
  codex: ['AGENTS.md'],
  grok: ['AGENTS.md', 'GROK.md'],
};

function expectedFiles(
  adapter: AgentAdapter | undefined,
  agentId: string,
  projectRoot?: string,
): string[] {
  // Prefer adapter hook (REQ-028 AGENTS.md-first surfaces on deep adapters).
  if (adapter?.expectedInstructionFiles) {
    return adapter.expectedInstructionFiles(projectRoot);
  }

  // Without projectRoot and without adapter helper, nothing project-level to require
  if (!projectRoot) {
    return [];
  }

  const basenames =
    DEFAULT_PROJECT_INSTRUCTIONS[agentId] ?? DEFAULT_PROJECT_INSTRUCTIONS[adapter?.id ?? ''] ?? [];

  // At least one of the basenames is enough for agents with alternatives (grok)
  return basenames.map((b) => join(projectRoot, b));
}

/**
 * Pointer file is satisfied if body clearly references AGENTS.md
 * (basename or relative path; case-insensitive). Skill verify: `rg -i 'agents\.md'`.
 */
export function contentPointsToAgentsMd(content: string): boolean {
  return /agents\.md/i.test(content);
}

function listProjectBasenames(projectRoot: string): string[] {
  try {
    return readdirSync(projectRoot);
  } catch {
    return [];
  }
}

function resolveCaseInsensitive(
  projectRoot: string,
  basename: string,
  entries: readonly string[],
): string | undefined {
  const lower = basename.toLowerCase();
  const actual = entries.find((e) => e.toLowerCase() === lower);
  return actual ? join(projectRoot, actual) : undefined;
}

export type RequiredVendorPointer = {
  agentId: string;
  basename: string;
  path: string;
  exists: boolean;
};

/**
 * Which vendor pointer files are required for this project.
 * Required when the file already exists on disk OR the matching agent is
 * installed / primary (including presence-only adapters such as Gemini).
 * Gemini participates via map primary / installed presence + GEMINI.md file only
 * — no deep Gemini adapter package.
 */
export function requiredVendorPointers(
  projectRoot: string,
  agents: readonly AgentPresence[],
): RequiredVendorPointer[] {
  const entries = listProjectBasenames(projectRoot);
  const required: RequiredVendorPointer[] = [];
  const seenBasenames = new Set<string>();

  const inScope = agentsInScope(agents);

  for (const [agentId, basename] of Object.entries(VENDOR_POINTER_BASENAMES)) {
    const onDisk = resolveCaseInsensitive(projectRoot, basename, entries);
    const agent = inScope.find(
      (a) =>
        a.id === agentId ||
        a.adapter === agentId ||
        // Tolerate bare "claude" map ids for Claude Code pointer rules
        (agentId === 'claude-code' && (a.id === 'claude' || a.adapter === 'claude')),
    );
    const agentInPlay = Boolean(agent && (agent.installed || agent.primary));

    if (!onDisk && !agentInPlay) continue;
    if (seenBasenames.has(basename.toLowerCase())) continue;
    seenBasenames.add(basename.toLowerCase());

    const path = onDisk ?? join(projectRoot, basename);
    required.push({
      agentId: agent?.id ?? agentId,
      basename,
      path,
      exists: Boolean(onDisk && pathExists(onDisk)),
    });
  }

  // Orphan vendor pointer files (exist on disk, not mapped above) still need AGENTS.md pointers.
  // Known product/docs basenames are not vendor instruction entry files.
  const skip = new Set([
    AGENTS_MD_BASENAME.toLowerCase(),
    'product.md',
    'roadmap.md',
    'readme.md',
    'changelog.md',
    'license.md',
    'contributing.md',
  ]);
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.md')) continue;
    if (skip.has(entry.toLowerCase())) continue;
    if (seenBasenames.has(entry.toLowerCase())) continue;

    // Only treat known vendor-style entry names (and *AGENTS* variants except AGENTS.md)
    const isKnownVendor = Object.values(VENDOR_POINTER_BASENAMES).some(
      (b) => b.toLowerCase() === entry.toLowerCase(),
    );
    const isAgentsVariant =
      /agents/i.test(entry) && entry.toLowerCase() !== AGENTS_MD_BASENAME.toLowerCase();
    if (!isKnownVendor && !isAgentsVariant) continue;

    seenBasenames.add(entry.toLowerCase());
    const path = join(projectRoot, entry);
    if (!pathExists(path)) continue;
    required.push({
      agentId: 'project',
      basename: entry,
      path,
      exists: true,
    });
  }

  return required;
}

/**
 * Required vendor pointer basenames only (shared helper for hierarchy / adapters / map).
 * Codex is omitted (AGENTS.md-native). Gemini included when primary/installed or GEMINI.md exists.
 */
export function requiredPointerBasenames(
  projectRoot: string,
  agents: readonly AgentPresence[],
): string[] {
  return requiredVendorPointers(projectRoot, agents).map((v) => v.basename);
}

/**
 * Project Instruction Hierarchy checks (project scope only).
 * Emits stable finding ids documented for skill cross-reference.
 */
export function checkInstructionHierarchy(ctx: DomainCheckContext): Finding[] {
  const findings: Finding[] = [];
  if (!ctx.projectRoot) return findings;

  const projectRoot = ctx.projectRoot;
  const entries = listProjectBasenames(projectRoot);
  const agentsMdPath =
    resolveCaseInsensitive(projectRoot, AGENTS_MD_BASENAME, entries) ??
    join(projectRoot, AGENTS_MD_BASENAME);
  const agentsMdExists = pathExists(agentsMdPath);

  const inScopeInstalled = agentsInScope(ctx.agents).filter((a) => a.installed || a.primary);
  const agentsAffected = inScopeInstalled.map((a) => a.id);

  if (!agentsMdExists) {
    findings.push({
      id: HIERARCHY_FINDING_IDS.MISSING_AGENTS_MD,
      severity: 'error',
      domain: 'instructions',
      message:
        'Project instruction hierarchy requires AGENTS.md at the project root (canonical shared instructions).',
      evidence: [agentsMdPath],
      agents_affected: agentsAffected,
    });
  }

  for (const vendor of requiredVendorPointers(projectRoot, ctx.agents)) {
    if (!vendor.exists) {
      findings.push({
        id: HIERARCHY_FINDING_IDS.MISSING_POINTER,
        severity: 'warn',
        domain: 'instructions',
        message: `Required vendor instruction file missing for hierarchy: ${vendor.basename} must exist and point at AGENTS.md`,
        evidence: [vendor.path, agentsMdPath],
        agents_affected: vendor.agentId === 'project' ? agentsAffected : [vendor.agentId],
      });
      continue;
    }

    let content = '';
    try {
      content = readFileSync(vendor.path, 'utf8');
    } catch {
      findings.push({
        id: HIERARCHY_FINDING_IDS.MISSING_POINTER,
        severity: 'warn',
        domain: 'instructions',
        message: `Could not read ${vendor.basename} to verify AGENTS.md pointer`,
        evidence: [vendor.path],
        agents_affected: vendor.agentId === 'project' ? agentsAffected : [vendor.agentId],
      });
      continue;
    }

    if (!contentPointsToAgentsMd(content)) {
      findings.push({
        id: HIERARCHY_FINDING_IDS.MISSING_POINTER,
        severity: 'warn',
        domain: 'instructions',
        message: `${vendor.basename} must point at AGENTS.md (link or “read AGENTS.md” pointer); do not fork full policy into vendor files`,
        evidence: [vendor.path, agentsMdPath],
        agents_affected: vendor.agentId === 'project' ? agentsAffected : [vendor.agentId],
      });
    }
  }

  return findings;
}

/**
 * Check that expected instruction files exist for non-ignored installed agents,
 * and that project instruction hierarchy is satisfied when projectRoot is set.
 */
export async function checkInstructions(ctx: DomainCheckContext): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Hierarchy is project-scoped (hybrid / check instructions in a project root).
  findings.push(...checkInstructionHierarchy(ctx));

  const inScope = agentsInScope(ctx.agents).filter((a) => a.installed);

  for (const agent of inScope) {
    if (agent.depth === 'presence-only') {
      continue;
    }

    const adapter = ctx.adapters?.find((a) => a.id === agent.id);
    const expected = expectedFiles(adapter, agent.id, ctx.projectRoot);
    if (expected.length === 0) continue;

    // For multi-option sets (e.g. AGENTS.md | GROK.md), any existing file satisfies
    const anyExists = expected.some((p) => pathExists(p));
    if (anyExists) continue;

    // All missing — report each path (or the set)
    for (const path of expected) {
      findings.push({
        id: INSTRUCTION_FINDING_IDS.MISSING_FILE,
        severity: 'warn',
        domain: 'instructions',
        message: `Expected instruction file missing for ${agent.id}: ${path}`,
        evidence: [path],
        agents_affected: [agent.id],
      });
    }
  }

  return findings;
}
