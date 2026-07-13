# REQ-015: Check engine runChecks


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:** checkpoint_log:passed commit:a822c7e all 1 checkpoints passed (0 deferred); merge:7358e2c
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/engine/run-checks.ts, src/engine/run-checks.test.ts
**Depends on:** REQ-013, REQ-014, REQ-010

## Task

Orchestrate detect adapters → resolve hub → run domains → score → Report for scope hybrid|machine. Handle missing map with one-shot discover + soft warn. Permission errors become access.denied findings.

## Context

Design §11 data flow.

## Acceptance Criteria

- [x] runChecks({scope:'hybrid', projectRoot, home}) returns full Report
- [x] Missing map does not throw; report includes recommendation to run init
- [x] access.denied on a path does not abort entire report
- [x] agents_in_scope excludes ignored agents

## Verification Steps

1. **test** npm test -- src/engine/run-checks
   - Expected: Engine integration fixture tests pass

## Integration

**Reachability:** status, dashboard, fix, check commands

**Data dependencies:** map + FS

**Service dependencies:** domains + adapters + score

## Outputs

- src/engine/run-checks.ts — Full check engine: map/discover, adapters, hub, domain suite, score, Report
- src/engine/run-checks.test.ts — Engine integration tests for full Report, missing map, access.denied, agents_in_scope

