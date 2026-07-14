/**
 * Path-unit orchestration for `agent-doctor init` and `agent-doctor map`.
 * init: full discovery + optional vault prompt (wizard).
 * map: refresh discovery only — no vault prompt / wizard chrome.
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { HOME_MAP_VERSION, type HomeMap, type MapAgent, type VaultEntry } from '../engine/types.js';
import { detectFirstClassAgents } from '../adapters/presence.js';
import { discover } from './discover.js';
import { agentDoctorHome, loadMap, type MapIoOptions } from './load.js';
import { saveMap } from './save.js';

export type VaultPromptFn = (message: string) => Promise<string | null>;

export type InitRunOptions = MapIoOptions & {
  /** User home for filesystem discovery (default: os.homedir()). */
  homeDir?: string;
  /**
   * When true, skip interactive vault prompt (used by --yes /
   * --non-interactive and automated tests). Empty vaults are recorded
   * with an explicit vaults_skipped marker.
   */
  nonInteractive?: boolean;
  /** Injectable vault prompt (tests). Return path or null to skip. */
  promptVault?: VaultPromptFn;
};

/** How CLI applies an explicit vault path. */
export type VaultWriteMode = 'add' | 'replace';

export type MapRunOptions = MapIoOptions & {
  homeDir?: string;
  /** Present for API symmetry with init; map never prompts for vaults. */
  promptVault?: VaultPromptFn;
  /**
   * Explicit vault path from CLI (`map --vault <path>`).
   * Mode controls add vs replace (default: add).
   */
  vaultPath?: string;
  /** `add` keeps existing vaults; `replace` makes this the only vault. Default: add. */
  vaultMode?: VaultWriteMode;
};

type VaultResolution = {
  vaults: VaultEntry[];
  /** True when the user (or non-interactive mode) chose no vault. */
  skipped: boolean;
};

/**
 * First-run / re-init: discover agents, skills, projects, vaults;
 * prompt once for a vault when none found (unless non-interactive);
 * write versioned map.yml.
 */
export async function runInit(options: InitRunOptions = {}): Promise<HomeMap> {
  const home = options.home ?? agentDoctorHome();
  const previous = loadMap({ home });
  const discovered = discover({ homeDir: options.homeDir });
  const agents = detectAndMergeAgents(options.homeDir, previous);

  let vaults: VaultEntry[];
  let vaultsSkipped: boolean | undefined;

  if (discovered.vaults.length > 0) {
    vaults = [...discovered.vaults];
    vaultsSkipped = false;
  } else {
    const resolution = await resolveVaultPrompt(options);
    vaults = resolution.vaults;
    vaultsSkipped = resolution.skipped;
  }

  const map = buildMap({
    skills_roots: discovered.skills_roots,
    project_roots: discovered.project_roots,
    vaults,
    vaults_skipped: vaultsSkipped,
    agents,
    previous,
  });

  saveMap(map, { home });
  return map;
}

/**
 * Refresh map discovery without wizard chrome.
 * Does not prompt for vaults; preserves prior manual vault entries,
 * sync_target, and agent ignored/primary flags.
 *
 * When `vaultPath` is set:
 * - mode `add` (default): append as manual if not already listed (keeps others)
 * - mode `replace`: sole vault entry (manual) — drops other vaults
 */
export async function runMap(options: MapRunOptions = {}): Promise<HomeMap> {
  const home = options.home ?? agentDoctorHome();
  const previous = loadMap({ home });
  const discovered = discover({ homeDir: options.homeDir });
  const agents = detectAndMergeAgents(options.homeDir, previous);

  let vaults: VaultEntry[];
  let vaults_skipped: boolean | undefined;
  const mode: VaultWriteMode = options.vaultMode ?? 'add';

  if (options.vaultPath != null && options.vaultPath.trim() !== '') {
    const resolved = resolveVaultPath(options.vaultPath);
    const base = mergeVaults(discovered.vaults, previous?.vaults ?? []);
    vaults = applyVaultWrite(base, resolved, mode);
    vaults_skipped = false;
  } else {
    vaults = mergeVaults(discovered.vaults, previous?.vaults ?? []);
    // Clear skip marker once any vault is present; otherwise keep prior choice.
    vaults_skipped = vaults.length > 0 ? false : (previous?.vaults_skipped ?? false);
  }

  const map = buildMap({
    skills_roots: discovered.skills_roots,
    project_roots: discovered.project_roots,
    vaults,
    vaults_skipped,
    agents,
    previous,
  });

  saveMap(map, { home });
  return map;
}

