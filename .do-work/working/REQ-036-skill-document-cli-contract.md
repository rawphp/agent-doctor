# REQ-036: Skill documents CLI hierarchy contract

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.85479
**Claimed at:** 2026-07-15T10:30:16Z
**Heartbeat:** 2026-07-15T10:30:16Z
<!-- claimed-end -->

**UR:** UR-002
**Status:** in-progress
**Created:** 2026-07-15
**Layer:** surfaces
**Entry point:**
**Terminal state:**
**Parent:** REQ-035
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 1
**Size:** S
**Files:** skills/agent-doctor/SKILL.md
**Depends on:** REQ-032, REQ-034, REQ-035

## Task

Rewrite skill sections (LOCAL POLICY, hierarchy, dry-run, errors, command details) to match shipped CLI: finding ids, fix kinds, apply rules, product AGENTS-first policy, Gemini presence-only note.

## Context

Path REQ-035; depends on apply + product implementation so docs match reality.

## Acceptance Criteria

- [ ] Error table includes hierarchy findings → fix dry-run/apply commands
- [ ] Execution Loop uses CLI hierarchy plan/apply before freestyle writes
- [ ] Explicit: no silent hub; no skill-tree copy; dry-run before apply (unchanged)
- [ ] Gemini: map primary + file presence only, matching CLI

## Verification Steps

1. **runtime** `rg -n 'instructions\\.missing|create_agents|AGENTS.md' skills/agent-doctor/SKILL.md`
   - Expected: concrete ids/commands present
2. **runtime** `test -f skills/agent-doctor/SKILL.md`
   - Expected: file exists and is valid markdown frontmatter

## Integration

**Reachability:** Agents load skill from hub symlink.

**Data dependencies:** Final finding id strings from REQ-027/031.

**Service dependencies:** None.
