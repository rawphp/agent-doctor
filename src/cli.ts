#!/usr/bin/env node
/**
 * Agent Doctor CLI entrypoint.
 * v1 commands (design §5): init, map, status, dashboard, fix, agents, check
 */

import { runInitCommand } from "./commands/init.js";
import { runMapCommand } from "./commands/map.js";
import { runStatus } from "./commands/status.js";
import { runFix } from "./commands/fix.js";

const V1_COMMANDS = [
  { name: "init", description: "Discover environment and write the home map" },
  { name: "map", description: "Inspect or update the agent/home map" },
  { name: "status", description: "Run checks and print terminal status report" },
  {
    name: "dashboard",
    description: "Serve or open the HTML status dashboard",
  },
  { name: "fix", description: "Plan and apply safe setup fixes" },
  { name: "agents", description: "List detected agents and adapter support" },
  { name: "check", description: "Run individual domain checks" },
] as const;

function printHelp(): void {
  const lines = [
    "Usage: agent-doctor <command> [options]",
    "",
    "Diagnose and fix AI-agent project setup (skills hub, adapters, maps).",
    "",
    "Commands:",
    ...V1_COMMANDS.map(
      (cmd) => `  ${cmd.name.padEnd(12)} ${cmd.description}`,
    ),
    "",
    "Options:",
    "  -h, --help            Show help",
    "  -V, --version         Show version",
    "  --yes, --non-interactive  Skip prompts (init/map; safe for CI)",
    "",
  ];
  console.log(lines.join("\n"));
}

function printVersion(): void {
  console.log("0.1.0");
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  const first = args[0];

  if (
    args.length === 0 ||
    first === "--help" ||
    first === "-h" ||
    first === "help"
  ) {
    printHelp();
    return 0;
  }

  if (first === "--version" || first === "-V") {
    printVersion();
    return 0;
  }

  if (first === "init") {
    const result = await runInitCommand({ args: args.slice(1) });
    return result.code;
  }

  if (first === "map") {
    const result = await runMapCommand({ args: args.slice(1) });
    return result.code;
  }

  if (first === "status") {
    const { exitCode } = await runStatus({ args: args.slice(1) });
    return exitCode;
  }

  if (first === "fix") {
    const { exitCode } = await runFix({ args: args.slice(1) });
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
