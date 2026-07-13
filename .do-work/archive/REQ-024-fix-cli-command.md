# REQ-024: Fix CLI command


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** cli
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-021
**Closure proof:** checkpoint_log:passed commit:aadb4f6
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** S
**Files:** src/commands/fix.ts, src/commands/fix.test.ts, src/cli.ts
**Depends on:** REQ-022, REQ-023, REQ-015

## Task

Wire fix CLI: --dry-run, interactive confirm, optional --yes for tests, print plan and post-apply grade.

## Context

Plan-then-apply policy.

## Acceptance Criteria

- [x] fix --dry-run never mutates project files outside AGENT_DOCTOR_HOME map optional updates only if explicitly designed; prefer zero writes on dry-run
- [x] fix without --yes prompts confirm
- [x] fix --yes applies all safe plan items in fixtures

## Verification Steps

1. **test** npm test -- src/commands/fix
   - Expected: Fix CLI tests pass

## Integration

**Reachability:** agent-doctor fix

**Data dependencies:** Report + fix_plan

**Service dependencies:** plan + apply + runChecks

## Outputs

- src/commands/fix.ts — Fix CLI command with dry-run, interactive confirm, --yes
- src/commands/fix.test.ts — Fix CLI AC coverage (12 tests)
- src/cli.ts — Help text for fix options
