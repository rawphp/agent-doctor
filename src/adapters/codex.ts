/**
 * Codex adapter (design §8 first-class deep adapter).
 *
 * Fixture layout (fixtures/agents/codex/):
 *   home/                 → fake ~/.codex
 *     AGENTS.md           → user-level instructions
 *     config.toml         → Codex config
 *     skills/             → global skills root (~/.codex/skills)
 *       sample-skill/SKILL.md
 *   home-no-skills/       → installed home without a skills dir
 *   project/
 *     AGENTS.md           → project-level instructions
 *     .agents/skills/     → project overlay skills root
 *       project-skill/SKILL.md
 *
 * Detects ~/.codex (or injectable home), lists skills roots and AGENTS.md
 * instruction files, and proposes hub wiring via symlink — never content copy.
 * When Codex cannot natively share the hub path, propose symlink
 * ~/.codex/skills → hub (standing UR decision).
 */

import { access, lstat, readlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AgentPresence, FixAction } from '../engine/types.js';
import type { AdapterContext, AgentAdapter } from './types.js';

const ADAPTER_ID = 'codex';

export type CodexAdapterOptions = {
  /**
   * Override for the Codex config home (default: ~/.codex).
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

export function createCodexAdapter(options: CodexAdapterOptions = {}): AgentAdapter {
  const home = options.home ?? join(homedir(), '.codex');

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
        // Project overlay: .agents/skills (design hybrid overlay / multi-agent convention)
        const projectSkills = join(ctx.projectRoot, '.agents', 'skills');
        if (await pathExists(projectSkills)) {
          roots.push(projectSkills);
        }
      }

      return roots;
    },

    async instructionFiles(projectRoot?: string): Promise<string[]> {
      const files: string[] = [];

      const userAgentsMd = join(home, 'AGENTS.md');
      if (await pathExists(userAgentsMd)) {
        files.push(userAgentsMd);
      }

      const configToml = join(home, 'config.toml');
      if (await pathExists(configToml)) {
        files.push(configToml);
      }

      if (projectRoot) {
        const projectAgentsMd = join(projectRoot, 'AGENTS.md');
        if (await pathExists(projectAgentsMd)) {
          files.push(projectAgentsMd);
        }
      }

      return files;
    },

    expectedInstructionFiles(projectRoot?: string): string[] {
      // Codex reads AGENTS.md natively — no separate vendor pointer basename.
      if (!projectRoot) return [];
      return [join(projectRoot, 'AGENTS.md')];
    },

    async memoryPointers(_projectRoot?: string): Promise<string[]> {
      // v1: deep memory discovery is owned by domain checks; adapter reports
      // explicit config pointers when present. No invented paths.
      return [];
    },

    proposeWireToSkillsHub(hub: string): FixAction[] {
      const agentSkillsPath = join(home, 'skills');
      // Codex loads skills from its private home path and cannot natively
      // point at an arbitrary hub — symlink-to-hub (never content copy).
      return [
        {
          id: 'fix.wire_codex_skills',
          kind: 'symlink_skills_hub',
          description: `Symlink ${agentSkillsPath} → ${hub} (hub wiring via symlink)`,
          target: agentSkillsPath,
          agent_id: ADAPTER_ID,
        },
      ];
    },

    proposeWireMemory(paths: string[]): FixAction[] {
      const instructionFile = join(home, 'AGENTS.md');
      return paths.map((vaultPath, index) => ({
        id: `fix.wire_codex_memory_${index + 1}`,
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
export async function codexSkillsAlreadyWired(home: string, hub: string): Promise<boolean> {
  return isSymlinkToHub(join(home, 'skills'), hub);
}

/** Default adapter bound to real ~/.codex */
export const codexAdapter: AgentAdapter = createCodexAdapter();
