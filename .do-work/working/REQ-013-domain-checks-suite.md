# REQ-013: Domain checks suite

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.17682
**Claimed at:** 2026-07-13T23:08:38Z
**Heartbeat:** 2026-07-13T23:08:38Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** L
**Files:** src/domains/presence.ts, src/domains/skills.ts, src/domains/instructions.ts, src/domains/product.ts, src/domains/obsidian.ts, src/domains/consistency.ts, src/domains/*.test.ts
**Depends on:** REQ-012, REQ-007, REQ-008, REQ-009

## Task

Implement six domain checkers producing Finding[]: presence, skills (incl. duplication + off-hub), instructions, product links, obsidian wiring (no vault content writes), consistency. Skills domain emits symlink-capable fix metadata when agent private tree cannot use hub natively.

## Context

Design §7 domains; sync lens; clarifications on symlink and vault-at-init.

## Acceptance Criteria

- [ ] Each domain module returns findings with stable ids and agents_affected
- [ ] Skills domain flags agents not on hub and duplicated skill trees across agent homes
- [ ] Product domain flags missing links from instruction files to product.md/roadmap.md when those files exist
- [ ] Obsidian domain flags broken/missing vault links when vaults are in map; does not invent vault if map has none
- [ ] Consistency domain flags divergent hubs/pointers across non-ignored first-class agents

## Verification Steps

1. **test** npm test -- src/domains
   - Expected: All domain fixture tests pass

## Integration

**Reachability:** Invoked by check engine runChecks()

**Data dependencies:** Project tree, map, adapter outputs

**Service dependencies:** skills-hub resolver + adapters

