# Ideate — UR-002

**Reviewed:** 2026-07-15

## Explorer — Assumptions & Perspectives

- **“Skill policies” primarily means `skills/agent-doctor/SKILL.md` LOCAL POLICY + Project Instruction Hierarchy**, not every skills-hub rule: if capture scopes only the install/PATH bits and skips AGENTS.md-first, CLI and skill still disagree on the highest-friction policy agents already run. The brief’s conversation trail (AGENTS.md hub, vendor pointers, dry-run, no silent hub, no skill-tree copy) is the intended contract surface.
- **Two audiences care differently:** humans running `status`/`fix` vs agents following the skill’s Execution Loop. Green grades that ignore hierarchy will train agents to freestyle file creates while the CLI looks “healthy,” and vice versa if fix plans invent actions the skill forbids (e.g. content-copy, silent hub pick).
- **Fog: how much of the skill is CLI-enforced vs agent-only.** Hierarchy stubs/pointer appends are still skill-side; product/vault links and hub wiring already have domain findings. Without an explicit matrix, work will either overbuild (auto-rewrite CLAUDE.md bodies) or underbuild (docs-only alignment).
- **Fog: Gemini and other presence-only agents.** Skill says create `GEMINI.md` when Gemini is installed/primary, but adapters today are Claude/Codex/Grok-deep. Scope needs a decision: deep adapter vs hierarchy rules based on map primary + file presence only.

## Challenger — Risks & Edge Cases

- **False green:** Project has only `CLAUDE.md` with full policy and no `AGENTS.md`. Today instructions domain may be “ok” for Claude (file exists) while skill policy fails. Auto-creating stubs without migrating unique CLAUDE content can **orphan real rules** or leave dual sources of truth.
- **Pointer-only rewrites of fat CLAUDE.md:** Skill forbids wholesale replace; if fix auto-appends forever or forces thin pointers without consent, users lose project-specific agent guidance. Need “missing AGENTS link” finding + append-only / plan item, not delete-and-replace.
- **Product link domain vs hierarchy:** `product.missing_link` can fire on every instruction file; skill wants product linked from **AGENTS.md** with thin pointers. If fix still appends product blocks into CLAUDE.md and GEMINI.md, skill and CLI diverge again after “alignment.” Prefer product checks that treat AGENTS.md as the required surface when hierarchy is in force.
- **Skill over-claiming CLI capabilities:** Skill currently allows agents to create hierarchy files “when Doctor does not emit steps.” After alignment, skill must say CLI owns diagnose/plan/apply for hierarchy where implemented, or agents will keep bypassing dry-run/consent for those writes.
- **Test fixtures and multi-agent homes:** Expanding expected files (AGENTS.md always + pointer checks) will fail many existing tests and real maps; need fixtures that model hierarchy-healthy vs hierarchy-broken trees without requiring every agent binary.

## Connector — Links & Reuse

- **Reuse** `src/domains/instructions.ts`, `product.ts`, `fix/plan.ts` `append_instruction_link`, `fix/apply.ts` product/memory link blocks — extend rather than a parallel hierarchy engine.
- **Reuse** skill policy text as the acceptance oracle: LOCAL POLICY §3–6, Dry Run section, and Project Instruction Hierarchy detect table should map 1:1 to finding ids / fix kinds / skill wording.
- **Prior UR-001 decisions** still bind: no content copy of skill trees; no silent hub on conflict; green blocked on hub desync — alignment work must not weaken those.
- **product.md / design §7** already describe product-context links; hierarchy is the missing complementary path (shared instructions hub, not only product.md).

## Summary

The real deliverable is a **bidirectional contract**: CLI findings and fix plans implement the skill’s non-negotiables (especially AGENTS.md-first + plan-then-apply), and the skill only claims what the CLI can diagnose/fix. Biggest risk is false green and dual instruction sources; biggest reuse is extending the instructions/product domains and append_link fix path rather than inventing a second stack.
