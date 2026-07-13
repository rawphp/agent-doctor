# REQ-008: Codex adapter

**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** adapters
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-004
**Closure proof:** checkpoint_log:passed commit:8a65e74 all 1 checkpoints passed (0 deferred)
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

- [x] detect works against Codex fixture layout documented in adapter file header
- [x] skillsRoots and instructionFiles return real fixture paths
- [x] proposeWireToSkillsHub can emit symlink FixAction to sync target
- [x] Unit tests do not require live Codex install

## Verification Steps

1. **test** npm test -- src/adapters/codex
   - Expected: Codex adapter tests pass

## Integration

**Reachability:** Adapter registry

**Data dependencies:** Codex config home + project AGENTS.md

**Service dependencies:** AgentAdapter interface

## Outputs

- src/adapters/codex.ts — Codex deep adapter (detect, skillsRoots, instructionFiles, memoryPointers, proposeWire*)
- src/adapters/codex.test.ts — Fixture-based TDD tests for Codex adapter ACs
- fixtures/agents/codex/ — Fake ~/.codex home and project trees for adapter tests
