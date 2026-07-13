# Agent Doctor

CLI that diagnoses AI-agent project setup (skills hub, adapters for Claude Code / Codex / Grok, maps, status, and fixes).

## Requirements

- Node.js 20+

## Install / run

```bash
# From this repo (development)
npm install
npx tsx src/cli.ts --help

# After build
npm run build
node dist/cli.js --help

# Binary name (package bin)
npx agent-doctor --help
```

## Commands (v1)

| Command     | Purpose                                              |
| ----------- | ---------------------------------------------------- |
| `init`      | Discover environment and write the home map          |
| `map`       | Inspect or update the agent/home map                 |
| `status`    | Run checks and print terminal status report          |
| `dashboard` | Serve or open the HTML status dashboard              |
| `fix`       | Plan and apply safe setup fixes                      |
| `agents`    | List detected agents and adapter support             |
| `check`     | Run individual domain checks                         |

Command bodies land in follow-up work; this package currently exposes install metadata and `--help`.

## Development

```bash
npm test
npm run build
```

## License

MIT
