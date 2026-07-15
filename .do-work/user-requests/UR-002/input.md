---
ur: UR-002
received: 2026-07-15
status: captured
classification: feature
layers_in_scope: [cli, engine, adapters, surfaces]
layer_decisions: {}
reqs:
  - { id: REQ-026, layer: none, integration_confidence: n/a }
  - { id: REQ-027, layer: engine, integration_confidence: high }
  - { id: REQ-028, layer: adapters, integration_confidence: high }
  - { id: REQ-029, layer: cli, integration_confidence: high }
  - { id: REQ-030, layer: none, integration_confidence: n/a }
  - { id: REQ-031, layer: engine, integration_confidence: high }
  - { id: REQ-032, layer: engine, integration_confidence: high }
  - { id: REQ-033, layer: none, integration_confidence: n/a }
  - { id: REQ-034, layer: engine, integration_confidence: high }
  - { id: REQ-035, layer: none, integration_confidence: n/a }
  - { id: REQ-036, layer: surfaces, integration_confidence: high }
  - { id: REQ-037, layer: surfaces, integration_confidence: high }
acknowledged_partials: []
---

<!-- capture-summary-start -->
## Capture summary (2026-07-15)

| Item | Value |
|---|---|
| Classification | feature |
| Layers in scope | cli, engine, adapters, surfaces |
| Layer decisions | (none — all covered) |
| REQs generated | 12 |

| REQ | Layer | Integration confidence |
|---|---|---|
| REQ-026 | none | n/a |
| REQ-027 | engine | high |
| REQ-028 | adapters | high |
| REQ-029 | cli | high |
| REQ-030 | none | n/a |
| REQ-031 | engine | high |
| REQ-032 | engine | high |
| REQ-033 | none | n/a |
| REQ-034 | engine | high |
| REQ-035 | none | n/a |
| REQ-036 | surfaces | high |
| REQ-037 | surfaces | high |
<!-- capture-summary-end -->

# UR-002: User Request

## Request

we need to make sure that the cli supports the skill policies and vice-versa

## Clarifications

**Q:** What does “skill policies” mean for this brief?
**A:** The contract in `skills/agent-doctor/SKILL.md` (LOCAL POLICY + Project Instruction Hierarchy + dry-run/plan-then-apply). Hierarchy is not CLI-enforced yet; product/hub/dry-run policies are partly in CLI already. Prior decisions still bind: no silent hub pick, no skill-tree content copy. Project layers remain `cli`, `engine`, `adapters`, `surfaces`. *(inferred, confirmed)*

**Q:** You said the CLI must support skill policies and vice-versa. For project instruction hierarchy (AGENTS.md required; CLAUDE.md/GEMINI.md/etc. must point at it), how far should the CLI go in v1 of this UR?
**A:** Diagnose + plan + apply — findings for missing AGENTS.md / missing pointers; `fix --dry-run` plans stub+append; apply with consent (same plan-then-apply as other fixes).

**Q:** Skill policy wants product/vault context on AGENTS.md with thin vendor pointers. After alignment, where should product.md (and similar) links be required?
**A:** AGENTS.md plus any non-pointer instruction file — AGENTS.md always; also require product link on vendor files that still hold unique body content beyond a pointer.

**Q:** Skill mentions GEMINI.md when Gemini is installed/primary. The CLI today has no deep Gemini adapter. For this UR, how should Gemini (and other non-deep agents) enter hierarchy rules?
**A:** Map primary + file presence only — no full Gemini adapter; if primary:gemini or GEMINI.md exists / agent installed as presence, require pointer rules like Claude.

**Q:** For missing AGENTS.md under diagnose+plan+apply: what may fix create without further content invention?
**A:** Minimal stub only — short AGENTS.md stub matching skill template; never invent project-specific policy; pointers get append-only AGENTS.md blocks.
