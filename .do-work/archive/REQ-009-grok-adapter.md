# REQ-009: Grok adapter

**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** adapters
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-004
**Closure proof:** checkpoint_log:passed commit:ce2e35c all 1 checkpoints passed (0 deferred)
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

- [x] detect present when fixture/home exists
- [x] skillsRoots lists configured or conventional skill paths
- [x] proposeWireToSkillsHub emits non-copy fix actions
- [x] Tests use fixtures only

## Verification Steps

1. **test** npm test -- src/adapters/grok
   - Expected: Grok adapter tests pass

## Integration

**Reachability:** Adapter registry

**Data dependencies:** ~/.grok and project instruction files

**Service dependencies:** AgentAdapter interface

## Outputs

- src/adapters/grok.ts — Grok deep adapter (detect, skillsRoots, instructionFiles, memoryPointers, proposeWire*)
- src/adapters/grok.test.ts — Fixture-based TDD tests for Grok adapter acceptance criteria
- fixtures/agents/grok/ — Fake ~/.grok home (skills, bundled), home-no-skills, and project trees for adapter tests
