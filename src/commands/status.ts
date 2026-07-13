/**
 * `agent-doctor status` path-unit (design §4–§5, §10).
 * Default hybrid scope → run checks → terminal or JSON → exit by grade.
 */

import {
  EXIT_TOOL_ERROR,
  exitCodeForGrade,
} from "../engine/score.js";
import { runChecks, type RunChecksOptions } from "../engine/run-checks.js";
import type { Report, ReportScope } from "../engine/types.js";
import { formatTerminalReport } from "../surfaces/terminal.js";

export type StatusFlags = {
  /** Machine-readable Report JSON on stdout. */
  json: boolean;
  /** When true, scope is machine (--all); otherwise hybrid. */
  all: boolean;
};

export type StatusRunOptions = {
  /** CLI args after `status` (e.g. --json --all). */
  args?: string[];
  /** Override check engine options (tests). */
  checks?: RunChecksOptions;
  /** Capture writers (tests). Defaults to console. */
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
};

/**
 * Parse status subcommand flags. Unknown flags are ignored for forward compat.
 */
export function parseStatusFlags(args: string[]): StatusFlags {
  return {
    json: args.includes("--json"),
    all: args.includes("--all"),
  };
}

export function scopeFromFlags(flags: StatusFlags): ReportScope {
  return flags.all ? "machine" : "hybrid";
}

export type StatusResult = {
  report: Report;
  exitCode: number;
};

/**
 * Run hybrid (or machine) status and print terminal dashboard or JSON.
 * Exit codes: 0 green, 1 yellow, 2 red, 3 tool error.
 */
export async function runStatus(
  options: StatusRunOptions = {},
): Promise<StatusResult> {
  const writeOut = options.stdout ?? ((line: string) => console.log(line));
  const writeErr =
    options.stderr ?? ((line: string) => console.error(line));

  const flags = parseStatusFlags(options.args ?? []);
  const scope = scopeFromFlags(flags);

  try {
    // Flag-derived scope is default; checks.scope can override in unit tests.
    const report = await runChecks({
      ...options.checks,
      scope: options.checks?.scope ?? scope,
    });

    if (flags.json) {
      writeOut(JSON.stringify(report, null, 2));
    } else {
      writeOut(formatTerminalReport(report));
    }

    return {
      report,
      exitCode: exitCodeForGrade(report.overall.grade),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeErr(`agent-doctor status: ${message}`);
    return {
      report: {
        generated_at: new Date().toISOString(),
        scope,
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
      exitCode: EXIT_TOOL_ERROR,
    };
  }
}
