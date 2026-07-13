# REQ-016: Terminal status surface

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.50317
**Claimed at:** 2026-07-13T23:27:06Z
**Heartbeat:** 2026-07-13T23:27:06Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** surfaces
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/surfaces/terminal.ts, src/surfaces/terminal.test.ts
**Depends on:** REQ-003, REQ-015

## Task

Render Report to human-readable terminal dashboard: overall grade first, domain lines, sync matrix (hub × agents), top recommendations, next commands. Accessible language for non-technical users.

## Context

Design §10 terminal UI; sync-first recommendation style.

## Acceptance Criteria

- [ ] Renderer includes overall grade and sync matrix rows for each agents_in_scope entry
- [ ] Top recommendations printed from report.recommendations
- [ ] Does not re-score; only formats Report fields
- [ ] Snapshot or string tests lock key sections

## Verification Steps

1. **test** npm test -- src/surfaces/terminal
   - Expected: Terminal render snapshots/tests pass

## Integration

**Reachability:** status command stdout

**Data dependencies:** Report JSON in memory

**Service dependencies:** runChecks

