/**
 * Presence domain (design §7.1).
 * Installed? Config home exists? Adapter depth?
 */

import type { Finding } from '../engine/types.js';
import { agentsInScope, type DomainCheckContext } from './context.js';
import { pathExists } from './paths.js';

/**
 * Check agent presence for non-ignored agents.
 */
export async function checkPresence(ctx: DomainCheckContext): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const agent of agentsInScope(ctx.agents)) {
    if (!agent.installed) {
      findings.push({
        id: 'presence.not_installed',
        severity: 'warn',
        domain: 'presence',
        message: `Agent ${agent.id} is not installed (no config home detected).`,
        evidence: [],
        agents_affected: [agent.id],
      });
      continue;
    }

    if (!agent.config_home || !pathExists(agent.config_home)) {
      findings.push({
        id: 'presence.config_home_missing',
        severity: 'warn',
        domain: 'presence',
        message: agent.config_home
          ? `Agent ${agent.id} config home is missing on disk: ${agent.config_home}`
          : `Agent ${agent.id} is installed but has no config_home.`,
        evidence: agent.config_home ? [agent.config_home] : [],
        agents_affected: [agent.id],
      });
    }

    if (agent.depth === 'presence-only' || agent.depth === 'shallow') {
      findings.push({
        id: 'presence.limited_depth',
        severity: 'info',
        domain: 'presence',
        message: `Agent ${agent.id} has ${agent.depth} adapter depth; limited checks / limited auto-fix in v1.`,
        evidence: agent.config_home ? [agent.config_home] : [],
        agents_affected: [agent.id],
      });
    }
  }

  return findings;
}
