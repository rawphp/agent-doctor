# Ideate — UR-001

**Reviewed:** 2026-07-14

## Explorer — Assumptions & Perspectives

- **Brief is a path, not inline product language** — `input.md` only contains the design-spec path. Capture must treat the full `docs/superpowers/specs/2026-07-14-agent-doctor-design.md` as the source of truth; if someone edits the path string without updating the file, decomposition will drift. Scenario: REQs get written from a stale memory of the chat instead of the committed spec.
- **Non-technical users are first-class** — Spec success criteria require under-a-minute comprehension via `status`/`dashboard`. If capture prioritizes adapter plumbing over terminal copy and sync-matrix UX, business users hit a wall of paths with no fleet picture. Scenario: green/red grades exist but the default `status` output is engineer-only JSON-like noise.
- **“Same skills/memory” assumes agents can share a hub** — Spec optimizes for one skills root + links, but some agents only load skills from proprietary homes. Scenario: Codex or Grok cannot point at `~/.agents/skills` without a copy or symlink; doctor recommends “wire to hub (no copy)” and `fix` cannot complete without a new policy (symlink vs documented exception).
- **Obsidian is optional but memory health is not** — Spec includes vault detect+wiring while many users have no vault. Scenario: overall grade stays yellow forever for vault-less users unless absence is scored as N/A when no vault is discovered/mapped.
- **Machine scope (`--all`) can be huge** — Hybrid default is fine; `--all` walks every mapped project root. Scenario: `~/EA/projects` with 50+ repos makes `status --all` / dashboard Machine view slow or unusable without depth limits or progress.

## Challenger — Risks & Edge Cases

- **Adapter path drift** — Spec defers exact Codex/Grok layouts to implement time. Scenario: wrong probe → false red “not installed” or false green “on hub” while the agent never loads that path; trust in the doctor collapses.
- **Dual-write danger in `fix`** — Plan-then-apply can append to `CLAUDE.md`/`AGENTS.md` and agent configs. Scenario: user confirms once; partial apply leaves Claude linked to hub A and Codex still on private tree; re-run grade improves partially and user thinks sync is done.
- **Scoring ambiguity without calibrated thresholds** — Spec defines domains and green intent but not numeric weights. Scenario: presence of three agents scores high while skills are divergent; overall shows yellow/green when north-star sync is failed.
- **Empty do-work layers will block capture** — Project `.do-work/config.yml` has `layers: []`. This is a feature-class product build. Scenario: capture halts until layers are declared (e.g. CLI-style `[commands, core, output]` or engine/adapters/surfaces) or `--no-layers` is used.
- **Permission and multi-user homes** — Live FS checks on `~` paths. Scenario: sandboxed CI or restricted home → cascade of `access.denied` findings that drown real sync issues if severity isn’t capped.
- **Conflict hub choice is human-gated** — Two populated skills roots require explicit `sync_target`. Scenario: non-technical user never sets it; `fix` never offers wire actions; they churn on dashboard yellow with no clear “pick A or B” UX in v1 CLI-only apply path.

## Connector — Links & Reuse

- **Spec already is the architecture** — Repo is greenfield (design doc + do-work only). No app code to reuse; decomposition should follow spec §14 layout (`adapters/`, `domains/`, `engine/`, `fix/`, `surfaces/`) rather than inventing a second structure.
- **Local agent ecosystem is the real integration test bed** — This machine already has `~/.claude`, `~/.grok`, `~/.agents/skills`, and many project `CLAUDE.md`/`AGENTS.md` files. Scenario: fixtures alone pass while live probes fail; plan at least one manual/live-check path after golden fixtures.
- **Report JSON is the contract for dual ship** — Spec’s dual-ship (native binary later) means the report schema and finding IDs must be stable early. Scenario: terminal and HTML diverge if either re-scores instead of rendering the report.
- **do-work itself needs layers + test command** — Before run, set `layers` and `test.suite_command` (e.g. `npm test` / `bun test`) so workers can verify; currently both empty.

## Summary

Implement the committed design as a sync-first CLI: one check engine, hybrid `status`, HTML `dashboard`, map via `init`, and plan-then-apply `fix`, always scoring the whole detected fleet against shared hubs. Highest pre-decomposition risks are empty project layers (capture blocker), unknown adapter path accuracy, scoring that fails to punish desync, and `fix` partial-apply leaving a false sense of alignment. Treat the design file path in `input.md` as a pointer—decompose from the full spec on disk.
