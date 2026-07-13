# Project context pack — agent-doctor

Generated for do-work workers. Map, not a copy of the codebase.

## Architecture

Agent Doctor is a Node/TypeScript CLI that diagnoses AI-agent project setup
(skills hub, adapters for Claude Code / Codex / Grok, maps, status, fix).
Layers: `cli`, `engine`, `adapters`, `surfaces`. Design:
`docs/superpowers/specs/2026-07-14-agent-doctor-design.md`.

Flow: init/map → home map → check engine → report → status/dashboard/fix.

## Directory roles

| Path | Role |
|------|------|
| `src/cli.ts` | CLI entry (`tsx` / built `dist/cli.js`) |
| `src/commands/` | init, map, status, fix command handlers |
| `src/adapters/` | Per-provider detect + skills/instructions wiring |
| `src/domains/` | Domain checkers → Finding[] (presence, skills, …) |
| `src/engine/` | types, skills-hub, run-checks, score |
| `src/fix/` | plan builder + apply (symlink, link-block, map updates) |
| `src/map/` | load/save/discover/init map |
| `src/surfaces/` | terminal (and later HTML) rendering |
| `docs/superpowers/specs/` | Design specs |
| `.do-work/` | do-work backlog/working/archive/state |

## Key modules

- `src/engine/types.ts` — Report, Finding, Grade schemas
- `src/engine/run-checks.ts` — orchestrates domain checks → report
- `src/engine/score.ts` — overall score/grade from findings (REQ-014)
- `src/engine/skills-hub.ts` — multi-agent hub resolution
- `src/domains/skills.ts` — skills domain; may emit `skills.agent_not_on_hub`, `skills.hub_conflict`
- `src/domains/index.ts` — domain suite export
- `src/commands/status.ts` — hybrid status path
- `src/commands/fix.ts` — plan-then-apply fix CLI
- `src/fix/plan.ts` — buildFixPlan from findings
- `src/fix/apply.ts` — applyFixPlan (symlink/link/map; never copy trees)
- `src/surfaces/terminal.ts` — terminal status surface

## Naming & test conventions

- TypeScript under `src/`; co-located `*.test.ts`
- Vitest: `npm test` or `npm test -- src/engine/score`
- REQ commits: `feat(REQ-NNN): ...` with REQ/UR/Output footer
- Layer field: cli | engine | adapters | surfaces | none

## How to run the suite

```bash
npm test
npm test -- src/engine/score
npx tsx src/cli.ts --help
```

## Standing decisions

- Layers: cli, engine, adapters, surfaces
- Symlink-to-hub when agent cannot natively share skills path (no content copy)
- Vault path prompt only during init/map; status never interactive-asks
- **Overall grade cannot be green on skills desync or hub conflict**
- status --all has no project-count cap in v1
- Path-units per CLI command; foundation scaffold before init/status
