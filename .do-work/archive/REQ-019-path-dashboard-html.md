# REQ-019: Path dashboard HTML


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** none
**Entry point:** `agent-doctor dashboard`
**Terminal state:** Local loopback server serves HTML dashboard of the same Report; browser can open URL; apply remains CLI-only
**Parent:** 
**Closure proof:** checkpoint_log:passed commit:e49729d npm test -- src/surfaces/dashboard src/commands/dashboard (18 passed); runtime curl HTML contains Agent Doctor title
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/commands/dashboard.ts, src/commands/dashboard.test.ts, src/cli.ts, src/surfaces/dashboard/
**Depends on:** REQ-015, REQ-017

## Task

Path-unit for HTML dashboard viewing sync health from the same report engine.

## Context

Design §10 HTML; dual surface approach 1.

## Acceptance Criteria

- [x] dashboard runs checks (or accepts last report) and serves HTML on 127.0.0.1
- [x] HTML shows overall grade, sync matrix, findings
- [x] Port conflict tries next port or --port; URL printed
- [x] No apply/fix mutation from the HTML UI in v1

## Verification Steps

1. **test** npm test -- src/surfaces/dashboard src/commands/dashboard
   - Expected: Dashboard tests pass

2. **runtime** npx tsx src/cli.ts dashboard --port 0 --no-open & sleep 1; curl -s $URL | head
   - Expected: HTML contains grade or Agent Doctor title

## Outputs

- src/commands/dashboard.ts — Dashboard CLI path-unit — runChecks/report inject, loopback server, port retry, open browser
- src/commands/dashboard.test.ts — AC tests for flags, HTML serve, --all, port conflict, no-open, no fix apply
- src/cli.ts — Wires agent-doctor dashboard to runDashboard
