# REQ-023: Fix apply symlink and links


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-021
**Closure proof:** checkpoint_log:passed commit:7838f0d verification:npm test -- src/fix/apply (15 passed)
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/fix/apply.ts, src/fix/apply.test.ts
**Depends on:** REQ-022

## Task

Apply selected FixActions: write symlinks, append instruction link blocks, update map.yml; refuse destructive deletes and skill tree copies.

## Context

Clarification symlink-to-hub; design out-of-scope list.

## Acceptance Criteria

- [x] Symlink action creates link from agent expected path to hub when safe (no overwrite of non-empty non-link dir without explicit force flag default off)
- [x] Link-block append is idempotent (second apply does not duplicate block)
- [x] Copy-tree actions are rejected if ever present
- [x] Temp-dir tests prove apply + re-check path

## Verification Steps

1. **test** npm test -- src/fix/apply
   - Expected: Apply fixture tests pass

## Integration

**Reachability:** fix command after confirm

**Data dependencies:** Project and agent home files under test home

**Service dependencies:** plan builder

## Outputs

- src/fix/apply.ts — applyFixPlan — force flag, empty-dir safe symlink, non-empty skip unless force, marker-aware link idempotency
- src/fix/apply.test.ts — 15 fixture tests covering REQ-023 ACs (force, idempotent link, copy reject, apply+re-check)
