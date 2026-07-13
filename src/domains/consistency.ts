/**
 * Consistency domain (design §7.6).
 * Same hubs and pointers across non-ignored first-class agents.
 */

import type { Finding } from "../engine/types.js";
import {
  firstClassInScope,
  type DomainCheckContext,
} from "./context.js";
import { resolvePath } from "./paths.js";

/**
 * Flag divergent skills roots / memory pointers across the first-class fleet.
 */
export async function checkConsistency(
  ctx: DomainCheckContext,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const fleet = firstClassInScope(ctx.agents);
  if (fleet.length < 2) return findings;

  const agentRoots = { ...(ctx.agentRoots ?? {}) };
  if (ctx.adapters) {
    for (const adapter of ctx.adapters) {
      if (agentRoots[adapter.id] === undefined) {
        agentRoots[adapter.id] = await adapter.skillsRoots({
          projectRoot: ctx.projectRoot,
        });
      }
    }
  }

  // --- skills roots: each agent's primary resolved root ---
  const rootByAgent = new Map<string, string[]>();
  for (const agent of fleet) {
    const roots = (agentRoots[agent.id] ?? []).map(resolvePath);
    // Prefer hub if present among roots
    const unique = [...new Set(roots)];
    rootByAgent.set(agent.id, unique);
  }

  // Collect the set of "signature" roots per agent (first global root or all)
  const signatures = new Map<string, string>();
  for (const [agentId, roots] of rootByAgent) {
    if (roots.length === 0) {
      signatures.set(agentId, "");
      continue;
    }
    // If hub is known and agent is on it, signature = hub
    if (ctx.hub) {
      const hubR = resolvePath(ctx.hub);
      if (roots.includes(hubR)) {
        signatures.set(agentId, hubR);
        continue;
      }
    }
    // Otherwise use sorted join of roots as signature
    signatures.set(agentId, [...roots].sort().join("|"));
  }

  const signatureValues = [...new Set(signatures.values())];
  // Empty signature for agents with no roots: if some have roots and others don't, divergent
  if (signatureValues.length >= 2) {
    const agentsInvolved = [...signatures.keys()].sort();
    const evidence = [...signatures.entries()].map(
      ([id, sig]) => `${id}:${sig || "(none)"}`,
    );
    findings.push({
      id: "consistency.divergent_skills_roots",
      severity: "error",
      domain: "consistency",
      message:
        "First-class agents have divergent skills roots/hubs; fleet is not aligned.",
      evidence,
      agents_affected: agentsInvolved,
      sync_target: ctx.hub,
    });
  }

  // --- memory pointers ---
  if (ctx.adapters && ctx.adapters.length > 0) {
    const memByAgent = new Map<string, string>();
    for (const agent of fleet) {
      const adapter = ctx.adapters.find((a) => a.id === agent.id);
      if (!adapter) continue;
      const pointers = await adapter.memoryPointers(ctx.projectRoot);
      const sig = [...new Set(pointers.map(resolvePath))].sort().join("|");
      memByAgent.set(agent.id, sig);
    }

    // Only compare agents that reported at least one pointer
    const withPointers = [...memByAgent.entries()].filter(([, s]) => s !== "");
    if (withPointers.length >= 2) {
      const memSigs = new Set(withPointers.map(([, s]) => s));
      if (memSigs.size >= 2) {
        findings.push({
          id: "consistency.divergent_memory_pointers",
          severity: "warn",
          domain: "consistency",
          message:
            "First-class agents have divergent memory/vault pointers.",
          evidence: withPointers.map(([id, s]) => `${id}:${s}`),
          agents_affected: withPointers.map(([id]) => id).sort(),
        });
      }
    }
  }

  return findings;
}
