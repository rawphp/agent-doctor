# REQ-035: Path — Skill ↔ CLI contract parity

<!-- claimed-start -->
**Claimed by:** Toms-MacBook-Pro.local.85479
**Claimed at:** 2026-07-15T10:13:01Z
**Heartbeat:** 2026-07-15T10:13:01Z
<!-- claimed-end -->

**UR:** UR-002
**Status:** in-progress
**Created:** 2026-07-15
**Layer:** none
**Entry point:** Agent loads `skills/agent-doctor/SKILL.md` and runs Execution Loop against CLI that implements hierarchy + product policy
**Terminal state:** Skill text only claims diagnose/plan/apply capabilities the CLI implements; finding ids and fix kinds listed; no “agent freestyle hierarchy when Doctor lacks steps” for covered cases
**Parent:**
**Closure proof:**
**Criteria approved:** agent-drafted
**Priority:** 2
**Size:** S
**Files:** skills/agent-doctor/SKILL.md, product.md, docs/superpowers/specs/2026-07-14-agent-doctor-design.md
**Depends on:** REQ-030, REQ-033

## Task

Update skill (and brief design/product notes as needed) so skill policies and CLI are bidirectional: skill defers hierarchy creates to `fix` when available; documents finding ids / dry-run; CLI policies remain source for score/fix safety.

## Context

Vice-versa half of the brief. Skill currently allows agent-side hierarchy writes when Doctor does not emit steps — after CLI support, prefer CLI path.

## Acceptance Criteria

- [ ] LOCAL POLICY §6 says prefer `agent-doctor fix` for hierarchy when findings exist
- [ ] Command details list hierarchy finding ids and fix kinds matching implementation
- [ ] Remove or gate language that encourages freestyle hierarchy when CLI covers it
- [ ] product.md notes AGENTS.md-first if still accurate

## Verification Steps

1. **runtime** `rg -n 'missing_agents|AGENTS.md|append' skills/agent-doctor/SKILL.md`
   - Expected: skill references CLI hierarchy contract
2. **test** `npm test`
   - Expected: still green (docs-only skill change may not have tests; suite must not break)

## Integration

**Reachability:** Skill installed at `~/.agents/skills/agent-doctor` via install.sh symlink to repo.

**Data dependencies:** Implemented finding ids from engine REQs.

**Service dependencies:** None runtime.
