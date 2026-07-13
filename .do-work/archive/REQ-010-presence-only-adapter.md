# REQ-010: Presence-only adapter


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** adapters
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-004
**Closure proof:** checkpoint_log:passed commit:6720b4b all 1 checkpoints passed (0 deferred); merge-resolved with detectFirstClassAgents co-located
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

- [x] Registry returns deep adapters for claude-code, codex, grok and presence for configured unknown ids
- [x] Presence adapter never reports skills on hub true without evidence
- [x] agents command can list support level full|presence

## Verification Steps

1. **test** npm test -- src/adapters/presence src/adapters/registry
   - Expected: Registry tests pass

## Integration

**Reachability:** agent-doctor agents and engine detectAll

**Data dependencies:** Optional binary/path hints in map

**Service dependencies:** Adapter registry

## Outputs

- src/adapters/presence.ts — Presence-only AgentAdapter + map inventory detectFirstClassAgents
- src/adapters/registry.ts — Adapter registry with full|presence support levels and listAdapterSupport
- src/adapters/presence.test.ts — TDD tests for presence adapter, map inventory, and registry ACs
- src/adapters/index.ts — Re-exports presence + registry public API

