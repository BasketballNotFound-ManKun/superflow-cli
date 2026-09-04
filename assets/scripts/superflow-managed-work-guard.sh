#!/bin/bash
# Managed-work role guard. Active only inside a Superflow managed Agent process.

set -u

ROLE="${SUPERFLOW_MANAGED_ROLE:-}"
[ -n "$ROLE" ] || exit 0

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
GUARD="$SCRIPT_DIR/superflow-managed-command-guard.py"

if [ ! -f "$GUARD" ]; then
  echo "[Superflow 托管任务门禁] 缺少命令门禁脚本，按失败关闭：$GUARD" >&2
  exit 2
fi

exec python3 "$GUARD"
