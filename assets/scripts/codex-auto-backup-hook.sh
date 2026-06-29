#!/bin/bash
# Codex global experience auto backup hook.
# Optionally syncs curated ~/.codex development experience into a user-provided
# backup repository. Push requires explicit --push-once.

set -u

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
CONFIG_REPO="${CODEX_CONFIG_REPO:-}"
LOCK_DIR="${TMPDIR:-/tmp}/codex-auto-backup.lock"

usage() {
  cat <<'USAGE'
用法:
  codex-auto-backup-hook.sh [--force] [--dry-run] [--push-once]

环境变量:
  CODEX_AUTO_BACKUP_DISABLE=1  临时关闭自动备份
  CODEX_AUTO_BACKUP_DRY_RUN=1  只同步检查，不提交
  CODEX_CONFIG_REPO=/path       指定备份仓库路径；未设置时自动跳过
USAGE
}

FORCE=0
PUSH_ONCE=0
DRY_RUN="${CODEX_AUTO_BACKUP_DRY_RUN:-0}"

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

if [ "${CODEX_AUTO_BACKUP_DISABLE:-0}" = "1" ]; then
  exit 0
fi

if [ -z "$CONFIG_REPO" ]; then
  exit 0
fi

BACKUP_ROOT="$CONFIG_REPO/codex-setup"

log() {
  echo "[Codex 自动备份] $1" >&2
}

