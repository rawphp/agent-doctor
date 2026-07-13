#!/usr/bin/env bash
# backup-agent-configs.sh
#
# Snapshot agent configuration (not multi-GB session/cache trees) into Google Drive.
# Designed for hourly launchd while developing agent-doctor / multi-agent setups.
#
# Usage:
#   ./scripts/backup-agent-configs.sh              # run backup now
#   ./scripts/backup-agent-configs.sh --dry-run    # show what would be archived
#   ./scripts/backup-agent-configs.sh --install   # install hourly launchd job
#   ./scripts/backup-agent-configs.sh --uninstall # remove launchd job
#   ./scripts/backup-agent-configs.sh --status    # show schedule + last backups
#
# Env overrides:
#   AGENT_BACKUP_DEST   Google Drive (or other) destination directory
#   AGENT_BACKUP_KEEP   Number of hourly archives to retain (default: 48)
#   AGENT_BACKUP_LOG    Log file path
#   AGENT_BACKUP_INCLUDE_SECRETS  1 (default) include auth.json / oauth tokens
#                                 0 exclude known credential files

set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
LABEL="com.tomkaczocha.agent-config-backup"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
KEEP="${AGENT_BACKUP_KEEP:-48}"
LOG="${AGENT_BACKUP_LOG:-${HOME}/Library/Logs/agent-config-backup.log}"
INCLUDE_SECRETS="${AGENT_BACKUP_INCLUDE_SECRETS:-1}"

# ---------------------------------------------------------------------------
# Destination: prefer Google Drive for Desktop "My Drive"
# ---------------------------------------------------------------------------
detect_gdrive_dest() {
  if [[ -n "${AGENT_BACKUP_DEST:-}" ]]; then
    printf '%s\n' "$AGENT_BACKUP_DEST"
    return
  fi

  local candidates=(
    "${HOME}/Library/CloudStorage/GoogleDrive-tomkaczocha@gmail.com/My Drive/Backups/agent-configs"
    "${HOME}/Library/CloudStorage/GoogleDrive-"*"/My Drive/Backups/agent-configs"
    "${HOME}/Google Drive/My Drive/Backups/agent-configs"
    "${HOME}/Google Drive/Backups/agent-configs"
  )

  # Expand globs carefully
  local c
  for c in \
    "${HOME}/Library/CloudStorage/GoogleDrive-tomkaczocha@gmail.com/My Drive/Backups/agent-configs" \
    "${HOME}/Google Drive/My Drive/Backups/agent-configs" \
    "${HOME}/Google Drive/Backups/agent-configs"
  do
    local parent
    parent="$(dirname "$c")"
    if [[ -d "$parent" ]] || [[ -d "$(dirname "$parent")" ]]; then
      # Prefer existing My Drive parent
      if [[ -d "$(dirname "$c")" ]] || [[ -d "${HOME}/Library/CloudStorage/GoogleDrive-tomkaczocha@gmail.com/My Drive" ]]; then
        printf '%s\n' "$c"
        return
      fi
    fi
  done

  # Generic: first GoogleDrive-* My Drive
  local gd
  for gd in "${HOME}/Library/CloudStorage"/GoogleDrive-*/"My Drive"; do
    if [[ -d "$gd" ]]; then
      printf '%s\n' "${gd}/Backups/agent-configs"
      return
    fi
  done

  echo "ERROR: Could not find Google Drive 'My Drive'. Set AGENT_BACKUP_DEST." >&2
  exit 1
}

# ---------------------------------------------------------------------------
# What we back up (config / skills / instructions — not sessions)
# ---------------------------------------------------------------------------
# Each entry: SOURCE_DIR|RELATIVE_NAME  (empty SOURCE_DIR skipped)
collect_sources() {
  local sources=()

  add() {
    local src="$1" name="$2"
    if [[ -e "$src" ]]; then
      sources+=("${src}|${name}")
    fi
  }

  add "${HOME}/.claude" "claude"
  add "${HOME}/.codex" "codex"
  add "${HOME}/.grok" "grok"
  add "${HOME}/.gemini" "gemini"
  add "${HOME}/.agents" "agents"
  add "${HOME}/.cursor" "cursor"
  add "${HOME}/.agent-doctor" "agent-doctor"
  add "${HOME}/.config/gh" "config-gh"

  # Project instruction files for agent-doctor (this repo), if present
  local repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  add "${repo_root}/CLAUDE.md" "projects/agent-doctor/CLAUDE.md"
  add "${repo_root}/AGENTS.md" "projects/agent-doctor/AGENTS.md"
  add "${repo_root}/.claude" "projects/agent-doctor/.claude"
  add "${repo_root}/.do-work/config.yml" "projects/agent-doctor/.do-work-config.yml"
  add "${repo_root}/.do-work/decisions.md" "projects/agent-doctor/.do-work-decisions.md"

  printf '%s\n' "${sources[@]}"
}

