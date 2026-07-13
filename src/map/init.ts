/**
 * Path-unit orchestration for `agent-doctor init` and `agent-doctor map`.
 * init: full discovery + optional vault prompt (wizard).
 * map: refresh discovery only — no vault prompt / wizard chrome.
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  HOME_MAP_VERSION,
  type HomeMap,
  type MapAgent,
  type VaultEntry,
} from "../engine/types.js";
import { detectFirstClassAgents } from "../adapters/presence.js";
import { discover } from "./discover.js";
import { agentDoctorHome, loadMap, type MapIoOptions } from "./load.js";
import { saveMap } from "./save.js";

export type VaultPromptFn = (message: string) => Promise<string | null>;

export type InitRunOptions = MapIoOptions & {
  /** User home for filesystem discovery (default: os.homedir()). */
  homeDir?: string;
  /**
   * When true, skip interactive vault prompt (used by --non-interactive
   * and automated tests). Empty vaults are recorded as an explicit skip.
   */
  nonInteractive?: boolean;
  /** Injectable vault prompt (tests). Return path or null to skip. */
  promptVault?: VaultPromptFn;
};

export type MapRunOptions = MapIoOptions & {
  homeDir?: string;
  /** Present for API symmetry with init; map never prompts for vaults. */
  promptVault?: VaultPromptFn;
};

/**
 * First-run / re-init: discover agents, skills, projects, vaults;
 * prompt once for a vault when none found (unless non-interactive);
 * write versioned map.yml.
 */
export async function runInit(options: InitRunOptions = {}): Promise<HomeMap> {
  const home = options.home ?? agentDoctorHome();
  const discovered = discover({ homeDir: options.homeDir });
  const agents = detectAndMergeAgents(options.homeDir, loadMap({ home }));

  let vaults = [...discovered.vaults];
  if (vaults.length === 0) {
    vaults = await resolveVaultPrompt(options);
  }

  const map = buildMap({
    skills_roots: discovered.skills_roots,
    project_roots: discovered.project_roots,
    vaults,
    agents,
    previous: loadMap({ home }),
  });

  saveMap(map, { home });
  return map;
}

/**
 * Refresh map discovery without wizard chrome.
 * Does not prompt for vaults; preserves prior manual vault entries.
 */
export async function runMap(options: MapRunOptions = {}): Promise<HomeMap> {
  const home = options.home ?? agentDoctorHome();
  const previous = loadMap({ home });
  const discovered = discover({ homeDir: options.homeDir });
  const agents = detectAndMergeAgents(options.homeDir, previous);

  const vaults = mergeVaults(discovered.vaults, previous?.vaults ?? []);

  const map = buildMap({
    skills_roots: discovered.skills_roots,
    project_roots: discovered.project_roots,
    vaults,
    agents,
    previous,
  });

  saveMap(map, { home });
  return map;
}

function detectAndMergeAgents(
  homeDir: string | undefined,
  previous: HomeMap | null,
): MapAgent[] {
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
function mergeVaults(
  discovered: VaultEntry[],
  previous: VaultEntry[],
): VaultEntry[] {
  const seen = new Set(discovered.map((v) => v.path));
  const merged: VaultEntry[] = [...discovered];
  for (const vault of previous) {
    if (vault.source !== "manual") continue;
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
  agents: MapAgent[];
  previous: HomeMap | null;
}): HomeMap {
  // Preserve prior sync_target if still among roots or previously set;
  // never silently invent a hero hub on multi-root conflict.
  const sync_target = resolveSyncTarget(
    input.skills_roots,
    input.previous?.skills.sync_target ?? null,
  );

  return {
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
}

function resolveSyncTarget(
  roots: string[],
  previous: string | null,
): string | null {
  if (previous && roots.includes(previous)) return previous;
  if (roots.length === 1) return roots[0] ?? null;
  // Multiple or zero roots: leave unresolved (design §6)
  return previous && roots.length === 0 ? previous : null;
}

async function resolveVaultPrompt(
  options: InitRunOptions,
): Promise<VaultEntry[]> {
  if (options.nonInteractive) {
    // Explicit skip in non-interactive / test mode
    return [];
  }

  const prompt =
    options.promptVault ?? defaultVaultPrompt;
  const answer = await prompt(
    "No Obsidian vault discovered. Enter a vault path (or leave empty / type 'skip' to skip): ",
  );

  if (answer === null) return [];
  const trimmed = answer.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "skip") return [];

  return [{ path: trimmed, source: "manual" }];
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
