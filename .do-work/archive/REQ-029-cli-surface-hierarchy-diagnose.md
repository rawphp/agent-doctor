# REQ-029: CLI surfaces hierarchy diagnose


**UR:** UR-002
**Status:** done
**Created:** 2026-07-15
**Layer:** cli
**Entry point:**
**Terminal state:**
**Parent:** REQ-026
**Closure proof:** checkpoint_log:passed commit:c12bb2a tests:57 cli + check help runtime
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

- [x] Hierarchy findings appear in `status --json` findings array with stable ids
- [x] `check instructions` runs hierarchy checks (same domain)
- [x] No regression in `agent-doctor --help` / command help

## Verification Steps

1. **test** `npm test -- tests/cli-help src/commands`
   - Expected: pass
2. **runtime** `npx tsx src/cli.ts check instructions --help` (or domain list)
   - Expected: instructions domain available; no crash

## Integration

**Reachability:** `src/cli.ts` → `runStatus` / `runCheck`.

**Data dependencies:** Report from `runChecks`.

**Service dependencies:** `src/engine/run-checks.ts`, instructions domain.

## Outputs

- src/cli.ts — check help hierarchy ids
- src/commands/check.ts,status.ts — hierarchy surface notes
- tests — status/check/help hierarchy tests
