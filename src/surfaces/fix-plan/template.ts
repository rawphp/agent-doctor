/**
 * HTML template for fix plan preview (--html).
 * Read-only presentation; apply stays in CLI.
 */

import type { FixAction, Report } from '../../engine/types.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'set_sync_target':
      return 'Set skills hub';
    case 'symlink_skills_hub':
      return 'Symlink skills → hub';
    case 'wire_skills_hub':
      return 'Wire skills path';
    case 'append_instruction_link':
    case 'append_link_block':
      return 'Link in instructions';
    case 'wire_memory_pointer':
      return 'Vault / memory pointer';
    default:
      return kind.replaceAll('_', ' ');
  }
}

function kindClass(kind: string): string {
  if (kind.includes('symlink') || kind.includes('wire_skills')) return 'kind-wire';
  if (kind.includes('memory') || kind.includes('vault')) return 'kind-memory';
  if (kind.includes('sync')) return 'kind-hub';
  if (kind.includes('link') || kind.includes('append')) return 'kind-link';
  return 'kind-other';
}

export type FixPlanHtmlInput = {
  plan: FixAction[];
  report: Report;
  dryRun: boolean;
  syncTarget?: string;
  applyCommand: string;
};

export function renderFixPlanHtml(input: FixPlanHtmlInput): string {
  const { plan, report, dryRun, syncTarget, applyCommand } = input;
  const grade = report.overall.grade.toUpperCase();
  const gradeClass = `grade-${report.overall.grade}`;

  const stepsHtml =
    plan.length === 0
      ? `<div class="empty">
          <h2>No automatic steps yet</h2>
          <p>Findings exist or the hub is unresolved. Pick a skills hub, then re-run dry-run with <code>--sync-target</code>.</p>
          <pre class="cmd">agent-doctor fix --dry-run --sync-target ~/.agents/skills --html</pre>
        </div>`
      : plan
          .map((action, i) => {
            const agent = action.agent_id
              ? `<span class="badge">${escapeHtml(action.agent_id)}</span>`
              : '';
            const target = action.target
              ? `<div class="path"><span class="label">Target</span><code>${escapeHtml(action.target)}</code></div>`
              : '';
            const value = action.value
              ? `<div class="path"><span class="label">Value / hub</span><code>${escapeHtml(action.value)}</code></div>`
              : '';
            return `
        <article class="step ${kindClass(action.kind)}">
          <div class="step-num">${i + 1}</div>
          <div class="step-body">
            <div class="step-head">
              <span class="kind">${escapeHtml(kindLabel(action.kind))}</span>
              ${agent}
              <code class="kind-raw">${escapeHtml(action.kind)}</code>
            </div>
            <p class="desc">${escapeHtml(action.description)}</p>
            ${target}
            ${value}
          </div>
        </article>`;
          })
          .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Doctor — Fix plan</title>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #1a2332;
      --border: #2d3a4d;
      --text: #e7ecf3;
      --muted: #8b9bb4;
      --accent: #5b9fd4;
      --green: #3ecf8e;
      --yellow: #e6b84d;
      --red: #f07178;
      --hub: #7aa2f7;
      --wire: #9ece6a;
      --memory: #bb9af7;
      --link: #7dcfff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 1.5rem;
    }
    .wrap { max-width: 52rem; margin: 0 auto; }
    header {
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 1.35rem; font-weight: 650; margin: 0 0 0.35rem; }
    .meta { color: var(--muted); font-size: 0.9rem; }
    .meta code { color: var(--accent); }
    .badge-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
    .pill {
      display: inline-flex; align-items: center; gap: 0.35rem;
      padding: 0.25rem 0.65rem; border-radius: 999px;
      background: var(--panel); border: 1px solid var(--border);
      font-size: 0.8rem;
    }
    .grade-green { color: var(--green); }
    .grade-yellow { color: var(--yellow); }
    .grade-red { color: var(--red); }
    .cta {
      margin: 1.25rem 0;
      padding: 1rem 1.15rem;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
    }
    .cta h2 { margin: 0 0 0.5rem; font-size: 0.95rem; color: var(--muted); font-weight: 600; }
    .cmd {
      display: block;
      margin: 0;
      padding: 0.75rem 1rem;
      background: #0b0f14;
      border-radius: 8px;
      border: 1px solid var(--border);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.85rem;
      color: var(--green);
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .steps { display: flex; flex-direction: column; gap: 0.75rem; }
    .step {
      display: grid;
      grid-template-columns: 2.5rem 1fr;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      border-left-width: 4px;
    }
    .kind-hub { border-left-color: var(--hub); }
    .kind-wire { border-left-color: var(--wire); }
    .kind-memory { border-left-color: var(--memory); }
    .kind-link { border-left-color: var(--link); }
    .kind-other { border-left-color: var(--muted); }
    .step-num {
      width: 2.25rem; height: 2.25rem;
      border-radius: 8px;
      background: #0b0f14;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 0.95rem; color: var(--muted);
    }
    .step-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin-bottom: 0.35rem; }
    .kind { font-weight: 650; font-size: 0.95rem; }
    .kind-raw { font-size: 0.7rem; color: var(--muted); background: #0b0f14; padding: 0.1rem 0.35rem; border-radius: 4px; }
    .badge {
      font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em;
      padding: 0.1rem 0.4rem; border-radius: 4px;
      background: #243044; color: var(--accent);
    }
    .desc { margin: 0 0 0.5rem; color: var(--text); }
    .path { margin-top: 0.35rem; font-size: 0.85rem; }
    .path .label { display: block; color: var(--muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.15rem; }
    .path code {
      display: block;
      padding: 0.4rem 0.55rem;
      background: #0b0f14;
      border-radius: 6px;
      font-size: 0.8rem;
      word-break: break-all;
      color: #c0caf5;
    }
    .empty { padding: 1.5rem; background: var(--panel); border-radius: 10px; border: 1px solid var(--border); }
    footer { margin-top: 1.5rem; color: var(--muted); font-size: 0.8rem; }
    footer strong { color: var(--text); }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Agent Doctor — Fix plan${dryRun ? ' (dry-run)' : ''}</h1>
      <p class="meta">
        ${plan.length} step${plan.length === 1 ? '' : 's'}
        ${syncTarget ? ` · hub <code>${escapeHtml(syncTarget)}</code>` : ''}
        · nothing written by this page
      </p>
      <div class="badge-row">
        <span class="pill">Grade <strong class="${gradeClass}">${grade}</strong> (${report.overall.score})</span>
        <span class="pill">Scope ${escapeHtml(report.scope)}</span>
        ${dryRun ? '<span class="pill">Read-only preview</span>' : ''}
      </div>
    </header>

    ${
      plan.length > 0
        ? `<div class="cta">
      <h2>After you review, apply in the terminal</h2>
      <pre class="cmd">${escapeHtml(applyCommand)}</pre>
      <p class="meta" style="margin:0.65rem 0 0">Then run <code>agent-doctor status</code> to confirm the grade improved.</p>
    </div>`
        : ''
    }

    <section class="steps" aria-label="Plan steps">
      ${stepsHtml}
    </section>

    <footer>
      <p><strong>This page never applies fixes.</strong> Apply stays in the CLI for safety (plan-then-confirm).</p>
    </footer>
  </div>
</body>
</html>`;
}