/**
 * Apply add vs replace for an explicit vault path.
 * Paths compared by exact string after resolveVaultPath.
 */
export function applyVaultWrite(
  existing: VaultEntry[],
  path: string,
  mode: VaultWriteMode,
): VaultEntry[] {
  const entry: VaultEntry = { path, source: 'manual' };
  if (mode === 'replace') {
    return [entry];
  }
  // add: keep others; if path already present, upgrade/mark as manual and keep once
  const withoutDup = existing.filter((v) => v.path !== path);
  return [...withoutDup, entry];
}

/** Expand ~ and resolve to absolute path for vault entries. */
export function resolveVaultPath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('~/') || trimmed === '~') {
    const home = homedir();
    return trimmed === '~' ? home : join(home, trimmed.slice(2));
  }
  // Absolute or relative to cwd
  return resolve(trimmed);
}

function detectAndMergeAgents(homeDir: string | undefined, previous: HomeMap | null): MapAgent[] {
  const live = detectFirstClassAgents({ homeDir });
  if (!previous) return live;

  const priorById = new Map(previous.agents.map((a) => [a.id, a]));
  return live.map((agent) => {
    const prior = priorById.get(agent.id);
    if (!prior) return agent;
    return {
      ...agent,
      primary: prior.primary,
      ignored: prior.ignored,
    };
  });
}

/**
 * Prefer live discovered vaults; keep manual vaults that are not already
 * represented by a discovered path.
 */
function mergeVaults(discovered: VaultEntry[], previous: VaultEntry[]): VaultEntry[] {
  const seen = new Set(discovered.map((v) => v.path));
  const merged: VaultEntry[] = [...discovered];
  for (const vault of previous) {
    if (vault.source !== 'manual') continue;
    if (seen.has(vault.path)) continue;
    seen.add(vault.path);
    merged.push(vault);
  }
  return merged;
}

function buildMap(input: {
  skills_roots: string[];
  project_roots: string[];
  vaults: VaultEntry[];
  vaults_skipped?: boolean;
  agents: MapAgent[];
  previous: HomeMap | null;
}): HomeMap {
  // Preserve prior sync_target if still among roots or previously set;
  // never silently invent a hero hub on multi-root conflict.
  const sync_target = resolveSyncTarget(
    input.skills_roots,
    input.previous?.skills.sync_target ?? null,
  );

  const map: HomeMap = {
    version: HOME_MAP_VERSION,
    skills: {
      global_roots: input.skills_roots,
      sync_target,
    },
    vaults: input.vaults,
    agents: input.agents,
    projects: {
      roots: input.project_roots,
      // entries cache is rebuilt by full scan later; keep prior until then
      entries: input.previous?.projects.entries ?? [],
    },
  };

  if (input.vaults_skipped !== undefined) {
    map.vaults_skipped = input.vaults_skipped;
  }

  return map;
}

function resolveSyncTarget(roots: string[], previous: string | null): string | null {
  if (previous && roots.includes(previous)) return previous;
  if (roots.length === 1) return roots[0] ?? null;
  // Multiple or zero roots: leave unresolved (design §6)
  return previous && roots.length === 0 ? previous : null;
}

async function resolveVaultPrompt(options: InitRunOptions): Promise<VaultResolution> {
  if (options.nonInteractive) {
    // Explicit skip in non-interactive / --yes / test mode
    return { vaults: [], skipped: true };
  }

  const prompt = options.promptVault ?? defaultVaultPrompt;
  const answer = await prompt(
    "No Obsidian vault discovered. Enter a vault path (or leave empty / type 'skip' to skip): ",
  );

  if (answer === null) {
    return { vaults: [], skipped: true };
  }
  const trimmed = answer.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'skip') {
    return { vaults: [], skipped: true };
  }

  return { vaults: [{ path: trimmed, source: 'manual' }], skipped: false };
}

async function defaultVaultPrompt(message: string): Promise<string | null> {
  if (!input.isTTY || !output.isTTY) {
    // No interactive terminal — treat as skip
    return null;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(message);
    return answer;
  } finally {
    rl.close();
  }
}
