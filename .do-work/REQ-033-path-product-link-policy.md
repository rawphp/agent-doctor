# REQ-033: Path — Product link policy with hierarchy

**UR:** UR-002
**Status:** backlog
**Created:** 2026-07-15
**Layer:** none
**Entry point:** `agent-doctor status` / `check product` when product.md exists under hierarchy-aware project
**Terminal state:** Product links required on AGENTS.md and any non-pointer instruction files; pure pointer files not required to link product.md directly
**Parent:**
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/domains/product.ts, src/domains/product.test.ts, src/fix/plan.ts
**Depends on:** REQ-026

## Task

Align product domain and fix product-link plans with skill policy: AGENTS.md is the primary product surface; thin pointer files are exempt from product.missing_link if they only delegate to AGENTS.md.

## Context

Clarification: AGENTS.md plus any non-pointer instruction file. Avoid dual requirement of product blocks on every CLAUDE.md that is only a pointer.

## Acceptance Criteria

- [ ] When AGENTS.md exists and lacks product link → finding
- [ ] Pure pointer vendor file (references AGENTS.md, no substantial extra body beyond pointer/stub) → no product.missing_link for that file
- [ ] Vendor file with unique body (non-pointer) → still requires product link if product.md exists
- [ ] Fix plan appends product links to the correct targets only

## Verification Steps

1. **test** `npm test -- src/domains/product src/fix/plan`
   - Expected: pass
2. **test** `npm test`
   - Expected: full suite green

## Integration

**Reachability:** product domain in `runChecks`; plan from product.missing_link.

**Data dependencies:** product.md presence, instruction file contents.

**Service dependencies:** `src/domains/product.ts`, instructions hierarchy helpers if shared.
