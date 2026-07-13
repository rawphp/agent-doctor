# REQ-020: Dashboard HTML surface server


**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** surfaces
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-019
**Closure proof:** checkpoint_log:passed commit:bc5ea1d npm test -- src/surfaces/dashboard (9 passed)
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/surfaces/dashboard/server.ts, src/surfaces/dashboard/template.ts, src/surfaces/dashboard/*.test.ts
**Depends on:** REQ-015

## Task

Implement static HTML template + tiny HTTP server rendering Report: Overview, Agents matrix, Findings, Fix plan copy-CLI hints.

## Context

Design §10; same report no second scoring path.

## Acceptance Criteria

- [x] template(report) includes overall.grade and each finding id
- [x] server binds loopback only
- [x] Does not call fix apply

## Verification Steps

1. **test** npm test -- src/surfaces/dashboard
   - Expected: Template/server tests pass

## Integration

**Reachability:** dashboard command starts server

**Data dependencies:** Report object

**Service dependencies:** runChecks

## Outputs

- src/surfaces/dashboard/template.ts — renderDashboardHtml(report) — Overview, Agents, Findings, Fix plan CLI hints
- src/surfaces/dashboard/server.ts — startDashboardServer — loopback-only read-only HTTP server
- src/surfaces/dashboard/template.test.ts — Template unit tests (grade, finding ids, sections, escape, CLI hints)
- src/surfaces/dashboard/server.test.ts — Server unit tests (loopback bind, HTML serve, no fix apply)
