/**
 * Fix plan builder (design §9).
 *
 * Builds FixAction[] from findings via adapter proposeWire* and
 * product/obsidian link recommendations, or from an existing Report.fix_plan.
 * Blocks wire actions when hub conflict exists and map.skills.sync_target is unset.
 * Never content-copies skill trees; never silently picks a hub on conflict.
 */

import type { AgentAdapter } from '../adapters/types.js';
import type { Finding, FixAction, HomeMap, Report } from '../engine/types.js';
import { agentDoctorHome, mapPath } from '../map/load.js';

/** Safe v1 auto-fix kinds (design §9). */
export const SAFE_FIX_KINDS = new Set([
  'symlink_skills_hub',
  'wire_skills_hub',
  'append_instruction_link',
  'append_link_block',
  'set_sync_target',
  'wire_memory_pointer',
]);

/** Kinds that content-copy skill trees — always rejected. */
export const REJECTED_COPY_KINDS = new Set([
  'copy_tree',
  'copy_skills',
  'content_copy',
  'copy_directory',
]);

const WIRE_KINDS = new Set(['symlink_skills_hub', 'wire_skills_hub']);

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

export type BuildFixPlanOptions = {
  /**
   * Explicit hub choice for hub_conflict or set_sync_target.
   * Required for wire fixes when no hub is resolved — never invented.
   */
  syncTarget?: string;
  /** Doctor home for map.yml path on set_sync_target actions. */
  doctorHome?: string;
};

export function isRejectedCopyAction(action: FixAction): boolean {
  const kind = action.kind.toLowerCase();
  if (REJECTED_COPY_KINDS.has(kind)) return true;
  if (kind.includes('copy') && kind.includes('tree')) return true;
  if (kind === 'content_copy' || kind.startsWith('copy_')) return true;
  return false;
}

function productBasename(evidence: string[]): string {
  for (const e of evidence) {
    const base = e.split(/[/\\]/).pop() ?? '';
    const lower = base.toLowerCase();
    if (lower === 'product.md' || lower === 'roadmap.md') {
      return base;
    }
  }
  const last = evidence[evidence.length - 1];
  return last?.split(/[/\\]/).pop() ?? 'product.md';
}

function productTarget(evidence: string[]): string | undefined {
  for (const e of evidence) {
    const base = e.split(/[/\\]/).pop() ?? '';
    const lower = base.toLowerCase();
    if (lower === 'product.md' || lower === 'roadmap.md') {
      return e;
    }
  }
  return evidence[evidence.length - 1];
}

function vaultPathFromEvidence(evidence: string[]): string | undefined {
  return evidence[0];
}

function mergeFindingIds(action: FixAction, findingId: string): FixAction {
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
    const ids = new Set([...(existing.finding_ids ?? []), ...(action.finding_ids ?? [])]);
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
export function blocksWireForHubConflict(findings: Finding[], map: HomeMap): boolean {
  const hubConflict = findings.some((f) => f.id === 'skills.hub_conflict');
  return hubConflict && !map.skills.sync_target;
}

function hasHubConflict(findings: Finding[]): boolean {
  return findings.some((f) => f.id === 'skills.hub_conflict');
}

/**
 * Generate append_instruction_link actions from product.missing_link findings.
 * Stable ids: fix.link_product_<agent>_<basename> (design / REQ-022).
 * When instruction paths appear in evidence, each becomes an action target.
 */
function appendActionsFromFindings(findings: Finding[]): FixAction[] {
  const out: FixAction[] = [];

  for (const finding of findings) {
    if (finding.id !== 'product.missing_link') continue;
    const evidence = finding.evidence ?? [];
    if (evidence.length === 0) continue;

    const product =
      evidence.find((p) => /(?:^|[/\\])(product|roadmap)\.md$/i.test(p)) ??
      evidence[evidence.length - 1]!;
    const basename = productBasename(evidence);
    const instructions = evidence.filter((p) => p !== product && /\.md$/i.test(p));
    const agents = finding.agents_affected.length > 0 ? finding.agents_affected : [undefined];

    for (const agentId of agents) {
      const id = agentId
        ? `fix.link_product_${agentId}_${basename}`
        : `fix.link_product_${basename}`;
      const description = agentId
        ? `Append link to ${basename} in ${agentId} instruction files`
        : `Append link to ${basename} in instruction files`;

      if (instructions.length > 0) {
        for (const instr of instructions) {
          out.push({
            id: instructions.length === 1 ? id : `${id}__${instr.split(/[/\\]/).pop()}`,
            kind: 'append_instruction_link',
            description:
              instructions.length === 1 ? description : `Append link to ${basename} in ${instr}`,
            target: instr,
            value: product,
            agent_id: agentId,
            finding_ids: ['product.missing_link'],
          });
        }
      } else {
        out.push({
          id,
          kind: 'append_instruction_link',
          description,
          target: productTarget(evidence),
          value: product,
          agent_id: agentId,
          finding_ids: ['product.missing_link'],
        });
      }
    }
  }

  return out;
}

/**
 * Findings-driven plan builder (adapter proposeWire*).
 */
function buildFixPlanFromFindings(input: BuildFixPlanInput): FixAction[] {
  const { findings, map, adapters = [], hub } = input;
  const actions: FixAction[] = [];
  const blockWire = blocksWireForHubConflict(findings, map);

  if (blockWire) {
    actions.push({
      id: 'fix.set_sync_target',
      kind: 'set_sync_target',
      description: 'Choose one skills hub and set map.skills.sync_target before wiring agents',
      finding_ids: ['skills.hub_conflict'],
    });
  }

  if (!blockWire && hub) {
    const offHub = findings.filter((f) => f.id === 'skills.agent_not_on_hub');
    const agentIds = new Set(offHub.flatMap((f) => f.agents_affected));
    for (const agentId of agentIds) {
      const adapter = adapters.find((a) => a.id === agentId);
      if (!adapter) continue;
      for (const proposal of adapter.proposeWireToSkillsHub(hub)) {
        if (isRejectedCopyAction(proposal)) continue;
        actions.push(mergeFindingIds(proposal, 'skills.agent_not_on_hub'));
      }
    }
  }

  for (const action of appendActionsFromFindings(findings)) {
    actions.push(action);
  }

  if (!blockWire) {
    const vaultFindings = findings.filter((f) => f.id === 'obsidian.missing_vault_link');
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
        if (isRejectedCopyAction(proposal)) continue;
        actions.push(mergeFindingIds(proposal, 'obsidian.missing_vault_link'));
      }
    }
  }

  return dedupeById(actions).filter((a) => !isRejectedCopyAction(a));
}

