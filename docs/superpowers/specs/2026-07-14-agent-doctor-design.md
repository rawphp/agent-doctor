# Agent Doctor — Design Spec

**Date:** 2026-07-14  
**Status:** Draft for user review  
**Repo:** `agent-doctor` (greenfield)

## 1. Purpose

Agent Doctor is a **portable sync and health tool** for people who use multiple AI coding agents (Claude Code, Codex, Grok, and others).

**North star:** Make all provider agents on a machine use the **same** skills, memory, and related config — **one hub, many clients** — with little or no duplication. Detect drift, explain it clearly, and optionally repair wiring via plan-then-apply.

It does **not** run agents, install agent binaries, or call LLMs. It inspects the filesystem and known config layouts, scores sync health, and guides fixes.

### Target users

- Developers running several agent CLIs/IDEs on one machine  
- Business and non-technical users learning agents who need a clear “is my setup right?” picture  
- Anyone maintaining shared skills/memory across tools  

### Success criteria (v1)

- User can `init` once, then `status` or `dashboard` and understand overall sync health in under a minute  
- Findings always consider **all detected agents**, not a single default product  
- Green means non-ignored first-class agents agree on skills hub, memory/vault pointers, and product-context links (low duplication)  
- `fix --dry-run` / `fix` can apply safe wiring changes after one confirmation  
- Terminal and HTML surfaces show the **same** report (one scoring path)  

## 2. Product shape

### Modes (all available)

| Mode | Meaning | How users get it |
|------|---------|------------------|
| **A — Diagnose** | Health/sync report only | `status`, `dashboard` |
| **B — Recommend** | Report + concrete next steps | Default on findings |
| **C — Auto-fix** | Apply safe config/link edits | `fix --dry-run` then `fix` (plan-then-apply) |
| **D — Wizard** | First-run discovery and map | `init` |

### Architecture (Approach 1 — check engine + dual surface)

```
init/map  →  home map (persisted)
                ↓
           check engine  →  report (JSON)
                ↓
     ┌──────────┼──────────┐
  status    dashboard    fix (plan → apply)
 (terminal)  (HTML)      (with confirm)
```

| Layer | Responsibility |
|-------|----------------|
| **Map** | Discover & store agents, skills roots, vaults, project roots |
| **Adapters** | Per-provider detect + how skills/instructions/memory are wired |
| **Domains** | Structured checks; **cross-agent sync is the lens** on all domains |
| **Engine** | Produce one structured report |
| **Surfaces** | Terminal, HTML dashboard, fix applicator, init |
| **Policy** | Default recommend-only; writes only via plan-then-apply |

### Runtime

- **v1:** Node or Bun CLI (`agent-doctor`, also via `npx`)  
- **Later (dual-ship):** native binary producing the **same report schema**  

## 3. Sync-first principles

1. **Always multi-agent** — Every finding and recommendation is relative to the set of **detected** agents. Never assume the user’s daily driver is Grok, Claude, or any single product.  
2. **One hub, many clients** — Optimize toward shared skills roots and shared memory/product pointers; flag per-agent private copies as duplication risk.  
3. **No hard-coded hero path** — Skills roots come from map + discovery (e.g. `~/.agents/skills`, `~/.claude/skills`, user-configured paths). Copy names the **resolved** hub, not a baked-in slogan path.  
4. **Align, don’t isolate** — Prefer: “Shared skills hub X; Claude ✓ Codex ✗ Grok ✗ — wire Codex and Grok to X (no copy).” Avoid: “Point Grok at ~/.agents/skills” as the default narrative.  
5. **Conflicts need a choice** — If two roots both have real content, do not silently pick. Report conflict; recommend choose-one or merge; fix only after a clear sync target.  
6. **Optional primary agents** — `init` may mark primaries for sort order and UX emphasis only. **Success bar is sync across all non-ignored detected agents**, not “primary is fine.”  
7. **Ignore list** — User may mark an agent `ignored: true` in the map so it does not block green (e.g. abandoned install).  

### Skills and memory model (hybrid)

- **Global skills root(s)** — portable skill library shared by agents  
- **Optional per-project overlay** — project-local skills that extend the global hub  
- **Memory** — prefer one story (e.g. Obsidian vault path + project `product.md` / `roadmap.md`) **linked** from each agent’s instruction files, not duplicated bodies  
- Doctor flags divergent roots, missing wires, and duplicated skill trees across agent homes  

## 4. Scan scope

