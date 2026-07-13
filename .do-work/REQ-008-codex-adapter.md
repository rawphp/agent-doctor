# REQ-008: Codex adapter

**UR:** UR-001
**Status:** backlog
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

