# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Inventory of client-visible work from the `refactor/happy-single-choke-points`
branch (UR-003 / ORI-779–783). Package version remains `0.1.0` until a release
cuts this section into a versioned heading.

### Added

- **Package public API façade** (`src/index.ts`) for skill and automation
  consumers. Import from the package root (`agent-doctor` / published
  `dist/index.js`) without deep imports for:
  - Values: `PACKAGE_NAME`, `PACKAGE_VERSION`, `runChecks`, `buildFixPlan`,
    `applyFixPlan`, `loadMap`, `saveMap`
  - Types: `Report`, `HomeMap`, `Finding` (plus related option/result types:
    `RunChecksOptions`, `BuildFixPlanInput`, `BuildFixPlanOptions`,
    `ApplyContext`, `ActionResult`, `MapIoOptions`)
  - CLI remains `./cli` / the `agent-doctor` bin; adapters, domains, and
    surfaces stay non-public internals.
- **Package resolution fields** on `package.json` for published consumers:
  - `"main": "./dist/index.js"`
  - `"types": "./dist/index.d.ts"`
  - `"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }, "./package.json": "./package.json" }`
- **`runProjectScopedDomains`** exported from `src/engine/run-checks.ts` as the
  named owner of per-project instructions + product checks (machine-scope
  contract; primarily for tests and advanced callers — not re-exported from
  package root). Hybrid: instructions/product run once with
  `DomainCheckContext.projectRoot` set. Machine: global suite strips
  `projectRoot`; this helper re-runs **only** instructions + product once per
  enumerated project. No project-count cap.
- **`buildDefaultAdapters(map, registry?)`** as the single adapter-assembly
  choke point used by `runChecks` and the `fix` command (exported from
  `run-checks.ts`; not package-root). Builds full adapters (`claude-code`,
  `codex`, `grok`) plus any additional presence entries from the map.

### Changed

- **Package `exports` deep-import break (upgrade note)** — published surface is
  restricted by `package.json` `"exports"` to `"."` and `"./package.json"` only.
  Prior base was bin-only with no `main` / `exports`, so any path under the
  published `files: dist` tree was reachable by deep import.
  - **Before:** `import … from 'agent-doctor/dist/engine/run-checks.js'` (or
    `agent-doctor/dist/commands/dashboard.js`, or other `dist/**` paths) resolved
    because Node had no package exports map.
  - **After:** those deep paths fail under Node with
    `ERR_PACKAGE_PATH_NOT_EXPORTED`. Supported path is the package root only:
    `import { … } from 'agent-doctor'` (public façade `src/index.ts` /
    `dist/index.js`).
  - **Supported root exports** (from `src/index.ts`; do not deep-import
    internals): values `PACKAGE_NAME`, `PACKAGE_VERSION`, `runChecks`,
    `buildFixPlan`, `applyFixPlan`, `loadMap`, `saveMap`; types `Report`,
    `HomeMap`, `Finding`, `RunChecksOptions`, `BuildFixPlanInput`,
    `BuildFixPlanOptions`, `ApplyContext`, `ActionResult`, `MapIoOptions`.
  - **Action for integrators:** replace deep `agent-doctor/dist/...` imports
    with package-root imports from the façade above. `exports` stays root-only
    (no re-export of private `dist/**` subpaths).
- **Report.fix_plan authority (upgrade note)** — `runChecks` always attaches
  the full `buildFixPlan({ findings, map, adapters, hub, … })` result when
  non-empty (field name stays `fix_plan`; omit when empty). Domain suite
  `fix_actions` are internal checker hints only and are **never** the
  user-visible plan source (not copied onto the report).
  - **Before:** machine clients of `status --json` and the dashboard (and any
    consumer of `Report.fix_plan`) could see a partial plan (domain stubs only),
    which could diverge from what `fix --dry-run` rebuilds via `buildFixPlan`.
  - **After:** `Report.fix_plan` is the same full planner contract as
    `fix --dry-run` (intentional parity). Content includes the complete
    `buildFixPlan` action set, not domain stubs alone — e.g. hierarchy
    `create_agents_stub` when AGENTS.md is missing, `append_agents_pointer`
    for vendor instruction pointers, `set_sync_target` on hub conflict, and
    adapter wire proposals (`symlink_skills_hub` / hub wire for off-hub
    agents). Empty plans omit the field.
  - **Action for integrators:** treat `report.fix_plan` as the same contract as
    `buildFixPlan` / `fix --dry-run`. Do not assume domain-only / partial
    plans. This is a 0.x behavioral change under **Changed**, not a blanket
    BREAKING banner for the additive package API above.
- **`fix` CLI adapter assembly** uses `buildDefaultAdapters` (or injected
  `options.checks.adapters`) instead of a private `adaptersForPlan` duplicate,
  so live fix planning and diagnose share one construction path.
- **`defaultOpenBrowser`** lives in `src/surfaces/open-browser.ts` and is
  imported by `dashboard` and `fix`. CLI inject hooks
  (`options.openBrowser`) are unchanged; only the default implementation moved
  to the shared surfaces util (no package-root export).

### Fixed

- Diagnose vs fix plan drift: status/dashboard JSON `fix_plan` no longer lags
  behind the full planner for hierarchy, hub conflict, and skills-hub wire
  actions (see `Report.fix_plan` under Changed).
