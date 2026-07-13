/**
 * Instructions domain (design §7.3).
 * Expected user/project instruction files exist.
 */

import { join } from "node:path";
import type { AgentAdapter } from "../adapters/types.js";
import type { Finding } from "../engine/types.js";
import { agentsInScope, type DomainCheckContext } from "./context.js";
import { pathExists } from "./paths.js";

/**
 * Optional extension: adapters may declare expected instruction paths
 * (including missing ones). Domain falls back to well-known basenames.
 */
type AdapterWithExpected = AgentAdapter & {
  expectedInstructionFiles?: (projectRoot?: string) => string[];
};

/** Default expected project-level instruction basenames per adapter id. */
const DEFAULT_PROJECT_INSTRUCTIONS: Record<string, string[]> = {
  "claude-code": ["CLAUDE.md"],
  codex: ["AGENTS.md"],
  grok: ["AGENTS.md", "GROK.md"],
};

function expectedFiles(
  adapter: AgentAdapter | undefined,
  agentId: string,
  projectRoot?: string,
): string[] {
  const withExpected = adapter as AdapterWithExpected | undefined;
  if (withExpected?.expectedInstructionFiles) {
    return withExpected.expectedInstructionFiles(projectRoot);
  }

  // Without projectRoot and without adapter helper, nothing project-level to require
  if (!projectRoot) {
    return [];
  }

  const basenames =
    DEFAULT_PROJECT_INSTRUCTIONS[agentId] ??
    DEFAULT_PROJECT_INSTRUCTIONS[adapter?.id ?? ""] ??
    [];

  // At least one of the basenames is enough for agents with alternatives (grok)
  return basenames.map((b) => join(projectRoot, b));
}

/**
 * Check that expected instruction files exist for non-ignored installed agents.
 */
export async function checkInstructions(
  ctx: DomainCheckContext,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const inScope = agentsInScope(ctx.agents).filter((a) => a.installed);

  for (const agent of inScope) {
    if (agent.depth === "presence-only") {
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
        id: "instructions.missing_file",
        severity: "warn",
        domain: "instructions",
        message: `Expected instruction file missing for ${agent.id}: ${path}`,
        evidence: [path],
        agents_affected: [agent.id],
      });
    }
  }

  return findings;
}
