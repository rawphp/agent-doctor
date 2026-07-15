# Agent Doctor — Product

## North star

**Agent Doctor runs on every computer that uses AI agents** — as routine machine hygiene, not a one-off debug script.

At least monthly, it verifies that the machine is configured correctly and efficiently: **one shared skills hub, many agents, no duplicated skill trees**, shared memory and product context where they belong, drift explained in plain language. When something is wrong, the user (or an agent acting for them) can fix wiring safely — plan first, apply on purpose.

Long-term, agents do not reinvent setup. They **reach for the shared hub** for skills, and they can **invoke Agent Doctor** to check or configure a project so every agent on that machine sees the same story.

## One-liner

The health check and wiring tool for multi-agent machines — keep skills, memory, and project context shared, not scattered.

## Why this product must exist

AI agents are becoming default software on personal and work machines. Each vendor ships its own config home, skills path, and instruction files. Without a common layer:

- Skills get **copied** into every agent home and rot out of sync  
- Memory and product context live in one tool and are invisible to another  
- “It works in Claude / fails in Codex” becomes a permanent tax  
- There is no shared language for “is this machine healthy?”

Antivirus-style ubiquity is the ambition: **not because every laptop needs a coding CLI today**, but because every laptop that runs AI assistants will need **one place that owns setup truth**.

## Habit product (how it stays on people’s minds)

Value is not only “fix once.” Value is **recurring confidence**.

| Cadence | Job |
|---------|-----|
| First run | `init` → map the machine; choose a skills hub if needed |
| Weekly / as needed | `status` / `dashboard` after installing an agent or skill |
| **Monthly (default ritual)** | Full check → report (terminal, HTML, later email) → optional fix plan |
| On demand (agents) | Agent or human invokes Doctor to verify or wire a **project** before real work |

**Scheduled monthly run + email report — yes, feasible.**

- **Schedule:** OS job (`launchd` on macOS, Task Scheduler / cron elsewhere) or a first-party `agent-doctor schedule` that installs a safe local timer. The CLI already produces structured output (`status --json`); that is enough for automation.  
- **Report:** HTML (exists as `dashboard` path) + machine-readable JSON → render a monthly summary.  
- **Email:** Out of process for core diagnosis. Plausible product path: optional local SMTP / system mail, or user-supplied webhook / provider token — **no cloud account required for the doctor itself**. Default can be “write report to disk + open / notify”; email is the push channel for people who want it.  
- **Policy:** Monthly job should be **diagnose (+ recommend) by default**. Auto-apply of fixes stays opt-in and plan-gated so a silent cron never rewires a machine without consent.

Until schedule/email ships, the product still earns the habit via: fast green/red, clear hub-conflict language, and dry-run fix plans worth re-running after every agent install.

## Who it's for

1. **Beachhead:** People with **two or more** AI coding / project agents on one machine (Claude Code, Codex, Grok, …).  
2. **Expansion:** Anyone whose machine runs multiple AI assistants that load skills, memory, or project instructions — not only “software engineers,” but **anyone doing real work with agents**.  
3. **Ultimate:** Every multi-agent computer, with Doctor as the default hygiene layer (install once, run monthly, forget the config maze).

## Problem we own

**Setup fragmentation across AI agents on a single machine** — skills, memory pointers, and project context duplicated or divergent — and the lack of a safe, shared way to measure and repair that.

We do **not** own: model quality, chat UX, skill authoring marketplaces, or running the agent’s work for the user.

## What we are

- A **portable, filesystem-first** sync and health tool  
- A **machine map** (agents, skills roots, vaults, project roots)  
- A **single report** scored for cross-agent alignment (terminal, HTML, JSON; later scheduled + email)  
- A **plan-then-apply fixer** for safe wiring (hub links, instruction/product/vault pointers, map fields)  
- Eventually an **agent-callable** setup surface: “configure / check this project for the fleet”

## What we are not

- An agent runner, chat product, or LLM-in-the-loop doctor  
- A cloud service that must see user code to work  
- A silent chooser when two populated skills hubs conflict  
- A copier of skill trees between agent homes  
- A full project generator / IDE / framework scaffolder (see scope below)

## Scope: projects (where value meets discipline)

**Too narrow:** Only “Node monorepos with CLAUDE.md.” Useful to few; easy to ignore.  
**Too wide:** “Any digital work on Earth, any tool, any framework.” Never green; never trusted.

**Winnable product scope:**

| Layer | In scope | Out of scope (for now) |
|-------|----------|------------------------|
| **Machine** | Detect installed agents; shared skills hub; vault/memory pointers; ignore list; sync score | Installing/upgrading agent apps; OS package management |
| **Skills** | One hub, many clients; no duplication; wire agents to chosen hub | Authoring skills; hosting a public skill store |
| **Project** | Ensure agent instruction surfaces **exist and link** shared product/memory context; consistent pointers so every agent can work the same repo | Owning the full project lifecycle (deploy, CI product, app runtime) |
| **Project types** | Any **local project directory** agents are asked to work in — code, docs, content, research — as long as the contract is “agents + shared skills/context,” not “we build your product” | Domain-specific generators (Rails app, marketing site templates) as core Doctor features |

