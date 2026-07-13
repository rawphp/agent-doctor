# REQ-009: Grok adapter

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.95431
**Claimed at:** 2026-07-13T22:57:33Z
**Heartbeat:** 2026-07-13T22:57:33Z
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
**Priority:** 3
**Size:** M
**Files:** src/adapters/grok.ts, src/adapters/grok.test.ts, fixtures/agents/grok/
**Depends on:** REQ-003, REQ-007

## Task

Implement Grok deep adapter for ~/.grok (or fixture): detect, skills/plugin roots, instruction files, wire-to-hub proposals with symlink option.

## Context

Design §8; always multi-agent — Grok is peer, not default patient.

## Acceptance Criteria

- [ ] detect present when fixture/home exists
- [ ] skillsRoots lists configured or conventional skill paths
- [ ] proposeWireToSkillsHub emits non-copy fix actions
- [ ] Tests use fixtures only

## Verification Steps

1. **test** npm test -- src/adapters/grok
   - Expected: Grok adapter tests pass

## Integration

**Reachability:** Adapter registry

**Data dependencies:** ~/.grok and project instruction files

**Service dependencies:** AgentAdapter interface

