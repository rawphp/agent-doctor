/**
 * Skills hub resolution (design §3, §6).
 *
 * Resolve the single skills sync target from map + adapter roots:
 * - use map.skills.sync_target if set
 * - else single populated root becomes hub
 * - else two+ populated roots → conflict (no silent pick)
 * - empty / unpopulated roots → explicit no-hub finding (never invent a path)
 */

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AdapterContext, AgentAdapter } from '../adapters/types.js';
import type { Finding, HomeMap } from './types.js';

export type ResolveSkillsHubOptions = {
  map: HomeMap;
  /** Adapters whose skillsRoots are collected into candidates + agentRoots. */
  adapters?: AgentAdapter[];
  /** Optional context forwarded to adapter.skillsRoots (e.g. projectRoot). */
  ctx?: AdapterContext;
};

export type SkillsHubResolution = {
  /**
   * Resolved hub path (absolute, resolved), or undefined when conflict / no hub.
   * Never a fabricated hero path.
   */
  hub?: string;
  /** Per-adapter skills roots as returned by adapters (raw paths). */
  agentRoots: Record<string, string[]>;
  /** Deduped candidate roots considered (resolved absolute paths). */
  candidates: string[];
  /** Candidates that exist and contain at least one entry. */
  populated: string[];
  findings: Finding[];
};

/**
 * True when `path` is an existing directory with at least one entry.
 * Empty dirs and missing paths are not populated.
 */
export function isPopulatedSkillsRoot(path: string): boolean {
  try {
    if (!existsSync(path)) return false;
    const st = statSync(path);
    if (!st.isDirectory()) return false;
    return readdirSync(path).length > 0;
  } catch {
    return false;
  }
}

/**
 * Resolve a path for comparison. Prefer realpath when the path exists;
 * fall back to path.resolve so missing sync_target paths still normalize.
 */
function resolvePath(path: string): string {
  try {
    if (existsSync(path)) {
      return realpathSync(path);
    }
  } catch {
    // fall through
  }
  return resolve(path);
}

function dedupeResolved(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const r = resolvePath(p);
    if (seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out;
}

function noHubFinding(candidates: string[]): Finding {
  return {
    id: 'skills.no_hub',
    severity: 'warn',
    domain: 'skills',
    message: 'No skills hub resolved: no populated skills roots and no sync_target set.',
    evidence: candidates,
    agents_affected: [],
  };
}

function hubConflictFinding(populated: string[]): Finding {
  return {
    id: 'skills.hub_conflict',
    severity: 'error',
    domain: 'skills',
    message:
      'Multiple populated skills roots with no sync_target; choose one hub before wire fixes.',
    evidence: [...populated],
    agents_affected: [],
  };
}

/**
 * Resolve the skills hub from HomeMap + optional adapters.
 *
 * Rules (design §3 / map.yml skills block):
 * 1. If `map.skills.sync_target` is set → that path is the hub.
 * 2. Else if exactly one candidate root is populated → that root is the hub.
 * 3. Else if two or more populated roots → conflict finding; hub undefined.
 * 4. Else (no populated roots) → no-hub finding; hub undefined.
 */
export async function resolveSkillsHub(
  options: ResolveSkillsHubOptions,
): Promise<SkillsHubResolution> {
  const { map, adapters = [], ctx } = options;

  const agentRoots: Record<string, string[]> = {};
  const rawCandidates: string[] = [...map.skills.global_roots];

  for (const adapter of adapters) {
    const roots = await adapter.skillsRoots(ctx);
    agentRoots[adapter.id] = roots;
    rawCandidates.push(...roots);
  }

  const candidates = dedupeResolved(rawCandidates);
  const populated = candidates.filter((c) => isPopulatedSkillsRoot(c));

  // 1. Explicit sync target always wins
  const syncTarget = map.skills.sync_target;
  if (syncTarget != null && syncTarget !== '') {
    const hub = resolvePath(syncTarget);
    return {
      hub,
      agentRoots,
      candidates,
      populated,
      findings: [],
    };
  }

  // 2. Single populated root
  if (populated.length === 1) {
    return {
      hub: populated[0],
      agentRoots,
      candidates,
      populated,
      findings: [],
    };
  }

  // 3. Multiple populated roots → conflict, no silent pick
  if (populated.length >= 2) {
    return {
      hub: undefined,
      agentRoots,
      candidates,
      populated,
      findings: [hubConflictFinding(populated)],
    };
  }

  // 4. Nothing populated → explicit no-hub (never invent a path)
  return {
    hub: undefined,
    agentRoots,
    candidates,
    populated,
    findings: [noHubFinding(candidates)],
  };
}
