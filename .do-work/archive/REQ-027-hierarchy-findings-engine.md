# REQ-027: Hierarchy findings in instructions domain


**UR:** UR-002
**Status:** done
**Created:** 2026-07-15
**Layer:** engine
**Entry point:**
**Terminal state:**
**Parent:** REQ-026
**Closure proof:** checkpoint_log:passed commit:e47c943 tests:17 instructions domain + full suite 275
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/domains/instructions.ts, src/domains/instructions.test.ts, src/engine/types.ts
**Depends on:** REQ-026

## Task

Extend the instructions domain so project scope emits findings for: (1) missing project-root `AGENTS.md`; (2) required vendor instruction files that do not reference `AGENTS.md` (case-insensitive basename/path). Do not create files here — diagnose only.

## Context

Skill: AGENTS.md required; CLAUDE.md/GEMINI.md/etc. must point at it. Today `checkInstructions` only checks per-adapter expected basenames exist (e.g. Claude → CLAUDE.md only).

## Acceptance Criteria

- [x] Missing `AGENTS.md` under project root → finding id `instructions.missing_agents_md` (or equivalent stable id), severity warn or error, domain `instructions`
- [x] Required pointer file present but no AGENTS.md reference → finding id `instructions.missing_agents_pointer` with evidence paths
- [x] Healthy tree (AGENTS.md + pointers that mention AGENTS.md) → no hierarchy findings
- [x] Machine/global scope without projectRoot → no hierarchy findings
- [x] Tests cover missing AGENTS, missing pointer, healthy, and “pointer file not required” cases

## Verification Steps

1. **test** `npm test -- src/domains/instructions`
   - Expected: all tests pass including new hierarchy cases
2. **test** `npm test`
   - Expected: full suite green (no regressions)

## Integration

**Reachability:** Invoked from `runChecks` domain list via `src/domains/index.ts`.

**Data dependencies:** `DomainCheckContext.projectRoot`, `ctx.agents` installed/primary flags.

**Service dependencies:** `pathExists`, adapter `expectedInstructionFiles` / default basenames (extended by REQ-028).

## Outputs

- src/domains/instructions.ts — Hierarchy findings wired to INSTRUCTION_FINDING_IDS
- src/domains/instructions.test.ts — Hardened AC coverage tests
- src/engine/types.ts — INSTRUCTION_FINDING_IDS stable contract
