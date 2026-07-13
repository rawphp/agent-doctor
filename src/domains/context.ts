/**
 * Shared context for domain checkers (design §7).
 * runChecks() will build this once and pass it to each domain.
 */

import type { AgentAdapter } from '../adapters/types.js';
import type { AgentPresence, HomeMap } from '../engine/types.js';

export type DomainCheckContext = {
  map: HomeMap;
  /** Live presence results (includes ignored/uninstalled as reported). */
  agents: AgentPresence[];
  /** Project root for hybrid/project-scoped checks. */
  projectRoot?: string;
  /** Resolved skills hub (from resolveSkillsHub). */
  hub?: string;
  /** Per-adapter skills roots (from resolveSkillsHub / adapters). */
  agentRoots?: Record<string, string[]>;
  /** Adapters for deep inspection (skills, instructions, memory). */
  adapters?: AgentAdapter[];
};

/** Non-ignored agents in scope for fleet/sync checks. */
export function agentsInScope(agents: AgentPresence[]): AgentPresence[] {
  return agents.filter((a) => !a.ignored);
}

/** First-class deep agents that are non-ignored (consistency fleet). */
export function firstClassInScope(agents: AgentPresence[]): AgentPresence[] {
  return agentsInScope(agents).filter((a) => a.depth === 'deep' && a.installed);
}