| Invocation | Scope |
|------------|--------|
| `agent-doctor status` (default) | **Hybrid:** current working project (if any) **+** global agents / skills / vaults that affect shared setup |
| `agent-doctor status --all` | **Machine:** hybrid layers **+** every project under mapped project roots |
| `agent-doctor dashboard` | Same engine; default hybrid; Machine view uses `--all` data |

Map is inventory + hints. Every run still performs **live** filesystem checks.

## 5. Commands (v1)

| Command | Behavior |
|---------|----------|
| `agent-doctor init` | Discover agents, skills roots, vaults, project roots; optional prompts (roots, ignored agents, primaries); write `~/.agent-doctor/map.yml` |
| `agent-doctor map` | Rebuild/refresh map only (same discovery, less wizard chrome) |
| `agent-doctor status` | Hybrid check → terminal dashboard |
| `agent-doctor status --all` | Multi-project / machine view |
| `agent-doctor status --json` | Machine-readable report |
| `agent-doctor dashboard` | Local HTML UI from report; open browser |
| `agent-doctor fix --dry-run` | Build fix plan from findings; no writes |
| `agent-doctor fix` | Show plan → confirm → apply selected/all safe actions → re-check |
| `agent-doctor check [domain]` | Optional single-domain run |
| `agent-doctor agents` | Detected agents + adapter depth (full / presence-only) |

**Non-technical happy path:** `init` once → `status` or `dashboard` regularly → `fix` when ready.

## 6. Home map

**Path:** `~/.agent-doctor/map.yml` (versioned)

```yaml
version: 1
skills:
  # Discovered candidate hubs. Resolution: use sync_target if set; else the single
  # populated root if only one has content; else conflict (no silent pick).
  global_roots: []
  sync_target: null  # required before wire-fixes when multiple hubs have content
vaults:
  - path: ""
    source: discovered  # or manual
agents:
  - id: claude-code
    adapter: claude-code
    config_home: ""
    primary: false
    ignored: false
  - id: codex
    adapter: codex
    config_home: ""
    primary: false
    ignored: false
  - id: grok
    adapter: grok
    config_home: ""
    primary: false
    ignored: false
projects:
  roots: []
  entries: []  # optional cache from last full scan
```

## 7. Report schema

Single source of truth for terminal, HTML, and fix:

```ts
type Report = {
  generated_at: string
  scope: "hybrid" | "machine"  // hybrid = default status; machine = --all
  project_root?: string
  sync: {
    skills_hub?: string
    memory_hubs: string[]  # e.g. vault paths
    agents_in_scope: string[]  # detected, non-ignored
    aligned: boolean
  }
  overall: { score: number; grade: "green" | "yellow" | "red" }
  agents: AgentPresence[]
  domains: DomainResult[]
  findings: Finding[]
  recommendations: Recommendation[]
  fix_plan?: FixAction[]
}

type Finding = {
  id: string  // stable, e.g. skills.agent_not_on_hub
  severity: "info" | "warn" | "error"
  domain: string
  message: string
  evidence: string[]  // paths
  agents_affected: string[]
  sync_target?: string
}
```

**Exit codes:** `0` green, `1` yellow, `2` red, `3` tool error.

### Domain checks (all required for full green)

Sync is the **lens** on every domain—not only a sixth checkbox.

1. **Agent presence** — Installed? Config home exists? Adapter depth?  
2. **Shared skills path** — Global hub(s) exist; each non-ignored first-class agent can see the **same** sync target; project overlay consistent; duplication across agent homes flagged.  
3. **Instruction files** — Expected user/project instruction files exist (`CLAUDE.md`, `AGENTS.md`, adapter-specific equivalents). **Plus Project Instruction Hierarchy** (below).  
4. **Product context** — If `product.md` / `roadmap.md` (and common variants) exist, instruction files **link** them; missing links are findings. Stubs only via fix plan if user selects them—never forced. Prefer links on **`AGENTS.md`** (and non-pointer instruction bodies); vendor pointer files stay thin.  
5. **Obsidian** — Vaults discovered/mapped; agents’ instruction surfaces reference the vault when memory is in play; broken links flagged. **No vault note body writes in v1.**  
6. **Cross-agent consistency** — Same hubs and pointers across the fleet; divergent skills roots, memory paths, or product links are errors/warns that dominate overall grade.  

### Project Instruction Hierarchy (diagnose path)

Aligns CLI with skill LOCAL POLICY §6: **`AGENTS.md` is the single source of truth** in a project; vendor entry files must **point at** it, not duplicate the body.

