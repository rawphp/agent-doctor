#!/usr/bin/env node
/**
 * Agent Doctor CLI entrypoint.
 * v1 commands (design §5): init, map, status, dashboard, fix, agents, check
 */

import { runInit, runMap } from "./map/init.js";
import { mapPath } from "./map/load.js";
import type { HomeMap } from "./engine/types.js";

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
    "  --non-interactive  Skip prompts (init only)",
    "",
  ];
  console.log(lines.join("\n"));
}

function printVersion(): void {
  console.log("0.1.0");
}

function summarizeMap(map: HomeMap, path: string, mode: "init" | "map"): void {
  const verb = mode === "init" ? "Wrote" : "Refreshed";
  console.log(`${verb} home map: ${path}`);
  console.log(`  version: ${map.version}`);
  console.log(`  agents: ${map.agents.map((a) => a.id).join(", ") || "(none)"}`);
  console.log(
    `  skills roots: ${map.skills.global_roots.length} candidate(s)`,
  );
  console.log(`  vaults: ${map.vaults.length}`);
  console.log(`  project roots: ${map.projects.roots.length}`);
  if (map.skills.sync_target) {
    console.log(`  sync_target: ${map.skills.sync_target}`);
  } else if (map.skills.global_roots.length > 1) {
    console.log("  sync_target: (unresolved — multiple hubs)");
  }
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
    const nonInteractive = args.includes("--non-interactive");
    const map = await runInit({ nonInteractive });
    summarizeMap(map, mapPath(), "init");
    return 0;
  }

  if (first === "map") {
    const map = await runMap();
    summarizeMap(map, mapPath(), "map");
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

main(process.argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`agent-doctor: ${message}`);
    process.exitCode = 1;
  });
