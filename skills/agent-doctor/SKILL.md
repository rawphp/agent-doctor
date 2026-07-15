---
name: agent-doctor
description: 'Install and run Agent Doctor to diagnose and fix multi-agent machine setup (shared skills hub, AGENTS.md as canonical project instructions, CLAUDE.md/GEMINI.md pointers, vaults, product.md). Use when agents disagree on skills, setup is red/yellow, wiring a project for Claude/Codex/Grok/Gemini, hub conflict, monthly health check, or configure agents for this project. Differentiator: drives the agent-doctor CLI (plan-then-apply) and enforces AGENTS.md-first project instructions — not skill writing craft (effective-agent-skills) and not hub layout alone (skills-hub).'
---

# Agent Doctor

Use the **agent-doctor CLI** for multi-agent setup health and safe wiring (skills hub, instruction files, vault/product links). Prefer this over hand-editing every agent home. Hub layout merge mechanics live in the `skills-hub` skill — load that when client skills dirs are real trees that must be merged before wiring.

**Project instructions rule:** In a project, **`AGENTS.md` is the single source of truth.** Other vendor instruction files (`CLAUDE.md`, `GEMINI.md`, `GROK.md`, …) must **point at `AGENTS.md`**, not duplicate the body.

## LOCAL POLICY (READ FIRST — OVERRIDES EVERYTHING BELOW)

**Mandatory before any write that changes agent config or the machine map:**

1. Prefer the official CLI and this skill’s `scripts/ensure-installed.sh` — do not reimplement Doctor checks in prose or ad-hoc scripts.
2. Put `~/.local/bin` on `PATH` when needed: `export PATH="$HOME/.local/bin:$PATH"`.
3. **Never invent a skills hub.** If hubs conflict, list candidates from the report and wait for an explicit user choice (common pick: `~/.agents/skills`). Pass it as `--sync-target <path>`.
4. **Always dry-run before apply.** `agent-doctor fix --dry-run` first. Apply only after the user reviews the plan (or they explicitly said to apply/fix in this turn).
5. **Never copy skill trees** between agent homes as a “fix.” Wire clients to one hub.
6. **Project instruction hierarchy (non-negotiable when in a project):**
   - **`AGENTS.md` must exist** at the project root (minimal stub only — do not invent a long policy dump).
   - **Every other project instruction file** used by an installed or primary agent must **tell that agent to read `AGENTS.md`** (link / “read AGENTS.md first” pointer). Do **not** paste the full AGENTS body into `CLAUDE.md` / `GEMINI.md` / etc.
   - Known pointer files: `CLAUDE.md`, `GEMINI.md`, `GROK.md`, and any other project-level `*AGENTS*` / vendor instruction markdown the fleet uses.
   - Create or update a pointer file when: it **already exists**, **or** that agent is **installed / primary** in the workspace (from `agent-doctor agents` or map primaries). Example: Gemini primary or `GEMINI.md` present → ensure `GEMINI.md` points at `AGENTS.md`.
   - **Prefer `agent-doctor fix` for hierarchy when findings exist.** Diagnose with `status` / `check instructions`; plan with `fix --dry-run`; apply with `fix` / `fix --yes`. Stable finding ids: `instructions.hierarchy_missing_agents_md`, `instructions.hierarchy_missing_pointer`. Fix kinds: `create_agents_stub`, `append_agents_pointer`.
   - **Do not freestyle hierarchy writes** when the CLI covers them (ids/kinds above). Agent-side create/append is a last resort only if Doctor is unavailable or dry-run does not plan a needed covered step — still minimal stub / append-only pointer; never wholesale rewrite vendor files.
7. **Do not rewrite whole** instruction files when a small append or Doctor plan covers it. Prefer `agent-doctor fix` for hub/product/vault **and** hierarchy (AGENTS stub + pointers). Agent freestyle only when the CLI does not cover the case.
8. **`--force` is a hard gate.** Use only when the plan requires it **and** the user understands non-empty agent-local skills dirs may become hub symlinks. Merge uniques into the hub first (`skills-hub`).
9. **Do not use `sudo`.** Permission findings are reportable; escalate to the user.
10. Product north star (when present): project `product.md`, linked from **`AGENTS.md`** (and thus visible via pointers). Implementation detail stays in the CLI/`--help`, not reinvented here.

