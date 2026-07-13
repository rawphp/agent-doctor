import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { VaultEntry } from "../engine/types.js";

export type DiscoverOptions = {
  /**
   * Base user home for candidate resolution (default: os.homedir()).
   * Independent of AGENT_DOCTOR_HOME, which only redirects map IO.
   */
  homeDir?: string;
};

export type DiscoverResult = {
  /** Existing candidate skills hub directories (peers — no single hero path). */
  skills_roots: string[];
  /** Existing common project-root parent directories. */
  project_roots: string[];
  /** Vaults found via .obsidian markers under common locations. */
  vaults: VaultEntry[];
};

/**
 * Relative paths under the user home that may host a skills hub.
 * Multiple candidates are intentional — discovery never elevates one as THE hub.
 * @see design §3 “No hard-coded hero path”
 */
const SKILLS_ROOT_CANDIDATES = [
  ".agents/skills",
  ".claude/skills",
  ".codex/skills",
  ".grok/skills",
  ".config/opencode/skills",
  ".cursor/skills",
] as const;

/** Common parent folders users keep code under. */
const PROJECT_ROOT_CANDIDATES = [
  "Projects",
  "projects",
  "Developer",
  "dev",
  "Code",
  "code",
  "src",
  "repos",
  "workspace",
  "Work",
] as const;

/**
 * Parent directories that may contain Obsidian vault folders.
 * Each child (or the parent itself) is a vault if it contains `.obsidian/`.
 */
const VAULT_SEARCH_PARENTS = [
  "Documents/Obsidian",
  "Documents/obsidian",
  "Obsidian",
  "obsidian",
  "Documents",
  // macOS iCloud Obsidian
  "Library/Mobile Documents/iCloud~md~obsidian/Documents",
] as const;

/**
 * Filesystem discovery of skills roots, project root candidates, and vaults.
 * Map is inventory + hints; live checks still run at status time.
 */
export function discover(options: DiscoverOptions = {}): DiscoverResult {
  const homeDir = options.homeDir ?? homedir();

  return {
    skills_roots: discoverSkillsRoots(homeDir),
    project_roots: discoverProjectRoots(homeDir),
    vaults: discoverVaults(homeDir),
  };
}

function discoverSkillsRoots(homeDir: string): string[] {
  const found: string[] = [];
  for (const rel of SKILLS_ROOT_CANDIDATES) {
    const abs = join(homeDir, rel);
    if (isDirectory(abs)) found.push(abs);
  }
  return found;
}

function discoverProjectRoots(homeDir: string): string[] {
  const found: string[] = [];
  for (const name of PROJECT_ROOT_CANDIDATES) {
    const abs = join(homeDir, name);
    if (isDirectory(abs)) found.push(abs);
  }
  return found;
}

function discoverVaults(homeDir: string): VaultEntry[] {
  const seen = new Set<string>();
  const vaults: VaultEntry[] = [];

  const addIfVault = (dir: string) => {
    if (seen.has(dir)) return;
    if (!isDirectory(dir)) return;
    if (!isDirectory(join(dir, ".obsidian"))) return;
    seen.add(dir);
    vaults.push({ path: dir, source: "discovered" });
  };

  for (const rel of VAULT_SEARCH_PARENTS) {
    const parent = join(homeDir, rel);
    if (!isDirectory(parent)) continue;

    // Parent itself may be a vault
    addIfVault(parent);

    // Immediate children may be vaults (e.g. Documents/Obsidian/Notes)
    for (const child of listDirSafe(parent)) {
      addIfVault(join(parent, child));
    }
  }

  return vaults;
}

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function listDirSafe(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}