classify_backup_path() {
  local path="$1"
  case "$path" in
    codex-setup/superflow-*|codex-setup/*.skill)
      echo "SuperBridge Flow 技能"
      ;;
    codex-setup/openspec-*)
      echo "OpenSpec 技能"
      ;;
    codex-setup/codex配置/hooks/*)
      echo "hook 脚本"
      ;;
    codex-setup/codex配置/hooks.json)
      echo "hook 配置"
      ;;
    codex-setup/codex配置/config.toml)
      echo "Codex 配置"
      ;;
    codex-setup/codex配置/AGENTS.md)
      echo "全局指令"
      ;;
    codex-setup/codex配置/prompts/*)
      echo "提示词"
      ;;
    codex-setup/codex配置/rules/*)
      echo "规则"
      ;;
    codex-setup/codex配置/memories/*)
      echo "记忆"
      ;;
    *)
      echo "Codex 配置"
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
    echo "自动备份 Codex：同步配置变化"
  elif [ -z "$second" ]; then
    echo "自动备份 Codex：更新 $first"
  elif [ -z "$third" ]; then
    echo "自动备份 Codex：更新 $first 和 $second"
  elif [ -z "$extra" ]; then
    echo "自动备份 Codex：更新 $first、$second 和 $third"
  else
    echo "自动备份 Codex：更新多类全局配置"
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

sync_config_toml() {
  local src="$1"
  local dest="$2"

  awk '
    /^\[/ {
      skip = 0
      if ($0 ~ /^\[marketplaces\./) {
        skip = 1
      }
      if ($0 ~ /^\[hooks\.state/) {
        skip = 1
      }
      if ($0 ~ /^\[mcp_servers\.node_repl/) {
        skip = 1
      }
      if ($0 ~ /^\[tui\.model_availability_nux\]/) {
        skip = 1
      }
    }
    !skip { print }
  ' "$src" > "$dest"
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
    "$CODEX_HOME"/skills/*|"$CODEX_HOME"/hooks/*|"$CODEX_HOME"/prompts/*|"$CODEX_HOME"/rules/*|"$CODEX_HOME"/memories/*)
      return 0
      ;;
    "$CODEX_HOME"/hooks.json|"$CODEX_HOME"/config.toml|"$CODEX_HOME"/AGENTS.md)
      return 0
      ;;
  esac

  case "$CWD" in
    "$CODEX_HOME"|"$CODEX_HOME"/*)
      return 0
      ;;
  esac

  case "$COMMAND" in
    *"$CODEX_HOME"/skills*|*"$CODEX_HOME"/hooks*|*"$CODEX_HOME"/prompts*|*"$CODEX_HOME"/rules*|*"$CODEX_HOME"/memories*|*"$CODEX_HOME"/hooks.json*|*"$CODEX_HOME"/config.toml*|*"$CODEX_HOME"/AGENTS.md*|*"~/.codex/skills"*|*"~/.codex/hooks"*|*"~/.codex/prompts"*|*"~/.codex/rules"*|*"~/.codex/memories"*|*"~/.codex/hooks.json"*|*"~/.codex/config.toml"*|*"~/.codex/AGENTS.md"*)
      return 0
      ;;
  esac

  return 1
}

if ! should_trigger; then
  exit 0
fi

if [ ! -d "$CODEX_HOME" ]; then
  log "Codex 目录不存在: $CODEX_HOME"
  exit 0
fi

if [ ! -d "$CONFIG_REPO/.git" ]; then
  log "备份仓库不存在或不是 Git 仓库: $CONFIG_REPO"
  exit 0
fi

mkdir -p "$BACKUP_ROOT/codex配置/hooks" \
  "$BACKUP_ROOT/codex配置/prompts" \
  "$BACKUP_ROOT/codex配置/rules" \
  "$BACKUP_ROOT/codex配置/memories"

log "同步 ~/.codex 到 codex-setup"

if [ -f "$CODEX_HOME/config.toml" ]; then
  sync_config_toml \
    "$CODEX_HOME/config.toml" \
    "$BACKUP_ROOT/codex配置/config.toml"
fi

if [ -f "$CODEX_HOME/AGENTS.md" ]; then
  cp "$CODEX_HOME/AGENTS.md" "$BACKUP_ROOT/codex配置/AGENTS.md"
fi

if [ -f "$CODEX_HOME/hooks.json" ]; then
  cp "$CODEX_HOME/hooks.json" "$BACKUP_ROOT/codex配置/hooks.json"
fi

if [ -d "$CODEX_HOME/hooks" ]; then
  rsync -a --delete "$CODEX_HOME/hooks/" "$BACKUP_ROOT/codex配置/hooks/"
fi

if [ -d "$CODEX_HOME/prompts" ]; then
  rsync -a --delete "$CODEX_HOME/prompts/" "$BACKUP_ROOT/codex配置/prompts/"
fi

if [ -d "$CODEX_HOME/rules" ]; then
  rsync -a --delete "$CODEX_HOME/rules/" "$BACKUP_ROOT/codex配置/rules/"
fi

if [ -f "$CODEX_HOME/memories/memory_summary.md" ]; then
  cp "$CODEX_HOME/memories/memory_summary.md" \
    "$BACKUP_ROOT/codex配置/memories/memory_summary.md"
fi

if [ -f "$CODEX_HOME/memories/git-preferences.md" ]; then
  cp "$CODEX_HOME/memories/git-preferences.md" \
    "$BACKUP_ROOT/codex配置/memories/git-preferences.md"
fi

if [ -d "$CODEX_HOME/skills" ]; then
  for skill_dir in "$CODEX_HOME"/skills/*; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    case "$skill_name" in
      .backups|.system)
        continue
        ;;
    esac
    if [ -f "$skill_dir/SKILL.md" ]; then
      rsync -a --delete "$skill_dir/" "$BACKUP_ROOT/$skill_name/"
    fi
  done
fi

if [ -d "$BACKUP_ROOT/superflow-pipeline" ] && command -v zip >/dev/null 2>&1; then
  if [ ! -f "$BACKUP_ROOT/superflow-pipeline.skill" ] ||
    ! (cd "$CONFIG_REPO" && git diff --quiet -- codex-setup/superflow-pipeline); then
    tmp_skill="${BACKUP_ROOT}/superflow-pipeline.skill.tmp.$$"
    (
      cd "$BACKUP_ROOT/superflow-pipeline" &&
        zip -r -0 "$tmp_skill" references agents SKILL.md >/dev/null
    )
    if ! cmp -s "$tmp_skill" "$BACKUP_ROOT/superflow-pipeline.skill"; then
      mv "$tmp_skill" "$BACKUP_ROOT/superflow-pipeline.skill"
    else
      rm -f "$tmp_skill"
    fi
  fi
fi

chmod +x "$BACKUP_ROOT/codex配置/hooks/"*.sh \
  "$BACKUP_ROOT/codex配置/hooks/"*.py 2>/dev/null || true

if [ "$DRY_RUN" = "1" ]; then
  log "dry-run 模式，仅完成同步，不提交"
  exit 0
fi

log "提交备份仓库"

STAGE_PATHS=(
  "codex-setup/codex配置/config.toml"
  "codex-setup/codex配置/AGENTS.md"
  "codex-setup/codex配置/hooks.json"
  "codex-setup/codex配置/hooks"
  "codex-setup/codex配置/prompts"
  "codex-setup/codex配置/rules"
  "codex-setup/codex配置/memories"
  "codex-setup/setup-codex-config.sh"
  "codex-setup/superflow-pipeline.skill"
)

if [ -d "$CODEX_HOME/skills" ]; then
  for skill_dir in "$CODEX_HOME"/skills/*; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    case "$skill_name" in
      .backups|.system)
        continue
        ;;
    esac
    if [ -f "$skill_dir/SKILL.md" ]; then
      STAGE_PATHS+=("codex-setup/$skill_name")
    fi
  done
fi

(
  cd "$CONFIG_REPO" || exit 0

  for path in "${STAGE_PATHS[@]}"; do
    if [ -e "$path" ]; then
      git add "$path"
    fi
  done

  if git diff --cached --quiet; then
    log "没有需要提交的 Codex 配置变化"
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
