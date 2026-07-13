# REQ-021: Path fix plan and apply

**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `agent-doctor fix --dry-run` then `agent-doctor fix`
**Terminal state:** Dry-run prints fix plan; fix with confirm applies safe actions (instruction links, map updates, symlinks to hub) then re-checks; never content-copies skill trees; no silent hub pick when conflict
**Parent:** 
**Closure proof:** checkpoint_log:passed commit:5ee1cae verification:npm test -- src/fix src/commands/fix (28 passed after merge with REQ-022)
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** L
**Files:** src/commands/fix.ts, src/fix/, src/cli.ts, src/engine/types.ts
**Depends on:** REQ-011, REQ-015

## Task

Path-unit for plan-then-apply repair of sync drift.

## Context

Design §9; symlink clarification; no copy.

## Acceptance Criteria

- [x] fix --dry-run emits fix_plan without writing user project files
- [x] fix shows plan and requires confirmation before apply
- [x] Supported actions: append link blocks, set map.sync_target, create symlink to hub when adapter proposed
- [x] Never copies skill directory trees
- [x] After apply, re-runs checks and prints new grade
- [x] Partial failure skips conflicting file and continues

## Verification Steps

1. **test** npm test -- src/fix src/commands/fix
   - Expected: Fix plan/apply fixture tests pass

## Manual checks (advisory)

- [ ] Action: dry-run then fix on a disposable fixture home — Observable outcome: symlink or links created; skills not duplicated as copies

## Outputs

- src/commands/fix.ts — CLI fix command — dry-run, confirm/--yes, apply, re-check grade
- src/commands/fix.test.ts — Command-level fixture tests for fix path
- src/fix/plan.ts — buildFixPlan (findings + report overloads), formatFixPlan, reject copy
- src/fix/plan.test.ts — Plan builder unit tests (REQ-021 + REQ-022)
- src/fix/apply.ts — applyFixPlan — symlink, append link, set map sync_target; skip conflicts
- src/fix/apply.test.ts — Apply layer unit tests with temp dirs
- src/fix/index.ts — Fix module barrel exports
- src/cli.ts — Wire agent-doctor fix into CLI entry
- src/engine/types.ts — Optional FixAction.value for hub/link/sync_target payload
