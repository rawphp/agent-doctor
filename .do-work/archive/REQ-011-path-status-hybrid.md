# REQ-011: Path status hybrid


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `agent-doctor status` (default, no --all)
**Terminal state:** Terminal dashboard shows overall grade, sync matrix for all non-ignored detected agents, domain lines, top recommendations; exit 0/1/2 by grade; cannot be green if skills desync or multi-hub conflict without sync_target
**Parent:** 
**Closure proof:** checkpoint_log:passed commit:d20be5f all 2 verification checkpoints passed (0 deferred); merged:dea4023
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** L
**Files:** src/commands/status.ts, src/commands/status.test.ts, src/engine/run-checks.ts, src/engine/run-checks.test.ts, src/engine/score.ts, src/engine/score.test.ts, src/surfaces/terminal.ts, src/surfaces/terminal.test.ts, src/cli.ts, fixtures/homes/hybrid/map.yml
**Depends on:** REQ-002, REQ-003, REQ-004

## Task

Path-unit for default hybrid status: cwd project + global fleet/skills/vaults live check rendered in terminal.

## Context

Design §4 hybrid scope; clarification cannot-be-green on desync; sync matrix UX from design §10.

## Acceptance Criteria

- [x] status without flags uses scope hybrid
- [x] Output includes overall score/grade and per-agent hub alignment matrix
- [x] Exit code 0 green, 1 yellow, 2 red, 3 tool error
- [x] If any non-ignored first-class agent off skills hub or unresolved multi-hub conflict, overall.grade is never green
- [x] status --json prints Report JSON matching engine types

## Verification Steps

1. **test** npm test -- src/commands/status src/engine src/surfaces/terminal
   - Expected: Status and scoring tests pass

2. **runtime** AGENT_DOCTOR_HOME=fixtures/homes/hybrid npx tsx src/cli.ts status --json
   - Expected: JSON parseable Report with scope hybrid

## Manual checks (advisory)

- [ ] Action: Run agent-doctor status in a real project with multi-agent install — Observable outcome: matrix lists all detected agents, not only one default

## Outputs

- src/commands/status.ts — status CLI path-unit (flags, runChecks, terminal/JSON, exit codes)
- src/commands/status.test.ts — status command tests for hybrid, matrix, JSON, exit codes
- src/engine/run-checks.ts — hybrid/machine check engine producing Report + hub alignment
- src/engine/run-checks.test.ts — runChecks tests including cannot-be-green on desync/conflict
- src/engine/score.ts — score→grade, desync cap, exit code helpers
- src/engine/score.test.ts — scoring and desync-cap unit tests
- src/surfaces/terminal.ts — terminal dashboard (overall, sync matrix, domains, recs)
- src/surfaces/terminal.test.ts — terminal format tests
- src/cli.ts — wires agent-doctor status to runStatus
- fixtures/homes/hybrid/map.yml — AGENT_DOCTOR_HOME fixture for status --json runtime verify
