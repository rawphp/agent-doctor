# REQ-025: Agents and check commands

**UR:** UR-001
**Status:** backlog
**Created:** 2026-07-14
**Layer:** cli
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 1
**Size:** S
**Files:** src/commands/agents.ts, src/commands/check.ts, src/cli.ts
**Depends on:** REQ-010, REQ-015, REQ-017

## Task

Implement agents (list detected + adapter depth) and check [domain] (run one domain or filter report).

## Context

Design §5 utility commands.

## Acceptance Criteria

- [ ] agents prints each detected agent and full|presence support
- [ ] check skills runs skills-related findings only (or domain module) with exit codes
- [ ] Invalid domain name exits non-zero with helpful error

## Verification Steps

1. **test** npm test -- src/commands/agents src/commands/check
   - Expected: Utility command tests pass

2. **runtime** npx tsx src/cli.ts agents
   - Expected: Exit 0; lists adapters

## Integration

**Reachability:** agent-doctor agents | check

**Data dependencies:** map + adapters

**Service dependencies:** runChecks / domain modules

