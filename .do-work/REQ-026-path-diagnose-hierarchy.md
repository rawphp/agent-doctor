# REQ-026: Path — Diagnose instruction hierarchy

**UR:** UR-002
**Status:** backlog
**Created:** 2026-07-15
**Layer:** none
**Entry point:** `agent-doctor status` / `agent-doctor check instructions` in a project root (or hybrid scope with project)
**Terminal state:** Report includes stable hierarchy findings when AGENTS.md is missing or required vendor files lack AGENTS.md pointers; healthy hierarchy projects produce no hierarchy findings
**Parent:**
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 3
**Size:** M
**Files:** src/domains/instructions.ts, src/domains/instructions.test.ts, src/engine/run-checks.ts, docs/superpowers/specs/2026-07-14-agent-doctor-design.md
**Depends on:**

## Task

Define and close the end-to-end diagnose path for Project Instruction Hierarchy so the CLI enforces skill policy: AGENTS.md must exist; vendor instruction files that are required must point at AGENTS.md.

## Context

UR-002: CLI must support skill policies and vice-versa. Clarification: diagnose + plan + apply for hierarchy. Skill LOCAL POLICY §6 and Project Instruction Hierarchy are the oracle.

## Acceptance Criteria

- [ ] Path-unit documents entry `status`/`check instructions` and terminal state with hierarchy findings present/absent correctly
- [ ] Child REQs under this path deliver findings + adapter rules + CLI surface needed for diagnose
- [ ] Finding ids are stable and documented for skill cross-reference

## Verification Steps

1. **test** `npm test -- src/domains/instructions`
   - Expected: hierarchy-related tests pass (after children land; path closes when children done)
2. **runtime** `npx tsx src/cli.ts check instructions` against a fixture project missing AGENTS.md
   - Expected: non-zero findings including hierarchy missing AGENTS.md (after children)

## Integration

**Reachability:** CLI `check` / `status` via `src/cli.ts` and `src/commands/status.ts` / `check.ts`.

**Data dependencies:** Project root, map agents (installed/primary), filesystem instruction files.

**Service dependencies:** Domain engine `src/engine/run-checks.ts`, instructions domain.