### Project instruction hierarchy (AGENTS.md-first)

In a project, **`AGENTS.md` is the single source of truth** for shared agent instructions. Vendor entry files (`CLAUDE.md`, `GEMINI.md`, `GROK.md`, …) **point at** `AGENTS.md` rather than duplicating policy. Product context (`product.md` / `roadmap.md` when present) is linked from **`AGENTS.md`** and any **non-pointer** instruction bodies; pure pointer files stay thin and are not required to re-link product. Diagnose and repair hierarchy via Doctor (`status` / `check instructions` → `fix --dry-run` → `fix`) — agents should prefer that path over freestyle hierarchy writes when CLI findings cover the case.

**Principle:** Doctor configures the **agent environment around the project**, not the project’s business logic. A writing project and a SaaS repo both get: mapped agents, shared skills, **AGENTS.md-first** instructions, linked `product.md` / memory, healthy status. They do not both need Doctor to know their frameworks.

If a feature does not improve **shared, non-duplicated agent setup** or **recurring trust in that setup**, it is not the product.

## Principles (non-negotiable)

1. **Ubiquity through habit** — Design for monthly (and agent-triggered) runs, not only rescue after pain.  
2. **Always multi-agent** — Findings relative to the detected fleet, never one vendor as hero path.  
3. **One hub, many clients** — Shared skills and shared pointers; private copies are risk.  
4. **Align, don’t isolate** — Wire everyone to the shared hub; do not preach a single hard-coded path as brand.  
5. **Conflicts need a human (or explicit) choice** — Multiple populated hubs → unresolved until `sync_target` is set.  
6. **Recommend by default; write after plan + confirm** — Scheduled runs diagnose; apply stays gated.  
7. **No content duplication as a fix** — Wire and link; do not copy skill trees between homes.  
8. **Green means fleet agreement** — Non-ignored first-class agents agree on hub, memory/vault pointers, and product-context links.  
9. **Local-first trust** — Diagnosis works offline on disk; optional email/notify never becomes a hard dependency.

## Success

### Near-term (shipped / shipping)

- `init` once → durable map  
- `status` / `dashboard` → understand sync health in **under a minute**  
- Hub conflict is a **clear decision**, not a mysterious red score  
- Choose hub → dry-run plan → apply → re-check  
- Product/memory context **linked**, not pasted into every agent  

### Habit (next product tier)

- User (or schedule) runs Doctor **at least monthly** without thinking  
- Report is shareable with self: HTML file and/or **email summary**  
- After installing a new agent or skill, the obvious next step is Doctor  

### North-star outcomes

- On multi-agent machines, **default expectation** is a shared skills hub with zero intentional duplication  
- Agents and humans **invoke Doctor** when starting or health-checking project work  
- “Is my AI setup healthy?” has one answer people trust — the same way they trust a backup or update check  

## Product surfaces

| Surface | Job today | Direction |
|---------|-----------|-----------|
| `init` / `map` | Discover & persist machine map | Remains foundation |
| `status` | Hybrid health (project + fleet) | Core monthly signal |
| `status --all` | Machine / multi-project | Monthly deep check |
| `dashboard` | Same report as HTML | Basis for pretty monthly report |
| `fix` | Plan → confirm → apply | Stays explicit; optional aggressive auto only if user opts in |
| `agents` / `check` | Inventory / single domain | Power-user and automation |
| **Skill `agent-doctor`** | Agents install CLI if needed; context-aware status + plan→fix for project or machine | Primary agent-callable surface (see `skills/agent-doctor/`) |
| *(planned)* schedule / report / email | — | Monthly ritual + push summary |

## Beachhead → world

1. **Now:** Coding / project agents on one Mac (or similar) — Claude, Codex, Grok deep; others presence-honest.  
2. **Next:** Habit layer (schedule, report artifact, optional email); more adapters; agent-callable CLI contract.  
3. **Then:** Any AI-assisted project type on the machine under the same setup contract.  
4. **Ambition:** Default hygiene install wherever multi-agent work happens — “every computer” meaning every computer that needs shared agent setup truth.

## How agents and humans should use this file

This is **product truth**. Design specs and code implement it; they do not redefine it.

Prefer, in order:

1. Fleet sync and non-duplication over convenience for one agent  
2. Explicit choice on conflicts over silent defaults  
3. Safe, reversible wiring over clever rewrites  
4. Recurring trust (monthly / agent-triggered) over one-time cleverness  

Sequencing and release detail belong in `roadmap.md` (or equivalent), not here.
