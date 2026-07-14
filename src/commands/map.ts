/**
 * CLI command: agent-doctor map
 * Refreshes discovery; supports add/replace for Obsidian vault paths.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  runMap,
  resolveVaultPath,
  type MapRunOptions,
  type VaultPromptFn,
  type VaultWriteMode,
} from '../map/init.js';
import { mapPath } from '../map/load.js';
import {
  formatMapSummary,
  parseVaultCli,
  parseYesFlag,
  type CommandResult,
  type LogFn,
} from './init.js';

export type MapCommandOptions = {
  /** Argv after the command name (e.g. ["--vault", "/path", "--replace"]). */
  args?: string[];
  homeDir?: string;
  promptVault?: VaultPromptFn;
  log?: LogFn;
  home?: string;
};

function emptyMapResult(code: number): CommandResult {
  return {
    code,
    map: {
      version: 1,
      skills: { global_roots: [], sync_target: null },
      vaults: [],
      agents: [],
      projects: { roots: [], entries: [] },
    },
  };
}

/**
 * Run `agent-doctor map`: refresh discovery, optional vault add/replace, print summary.
 */
export async function runMapCommand(options: MapCommandOptions = {}): Promise<CommandResult> {
  const args = options.args ?? [];
  void parseYesFlag(args);
  const vaultCli = parseVaultCli(args);
  const log = options.log ?? ((line: string) => console.log(line));
  const err = (line: string) => console.error(line);

  if (vaultCli.path === '') {
    err(
      'agent-doctor map: --vault / --add-vault / --set-vault requires a path (e.g. --vault ~/Notes)',
    );
    return emptyMapResult(1);
  }

  // --replace without a path
  if (
    vaultCli.path === undefined &&
    (args.includes('--replace') || args.includes('--set-vault'))
  ) {
    err('agent-doctor map: --replace / --set-vault requires a vault path');
    return emptyMapResult(1);
  }

  let vaultPath: string | undefined;
  let vaultMode: VaultWriteMode | undefined;

  if (vaultCli.path != null) {
    vaultPath = resolveVaultPath(vaultCli.path);
    vaultMode = vaultCli.mode;
    if (!existsSync(vaultPath)) {
      err(`agent-doctor map: vault path does not exist: ${vaultPath}`);
      return emptyMapResult(1);
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
    vaultMode,
  };
  if (options.promptVault) {
    mapOpts.promptVault = options.promptVault;
  }

  const map = await runMap(mapOpts);
  if (vaultPath) {
    log(
      vaultMode === 'replace'
        ? `Vault mode: replace → sole vault ${vaultPath}`
        : `Vault mode: add → ${vaultPath}`,
    );
  }
  const summary = formatMapSummary(map, mapPath({ home: options.home }), 'map');
  for (const line of summary.split('\n')) {
    log(line);
  }
  return { code: 0, map };
}
