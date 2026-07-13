# REQ-008: Codex adapter

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.94509
**Claimed at:** 2026-07-13T22:57:22Z
**Heartbeat:** 2026-07-13T22:57:22Z
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
**Files:** src/adapters/codex.ts, src/adapters/codex.test.ts, fixtures/agents/codex/
**Depends on:** REQ-003, REQ-007

## Task

Implement Codex deep adapter with detect, skillsRoots, instructionFiles (AGENTS.md etc.), memoryPointers, proposeWireToSkillsHub including symlink-to-hub when native path differs.

## Context

Design §8; clarification symlink when cannot natively share hub.

## Acceptance Criteria

- [ ] detect works against Codex fixture layout documented in adapter file header
- [ ] skillsRoots and instructionFiles return real fixture paths
- [ ] proposeWireToSkillsHub can emit symlink FixAction to sync target
- [ ] Unit tests do not require live Codex install

## Verification Steps

1. **test** npm test -- src/adapters/codex
   - Expected: Codex adapter tests pass

## Integration

**Reachability:** Adapter registry

**Data dependencies:** Codex config home + project AGENTS.md

**Service dependencies:** AgentAdapter interface

