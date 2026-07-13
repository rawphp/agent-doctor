/**
 * Presence-only adapter for unknown / shallow agents (design §8 others).
 * Lists in fleet when detected; never invents skills roots or hub claims.
 */

import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentPresence, FixAction } from "../engine/types.js";
import type { AdapterContext, AgentAdapter } from "./types.js";

/**
 * Honest v1 limitation for presence-only agents (design §8).
 * Surface this in fleet / agents listings.
 */
export const PRESENCE_ONLY_LIMITATION =
  "detected; limited checks / limited auto-fix in v1";

export type PresenceAdapterOptions = {
  /** Agent / adapter id (e.g. gemini, cursor). */
  id: string;
  /**
   * Config home to detect. Defaults to ~/.{id} when omitted.
   * Injectable for fixtures / tests.
   */
  home?: string;
  /**
   * Extra marker paths; presence is true if home or any marker exists.
   */
  markers?: string[];
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Presence-only adapters never gather hub/skills evidence in v1.
 * Always false — call sites must not treat detection as hub alignment.
 */
export function reportsSkillsOnHub(
  _adapter: AgentAdapter,
  _hub?: string,
): boolean {
  return false;
}

/**
 * Create a presence-only AgentAdapter for an unknown / shallow agent.
 * Still listed in the fleet when detected; no deep skills claims.
 */
export function createPresenceAdapter(
  options: PresenceAdapterOptions,
): AgentAdapter {
  const id = options.id;
  const home = options.home ?? join(homedir(), `.${id}`);
  const markers = options.markers ?? [];

  return {
    id,

    async detect(): Promise<AgentPresence> {
      // Prefer configured home, then extra markers.
      if (await pathExists(home)) {
        return {
          id,
          adapter: id,
          installed: true,
          config_home: home,
          depth: "presence-only",
        };
      }

      for (const path of markers) {
        if (await pathExists(path)) {
          return {
            id,
            adapter: id,
            installed: true,
            config_home: path,
            depth: "presence-only",
          };
        }
      }

      return {
        id,
        adapter: id,
        installed: false,
        depth: "presence-only",
      };
    },

    async skillsRoots(_ctx: AdapterContext = {}): Promise<string[]> {
      // Presence-only: never invent skills roots as healthy / on-hub.
      return [];
    },

    async instructionFiles(_projectRoot?: string): Promise<string[]> {
      // Limited checks — no deep instruction discovery in v1.
      return [];
    },

    async memoryPointers(_projectRoot?: string): Promise<string[]> {
      return [];
    },

    proposeWireToSkillsHub(_hub: string): FixAction[] {
      // Limited auto-fix in v1 for presence-only agents.
      return [];
    },

    proposeWireMemory(_paths: string[]): FixAction[] {
      return [];
    },
  };
}

/** Built-in unknown agent ids registered as presence-only by default. */
export const DEFAULT_PRESENCE_AGENT_IDS = ["gemini", "cursor"] as const;
