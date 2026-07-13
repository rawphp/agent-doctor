/**
 * Thin presence detection for first-class agents (design §8).
 * Full adapter REQs (skills/instructions/wire) land separately — this module
 * only reports installed config homes for map.yml inventory.
 */

import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MapAgent } from "../engine/types.js";

export type PresenceDetectOptions = {
  /** User home used to resolve agent config dirs (default: os.homedir()). */
  homeDir?: string;
};

/** Known first-class agent homes relative to the user home. */
const FIRST_CLASS_HOMES = [
  { id: "claude-code", adapter: "claude-code", rel: ".claude" },
  { id: "codex", adapter: "codex", rel: ".codex" },
  { id: "grok", adapter: "grok", rel: ".grok" },
] as const;

/**
 * Detect Claude Code, Codex, and Grok config homes when present on disk.
 * Returns only installed agents (no stubs for missing homes).
 */
export function detectFirstClassAgents(
  options: PresenceDetectOptions = {},
): MapAgent[] {
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
