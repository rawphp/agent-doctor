/**
 * CLI command: agent-doctor map
 * Refreshes discovery fields without wizard chrome; preserves user flags.
 */

import { runMap, type MapRunOptions, type VaultPromptFn } from '../map/init.js';
import { mapPath } from '../map/load.js';
import { formatMapSummary, parseYesFlag, type CommandResult, type LogFn } from './init.js';

export type MapCommandOptions = {
  /** Argv after the command name (e.g. ["--yes"]). */
  args?: string[];
  homeDir?: string;
  promptVault?: VaultPromptFn;
  log?: LogFn;
  home?: string;
};

/**
 * Run `agent-doctor map`: refresh discovery, preserve sync_target/ignored, print summary.
 * Accepts --yes / --non-interactive so CI never hangs (map never prompts anyway).
 */
export async function runMapCommand(options: MapCommandOptions = {}): Promise<CommandResult> {
  const args = options.args ?? [];
  // Consume yes-flag so callers can pass it; map never prompts regardless.
  void parseYesFlag(args);
  const log = options.log ?? ((line: string) => console.log(line));

  const mapOpts: MapRunOptions = {
    homeDir: options.homeDir,
    home: options.home,
  };
  if (options.promptVault) {
    mapOpts.promptVault = options.promptVault;
  }

  const map = await runMap(mapOpts);
  const summary = formatMapSummary(map, mapPath({ home: options.home }), 'map');
  for (const line of summary.split('\n')) {
    log(line);
  }
  return { code: 0, map };
}
