/**
 * `agent-doctor check [domain]` path-unit (design §5).
 * Optional single-domain run: filter report to one domain module.
 */

import { EXIT_TOOL_ERROR, exitCodeForGrade, computeOverall } from '../engine/score.js';
import { runChecks, type RunChecksOptions } from '../engine/run-checks.js';
import type { DomainResult, Finding, Report } from '../engine/types.js';
import { formatTerminalReport } from '../surfaces/terminal.js';

/** Short domain keys accepted by `check [domain]`. */
export const CHECK_DOMAIN_KEYS = [
  'presence',
  'skills',
  'instructions',
  'product',
  'obsidian',
  'consistency',
] as const;

export type CheckDomainKey = (typeof CHECK_DOMAIN_KEYS)[number];

/** DomainResult.domain display names keyed by short CLI name. */
const DOMAIN_RESULT_NAMES: Record<CheckDomainKey, string> = {
  presence: 'agent_presence',
  skills: 'shared_skills_path',
  instructions: 'instruction_files',
  product: 'product_context',
  obsidian: 'obsidian',
  consistency: 'cross_agent_consistency',
};

/** Finding.domain values that belong to a CLI domain key. */
const FINDING_DOMAINS: Record<CheckDomainKey, readonly string[]> = {
  presence: ['presence'],
  skills: ['skills'],
  instructions: ['instructions'],
  product: ['product'],
  obsidian: ['obsidian'],
  consistency: ['consistency'],
};

export type CheckFlags = {
  domain?: string;
  json: boolean;
};

export type CheckRunOptions = {
  /** CLI args after `check` (e.g. skills --json). */
  args?: string[];
  /** Override check engine options (tests). */
  checks?: RunChecksOptions;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /**
   * When true (default), assign `process.exitCode`.
   * Set false in unit tests that must not leak exit codes.
   */
  applyProcessExitCode?: boolean;
};

export type CheckResult = {
  report: Report;
  exitCode: number;
};

/**
 * Parse check subcommand args: optional domain + --json.
 */
export function parseCheckArgs(args: string[]): CheckFlags {
  const json = args.includes('--json');
  const domain = args.find((a) => !a.startsWith('-'));
  return { domain, json };
}

export function isCheckDomainKey(value: string): value is CheckDomainKey {
  return (CHECK_DOMAIN_KEYS as readonly string[]).includes(value);
}

/**
 * Filter a full Report down to a single domain's findings + domain row.
 * Overall score is recomputed from the filtered domain only.
 */
export function filterReportToDomain(report: Report, domainKey: CheckDomainKey): Report {
  const findingDomains = FINDING_DOMAINS[domainKey];
  const resultName = DOMAIN_RESULT_NAMES[domainKey];

  const findings: Finding[] = report.findings.filter((f) => findingDomains.includes(f.domain));

  const domains: DomainResult[] = report.domains.filter(
    (d) => d.domain === resultName || d.domain === domainKey,
  );

  // Prefer the matching DomainResult; if missing, synthesize from findings.
  let domainResults = domains;
  if (domainResults.length === 0) {
    domainResults = [
      {
        domain: resultName,
        score: findings.length === 0 ? 100 : 0,
        grade: findings.length === 0 ? 'green' : 'red',
        summary: findings.length === 0 ? `${resultName}: healthy` : `${findings.length} finding(s)`,
      },
    ];
  }

  const overall = computeOverall({
    domainScores: domainResults.map((d) => d.score),
    findings,
  });

  return {
    ...report,
    overall,
    domains: domainResults,
    findings,
    // Domain-scoped view: drop fleet-wide recommendations not tied to findings.
    recommendations: report.recommendations.filter((r) =>
      r.finding_ids.some((id) => findings.some((f) => f.id === id)),
    ),
  };
}

function emptyReport(scope: Report['scope'] = 'hybrid'): Report {
  return {
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
  };
}

/**
 * Run checks, optionally filtered to one domain. Exit by grade mapping.
 * Invalid domain → non-zero with helpful error listing known keys.
 */
export async function runCheck(options: CheckRunOptions = {}): Promise<CheckResult> {
  const writeOut = options.stdout ?? ((line: string) => console.log(line));
  const writeErr = options.stderr ?? ((line: string) => console.error(line));
  const applyExit = options.applyProcessExitCode !== false;

  const flags = parseCheckArgs(options.args ?? []);

  if (flags.domain !== undefined && !isCheckDomainKey(flags.domain)) {
    writeErr(
      `agent-doctor check: unknown domain '${flags.domain}'. ` +
        `Valid domains: ${CHECK_DOMAIN_KEYS.join(', ')}.`,
    );
    if (applyExit) {
      process.exitCode = 1;
    }
    return { report: emptyReport(), exitCode: 1 };
  }

  try {
    const full = await runChecks({
      ...options.checks,
      scope: options.checks?.scope ?? 'hybrid',
    });

    const report = flags.domain !== undefined ? filterReportToDomain(full, flags.domain) : full;

    if (flags.json) {
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
    writeErr(`agent-doctor check: ${message}`);
    if (applyExit) {
      process.exitCode = EXIT_TOOL_ERROR;
    }
    return { report: emptyReport(), exitCode: EXIT_TOOL_ERROR };
  }
}
