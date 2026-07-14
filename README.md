# Agent Doctor

CLI that diagnoses AI-agent project setup (skills hub, adapters for Claude Code / Codex / Grok, maps, status, and fixes).

## Requirements

- Node.js **20+**
- npm (comes with Node)

## One-command install

**Install / reinstall** (pack-based; safe to re-run):

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/rawphp/agent-doctor@main/scripts/bootstrap.sh | bash
rehash   # zsh: pick up the new binary
agent-doctor --version
```

If the shell still says `command not found`:

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
rehash
agent-doctor --version
```

The installer removes any broken global install, then: clone → `npm install` → `build` → **`npm pack`** → **`npm install -g` from the tarball** (real directory under `node_modules`, not a temp symlink).

Do **not** use old one-liners that run `npm install -g git+…` or a stale `install.sh` from `raw.githubusercontent.com`.

Equivalent without curl:

```bash
git clone --depth 1 https://github.com/rawphp/agent-doctor.git
cd agent-doctor
npm install && npm run build
npm pack
npm install -g ./agent-doctor-*.tgz
```

Then:

```bash
agent-doctor --help
agent-doctor status
```

> **Note:** The npm registry name `agent-doctor` is already used by an [unrelated package](https://www.npmjs.com/package/agent-doctor). Install from **GitHub** (commands above), not `npm install -g agent-doctor`.

### PATH issues

If the install succeeds but `agent-doctor` is not found:

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
```

### Uninstall

```bash
npm uninstall -g agent-doctor
```

## Commands (v1)

| Command     | Purpose                                              |
| ----------- | ---------------------------------------------------- |
| `init`      | Discover environment and write the home map          |
| `map`       | Inspect or update the agent/home map                 |
| `status`    | Run checks and print terminal status report          |
| `dashboard` | Serve or open the HTML status dashboard              |
| `fix`       | Plan and apply safe setup fixes                      |
| `agents`    | List detected agents and adapter support             |
| `check`     | Run individual domain checks                         |

## Development

```bash
git clone https://github.com/rawphp/agent-doctor.git
cd agent-doctor
npm install
npm test
npm run build
npx tsx src/cli.ts --help
# or after build:
node dist/cli.js --help
```

```bash
npm run format        # write
npm run format:check  # CI-style check
```

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:

1. `npm ci`
2. `npm run format:check`
3. `npm test`
4. `npm run build`
5. Smoke `node dist/cli.js --help`

Matrix: Node **20** and **22** on `ubuntu-latest`.

### Releases (tag-driven)

Pushing a version tag `v*` runs [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Check tag `vX.Y.Z` matches `package.json` version  
2. Format check, test, build, smoke CLI  
3. Create a **GitHub Release** with notes + assets (`dist` tarball + `npm pack` `.tgz`)  
4. **Optional npm publish** if repo secret `NPM_TOKEN` is set (skipped otherwise)

Ship a release:

```bash
# bumps package.json, commits, tags vX.Y.Z
npm version patch -m "chore(release): %s"
# or: minor | major

git push origin main --follow-tags
```

> Registry name `agent-doctor` is taken by another project. Prefer GitHub Releases / git install until you publish under a scoped name (e.g. `@rawphp/agent-doctor`) and set `NPM_TOKEN`.

## License

MIT
