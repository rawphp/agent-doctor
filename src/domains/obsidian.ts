/**
 * Obsidian domain (design §7.5).
 * Vaults from map only — never invent a vault. Flag missing paths / missing links.
 * No vault content writes.
 */

import { readFileSync, statSync } from 'node:fs';
import type { Finding } from '../engine/types.js';
import { agentsInScope, type DomainCheckContext } from './context.js';
import { pathExists } from './paths.js';

function isDirectory(path: string): boolean {
  try {
    return pathExists(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function contentMentionsVault(content: string, vaultPath: string): boolean {
  if (content.includes(vaultPath)) return true;
  // basename mention of vault folder
  const base = vaultPath.split(/[/\\]/).pop() ?? '';
  if (base && content.includes(base)) return true;
  return false;
}

/**
 * Check Obsidian vault wiring from map.vaults only.
 */
export async function checkObsidian(ctx: DomainCheckContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  const vaults = ctx.map.vaults ?? [];

  if (vaults.length === 0) {
    findings.push({
      id: 'obsidian.none_configured',
      severity: 'info',
      domain: 'obsidian',
      message: 'No Obsidian vault configured in map — re-run init/map to add a vault path.',
      evidence: [],
      agents_affected: [],
    });
    return findings;
  }

  const existingVaults: string[] = [];
  for (const vault of vaults) {
    if (!isDirectory(vault.path)) {
      findings.push({
        id: 'obsidian.vault_missing',
        severity: 'error',
        domain: 'obsidian',
        message: `Mapped vault path is missing or not a directory: ${vault.path}`,
        evidence: [vault.path],
        agents_affected: [],
      });
    } else {
      existingVaults.push(vault.path);
    }
  }

  if (existingVaults.length === 0) {
    return findings;
  }

  const inScope = agentsInScope(ctx.agents).filter((a) => a.installed);

  for (const agent of inScope) {
    if (agent.depth === 'presence-only') continue;

    const adapter = ctx.adapters?.find((a) => a.id === agent.id);
    if (!adapter) continue;

    const memory = await adapter.memoryPointers(ctx.projectRoot);
    const instructionFiles = await adapter.instructionFiles(ctx.projectRoot);

    for (const vaultPath of existingVaults) {
      const viaMemory = memory.some((p) => p === vaultPath || p.includes(vaultPath));
      if (viaMemory) continue;

      let viaInstructions = false;
      for (const instr of instructionFiles) {
        if (!pathExists(instr) || instr.endsWith('.json')) continue;
        let content = '';
        try {
          content = readFileSync(instr, 'utf8');
        } catch {
          continue;
        }
        if (contentMentionsVault(content, vaultPath)) {
          viaInstructions = true;
          break;
        }
      }

      if (!viaInstructions) {
        findings.push({
          id: 'obsidian.missing_vault_link',
          severity: 'warn',
          domain: 'obsidian',
          message: `Agent ${agent.id} does not reference vault ${vaultPath} in instructions or memory pointers.`,
          evidence: [vaultPath, ...instructionFiles],
          agents_affected: [agent.id],
        });
      }
    }
  }

  return findings;
}
