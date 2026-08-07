---
name: release
description: >
  Ship an agent-doctor production release (CHANGELOG, quality gates, package.json
  semver bump, v* tag, push main+tags for GitHub Release). Use when the user says
  /release, "release agent-doctor", "ship agent-doctor", "tag a release", or wants
  a dry-run of the release path. Differentiator: npm package ship path only —
  GitHub Actions release.yml, not Forge deploy.
---

# agent-doctor release

Create a production release for **agent-doctor**.

**Ship path:** prepare `CHANGELOG.md` on **main** → local gates → `npm version` (bumps `package.json`, commit, `v*` tag) → `git push origin HEAD --follow-tags` → GitHub Actions `release.yml` → GitHub Release assets. Optional npm publish only if `NPM_TOKEN` is set and the package name/scope is publishable.

**Sole gate recipe:** the steps in this skill (aligned with CI / `release.yml`). Orchestrate UX only — confirm with the user, ensure CHANGELOG, pass an explicit bump (default `patch`), run gates, bump/tag/push, report. Do not invent a second gate recipe.

For the full agent procedure and hard rules, also read `.claude/commands/release.md` if present (same workflow). Human docs: README **Releases** section.

## Arguments

Map user tokens:

| Token | Meaning |
| --- | --- |
| `patch` / `minor` / `major` | Semver bump via `npm version` (default `patch` if omitted) |
| `vX.Y.Z` or `X.Y.Z` | Explicit version (must be greater than current) |
| `--dry-run` | Preflight + gates only |
| `--yes` | Non-interactive after user already confirmed |

### Version policy

- Default: `patch` when bump omitted.
- Override only when the user passes `patch`, `minor`, `major`, or an explicit version.
- Do not invent minor/major from commit messages.
- Tag is always `v` + package version; CI requires exact match with `package.json`.

State explicit vs default version in one sentence, then proceed.

## Hard rules

1. Never `git push --force` or delete tags on origin.
2. Never skip failing quality gates. Fix or abort.
3. Never tag a dirty working tree (except the `npm version` commit itself).
4. Never release from a branch other than `main` or `master`.
5. Tag version must match `package.json` after the bump.
6. Version commit + tag + push need explicit user confirmation this turn unless they already said "ship it" / "release now" / passed `--yes` after agreeing.
7. Cut `CHANGELOG.md` `[Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD` before or with the release.

## Procedure

### 1. Preflight (read-only)

```bash
git rev-parse --show-toplevel
git status -sb
git rev-parse --abbrev-ref HEAD
git fetch origin --tags
node -p "require('./package.json').version"
git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -5
git log --oneline "$(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)"..HEAD 2>/dev/null | head -40
```

Stop if not on main/master or if the tree is dirty with unrelated work.

### 2. CHANGELOG (required for honest releases)

```md
## [0.1.1] - 2026-08-06
```

Move `## [Unreleased]` notes under the new header; keep empty `## [Unreleased]`. Commit if needed before bump (or fold into the version commit carefully).

### 3. Confirm plan

Report current version, latest tag, proposed version/tag, gates, that tag push triggers `release.yml` → GitHub Release, and that origin/main will include the release commit. Ask once if not already approved.

### 4. Gates

```bash
npm ci
npm run format:check
npm test
npm run build
node dist/cli.js --help
```

### 5. Bump / tag / push (skip on `--dry-run`)

```bash
npm version patch -m "chore(release): %s"
# or minor|major|X.Y.Z
git push origin HEAD --follow-tags
```

### 6. Report

Success:

```
Released vX.Y.Z
  package.json: X.Y.Z
  commit: <short-sha>
  push:   main + tag → origin
  deploy: GitHub Actions release.yml → GitHub Release assets
```

Gate failure: paste failing output, stop, do not tag.

### 7. Optional follow-ups

`gh run list --workflow=release.yml --limit 5`, GitHub Release page, npm publish only if user asks and scope/name is ready.

## Quality gates

```bash
npm run format:check
npm test
npm run build
node dist/cli.js --help
```

CI: `.github/workflows/ci.yml`. Release: `.github/workflows/release.yml` (tag `v*`).

## Out of scope

- Forge / app deploy
- Force-publish to unscoped `agent-doctor` while name is taken
- History rewrite / squash as part of release (not in this package path today)
