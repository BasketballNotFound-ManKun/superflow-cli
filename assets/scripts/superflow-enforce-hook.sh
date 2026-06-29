#!/bin/bash
# SDD 强制门禁 Hook
# 拦截 Edit/Write 工具调用，确保：
# 1. 不在主工作树直接编辑（必须用 worktree）
# 2. 数据库结构已核查（必须有 .db-verified 标记）
#
# 触发条件：项目根目录存在 .sdd-enforced 文件
# 标记说明：
#   .sdd-enforced - 由 SDD prompt 创建，表示当前有活跃的 SDD 任务
#   .db-verified   - 由研发 agent 数据库核查后创建
#
# 退出码：0=允许  2=拦截

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('tool_input', {}).get('file_path', ''))
" 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

FILE_DIR=$(dirname "$FILE_PATH")

REPO_ROOT=$(git -C "$FILE_DIR" rev-parse --show-toplevel 2>/dev/null)
if [ $? -ne 0 ]; then
    exit 0
fi

if [ ! -f "$REPO_ROOT/.sdd-enforced" ]; then
    exit 0
fi

if [ -d "$REPO_ROOT/.git" ]; then
    cat <<'BLOCK_MSG'
[SDD 门禁拦截] 检测到在主工作树直接编辑，已阻止。

原因：SDD 任务要求在独立 worktree 分支中开发，禁止污染主工作树。

请立即执行：
  git worktree add -b feature/{任务分支名} ../{项目}-worktree HEAD
  cd ../{项目}-worktree
  # 在 worktree 内重新创建门禁标记：
  touch .sdd-enforced

完成后即可继续编辑。如需取消门禁，删除主仓库的 .sdd-enforced 文件。
BLOCK_MSG
    exit 2
fi

if [ ! -f "$REPO_ROOT/.db-verified" ]; then
    cat <<'BLOCK_MSG'
[SDD 门禁拦截] 数据库结构尚未核查，编辑已阻止。

原因：写业务代码前必须先确认开发环境数据库结构与设计一致。

请立即执行数据库前置门禁：
  1. 连接开发库执行 SHOW CREATE TABLE 确认表结构
  2. 如有缺失，从汇总 SQL 文件取脚本执行
  3. 确认后创建标记：touch .db-verified

完成后即可继续编辑。如需跳过（不推荐），删除 .sdd-enforced 文件。
BLOCK_MSG
    exit 2
fi

exit 0
