# REQ-002: Scaffold Node package and tests

**UR:** UR-001
**Status:** done
**Created:** 2026-07-14
**Layer:** cli
**Entry point:** 
**Terminal state:** 
**Parent:** REQ-001
**Closure proof:** checkpoint_log:passed commit:adbc331 all 2 checkpoints passed (0 deferred)
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** package.json, tsconfig.json, vitest.config.ts, src/cli.ts, src/index.ts, tests/scaffold.test.ts
**Depends on:** REQ-001

## Task

Create the Node/TypeScript package skeleton: package.json with agent-doctor bin, TypeScript config, Vitest, minimal CLI entry that supports --help, and npm test script.

## Context

Design runtime v1 is Node/Bun; test.suite_command is npm test. Greenfield repo has only docs and .do-work.

## Acceptance Criteria

- [x] package.json defines name agent-doctor, bin pointing at CLI entry, and script test
- [x] TypeScript source compiles or runs via tsx/ts-node for local dev
- [x] At least one unit test runs under npm test
- [x] CLI --help works without requiring map.yml

## Verification Steps

1. **test** npm test
   - Expected: All scaffold tests pass

2. **runtime** npx tsx src/cli.ts --help
   - Expected: Exit 0; help printed

## Integration

**Reachability:** npm bin / npx agent-doctor → package.json bin field → src/cli.ts

**Data dependencies:** None beyond package manifests

**Service dependencies:** Node runtime; no adapters yet

## Outputs

- src/index.ts — Library entrypoint exporting PACKAGE_NAME and PACKAGE_VERSION
- tests/scaffold.test.ts — TDD tests for package metadata (name/bin/test) and src/index.ts module entry
