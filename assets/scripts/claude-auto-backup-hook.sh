#!/bin/bash
# Claude Code global experience auto backup hook.
# Optionally syncs curated ~/.claude development experience into a user-provided
# backup repository. Push requires explicit --push-once.

set -u

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CONFIG_REPO="${CLAUDE_CONFIG_REPO:-}"
LOCK_DIR="${TMPDIR:-/tmp}/claude-auto-backup.lock"

usage() {
  cat <<'USAGE'
用法:
  claude-auto-backup-hook.sh [--force] [--dry-run] [--push-once]

环境变量:
  CLAUDE_AUTO_BACKUP_DISABLE=1  临时关闭自动备份
  CLAUDE_AUTO_BACKUP_DRY_RUN=1  只同步检查，不提交
  CLAUDE_CONFIG_REPO=/path       指定备份仓库路径；未设置时自动跳过
USAGE
}

FORCE=0
PUSH_ONCE=0
DRY_RUN="${CLAUDE_AUTO_BACKUP_DRY_RUN:-0}"

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --push-once) FORCE=1; PUSH_ONCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
  esac
done

if [ "${CLAUDE_AUTO_BACKUP_DISABLE:-0}" = "1" ]; then
  exit 0
fi

if [ -z "$CONFIG_REPO" ]; then
  exit 0
fi

BACKUP_ROOT="$CONFIG_REPO/claude-code-setup"

log() {
  echo "[Claude 自动备份] $1" >&2
}

