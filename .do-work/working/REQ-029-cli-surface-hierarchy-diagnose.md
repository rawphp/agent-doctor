# REQ-029: CLI surfaces hierarchy diagnose

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.40397
**Claimed at:** 2026-07-15T09:56:22Z
**Heartbeat:** 2026-07-15T09:56:22Z
<!-- claimed-end -->

**UR:** UR-002
**Status:** in-progress
**Created:** 2026-07-15
**Layer:** cli
**Entry point:**
**Terminal state:**
**Parent:** REQ-026
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** S
**Files:** src/commands/check.ts, src/commands/status.ts, src/cli.ts, tests/cli-help.test.ts
**Depends on:** REQ-027

## Task

Ensure `status`, `status --json`, and `check instructions` expose hierarchy findings without special-casing hacks. Document finding ids in CLI help or status recommendations only if needed for discoverability.

## Context

Diagnose path must be reachable by agents/humans the same way as other domains.

## Acceptance Criteria

- [ ] Hierarchy findings appear in `status --json` findings array with stable ids
- [ ] `check instructions` runs hierarchy checks (same domain)
- [ ] No regression in `agent-doctor --help` / command help

## Verification Steps

1. **test** `npm test -- tests/cli-help src/commands`
   - Expected: pass
2. **runtime** `npx tsx src/cli.ts check instructions --help` (or domain list)
   - Expected: instructions domain available; no crash

## Integration

**Reachability:** `src/cli.ts` → `runStatus` / `runCheck`.

**Data dependencies:** Report from `runChecks`.

**Service dependencies:** `src/engine/run-checks.ts`, instructions domain.
