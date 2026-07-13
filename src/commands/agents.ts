/**
 * `agent-doctor agents` path-unit (design §5).
 * List registered adapters with support depth full | presence.
 */

import {
  createAdapterRegistry,
  listAdapterSupport,
  type AdapterRegistry,
  type AdapterSupportEntry,
} from "../adapters/registry.js";

export type AgentsRunOptions = {
  /** CLI args after `agents` (reserved for future flags). */
  args?: string[];
  /** Injected registry (tests). Defaults to process-wide registry. */
  registry?: AdapterRegistry;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /**
   * When true (default), assign `process.exitCode`.
   * Set false in unit tests that must not leak exit codes.
   */
  applyProcessExitCode?: boolean;
};

export type AgentsResult = {
  entries: AdapterSupportEntry[];
  exitCode: number;
};

/**
 * Format adapter support listing for the terminal.
 */
export function formatAgentsListing(
  entries: readonly AdapterSupportEntry[],
): string {
  const lines: string[] = [];
  lines.push("Agent Doctor — agents");
  lines.push("");

  if (entries.length === 0) {
    lines.push("  (no adapters registered)");
    return lines.join("\n");
  }

  const idWidth = Math.max(...entries.map((e) => e.id.length), 8);
  const levelWidth = Math.max(
    ...entries.map((e) => e.supportLevel.length),
    8,
  );

  lines.push("Detected agents / adapter support:");
  for (const entry of entries) {
    const id = entry.id.padEnd(idWidth);
    const level = entry.supportLevel.padEnd(levelWidth);
    if (entry.supportLevel === "presence" && entry.limitation) {
      lines.push(`  ${id}  ${level}  ${entry.limitation}`);
    } else {
      lines.push(`  ${id}  ${level}`);
    }
  }

  return lines.join("\n");
}

/**
 * List registered agents and their adapter depth (full | presence).
 * Exit 0 on success.
 */
export async function runAgents(
  options: AgentsRunOptions = {},
): Promise<AgentsResult> {
  const writeOut = options.stdout ?? ((line: string) => console.log(line));
  const applyExit = options.applyProcessExitCode !== false;

  const registry = options.registry ?? createAdapterRegistry();
  const entries = listAdapterSupport(registry);

  writeOut(formatAgentsListing(entries));

  const exitCode = 0;
  if (applyExit) {
    process.exitCode = exitCode;
  }
  return { entries, exitCode };
}
