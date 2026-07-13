/**
 * Domain checkers barrel (design §7).
 * runChecks() (future) invokes each domain with a shared DomainCheckContext.
 */

export { type DomainCheckContext, agentsInScope, firstClassInScope } from './context.js';

export { checkPresence } from './presence.js';
export { checkSkills, type SkillsCheckResult } from './skills.js';
export { checkInstructions } from './instructions.js';
export { checkProduct } from './product.js';
export { checkObsidian } from './obsidian.js';
export { checkConsistency } from './consistency.js';

import type { Finding, FixAction } from '../engine/types.js';
import type { DomainCheckContext } from './context.js';
import { checkPresence } from './presence.js';
import { checkSkills } from './skills.js';
import { checkInstructions } from './instructions.js';
import { checkProduct } from './product.js';
import { checkObsidian } from './obsidian.js';
import { checkConsistency } from './consistency.js';

export type AllDomainChecksResult = {
  findings: Finding[];
  fix_actions: FixAction[];
  byDomain: Record<string, Finding[]>;
};

/**
 * Run all six domain checkers. Convenience for future runChecks().
 */
export async function runAllDomainChecks(ctx: DomainCheckContext): Promise<AllDomainChecksResult> {
  const [presence, skills, instructions, product, obsidian, consistency] = await Promise.all([
    checkPresence(ctx),
    checkSkills(ctx),
    checkInstructions(ctx),
    checkProduct(ctx),
    checkObsidian(ctx),
    checkConsistency(ctx),
  ]);

  const byDomain: Record<string, Finding[]> = {
    presence,
    skills: skills.findings,
    instructions,
    product,
    obsidian,
    consistency,
  };

  return {
    findings: [
      ...presence,
      ...skills.findings,
      ...instructions,
      ...product,
      ...obsidian,
      ...consistency,
    ],
    fix_actions: skills.fix_actions,
    byDomain,
  };
}