| | |
|--|--|
| **Entry** | `agent-doctor status` (hybrid, project root) or `agent-doctor check instructions` |
| **Terminal (broken)** | Report includes hierarchy findings when `AGENTS.md` is missing **or** a required vendor instruction file is missing / lacks an `AGENTS.md` pointer |
| **Terminal (healthy)** | Zero hierarchy findings for that project |

**Stable finding ids** (skill / fix-plan cross-reference — do not rename lightly):

| Finding id | When |
|------------|------|
| `instructions.hierarchy_missing_agents_md` | Project root has no `AGENTS.md` |
| `instructions.hierarchy_missing_pointer` | Required vendor file absent or body does not reference `AGENTS.md` (case-insensitive) |
| `instructions.missing_file` | Adapter-expected instruction path missing (pre-existing domain id) |

**Who needs a vendor pointer file** (create/update rules for diagnose):

| Condition | File |
|-----------|------|
| Always (project scope) | `AGENTS.md` must exist |
| File exists **or** Claude Code installed/primary | `CLAUDE.md` → points to `AGENTS.md` |
| File exists **or** Gemini installed/primary (presence-only ok) | `GEMINI.md` → points to `AGENTS.md` |
| File exists **or** Grok installed/primary | `GROK.md` → points to `AGENTS.md` |
| Other vendor `*AGENTS*` / entry `.md` already on disk | That file → points to `AGENTS.md` |

Codex and similar agents read `AGENTS.md` natively — still require the hub file; no separate vendor pointer for Codex. Machine-only scope (`status --all` global layer without a project root) skips hierarchy file requirements until a project root is in scope.

Constants live in `src/domains/instructions.ts` (`HIERARCHY_FINDING_IDS`, `VENDOR_POINTER_BASENAMES`). Hierarchy findings flow through `runChecks` → status/check like other instruction findings; recommendations include `rec.ensure_agents_md` / `rec.ensure_agents_md_pointers`.

### Recommendation style (normative)

```
Sync target (skills):  <resolved-hub>
  Claude Code  ✓ on hub
  Codex        ✗ private tree only
  Grok         ✗ no skills path

Recommended: wire Codex + Grok to <resolved-hub> (no copy).
```

## 8. Adapters

### v1 first-class (deep)

| Adapter | Detects (examples) | Checks |
|---------|-------------------|--------|
| **Claude Code** | `~/.claude`, project `CLAUDE.md`, `.claude/` | Settings, skills paths, instruction links to product/vault |
| **Codex** | Codex config home as installed on machine | Project/user instructions (`AGENTS.md` etc.), skill visibility |
| **Grok** | `~/.grok` | Config, skills/plugin paths, project instruction files if used |

Exact on-disk paths are **resolved by each adapter** against the live machine; the spec does not freeze vendor paths beyond discovery responsibility.

### Others (e.g. Gemini, Cursor)

- **Presence-only or shallow** in v1  
- Still listed in the fleet picture when detected  
- Honest limitation: “detected; limited checks / limited auto-fix in v1”  
- Adapter interface is pluggable so deep support can be added without engine rewrites  

### Adapter interface (conceptual)

```ts
interface AgentAdapter {
  id: string
  detect(): Promise<AgentPresence>
  skillsRoots(ctx): Promise<string[]>
  instructionFiles(projectRoot?: string): Promise<string[]>
  memoryPointers(projectRoot?: string): Promise<string[]>
  proposeWireToSkillsHub(hub: string): FixAction[]
  proposeWireMemory(paths: string[]): FixAction[]
}
```

## 9. Fix policy (plan-then-apply)

1. `fix --dry-run` builds `fix_plan` from findings (no writes).  
2. `fix` prints summary (and optional per-action list).  
3. User confirms once (apply all or selected IDs).  
4. Apply safe actions; on conflict (file changed), skip that action and continue.  
5. Re-run checks; print new overall grade.  

### Safe v1 fix actions

- Append recommended **link/pointer blocks** to `CLAUDE.md` / `AGENTS.md` (and adapter-known instruction files)  
- Wire agent config to the **chosen skills sync target** when the adapter supports a non-destructive setting or documented project file  
- Create stub `product.md` / `roadmap.md` **only if** the user selected those plan items  
- Update `~/.agent-doctor/map.yml` (sync_target, ignored, roots)  

### Out of scope for v1 auto-fix

- Deleting files or skill trees  
- Rewriting entire instruction files  
- Copying skill directories between agent homes (duplication)  
- Obsidian note content or plugin install  
- Installing agent applications  
- Silent choice when two hubs both have substantial content  

## 10. UI

