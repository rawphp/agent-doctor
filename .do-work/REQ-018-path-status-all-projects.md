# REQ-018: Path status all projects

**UR:** UR-001
**Status:** backlog
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `agent-doctor status --all`
**Terminal state:** Report scope machine includes findings for every project under mapped projects.roots with no hard project-count cap in v1
**Parent:** 
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/engine/run-checks.ts, src/commands/status.ts
**Depends on:** REQ-015, REQ-017

## Task

Path-unit for machine-wide multi-project status. Walk all mapped project roots (clarification: no limit v1).

## Context

Design §4 --all; clarification no limit.

## Acceptance Criteria

- [ ] scope machine enumerates projects under map.projects.roots
- [ ] Per-project instruction/product findings appear with project path in evidence
- [ ] No artificial max project count in v1 code paths

## Verification Steps

1. **test** npm test -- src/engine/run-checks --grep machine
   - Expected: Machine scope fixture with multiple projects passes

## Manual checks (advisory)

- [ ] Action: Map a large projects root and run status --all — Observable outcome: completes or shows partial errors without silent truncation

