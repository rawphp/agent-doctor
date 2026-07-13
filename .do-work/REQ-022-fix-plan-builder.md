# REQ-022: Fix plan builder

**UR:** UR-001
**Status:** backlog
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-021
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/fix/plan.ts, src/fix/plan.test.ts
**Depends on:** REQ-015, REQ-007, REQ-008, REQ-009

## Task

Build FixAction[] from findings via adapter proposeWire* and product/obsidian link recommendations. Block wire actions when hub conflict and no sync_target.

## Context

Design §9 safe actions; conflict needs choice.

## Acceptance Criteria

- [ ] Findings map to stable fix action ids
- [ ] Hub conflict without sync_target yields plan item to set sync_target only, not wire
- [ ] Symlink actions included when adapter proposes them for off-hub agents

## Verification Steps

1. **test** npm test -- src/fix/plan
   - Expected: Plan builder tests pass

## Integration

**Reachability:** fix --dry-run

**Data dependencies:** Report findings

**Service dependencies:** Adapters proposeWire*

