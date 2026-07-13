# REQ-004: Path init and map

**UR:** UR-001
**Status:** backlog
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `agent-doctor init` or `agent-doctor map`
**Terminal state:** ~/.agent-doctor/map.yml exists with discovered agents, skills roots, project roots; if no vault discovered, user was prompted once for a vault path and answer stored or explicit skip recorded
**Parent:** 
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/cli.ts, src/map/, src/adapters/
**Depends on:** REQ-002, REQ-003

## Task

Path-unit for first-run discovery: user runs init/map and gets a persisted home map used by later checks.

## Context

Design §5–§6; clarification: vault path prompt during init/map only.

## Acceptance Criteria

- [ ] init writes versioned map.yml under the agent-doctor config home (default ~/.agent-doctor/)
- [ ] map refreshes discovery without full wizard chrome
- [ ] When zero vaults discovered, init prompts for a vault path (or skip) and records result
- [ ] Detected Claude Code, Codex, and Grok homes appear under agents when present on the machine

## Verification Steps

1. **test** npm test -- src/map
   - Expected: Map load/save and init discovery unit tests pass with fixtures

2. **runtime** AGENT_DOCTOR_HOME=/tmp/ad-test-$$ npx tsx src/cli.ts init --non-interactive 2>/dev/null || true
   - Expected: Documented test mode or fixtures cover map write

## Manual checks (advisory)

- [ ] Action: Run agent-doctor init on this machine — Observable outcome: map lists real ~/.claude and/or ~/.grok if installed; vault prompt appears if none found

