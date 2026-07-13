# REQ-006: Init map CLI vault prompt


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** cli
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-004
**Closure proof:** checkpoint_log:passed (2/2) commit:acc9cfe; merged:dff2170 review:passed tests:121/121
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/cli.ts, src/commands/init.ts, src/commands/map.ts, src/commands/init.test.ts, src/map/init.ts, src/map/init.test.ts, src/map/load.ts, src/map/save.ts, src/engine/types.ts
**Depends on:** REQ-005, REQ-007, REQ-010

## Task

Wire init and map commands: run discovery, merge into map, prompt for vault path when none discovered (interactive), support non-interactive flags for tests, write map.

## Context

Clarification: vault path asked during init/map only.

## Acceptance Criteria

- [x] agent-doctor init creates map and prints summary of agents/skills/vaults found
- [x] agent-doctor map refreshes discovery fields without wiping user sync_target/ignored flags
- [x] Interactive init with zero vaults prompts for path; empty skip records no vault with explicit skipped marker
- [x] --yes / non-interactive mode does not hang on prompts (for CI)

## Verification Steps

1. **test** npm test -- src/commands/init
   - Expected: Init/map command tests pass

2. **runtime** AGENT_DOCTOR_HOME=/tmp/ad-init-$$ npx tsx src/cli.ts map --yes
   - Expected: Exit 0; map.yml created

## Integration

**Reachability:** CLI subcommands init and map

**Data dependencies:** map.yml via src/map/*

**Service dependencies:** Adapter detect suite

## Outputs

- src/commands/init.ts — CLI init command — flag parsing, summary format, runInitCommand
- src/commands/map.ts — CLI map command — --yes safe refresh via runMapCommand
- src/commands/init.test.ts — TDD tests covering all four REQ-006 acceptance criteria
- src/cli.ts — Wires init/map to command modules; documents --yes/--non-interactive
- src/map/init.ts — vaults_skipped marker; preserve user flags on map refresh
- src/map/init.test.ts — Path-unit tests assert explicit vaults_skipped on skip
- src/map/load.ts — Load vaults_skipped from map.yml
- src/map/save.ts — Persist vaults_skipped to map.yml
- src/engine/types.ts — HomeMap.vaults_skipped optional boolean field
