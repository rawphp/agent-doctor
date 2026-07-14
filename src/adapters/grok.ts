/**
 * Grok adapter (design §8 first-class deep adapter).
 * Detects ~/.grok (or injectable home), lists skills roots and instruction files,
 * and proposes hub wiring via symlink — never content copy.
 *
 * Live layout (research): user skills at ~/.grok/skills, bundled at
 * ~/.grok/bundled/skills, project at <root>/.grok/skills; project instructions
 * via AGENTS.md / GROK.md / related; user config at ~/.grok/config.toml.
 */

import { access, lstat, readlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AgentPresence, FixAction } from '../engine/types.js';
import type { AdapterContext, AgentAdapter } from './types.js';

const ADAPTER_ID = 'grok';

/** Project instruction basenames Grok reads (order matches Grok docs). */
const PROJECT_INSTRUCTION_BASENAMES = [
  'AGENTS.md',
  'Agents.md',
  'AGENT.md',
  'GROK.md',
  'Claude.md',
  'CLAUDE.md',
] as const;

export type GrokAdapterOptions = {
  /**
   * Override for the Grok config home (default: ~/.grok).
   * Injectable for fixtures / tests — prefer this over real home.
   */
  home?: string;
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
 * True when `path` is a symlink whose resolved target equals `hub`
 * (or is already the hub path).
 */
async function isSymlinkToHub(path: string, hub: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (!stat.isSymbolicLink()) {
      return false;
    }
    const target = await readlink(path);
    const resolvedTarget = resolve(path, '..', target);
    return resolve(resolvedTarget) === resolve(hub);
  } catch {
    return false;
  }
}

export function createGrokAdapter(options: GrokAdapterOptions = {}): AgentAdapter {
  const home = options.home ?? join(homedir(), '.grok');

  return {
    id: ADAPTER_ID,

    async detect(): Promise<AgentPresence> {
      const installed = await pathExists(home);
      if (!installed) {
        return {
          id: ADAPTER_ID,
          adapter: ADAPTER_ID,
          installed: false,
          depth: 'deep',
        };
      }
      return {
        id: ADAPTER_ID,
        adapter: ADAPTER_ID,
        installed: true,
        config_home: home,
        depth: 'deep',
      };
    },

    async skillsRoots(ctx: AdapterContext = {}): Promise<string[]> {
      const roots: string[] = [];

      // User skills (~/.grok/skills)
      const userSkills = join(home, 'skills');
      if (await pathExists(userSkills)) {
        roots.push(userSkills);
      }

      // Bundled skills (~/.grok/bundled/skills)
      const bundledSkills = join(home, 'bundled', 'skills');
      if (await pathExists(bundledSkills)) {
        roots.push(bundledSkills);
      }

      // Project / local skills (<project>/.grok/skills)
      if (ctx.projectRoot) {
        const projectSkills = join(ctx.projectRoot, '.grok', 'skills');
        if (await pathExists(projectSkills)) {
          roots.push(projectSkills);
        }
      }

      return roots;
    },

    async instructionFiles(projectRoot?: string): Promise<string[]> {
      const files: string[] = [];

      // User-level config surface
      const userConfig = join(home, 'config.toml');
      if (await pathExists(userConfig)) {
        files.push(userConfig);
      }

      if (projectRoot) {
        for (const base of PROJECT_INSTRUCTION_BASENAMES) {
          const candidate = join(projectRoot, base);
          if (await pathExists(candidate)) {
            files.push(candidate);
          }
        }
      }

      return files;
    },

    async memoryPointers(_projectRoot?: string): Promise<string[]> {
      // v1: deep memory discovery is owned by domain checks; adapter reports
      // explicit config pointers when present. No invented paths.
      return [];
    },

    proposeWireToSkillsHub(hub: string): FixAction[] {
      const agentSkillsPath = join(home, 'skills');
      // Sync proposal is plan-only; apply layer will create the symlink.
      // Prefer symlink-to-hub — never content copy (UR decision / design §9).
      return [
        {
          id: 'fix.wire_grok_skills',
          kind: 'symlink_skills_hub',
          description: `Symlink ${agentSkillsPath} → ${hub} (hub wiring via symlink)`,
          target: agentSkillsPath,
          agent_id: ADAPTER_ID,
        },
      ];
    },

    proposeWireMemory(paths: string[]): FixAction[] {
      // Grok uses AGENTS.md when present; otherwise CLAUDE.md-style home instructions.
      const instructionFile = join(home, 'AGENTS.md');
      return paths.map((vaultPath, index) => ({
        id: `fix.wire_grok_memory_${index + 1}`,
        kind: 'wire_memory_pointer',
        description: `Add vault pointer to ${vaultPath} in ${instructionFile}`,
        target: instructionFile,
        value: vaultPath,
        agent_id: ADAPTER_ID,
      }));
    },
  };
}

/**
 * Async helper used by fix apply later: whether skills path already points at hub.
 * Exported for tests / apply planner; detect path does not call this.
 */
export async function grokSkillsAlreadyWired(home: string, hub: string): Promise<boolean> {
  return isSymlinkToHub(join(home, 'skills'), hub);
}

/** Default adapter bound to real ~/.grok */
export const grokAdapter: AgentAdapter = createGrokAdapter();
