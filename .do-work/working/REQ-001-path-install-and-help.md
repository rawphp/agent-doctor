# REQ-001: Path install and help

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.55939
**Claimed at:** 2026-07-13T22:41:32Z
**Heartbeat:** 2026-07-13T22:41:32Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `npx agent-doctor --help` or `node dist/cli.js --help` after install
**Terminal state:** CLI prints usage listing init, map, status, dashboard, fix, agents, check; exit 0
**Parent:** 
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** S
**Files:** package.json, src/cli.ts, README.md
**Depends on:** 

## Task

Define the runnable Agent Doctor package so users can invoke the CLI and see command help. This path-unit owns install→help closure; child REQs implement scaffold and CLI wiring.

## Context

Design §5 commands and §14 layout. Success criteria: easy to run for developers and non-technical users via npx/Node.

## Acceptance Criteria

- [ ] Running the package entrypoint with --help exits 0 and lists all v1 commands from the design (init, map, status, dashboard, fix, agents, check)
- [ ] Package metadata names the binary agent-doctor

## Verification Steps

1. **test** npm test -- --run 2>/dev/null || npm test
   - Expected: Test suite for scaffold/help passes

2. **runtime** node --import tsx src/cli.ts --help 2>/dev/null || npx tsx src/cli.ts --help
   - Expected: Help text includes status, init, dashboard, fix

## Manual checks (advisory)

- [ ] Action: From a clean shell, follow README install and run agent-doctor --help — Observable outcome: same command list as design §5

