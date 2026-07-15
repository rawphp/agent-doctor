# REQ-028: Hierarchy presence rules (adapters + map)

**UR:** UR-002
**Status:** backlog
**Created:** 2026-07-15
**Layer:** adapters
**Entry point:**
**Terminal state:**
**Parent:** REQ-026
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** M
**Files:** src/adapters/claude-code.ts, src/adapters/codex.ts, src/adapters/grok.ts, src/adapters/types.ts, src/domains/instructions.ts, src/domains/instructions.test.ts
**Depends on:** REQ-027

## Task

Define which vendor pointer files are required for hierarchy checks: file already exists OR agent is installed/primary (map). Include Gemini-style basenames (`GEMINI.md`) via map primary + file presence only — no deep Gemini adapter. Align Claude/Codex/Grok expected project instruction surfaces with AGENTS.md-first (Claude still may use CLAUDE.md as pointer file; Codex already AGENTS.md).

## Context

Clarification: Gemini hierarchy via map primary + file presence only. Skill detect table for CLAUDE/GEMINI/GROK.

## Acceptance Criteria

- [ ] Shared helper (or adapter hooks) returns required pointer basenames given agents + project files
- [ ] If `GEMINI.md` exists or an agent entry is primary/id matching gemini/presence — require GEMINI.md → AGENTS.md pointer when project scope
- [ ] Claude installed → require CLAUDE.md pointer (create expectation even if file missing, as today’s missing_file pattern, plus pointer check when file exists)
- [ ] No deep gemini adapter package required for this UR
- [ ] Tests for presence-only gemini primary and existing GEMINI.md without pointer

## Verification Steps

1. **test** `npm test -- src/domains/instructions src/adapters`
   - Expected: pass
2. **test** `npm test`
   - Expected: full suite green

## Integration

**Reachability:** Used by instructions domain during `checkInstructions`.

**Data dependencies:** HomeMap agent entries (`primary`, `id`, `installed`), project root readdir.

**Service dependencies:** Adapter registry; `src/adapters/types.ts` optional extension points.
