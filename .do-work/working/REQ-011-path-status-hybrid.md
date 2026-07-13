# REQ-011: Path status hybrid

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.16925
**Claimed at:** 2026-07-13T23:08:29Z
**Heartbeat:** 2026-07-13T23:08:29Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `agent-doctor status` (default, no --all)
**Terminal state:** Terminal dashboard shows overall grade, sync matrix for all non-ignored detected agents, domain lines, top recommendations; exit 0/1/2 by grade; cannot be green if skills desync or multi-hub conflict without sync_target
**Parent:** 
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** L
**Files:** src/commands/status.ts, src/engine/, src/surfaces/terminal.ts
**Depends on:** REQ-002, REQ-003, REQ-004

## Task

Path-unit for default hybrid status: cwd project + global fleet/skills/vaults live check rendered in terminal.

## Context

Design §4 hybrid scope; clarification cannot-be-green on desync; sync matrix UX from design §10.

## Acceptance Criteria

- [ ] status without flags uses scope hybrid
- [ ] Output includes overall score/grade and per-agent hub alignment matrix
- [ ] Exit code 0 green, 1 yellow, 2 red, 3 tool error
- [ ] If any non-ignored first-class agent off skills hub or unresolved multi-hub conflict, overall.grade is never green
- [ ] status --json prints Report JSON matching engine types

## Verification Steps

1. **test** npm test -- src/commands/status src/engine src/surfaces/terminal
   - Expected: Status and scoring tests pass

2. **runtime** AGENT_DOCTOR_HOME=fixtures/homes/hybrid npx tsx src/cli.ts status --json
   - Expected: JSON parseable Report with scope hybrid

## Manual checks (advisory)

- [ ] Action: Run agent-doctor status in a real project with multi-agent install — Observable outcome: matrix lists all detected agents, not only one default

