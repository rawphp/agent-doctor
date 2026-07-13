# REQ-006: Init map CLI vault prompt

**UR:** UR-001
**Status:** backlog
**Created:** 2026-07-14
**Layer:** cli
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-004
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/cli.ts, src/commands/init.ts, src/commands/map.ts
**Depends on:** REQ-005, REQ-007, REQ-010

## Task

Wire init and map commands: run discovery, merge into map, prompt for vault path when none discovered (interactive), support non-interactive flags for tests, write map.

## Context

Clarification: vault path asked during init/map only.

## Acceptance Criteria

- [ ] agent-doctor init creates map and prints summary of agents/skills/vaults found
- [ ] agent-doctor map refreshes discovery fields without wiping user sync_target/ignored flags
- [ ] Interactive init with zero vaults prompts for path; empty skip records no vault with explicit skipped marker
- [ ] --yes / non-interactive mode does not hang on prompts (for CI)

## Verification Steps

1. **test** npm test -- src/commands/init
   - Expected: Init/map command tests pass

2. **runtime** AGENT_DOCTOR_HOME=/tmp/ad-init-$$ npx tsx src/cli.ts map --yes
   - Expected: Exit 0; map.yml created

## Integration

**Reachability:** CLI subcommands init and map

**Data dependencies:** map.yml via src/map/*

**Service dependencies:** Adapter detect suite

