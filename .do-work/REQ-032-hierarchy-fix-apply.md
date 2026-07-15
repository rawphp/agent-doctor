# REQ-032: Fix apply for hierarchy stub and pointers

**UR:** UR-002
**Status:** backlog
**Created:** 2026-07-15
**Layer:** engine
**Entry point:**
**Terminal state:**
**Parent:** REQ-030
**Closure proof:**
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

- [ ] Missing AGENTS.md → file created with minimal stub content (product.md bullet only if product exists or soft wording per skill)
- [ ] Existing AGENTS.md non-empty → stub action no-op / applied already
- [ ] Pointer append uses marker or clear block; second apply is idempotent
- [ ] Tests cover create, skip-existing, append, already-linked

## Verification Steps

1. **test** `npm test -- src/fix/apply`
   - Expected: pass
2. **test** `npm test`
   - Expected: full suite green

## Integration

**Reachability:** `applyFixPlan` switch on action.kind.

**Data dependencies:** FixAction target/value paths under project root.

**Service dependencies:** `fs` write/append; existing product link block helpers as pattern.
