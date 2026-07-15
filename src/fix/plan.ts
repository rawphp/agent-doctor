/**
 * Fix plan builder (design §9).
 *
 * Builds FixAction[] from findings via adapter proposeWire* and
 * product/obsidian link recommendations, or from an existing Report.fix_plan.
 * Blocks wire actions when hub conflict exists and map.skills.sync_target is unset.
 * Never content-copies skill trees; never silently picks a hub on conflict.
 */

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AgentAdapter } from '../adapters/types.js';
import { isPureAgentsPointer } from '../domains/product.js';
import type { Finding, FixAction, HomeMap, Report } from '../engine/types.js';
import { HIERARCHY_PLAN_FINDING_IDS } from '../engine/types.js';
import { agentDoctorHome, mapPath } from '../map/load.js';

/** Safe v1 auto-fix kinds (design §9). */
export const SAFE_FIX_KINDS = new Set([
  'symlink_skills_hub',
  'wire_skills_hub',
  'append_instruction_link',
  'append_link_block',
  'set_sync_target',
  'wire_memory_pointer',
  /** Minimal AGENTS.md create (hierarchy — never invent long policy). */
  'create_agents_stub',
  /** Append-only AGENTS.md pointer in vendor instruction files. */
  'append_agents_pointer',
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
  /**
   * Agents to wire when hub is chosen after a conflict (report.sync.agents_in_scope).
   * Hub conflict alone does not emit agent_not_on_hub rows — wire these peers.
   */
  agentsInScope?: string[];
  /** Doctor home for map.yml path on set_sync_target. */
  doctorHome?: string;
};

export type BuildFixPlanOptions = {
  /**
   * Explicit hub choice for hub_conflict or set_sync_target.
   * Required for wire fixes when no hub is resolved — never invented.
   */
  syncTarget?: string;
  /** Doctor home for map.yml path on set_sync_target actions. */
  doctorHome?: string;
  /** Live adapters — when set, plan rebuilds wires from findings (CLI path). */
  adapters?: AgentAdapter[];
  /** Map for conflict / sync_target planning (CLI loads from disk). */
  map?: HomeMap;
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
 * Hierarchy plan actions from hierarchy / AC-preferred finding ids (REQ-030/031).
 * - missing AGENTS.md → create_agents_stub (minimal stub only)
 * - missing pointer → append_agents_pointer (append-only; never rewrite vendor body)
 * - Requires projectRoot; without it hierarchy mapping is rejected (no hub/path invention).
 * Accepts both `instructions.hierarchy_*` emit ids and `instructions.missing_agents_*` aliases.
 */
function hierarchyActionsFromFindings(findings: Finding[], projectRoot?: string): FixAction[] {
  // Reject hierarchy plan when project scope is missing — do not invent AGENTS.md paths.
  if (projectRoot == null || projectRoot === '') {
    return [];
  }

  const out: FixAction[] = [];
  const defaultAgentsMd = join(projectRoot, 'AGENTS.md');

  for (const finding of findings) {
    if (HIERARCHY_PLAN_FINDING_IDS.MISSING_AGENTS_MD.has(finding.id)) {
      const target = finding.evidence?.[0] ?? defaultAgentsMd;
      if (!target) continue;
      out.push({
        id: 'fix.create_agents_stub',
        kind: 'create_agents_stub',
        description:
          'Create minimal AGENTS.md stub at project root (canonical shared instructions; do not invent long policy)',
        target,
        finding_ids: [finding.id],
      });
      continue;
    }

    if (HIERARCHY_PLAN_FINDING_IDS.MISSING_POINTER.has(finding.id)) {
      const evidence = finding.evidence ?? [];
      const vendorPath = evidence[0];
      if (!vendorPath) continue;
      const agentsPath =
        evidence.find((p) => basename(p).toLowerCase() === 'agents.md') ?? defaultAgentsMd;
      const base = basename(vendorPath);
      out.push({
        id: `fix.append_agents_pointer_${base}`,
        kind: 'append_agents_pointer',
        description: `Append AGENTS.md pointer in ${base} (append-only; never wholesale rewrite vendor body)`,
        target: vendorPath,
        value: agentsPath,
        agent_id: finding.agents_affected[0],
        finding_ids: [finding.id],
      });
    }
  }

  return out;
}

/**
 * Pure AGENTS.md pointer vendor files must not receive product link appends
 * (REQ-033 — product links land on AGENTS.md / non-pointer bodies only).
 */
function isExemptProductLinkTarget(instrPath: string): boolean {
  if (basename(instrPath).toLowerCase() === 'agents.md') return false;
  try {
    const content = readFileSync(instrPath, 'utf8');
    return isPureAgentsPointer(content);
  } catch {
    // Unreadable / missing path: keep as target (product domain already decided)
    return false;
  }
}

/**
 * Generate append_instruction_link actions from product.missing_link findings.
 * Stable ids: fix.link_product_<agent>_<basename> (design / REQ-022).
 * When instruction paths appear in evidence, each becomes an action target.
 * Hierarchy policy (REQ-033): skip pure AGENTS.md pointer files; prefer correct surfaces.
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
    const productBase = productBasename(evidence);
    const instructions = evidence.filter(
      (p) => p !== product && /\.md$/i.test(p) && !isExemptProductLinkTarget(p),
    );
    const agents = finding.agents_affected.length > 0 ? finding.agents_affected : [undefined];

    for (const agentId of agents) {
      const id = agentId
        ? `fix.link_product_${agentId}_${productBase}`
        : `fix.link_product_${productBase}`;
      const description = agentId
        ? `Append link to ${productBase} in ${agentId} instruction files`
        : `Append link to ${productBase} in instruction files`;

      if (instructions.length > 0) {
        for (const instr of instructions) {
          const fileBase = instr.split(/[/\\]/).pop() ?? instr;
          out.push({
            id: instructions.length === 1 ? id : `${id}__${fileBase}`,
            kind: 'append_instruction_link',
            description:
              instructions.length === 1
                ? description
                : `Append link to ${productBase} in ${fileBase}`,
            target: instr,
            value: product,
            agent_id: agentId,
            finding_ids: ['product.missing_link'],
          });
        }
      } else {
        // No instruction targets left after pointer filter — if evidence had only
        // product path (no surface), still emit a generic action for apply context.
        const onlyProduct =
          evidence.every((p) => p === product || /(?:^|[/\\])(product|roadmap)\.md$/i.test(p)) ||
          evidence.filter((p) => p !== product && /\.md$/i.test(p)).length === 0;
        if (!onlyProduct) {
          // All instruction evidence was pure pointers — skip (nothing correct to append)
          continue;
        }
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
 * Agents we should propose wiring for once a hub is known.
 * Prefer explicit off-hub findings; after hub conflict + user hub choice,
 * fall back to agents_in_scope / all adapters (conflict rows have empty agents_affected).
 */
function agentIdsToWire(
  findings: Finding[],
  adapters: AgentAdapter[],
  agentsInScope: string[] | undefined,
  hubChosen: boolean,
): Set<string> {
  const offHub = findings.filter((f) => f.id === 'skills.agent_not_on_hub');
  const ids = new Set(offHub.flatMap((f) => f.agents_affected));

  if (ids.size > 0) {
    return ids;
  }

  if (!hubChosen) {
    return ids;
  }

  // Hub conflict (or unresolved multi-root) — plan wires for the whole fleet.
  if (
    hasHubConflict(findings) ||
    findings.some((f) => f.domain === 'skills' && f.severity === 'error')
  ) {
    if (agentsInScope && agentsInScope.length > 0) {
      for (const id of agentsInScope) ids.add(id);
    } else {
      for (const a of adapters) ids.add(a.id);
    }
  }

  return ids;
}

/**
 * Findings-driven plan builder (adapter proposeWire*).
 */
function buildFixPlanFromFindings(input: BuildFixPlanInput): FixAction[] {
  const { findings, map, adapters = [], hub, agentsInScope, doctorHome, projectRoot } = input;
  const actions: FixAction[] = [];
  // User-supplied hub (planning as if sync_target already set) unblocks wire.
  const effectiveMap: HomeMap =
    hub && !map.skills.sync_target
      ? {
          ...map,
          skills: { ...map.skills, sync_target: hub },
        }
      : map;
  const blockWire = blocksWireForHubConflict(findings, effectiveMap);
  const hubChosen = Boolean(hub || effectiveMap.skills.sync_target);
  const home = doctorHome ?? agentDoctorHome();

  if (blockWire) {
    actions.push({
      id: 'fix.set_sync_target',
      kind: 'set_sync_target',
      description: 'Choose one skills hub and set map.skills.sync_target before wiring agents',
      finding_ids: ['skills.hub_conflict'],
    });
  } else if (hub && map.skills.sync_target !== hub) {
    // Map does not yet record this hub — include set_sync_target in the plan.
    actions.push({
      id: 'fix.set_sync_target',
      kind: 'set_sync_target',
      description: `Set map.skills.sync_target to ${hub}`,
      target: mapPath({ home }),
      value: hub,
      finding_ids: hasHubConflict(findings) ? ['skills.hub_conflict'] : undefined,
    });
  }

  if (!blockWire && hub) {
    const agentIds = agentIdsToWire(findings, adapters, agentsInScope, hubChosen);
    for (const agentId of agentIds) {
      const adapter = adapters.find((a) => a.id === agentId);
      if (!adapter) continue;
      for (const proposal of adapter.proposeWireToSkillsHub(hub)) {
        if (isRejectedCopyAction(proposal)) continue;
        const withHub = {
          ...proposal,
          value: proposal.value ?? hub,
        };
        actions.push(
          mergeFindingIds(
            withHub,
            hasHubConflict(findings) ? 'skills.hub_conflict' : 'skills.agent_not_on_hub',
          ),
        );
      }
    }
  }

  for (const action of appendActionsFromFindings(findings)) {
    actions.push(action);
  }

  for (const action of hierarchyActionsFromFindings(findings, projectRoot)) {
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
    // If vault findings lack agents_affected, attach to agents in scope
    if (byAgent.size === 0 && vaultFindings.length > 0 && hubChosen) {
      const vaults = vaultFindings
        .map((f) => vaultPathFromEvidence(f.evidence))
        .filter((v): v is string => Boolean(v));
      const scope =
        agentsInScope && agentsInScope.length > 0 ? agentsInScope : adapters.map((a) => a.id);
      for (const agentId of scope) {
        byAgent.set(agentId, [...vaults]);
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
 * Rebuilds from findings + adapters (not only report.fix_plan stubs).
 * When --sync-target is set, plans the full wire set as if that hub is chosen.
 */
function buildFixPlanFromReport(report: Report, options: BuildFixPlanOptions = {}): FixAction[] {
  const hub =
    options.syncTarget != null && options.syncTarget !== ''
      ? options.syncTarget
      : report.sync.skills_hub != null && report.sync.skills_hub !== ''
        ? report.sync.skills_hub
        : undefined;

  const map: HomeMap = options.map ?? {
    version: 1,
    skills: {
      global_roots: [],
      sync_target: hub ?? null,
    },
    vaults: (report.sync.memory_hubs ?? []).map((path) => ({
      path,
      source: 'discovered' as const,
    })),
    agents: (report.agents ?? []).map((a) => ({
      id: a.id,
      adapter: a.adapter,
      config_home: a.config_home ?? '',
      primary: a.primary ?? false,
      ignored: a.ignored ?? false,
    })),
    projects: { roots: [], entries: [] },
  };

  // Prefer full findings path when adapters are available (normal CLI).
  if (options.adapters && options.adapters.length > 0) {
    return buildFixPlanFromFindings({
      findings: report.findings,
      map,
      adapters: options.adapters,
      hub,
      agentsInScope: report.sync.agents_in_scope,
      projectRoot: report.project_root,
      doctorHome: options.doctorHome,
    });
  }

  // Fallback: merge report.fix_plan + set_sync_target + product links (tests / no adapters)
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

  for (const action of appendActionsFromFindings(report.findings)) {
    plan.push(action);
  }

  for (const action of hierarchyActionsFromFindings(report.findings, report.project_root)) {
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

export type FormatFixPlanOptions = {
  dryRun?: boolean;
  /** Findings from the report that produced this plan — used when the plan is empty. */
  findings?: Finding[];
  /** Top recommendations from status (optional). */
  recommendations?: { message: string; finding_id?: string }[];
  /** Resolved skills hub if any. */
  skillsHub?: string;
  /** Explicit --sync-target the user passed (if any). */
  syncTarget?: string;
};

/**
 * Human-readable reason(s) why the auto-fix plan is empty.
 * Dry-run with no actions is not the same as "healthy".
 */
export function explainEmptyFixPlan(options: FormatFixPlanOptions = {}): string[] {
  const findings = options.findings ?? [];
  const lines: string[] = [];
  const hubConflict = findings.some((f) => f.id === 'skills.hub_conflict');
  const hasErrors = findings.some((f) => f.severity === 'error');
  const hasWarns = findings.some((f) => f.severity === 'warn');

  if (findings.length === 0) {
    lines.push('  No findings from checks — nothing to plan.');
    lines.push('  If that seems wrong, run: agent-doctor status');
    return lines;
  }

  lines.push('  No automatic safe fixes are available yet.');
  lines.push('');

  if (hubConflict && !options.syncTarget && !options.skillsHub) {
    const conflict = findings.find((f) => f.id === 'skills.hub_conflict');
    lines.push('  Why: multiple skills roots are populated (hub conflict).');
    lines.push('  Auto-wire is blocked until you choose one shared hub.');
    if (conflict?.evidence?.length) {
      lines.push('  Candidate roots:');
      for (const e of conflict.evidence.slice(0, 8)) {
        lines.push(`    - ${e}`);
      }
    }
    lines.push('');
    lines.push('  Next:');
    lines.push('    1. Pick one hub path (often ~/.agents/skills).');
    lines.push('    2. Re-run: agent-doctor fix --dry-run --sync-target /path/to/hub');
    lines.push('    3. If the plan looks right: agent-doctor fix --yes --sync-target /path/to/hub');
    lines.push('');
  } else if (hasErrors || hasWarns) {
    lines.push('  Why: findings exist, but none map to a v1 safe auto-fix');
    lines.push('  (or they still need a human choice). Open issues:');
    const top = findings.filter((f) => f.severity === 'error' || f.severity === 'warn').slice(0, 6);
    for (const f of top) {
      lines.push(`    - [${f.severity}] ${f.id}: ${f.message}`);
    }
    lines.push('');
    lines.push('  Next: agent-doctor status   # full report');
    lines.push('        agent-doctor dashboard');
    lines.push('');
  }

  if (options.recommendations && options.recommendations.length > 0) {
    lines.push('  From status recommendations:');
    for (const r of options.recommendations.slice(0, 5)) {
      lines.push(`    - ${r.message}`);
    }
    lines.push('');
  }

  return lines;
}

/** Format plan for terminal output (readable multi-line steps). */
export function formatFixPlan(plan: FixAction[], options: FormatFixPlanOptions = {}): string {
  const header = options.dryRun ? 'Fix plan (dry-run — no writes)' : 'Fix plan';
  if (plan.length === 0) {
    return [`${header}:`, ...explainEmptyFixPlan(options)].join('\n');
  }
  const lines = [`${header} — ${plan.length} step(s)`, ''];
  for (const [i, action] of plan.entries()) {
    lines.push(`${i + 1}. ${action.kind}`);
    lines.push(`   ${action.description}`);
    if (action.agent_id) {
      lines.push(`   agent:  ${action.agent_id}`);
    }
    if (action.target) {
      lines.push(`   target: ${action.target}`);
    }
    if (action.value && action.value !== action.target) {
      lines.push(`   value:  ${action.value}`);
    }
    lines.push('');
  }
  if (options.dryRun) {
    const applyCmd = options.syncTarget
      ? `agent-doctor fix --yes --sync-target ${options.syncTarget}`
      : 'agent-doctor fix --yes';
    lines.push('Nothing written yet.');
    lines.push('Review the steps, then apply:');
    lines.push(`  ${applyCmd}`);
    lines.push('Then confirm health:');
    lines.push('  agent-doctor status');
    lines.push('');
    lines.push('Tip: agent-doctor fix --dry-run --sync-target <hub> --html');
    lines.push('     opens this plan in the browser (easier to read).');
  }
  lines.push('');
  return lines.join('\n');
}
