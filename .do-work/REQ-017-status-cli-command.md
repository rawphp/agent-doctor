# REQ-017: Status CLI command

**UR:** UR-001
**Status:** backlog
**Created:** 2026-07-14
**Layer:** cli
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/commands/status.ts, src/cli.ts
**Depends on:** REQ-015, REQ-016

## Task

Implement status command: default hybrid, --all machine, --json raw report, set process exit code from grade.

## Context

Design §4–§5; user confirmed hybrid vs --all.

## Acceptance Criteria

- [ ] status defaults to hybrid scope
- [ ] status --all sets scope machine
- [ ] status --json writes Report to stdout without terminal decoration
- [ ] process.exitCode matches grade mapping

## Verification Steps

1. **test** npm test -- src/commands/status
   - Expected: Status CLI tests pass

2. **runtime** npx tsx src/cli.ts status --json | head -c 200
   - Expected: Starts with JSON object

## Integration

**Reachability:** agent-doctor status

**Data dependencies:** cwd project root detection

**Service dependencies:** runChecks + terminal surface

