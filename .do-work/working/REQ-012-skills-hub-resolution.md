# REQ-012: Skills hub resolution

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.95592
**Claimed at:** 2026-07-13T22:57:38Z
**Heartbeat:** 2026-07-13T22:57:38Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:**
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

- [ ] When sync_target set, resolution uses it
- [ ] When exactly one candidate root has content, it becomes hub
- [ ] When two+ populated roots and no sync_target, result is conflict and hub undefined
- [ ] Empty roots produce explicit no-hub finding, not a fake path

## Verification Steps

1. **test** npm test -- src/engine/skills-hub
   - Expected: Hub resolution cases pass

## Integration

**Reachability:** Check engine before domain skills

**Data dependencies:** map.skills + adapter skillsRoots

**Service dependencies:** Adapters

