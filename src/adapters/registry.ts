/**
 * Adapter registry: maps agent ids to deep (full) or presence-only adapters.
 * Exposes supportLevel for a future `agent-doctor agents` command.
 */

import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClaudeCodeAdapter } from "./claude-code.js";
import { createGrokAdapter } from "./grok.js";
import {
  DEFAULT_PRESENCE_AGENT_IDS,
  PRESENCE_ONLY_LIMITATION,
  createPresenceAdapter,
} from "./presence.js";
import type { AgentPresence, FixAction } from "../engine/types.js";
import type { AdapterContext, AgentAdapter } from "./types.js";

/** Support level surfaced by `agents` command (design §5). */
export type AdapterSupportLevel = "full" | "presence";

export type AdapterSupportEntry = {
  id: string;
  supportLevel: AdapterSupportLevel;
  /**
   * Optional human-facing note (e.g. presence-only limitation).
   * Omitted for full adapters.
   */
  limitation?: string;
};

export type AdapterRegistryOptions = {
  /**
   * Unknown agent ids registered as presence-only.
   * Default: gemini, cursor.
   */
  presenceIds?: readonly string[];
  /**
   * Override factory for a registered id (tests / future deep modules).
   */
  factories?: Record<string, (options?: AdapterFactoryOptions) => AgentAdapter>;
};

export type AdapterFactoryOptions = {
  home?: string;
  markers?: string[];
};

export type AdapterRegistry = {
  /** Resolve an adapter instance by id, or undefined if unregistered. */
  getAdapter: (id: string, options?: AdapterFactoryOptions) => AgentAdapter | undefined;
  /** full | presence for a registered id. */
  getSupportLevel: (id: string) => AdapterSupportLevel | undefined;
  /** Listing for agents command / fleet UI. */
  listSupport: () => AdapterSupportEntry[];
  /** All registered ids. */
  ids: () => string[];
};

const DEEP_IDS = ["claude-code", "codex", "grok"] as const;

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Minimal deep adapter when a first-class module is not yet in-tree (e.g. codex).
 * Registry still declares supportLevel "full"; depth is deep.
 */
function createPlaceholderDeepAdapter(
  id: string,
  options: AdapterFactoryOptions = {},
): AgentAdapter {
  const home = options.home ?? join(homedir(), `.${id}`);

  return {
    id,

    async detect(): Promise<AgentPresence> {
      const installed = await pathExists(home);
      if (!installed) {
        return {
          id,
          adapter: id,
          installed: false,
          depth: "deep",
        };
      }
      return {
        id,
        adapter: id,
        installed: true,
        config_home: home,
        depth: "deep",
      };
    },

    async skillsRoots(ctx: AdapterContext = {}): Promise<string[]> {
      const roots: string[] = [];
      const globalSkills = join(home, "skills");
      if (await pathExists(globalSkills)) {
        roots.push(globalSkills);
      }
      if (ctx.projectRoot) {
        const projectSkills = join(ctx.projectRoot, `.${id}`, "skills");
        if (await pathExists(projectSkills)) {
          roots.push(projectSkills);
        }
      }
      return roots;
    },

    async instructionFiles(_projectRoot?: string): Promise<string[]> {
      return [];
    },

    async memoryPointers(_projectRoot?: string): Promise<string[]> {
      return [];
    },

    proposeWireToSkillsHub(hub: string): FixAction[] {
      const agentSkillsPath = join(home, "skills");
      return [
        {
          id: `fix.wire_${id}_skills`,
          kind: "symlink_skills_hub",
          description: `Symlink ${agentSkillsPath} → ${hub} (hub wiring via symlink)`,
          target: agentSkillsPath,
          agent_id: id,
        },
      ];
    },

    proposeWireMemory(paths: string[]): FixAction[] {
      return paths.map((vaultPath, index) => ({
        id: `fix.wire_${id}_memory_${index + 1}`,
        kind: "wire_memory_pointer",
        description: `Add memory/vault pointer to ${vaultPath} (link only)`,
        target: vaultPath,
        agent_id: id,
      }));
    },
  };
}

function defaultDeepFactory(
  id: string,
  options: AdapterFactoryOptions = {},
): AgentAdapter {
  switch (id) {
    case "claude-code":
      return createClaudeCodeAdapter({ home: options.home });
    case "grok":
      return createGrokAdapter({ home: options.home });
    case "codex":
      // Codex deep module may land in a sibling REQ; keep registry full + deep.
      return createPlaceholderDeepAdapter("codex", options);
    default:
      return createPlaceholderDeepAdapter(id, options);
  }
}

/**
 * Build the adapter registry used by engine detectAll / agents listing.
 */
export function createAdapterRegistry(
  options: AdapterRegistryOptions = {},
): AdapterRegistry {
  const presenceIds = options.presenceIds ?? [...DEFAULT_PRESENCE_AGENT_IDS];
  const custom = options.factories ?? {};

  const support = new Map<string, AdapterSupportLevel>();
  for (const id of DEEP_IDS) {
    support.set(id, "full");
  }
  for (const id of presenceIds) {
    support.set(id, "presence");
  }

  function getAdapter(
    id: string,
    factoryOptions: AdapterFactoryOptions = {},
  ): AgentAdapter | undefined {
    const level = support.get(id);
    if (!level) return undefined;

    if (custom[id]) {
      return custom[id]!(factoryOptions);
    }

    if (level === "presence") {
      return createPresenceAdapter({
        id,
        home: factoryOptions.home,
        markers: factoryOptions.markers,
      });
    }

    return defaultDeepFactory(id, factoryOptions);
  }

  function getSupportLevel(id: string): AdapterSupportLevel | undefined {
    return support.get(id);
  }

  function listSupport(): AdapterSupportEntry[] {
    return [...support.entries()].map(([id, supportLevel]) => {
      const entry: AdapterSupportEntry = { id, supportLevel };
      if (supportLevel === "presence") {
        entry.limitation = PRESENCE_ONLY_LIMITATION;
      }
      return entry;
    });
  }

  function ids(): string[] {
    return [...support.keys()];
  }

  return { getAdapter, getSupportLevel, listSupport, ids };
}

/** Default process-wide registry. */
const defaultRegistry = createAdapterRegistry();

/**
 * Clean export for a future `agent-doctor agents` command:
 * list each registered adapter id with support level full|presence.
 */
export function listAdapterSupport(
  registry: AdapterRegistry = defaultRegistry,
): AdapterSupportEntry[] {
  return registry.listSupport();
}

/** Resolve adapter from the default registry. */
export function getAdapter(
  id: string,
  options?: AdapterFactoryOptions,
): AgentAdapter | undefined {
  return defaultRegistry.getAdapter(id, options);
}

/** Support level from the default registry. */
export function getSupportLevel(id: string): AdapterSupportLevel | undefined {
  return defaultRegistry.getSupportLevel(id);
}

/** First-class deep adapter ids registered as full support. */
export const FULL_ADAPTER_IDS: readonly string[] = [...DEEP_IDS];

/** Default presence-only ids (re-export for callers). */
export { DEFAULT_PRESENCE_AGENT_IDS } from "./presence.js";
