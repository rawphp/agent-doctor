# REQ-014: Scoring cannot be green on desync

**UR:** UR-001
**Status:** backlog
**Created:** 2026-07-14
**Layer:** engine
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-011
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** S
**Files:** src/engine/score.ts, src/engine/score.test.ts
**Depends on:** REQ-013

## Task

Compute overall score and grade from findings. Enforce: desync or unresolved multi-hub conflict ⇒ grade is yellow or red only (never green), regardless of other domains.

## Context

UR-001 clarification on grade cap.

## Acceptance Criteria

- [ ] Given finding skills.agent_not_on_hub or skills.hub_conflict for a non-ignored first-class agent, grade !== green
- [ ] All aligned fleet with only info findings can be green
- [ ] Exit grade mapping documented in score module

## Verification Steps

1. **test** npm test -- src/engine/score
   - Expected: Scoring matrix tests pass

## Integration

**Reachability:** runChecks finalization

**Data dependencies:** Finding[]

**Service dependencies:** Report.overall

