# REQ-023: Fix apply symlink and links

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
**Files:** src/fix/apply.ts, src/fix/apply.test.ts
**Depends on:** REQ-022

## Task

Apply selected FixActions: write symlinks, append instruction link blocks, update map.yml; refuse destructive deletes and skill tree copies.

## Context

Clarification symlink-to-hub; design out-of-scope list.

## Acceptance Criteria

- [ ] Symlink action creates link from agent expected path to hub when safe (no overwrite of non-empty non-link dir without explicit force flag default off)
- [ ] Link-block append is idempotent (second apply does not duplicate block)
- [ ] Copy-tree actions are rejected if ever present
- [ ] Temp-dir tests prove apply + re-check path

## Verification Steps

1. **test** npm test -- src/fix/apply
   - Expected: Apply fixture tests pass

## Integration

**Reachability:** fix command after confirm

**Data dependencies:** Project and agent home files under test home

**Service dependencies:** plan builder

