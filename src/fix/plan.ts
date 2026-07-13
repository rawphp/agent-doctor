/**
 * Fix plan builder (design §9).
 *
 * Builds FixAction[] from findings via adapter proposeWire* and
 * product/obsidian link recommendations. Blocks wire actions when
 * hub conflict exists and map.skills.sync_target is unset.
 */

import type { AgentAdapter } from "../adapters/types.js";
import type { Finding, FixAction, HomeMap } from "../engine/types.js";

export type BuildFixPlanInput = {
  findings: Finding[];
  map: HomeMap;
  /** Live adapters used for proposeWireToSkillsHub / proposeWireMemory. */
  adapters?: AgentAdapter[];
  /** Resolved skills hub (report.sync.skills_hub). Required for wire proposals. */
  hub?: string;
  /** Project root — used for product path context only. */
  projectRoot?: string;
};

function productBasename(evidence: string[]): string {
  for (const e of evidence) {
    const base = e.split(/[/\\]/).pop() ?? "";
    const lower = base.toLowerCase();
    if (lower === "product.md" || lower === "roadmap.md") {
      return base;
    }
  }
  const last = evidence[evidence.length - 1];
  return last?.split(/[/\\]/).pop() ?? "product.md";
}

function productTarget(evidence: string[]): string | undefined {
  for (const e of evidence) {
    const base = e.split(/[/\\]/).pop() ?? "";
    const lower = base.toLowerCase();
    if (lower === "product.md" || lower === "roadmap.md") {
      return e;
    }
  }
  return evidence[evidence.length - 1];
}

function vaultPathFromEvidence(evidence: string[]): string | undefined {
  // First evidence entry is the vault path (see checkObsidian).
  return evidence[0];
}

function mergeFindingIds(
  action: FixAction,
  findingId: string,
): FixAction {
  const ids = new Set([...(action.finding_ids ?? []), findingId]);
  return { ...action, finding_ids: [...ids] };
}

function dedupeById(actions: FixAction[]): FixAction[] {
  const seen = new Map<string, FixAction>();
  for (const action of actions) {
    const existing = seen.get(action.id);
    if (!existing) {
      seen.set(action.id, action);
      continue;
    }
    // Merge finding_ids when the same stable id appears twice
    const ids = new Set([
      ...(existing.finding_ids ?? []),
      ...(action.finding_ids ?? []),
    ]);
    seen.set(action.id, {
      ...existing,
      finding_ids: ids.size > 0 ? [...ids] : existing.finding_ids,
    });
  }
  return [...seen.values()];
}

/**
 * True when hub conflict finding is present and map has no chosen sync_target.
 * In that state wire/symlink plan items must not be emitted (design §9 / §11).
 */
export function blocksWireForHubConflict(
  findings: Finding[],
  map: HomeMap,
): boolean {
  const hubConflict = findings.some((f) => f.id === "skills.hub_conflict");
  return hubConflict && !map.skills.sync_target;
}

/**
 * Build a plan of safe FixActions from report findings.
 *
 * - `skills.hub_conflict` without sync_target → only `fix.set_sync_target`
 *   (no wire/symlink actions).
 * - `skills.agent_not_on_hub` → adapter `proposeWireToSkillsHub(hub)`.
 * - `product.missing_link` → append_link_block recommendations.
 * - `obsidian.missing_vault_link` → adapter `proposeWireMemory(vault paths)`.
 */
export function buildFixPlan(input: BuildFixPlanInput): FixAction[] {
  const { findings, map, adapters = [], hub } = input;
  const actions: FixAction[] = [];
  const blockWire = blocksWireForHubConflict(findings, map);

  if (blockWire) {
    actions.push({
      id: "fix.set_sync_target",
      kind: "set_sync_target",
      description:
        "Choose one skills hub and set map.skills.sync_target before wiring agents",
      finding_ids: ["skills.hub_conflict"],
    });
  }

  // Skills wire: only when not blocked and a hub is known
  if (!blockWire && hub) {
    const offHub = findings.filter((f) => f.id === "skills.agent_not_on_hub");
    const agentIds = new Set(offHub.flatMap((f) => f.agents_affected));
    for (const agentId of agentIds) {
      const adapter = adapters.find((a) => a.id === agentId);
      if (!adapter) continue;
      for (const proposal of adapter.proposeWireToSkillsHub(hub)) {
        actions.push(mergeFindingIds(proposal, "skills.agent_not_on_hub"));
      }
    }
  }

  // Product link recommendations (independent of hub conflict)
  const productFindings = findings.filter((f) => f.id === "product.missing_link");
  for (const f of productFindings) {
    const basename = productBasename(f.evidence);
    const target = productTarget(f.evidence);
    for (const agentId of f.agents_affected.length > 0
      ? f.agents_affected
      : [undefined]) {
      const idSuffix = agentId
        ? `fix.link_product_${agentId}_${basename}`
        : `fix.link_product_${basename}`;
      actions.push({
        id: idSuffix,
        kind: "append_link_block",
        description: agentId
          ? `Append link to ${basename} in ${agentId} instruction files`
          : `Append link to ${basename} in instruction files`,
        target,
        agent_id: agentId,
        finding_ids: ["product.missing_link"],
      });
    }
  }

  // Obsidian / memory wire — blocked under hub conflict (wire family)
  if (!blockWire) {
    const vaultFindings = findings.filter(
      (f) => f.id === "obsidian.missing_vault_link",
    );
    // Group vault paths per agent
    const byAgent = new Map<string, string[]>();
    for (const f of vaultFindings) {
      const vault = vaultPathFromEvidence(f.evidence);
      if (!vault) continue;
      for (const agentId of f.agents_affected) {
        const list = byAgent.get(agentId) ?? [];
        if (!list.includes(vault)) list.push(vault);
        byAgent.set(agentId, list);
      }
    }
    for (const [agentId, vaults] of byAgent) {
      const adapter = adapters.find((a) => a.id === agentId);
      if (!adapter) continue;
      for (const proposal of adapter.proposeWireMemory(vaults)) {
        actions.push(
          mergeFindingIds(proposal, "obsidian.missing_vault_link"),
        );
      }
    }
  }

  return dedupeById(actions);
}
