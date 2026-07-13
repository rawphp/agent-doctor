# REQ-010: Presence-only adapter

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.960
**Claimed at:** 2026-07-13T22:59:11Z
**Heartbeat:** 2026-07-13T22:59:11Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** adapters
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-004
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 1
**Size:** S
**Files:** src/adapters/presence.ts, src/adapters/registry.ts, src/adapters/presence.test.ts
**Depends on:** REQ-007

## Task

Implement presence-only adapter and registry for unknown agents (e.g. Gemini, Cursor markers). List in fleet with limited checks message; no deep skills claims.

## Context

Design §8 others presence-only; still show full fleet.

## Acceptance Criteria

- [ ] Registry returns deep adapters for claude-code, codex, grok and presence for configured unknown ids
- [ ] Presence adapter never reports skills on hub true without evidence
- [ ] agents command can list support level full|presence

## Verification Steps

1. **test** npm test -- src/adapters/presence src/adapters/registry
   - Expected: Registry tests pass

## Integration

**Reachability:** agent-doctor agents and engine detectAll

**Data dependencies:** Optional binary/path hints in map

**Service dependencies:** Adapter registry

