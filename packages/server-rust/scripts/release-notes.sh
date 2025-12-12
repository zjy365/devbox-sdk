#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

FROM="${FROM:-}"
TO="${TO:-HEAD}"
PATH_FILTER="${PATH_FILTER:-packages/server-rust}"
FORMAT="${FORMAT:-- %h %s}"

usage() {
  cat <<'EOF'
Generate git log entries scoped to packages/server-rust.

Usage:
  [FROM=<ref>] [TO=<ref>] [PATH_FILTER=packages/server-rust] [FORMAT="- %h %s"] ./scripts/release-notes.sh

Examples:
  FROM=v0.1.0 TO=HEAD ./scripts/release-notes.sh
  FROM=$(git describe --tags --match 'devbox-sdk-server-v*' --abbrev=0) ./scripts/release-notes.sh
  ./scripts/release-notes.sh               # falls back to repo root commit
EOF
}

if [[ -z "$FROM" ]]; then
  FROM=$(git -C "$ROOT" rev-list --max-parents=0 HEAD)
fi

git -C "$ROOT" log "${FROM}..${TO}" --no-merges --pretty=format:"${FORMAT}" -- "${PATH_FILTER}"
