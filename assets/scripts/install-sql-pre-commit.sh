#!/bin/sh

set -e

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
    echo "当前目录不是 Git 仓库，无法安装 SQL pre-commit"
    exit 1
fi

HOOK_DIR="$REPO_ROOT/.git/hooks"
HOOK_FILE="$HOOK_DIR/pre-commit"
SQL_HOOK="$HOME/.codex/hooks/superflow-sql-sync-hook.py"

mkdir -p "$HOOK_DIR"

if [ -f "$HOOK_FILE" ] && ! grep -q "superflow-sql-sync-hook.py" "$HOOK_FILE"; then
    BACKUP_FILE="$HOOK_FILE.backup.$(date +%Y%m%d%H%M%S)"
    cp "$HOOK_FILE" "$BACKUP_FILE"
    {
        printf "\n"
        printf "# SDD SQL style check\n"
        printf "SQL_HOOK=\"\\$HOME/.codex/hooks/superflow-sql-sync-hook.py\"\n"
        printf "if [ -x \"\\$SQL_HOOK\" ]; then\n"
        printf "    \"\\$SQL_HOOK\" --check-staged\n"
        printf "fi\n"
    } >> "$HOOK_FILE"
    chmod +x "$HOOK_FILE"
    echo "已追加 SQL pre-commit，并备份原 hook: $BACKUP_FILE"
    exit 0
fi

cat > "$HOOK_FILE" <<'EOF'
#!/bin/sh

SQL_HOOK="$HOME/.codex/hooks/superflow-sql-sync-hook.py"

if [ -x "$SQL_HOOK" ]; then
    "$SQL_HOOK" --check-staged
fi
EOF

chmod +x "$HOOK_FILE"
echo "已安装 SQL pre-commit: $HOOK_FILE"
