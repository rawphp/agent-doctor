/**
 * Presence helpers (design §8).
 *
 * - detectFirstClassAgents: thin map inventory for Claude Code / Codex / Grok homes
 * - createPresenceAdapter: presence-only AgentAdapter for unknown agents (gemini, cursor, …)
 */

import { existsSync, statSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentPresence, FixAction, MapAgent } from '../engine/types.js';
import type { AdapterContext, AgentAdapter } from './types.js';

// ---------------------------------------------------------------------------
// Map inventory (first-class agents) — used by init/map
// ---------------------------------------------------------------------------

export type PresenceDetectOptions = {
  /** User home used to resolve agent config dirs (default: os.homedir()). */
  homeDir?: string;
};

/** Known first-class agent homes relative to the user home. */
const FIRST_CLASS_HOMES = [
  { id: 'claude-code', adapter: 'claude-code', rel: '.claude' },
  { id: 'codex', adapter: 'codex', rel: '.codex' },
  { id: 'grok', adapter: 'grok', rel: '.grok' },
] as const;

/**
 * Detect Claude Code, Codex, and Grok config homes when present on disk.
 * Returns only installed agents (no stubs for missing homes).
 */
export function detectFirstClassAgents(options: PresenceDetectOptions = {}): MapAgent[] {
  const homeDir = options.homeDir ?? homedir();
  const found: MapAgent[] = [];

  for (const agent of FIRST_CLASS_HOMES) {
    const configHome = join(homeDir, agent.rel);
    if (!isDirectory(configHome)) continue;
    found.push({
      id: agent.id,
      adapter: agent.adapter,
      config_home: configHome,
      primary: false,
      ignored: false,
    });
  }

  return found;
}

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Presence-only AgentAdapter (unknown / shallow agents)
// ---------------------------------------------------------------------------

/**
 * Honest v1 limitation for presence-only agents (design §8).
 * Surface this in fleet / agents listings.
 */
export const PRESENCE_ONLY_LIMITATION = 'detected; limited checks / limited auto-fix in v1';

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
export function reportsSkillsOnHub(_adapter: AgentAdapter, _hub?: string): boolean {
  return false;
}

/**
 * Create a presence-only AgentAdapter for an unknown / shallow agent.
 * Still listed in the fleet when detected; no deep skills claims.
 */
export function createPresenceAdapter(options: PresenceAdapterOptions): AgentAdapter {
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
          depth: 'presence-only',
        };
      }

      for (const path of markers) {
        if (await pathExists(path)) {
          return {
            id,
            adapter: id,
            installed: true,
            config_home: path,
            depth: 'presence-only',
          };
        }
      }

      return {
        id,
        adapter: id,
        installed: false,
        depth: 'presence-only',
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
export const DEFAULT_PRESENCE_AGENT_IDS = ['gemini', 'cursor'] as const;
