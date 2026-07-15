/**
 * `agent-doctor status` path-unit (design §4–§5, §10).
 * Default hybrid scope → run checks → terminal or JSON → exit by grade.
 *
 * Hierarchy diagnose (REQ-029): project-scope hierarchy findings from the
 * instructions domain appear in Report.findings (and status --json) with stable
 * ids — same pipeline as every other domain, no CLI special-casing.
 */

import { EXIT_TOOL_ERROR, exitCodeForGrade } from '../engine/score.js';
import { runChecks, type RunChecksOptions } from '../engine/run-checks.js';
import type { Report, ReportScope } from '../engine/types.js';
import { formatTerminalReport } from '../surfaces/terminal.js';

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
  /**
   * When true (default), assign `process.exitCode` from the grade mapping
   * (0 green / 1 yellow / 2 red / 3 tool error). Set false in unit tests
   * that must not leak exit codes into the test runner.
   */
  applyProcessExitCode?: boolean;
};

/**
 * Parse status subcommand flags. Unknown flags are ignored for forward compat.
 */
export function parseStatusFlags(args: string[]): StatusFlags {
  return {
    json: args.includes('--json'),
    all: args.includes('--all'),
  };
}

export function scopeFromFlags(flags: StatusFlags): ReportScope {
  return flags.all ? 'machine' : 'hybrid';
}

export type StatusResult = {
  report: Report;
  exitCode: number;
};

/**
 * Run hybrid (or machine) status and print terminal dashboard or JSON.
 * Exit codes: 0 green, 1 yellow, 2 red, 3 tool error.
 * By default also sets `process.exitCode` to that value (design §5).
 *
 * `--all` → machine scope: engine walks every project under map.projects.roots
 * with no v1 project-count cap (REQ-018).
 */
export async function runStatus(options: StatusRunOptions = {}): Promise<StatusResult> {
  const writeOut = options.stdout ?? ((line: string) => console.log(line));
  const writeErr = options.stderr ?? ((line: string) => console.error(line));
  const applyExit = options.applyProcessExitCode !== false;

  const flags = parseStatusFlags(options.args ?? []);
  const scope = scopeFromFlags(flags);

  try {
    // Flag-derived scope is default; checks.scope can override in unit tests.
    // Machine (--all) enumeration of map.projects.roots lives in runChecks.
    const report = await runChecks({
      ...options.checks,
      scope: options.checks?.scope ?? scope,
    });

    if (flags.json) {
      // Raw Report JSON only — no terminal decoration (Overall:/matrix/etc.).
      writeOut(JSON.stringify(report, null, 2));
    } else {
      writeOut(formatTerminalReport(report));
    }

    const exitCode = exitCodeForGrade(report.overall.grade);
    if (applyExit) {
      process.exitCode = exitCode;
    }
    return { report, exitCode };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeErr(`agent-doctor status: ${message}`);
    if (applyExit) {
      process.exitCode = EXIT_TOOL_ERROR;
    }
    return {
      report: {
        generated_at: new Date().toISOString(),
        scope,
        sync: {
          memory_hubs: [],
          agents_in_scope: [],
          aligned: false,
        },
        overall: { score: 0, grade: 'red' },
        agents: [],
        domains: [],
        findings: [],
        recommendations: [],
      },
      exitCode: EXIT_TOOL_ERROR,
    };
  }
}
