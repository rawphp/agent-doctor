/**
 * CLI command: agent-doctor init
 * Discovers environment, optional vault prompt, writes map, prints summary.
 */

import { runInit, type InitRunOptions, type VaultPromptFn } from '../map/init.js';
import { mapPath } from '../map/load.js';
import type { HomeMap } from '../engine/types.js';

export type LogFn = (line: string) => void;

export type InitCommandOptions = {
  /** Argv after the command name (e.g. ["--yes"]). */
  args?: string[];
  homeDir?: string;
  promptVault?: VaultPromptFn;
  /** Inject log sink (defaults to console.log). */
  log?: LogFn;
  home?: string;
};

export type CommandResult = {
  code: number;
  map: HomeMap;
};

/** True when --yes or --non-interactive is present (CI-safe, no prompts). */
export function parseYesFlag(args: string[]): boolean {
  return args.includes('--yes') || args.includes('--non-interactive');
}

/** Human-readable map summary printed after init/map. */
export function formatMapSummary(map: HomeMap, path: string, mode: 'init' | 'map'): string {
  const verb = mode === 'init' ? 'Wrote' : 'Refreshed';
  const lines = [
    `${verb} home map: ${path}`,
    `  version: ${map.version}`,
    `  agents: ${map.agents.map((a) => a.id).join(', ') || '(none)'}`,
    `  skills roots: ${map.skills.global_roots.length} candidate(s)`,
    `  vaults: ${map.vaults.length}`,
    `  project roots: ${map.projects.roots.length}`,
  ];
  if (map.skills.sync_target) {
    lines.push(`  sync_target: ${map.skills.sync_target}`);
  } else if (map.skills.global_roots.length > 1) {
    lines.push('  sync_target: (unresolved — multiple hubs)');
  }
  for (const vault of map.vaults) {
    lines.push(`  vault (${vault.source}): ${vault.path}`);
  }
  if (map.vaults_skipped && map.vaults.length === 0) {
    lines.push('  vaults_skipped: true');
  }
  return lines.join('\n');
}

/**
 * Parse `--vault <path>` or `--vault=<path>` from command args.
 * Returns undefined when the flag is absent.
 */
export function parseVaultFlag(args: string[]): string | undefined {
  const eq = args.find((a) => a.startsWith('--vault='));
  if (eq) {
    const value = eq.slice('--vault='.length).trim();
    return value === '' ? undefined : value;
  }
  const idx = args.indexOf('--vault');
  if (idx >= 0) {
    const next = args[idx + 1];
    if (next && !next.startsWith('-')) {
      return next;
    }
    // `--vault` with no value — treat as present but empty (caller may error)
    return '';
  }
  return undefined;
}

/**
 * Run `agent-doctor init`: discovery + optional vault prompt + write map + summary.
 */
export async function runInitCommand(options: InitCommandOptions = {}): Promise<CommandResult> {
  const args = options.args ?? [];
  const nonInteractive = parseYesFlag(args);
  const log = options.log ?? ((line: string) => console.log(line));

  const initOpts: InitRunOptions = {
    nonInteractive,
    homeDir: options.homeDir,
    home: options.home,
  };
  if (options.promptVault) {
    initOpts.promptVault = options.promptVault;
  }

  const map = await runInit(initOpts);
  const summary = formatMapSummary(map, mapPath({ home: options.home }), 'init');
  for (const line of summary.split('\n')) {
    log(line);
  }
  return { code: 0, map };
}
