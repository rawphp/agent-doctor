/**
 * `agent-doctor fix` path-unit (design §5, §9).
 * Plan-then-apply: dry-run prints plan; apply requires confirm (or --yes).
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createAdapterRegistry, type AgentAdapter } from '../adapters/index.js';
import { defaultOpenBrowser } from './dashboard.js';
import { EXIT_TOOL_ERROR, exitCodeForGrade } from '../engine/score.js';
import { runChecks, type RunChecksOptions } from '../engine/run-checks.js';
import type { FixAction, HomeMap, Report } from '../engine/types.js';
import { agentDoctorHome, loadMap } from '../map/load.js';
import {
  applyFixPlan,
  buildFixPlan,
  formatApplyResults,
  formatFixPlan,
  type ActionResult,
} from '../fix/index.js';
import { renderFixPlanHtml } from '../surfaces/fix-plan/template.js';
import { startFixPlanServer } from '../surfaces/fix-plan/server.js';

/** Build live adapters for plan generation (same ids as map / detect). */
function adaptersForPlan(map: HomeMap, injected?: AgentAdapter[]): AgentAdapter[] {
  if (injected && injected.length > 0) {
    return injected;
  }
  const registry = createAdapterRegistry();
  const adapters: AgentAdapter[] = [];
  for (const entry of map.agents) {
    if (entry.ignored) continue;
    const adapter = registry.getAdapter(entry.id, {
      home: entry.config_home || undefined,
    });
    if (adapter) adapters.push(adapter);
  }
  // Ensure deep defaults exist even if map is sparse
  for (const id of ['claude-code', 'codex', 'grok'] as const) {
    if (!adapters.some((a) => a.id === id)) {
      const a = registry.getAdapter(id);
      if (a) adapters.push(a);
    }
  }
  return adapters;
}

export type FixFlags = {
  dryRun: boolean;
  /** Skip interactive confirmation. */
  yes: boolean;
  /** Explicit hub when multiple roots conflict — never invented. */
  syncTarget?: string;
  /** Open plan as HTML in the browser (preview only). */
  html: boolean;
  /** When --html, do not auto-open browser (print URL only). */
  noOpen: boolean;
  /**
   * Allow replacing non-empty agent skills dirs with hub symlinks.
   * Destructive to the agent-local skills folder (merge into hub first).
   */
  force: boolean;
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
  /** Inject browser open (tests). */
  openBrowser?: (url: string) => Promise<void> | void;
  /**
   * When true (default) and --html, hold process until Ctrl+C so the page stays up.
   * Tests set false.
   */
  waitUntilClose?: boolean;
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
  const dryRun = args.includes('--dry-run');
  const yes = args.includes('--yes') || args.includes('--non-interactive');
  const html = args.includes('--html');
  const noOpen = args.includes('--no-open');
  const force = args.includes('--force');

  let syncTarget: string | undefined;
  const eq = args.find((a) => a.startsWith('--sync-target='));
  if (eq) {
    syncTarget = eq.slice('--sync-target='.length);
  } else {
    const idx = args.indexOf('--sync-target');
    if (idx >= 0 && args[idx + 1] && !args[idx + 1]!.startsWith('-')) {
      syncTarget = args[idx + 1];
    }
  }

  return { dryRun, yes, syncTarget, html, noOpen, force };
}

export function buildApplyCommand(syncTarget?: string): string {
  return syncTarget
    ? `agent-doctor fix --yes --sync-target ${syncTarget}`
    : 'agent-doctor fix --yes';
}

function writeLines(write: (line: string) => void, text: string): void {
  for (const line of text.split('\n')) {
    write(line);
  }
}

/**
 * Interactive confirm for apply. Refuses when stdin/stdout are not a TTY
 * (CI-safe — never hangs). Accepts y/yes (case-insensitive); anything else denies.
 */
