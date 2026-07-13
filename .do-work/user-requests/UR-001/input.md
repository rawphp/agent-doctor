---
ur: UR-001
received: 2026-07-14
status: intake
---

# UR-001: User Request

## Request

/Users/tomkaczocha/EA/projects/agent-doctor/docs/superpowers/specs/2026-07-14-agent-doctor-design.md

## Clarifications

**Q:** Design says wire agents to one skills hub with “no copy,” but some agents may only load skills from their private home. When a detected agent cannot natively use the shared hub path, what should v1 do?
**A:** Symlink to hub — recommend (and plan-then-apply when safe) a symlink from the agent’s expected skills path to the sync target hub; still one physical tree, no content copy.

**Q:** Design includes an Obsidian domain (detect + wiring). If no vault is discovered or mapped on the machine, how should that affect overall green?
**A:** Ask the user for a vault path (do not auto-N/A or soft-fail forever without prompting).

**Q:** When no vault is found, when should that path prompt happen?
**A:** During init/map only. status/dashboard only report mapped vaults or “none configured — re-run init.”

**Q:** If any non-ignored first-class agent is off the skills sync hub (or hubs conflict with no sync_target), what is the strictest overall grade allowed?
**A:** Cannot be green — desync or unresolved multi-hub conflict ⇒ overall yellow or red only; other domains cannot average up to green.

**Q:** Capture needs project layers in `.do-work/config.yml`. For this CLI product, which layer set should REQs use?
**A:** cli, engine, adapters, surfaces

**Q:** What v1 bound for `status --all` over large mapped project trees?
**A:** No limit in v1 — walk everything mapped; performance is best-effort.
