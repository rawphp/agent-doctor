---
description: Production release — quality gates, package.json version, v* tag, GitHub Release via Actions.
argument-hint: "[patch|minor|major|vX.Y.Z] [--dry-run] [--yes]"
---

# /release — agent-doctor production release

Create a production release for **agent-doctor** (npm package / CLI).

**Ship path:** update `CHANGELOG.md` on **main** → local quality gates → bump `package.json` version → annotated/lightweight tag from `npm version` → push **main + tags** → GitHub Actions `.github/workflows/release.yml` builds assets and creates a GitHub Release. Optional npm publish only if `NPM_TOKEN` is set (registry name `agent-doctor` is taken — prefer scoped publish later).

**Sole gate recipe:** run the gates listed in this command (same as CI / `release.yml`). Do not invent extra gates or skip failing ones. There is no `scripts/release.sh` yet — keep this procedure and README in sync if a script is added later.

Adapted from MesoPrep `/release` (tag-driven ship, explicit bump, agent UX) for this package’s npm + GitHub Release path.

## Arguments

Parse `$ARGUMENTS` (may be empty):

| Token | Meaning |
|---|---|
| `patch` / `minor` / `major` | Semver bump via `npm version` |
| `vX.Y.Z` or `X.Y.Z` | Explicit version — must be strictly greater than current `package.json` |
| `--dry-run` | Preflight + gates only; do not bump, tag, or push |
| `--yes` | Non-interactive after you have already confirmed with the user |

### Version policy (explicit bump only)

Bump is **explicit**. Pass `patch`, `minor`, `major`, or an explicit version.

- When the bump is omitted, **default to `patch`**.
- **Do not** invent `minor` / `major` from commit messages or heuristics.
- Tag form is always `v` + `package.json` version (e.g. `0.1.1` → tag `v0.1.1`). `release.yml` **requires** tag version to match `package.json`.

State the chosen version (and that it was explicit or default patch) in one sentence, then proceed.

## Hard rules

1. **Never** use `git push --force` or delete tags on origin.
2. **Never** skip failing quality gates. Fix or abort.
3. **Never** create a tag on a dirty working tree (except the release commit `npm version` itself will create).
4. **Never** release from a branch other than `main` or `master`.
5. Tag version **must** match `package.json` after the bump (CI enforces this).
6. Side effects (version commit + tag + push) need **explicit user confirmation** in this turn unless they already said e.g. "release patch now" / "ship it" / passed `--yes` after agreeing.
7. Prefer updating `CHANGELOG.md` `[Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD` in the same release commit or the commit immediately before `npm version`.

## Procedure

### 1. Preflight (read-only)

From the repo root:

```bash
git rev-parse --show-toplevel
git status -sb
git rev-parse --abbrev-ref HEAD
git fetch origin --tags
node -p "require('./package.json').version"
git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -5
git log --oneline "$(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)"..HEAD 2>/dev/null | head -40
```

If dirty or not on main/master: stop and report. Do not auto-commit unrelated work.

### 2. CHANGELOG

Heading form (Keep a Changelog):

```md
## [0.1.1] - 2026-08-06
```

- Move notes under `## [Unreleased]` into the new version heading.
- Leave an empty `## [Unreleased]` section at the top.
- If there is nothing to ship, stop and say so — do not cut an empty release unless the user insists.

### 3. Confirm the plan

Tell the user:

- current `package.json` version and latest `v*` tag (or "none — first release")
- proposed new version / tag
- gates: `npm run format:check` → `npm test` → `npm run build` → `npx tsx src/cli.ts --help` (or `node dist/cli.js --help` after build)
- that push of the `v*` tag triggers `.github/workflows/release.yml` → GitHub Release (+ optional npm publish if secret set)
- that `origin/main` must include the release commit

If they have not already approved shipping, ask once and wait.

### 4. Run gates

Always run from a clean tree (after CHANGELOG commit if any):

```bash
npm ci
npm run format:check
npm test
npm run build
node dist/cli.js --help
```

On failure: paste the failing output, stop, do not bump or tag.

### 5. Bump, tag, push (after confirmation; skip on `--dry-run`)

```bash
# Explicit bump (default patch if omitted):
npm version patch -m "chore(release): %s"
# or: npm version minor|major -m "chore(release): %s"
# or: npm version 0.2.0 -m "chore(release): %s"

# Ensure HEAD is on main and matches what we gate'd, then:
git push origin HEAD --follow-tags
```

Notes:

- `npm version` updates `package.json` (and lockfile if present), creates a commit, and creates tag `vX.Y.Z`.
- Prefer `--follow-tags` so main and the tag land together; `release.yml` only needs the tag push, but main must carry the version commit.
- If CHANGELOG was updated in a separate commit, push that first or include it in the same push as the version commit.

### 6. Report

On success, print:

```
Released vX.Y.Z
  package.json: X.Y.Z
  commit: <short-sha>
  push:   main + tag → origin
  deploy: GitHub Actions release.yml → GitHub Release assets
```

On gate failure: paste the failing output + last relevant error lines, stop, do not tag.

### 7. Optional follow-ups (do not block the release)

- Watch Actions: `gh run list --workflow=release.yml --limit 5`
- Open the GitHub Release page once the workflow finishes
- npm publish only if the user asks **and** package name/scope is ready (unscoped `agent-doctor` is taken on the registry)

## Quality gates

Do not invent a second recipe. Authoritative local gates match CI / release workflow:

```bash
npm run format:check
npm test
npm run build
node dist/cli.js --help
```

Workflow: `.github/workflows/release.yml` (tag `v*` only).  
CI (PR/push): `.github/workflows/ci.yml`.

## Out of scope

- Laravel Forge / app deploy (this is a Node CLI package, not MesoPrep).
- Forcing npm publish while the unscoped name is unavailable.
- GitHub Releases UI notes beyond what the workflow creates — do not block the tag push on manual `gh release create` unless the user requests it.
- Rewriting git history (`--squash` / force-with-lease) — not part of this package’s release path today.
