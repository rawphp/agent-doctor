/**
 * CLI command: agent-doctor map
 * Refreshes discovery fields without wizard chrome; preserves user flags.
 * Supports `--vault <path>` to set the Obsidian vault used for memory wiring.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runMap, resolveVaultPath, type MapRunOptions, type VaultPromptFn } from '../map/init.js';
import { mapPath } from '../map/load.js';
import {
  formatMapSummary,
  parseVaultFlag,
  parseYesFlag,
  type CommandResult,
  type LogFn,
} from './init.js';

export type MapCommandOptions = {
  /** Argv after the command name (e.g. ["--yes", "--vault", "/path"]). */
  args?: string[];
  homeDir?: string;
  promptVault?: VaultPromptFn;
  log?: LogFn;
  home?: string;
};

/**
 * Run `agent-doctor map`: refresh discovery, optional --vault, print summary.
 */
export async function runMapCommand(options: MapCommandOptions = {}): Promise<CommandResult> {
  const args = options.args ?? [];
  void parseYesFlag(args);
  const vaultFlag = parseVaultFlag(args);
  const log = options.log ?? ((line: string) => console.log(line));
  const err = (line: string) => console.error(line);

  if (vaultFlag === '') {
    err('agent-doctor map: --vault requires a path (e.g. --vault ~/Obsidian/MyVault)');
    return {
      code: 1,
      map: {
        version: 1,
        skills: { global_roots: [], sync_target: null },
        vaults: [],
        agents: [],
        projects: { roots: [], entries: [] },
      },
    };
  }

  let vaultPath: string | undefined;
  if (vaultFlag != null) {
    vaultPath = resolveVaultPath(vaultFlag);
    if (!existsSync(vaultPath)) {
      err(`agent-doctor map: vault path does not exist: ${vaultPath}`);
      return {
        code: 1,
        map: {
          version: 1,
          skills: { global_roots: [], sync_target: null },
          vaults: [],
          agents: [],
          projects: { roots: [], entries: [] },
        },
      };
    }
    if (!existsSync(join(vaultPath, '.obsidian'))) {
      log(
        `warning: no .obsidian folder under ${vaultPath} — still recording as vault (source: manual)`,
      );
    }
  }

  const mapOpts: MapRunOptions = {
    homeDir: options.homeDir,
    home: options.home,
    vaultPath,
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
