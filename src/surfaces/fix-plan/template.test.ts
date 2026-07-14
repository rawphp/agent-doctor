import { describe, expect, it } from 'vitest';
import type { FixAction, Report } from '../../engine/types.js';
import { renderFixPlanHtml } from './template.js';

function sampleReport(): Report {
  return {
    generated_at: '2026-07-14T12:00:00.000Z',
    scope: 'hybrid',
    sync: {
      skills_hub: '/hub',
      memory_hubs: [],
      agents_in_scope: ['claude-code'],
      aligned: false,
    },
    overall: { score: 40, grade: 'red' },
    agents: [],
    domains: [],
    findings: [],
    recommendations: [],
  };
}

describe('renderFixPlanHtml', () => {
  it('includes step descriptions, hub, and apply command', () => {
    const plan: FixAction[] = [
      {
        id: 'fix.set_sync_target',
        kind: 'set_sync_target',
        description: 'Set map.skills.sync_target to /hub',
        target: '/home/.agent-doctor/map.yml',
        value: '/hub',
      },
      {
        id: 'fix.wire_claude-code_skills',
        kind: 'symlink_skills_hub',
        description: 'Symlink ~/.claude/skills → /hub',
        target: '/home/.claude/skills',
        value: '/hub',
        agent_id: 'claude-code',
      },
    ];

    const html = renderFixPlanHtml({
      plan,
      report: sampleReport(),
      dryRun: true,
      syncTarget: '/hub',
      applyCommand: 'agent-doctor fix --yes --sync-target /hub',
    });

    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toContain('Set map.skills.sync_target to /hub');
    expect(html).toContain('claude-code');
    expect(html).toContain('agent-doctor fix --yes --sync-target /hub');
    expect(html).toContain('dry-run');
    expect(html).toMatch(/Grade.*RED/i);
  });

  it('escapes HTML in paths', () => {
    const html = renderFixPlanHtml({
      plan: [
        {
          id: 'x',
          kind: 'wire_memory_pointer',
          description: 'Vault <script>',
          target: '/path/<evil>',
        },
      ],
      report: sampleReport(),
      dryRun: true,
      applyCommand: 'agent-doctor fix --yes',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;evil&gt;');
  });
});
