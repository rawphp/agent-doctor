# REQ-013: Domain checks suite


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:** checkpoint_log:passed commit:a5ae2f1 all 1 checkpoints passed (0 deferred)
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** L
**Files:** src/domains/context.ts, src/domains/paths.ts, src/domains/presence.ts, src/domains/skills.ts, src/domains/instructions.ts, src/domains/product.ts, src/domains/obsidian.ts, src/domains/consistency.ts, src/domains/index.ts, src/domains/*.test.ts
**Depends on:** REQ-012, REQ-007, REQ-008, REQ-009

## Task

Implement six domain checkers producing Finding[]: presence, skills (incl. duplication + off-hub), instructions, product links, obsidian wiring (no vault content writes), consistency. Skills domain emits symlink-capable fix metadata when agent private tree cannot use hub natively.

## Context

Design §7 domains; sync lens; clarifications on symlink and vault-at-init.

## Acceptance Criteria

- [x] Each domain module returns findings with stable ids and agents_affected
- [x] Skills domain flags agents not on hub and duplicated skill trees across agent homes
- [x] Product domain flags missing links from instruction files to product.md/roadmap.md when those files exist
- [x] Obsidian domain flags broken/missing vault links when vaults are in map; does not invent vault if map has none
- [x] Consistency domain flags divergent hubs/pointers across non-ignored first-class agents

## Verification Steps

1. **test** npm test -- src/domains
   - Expected: All domain fixture tests pass

## Integration

**Reachability:** Invoked by check engine runChecks()

**Data dependencies:** Project tree, map, adapter outputs

**Service dependencies:** skills-hub resolver + adapters

## Outputs

- src/domains/context.ts — DomainCheckContext + agentsInScope / firstClassInScope helpers
- src/domains/paths.ts — Shared path resolve/exists helpers for domain checks
- src/domains/presence.ts — Presence domain — installed, config_home, limited depth
- src/domains/skills.ts — Skills domain — off-hub, duplicated trees, symlink fix_actions
- src/domains/instructions.ts — Instructions domain — missing expected instruction files
- src/domains/product.ts — Product domain — missing product.md/roadmap.md links
- src/domains/obsidian.ts — Obsidian domain — map vaults only; missing/broken vault links
- src/domains/consistency.ts — Consistency domain — divergent hubs/memory across first-class agents
- src/domains/index.ts — Barrel export + runAllDomainChecks for future runChecks()
- src/domains/presence.test.ts — Presence domain fixture tests
- src/domains/skills.test.ts — Skills domain fixture tests (hub/symlink/duplication/fix)
- src/domains/instructions.test.ts — Instructions domain fixture tests
- src/domains/product.test.ts — Product domain fixture tests
- src/domains/obsidian.test.ts — Obsidian domain fixture tests
- src/domains/consistency.test.ts — Consistency domain fixture tests

