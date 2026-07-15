#!/usr/bin/env bash
# Ensure agent-doctor CLI is on PATH. Install via official bootstrap if missing.
# Safe to re-run. Does not apply fixes or write agent config.
set -euo pipefail

MIN_NODE_MAJOR=20
BOOTSTRAP_URL="${AGENT_DOCTOR_BOOTSTRAP_URL:-https://cdn.jsdelivr.net/gh/rawphp/agent-doctor@main/scripts/bootstrap.sh}"
LOCAL_BIN="${HOME}/.local/bin"

export PATH="${LOCAL_BIN}:${PATH}"

info() { echo "==> $*"; }
die() { echo "error: $*" >&2; exit 1; }

has_cli() {
  command -v agent-doctor >/dev/null 2>&1
}

print_version() {
  agent-doctor --version 2>/dev/null || agent-doctor -V 2>/dev/null || true
}

if has_cli; then
  info "agent-doctor already installed: $(print_version)"
  command -v agent-doctor
  exit 0
fi

info "agent-doctor not found — installing via official bootstrap"
need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
need curl
need bash
need node
need npm
need git

ver="$(node -v | sed 's/^v//')"
major="${ver%%.*}"
if [[ "${major}" -lt "${MIN_NODE_MAJOR}" ]]; then
  die "Node.js ${MIN_NODE_MAJOR}+ required (found v${ver})"
fi

curl -fsSL "${BOOTSTRAP_URL}" | bash

export PATH="${LOCAL_BIN}:${PATH}"

if ! has_cli; then
  die "install finished but agent-doctor still not on PATH (tried ${LOCAL_BIN})"
fi

info "installed: $(print_version)"
command -v agent-doctor
