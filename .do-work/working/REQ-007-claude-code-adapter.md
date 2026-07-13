# REQ-007: Claude Code adapter

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.80348
**Claimed at:** 2026-07-13T22:52:42Z
**Heartbeat:** 2026-07-13T22:52:42Z
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
**Files:** src/adapters/claude-code.ts, src/adapters/types.ts, src/adapters/claude-code.test.ts, fixtures/agents/claude-code/
**Depends on:** REQ-003

## Task

Implement Claude Code adapter: detect ~/.claude (or fixture), list skills roots the agent uses, instruction files (CLAUDE.md, .claude/), memory pointers, proposeWireToSkillsHub (config or symlink plan).

## Context

Design §8 first-class adapter. Sync-first: contribute roots to fleet comparison, not assume Claude is primary.

## Acceptance Criteria

- [ ] detect returns present=true when config home exists in fixture
- [ ] skillsRoots returns discovered paths without inventing missing dirs as healthy
- [ ] instructionFiles finds project CLAUDE.md when projectRoot provided
- [ ] proposeWireToSkillsHub returns FixAction(s) that prefer hub wiring or symlink, never content copy

## Verification Steps

1. **test** npm test -- src/adapters/claude-code
   - Expected: Adapter fixture tests pass

## Integration

**Reachability:** Registered in adapter registry used by discover and check engine

**Data dependencies:** Reads agent home and project instruction files

**Service dependencies:** src/adapters/types.ts AgentAdapter interface

