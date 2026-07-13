#!/usr/bin/env bash
# One-command installer for Agent Doctor (rawphp/agent-doctor).
#
#   curl -fsSL https://cdn.jsdelivr.net/gh/rawphp/agent-doctor@main/scripts/install.sh | bash
#
# Prefer jsDelivr (above). GitHub raw CDN can lag behind main.
#
# Installs by: clone → npm install → build → npm pack → npm install -g <tarball>
# (Never `npm install -g .` from a temp dir — that creates a broken symlink after cleanup.)

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

# Remove prior global install, including broken symlinks that cause ENOTDIR.
cleanup_global() {
  info "Removing any previous global agent-doctor install"
  npm uninstall -g agent-doctor >/dev/null 2>&1 || true

  local root link
  root="$(npm root -g 2>/dev/null || true)"
  if [[ -n "$root" ]]; then
    link="${root}/agent-doctor"
    if [[ -L "$link" || -e "$link" ]]; then
      rm -rf "$link" 2>/dev/null || rm -f "$link" 2>/dev/null || true
    fi
  fi

  # Global bin stub
  local bin
  bin="$(npm prefix -g 2>/dev/null)/bin/agent-doctor"
  if [[ -L "$bin" || -f "$bin" ]]; then
    rm -f "$bin" 2>/dev/null || true
  fi
}

_INSTALL_TMP=""

main() {
  info "Agent Doctor installer"
  check_node
  info "Node $(node -v) · npm $(npm -v)"

  cleanup_global

  _INSTALL_TMP="$(mktemp -d "${TMPDIR:-/tmp}/agent-doctor-install.XXXXXX")"
  cleanup() {
    if [[ -n "${_INSTALL_TMP:-}" && -d "${_INSTALL_TMP}" ]]; then
      rm -rf "${_INSTALL_TMP}"
    fi
    _INSTALL_TMP=""
  }
  trap cleanup EXIT

  info "Cloning ${REPO_HTTPS} (${REPO_REF})"
  git clone --depth 1 --branch "$REPO_REF" "$REPO_HTTPS" "$_INSTALL_TMP/agent-doctor"
  cd "$_INSTALL_TMP/agent-doctor"

  info "Installing dependencies"
  npm install --no-fund --no-audit

  info "Building"
  npm run build
  test -f dist/cli.js || die "build did not produce dist/cli.js"

  # Pack + install tarball so global node_modules gets a real copy (not a temp symlink)
  info "Packing"
  local tgz
  tgz="$(npm pack --silent)"
  test -f "$tgz" || die "npm pack did not produce a tarball"

  info "Installing globally from ${tgz}"
  npm install -g "./${tgz}"

  if ! command -v agent-doctor >/dev/null 2>&1; then
    die "install finished but agent-doctor is not on PATH.
Add your npm global bin to PATH, e.g.:
  export PATH=\"\$(npm prefix -g)/bin:\$PATH\""
  fi

  # Must not be a dangling symlink into a temp path
  local real
  real="$(command -v agent-doctor)"
  if [[ -L "$real" ]]; then
    local target
    target="$(readlink "$real" || true)"
    if [[ ! -e "$real" ]]; then
      die "agent-doctor binary is a broken symlink (${target}). Install failed."
    fi
  fi

  info "Installed: ${real}"
  agent-doctor --help || true
  agent-doctor --version 2>/dev/null || true
  echo
  info "Try: agent-doctor status"
}

main "$@"
