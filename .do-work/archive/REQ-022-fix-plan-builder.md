# REQ-022: Fix plan builder


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-021
**Closure proof:** checkpoint:.do-work/runs#REQ-022 commit:3344a29 tests:passed
**Priority:** 2
**Size:** M
**Files:** src/fix/plan.ts, src/fix/plan.test.ts
**Depends on:** REQ-015, REQ-007, REQ-008, REQ-009

## Task

Build FixAction[] from findings via adapter proposeWire* and product/obsidian link recommendations. Block wire actions when hub conflict and no sync_target.

## Context

Design §9 safe actions; conflict needs choice.

## Acceptance Criteria

- [x] Findings map to stable fix action ids
- [x] Hub conflict without sync_target yields plan item to set sync_target only, not wire
- [x] Symlink actions included when adapter proposes them for off-hub agents

## Verification Steps

1. **test** npm test -- src/fix/plan
   - Expected: Plan builder tests pass

## Integration

**Reachability:** fix --dry-run

**Data dependencies:** Report findings

**Service dependencies:** Adapters proposeWire*

## Outputs

- src/fix/plan.ts — buildFixPlan — findings to FixAction[] via adapters; blocks wire on hub conflict without sync_target
- src/fix/plan.test.ts — Unit tests for stable ids, hub-conflict gate, and symlink proposals

