# REQ-002: Scaffold Node package and tests

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.61963
**Claimed at:** 2026-07-13T22:46:00Z
**Heartbeat:** 2026-07-13T22:46:00Z
<!-- claimed-end -->

**UR:** UR-001
**Status:** in-progress
**Created:** 2026-07-14
**Layer:** cli
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-001
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** package.json, tsconfig.json, vitest.config.ts, src/cli.ts, src/index.ts
**Depends on:** REQ-001

## Task

Create the Node/TypeScript package skeleton: package.json with agent-doctor bin, TypeScript config, Vitest, minimal CLI entry that supports --help, and npm test script.

## Context

Design runtime v1 is Node/Bun; test.suite_command is npm test. Greenfield repo has only docs and .do-work.

## Acceptance Criteria

- [ ] package.json defines name agent-doctor, bin pointing at CLI entry, and script test
- [ ] TypeScript source compiles or runs via tsx/ts-node for local dev
- [ ] At least one unit test runs under npm test
- [ ] CLI --help works without requiring map.yml

## Verification Steps

1. **test** npm test
   - Expected: All scaffold tests pass

2. **runtime** npx tsx src/cli.ts --help
   - Expected: Exit 0; help printed

## Integration

**Reachability:** npm bin / npx agent-doctor → package.json bin field → src/cli.ts

**Data dependencies:** None beyond package manifests

**Service dependencies:** Node runtime; no adapters yet

