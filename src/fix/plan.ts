/**
 * Fix plan builder (design §9).
 * Filters report.fix_plan, rejects copy-tree, enriches safe actions,
 * and never silently picks a hub on conflict.
 */

import type { FixAction, Finding, Report } from "../engine/types.js";
import { agentDoctorHome, mapPath } from "../map/load.js";

/** Safe v1 auto-fix kinds (design §9). */
export const SAFE_FIX_KINDS = new Set([
  "symlink_skills_hub",
  "wire_skills_hub",
  "append_instruction_link",
  "set_sync_target",
  "wire_memory_pointer",
]);

/** Kinds that content-copy skill trees — always rejected. */
export const REJECTED_COPY_KINDS = new Set([
  "copy_tree",
  "copy_skills",
  "content_copy",
  "copy_directory",
]);

const WIRE_KINDS = new Set(["symlink_skills_hub", "wire_skills_hub"]);

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
  if (kind.includes("copy") && kind.includes("tree")) return true;
  if (kind === "content_copy" || kind.startsWith("copy_")) return true;
  return false;
}

function hasHubConflict(findings: Finding[]): boolean {
  return findings.some((f) => f.id === "skills.hub_conflict");
}

function resolveHub(
  report: Report,
  options: BuildFixPlanOptions,
): string | undefined {
  if (options.syncTarget != null && options.syncTarget !== "") {
    return options.syncTarget;
  }
  if (report.sync.skills_hub != null && report.sync.skills_hub !== "") {
    return report.sync.skills_hub;
  }
  return undefined;
}

/**
 * Generate append_instruction_link actions from product.missing_link findings.
 * evidence: [instruction paths..., product path] — product is last path ending in product/roadmap.
 */
function appendActionsFromFindings(findings: Finding[]): FixAction[] {
  const out: FixAction[] = [];
  let index = 0;

  for (const finding of findings) {
    if (finding.id !== "product.missing_link") continue;
    const evidence = finding.evidence ?? [];
    if (evidence.length === 0) continue;

    const product =
      evidence.find((p) => /(?:^|[/\\])(product|roadmap)\.md$/i.test(p)) ??
      evidence[evidence.length - 1]!;
    const instructions = evidence.filter((p) => p !== product && /\.md$/i.test(p));

    // If no separate instruction path, skip (no surface to append to)
    for (const instr of instructions) {
      index += 1;
      const agent = finding.agents_affected[0] ?? "agent";
      out.push({
        id: `fix.append_link_${agent}_${index}`,
        kind: "append_instruction_link",
        description: `Append link to ${product} in ${instr}`,
        target: instr,
        value: product,
        agent_id: finding.agents_affected[0],
        finding_ids: [finding.id],
      });
    }
  }

  return out;
}

/**
 * Build the actionable fix plan from a Report (and optional user sync target).
 * Never includes content-copy actions. Never invents a hub on conflict.
 */
export function buildFixPlan(
  report: Report,
  options: BuildFixPlanOptions = {},
): FixAction[] {
  const hub = resolveHub(report, options);
  const conflict = hasHubConflict(report.findings);
  const plan: FixAction[] = [];

  // 1. From report.fix_plan — filter rejects and hub-less wires on conflict
  for (const action of report.fix_plan ?? []) {
    if (isRejectedCopyAction(action)) {
      continue;
    }
    if (!SAFE_FIX_KINDS.has(action.kind) && !WIRE_KINDS.has(action.kind)) {
      // Unknown kinds: still pass through only if not copy; apply layer may skip
      if (action.kind.toLowerCase().includes("copy")) continue;
    }

    if (WIRE_KINDS.has(action.kind)) {
      // No silent hub pick: need resolved hub or explicit syncTarget
      if (!hub) {
        continue;
      }
      plan.push({
        ...action,
        value: action.value ?? hub,
      });
      continue;
    }

    if (action.kind === "set_sync_target") {
      const value = action.value ?? options.syncTarget;
      if (!value) continue;
      plan.push({ ...action, value });
      continue;
    }

    plan.push(action);
  }

  // 2. Explicit set_sync_target when user provides --sync-target
  if (options.syncTarget) {
    const already = plan.some(
      (a) =>
        a.kind === "set_sync_target" && a.value === options.syncTarget,
    );
    if (!already) {
      const home = options.doctorHome ?? agentDoctorHome();
      plan.unshift({
        id: "fix.set_sync_target",
        kind: "set_sync_target",
        description: `Set map.skills.sync_target to ${options.syncTarget}`,
        target: mapPath({ home }),
        value: options.syncTarget,
        finding_ids: conflict ? ["skills.hub_conflict"] : undefined,
      });
    }
  }

  // 3. Append link blocks from product findings
  const existingAppend = new Set(
    plan
      .filter((a) => a.kind === "append_instruction_link")
      .map((a) => `${a.target}|${a.value}`),
  );
  for (const action of appendActionsFromFindings(report.findings)) {
    const key = `${action.target}|${action.value}`;
    if (existingAppend.has(key)) continue;
    plan.push(action);
  }

  // Dedupe by id
  const seen = new Set<string>();
  const deduped: FixAction[] = [];
  for (const action of plan) {
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    deduped.push(action);
  }

  return deduped;
}

/** Format plan for terminal output. */
export function formatFixPlan(
  plan: FixAction[],
  options: { dryRun?: boolean } = {},
): string {
  const header = options.dryRun
    ? "Fix plan (dry-run — no writes):"
    : "Fix plan:";
  if (plan.length === 0) {
    return [header, "  (no safe actions)", ""].join("\n");
  }
  const lines = [header];
  for (const [i, action] of plan.entries()) {
    lines.push(
      `  ${i + 1}. [${action.kind}] ${action.description}${action.target ? ` → ${action.target}` : ""}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
