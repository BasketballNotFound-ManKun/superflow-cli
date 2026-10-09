#!/bin/sh
# Install the existing SQL and evidence gates; retain unknown/custom Git hooks.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$SCRIPT_DIR" in */.claude/scripts) AGENT=claude ;; *) AGENT=codex ;; esac
if [ "$#" -gt 0 ]; then
    [ "$#" -eq 2 ] && [ "$1" = "--agent" ] || {
        echo "Usage: install-sql-pre-commit.sh [--agent codex|claude]" >&2
        exit 2
    }
    AGENT="$2"
fi
case "$AGENT" in codex) SUBDIR=hooks ;; claude) SUBDIR=scripts ;; *) exit 2 ;; esac
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "Not a Git repository / 当前目录不是 Git 仓库" >&2
    exit 2
}
HOOK_PATH=$(git -C "$REPO_ROOT" rev-parse --git-path hooks/pre-commit)
case "$HOOK_PATH" in /*) HOOK_FILE="$HOOK_PATH" ;; *) HOOK_FILE="$REPO_ROOT/$HOOK_PATH" ;; esac
if [ "$SCRIPT_DIR" = "$REPO_ROOT/.$AGENT/$SUBDIR" ]; then
    SCRIPTS="$SCRIPT_DIR"
    EXPRESSION='$(git rev-parse --show-toplevel)'"/.$AGENT/$SUBDIR"
else
    SCRIPTS="$HOME/.$AGENT/$SUBDIR"
    EXPRESSION='$HOME'"/.$AGENT/$SUBDIR"
fi
for name in superflow-sql-sync-hook.py superflow-delivery-check.sh superflow-test-report-lint.py; do
    [ -x "$SCRIPTS/$name" ] || {
        echo "Missing current gate: $name; run superflow update / 请先更新规范门禁" >&2
        exit 2
    }
done
[ ! -L "$HOOK_FILE" ] || { echo "Retain custom symlink / 保留自定义符号链接" >&2; exit 2; }
mkdir -p "$(dirname "$HOOK_FILE")"
TEMPORARY=$(mktemp "${HOOK_FILE}.superflow-XXXXXX")
trap 'rm -f "$TEMPORARY"' EXIT HUP INT TERM
cat > "$TEMPORARY" <<HOOK
#!/bin/sh
# Superflow managed Git evidence gate v1
SCRIPTS="$EXPRESSION"
for name in superflow-sql-sync-hook.py superflow-delivery-check.sh; do
    [ -x "\$SCRIPTS/\$name" ] || { echo "Missing Superflow gate; run superflow update" >&2; exit 2; }
    "\$SCRIPTS/\$name" --check-staged "\$(pwd)" || exit \$?
done
HOOK
if [ -f "$HOOK_FILE" ]; then
    if cmp -s "$HOOK_FILE" "$TEMPORARY"; then
        chmod +x "$HOOK_FILE"
        echo "Git gate already current / Git 门禁已接入"
        exit 0
    fi
    echo "Existing custom/legacy pre-commit retained / 已保留现有自定义或旧 pre-commit" >&2
    echo "Run superflow hook-audit for source diagnostics / 请先核对现有入口来源" >&2
    exit 2
fi
chmod +x "$TEMPORARY"
mv "$TEMPORARY" "$HOOK_FILE"
echo "Installed Git gate / 已安装 Git 门禁: $HOOK_FILE"
