# REQ-016: Terminal status surface

**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** surfaces
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:** checkpoint_log:passed commit:98e6e94 all 1 checkpoints passed (0 deferred)
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/surfaces/terminal.ts, src/surfaces/terminal.test.ts, src/surfaces/__snapshots__/terminal.test.ts.snap
**Depends on:** REQ-003, REQ-015

## Task

Render Report to human-readable terminal dashboard: overall grade first, domain lines, sync matrix (hub × agents), top recommendations, next commands. Accessible language for non-technical users.

## Context

Design §10 terminal UI; sync-first recommendation style.

## Acceptance Criteria

- [x] Renderer includes overall grade and sync matrix rows for each agents_in_scope entry
- [x] Top recommendations printed from report.recommendations
- [x] Does not re-score; only formats Report fields
- [x] Snapshot or string tests lock key sections

## Verification Steps

1. **test** npm test -- src/surfaces/terminal
   - Expected: Terminal render snapshots/tests pass

## Integration

**Reachability:** status command stdout

**Data dependencies:** Report JSON in memory

**Service dependencies:** runChecks

## Outputs

- src/surfaces/terminal.ts — Terminal Report formatter — overall grade, domains, agents_in_scope sync matrix, recommendations, next commands
- src/surfaces/terminal.test.ts — String + snapshot tests for terminal dashboard sections and no re-score contract
- src/surfaces/__snapshots__/terminal.test.ts.snap — Vitest snapshot locking full hybrid dashboard layout
