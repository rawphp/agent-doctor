# REQ-017: Status CLI command

**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** cli
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:** checkpoint_log:passed commit:2d5a9d2 all 2 checkpoints passed (0 deferred); merge:cef9494
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/commands/status.ts, src/commands/status.test.ts, src/cli.ts
**Depends on:** REQ-015, REQ-016

## Task

Implement status command: default hybrid, --all machine, --json raw report, set process exit code from grade.

## Context

Design §4–§5; user confirmed hybrid vs --all.

## Acceptance Criteria

- [x] status defaults to hybrid scope
- [x] status --all sets scope machine
- [x] status --json writes Report to stdout without terminal decoration
- [x] process.exitCode matches grade mapping

## Verification Steps

1. **test** npm test -- src/commands/status
   - Expected: Status CLI tests pass

2. **runtime** npx tsx src/cli.ts status --json | head -c 200
   - Expected: Starts with JSON object

## Integration

**Reachability:** agent-doctor status

**Data dependencies:** cwd project root detection

**Service dependencies:** runChecks + terminal surface

## Outputs

- src/commands/status.ts — Status CLI path-unit: hybrid default, --all machine, --json raw Report, process.exitCode from grade
- src/commands/status.test.ts — AC tests for hybrid/--all/--json decoration-free/process.exitCode mapping
- src/cli.ts — Wires agent-doctor status to runStatus and assigns process.exitCode (pre-existing; verified)
