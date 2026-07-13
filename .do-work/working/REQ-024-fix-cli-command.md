# REQ-024: Fix CLI command

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.85778
**Claimed at:** 2026-07-13T23:41:24Z
**Heartbeat:** 2026-07-13T23:41:24Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** cli
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-021
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** S
**Files:** src/commands/fix.ts, src/cli.ts
**Depends on:** REQ-022, REQ-023, REQ-015

## Task

Wire fix CLI: --dry-run, interactive confirm, optional --yes for tests, print plan and post-apply grade.

## Context

Plan-then-apply policy.

## Acceptance Criteria

- [ ] fix --dry-run never mutates project files outside AGENT_DOCTOR_HOME map optional updates only if explicitly designed; prefer zero writes on dry-run
- [ ] fix without --yes prompts confirm
- [ ] fix --yes applies all safe plan items in fixtures

## Verification Steps

1. **test** npm test -- src/commands/fix
   - Expected: Fix CLI tests pass

## Integration

**Reachability:** agent-doctor fix

**Data dependencies:** Report + fix_plan

**Service dependencies:** plan + apply + runChecks

