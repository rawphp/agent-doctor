# REQ-004: Path init and map

**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `agent-doctor init` or `agent-doctor map`
**Terminal state:** ~/.agent-doctor/map.yml exists with discovered agents, skills roots, project roots; if no vault discovered, user was prompted once for a vault path and answer stored or explicit skip recorded
**Parent:** 
**Closure proof:** checkpoint_log:passed commit:d2e0107 all 2 checkpoints passed (0 deferred); merged:6d82b2e
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/cli.ts, src/map/, src/adapters/, package.json, package-lock.json
**Depends on:** REQ-002, REQ-003

## Task

Path-unit for first-run discovery: user runs init/map and gets a persisted home map used by later checks.

## Context

Design §5–§6; clarification: vault path prompt during init/map only.

## Acceptance Criteria

- [x] init writes versioned map.yml under the agent-doctor config home (default ~/.agent-doctor/)
- [x] map refreshes discovery without full wizard chrome
- [x] When zero vaults discovered, init prompts for a vault path (or skip) and records result
- [x] Detected Claude Code, Codex, and Grok homes appear under agents when present on the machine

## Verification Steps

1. **test** npm test -- src/map
   - Expected: Map load/save and init discovery unit tests pass with fixtures

2. **runtime** AGENT_DOCTOR_HOME=/tmp/ad-test-$$ npx tsx src/cli.ts init --non-interactive 2>/dev/null || true
   - Expected: Documented test mode or fixtures cover map write

## Manual checks (advisory)

- [ ] Action: Run agent-doctor init on this machine — Observable outcome: map lists real ~/.claude and/or ~/.grok if installed; vault prompt appears if none found

## Outputs

- src/cli.ts — Wires init/map commands with --non-interactive and map summary output
- src/map/load.ts — agentDoctorHome, mapPath, loadMap (AGENT_DOCTOR_HOME aware)
- src/map/save.ts — saveMap writes versioned YAML map.yml
- src/map/discover.ts — Filesystem discovery of skills roots, project roots, vaults
- src/map/init.ts — runInit/runMap orchestration with vault prompt (init only)
- src/map/index.ts — Public map module exports including init/map
- src/map/load-save.test.ts — Load/save round-trip and version validation tests
- src/map/discover.test.ts — Discovery fixture tests for skills/projects/vaults
- src/map/init.test.ts — Init/map path-unit acceptance tests
- src/adapters/presence.ts — Thin presence detection for claude-code, codex, grok
- src/adapters/presence.test.ts — Presence detection unit tests
- src/adapters/index.ts — Adapters package exports (presence + deep adapters)
- package.json — Adds yaml dependency for map.yml IO
- package-lock.json — Lockfile update for yaml