classify_backup_path() {
  local path="$1"
  case "$path" in
    claude-code-setup/superflow-*|claude-code-setup/*.skill)
      echo "SuperBridge Flow 技能"
      ;;
    claude-code-setup/openspec-*)
      echo "OpenSpec 技能"
      ;;
    claude-code-setup/scripts/*)
      echo "脚本"
      ;;
    claude-code-setup/agents/*)
      echo "Agent"
      ;;
    claude-code-setup/commands/*)
      echo "命令"
      ;;
    claude-code-setup/skills/*)
      echo "技能"
      ;;
    claude-code-setup/settings/*)
      echo "配置"
      ;;
    claude-code-setup/CLAUDE.md)
      echo "全局指令"
      ;;
    claude-code-setup/output-styles/*)
      echo "输出样式"
      ;;
    *)
      echo "Claude 配置"
      ;;
  esac
}

build_commit_subject() {
  local categories
  categories="$(
    git diff --cached --name-only |
      while IFS= read -r path; do
        classify_backup_path "$path"
      done |
      awk '!seen[$0]++'
  )"

  local first second third extra
  first="$(printf '%s\n' "$categories" | sed -n '1p')"
  second="$(printf '%s\n' "$categories" | sed -n '2p')"
  third="$(printf '%s\n' "$categories" | sed -n '3p')"
  extra="$(printf '%s\n' "$categories" | sed -n '4p')"

  if [ -z "$first" ]; then
    echo "自动备份 Claude：同步配置变化"
  elif [ -z "$second" ]; then
    echo "自动备份 Claude：更新 $first"
  elif [ -z "$third" ]; then
    echo "自动备份 Claude：更新 $first 和 $second"
  elif [ -z "$extra" ]; then
    echo "自动备份 Claude：更新 $first、$second 和 $third"
  else
    echo "自动备份 Claude：更新多类全局配置"
  fi
}

build_commit_body() {
  {
    echo "本次自动备份包含："
    git diff --cached --name-status |
      sed -n '1,20p' |
      sed 's/^/- /'
  }
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "已有备份任务在执行，跳过本次触发"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

INPUT="$(cat 2>/dev/null || true)"

json_value() {
  local key="$1"
  printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print('')
    raise SystemExit
tool_input = data.get('tool_input', {})
print(tool_input.get('$key', '') or '')
" 2>/dev/null
}

TOUCH_PATH="$(json_value file_path)"
COMMAND="$(json_value command)"
if [ -z "$COMMAND" ]; then
  COMMAND="$(json_value cmd)"
fi
CWD="$(json_value cwd)"

should_trigger() {
  if [ "$FORCE" = "1" ]; then
    return 0
  fi

  case "$TOUCH_PATH" in
    "$CLAUDE_HOME"/skills/*|"$CLAUDE_HOME"/scripts/*|"$CLAUDE_HOME"/agents/*|"$CLAUDE_HOME"/commands/*|"$CLAUDE_HOME"/output-styles/*)
      return 0
      ;;
    "$CLAUDE_HOME"/CLAUDE.md|"$CLAUDE_HOME"/settings.json|"$CLAUDE_HOME"/settings.local.json)
      return 0
      ;;
  esac

  case "$CWD" in
    "$CLAUDE_HOME"|"$CLAUDE_HOME"/*)
      return 0
      ;;
  esac

  case "$COMMAND" in
    *"$CLAUDE_HOME"/skills*|*"$CLAUDE_HOME"/scripts*|*"$CLAUDE_HOME"/agents*|*"$CLAUDE_HOME"/commands*|*"$CLAUDE_HOME"/output-styles*|*"$CLAUDE_HOME"/CLAUDE.md*|*"$CLAUDE_HOME"/settings.json*|*"$CLAUDE_HOME"/settings.local.json*|*"~/.claude/skills"*|*"~/.claude/scripts"*|*"~/.claude/agents"*|*"~/.claude/commands"*|*"~/.claude/output-styles"*|*"~/.claude/CLAUDE.md"*|*"~/.claude/settings.json"*|*"~/.claude/settings.local.json"*)
      return 0
      ;;
  esac

  return 1
}

if ! should_trigger; then
  exit 0
fi

if [ ! -d "$CLAUDE_HOME" ]; then
  log "Claude 目录不存在: $CLAUDE_HOME"
  exit 0
fi

if [ ! -d "$CONFIG_REPO/.git" ]; then
  log "备份仓库不存在或不是 Git 仓库: $CONFIG_REPO"
  exit 0
fi

log "同步 ~/.claude 到 claude-code-setup"

# 确保备份目录存在
mkdir -p "$BACKUP_ROOT/settings" \
  "$BACKUP_ROOT/agents" \
  "$BACKUP_ROOT/commands" \
  "$BACKUP_ROOT/output-styles" \
  "$BACKUP_ROOT/scripts" \
  "$BACKUP_ROOT/skills"

# 1. CLAUDE.md
if [ -f "$CLAUDE_HOME/CLAUDE.md" ]; then
  cp "$CLAUDE_HOME/CLAUDE.md" "$BACKUP_ROOT/CLAUDE.md"
fi

# 2. settings.json（过滤运行时状态）
if [ -f "$CLAUDE_HOME/settings.json" ]; then
  python3 "$BACKUP_ROOT/scripts/sync-settings-json.py" \
    "$CLAUDE_HOME/settings.json" \
    "$BACKUP_ROOT/settings/settings.json"
fi

# 3. settings.local.json
if [ -f "$CLAUDE_HOME/settings.local.json" ]; then
  cp "$CLAUDE_HOME/settings.local.json" "$BACKUP_ROOT/settings/settings.local.json"
fi

# 4. agents
if [ -d "$CLAUDE_HOME/agents" ]; then
  rsync -a --delete "$CLAUDE_HOME/agents/" "$BACKUP_ROOT/agents/"
fi

# 5. commands
if [ -d "$CLAUDE_HOME/commands" ]; then
  rsync -a --delete "$CLAUDE_HOME/commands/" "$BACKUP_ROOT/commands/"
fi

# 6. output-styles
if [ -d "$CLAUDE_HOME/output-styles" ]; then
  rsync -a --delete "$CLAUDE_HOME/output-styles/" "$BACKUP_ROOT/output-styles/"
fi

# 7. scripts（排除备份脚本自身，避免循环）
if [ -d "$CLAUDE_HOME/scripts" ]; then
  rsync -a --delete \
    --exclude='claude-auto-backup-hook.sh' \
    "$CLAUDE_HOME/scripts/" "$BACKUP_ROOT/scripts/"
fi

# 8. skills：只同步两边都存在的（用户显式维护的），不自动添加新 skill
if [ -d "$CLAUDE_HOME/skills" ]; then
  for skill_dir in "$CLAUDE_HOME"/skills/*; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    case "$skill_name" in
      .backups|.system)
        continue
        ;;
    esac
    # 只备份备份目录中已存在的 skills（不自动引入 marketplace skills）
    if [ -d "$BACKUP_ROOT/skills/$skill_name" ] && [ -f "$skill_dir/SKILL.md" ]; then
      rsync -a --delete "$skill_dir/" "$BACKUP_ROOT/skills/$skill_name/"
    fi
  done
fi

chmod +x "$BACKUP_ROOT/scripts/"*.sh \
  "$BACKUP_ROOT/scripts/"*.py 2>/dev/null || true

if [ "$DRY_RUN" = "1" ]; then
  log "dry-run 模式，仅完成同步，不提交"
  exit 0
fi

log "提交备份仓库"

STAGE_PATHS=(
  "claude-code-setup/CLAUDE.md"
  "claude-code-setup/settings/settings.json"
  "claude-code-setup/settings/settings.local.json"
  "claude-code-setup/agents"
  "claude-code-setup/commands"
  "claude-code-setup/output-styles"
  "claude-code-setup/scripts"
  "claude-code-setup/skills"
)

(
  cd "$CONFIG_REPO" || exit 0

  for path in "${STAGE_PATHS[@]}"; do
    if [ -e "$path" ]; then
      git add "$path"
    fi
  done

  if git diff --cached --quiet; then
    log "没有需要提交的 Claude 配置变化"
    if [ "$PUSH_ONCE" != "1" ]; then
      exit 0
    fi
  else
    commit_subject="$(build_commit_subject)"
    commit_body="$(build_commit_body)"
    log "提交说明: $commit_subject"
    git commit -m "$commit_subject" -m "$commit_body"
    if [ "$PUSH_ONCE" != "1" ]; then
      log "已完成本地提交；如需推送，请手动执行: $0 --push-once"
      exit 0
    fi
  fi

  current_branch="$(git branch --show-current)"
  if [ -z "$current_branch" ]; then
    log "当前仓库不在普通分支，跳过推送"
    exit 0
  fi
  git push origin "$current_branch"
)
