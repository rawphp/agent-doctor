/**
 * Gemini / Antigravity adapter (deep adapter, modelled on grok.ts).
 * The `gemini` CLI and Antigravity (`agy` CLI and IDE) share the ~/.gemini home.
 *
 * Layout (agy-customizations skill): global customization root is
 * ~/.gemini/config/, so global skills live at ~/.gemini/config/skills.
 * Workspace roots are .agents/, .agent/, _agents/ and _agent/ under the project.
 * Rules are GEMINI.md and AGENTS.md. Antigravity's built-in skills
 * (~/.gemini/antigravity-cli/builtin/skills) are never reported as a root.
 */

import { access, lstat, readlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AgentPresence, FixAction } from '../engine/types.js';
import type { AdapterContext, AgentAdapter } from './types.js';

const ADAPTER_ID = 'gemini';

/** Workspace customization roots agy searches for skills/. */
const PROJECT_ROOT_DIRS = ['.agents', '.agent', '_agents', '_agent'] as const;

/** Project instruction basenames (AGENTS.md-first). */
const PROJECT_INSTRUCTION_BASENAMES = ['AGENTS.md', 'GEMINI.md'] as const;

export type GeminiAdapterOptions = {
  /**
   * Override for the Gemini config home (default: ~/.gemini).
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

/** True when `path` is a symlink whose resolved target equals `hub`. */
async function isSymlinkToHub(path: string, hub: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (!stat.isSymbolicLink()) {
      return false;
    }
    const target = await readlink(path);
    return resolve(resolve(path, '..', target)) === resolve(hub);
  } catch {
    return false;
  }
}

export function createGeminiAdapter(options: GeminiAdapterOptions = {}): AgentAdapter {
  const home = options.home ?? join(homedir(), '.gemini');
  const globalSkills = join(home, 'config', 'skills');

  return {
    id: ADAPTER_ID,

    async detect(): Promise<AgentPresence> {
      const installed = await pathExists(home);
      if (!installed) {
        return { id: ADAPTER_ID, adapter: ADAPTER_ID, installed: false, depth: 'deep' };
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
      const candidates = [globalSkills];
      if (ctx.projectRoot) {
        for (const dir of PROJECT_ROOT_DIRS) {
          candidates.push(join(ctx.projectRoot, dir, 'skills'));
        }
      }

      const roots: string[] = [];
      for (const candidate of candidates) {
        if (await pathExists(candidate)) {
          roots.push(candidate);
        }
      }
      return roots;
    },

    async instructionFiles(projectRoot?: string): Promise<string[]> {
      if (!projectRoot) return [];
      const files: string[] = [];
      for (const base of PROJECT_INSTRUCTION_BASENAMES) {
        const candidate = join(projectRoot, base);
        if (await pathExists(candidate)) {
          files.push(candidate);
        }
      }
      return files;
    },

    expectedInstructionFiles(projectRoot?: string): string[] {
      // AGENTS.md-first; either file satisfies missing_file (domain multi-option).
      if (!projectRoot) return [];
      return PROJECT_INSTRUCTION_BASENAMES.map((base) => join(projectRoot, base));
    },

    async memoryPointers(_projectRoot?: string): Promise<string[]> {
      return [];
    },

    proposeWireToSkillsHub(hub: string): FixAction[] {
      return [
        {
          id: 'fix.wire_gemini_skills',
          kind: 'symlink_skills_hub',
          description: `Symlink ${globalSkills} → ${hub} (hub wiring via symlink)`,
          target: globalSkills,
          agent_id: ADAPTER_ID,
        },
      ];
    },

    proposeWireMemory(paths: string[]): FixAction[] {
      const instructionFile = join(home, 'GEMINI.md');
      return paths.map((vaultPath, index) => ({
        id: `fix.wire_gemini_memory_${index + 1}`,
        kind: 'wire_memory_pointer',
        description: `Add vault pointer to ${vaultPath} in ${instructionFile}`,
        target: instructionFile,
        value: vaultPath,
        agent_id: ADAPTER_ID,
      }));
    },
  };
}

/** Whether ~/.gemini/config/skills already points at the hub. */
export async function geminiSkillsAlreadyWired(home: string, hub: string): Promise<boolean> {
  return isSymlinkToHub(join(home, 'config', 'skills'), hub);
}

/** Default adapter bound to real ~/.gemini */
export const geminiAdapter: AgentAdapter = createGeminiAdapter();
