# REQ-012: Skills hub resolution


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:** checkpoint_log:passed commit:f6d6788 all 1 checkpoints passed (0 deferred)
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/engine/skills-hub.ts, src/engine/skills-hub.test.ts
**Depends on:** REQ-003, REQ-005

## Task

Resolve skills sync target: use map.sync_target if set; else single populated root; else conflict finding with no silent pick. Collect per-agent roots from adapters.

## Context

Design §3 and §6 hub resolution; no hard-coded hero path.

## Acceptance Criteria

- [x] When sync_target set, resolution uses it
- [x] When exactly one candidate root has content, it becomes hub
- [x] When two+ populated roots and no sync_target, result is conflict and hub undefined
- [x] Empty roots produce explicit no-hub finding, not a fake path

## Verification Steps

1. **test** npm test -- src/engine/skills-hub
   - Expected: Hub resolution cases pass

## Integration

**Reachability:** Check engine before domain skills

**Data dependencies:** map.skills + adapter skillsRoots

**Service dependencies:** Adapters

## Outputs

- src/engine/skills-hub.ts — resolveSkillsHub — sync_target / single populated / conflict / no-hub
- src/engine/skills-hub.test.ts — Temp-dir fixtures covering all four hub-resolution acceptance criteria