/**
 * Report-driven plan builder used by `agent-doctor fix`.
 * Filters report.fix_plan, rejects copy-tree, enriches safe actions.
 */
function buildFixPlanFromReport(report: Report, options: BuildFixPlanOptions = {}): FixAction[] {
  const hub =
    options.syncTarget != null && options.syncTarget !== ''
      ? options.syncTarget
      : report.sync.skills_hub != null && report.sync.skills_hub !== ''
        ? report.sync.skills_hub
        : undefined;
  const conflict = hasHubConflict(report.findings);
  const plan: FixAction[] = [];

  for (const action of report.fix_plan ?? []) {
    if (isRejectedCopyAction(action)) {
      continue;
    }
    if (!SAFE_FIX_KINDS.has(action.kind) && !WIRE_KINDS.has(action.kind)) {
      if (action.kind.toLowerCase().includes('copy')) continue;
    }

    if (WIRE_KINDS.has(action.kind)) {
      if (!hub) {
        continue;
      }
      plan.push({
        ...action,
        value: action.value ?? hub,
      });
      continue;
    }

    if (action.kind === 'set_sync_target') {
      const value = action.value ?? options.syncTarget;
      if (!value) continue;
      plan.push({ ...action, value });
      continue;
    }

    // Normalize legacy kind name
    if (action.kind === 'append_link_block') {
      plan.push({ ...action, kind: 'append_instruction_link' });
      continue;
    }

    plan.push(action);
  }

  if (options.syncTarget) {
    const already = plan.some(
      (a) => a.kind === 'set_sync_target' && a.value === options.syncTarget,
    );
    if (!already) {
      const home = options.doctorHome ?? agentDoctorHome();
      plan.unshift({
        id: 'fix.set_sync_target',
        kind: 'set_sync_target',
        description: `Set map.skills.sync_target to ${options.syncTarget}`,
        target: mapPath({ home }),
        value: options.syncTarget,
        finding_ids: conflict ? ['skills.hub_conflict'] : undefined,
      });
    }
  }

  const existingAppend = new Set(
    plan
      .filter((a) => a.kind === 'append_instruction_link' || a.kind === 'append_link_block')
      .map((a) => `${a.target}|${a.value}`),
  );
  for (const action of appendActionsFromFindings(report.findings)) {
    const key = `${action.target}|${action.value}`;
    if (existingAppend.has(key)) continue;
    plan.push(action);
  }

  return dedupeById(plan);
}

function isBuildFixPlanInput(value: Report | BuildFixPlanInput): value is BuildFixPlanInput {
  return (
    value != null &&
    typeof value === 'object' &&
    Array.isArray((value as BuildFixPlanInput).findings) &&
    (value as BuildFixPlanInput).map != null &&
    !('generated_at' in value)
  );
}

/**
 * Build a plan of safe FixActions.
 *
 * Overloads:
 * - `buildFixPlan({ findings, map, adapters?, hub? })` — findings/adapters path
 * - `buildFixPlan(report, options?)` — report.fix_plan path used by fix CLI
 */
export function buildFixPlan(input: BuildFixPlanInput): FixAction[];
export function buildFixPlan(report: Report, options?: BuildFixPlanOptions): FixAction[];
export function buildFixPlan(
  reportOrInput: Report | BuildFixPlanInput,
  options?: BuildFixPlanOptions,
): FixAction[] {
  if (isBuildFixPlanInput(reportOrInput)) {
    return buildFixPlanFromFindings(reportOrInput);
  }
  return buildFixPlanFromReport(reportOrInput, options ?? {});
}

/** Format plan for terminal output. */
export function formatFixPlan(plan: FixAction[], options: { dryRun?: boolean } = {}): string {
  const header = options.dryRun ? 'Fix plan (dry-run — no writes):' : 'Fix plan:';
  if (plan.length === 0) {
    return [header, '  (no safe actions)', ''].join('\n');
  }
  const lines = [header];
  for (const [i, action] of plan.entries()) {
    lines.push(
      `  ${i + 1}. [${action.kind}] ${action.description}${action.target ? ` → ${action.target}` : ''}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