If any text below conflicts with this block, **this block wins**.

## Project Instruction Hierarchy

Canonical layout for a project root:

```text
project/
  AGENTS.md          # REQUIRED — shared instructions for all agents
  CLAUDE.md          # pointer → read AGENTS.md (if Claude in play)
  GEMINI.md          # pointer → read AGENTS.md (if Gemini in play)
  GROK.md            # optional pointer if used
  product.md         # product truth — linked from AGENTS.md when present
```

### When to enforce

Diagnose hierarchy whenever scope is **project** (cwd/project root has project signals) as part of the Execution Loop — not only when the user mentions instruction files. Prefer CLI `status` / `check instructions` + `fix` (LOCAL POLICY §6); do not freestyle hierarchy when Doctor findings and fix kinds cover the case.

### Detect who needs a pointer

| Create/update pointer if… | File |
| --- | --- |
| Always (project scope) | `AGENTS.md` exists (create if missing) |
| `CLAUDE.md` exists **or** Claude Code is installed/primary | `CLAUDE.md` → points to `AGENTS.md` |
| `GEMINI.md` exists **or** Gemini is installed/primary | `GEMINI.md` → points to `AGENTS.md` |
| `GROK.md` exists **or** Grok is installed/primary and project uses GROK.md | `GROK.md` → points to `AGENTS.md` |
| Other vendor project instruction `.md` exists | That file → points to `AGENTS.md` |

Codex and many agents already read `AGENTS.md` directly — still keep `AGENTS.md` as the hub; do not delete vendor pointer files that other tools need.

### Pointer content (minimal)

A pointer file is **satisfied** if its body clearly directs the agent to read `AGENTS.md` (basename or relative path). Prefer a short dedicated block; append if the file already has content.

**CLAUDE.md** (example — create or append if missing the pointer):

```markdown
# Claude Code — project entry

Read and follow **[AGENTS.md](./AGENTS.md)** for all project instructions, policies, and shared agent setup. Prefer AGENTS.md over duplicating rules here.
```

**GEMINI.md** (example):

```markdown
# Gemini — project entry

Read and follow **[AGENTS.md](./AGENTS.md)** for all project instructions, policies, and shared agent setup. Prefer AGENTS.md over duplicating rules here.
```

### AGENTS.md stub (only if missing)

Do **not** invent a novel product. Minimal create:

```markdown
# AGENTS.md

Shared project instructions for all AI coding agents on this machine.

## Product

- See [product.md](./product.md) when present.

## Setup

- Shared skills hub and fleet health: use the `agent-doctor` skill / `agent-doctor status`.
- Vendor entry files (`CLAUDE.md`, `GEMINI.md`, …) should point here; do not fork policy into those files.
```

If `product.md` does not exist, omit or soften that bullet — do not create `product.md` unless the user or Doctor plan asks for it.

### Verify hierarchy

After fix apply (or rare freestyle last-resort writes), confirm via Doctor first:

```bash
agent-doctor status --json
# or: agent-doctor check instructions
test -f AGENTS.md
# Optional spot-check: pointer files reference AGENTS.md (case-insensitive)
rg -i 'agents\.md' CLAUDE.md GEMINI.md GROK.md 2>/dev/null || true
```

Also run `check product` when `product.md` exists so product links stay aligned with AGENTS.md-first policy.

### Safety

- **Prefer CLI** for stub create and pointer append (`create_agents_stub` / `append_agents_pointer`). Freestyle only when CLI does not cover (LOCAL POLICY §6).
- **Never** replace a large existing `CLAUDE.md` / `GEMINI.md` with only a pointer if it holds unique project rules — **move** unique rules into `AGENTS.md` first (with user consent if non-trivial), then leave a pointer (+ optional short local-only notes).
- **Never** duplicate the full AGENTS body into every vendor file.
- Machine-only / non-project scope: skip hierarchy file creation unless the user names a project path.

