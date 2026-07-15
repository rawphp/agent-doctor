# REQ-032: Fix apply for hierarchy stub and pointers


**UR:** UR-002
**Status:** done
**Created:** 2026-07-15
**Layer:** engine
**Entry point:**
**Terminal state:**
**Parent:** REQ-030
**Closure proof:** checkpoint_log:passed commit:7ab833f tests:apply 28 + full 327
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/fix/apply.ts, src/fix/apply.test.ts
**Depends on:** REQ-031

## Task

Implement apply for hierarchy actions: write skill-matching minimal AGENTS.md stub if missing; append pointer block (idempotent if AGENTS.md already referenced). Never overwrite non-empty AGENTS.md; never replace whole CLAUDE.md/GEMINI.md body.

## Context

Clarification: minimal stub only; append-only pointers. Skill pointer examples as template source.

## Acceptance Criteria

- [x] Missing AGENTS.md → file created with minimal stub content (product.md bullet only if product exists or soft wording per skill)
- [x] Existing AGENTS.md non-empty → stub action no-op / applied already
- [x] Pointer append uses marker or clear block; second apply is idempotent
- [x] Tests cover create, skip-existing, append, already-linked

## Verification Steps

1. **test** `npm test -- src/fix/apply`
   - Expected: pass
2. **test** `npm test`
   - Expected: full suite green

## Integration

**Reachability:** `applyFixPlan` switch on action.kind.

**Data dependencies:** FixAction target/value paths under project root.

**Service dependencies:** `fs` write/append; existing product link block helpers as pattern.

## Outputs

- src/fix/apply.ts — create_agents_stub hardening
- src/fix/apply.test.ts — REQ-032 AC tests
