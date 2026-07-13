# REQ-018: Path status all projects

**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `agent-doctor status --all`
**Terminal state:** Report scope machine includes findings for every project under mapped projects.roots with no hard project-count cap in v1
**Parent:** 
**Closure proof:** checkpoint_log:passed commit:1bb2508 all 1 checkpoints passed (0 deferred)
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/engine/run-checks.ts src/engine/run-checks.test.ts src/commands/status.ts src/commands/status.test.ts
**Depends on:** REQ-015, REQ-017

## Task

Path-unit for machine-wide multi-project status. Walk all mapped project roots (clarification: no limit v1).

## Context

Design §4 --all; clarification no limit.

## Acceptance Criteria

- [x] scope machine enumerates projects under map.projects.roots
- [x] Per-project instruction/product findings appear with project path in evidence
- [x] No artificial max project count in v1 code paths

## Verification Steps

1. **test** npm test -- src/engine/run-checks --grep machine
   - Expected: Machine scope fixture with multiple projects passes

## Manual checks (advisory)

- [ ] Action: Map a large projects root and run status --all — Observable outcome: completes or shows partial errors without silent truncation

## Outputs

- src/engine/run-checks.ts — enumerateProjectsUnderRoots + machine multi-project instruction/product domain pass
- src/engine/run-checks.test.ts — Machine multi-project fixtures (enum, product evidence, 30-project no-cap)
- src/commands/status.ts — Document --all machine multi-project walk via runChecks
- src/commands/status.test.ts — status --all multi-project instruction findings test
