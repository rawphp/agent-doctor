/**
 * Adapter registry: maps agent ids to deep (full) or presence-only adapters.
 * Exposes supportLevel for a future `agent-doctor agents` command.
 */

import { createClaudeCodeAdapter } from "./claude-code.js";
import { createCodexAdapter } from "./codex.js";
import { createGrokAdapter } from "./grok.js";
import {
  DEFAULT_PRESENCE_AGENT_IDS,
  PRESENCE_ONLY_LIMITATION,
  createPresenceAdapter,
} from "./presence.js";
import type { AgentAdapter } from "./types.js";

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

function defaultDeepFactory(
  id: string,
  options: AdapterFactoryOptions = {},
): AgentAdapter {
  switch (id) {
    case "claude-code":
      return createClaudeCodeAdapter({ home: options.home });
    case "codex":
      return createCodexAdapter({ home: options.home });
    case "grok":
      return createGrokAdapter({ home: options.home });
    default:
      throw new Error(`Unknown deep adapter id: ${id}`);
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