### Terminal (`status`)

- Overall score and grade first  
- Per-domain lines  
- **Sync matrix:** hub → per-agent on/off  
- Top recommendations with stable finding IDs  
- Clear next commands (`fix --dry-run`, `dashboard`)  
- Language stays accessible for non-technical users; paths and agent IDs available for power users  

### HTML (`dashboard`)

- Local server (default loopback; configurable port; auto-open browser)  
- Renders the **same report JSON**  
- Views: Overview, Agents (fleet + sync matrix), Map graph (agents ↔ skills ↔ vaults ↔ projects), Findings, Fix plan (copy CLI commands)  
- **Apply stays in CLI in v1** for safer confirmation UX  

## 11. Data flow and errors

```
map.yml + cwd + live FS
  → adapters.detect (all providers)
  → resolve skills/memory sync targets
  → domain checks (sync lens)
  → Report
  → status | dashboard | fix planner
fix → confirm → apply → re-check → Report
```

| Situation | Behavior |
|-----------|----------|
| No map | Soft warn; one-shot discover for this run; suggest `init` |
| Not in a project directory | Globals + fleet sync still run; project domains N/A with note |
| Permission denied | Finding `access.denied`; do not abort whole report |
| Unknown agent binary | Presence-only; does not fail green unless user required deep support |
| Two populated skills roots | Conflict finding; require explicit `sync_target` before wire fixes |
| Fix file conflict | Skip action; partial apply report |
| Dashboard port in use | Next port or `--port`; print URL |

## 12. Testing strategy

| Layer | Approach |
|-------|----------|
| Domain pure logic | Fixture directory trees (fake agent homes + projects) |
| Adapters | Golden fixtures per agent layout |
| Sync matrix | Cases: all aligned; one off-hub; divergent hubs; ignored agent |
| Report stability | Snapshot finding IDs + grades |
| Fix apply | Temp dirs; dry-run + apply + recheck |
| CLI smoke | `status --json`, `init` writes map |
| Dashboard | Report fields present in HTML (light); no mandatory full browser e2e in v1 |

## 13. Non-goals (v1)

- Running prompts or embedding an LLM in the doctor  
- Cloud accounts, sync, or telemetry of user code  
- Native binary distribution (documented dual-ship path only)  
- Deep adapters beyond Claude Code, Codex, Grok  
- Full Obsidian vault rewrite or plugin management  
- Installing or upgrading agent products  
- Becoming a skill marketplace or skill runner  

## 14. Suggested repo layout (implementation hint)

```
agent-doctor/
  package.json
  src/
    cli.ts
    map/
    adapters/          # claude-code, codex, grok, presence
    domains/           # presence, skills, instructions, product, obsidian, consistency
    engine/            # run checks → Report
    fix/               # plan + apply
    surfaces/          # terminal status, dashboard server
  fixtures/
  docs/superpowers/specs/
```

Exact package manager and CLI framework chosen at implementation plan time (prefer minimal deps; Bun or Node both acceptable if tests and `npx` story work).

## 15. Open implementation details (resolved at plan time, not product-ambiguous)

- Exact Codex/Grok on-disk layout probes (research on implementer’s machine + docs)  
- CLI framework (e.g. citty, commander) and terminal styling library  
- Default dashboard port and static asset packaging  
- Whether project overlay path is standardized as `.agents/skills` only or multi-pattern discovery  

These do not change product purpose or user-visible modes.

## 16. Decisions log (brainstorming)

| Decision | Choice |
|----------|--------|
| Modes | A+B+C+D all available |
| Green domains | All six (presence, skills, instructions, product, Obsidian, consistency) |
| Default scan | Hybrid (cwd project + global fleet/skills/vaults) |
| Machine scan | `status --all` |
| Writes | Plan-then-apply (`fix --dry-run` then `fix`) |
| Distribution | Dual-ship long-term; **Node/Bun v1** |
| Deep adapters | Claude Code, Codex, Grok |
| Obsidian | Detect + recommend wiring; no vault content writes |
| Skills model | Hybrid global + project overlay |
| Init | Discover and save home map |
| Architecture | Check engine + dual surface (terminal + HTML) |
| Core thesis | Sync all agents to shared skills/memory/config; low duplication; always multi-agent |
| Project instructions | **AGENTS.md-first hierarchy** — vendor files point at AGENTS.md; diagnose via status / check instructions; stable ids `instructions.hierarchy_*` |
| Hierarchy Gemini | Map primary + file presence only (no deep Gemini adapter required for pointer rules) |
