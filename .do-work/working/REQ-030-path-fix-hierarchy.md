# REQ-030: Path — Plan and apply hierarchy fixes

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.40397
**Claimed at:** 2026-07-15T09:48:30Z
**Heartbeat:** 2026-07-15T09:48:30Z
<!-- claimed-end -->

**UR:** UR-002
**Status:** in-progress
**Created:** 2026-07-15
**Layer:** none
**Entry point:** `agent-doctor fix --dry-run` then `agent-doctor fix` / `--yes` with project hierarchy findings
**Terminal state:** Dry-run lists create-AGENTS-stub and append-pointer actions; apply creates minimal stub and append-only pointer blocks; re-status shows hierarchy findings cleared for those items
**Parent:**
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/fix/plan.ts, src/fix/apply.ts, src/fix/plan.test.ts, src/fix/apply.test.ts
**Depends on:** REQ-026

## Task

Close plan-then-apply for hierarchy: never invent project policy beyond minimal AGENTS.md stub; append-only pointers; consent gates unchanged.

## Context

Clarification: diagnose + plan + apply; minimal stub only; no wholesale CLAUDE rewrite.

## Acceptance Criteria

- [ ] Dry-run emits plan steps for missing AGENTS.md and missing pointers
- [ ] Apply creates stub / appends pointer without deleting existing vendor body
- [ ] Apply still requires confirm / `--yes`; dry-run never writes

## Verification Steps

1. **test** `npm test -- src/fix`
   - Expected: hierarchy plan/apply tests pass
2. **runtime** dry-run then apply on temp fixture via tests
   - Expected: covered by unit/integration tests

## Integration

**Reachability:** `src/commands/fix.ts` → `buildFixPlan` / `applyFixPlan`.

**Data dependencies:** Hierarchy findings from instructions domain.

**Service dependencies:** `src/fix/plan.ts`, `src/fix/apply.ts`.