## Picking the Right Command

| User / situation | Prefer | Notes |
| --- | --- | --- |
| First time / no `~/.agent-doctor/map.yml` | `init` | Use `--yes` when the user cannot answer vault prompts |
| Refresh discovery; keep `sync_target` | `map` | Same vault flags as init path |
| In a project (`.git`, `AGENTS.md`, `CLAUDE.md`, `product.md`, package manifests, …) | `status` (+ `check instructions` if needed) | Hybrid status surfaces hierarchy findings; then `fix --dry-run` |
| Project missing AGENTS.md / vendor files don’t link it | `status` / `check instructions` → `fix --dry-run` | Hierarchy findings → CLI plan/apply; do not freestyle when covered (LOCAL POLICY §6) |
| Whole machine / monthly / all projects | `status --all` | Hierarchy only for project roots you are actively fixing |
| Agent needs structured output | `status --json` or `status --all --json` | Preferred for agents over terminal chrome |
| List fleet + adapter depth / who is primary | `agents` | Drives which pointer files to create |
| One domain named by user | `check <domain>` | e.g. `skills`, `product`, `instructions` |
| Human wants browser report | `dashboard` | Read-only; never applies fixes |
| See what would change | `fix --dry-run` | No writes |
| Hub conflict on dry-run | `fix --dry-run --sync-target <hub>` | Hub path must be user-chosen |
| Apply after plan approved | `fix` or `fix --yes` | `--yes` only when user asked to apply without prompts |
| Install / distribute this skill into hub | `./install.sh` | Symlinks skill → `~/.agents/skills/agent-doctor` |
| Client skills dir is a real tree with unique skills | **skills-hub** skill | Merge into hub, then Doctor wire |

## Required Environment

- Node.js **20+**, `npm`, `git` for install; `curl` for bootstrap.
- Binary default install: `~/.local/bin/agent-doctor` (not the unrelated npm package name on the public registry).
- Map file: `~/.agent-doctor/map.yml` (created by `init` / updated by `map` and safe fixes).
- Ensure CLI:

```bash
bash ~/.agents/skills/agent-doctor/scripts/ensure-installed.sh
# or from this skill tree:
bash scripts/ensure-installed.sh
```

