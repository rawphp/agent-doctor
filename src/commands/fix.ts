/**
 * `agent-doctor fix` path-unit (design §5, §9).
 * Plan-then-apply: dry-run prints plan; apply requires confirm (or --yes).
 */

import {
  EXIT_TOOL_ERROR,
  exitCodeForGrade,
} from "../engine/score.js";
import { runChecks, type RunChecksOptions } from "../engine/run-checks.js";
import type { FixAction, Report } from "../engine/types.js";
import {
  applyFixPlan,
  buildFixPlan,
  formatApplyResults,
  formatFixPlan,
  type ActionResult,
} from "../fix/index.js";

export type FixFlags = {
  dryRun: boolean;
  /** Skip interactive confirmation. */
  yes: boolean;
  /** Explicit hub when multiple roots conflict — never invented. */
  syncTarget?: string;
};

export type FixRunOptions = {
  /** CLI args after `fix`. */
  args?: string[];
  /** Override check engine options (tests). */
  checks?: RunChecksOptions;
  /** Doctor home for map writes. */
  doctorHome?: string;
  /**
   * Confirmation callback. Defaults to stdin prompt.
   * Tests inject false/true; --yes bypasses this.
   */
  confirm?: (plan: FixAction[]) => Promise<boolean> | boolean;
  /** Force plan contents (tests — e.g. inject rejected copy_tree). */
  planOverride?: FixAction[];
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
};

export type FixResult = {
  report: Report;
  afterReport?: Report;
  plan: FixAction[];
  results: ActionResult[];
  applied: boolean;
  exitCode: number;
};

/**
 * Parse fix subcommand flags.
 */
export function parseFixFlags(args: string[]): FixFlags {
  const dryRun = args.includes("--dry-run");
  const yes =
    args.includes("--yes") || args.includes("--non-interactive");

  let syncTarget: string | undefined;
  const eq = args.find((a) => a.startsWith("--sync-target="));
  if (eq) {
    syncTarget = eq.slice("--sync-target=".length);
  } else {
    const idx = args.indexOf("--sync-target");
    if (idx >= 0 && args[idx + 1] && !args[idx + 1]!.startsWith("-")) {
      syncTarget = args[idx + 1];
    }
  }

  return { dryRun, yes, syncTarget };
}

function writeLines(
  write: (line: string) => void,
  text: string,
): void {
  for (const line of text.split("\n")) {
    write(line);
  }
}

/**
 * Default confirm: refuse when stdin is not a TTY (safe for CI).
 * Interactive path is optional; production callers should pass --yes or a prompt.
 */
async function defaultConfirm(_plan: FixAction[]): Promise<boolean> {
  // Non-interactive default without --yes: do not apply.
  // Real TTY prompting can be layered later; REQ requires confirm before apply.
  return false;
}

/**
 * Run fix: build plan → dry-run | confirm → apply → re-check → print grade.
 */
export async function runFix(
  options: FixRunOptions = {},
): Promise<FixResult> {
  const writeOut = options.stdout ?? ((line: string) => console.log(line));
  const writeErr =
    options.stderr ?? ((line: string) => console.error(line));

  const flags = parseFixFlags(options.args ?? []);
  const doctorHome = options.doctorHome ?? options.checks?.home;

  try {
    const report = await runChecks({
      ...options.checks,
      home: options.checks?.home ?? doctorHome,
    });

    const plan =
      options.planOverride ??
      buildFixPlan(report, {
        syncTarget: flags.syncTarget,
        doctorHome,
      });

    // Attach plan for callers / dry-run consumers
    report.fix_plan = plan;

    writeLines(writeOut, formatFixPlan(plan, { dryRun: flags.dryRun }));

    if (flags.dryRun) {
      writeOut("Dry-run complete — no files written.");
      return {
        report,
        plan,
        results: [],
        applied: false,
        exitCode: exitCodeForGrade(report.overall.grade),
      };
    }

    if (plan.length === 0) {
      writeOut("Nothing to apply.");
      return {
        report,
        plan,
        results: [],
        applied: false,
        exitCode: exitCodeForGrade(report.overall.grade),
      };
    }

    // Confirmation required unless --yes
    let confirmed = flags.yes;
    if (!confirmed) {
      const confirmFn = options.confirm ?? defaultConfirm;
      confirmed = await confirmFn(plan);
    }

    if (!confirmed) {
      writeOut("Apply cancelled — confirmation required (use --yes to apply).");
      return {
        report,
        plan,
        results: [],
        applied: false,
        exitCode: exitCodeForGrade(report.overall.grade),
      };
    }

    const results = applyFixPlan(plan, {
      hub: flags.syncTarget ?? report.sync.skills_hub,
      doctorHome,
      projectRoot: report.project_root,
      dryRun: false,
    });

    writeLines(writeOut, formatApplyResults(results));

    const anyApplied = results.some((r) => r.status === "applied");

    // Re-run checks and print new grade
    const afterReport = await runChecks({
      ...options.checks,
      home: options.checks?.home ?? doctorHome,
    });

    writeOut(
      `After fix — Overall: ${afterReport.overall.score} (${afterReport.overall.grade.toUpperCase()})`,
    );

    return {
      report,
      afterReport,
      plan,
      results,
      applied: anyApplied,
      exitCode: exitCodeForGrade(afterReport.overall.grade),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeErr(`agent-doctor fix: ${message}`);
    return {
      report: {
        generated_at: new Date().toISOString(),
        scope: "hybrid",
        sync: {
          memory_hubs: [],
          agents_in_scope: [],
          aligned: false,
        },
        overall: { score: 0, grade: "red" },
        agents: [],
        domains: [],
        findings: [],
        recommendations: [],
      },
      plan: [],
      results: [],
      applied: false,
      exitCode: EXIT_TOOL_ERROR,
    };
  }
}
