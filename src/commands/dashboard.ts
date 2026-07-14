/**
 * `agent-doctor dashboard` path-unit (design §5, §10–§11).
 * Run checks (or accept last report) → local loopback HTML server → print URL.
 * Apply stays CLI-only; this surface never mutates.
 */

import { spawn } from 'node:child_process';
import { EXIT_TOOL_ERROR } from '../engine/score.js';
import { runChecks, type RunChecksOptions } from '../engine/run-checks.js';
import type { Report, ReportScope } from '../engine/types.js';
import {
  startDashboardServer,
  type DashboardServer,
  type DashboardServerOptions,
} from '../surfaces/dashboard/server.js';

/** Preferred default when --port is omitted (design: configurable port). */
export const DEFAULT_DASHBOARD_PORT = 4173;

/** How many consecutive ports to try after EADDRINUSE. */
const PORT_RETRY_LIMIT = 20;

export type DashboardFlags = {
  /** When true, do not auto-open a browser. */
  noOpen: boolean;
  /** When true, scope is machine (--all); otherwise hybrid. */
  all: boolean;
  /** Explicit port; undefined means DEFAULT_DASHBOARD_PORT. */
  port?: number;
};

export type DashboardRunOptions = {
  /** CLI args after `dashboard`. */
  args?: string[];
  /** Override check engine options (tests). */
  checks?: RunChecksOptions;
  /**
   * Inject a pre-built Report (accept last report without re-running checks).
   * When set, `runChecks` is skipped.
   */
  report?: Report;
  /** Capture writers (tests). Defaults to console. */
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /** Inject server start (tests). Defaults to startDashboardServer. */
  startServer?: (options: DashboardServerOptions) => Promise<DashboardServer>;
  /** Inject browser open (tests). Defaults to platform open helper. */
  openBrowser?: (url: string) => Promise<void> | void;
  /**
   * When true (default in CLI), hold the process until SIGINT/SIGTERM.
   * Unit tests set false so the suite can exit.
   */
  waitUntilClose?: boolean;
  /**
   * When true (default), assign `process.exitCode` from success/error.
   * Set false in unit tests that must not leak exit codes.
   */
  applyProcessExitCode?: boolean;
};

export type DashboardResult = {
  report: Report;
  exitCode: number;
  url?: string;
  port?: number;
  server?: DashboardServer;
};

/**
 * Parse dashboard subcommand flags. Unknown flags ignored for forward compat.
 */
export function parseDashboardFlags(args: string[]): DashboardFlags {
  const noOpen = args.includes('--no-open');
  const all = args.includes('--all');

  let port: number | undefined;
  const eq = args.find((a) => a.startsWith('--port='));
  if (eq) {
    const raw = eq.slice('--port='.length);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      port = Math.floor(n);
    }
  } else {
    const idx = args.indexOf('--port');
    if (idx >= 0 && args[idx + 1] && !args[idx + 1]!.startsWith('-')) {
      const n = Number(args[idx + 1]);
      if (Number.isFinite(n) && n >= 0) {
        port = Math.floor(n);
      }
    }
  }

  return { noOpen, all, port };
}

export function scopeFromFlags(flags: DashboardFlags): ReportScope {
  return flags.all ? 'machine' : 'hybrid';
}

function isAddrInUse(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'EADDRINUSE'
  );
}

/**
 * Start the dashboard server, retrying on the next port when EADDRINUSE.
 * Port 0 (ephemeral) is never retried — the OS already picks a free port.
 */
