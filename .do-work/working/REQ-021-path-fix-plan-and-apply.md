# REQ-021: Path fix plan and apply

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.51661
**Claimed at:** 2026-07-13T23:27:27Z
**Heartbeat:** 2026-07-13T23:27:27Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `agent-doctor fix --dry-run` then `agent-doctor fix`
**Terminal state:** Dry-run prints fix plan; fix with confirm applies safe actions (instruction links, map updates, symlinks to hub) then re-checks; never content-copies skill trees; no silent hub pick when conflict
**Parent:** 
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** L
**Files:** src/commands/fix.ts, src/fix/
**Depends on:** REQ-011, REQ-015

## Task

Path-unit for plan-then-apply repair of sync drift.

## Context

Design §9; symlink clarification; no copy.

## Acceptance Criteria

- [ ] fix --dry-run emits fix_plan without writing user project files
- [ ] fix shows plan and requires confirmation before apply
- [ ] Supported actions: append link blocks, set map.sync_target, create symlink to hub when adapter proposed
- [ ] Never copies skill directory trees
- [ ] After apply, re-runs checks and prints new grade
- [ ] Partial failure skips conflicting file and continues

## Verification Steps

1. **test** npm test -- src/fix src/commands/fix
   - Expected: Fix plan/apply fixture tests pass

## Manual checks (advisory)

- [ ] Action: dry-run then fix on a disposable fixture home — Observable outcome: symlink or links created; skills not duplicated as copies

