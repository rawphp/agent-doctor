/**
 * Claude Code adapter (design §8 first-class deep adapter).
 * Detects ~/.claude (or injectable home), lists skills roots and instruction files,
 * and proposes hub wiring via symlink — never content copy.
 */

import { access, lstat, readlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AgentPresence, FixAction } from '../engine/types.js';
import type { AdapterContext, AgentAdapter } from './types.js';

const ADAPTER_ID = 'claude-code';

export type ClaudeCodeAdapterOptions = {
  /**
   * Override for the Claude config home (default: ~/.claude).
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

export function createClaudeCodeAdapter(options: ClaudeCodeAdapterOptions = {}): AgentAdapter {
  const home = options.home ?? join(homedir(), '.claude');

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
      const globalSkills = join(home, 'skills');
      if (await pathExists(globalSkills)) {
        roots.push(globalSkills);
      }

      if (ctx.projectRoot) {
        const projectSkills = join(ctx.projectRoot, '.claude', 'skills');
        if (await pathExists(projectSkills)) {
          roots.push(projectSkills);
        }
      }

      return roots;
    },

    async instructionFiles(projectRoot?: string): Promise<string[]> {
      const files: string[] = [];

      const userClaudeMd = join(home, 'CLAUDE.md');
      if (await pathExists(userClaudeMd)) {
        files.push(userClaudeMd);
      }

      if (projectRoot) {
        // AGENTS.md-first hierarchy: list the hub when present (vendor pointer stays CLAUDE.md).
        const projectAgentsMd = join(projectRoot, 'AGENTS.md');
        if (await pathExists(projectAgentsMd)) {
          files.push(projectAgentsMd);
        }

        const projectClaudeMd = join(projectRoot, 'CLAUDE.md');
        if (await pathExists(projectClaudeMd)) {
          files.push(projectClaudeMd);
        }

        const projectClaudeDir = join(projectRoot, '.claude');
        if (await pathExists(projectClaudeDir)) {
          // Known instruction-related surfaces under .claude/
          const settings = join(projectClaudeDir, 'settings.json');
          const settingsLocal = join(projectClaudeDir, 'settings.local.json');
          if (await pathExists(settings)) {
            files.push(settings);
          }
          if (await pathExists(settingsLocal)) {
            files.push(settingsLocal);
          }
        }
      }

      return files;
    },

    expectedInstructionFiles(projectRoot?: string): string[] {
      // Claude still uses CLAUDE.md as the vendor pointer surface (hierarchy → AGENTS.md).
      if (!projectRoot) return [];
      return [join(projectRoot, 'CLAUDE.md')];
    },

    async memoryPointers(_projectRoot?: string): Promise<string[]> {
      // v1: deep memory discovery (vault refs in instructions) is owned by
      // domain checks; adapter reports explicit config pointers when present.
      // No invented paths — empty until a real pointer is found on disk.
      const pointers: string[] = [];
      // Future: parse settings.json / CLAUDE.md for vault path mentions.
      return pointers;
    },

    proposeWireToSkillsHub(hub: string): FixAction[] {
      const agentSkillsPath = join(home, 'skills');
      // Sync proposal is plan-only; apply layer will create the symlink.
      // Prefer symlink-to-hub — never content copy (UR decision / design §9).
      return [
        {
          id: 'fix.wire_claude-code_skills',
          kind: 'symlink_skills_hub',
          description: `Symlink ${agentSkillsPath} → ${hub} (hub wiring via symlink)`,
          target: agentSkillsPath,
          agent_id: ADAPTER_ID,
        },
      ];
    },

    proposeWireMemory(paths: string[]): FixAction[] {
      // target = instruction file to append; value = vault path (apply layer)
      const instructionFile = join(home, 'CLAUDE.md');
      return paths.map((vaultPath, index) => ({
        id: `fix.wire_claude-code_memory_${index + 1}`,
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
export async function claudeSkillsAlreadyWired(home: string, hub: string): Promise<boolean> {
  return isSymlinkToHub(join(home, 'skills'), hub);
}

/** Default adapter bound to real ~/.claude */
export const claudeCodeAdapter: AgentAdapter = createClaudeCodeAdapter();
