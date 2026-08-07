/**
 * User-facing domain labels (engine still uses snake_case ids in JSON).
 */

const DOMAIN_LABELS: Record<string, string> = {
  agent_presence: 'presence',
  shared_skills_path: 'skills hub',
  instruction_files: 'instructions',
  product_context: 'product',
  obsidian: 'vaults',
  cross_agent_consistency: 'consistency',
};

/** Map a report domain id to a short terminal/dashboard label. */
export function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}
