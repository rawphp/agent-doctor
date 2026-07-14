import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Report } from '../../engine/types.js';
import { startDashboardServer, type DashboardServer } from './server.js';

function sampleReport(overrides: Partial<Report> = {}): Report {
  return {
    generated_at: '2026-07-14T12:00:00.000Z',
    scope: 'hybrid',
    project_root: '/proj',
    sync: {
      skills_hub: '/hub/skills',
      memory_hubs: [],
      agents_in_scope: ['claude-code'],
      aligned: true,
    },
    overall: { score: 90, grade: 'green' },
    agents: [
      {
        id: 'claude-code',
        adapter: 'claude-code',
        installed: true,
        config_home: '/h/.claude',
        depth: 'deep',
      },
    ],
    domains: [
      {
        domain: 'agent_presence',
        score: 100,
        grade: 'green',
        summary: 'ok',
      },
    ],
    findings: [
      {
        id: 'finding.sample',
        severity: 'info',
        domain: 'agent_presence',
        message: 'all good',
        evidence: [],
        agents_affected: ['claude-code'],
      },
    ],
    recommendations: [],
    fix_plan: [
      {
        id: 'fix.noop',
        kind: 'noop',
        description: 'Nothing to do',
      },
    ],
    ...overrides,
  };
}

const servers: DashboardServer[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    const s = servers.pop();
    await s?.close();
  }
});

describe('startDashboardServer', () => {
  it('binds loopback only (127.0.0.1), not 0.0.0.0', async () => {
    const server = await startDashboardServer({
      report: sampleReport(),
      port: 0,
    });
    servers.push(server);

    const addr = server.address as AddressInfo | string | null;
    expect(addr).toBeTruthy();
    if (typeof addr === 'string') {
      expect(addr).toMatch(/127\.0\.0\.1/);
    } else {
      expect(addr!.address).toBe('127.0.0.1');
      expect(addr!.port).toBeGreaterThan(0);
    }
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+/);
  });

  it('serves HTML that includes overall.grade and finding ids', async () => {
    const report = sampleReport();
    const server = await startDashboardServer({ report, port: 0 });
    servers.push(server);

    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toMatch(/text\/html/i);
    const html = await res.text();
    expect(html).toMatch(/data-overall-grade=["']green["']/i);
    expect(html).toContain('finding.sample');
    expect(html).toContain('90');
  });

  it('close() resolves even when a client used keep-alive', async () => {
    const server = await startDashboardServer({
      report: sampleReport(),
      port: 0,
    });
    servers.push(server);

    // Open a request that could leave a keep-alive socket if the server allowed it.
    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    await res.text();

    const started = Date.now();
    await server.close();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('does not call fix apply (surface is read-only)', async () => {
    // Server module must not import or invoke a fix applicator.
    // Smoke: POST /apply (or similar) is not offered; only GET HTML.
    const server = await startDashboardServer({
      report: sampleReport(),
      port: 0,
    });
    servers.push(server);

    const post = await fetch(server.url, { method: 'POST', body: 'apply' });
    // No apply endpoint — 404/405, never 200 that mutates.
    expect([404, 405]).toContain(post.status);

    // Source-level guarantee: no fix applicator import/call (ignore comments).
    const serverSource = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./server.ts', import.meta.url), 'utf8'),
    );
    const codeOnly = serverSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/\bapplyFix\b|\brunFixApply\b|\bfixApply\b/);
    expect(codeOnly).not.toMatch(/from\s+["'][^"']*\/(?:fix|apply)[^"']*["']/);
  });
});
