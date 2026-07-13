# REQ-005: Map load save and discover


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-004
**Closure proof:** checkpoint_log:passed commit:2628044 all 1 checkpoints passed (0 deferred)
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/map/load.ts, src/map/save.ts, src/map/discover.ts, src/map/index.ts, src/map/load-save.test.ts, src/map/discover.test.ts, package.json, package-lock.json
**Depends on:** REQ-003

## Task

Implement map.yml load/save and filesystem discovery of skills roots, project roots candidates, and vault candidates (common Obsidian locations). Support AGENT_DOCTOR_HOME override for tests.

## Context

Map is inventory+hints; live checks still run. Clarification: no vault → ask path at init only (prompt is CLI layer).

## Acceptance Criteria

- [x] saveMap/loadMap round-trip preserves agents, skills.global_roots, sync_target, vaults, projects.roots
- [x] discover populates candidate skills roots without hard-coding a single hero path as the only possible hub
- [x] AGENT_DOCTOR_HOME redirects all map IO for tests

## Verification Steps

1. **test** npm test -- src/map
   - Expected: Round-trip and discover fixture tests pass

## Integration

**Reachability:** Called from init/map CLI handlers

**Data dependencies:** $AGENT_DOCTOR_HOME/map.yml or ~/.agent-doctor/map.yml

**Service dependencies:** Uses adapter detect for agent homes when available

## Outputs

- src/map/load.ts — loadMap, agentDoctorHome, mapPath with AGENT_DOCTOR_HOME override
- src/map/save.ts — saveMap writes map.yml under doctor home, creates dirs
- src/map/discover.ts — discover skills roots, project roots, vault candidates (no single hero hub)
- src/map/index.ts — barrel re-exports for map module
- src/map/load-save.test.ts — Round-trip and AGENT_DOCTOR_HOME redirection tests
- src/map/discover.test.ts — Fixture-based discovery tests for skills/projects/vaults
- package.json — Added yaml runtime dependency
- package-lock.json — Lockfile for yaml dependency
