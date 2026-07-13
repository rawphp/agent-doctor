#!/usr/bin/env bash
# One-command installer for Agent Doctor (rawphp/agent-doctor).
#
#   curl -fsSL https://raw.githubusercontent.com/rawphp/agent-doctor/main/scripts/install.sh | bash
#
# Or:
#   npm install -g git+https://github.com/rawphp/agent-doctor.git
#
# Note: the npm package name "agent-doctor" is taken by an unrelated project.
# This installer always installs from the GitHub repo above.

set -euo pipefail

REPO_URL="${AGENT_DOCTOR_REPO:-git+https://github.com/rawphp/agent-doctor.git}"
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

  info "Installing from ${REPO_URL}"
  # Global install from git runs prepare → builds dist when missing
  npm install -g "$REPO_URL"

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
