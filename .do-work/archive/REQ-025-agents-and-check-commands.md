# REQ-025: Agents and check commands

**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** cli
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:** checkpoint_log:passed commit:06f1a97 all 2 checkpoints passed (0 deferred)
**Criteria approved:** agent-drafted
**Priority:** 1
**Size:** S
**Files:** src/commands/agents.ts, src/commands/agents.test.ts, src/commands/check.ts, src/commands/check.test.ts, src/cli.ts
**Depends on:** REQ-010, REQ-015, REQ-017

## Task

Implement agents (list detected + adapter depth) and check [domain] (run one domain or filter report).

## Context

Design §5 utility commands.

## Acceptance Criteria

- [x] agents prints each detected agent and full|presence support
- [x] check skills runs skills-related findings only (or domain module) with exit codes
- [x] Invalid domain name exits non-zero with helpful error

## Verification Steps

1. **test** npm test -- src/commands/agents src/commands/check
   - Expected: Utility command tests pass

2. **runtime** npx tsx src/cli.ts agents
   - Expected: Exit 0; lists adapters

## Integration

**Reachability:** agent-doctor agents | check

**Data dependencies:** map + adapters

**Service dependencies:** runChecks / domain modules

## Outputs

- src/commands/agents.ts — agents CLI — list registered adapters with full|presence support
- src/commands/agents.test.ts — AC tests for agents listing and support levels
- src/commands/check.ts — check [domain] CLI — single-domain filter, invalid domain error, exit by grade
- src/commands/check.test.ts — AC tests for skills filter, full check, invalid domain
- src/cli.ts — Wires agent-doctor agents and check to runAgents/runCheck
