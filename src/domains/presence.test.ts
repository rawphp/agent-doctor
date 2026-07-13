import { describe, expect, it } from 'vitest';
import type { AgentPresence, HomeMap } from '../engine/types.js';
import { checkPresence } from './presence.js';
import type { DomainCheckContext } from './context.js';

function emptyMap(): HomeMap {
  return {
    version: 1,
    skills: { global_roots: [], sync_target: null },
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
  };
}

function ctx(agents: AgentPresence[]): DomainCheckContext {
  return { map: emptyMap(), agents };
}

describe('checkPresence', () => {
  it('returns findings with stable ids and agents_affected', async () => {
    const agents: AgentPresence[] = [
      {
        id: 'claude-code',
        adapter: 'claude-code',
        installed: false,
        depth: 'deep',
      },
      {
        id: 'codex',
        adapter: 'codex',
        installed: true,
        config_home: '/tmp/does-not-exist-codex-home',
        depth: 'deep',
      },
      {
        id: 'gemini',
        adapter: 'gemini',
        installed: true,
        config_home: '/tmp',
        depth: 'presence-only',
      },
    ];

    const findings = await checkPresence(ctx(agents));

    for (const f of findings) {
      expect(f.id).toMatch(/^presence\./);
      expect(f.domain).toBe('presence');
      expect(Array.isArray(f.agents_affected)).toBe(true);
      expect(f.agents_affected.length).toBeGreaterThan(0);
    }
  });

  it('flags agents that are not installed', async () => {
    const findings = await checkPresence(
      ctx([
        {
          id: 'claude-code',
          adapter: 'claude-code',
          installed: false,
          depth: 'deep',
        },
      ]),
    );

    const missing = findings.filter((f) => f.id === 'presence.not_installed');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.agents_affected).toEqual(['claude-code']);
    expect(missing[0]!.severity).toBe('warn');
  });

  it('flags missing or non-existent config_home for installed agents', async () => {
    const findings = await checkPresence(
      ctx([
        {
          id: 'codex',
          adapter: 'codex',
          installed: true,
          depth: 'deep',
        },
        {
          id: 'grok',
          adapter: 'grok',
          installed: true,
          config_home: '/tmp/agent-doctor-missing-config-home-xyz',
          depth: 'deep',
        },
      ]),
    );

    const missingHome = findings.filter((f) => f.id === 'presence.config_home_missing');
    expect(missingHome.length).toBeGreaterThanOrEqual(2);
    expect(missingHome.flatMap((f) => f.agents_affected).sort()).toEqual(['codex', 'grok']);
  });

  it('notes presence-only depth as limited checks', async () => {
    const findings = await checkPresence(
      ctx([
        {
          id: 'cursor',
          adapter: 'cursor',
          installed: true,
          config_home: '/tmp',
          depth: 'presence-only',
        },
      ]),
    );

    const limited = findings.filter((f) => f.id === 'presence.limited_depth');
    expect(limited).toHaveLength(1);
    expect(limited[0]!.agents_affected).toEqual(['cursor']);
    expect(limited[0]!.severity).toBe('info');
  });

  it('skips ignored agents', async () => {
    const findings = await checkPresence(
      ctx([
        {
          id: 'claude-code',
          adapter: 'claude-code',
          installed: false,
          depth: 'deep',
          ignored: true,
        },
      ]),
    );

    expect(findings).toEqual([]);
  });

  it('returns no findings for healthy deep installed agent', async () => {
    const findings = await checkPresence(
      ctx([
        {
          id: 'claude-code',
          adapter: 'claude-code',
          installed: true,
          config_home: '/tmp',
          depth: 'deep',
        },
      ]),
    );

    expect(findings.filter((f) => f.severity !== 'info')).toEqual([]);
  });
});