# rsync/tar excludes — keep archives small enough for hourly Drive sync
EXCLUDES=(
  --exclude='sessions'
  --exclude='session-env'
  --exclude='sessions/**'
  --exclude='archived_sessions'
  --exclude='file-history'
  --exclude='paste-cache'
  --exclude='cache'
  --exclude='**/cache/**'
  --exclude='downloads'
  --exclude='marketplace-cache'
  --exclude='worktrees'
  --exclude='worktrees.db'
  --exclude='shell-snapshots'
  --exclude='shell_snapshots'
  --exclude='telemetry'
  --exclude='debug'
  --exclude='log'
  --exclude='logs'
  --exclude='**/logs/**'
  --exclude='tmp'
  --exclude='upload_queue'
  --exclude='computer-use'
  --exclude='node_repl'
  --exclude='attachments'
  --exclude='browser'
  --exclude='chrome'
  --exclude='daemon'
  --exclude='ide'
  --exclude='jobs'
  --exclude='stats-cache.json'
  --exclude='models_cache.json'
  --exclude='history.jsonl'
  --exclude='history'
  --exclude='*.sqlite'
  --exclude='*.sqlite-shm'
  --exclude='*.sqlite-wal'
  --exclude='goals_*.sqlite'
  --exclude='logs_*.sqlite'
  --exclude='memories_*.sqlite'
  --exclude='state_*.sqlite'
  # Huge conversation / project state (not "config")
  --exclude='projects'
  --exclude='plugins'          # large; skills live elsewhere — re-install plugins if needed
  --exclude='vendor'
  --exclude='vendor_imports'
  --exclude='node_modules'
  --exclude='.git'
  --exclude='*.lock'
  --exclude='active_sessions.lock'
  --exclude='managed_config.lock'
  --exclude='auth.json.lock'
)

if [[ "$INCLUDE_SECRETS" != "1" ]]; then
  EXCLUDES+=(
    --exclude='auth.json'
    --exclude='oauth_creds.json'
    --exclude='.credentials.json'
    --exclude='credentials.json'
  )
fi

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  mkdir -p "$(dirname "$LOG")"
  echo "$line" | tee -a "$LOG"
}

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------
# Global so EXIT trap can always see the staging dir under `set -u`
_BACKUP_STAGING=""

