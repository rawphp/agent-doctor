# REQ-031: Fix plan for hierarchy findings

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.85479
**Claimed at:** 2026-07-15T10:12:56Z
**Heartbeat:** 2026-07-15T10:12:56Z
<!-- claimed-end -->

**UR:** UR-002
**Status:** in-progress
**Created:** 2026-07-15
**Layer:** engine
**Entry point:**
**Terminal state:**
**Parent:** REQ-030
**Closure proof:**
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

- [ ] `instructions.missing_agents_md` → plan action to create minimal stub at project root AGENTS.md
- [ ] `instructions.missing_agents_pointer` → plan append pointer to target instruction file
- [ ] Actions listed in dry-run format output
- [ ] Tests for both finding → action mappings; rejected if projectRoot missing

## Verification Steps

1. **test** `npm test -- src/fix/plan`
   - Expected: pass
2. **test** `npm test`
   - Expected: full suite green

## Integration

**Reachability:** `buildFixPlan` from fix command.

**Data dependencies:** Findings array, projectRoot.

**Service dependencies:** `SAFE_FIX_KINDS`, existing append action patterns.
