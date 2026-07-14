#!/usr/bin/env bash
# One-command installer for Agent Doctor (rawphp/agent-doctor).
#
#   curl -fsSL https://cdn.jsdelivr.net/gh/rawphp/agent-doctor@main/scripts/bootstrap.sh | bash
#
# Installs into ~/.local by default (stable across nvm/Herd Node versions).
# Uses npm pack + install from tarball (never `npm install -g .` from a temp dir).

set -euo pipefail

REPO_HTTPS="${AGENT_DOCTOR_REPO:-https://github.com/rawphp/agent-doctor.git}"
REPO_REF="${AGENT_DOCTOR_REF:-main}"
# Stable prefix — not tied to a single Herd/nvm Node version
INSTALL_PREFIX="${AGENT_DOCTOR_PREFIX:-${HOME}/.local}"
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

# Remove prior installs (current npm global + known broken Herd paths + prefix)
cleanup_previous() {
  info "Removing previous agent-doctor installs"

  npm uninstall -g agent-doctor >/dev/null 2>&1 || true

  local root bin
  root="$(npm root -g 2>/dev/null || true)"
  bin="$(npm prefix -g 2>/dev/null || true)/bin/agent-doctor"
  [[ -n "$root" ]] && rm -rf "${root}/agent-doctor" 2>/dev/null || true
  [[ -n "$bin" ]] && rm -f "$bin" 2>/dev/null || true

  # Herd / nvm: wipe agent-doctor from every Node version (broken temp symlinks)
  local herd_root="${HOME}/Library/Application Support/Herd/config/nvm/versions/node"
  if [[ -d "$herd_root" ]]; then
    find "$herd_root" \( -name 'agent-doctor' \) -exec rm -rf {} + 2>/dev/null || true
  fi
  local nvm_root="${HOME}/.nvm/versions/node"
  if [[ -d "$nvm_root" ]]; then
    find "$nvm_root" \( -name 'agent-doctor' \) -exec rm -rf {} + 2>/dev/null || true
  fi

  rm -rf "${INSTALL_PREFIX}/lib/node_modules/agent-doctor" 2>/dev/null || true
  rm -f "${INSTALL_PREFIX}/bin/agent-doctor" 2>/dev/null || true
}

_INSTALL_TMP=""

main() {
  info "Agent Doctor installer"
  check_node
  info "Node $(node -v) · npm $(npm -v)"
  info "Install prefix: ${INSTALL_PREFIX}"

  cleanup_previous

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

  info "Packing"
  local tgz
  tgz="$(npm pack --silent)"
  test -f "$tgz" || die "npm pack did not produce a tarball"

  mkdir -p "${INSTALL_PREFIX}/bin" "${INSTALL_PREFIX}/lib"

  info "Installing to ${INSTALL_PREFIX} from ${tgz}"
  npm install -g --prefix "${INSTALL_PREFIX}" "./${tgz}"

  local pkg_dir="${INSTALL_PREFIX}/lib/node_modules/agent-doctor"
  local bin_path="${INSTALL_PREFIX}/bin/agent-doctor"

  if [[ -L "$pkg_dir" ]]; then
    die "package is a symlink (${pkg_dir} → $(readlink "$pkg_dir")). Refusing broken install."
  fi
  test -d "$pkg_dir" || die "missing package directory ${pkg_dir}"
  test -f "${pkg_dir}/dist/cli.js" || die "missing ${pkg_dir}/dist/cli.js"
  test -e "$bin_path" || die "missing bin ${bin_path}"

  # Ensure ~/.local/bin is on PATH for this shell and print durable advice
  export PATH="${INSTALL_PREFIX}/bin:${PATH}"
  hash -r 2>/dev/null || true
  rehash 2>/dev/null || true

  if ! command -v agent-doctor >/dev/null 2>&1; then
    die "agent-doctor not found even after adding ${INSTALL_PREFIX}/bin to PATH"
  fi

  # Resolve must not point into /var/folders temp
  local resolved
  resolved="$(python3 -c "import os; print(os.path.realpath('${pkg_dir}'))" 2>/dev/null || readlink -f "$pkg_dir" 2>/dev/null || echo "$pkg_dir")"
  case "$resolved" in
    /var/folders/*|/tmp/*|*/agent-doctor-install.*)
      die "package resolves to a temp path (${resolved}). Install is broken."
      ;;
  esac

  info "Installed: $(command -v agent-doctor)"
  agent-doctor --version
  agent-doctor --help || true
  echo
  info "Add to your shell profile if needed (zsh: ~/.zshrc):"
  echo "  export PATH=\"${INSTALL_PREFIX}/bin:\$PATH\""
  echo
  info "Then:  rehash && agent-doctor status"
}

main "$@"
