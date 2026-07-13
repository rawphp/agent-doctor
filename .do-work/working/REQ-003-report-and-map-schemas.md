# REQ-003: Report and map schemas

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.71328
**Claimed at:** 2026-07-13T22:48:50Z
**Heartbeat:** 2026-07-13T22:48:50Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-001
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/engine/types.ts, src/engine/types.test.ts
**Depends on:** REQ-002

## Task

Implement shared TypeScript types for Report, Finding, Recommendation, FixAction, HomeMap, AgentPresence, DomainResult matching design §6–§7 (hybrid|machine scope, sync block, agents_affected).

## Context

Single report schema is the contract for status, dashboard, fix, and future native dual-ship.

## Acceptance Criteria

- [ ] Types export Report with overall.grade green|yellow|red, sync.aligned, findings with stable id and agents_affected
- [ ] HomeMap type matches map.yml version 1 fields (skills.global_roots, sync_target, vaults, agents, projects)
- [ ] Unit tests construct a sample Report and HomeMap without runtime errors

## Verification Steps

1. **test** npm test -- src/engine/types.test.ts
   - Expected: Type/schema tests pass

## Integration

**Reachability:** Imported by engine runner, CLI, and surfaces

**Data dependencies:** Serializes to/from JSON and map.yml

**Service dependencies:** src/engine/* consumers

