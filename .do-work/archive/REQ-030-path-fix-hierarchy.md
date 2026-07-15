# REQ-030: Path — Plan and apply hierarchy fixes


**UR:** UR-002
**Status:** done
**Created:** 2026-07-15
**Layer:** none
**Entry point:** `agent-doctor fix --dry-run` then `agent-doctor fix` / `--yes` with project hierarchy findings
**Terminal state:** Dry-run lists create-AGENTS-stub and append-pointer actions; apply creates minimal stub and append-only pointer blocks; re-status shows hierarchy findings cleared for those items
**Parent:**
**Closure proof:** checkpoint_log:passed commit:3e23a83 tests:npm test -- src/fix (42 passed) + src/commands/fix (12 passed)
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

- [x] Dry-run emits plan steps for missing AGENTS.md and missing pointers
- [x] Apply creates stub / appends pointer without deleting existing vendor body
- [x] Apply still requires confirm / `--yes`; dry-run never writes

## Verification Steps

1. **test** `npm test -- src/fix`
   - Expected: hierarchy plan/apply tests pass
2. **runtime** dry-run then apply on temp fixture via tests
   - Expected: covered by unit/integration tests

## Integration

**Reachability:** `src/commands/fix.ts` → `buildFixPlan` / `applyFixPlan`.

**Data dependencies:** Hierarchy findings from instructions domain.

**Service dependencies:** `src/fix/plan.ts`, `src/fix/apply.ts`.

## Outputs

- src/fix/plan.ts — hierarchyActionsFromFindings + create_agents_stub / append_agents_pointer
- src/fix/apply.ts — apply create_agents_stub and append_agents_pointer
- src/fix/plan.test.ts — hierarchy plan dry-run tests
- src/fix/apply.test.ts — hierarchy apply tests