async function startWithPortRetry(
  startServer: (options: DashboardServerOptions) => Promise<DashboardServer>,
  report: Report,
  preferredPort: number,
): Promise<DashboardServer> {
  if (preferredPort === 0) {
    return startServer({ report, port: 0 });
  }

  let lastErr: unknown;
  for (let i = 0; i <= PORT_RETRY_LIMIT; i++) {
    const port = preferredPort + i;
    try {
      return await startServer({ report, port });
    } catch (err) {
      lastErr = err;
      if (!isAddrInUse(err)) {
        throw err;
      }
      // try next port
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`No free port near ${preferredPort}`);
}

/**
 * Open URL in the default browser (macOS `open`, Linux `xdg-open`, Windows `start`).
 * Failures are swallowed — the server URL is still printed.
 */
export async function defaultOpenBrowser(url: string): Promise<void> {
  const platform = process.platform;
  let cmd: string;
  let args: string[];
  if (platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }

  await new Promise<void>((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'ignore',
      detached: true,
    });
    child.once('error', () => resolve());
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function emptyErrorReport(scope: ReportScope): Report {
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
 * Run dashboard: checks (or inject report) → loopback HTML server → print URL.
 * Does not call fix apply. Exit 0 on serve; 3 on tool error.
 */
export async function runDashboard(options: DashboardRunOptions = {}): Promise<DashboardResult> {
  const writeOut = options.stdout ?? ((line: string) => console.log(line));
  const writeErr = options.stderr ?? ((line: string) => console.error(line));
  const applyExit = options.applyProcessExitCode !== false;
  const waitUntilClose = options.waitUntilClose !== false;
  const startServer = options.startServer ?? startDashboardServer;
  const openBrowser = options.openBrowser ?? defaultOpenBrowser;

  const flags = parseDashboardFlags(options.args ?? []);
  const scope = scopeFromFlags(flags);
  const preferredPort = flags.port ?? DEFAULT_DASHBOARD_PORT;

  let report: Report;
  try {
    if (options.report) {
      report = options.report;
    } else {
      report = await runChecks({
        ...options.checks,
        scope: options.checks?.scope ?? scope,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeErr(`agent-doctor dashboard: ${message}`);
    if (applyExit) {
      process.exitCode = EXIT_TOOL_ERROR;
    }
    return {
      report: emptyErrorReport(scope),
      exitCode: EXIT_TOOL_ERROR,
    };
  }

  let server: DashboardServer;
  try {
    server = await startWithPortRetry(startServer, report, preferredPort);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeErr(`agent-doctor dashboard: failed to start server: ${message}`);
    if (applyExit) {
      process.exitCode = EXIT_TOOL_ERROR;
    }
    return {
      report,
      exitCode: EXIT_TOOL_ERROR,
    };
  }

  writeOut(`Agent Doctor dashboard: ${server.url}`);
  writeOut('(read-only — apply stays in CLI: agent-doctor fix)');

  if (!flags.noOpen) {
    try {
      await openBrowser(server.url);
    } catch {
      // Browser open is best-effort; URL already printed.
    }
  }

  if (waitUntilClose) {
    await waitForShutdownSignal(server, writeOut, writeErr);
  }

  if (applyExit) {
    process.exitCode = 0;
  }

  return {
    report,
    exitCode: 0,
    url: server.url,
    port: server.port,
    server,
  };
}

/** Max time to wait for graceful HTTP close before forced process exit. */
const SHUTDOWN_FORCE_MS = 1_500;

/**
 * Block until SIGINT/SIGTERM. Close the server (destroying open connections).
 * First signal: graceful close with a hard timeout.
 * Second signal while closing: immediate process.exit (so ^C always works).
 */
export function waitForShutdownSignal(
  server: DashboardServer,
  writeOut: (line: string) => void = console.log,
  writeErr: (line: string) => void = console.error,
  forceMs: number = SHUTDOWN_FORCE_MS,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let shuttingDown = false;

    const detach = () => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    };

    const beginShutdown = (label: string) => {
      if (shuttingDown) {
        writeErr(`\nForced exit (${label} again).`);
        detach();
        process.exit(130);
      }

      shuttingDown = true;
      writeOut(`\nShutting down dashboard (${label})...`);

      const forceTimer = setTimeout(() => {
        writeErr('Server close timed out; forcing exit.');
        detach();
        process.exit(130);
      }, forceMs);
      // Do not keep the process alive solely for the force timer.
      forceTimer.unref?.();

      void server
        .close()
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          writeErr(`dashboard close: ${message}`);
        })
        .finally(() => {
          clearTimeout(forceTimer);
          detach();
          resolve();
        });
    };

    const onSigint = () => beginShutdown('SIGINT');
    const onSigterm = () => beginShutdown('SIGTERM');

    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  });
}