Manual install if the script is unavailable:

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/rawphp/agent-doctor@main/scripts/bootstrap.sh | bash
export PATH="$HOME/.local/bin:$PATH"
agent-doctor --version
```

If install fails (no Node, no network), **stop** and tell the user. Do not invent a health report.

## CLI Rules

- Prefer `agent-doctor <command> --help` for flag completeness; this skill covers the 80% path.
- Agents should prefer `--json` on `status` when parsing findings.
- Empty fix plan **plus** hub conflict is **not** healthy — resolve `sync_target` first.
- `--yes` / `--non-interactive` skips prompts (init/map/fix). Safe for CI; for interactive users, prefer showing the plan first.
- `dashboard` and `fix --html` are read-only previews. Apply stays on `fix` without `--dry-run`.
- Scope: **project context** → default hybrid `status` + instruction hierarchy. **Machine / monthly** → `status --all`. Explicit user scope always wins.
- Product/vault links belong in **`AGENTS.md`** (or via Doctor appends that land on instruction surfaces). Pointer files only delegate to `AGENTS.md`.

## Execution Loop

1. Ensure the CLI is installed (`scripts/ensure-installed.sh` or version check).
2. Detect scope: project vs machine vs user-explicit (see Picking table).
3. Ensure map: `test -f ~/.agent-doctor/map.yml || agent-doctor init --yes`.
4. If **project scope**: diagnose **Project Instruction Hierarchy** via `status` / `check instructions` (LOCAL POLICY §6) — look for `instructions.hierarchy_*` findings. Use `agent-doctor agents` when unsure which vendors are in play.
5. Diagnose with the narrowest matching command (`status`, `status --all`, `check`, `agents`).
6. If grade is green enough for the task **and** hierarchy findings are clear, report and stop.
7. Build a plan: `agent-doctor fix --dry-run` (+ `--sync-target` if conflict and hub is known). Hierarchy is included when findings exist (`create_agents_stub` / `append_agents_pointer`).
8. If hub is still unresolved, list candidates, ask the user, then re-run dry-run with `--sync-target`.
9. Summarize the dry-run plan (include hierarchy steps when present). **Do not apply** until consent (or explicit apply this turn). **Do not freestyle** hierarchy creates/appends when the plan covers them (LOCAL POLICY §6).
10. Apply: `agent-doctor fix` (interactive) or `agent-doctor fix --yes` (approved non-interactive), with the same `--sync-target` if required. Add `--force` only under LOCAL POLICY §8.
11. Re-run the same diagnose command as step 5 (and hierarchy verify if needed). Report grade, what changed (including AGENTS/pointer via fix), and remaining blockers with exact next commands.

## Commands

| Command | Side effects | Typical use |
| --- | --- | --- |
| `agent-doctor init` | Writes/updates `~/.agent-doctor/map.yml` | First-run discovery |
| `agent-doctor map` | Updates map discovery fields; preserves `sync_target` / ignored | Refresh inventory; vault flags |
| `agent-doctor status` | Read-only (exit code reflects grade) | Project + fleet health |
| `agent-doctor status --all` | Read-only | Machine / multi-project |
| `agent-doctor status --json` | Read-only | Agent-parseable Report |
| `agent-doctor dashboard` | Local HTML server only | Human overview |
| `agent-doctor agents` | Read-only | Fleet + adapter depth; who needs pointer files |
| `agent-doctor check [domain]` | Read-only | Single domain |
| `agent-doctor fix --dry-run` | **No writes** | Plan only (includes hierarchy when findings exist) |
| `agent-doctor fix` | Writes after confirm | Apply safe wiring + hierarchy kinds |
| `agent-doctor fix --yes` | Writes without confirm | User-approved apply |
| `scripts/ensure-installed.sh` | May install CLI via bootstrap | Prerequisite |
| Hierarchy via CLI | `fix --dry-run` → `fix` | Findings `instructions.hierarchy_*` → kinds `create_agents_stub` / `append_agents_pointer` |

**Exit codes (status/fix after checks):** `0` green, `1` yellow, `2` red, `3` tool error.

## Dry Run (zero-write plan preview)

Use `agent-doctor fix --dry-run` before any Doctor apply.

- Builds a plan from live findings. Prints steps; does not mutate the map, symlinks, or instruction files.
- Optional: `fix --dry-run --html` for a browser plan preview (still no apply).
- Empty plan is fine when already healthy. Empty plan **with** hub conflict means auto-wire is blocked until `--sync-target` is set.
- Hierarchy is **included** in the dry-run when `instructions.hierarchy_missing_agents_md` / `instructions.hierarchy_missing_pointer` findings exist — look for kinds `create_agents_stub` and `append_agents_pointer`. Prefer that plan over freestyle file writes (LOCAL POLICY §6).
- To execute Doctor for real: same flags without `--dry-run`, with user confirmation or `--yes` after approval.
- Never treat dry-run success as “machine fixed.”

Example:

```bash
agent-doctor fix --dry-run
agent-doctor fix --dry-run --sync-target ~/.agents/skills
agent-doctor fix --dry-run --sync-target ~/.agents/skills --html
```

## Error Codes / Failure Modes

| Symptom | Meaning | What to do |
| --- | --- | --- |
| `agent-doctor: command not found` | CLI missing or not on PATH | Run `scripts/ensure-installed.sh`; `export PATH="$HOME/.local/bin:$PATH"` |
| Node version error on install | Node older than 20 | Stop; ask user to install Node 20+ |
| No map / soft discover | Map missing | `agent-doctor init --yes` then re-status |
| Overall RED/YELLOW + hub conflict | Multiple populated skills roots | Ask user for hub; `fix --dry-run --sync-target <path>` |
| Empty dry-run plan + still red | Conflict or no safe auto actions | Read recommendations; do not claim healthy |
| Missing `AGENTS.md` in project | `instructions.hierarchy_missing_agents_md` | `fix --dry-run` → apply `create_agents_stub` (LOCAL POLICY §6); re-status |
| `CLAUDE.md` / `GEMINI.md` has no AGENTS pointer | `instructions.hierarchy_missing_pointer` | `fix --dry-run` → apply `append_agents_pointer`; do not paste full AGENTS body |
| Unique rules only in `CLAUDE.md` | Policy forked | Move shared rules into `AGENTS.md` (consent if large); leave pointer; not a freestyle hierarchy stub case |
| `product.missing_link` | Instruction files omit product/roadmap | Link from **AGENTS.md** (and via Doctor `append_instruction_link`); pure pointers stay thin |
| Permission denied paths | FS access blocked | Report finding; no sudo |
| `--force` required messaging | Non-empty local skills dir | Merge uniques via skills-hub; user approval; then `--force` |
| Dashboard port in use | Port busy | CLI retries / `--port`; print URL |
| User refuses apply | No consent | Deliver dry-run plan as the outcome |

## Command Details

### Ensure installed

Use `scripts/ensure-installed.sh`. Idempotent. Installs via official bootstrap only if the CLI is missing.

Side effects: May download/install into `~/.local` when absent.
Polling: None.

Safety:
- Requires network + Node 20+ + git for first install.
- Does not write agent config, map fixes, or skill trees.
- Prefer this script over ad-hoc `npm install -g agent-doctor` (public name is unrelated).

Example:

```bash
bash ~/.agents/skills/agent-doctor/scripts/ensure-installed.sh
agent-doctor --version
```

### Init

Use `agent-doctor init`. Discover agents, skills roots, vaults, project roots; write the home map.

Side effects: Writes `~/.agent-doctor/map.yml`.
Polling: None.

Safety:
- Prefer `--yes` when the agent cannot interact for vault prompts.
- Do not invent vault paths; skip or ask.

Example:

```bash
agent-doctor init --yes
```

### Map

Use `agent-doctor map`. Refresh discovery; preserve `sync_target` and ignored agents.

Side effects: Updates map discovery fields; vault flags may add/replace vault entries.
Polling: None.

Safety:
- Vault path must exist on disk when set.
- `--set-vault` / `--replace` replaces the vault list — confirm intent with the user.

Example:

```bash
agent-doctor map --yes
agent-doctor map --add-vault ~/Notes
agent-doctor map --set-vault ~/EA/cowork/my-wiki
```

### Status

Use `agent-doctor status`. Hybrid health: current project (if any) + global agents/skills/vaults.

Side effects: Read-only. Exit code reflects grade.
Polling: None.

Safety:
- Prefer `--json` for agents.
- Use `--all` only for machine / multi-project scope.
- After hierarchy changes, re-run status so findings match disk.

Example:

```bash
agent-doctor status
agent-doctor status --json
agent-doctor status --all --json
```

### Dashboard

Use `agent-doctor dashboard`. Serve the same report as HTML on loopback.

Side effects: Local HTTP server only; does not apply fixes.
Polling: None (server runs until Ctrl+C).

Safety:
- Apply remains CLI-only.
- `--no-open` when a browser pop is unwanted.

Example:

```bash
agent-doctor dashboard --no-open --port 0
```

### Agents

Use `agent-doctor agents`. List detected agents and adapter depth (full vs presence-only).

Side effects: Read-only.
Polling: None.

Safety:
- Use results to decide which pointer files (`CLAUDE.md`, `GEMINI.md`, …) to ensure under LOCAL POLICY §6.

Example:

```bash
agent-doctor agents
```

### Check

Use `agent-doctor check [domain]`. Run one domain under the sync lens.

Side effects: Read-only.
Polling: None.

Safety:
- Use when the user names a single concern; otherwise prefer full `status`.
- `check instructions` / `check product` after hierarchy edits.

Example:

```bash
agent-doctor check skills
agent-doctor check product
agent-doctor check instructions
agent-doctor check --help
```

### Ensure project instruction hierarchy

Use the **CLI path** when scope is a project (LOCAL POLICY §6). Prefer `agent-doctor fix` over agent freestyle whenever hierarchy findings exist.

**Stable finding ids** (must match CLI / design; do not invent aliases in prose when reporting):

| Finding id | When |
| --- | --- |
| `instructions.hierarchy_missing_agents_md` | Project root has no `AGENTS.md` |
| `instructions.hierarchy_missing_pointer` | Required vendor file absent or body does not reference `AGENTS.md` |

**Fix kinds** (from `fix --dry-run` / apply):

| Kind | Action |
| --- | --- |
| `create_agents_stub` | Minimal `AGENTS.md` stub only (never invent long policy) |
| `append_agents_pointer` | Append-only `AGENTS.md` pointer in vendor instruction file |

Side effects: Via `agent-doctor fix` when the plan includes the kinds above — creates stub and/or appends pointer blocks. Does not wholesale rewrite vendor bodies.
Polling: None. Re-run `status` / `check instructions` after apply.

Safety:
- LOCAL POLICY §6 is authoritative: **prefer fix when findings exist; do not freestyle hierarchy when CLI covers it.**
- Freestyle create/append only if Doctor is unavailable or dry-run omits a needed covered step — still minimal stub / append-only.
- If migrating unique content from `CLAUDE.md` into `AGENTS.md`, get consent for non-trivial moves (not an auto-fix kind).
- Do not create pointer files for agents that are neither installed/primary nor already present on disk.

Example sequence:

```bash
# From project root
agent-doctor agents
agent-doctor status --json
# or: agent-doctor check instructions
agent-doctor fix --dry-run
# Expect create_agents_stub / append_agents_pointer when hierarchy findings exist
agent-doctor fix   # or fix --yes after consent
agent-doctor status --json
```

### Fix (dry-run)

Use `agent-doctor fix --dry-run`. Build plan from findings; no writes.

Side effects: None on disk.
Polling: None.

Safety:
- Required before Doctor apply in normal agent flows.
- On hub conflict, re-run with user-chosen `--sync-target`.
- Hierarchy steps appear here when `instructions.hierarchy_*` findings exist — do not list freestyle hierarchy writes as separate from this plan.

Example:

```bash
agent-doctor fix --dry-run --sync-target ~/.agents/skills
```

### Fix (apply)

Use `agent-doctor fix`. Plan-then-apply safe wiring after confirmation.

Side effects: May set `sync_target`, symlink/wire skills dirs to the hub, append instruction link blocks, create minimal `AGENTS.md` stub (`create_agents_stub`), append AGENTS pointers (`append_agents_pointer`), update map fields. Does not copy skill trees, delete vault notes, or install agent apps.
Polling: None. Re-run `status` after apply.

Safety:
- LOCAL POLICY: dry-run first; apply only with consent or explicit apply this turn.
- `--yes` skips confirmation — only after approval.
- `--force` only under LOCAL POLICY §8.
- Partial apply may skip conflicted files; report and re-status.
- Product/vault links should end up consistent with **AGENTS.md**-first hierarchy.

Example:

```bash
agent-doctor fix --sync-target ~/.agents/skills
agent-doctor fix --yes --sync-target ~/.agents/skills
```

## Report Format (what to tell the user)

1. **Scope** — project path vs machine (`--all`)  
2. **CLI** — installed version  
3. **Instruction hierarchy** — `AGENTS.md` present? which pointers updated/created?  
4. **Grade** + skills sync target (or unresolved)  
5. **Top findings** — agents affected  
6. **Plan or applied steps** — dry-run vs writes  
7. **Next command** if still not green  

Do not report internal implementation noise unless the user asks.

## Related Skills

| Skill | Use when |
| --- | --- |
| `skills-hub` | Install a skill into `~/.agents/skills`; merge/wire client dirs to the hub |
| `effective-agent-skills` | Authoring or editing SKILL.md craft |
| `distribute-skill-to-all-agents` | Older multi-client distribute paths; prefer hub layout first |

## Extra Help

```bash
agent-doctor --help
agent-doctor fix --help
agent-doctor status --help
agent-doctor map --help
```
