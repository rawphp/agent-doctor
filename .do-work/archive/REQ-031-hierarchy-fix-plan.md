# REQ-031: Fix plan for hierarchy findings


**UR:** UR-002
**Status:** done
**Created:** 2026-07-15
**Layer:** engine
**Entry point:**
**Terminal state:**
**Parent:** REQ-030
**Closure proof:** checkpoint_log:passed commit:827ae74 tests:src/fix/plan (28) + full suite (315)
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/fix/plan.ts, src/fix/plan.test.ts, src/engine/types.ts
**Depends on:** REQ-027, REQ-030

## Task

Map hierarchy findings to safe FixAction kinds: create minimal AGENTS.md stub; append AGENTS.md pointer block to vendor files. Stable action ids. No hub invention; no content-copy kinds.

## Context

Reuse `append_instruction_link` / new kind e.g. `create_agents_stub` if needed; SAFE_FIX_KINDS update.

## Acceptance Criteria

- [x] `instructions.missing_agents_md` → plan action to create minimal stub at project root AGENTS.md
- [x] `instructions.missing_agents_pointer` → plan append pointer to target instruction file
- [x] Actions listed in dry-run format output
- [x] Tests for both finding → action mappings; rejected if projectRoot missing

## Verification Steps

1. **test** `npm test -- src/fix/plan`
   - Expected: pass
2. **test** `npm test`
   - Expected: full suite green

## Integration

**Reachability:** `buildFixPlan` from fix command.

**Data dependencies:** Findings array, projectRoot.

**Service dependencies:** `SAFE_FIX_KINDS`, existing append action patterns.

## Outputs

- src/fix/plan.ts — AC alias hierarchy findings + projectRoot gate
- src/fix/plan.test.ts — REQ-031 edge coverage
- src/engine/types.ts — HIERARCHY_PLAN_FINDING_IDS
