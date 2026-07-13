# REQ-005: Map load save and discover

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.79727
**Claimed at:** 2026-07-13T22:52:31Z
**Heartbeat:** 2026-07-13T22:52:31Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-004
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/map/load.ts, src/map/save.ts, src/map/discover.ts, src/map/*.test.ts
**Depends on:** REQ-003

## Task

Implement map.yml load/save and filesystem discovery of skills roots, project roots candidates, and vault candidates (common Obsidian locations). Support AGENT_DOCTOR_HOME override for tests.

## Context

Map is inventory+hints; live checks still run. Clarification: no vault → ask path at init only (prompt is CLI layer).

## Acceptance Criteria

- [ ] saveMap/loadMap round-trip preserves agents, skills.global_roots, sync_target, vaults, projects.roots
- [ ] discover populates candidate skills roots without hard-coding a single hero path as the only possible hub
- [ ] AGENT_DOCTOR_HOME redirects all map IO for tests

## Verification Steps

1. **test** npm test -- src/map
   - Expected: Round-trip and discover fixture tests pass

## Integration

**Reachability:** Called from init/map CLI handlers

**Data dependencies:** $AGENT_DOCTOR_HOME/map.yml or ~/.agent-doctor/map.yml

**Service dependencies:** Uses adapter detect for agent homes when available

