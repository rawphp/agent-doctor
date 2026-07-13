/**
 * Skills domain (design §7.2).
 * Hub alignment, off-hub agents, duplicated skill trees across homes.
 * Emits symlink-capable fix metadata when private tree cannot use hub natively.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import type { AgentAdapter } from '../adapters/types.js';
import type { Finding, FixAction } from '../engine/types.js';
import { agentsInScope, type DomainCheckContext } from './context.js';
import { resolvePath } from './paths.js';

export type SkillsCheckResult = {
  findings: Finding[];
  /** Symlink-to-hub (and related) fix actions for off-hub agents. */
  fix_actions: FixAction[];
};

function isPopulated(path: string): boolean {
  try {
    if (!existsSync(path)) return false;
    const st = statSync(path);
    if (!st.isDirectory()) return false;
    return readdirSync(path).length > 0;
  } catch {
    return false;
  }
}

/**
 * True when any of the agent's roots resolves to the same path as hub
 * (covers real dirs and symlinks whose realpath is the hub).
 */
function isOnHub(roots: string[], hub: string): boolean {
  const hubResolved = resolvePath(hub);
  for (const root of roots) {
    if (resolvePath(root) === hubResolved) {
      return true;
    }
  }
  return false;
}

function adapterById(adapters: AgentAdapter[] | undefined, id: string): AgentAdapter | undefined {
  return adapters?.find((a) => a.id === id);
}

/**
 * Check skills hub alignment and duplication for non-ignored installed agents.
 */
export async function checkSkills(ctx: DomainCheckContext): Promise<SkillsCheckResult> {
  const findings: Finding[] = [];
  const fix_actions: FixAction[] = [];
  const inScope = agentsInScope(ctx.agents).filter((a) => a.installed);

  const agentRoots = { ...(ctx.agentRoots ?? {}) };

  // Fill roots from adapters when missing
  if (ctx.adapters) {
    for (const adapter of ctx.adapters) {
      if (agentRoots[adapter.id] === undefined) {
        agentRoots[adapter.id] = await adapter.skillsRoots({
          projectRoot: ctx.projectRoot,
        });
      }
    }
  }

  const hub = ctx.hub;

  // Off-hub: only when a hub is known
  if (hub) {
    for (const agent of inScope) {
      // Presence-only / no roots: cannot claim on-hub; flag if deep with private tree
      const roots = agentRoots[agent.id] ?? [];
      const populatedRoots = roots.filter(isPopulated);

      // Agent with no skills roots at all: still off-hub if deep (cannot see hub)
      const onHub = roots.length > 0 && isOnHub(roots, hub);

      if (!onHub) {
        // If only empty roots and no private content, still off-hub when deep
        // Presence-only agents: note as not on hub only when they report roots off-hub;
        // with empty roots we skip (limited checks — presence domain owns depth note).
        if (agent.depth === 'presence-only' || agent.depth === 'shallow') {
          continue;
        }

        findings.push({
          id: 'skills.agent_not_on_hub',
          severity: 'error',
          domain: 'skills',
          message: `Agent ${agent.id} is not on the skills hub (${hub}).`,
          evidence: roots.length > 0 ? roots : [],
          agents_affected: [agent.id],
          sync_target: hub,
        });

        const adapter = adapterById(ctx.adapters, agent.id);
        if (adapter) {
          const proposals = adapter.proposeWireToSkillsHub(hub).map((action) => ({
            ...action,
            finding_ids: [...(action.finding_ids ?? []), 'skills.agent_not_on_hub'],
          }));
          fix_actions.push(...proposals);
        } else {
          // No adapter — still emit symlink-capable metadata for apply layer
          const target = roots[0] ?? `${agent.config_home ?? ''}/skills`;
          fix_actions.push({
            id: `fix.wire_${agent.id}_skills`,
            kind: 'symlink_skills_hub',
            description: `Symlink ${target} → ${hub} (hub wiring via symlink; no content copy)`,
            target,
            agent_id: agent.id,
            finding_ids: ['skills.agent_not_on_hub'],
          });
        }
      }

      void populatedRoots; // used for duplication below
    }
  }

  // Duplication: distinct populated skill trees across agent homes
  const treeOwners = new Map<string, string[]>();
  for (const agent of inScope) {
    if (agent.depth === 'presence-only' || agent.depth === 'shallow') continue;
    const roots = agentRoots[agent.id] ?? [];
    for (const root of roots) {
      if (!isPopulated(root)) continue;
      const key = resolvePath(root);
      const owners = treeOwners.get(key) ?? [];
      if (!owners.includes(agent.id)) owners.push(agent.id);
      treeOwners.set(key, owners);
    }
  }

  // Distinct physical trees used by different agents (not all sharing one path)
  const distinctTrees = [...treeOwners.entries()];
  if (distinctTrees.length >= 2) {
    const agentsInvolved = [...new Set(distinctTrees.flatMap(([, owners]) => owners))].sort();
    if (agentsInvolved.length >= 2) {
      findings.push({
        id: 'skills.duplicated_trees',
        severity: 'warn',
        domain: 'skills',
        message:
          'Duplicated skill trees across agent homes; wire agents to one hub (symlink, no content copy).',
        evidence: distinctTrees.map(([path]) => path),
        agents_affected: agentsInvolved,
        sync_target: hub,
      });
    }
  }

  return { findings, fix_actions };
}