export async function defaultConfirm(plan: FixAction[]): Promise<boolean> {
  if (!input.isTTY || !output.isTTY) {
    return false;
  }

  const count = plan.length;
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`Apply ${count} fix action(s)? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Run fix: build plan → dry-run | confirm → apply → re-check → print grade.
 */
export async function runFix(options: FixRunOptions = {}): Promise<FixResult> {
  const writeOut = options.stdout ?? ((line: string) => console.log(line));
  const writeErr = options.stderr ?? ((line: string) => console.error(line));

  const flags = parseFixFlags(options.args ?? []);
  const doctorHome = options.doctorHome ?? options.checks?.home;

  try {
    const home = doctorHome ?? options.checks?.home ?? agentDoctorHome();
    const report = await runChecks({
      ...options.checks,
      home: options.checks?.home ?? home,
    });

    const map =
      options.checks?.map ??
      loadMap({ home }) ??
      ({
        version: 1,
        skills: { global_roots: [], sync_target: null },
        vaults: [],
        agents: [],
        projects: { roots: [], entries: [] },
      } satisfies HomeMap);

    const adapters = adaptersForPlan(map, options.checks?.adapters);

    const plan =
      options.planOverride ??
      buildFixPlan(report, {
        syncTarget: flags.syncTarget,
        doctorHome: home,
        adapters,
        map,
      });

    // Attach plan for callers / dry-run consumers
    report.fix_plan = plan;

    // Terminal summary always (short when --html focuses on the browser).
    writeLines(
      writeOut,
      formatFixPlan(plan, {
        dryRun: flags.dryRun || flags.html,
        findings: report.findings,
        recommendations: report.recommendations,
        skillsHub: report.sync.skills_hub,
        syncTarget: flags.syncTarget,
      }),
    );

    // --html is always a read-only plan preview (never applies), with or without --dry-run.
    if (flags.html) {
      const applyCommand = buildApplyCommand(flags.syncTarget);
      const html = renderFixPlanHtml({
        plan,
        report,
        dryRun: true,
        syncTarget: flags.syncTarget,
        applyCommand,
      });
      const server = await startFixPlanServer(html);
      writeOut('');
      writeOut(`Plan preview (browser): ${server.url}`);
      writeOut('Read-only — this page does not apply fixes. Ctrl+C to stop the preview server.');

      if (!flags.noOpen) {
        const openBrowser = options.openBrowser ?? defaultOpenBrowser;
        try {
          await openBrowser(server.url);
        } catch {
          // URL already printed
        }
      }

      const wait = options.waitUntilClose !== false;
      if (wait) {
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            writeOut('\nClosing plan preview…');
            void server.close().finally(() => resolve());
          };
          process.once('SIGINT', finish);
          process.once('SIGTERM', finish);
        });
      } else {
        await server.close();
      }

      return {
        report,
        plan,
        results: [],
        applied: false,
        exitCode: exitCodeForGrade(report.overall.grade),
      };
    }

    if (flags.dryRun) {
      writeOut('Dry-run complete — no files written.');
      if (plan.length === 0) {
        writeOut(
          `Current grade: ${report.overall.score} (${report.overall.grade.toUpperCase()}) — empty plan does not mean green.`,
        );
      } else {
        writeOut(
          `Current grade: ${report.overall.score} (${report.overall.grade.toUpperCase()}). Applying the plan should address the steps above.`,
        );
      }
      return {
        report,
        plan,
        results: [],
        applied: false,
        exitCode: exitCodeForGrade(report.overall.grade),
      };
    }

    if (plan.length === 0) {
      writeOut('Nothing to apply — see reasons above (or run agent-doctor status).');
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
      writeOut('Confirmation required before apply (pass --yes to skip prompt).');
      const confirmFn = options.confirm ?? defaultConfirm;
      confirmed = await confirmFn(plan);
    }

    if (!confirmed) {
      writeOut('Apply cancelled — confirmation required (use --yes to apply).');
      return {
        report,
        plan,
        results: [],
        applied: false,
        exitCode: exitCodeForGrade(report.overall.grade),
      };
    }

    if (flags.force) {
      writeOut(
        'WARNING: --force will replace existing agent skills directories with symlinks to the hub.',
      );
    }

    const results = applyFixPlan(plan, {
      hub: flags.syncTarget ?? report.sync.skills_hub,
      doctorHome: home,
      projectRoot: report.project_root,
      dryRun: false,
      force: flags.force,
    });

    writeLines(writeOut, formatApplyResults(results));

    const anyApplied = results.some((r) => r.status === 'applied');

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
        scope: 'hybrid',
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
      plan: [],
      results: [],
      applied: false,
      exitCode: EXIT_TOOL_ERROR,
    };
  }
}
