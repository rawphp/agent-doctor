#!/usr/bin/env bash
# One-command installer for Agent Doctor (rawphp/agent-doctor).
#
#   curl -fsSL https://raw.githubusercontent.com/rawphp/agent-doctor/main/scripts/install.sh | bash
#
# Avoids `npm install -g git+…` prepare quirks by cloning, installing, building, then linking globally.
#
# Note: the npm package name "agent-doctor" is taken by an unrelated project.
# This installer always installs from the GitHub repo above.

set -euo pipefail

REPO_HTTPS="${AGENT_DOCTOR_REPO:-https://github.com/rawphp/agent-doctor.git}"
REPO_REF="${AGENT_DOCTOR_REF:-main}"
MIN_NODE_MAJOR=20

die() {
  echo "error: $*" >&2
  exit 1
}

info() {
  echo "==> $*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

check_node() {
  need_cmd node
  need_cmd npm
  need_cmd git

  local ver major
  ver="$(node -v | sed 's/^v//')"
  major="${ver%%.*}"
  if [[ "$major" -lt "$MIN_NODE_MAJOR" ]]; then
    die "Node.js ${MIN_NODE_MAJOR}+ required (found v${ver}). Install from https://nodejs.org/"
  fi
}

main() {
  info "Agent Doctor installer"
  check_node
  info "Node $(node -v) · npm $(npm -v)"

  local tmp
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/agent-doctor-install.XXXXXX")"
  cleanup() { rm -rf "$tmp"; }
  trap cleanup EXIT

  info "Cloning ${REPO_HTTPS} (${REPO_REF})"
  git clone --depth 1 --branch "$REPO_REF" "$REPO_HTTPS" "$tmp/agent-doctor"
  cd "$tmp/agent-doctor"

  info "Installing dependencies"
  npm install --no-fund --no-audit

  info "Building"
  npm run build
  test -f dist/cli.js || die "build did not produce dist/cli.js"

  info "Installing globally"
  npm install -g .

  if ! command -v agent-doctor >/dev/null 2>&1; then
    die "install finished but agent-doctor is not on PATH.
Add your npm global bin to PATH, e.g.:
  export PATH=\"\$(npm prefix -g)/bin:\$PATH\""
  fi

  info "Installed: $(command -v agent-doctor)"
  agent-doctor --help || true
  echo
  info "Try: agent-doctor status"
}

main "$@"
