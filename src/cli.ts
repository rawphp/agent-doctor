#!/usr/bin/env node
/**
 * Agent Doctor CLI entrypoint.
 * v1 commands (design §5): init, map, status, dashboard, fix, agents, check
 */

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
    "  -h, --help     Show help",
    "  -V, --version  Show version",
    "",
  ];
  console.log(lines.join("\n"));
}

function printVersion(): void {
  console.log("0.1.0");
}

function main(argv: string[]): number {
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

const exitCode = main(process.argv);
process.exitCode = exitCode;
