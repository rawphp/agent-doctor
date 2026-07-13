# REQ-019: Path dashboard HTML

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.85479
**Claimed at:** 2026-07-13T23:41:19Z
**Heartbeat:** 2026-07-13T23:41:19Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `agent-doctor dashboard`
**Terminal state:** Local loopback server serves HTML dashboard of the same Report; browser can open URL; apply remains CLI-only
**Parent:** 
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/commands/dashboard.ts, src/surfaces/dashboard/
**Depends on:** REQ-015, REQ-017

## Task

Path-unit for HTML dashboard viewing sync health from the same report engine.

## Context

Design §10 HTML; dual surface approach 1.

## Acceptance Criteria

- [ ] dashboard runs checks (or accepts last report) and serves HTML on 127.0.0.1
- [ ] HTML shows overall grade, sync matrix, findings
- [ ] Port conflict tries next port or --port; URL printed
- [ ] No apply/fix mutation from the HTML UI in v1

## Verification Steps

1. **test** npm test -- src/surfaces/dashboard src/commands/dashboard
   - Expected: Dashboard tests pass

2. **runtime** npx tsx src/cli.ts dashboard --port 0 --no-open & sleep 1; curl -s $URL | head
   - Expected: HTML contains grade or Agent Doctor title

