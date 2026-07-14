# Agent Doctor

CLI that checks whether your AI coding agents (Claude Code, Codex, Grok, …) share the **same skills hub, memory (vault), and product context** — with little or no duplication — and can safely wire them when you choose a hub.

It does **not** run agents or call LLMs. It inspects config on disk, scores sync health, and optionally applies plan-then-apply fixes.

---

## Requirements

- Node.js **20+**
- npm
- git (for the one-command installer)

---

## Install

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/rawphp/agent-doctor@main/scripts/bootstrap.sh | bash
```

Installs into **`~/.local`** (stable across Herd/nvm Node upgrades).

```bash
export PATH="$HOME/.local/bin:$PATH"   # add to ~/.zshrc if needed
rehash                                   # zsh
agent-doctor --version
```

Uninstall:

```bash
rm -f ~/.local/bin/agent-doctor
rm -rf ~/.local/lib/node_modules/agent-doctor
```

> The npm registry name `agent-doctor` is taken by an unrelated package. Install from GitHub (above), not `npm install -g agent-doctor`.

---

## Setup (first-time usage)

Goal: one **skills hub** that every agent can see; map + status green enough to work; fixes only after you choose the hub.

### 1. Discover your machine → write the home map

```bash
agent-doctor init
```

This looks for Claude / Codex / Grok homes, candidate skills roots, Obsidian vaults, and project roots, then writes:

`~/.agent-doctor/map.yml`

If no vault is found, `init` **asks for a path** (or skip). Later `status` will not re-prompt for a vault — re-run `init` / `map` to change it.

Refresh discovery later:

```bash
agent-doctor map
```

**Set / correct the Obsidian vault** (writes `map.yml`):

```bash
agent-doctor map --vault /Users/you/path/to/YourVault
# or:
agent-doctor map --vault ~/EA/cowork/meaning-of-life
```

That sets a single **manual** vault (overrides wrong auto-discovered paths). Summary should list:

```text
vault (manual): /Users/you/path/to/YourVault
```

### 2. See health (read-only)

```bash
agent-doctor status          # this project + global agents/skills/vaults
agent-doctor status --all    # also every project under mapped roots
agent-doctor status --json   # machine-readable Report
agent-doctor dashboard       # HTML view (Ctrl+C to stop)
```

**How to read status**

| Signal | Meaning |
|--------|---------|
| Overall **GREEN** | Non-ignored first-class agents agree on skills hub + key pointers |
| Overall **YELLOW/RED** | Drift, missing links, or **hub conflict** (cannot be green on desync) |
| Sync target `(unresolved)` | Several skills roots have content; you must pick one hub |
| Matrix `✗ hub conflict` | Same issue — not “agent broken”, “no single hub chosen” |

Example (bad, but normal on a multi-agent Mac):

```text
Overall: 40 (RED)
Sync target (skills):  (unresolved)
  claude-code  ✗ hub conflict
  codex        ✗ hub conflict
  grok         ✗ hub conflict
Recommendations:
  1. Choose one skills hub (set sync_target) before wiring agents
```

### 3. Dry-run fixes (still no writes)

```bash
agent-doctor fix --dry-run
```

**Important:** an empty plan is **not** “you’re healthy”.

If you have a **hub conflict**, dry-run will explain and tell you to pick a hub, e.g.:

```text
Fix plan (dry-run — no writes):
  No automatic safe fixes are available yet.

  Why: multiple skills roots are populated (hub conflict).
  Auto-wire is blocked until you choose one shared hub.
  Candidate roots:
    - /Users/you/.agents/skills
    - /Users/you/.claude/skills
    ...

  Next:
    1. Pick one hub path (often ~/.agents/skills).
    2. Re-run: agent-doctor fix --dry-run --sync-target /path/to/hub
    3. If the plan looks right: agent-doctor fix --yes --sync-target /path/to/hub
```

### 4. Choose one skills hub → full plan (still dry-run)

Pick the directory that should be the **single** shared library (no copies between agents). A common choice:

```bash
# example — use YOUR preferred root from the candidate list
agent-doctor fix --dry-run --sync-target ~/.agents/skills
```

You should see a **multi-step plan**, not only “set map field”, for example:

1. Set `sync_target` in `~/.agent-doctor/map.yml`  
2. Symlink each agent’s skills dir → that hub  
3. Optional vault/instruction link fixes  

Nothing is written yet. The last lines name the exact apply command.

**Readable plan in the browser:**

```bash
agent-doctor fix --dry-run --sync-target ~/.agents/skills --html
```

Opens a local HTML page with step cards and a copy-ready apply command.  
The page never applies fixes — apply stays in the CLI.

### 5. Apply (only after dry-run looks right)

```bash
agent-doctor fix --yes --sync-target ~/.agents/skills
```

Or interactive confirm:

```bash
agent-doctor fix --sync-target ~/.agents/skills
```

Then re-check:

```bash
agent-doctor status
```

### 6. Day-to-day

```bash
agent-doctor status              # quick health
agent-doctor agents              # what was detected
agent-doctor check skills        # one domain
agent-doctor fix --dry-run       # any new safe actions?
```

---

## What “safe fix” means

Auto-fix may:

- Set `skills.sync_target` in `~/.agent-doctor/map.yml`
- Symlink or wire an agent’s skills path **to the chosen hub** (one tree, no content copy)
- Append link blocks in instruction files (`CLAUDE.md` / `AGENTS.md`) when product/vault pointers are missing

Auto-fix will **not**:

- Silently pick among multiple populated hubs
- Copy skill trees between agent homes
- Rewrite whole instruction files or Obsidian note bodies
- Install agent apps

---

## Commands (reference)

| Command | Purpose |
|---------|---------|
| `init` | First-run discovery → `~/.agent-doctor/map.yml` |
| `map` | Refresh discovery (keeps your `sync_target` / ignored flags) |
| `status` | Terminal health report (`--all`, `--json`) |
| `dashboard` | Local HTML report (read-only; Ctrl+C to stop) |
| `fix` | Plan / apply safe fixes (`--dry-run`, `--yes`, `--sync-target`) |
| `agents` | Detected agents + adapter depth |
| `check` | One domain |

Help never runs the command:

```bash
agent-doctor --help
agent-doctor dashboard --help
agent-doctor fix --help
```

---

## Development

```bash
git clone https://github.com/rawphp/agent-doctor.git
cd agent-doctor
npm install
npm test
npm run build
npx tsx src/cli.ts --help
```

```bash
npm run format
npm run format:check
```

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) on push/PR: `npm ci` → format check → test → build → smoke CLI (Node 20 + 22).

### Releases

Tag-driven [`.github/workflows/release.yml`](.github/workflows/release.yml) on `v*`:

```bash
npm version patch -m "chore(release): %s"
git push origin main --follow-tags
```

Creates a GitHub Release with assets. Optional npm publish if `NPM_TOKEN` is set (registry name `agent-doctor` is taken — prefer scoped publish later).

---

## License

MIT
