# REQ-007: Claude Code adapter

**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** adapters
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-004
**Closure proof:** checkpoint_log:passed commit:b447be3 all 1 checkpoints passed (0 deferred)
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/adapters/claude-code.ts, src/adapters/types.ts, src/adapters/claude-code.test.ts, fixtures/agents/claude-code/
**Depends on:** REQ-003

## Task

Implement Claude Code adapter: detect ~/.claude (or fixture), list skills roots the agent uses, instruction files (CLAUDE.md, .claude/), memory pointers, proposeWireToSkillsHub (config or symlink plan).

## Context

Design §8 first-class adapter. Sync-first: contribute roots to fleet comparison, not assume Claude is primary.

## Acceptance Criteria

- [x] detect returns present=true when config home exists in fixture
- [x] skillsRoots returns discovered paths without inventing missing dirs as healthy
- [x] instructionFiles finds project CLAUDE.md when projectRoot provided
- [x] proposeWireToSkillsHub returns FixAction(s) that prefer hub wiring or symlink, never content copy

## Verification Steps

1. **test** npm test -- src/adapters/claude-code
   - Expected: Adapter fixture tests pass

## Integration

**Reachability:** Registered in adapter registry used by discover and check engine

**Data dependencies:** Reads agent home and project instruction files

**Service dependencies:** src/adapters/types.ts AgentAdapter interface

## Outputs

- src/adapters/claude-code.ts — Claude Code deep adapter (detect, skillsRoots, instructionFiles, memoryPointers, proposeWire*)
- src/adapters/types.ts — AgentAdapter interface and AdapterContext (design §8)
- src/adapters/claude-code.test.ts — Fixture-based TDD tests for Claude Code adapter ACs
- fixtures/agents/claude-code/ — Fake ~/.claude home and project trees for adapter tests
