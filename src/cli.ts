#!/usr/bin/env node
/**
 * Agent Doctor CLI entrypoint.
 * v1 commands (design §5): init, map, status, dashboard, fix, agents, check
 */

import { runInitCommand } from './commands/init.js';
import { runMapCommand } from './commands/map.js';
import { runStatus } from './commands/status.js';
import { runDashboard } from './commands/dashboard.js';
import { runFix } from './commands/fix.js';
import { runAgents } from './commands/agents.js';
import { runCheck } from './commands/check.js';

const V1_COMMANDS = [
  { name: 'init', description: 'Discover environment and write the home map' },
  { name: 'map', description: 'Inspect or update the agent/home map' },
  { name: 'status', description: 'Run checks and print terminal status report' },
  {
    name: 'dashboard',
    description: 'Serve or open the HTML status dashboard',
  },
  { name: 'fix', description: 'Plan and apply safe setup fixes' },
  { name: 'agents', description: 'List detected agents and adapter support' },
  { name: 'check', description: 'Run individual domain checks' },
] as const;

type CommandName = (typeof V1_COMMANDS)[number]['name'];

function wantsHelp(args: string[]): boolean {
  return args.some((a) => a === '--help' || a === '-h');
}

function printHelp(): void {
  const lines = [
    'Usage: agent-doctor <command> [options]',
    '',
    'Diagnose and fix AI-agent project setup (skills hub, adapters, maps).',
    '',
    'Commands:',
    ...V1_COMMANDS.map((cmd) => `  ${cmd.name.padEnd(12)} ${cmd.description}`),
    '',
    'Options:',
    '  -h, --help            Show help',
    '  -V, --version         Show version',
    '  --yes, --non-interactive  Skip prompts (init/map/fix; safe for CI)',
    '',
    'Fix options:',
    '  --dry-run             Print fix plan without writing files',
    '  --yes                 Apply without interactive confirmation',
    '  --sync-target <path>  Explicit skills hub when hubs conflict',
    '',
    'Run agent-doctor <command> --help for command-specific options.',
    '',
  ];
  console.log(lines.join('\n'));
}

function printCommandHelp(command: CommandName): void {
  const common = [
    '',
    'Global:',
    '  -h, --help     Show this help (does not run the command)',
    '',
  ];

  const bodies: Record<CommandName, string[]> = {
    init: [
      'Usage: agent-doctor init [options]',
      '',
      'Discover agents, skills roots, vaults, and project roots; write the home map.',
      '',
      'Options:',
      '  --yes, --non-interactive  Skip vault path prompts (CI-safe)',
    ],
    map: [
      'Usage: agent-doctor map [options]',
      '',
      'Refresh discovery fields in the home map (preserves sync_target / ignored).',
      '',
      'Options:',
      '  --vault <path>            Set the Obsidian vault (writes map.yml; source: manual)',
      '  --yes, --non-interactive  Skip prompts',
      '',
      'Examples:',
      '  agent-doctor map --vault ~/EA/cowork/meaning-of-life',
      '  agent-doctor map --vault "/Users/you/Documents/My Vault"',
    ],
    status: [
      'Usage: agent-doctor status [options]',
      '',
      'Run sync health checks and print a terminal report (default: hybrid scope).',
      '',
      'Options:',
      '  --all      Machine view: every project under mapped project roots',
      '  --json     Print Report JSON instead of the terminal dashboard',
    ],
    dashboard: [
      'Usage: agent-doctor dashboard [options]',
      '',
      'Run checks and serve a read-only HTML dashboard on loopback.',
      'Apply stays in the CLI (agent-doctor fix) — the dashboard never mutates.',
      '',
      'Options:',
      '  --all              Machine scope (same as status --all)',
      '  --no-open          Do not auto-open a browser',
      '  --port <n>         Preferred port (default 4173; retries on EADDRINUSE)',
      '  --port=0           Bind an ephemeral free port',
      '',
      'Stop the server with Ctrl+C (SIGINT).',
    ],
    fix: [
      'Usage: agent-doctor fix [options]',
      '',
      'Build a plan from findings; optionally apply safe wiring (plan-then-apply).',
      '',
      'Options:',
      '  --dry-run               Print plan only (no writes)',
      '  --html                  Open plan in the browser (read-only preview)',
      '  --no-open               With --html, print URL only (do not open browser)',
      '  --yes, --non-interactive  Apply without interactive confirmation',
      '  --sync-target <path>    Choose skills hub when multiple roots conflict',
      '',
      'Examples:',
      '  agent-doctor fix --dry-run --sync-target ~/.agents/skills',
      '  agent-doctor fix --dry-run --sync-target ~/.agents/skills --html',
      '  agent-doctor fix --yes --sync-target ~/.agents/skills',
    ],
    agents: [
      'Usage: agent-doctor agents',
      '',
      'List detected agents and adapter support depth (full | presence).',
    ],
    check: [
      'Usage: agent-doctor check [domain] [options]',
      '',
      'Run one domain (or a filtered check) and print findings.',
      '',
      'Domains: presence, skills, instructions, product, obsidian, consistency',
      '',
      'Options:',
      '  --json     Machine-readable output',
    ],
  };

  console.log([...bodies[command], ...common].join('\n'));
}

function printVersion(): void {
  console.log('0.1.0');
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  const first = args[0];

  if (args.length === 0 || first === '--help' || first === '-h' || first === 'help') {
    printHelp();
    return 0;
  }

  if (first === '--version' || first === '-V') {
    printVersion();
    return 0;
  }

  const rest = args.slice(1);

  // Subcommand --help / -h never runs the command.
  if (
    first &&
    V1_COMMANDS.some((c) => c.name === first) &&
    wantsHelp(rest)
  ) {
    printCommandHelp(first as CommandName);
    return 0;
  }

  if (first === 'init') {
    const result = await runInitCommand({ args: rest });
    return result.code;
  }

  if (first === 'map') {
    const result = await runMapCommand({ args: rest });
    return result.code;
  }

  if (first === 'status') {
    const { exitCode } = await runStatus({ args: rest });
    return exitCode;
  }

  if (first === 'dashboard') {
    const { exitCode } = await runDashboard({ args: rest });
    // Ensure the process leaves after Ctrl+C shutdown (no leftover handles).
    process.exit(exitCode);
  }

  if (first === 'fix') {
    const { exitCode } = await runFix({ args: rest });
    return exitCode;
  }

  if (first === 'agents') {
    const { exitCode } = await runAgents({ args: rest });
    return exitCode;
  }

  if (first === 'check') {
    const { exitCode } = await runCheck({ args: rest });
    return exitCode;
  }

  const known = V1_COMMANDS.some((c) => c.name === first);
  if (known) {
    console.error(
      `agent-doctor: command '${first}' is not implemented yet. Run agent-doctor --help for usage.`,
    );
    return 1;
  }

  console.error(`agent-doctor: unknown command '${first}'.`);
  printHelp();
  return 1;
}

main(process.argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`agent-doctor: ${message}`);
    process.exitCode = 1;
  });