run_backup() {
  local dry_run="${1:-0}"
  local dest
  dest="$(detect_gdrive_dest)"
  mkdir -p "$dest"

  local stamp
  stamp="$(date '+%Y-%m-%dT%H%M%S%z')"
  local archive_name="agent-configs-${stamp}.tar.gz"
  local archive_path="${dest}/${archive_name}"
  _BACKUP_STAGING="$(mktemp -d "${TMPDIR:-/tmp}/agent-config-backup.XXXXXX")"
  local staging="$_BACKUP_STAGING"

  cleanup_staging() {
    if [[ -n "${_BACKUP_STAGING:-}" && -d "${_BACKUP_STAGING}" ]]; then
      rm -rf "${_BACKUP_STAGING}"
    fi
    _BACKUP_STAGING=""
  }
  trap cleanup_staging EXIT

  log "Starting backup → ${dest} (secrets=${INCLUDE_SECRETS})"

  local count=0
  local line src name target
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    src="${line%%|*}"
    name="${line#*|}"
    target="${staging}/${name}"
    mkdir -p "$(dirname "$target")"

    if [[ -f "$src" ]]; then
      if [[ "$dry_run" == "1" ]]; then
        echo "FILE  $src → $name"
      else
        cp -p "$src" "$target" 2>/dev/null || cp "$src" "$target"
      fi
      count=$((count + 1))
    elif [[ -d "$src" ]]; then
      if [[ "$dry_run" == "1" ]]; then
        echo "DIR   $src → $name  (with excludes)"
        # rough size estimate of included tree
        du -sh "$src" 2>/dev/null | awk -v n="$name" '{print "      full size " $1 " (before excludes) → " n}'
      else
        # rsync copies filtered tree into staging
        rsync -a "${EXCLUDES[@]}" "$src"/ "$target"/ 2>/dev/null \
          || rsync -a "$src"/ "$target"/
      fi
      count=$((count + 1))
    fi
  done < <(collect_sources)

  if [[ "$dry_run" == "1" ]]; then
    echo "Would write: $archive_path"
    echo "Sources staged (logical): $count"
    echo "Keep last: $KEEP archives"
    return 0
  fi

  # Manifest
  {
    echo "created: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "host: $(hostname)"
    echo "user: $(whoami)"
    echo "include_secrets: ${INCLUDE_SECRETS}"
    echo "sources:"
    collect_sources | while IFS= read -r line; do
      src="${line%%|*}"
      name="${line#*|}"
      if [[ -e "$src" ]]; then
        echo "  - ${name} <= ${src}"
      fi
    done
  } > "${staging}/MANIFEST.txt"

  tar -czf "$archive_path" -C "$staging" .
  local size
  size="$(du -h "$archive_path" | awk '{print $1}')"
  log "Wrote ${archive_name} (${size}) from ${count} sources"

  # Symlink/copy latest for easy find
  ln -sfn "$archive_name" "${dest}/latest.tar.gz" 2>/dev/null \
    || cp "$archive_path" "${dest}/latest.tar.gz"

  prune_old "$dest"
  log "Done. Destination: ${dest}"
}

prune_old() {
  local dest="$1"
  # Keep newest $KEEP archives; delete older agent-configs-*.tar.gz
  local list
  list="$(ls -1t "${dest}"/agent-configs-*.tar.gz 2>/dev/null || true)"
  [[ -z "$list" ]] && return 0

  local i=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    i=$((i + 1))
    if (( i > KEEP )); then
      log "Prune $f"
      rm -f "$f"
    fi
  done <<< "$list"
}

# ---------------------------------------------------------------------------
# Schedule (launchd, hourly while logged in)
# ---------------------------------------------------------------------------
install_schedule() {
  mkdir -p "${HOME}/Library/LaunchAgents"
  mkdir -p "$(dirname "$LOG")"

  # Absolute path to this script
  local script="$SCRIPT_PATH"
  if [[ ! -x "$script" ]]; then
    chmod +x "$script"
  fi

  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${script}</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
</dict>
</plist>
EOF

  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
  launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  # Kick once so first backup is immediate
  launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || true

  echo "Installed hourly backup: ${PLIST_PATH}"
  echo "Log: ${LOG}"
  echo "Dest: $(detect_gdrive_dest)"
  echo "Runs every 3600s while you are logged in."
}

uninstall_schedule() {
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "Removed ${LABEL}"
}

show_status() {
  echo "Plist: $PLIST_PATH"
  if [[ -f "$PLIST_PATH" ]]; then
    echo "Installed: yes"
    launchctl print "gui/$(id -u)/${LABEL}" 2>/dev/null | head -25 || echo "(loaded state unknown)"
  else
    echo "Installed: no"
  fi
  echo "Log: $LOG"
  if [[ -f "$LOG" ]]; then
    echo "--- last log lines ---"
    tail -n 15 "$LOG"
  fi
  local dest
  dest="$(detect_gdrive_dest 2>/dev/null || true)"
  if [[ -n "${dest:-}" && -d "$dest" ]]; then
    echo "--- backups in $dest ---"
    ls -lht "$dest"/agent-configs-*.tar.gz 2>/dev/null | head -10 || echo "(none yet)"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
case "${1:-}" in
  --dry-run)   run_backup 1 ;;
  --install)   install_schedule ;;
  --uninstall) uninstall_schedule ;;
  --status)    show_status ;;
  --help|-h)
    sed -n '2,20p' "$0"
    ;;
  "")
    run_backup 0
    ;;
  *)
    echo "Unknown option: $1 (try --help)" >&2
    exit 2
    ;;
esac
