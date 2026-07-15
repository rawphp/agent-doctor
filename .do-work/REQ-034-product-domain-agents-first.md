# REQ-034: Product domain AGENTS-first + non-pointer

**UR:** UR-002
**Status:** backlog
**Created:** 2026-07-15
**Layer:** engine
**Entry point:**
**Terminal state:**
**Parent:** REQ-033
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/domains/product.ts, src/domains/product.test.ts
**Depends on:** REQ-033 REQ-027

## Task

Implement product-check policy: require product.md links on AGENTS.md when both exist; skip pure AGENTS-pointer vendor files; require links on non-pointer instruction bodies. Keep vault-adjacent behavior consistent if product domain owns only product/roadmap.

## Context

Skill: product linked from AGENTS.md; pointers stay thin.

## Acceptance Criteria

- [ ] Unit tests for: AGENTS missing product link; pointer-only CLAUDE exempt; fat CLAUDE still flagged; no projectRoot no findings
- [ ] Finding messages name the correct target files
- [ ] No requirement that every agent id gets product links if AGENTS.md covers fleet

## Verification Steps

1. **test** `npm test -- src/domains/product`
   - Expected: pass
2. **test** `npm test`
   - Expected: full suite green

## Integration

**Reachability:** `checkProduct` via domain index.

**Data dependencies:** product files, instruction files from adapters.

**Service dependencies:** adapter `instructionFiles`, shared “is pointer file” heuristic.
