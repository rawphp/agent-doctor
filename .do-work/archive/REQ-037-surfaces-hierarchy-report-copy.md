# REQ-037: Surfaces report hierarchy findings clearly


**UR:** UR-002
**Status:** done
**Created:** 2026-07-15
**Layer:** surfaces
**Entry point:**
**Terminal state:**
**Parent:** REQ-026
**Closure proof:** checkpoint_log:passed commit:b8cb643 tests:38 surfaces+status + 302 full
**Criteria approved:** agent-drafted
**Priority:** 1
**Size:** S
**Files:** src/surfaces/terminal.ts, src/surfaces/terminal.test.ts, src/engine/score.ts, src/commands/status.ts
**Depends on:** REQ-027

## Task

Ensure terminal/JSON/dashboard report paths render hierarchy findings with readable messages (and recommendations that point to `fix --dry-run` when hierarchy is broken). Prefer reusing generic finding rendering; only special-case if recommendations builder needs hierarchy-specific next step.

## Context

Diagnose path UX for humans/agents; layer surfaces coverage for UR-002.

## Acceptance Criteria

- [x] Hierarchy findings visible in terminal status output via existing findings list or domain section
- [x] Recommendations include a next step referencing fix dry-run when hierarchy findings exist (if recommendations are generated from findings)
- [x] No dashboard regression; JSON remains source of truth

## Verification Steps

1. **test** `npm test -- src/surfaces src/commands/status`
   - Expected: pass
2. **test** `npm test`
   - Expected: full suite green

## Integration

**Reachability:** `runStatus` → terminal template / report JSON.

**Data dependencies:** Report.findings.

**Service dependencies:** Existing recommendation builder if present in status/score modules.

## Outputs

- src/surfaces/terminal.ts — Findings list
- src/surfaces/terminal.test.ts — hierarchy readability
- src/engine/run-checks.ts — fix --dry-run recommendations
- src/commands/status.ts — surfaces note
- src/commands/status.test.ts — coverage
