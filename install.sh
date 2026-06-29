#!/usr/bin/env bash
# @chenmk/superflow 一键安装脚本
#
# 用途：在新机器上部署 SuperBridge Flow CLI（Claude Code / Codex）
# 用法：bash install.sh
#
# 前置要求：
#   - Node.js 20+
#   - Claude Code 或 Codex 已装
#   - 网络可访问 npm registry（推荐 npmmirror.com 国内加速）
#
# 步骤：
#   1. 校验 Node 版本
#   2. npm install（依赖）
#   3. npm run build（生成 dist/）
#   4. link superflow 命令到全局 PATH
#   5. 跑 superflow init 部署 SDD 技能、hook 脚本和第三方依赖
#   6. 跑 superflow doctor 验证

set -e

# ----- 颜色输出 -----
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { printf "${BLUE}%s${NC}\n" "$*"; }
log_ok()    { printf "${GREEN}✓ %s${NC}\n" "$*"; }
log_warn()  { printf "${YELLOW}⚠ %s${NC}\n" "$*"; }
log_err()   { printf "${RED}✗ %s${NC}\n" "$*" >&2; }

# ----- Step 1: 校验 Node 版本 -----
log_info "Step 1 / 5: 校验 Node 版本"

NODE_MIN=20
if ! command -v node >/dev/null 2>&1; then
  log_err "Node.js 未安装。请先装 Node ${NODE_MIN}+ (推荐用 nvm: https://github.com/nvm-sh/nvm)"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/^v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt "$NODE_MIN" ]; then
  log_err "Node 版本 ${NODE_VERSION} 太低，要求 ${NODE_MIN}+"
  exit 1
fi
log_ok "Node ${NODE_VERSION} (≥ ${NODE_MIN})"

# ----- Step 2: npm install（依赖）-----
log_info "Step 2 / 5: 安装 npm 依赖"

# 默认用 npmmirror 国内镜像加速
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
log_info "使用 npm registry: ${NPM_REGISTRY}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "package.json" ]; then
  log_err "package.json 不存在。脚本必须在 @chenmk/superflow 项目根目录运行。"
  exit 1
fi

npm install --registry="$NPM_REGISTRY" --no-audit --no-fund
log_ok "npm install 完成"

# ----- Step 3: npm run build -----
log_info "Step 3 / 5: build 编译 TypeScript"
npm run build
log_ok "build 完成"

# ----- Step 4: link superflow 到全局 PATH -----
log_info "Step 4 / 5: link superflow 命令到全局"

# 选择 link 策略：macOS / Linux / Git Bash 都优先 ~/.local/bin
PREFERRED_BIN="$HOME/.local/bin"
if [ ! -d "$PREFERRED_BIN" ]; then
  mkdir -p "$PREFERRED_BIN"
fi

BIN_TARGET="$PREFERRED_BIN/superflow"
DIST_BIN="$SCRIPT_DIR/dist/cli/index.js"

if [ -L "$BIN_TARGET" ] || [ -f "$BIN_TARGET" ]; then
  log_warn "$BIN_TARGET 已存在，覆盖"
  rm -f "$BIN_TARGET"
fi
ln -sf "$DIST_BIN" "$BIN_TARGET"
chmod +x "$DIST_BIN"
log_ok "superflow 命令 → $BIN_TARGET"

# 检查 PATH
if [[ ":$PATH:" != *":$PREFERRED_BIN:"* ]]; then
  log_warn "$PREFERRED_BIN 不在 PATH 中。请加到 ~/.zshrc / ~/.bashrc:"
  log_warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  log_warn "然后重开 shell"
fi

# ----- Step 5: 跑 superflow init + doctor -----
log_info "Step 5 / 5: 跑 superflow init 部署（默认同时部署 Claude Code + Codex）"
"$BIN_TARGET" --version
echo ""

# 提供 dry-run 选项
SDD_INIT_FLAGS=""
if [ "${1:-}" = "--dry-run" ]; then
  log_info "用户指定 --dry-run，仅打印计划不执行"
  SDD_INIT_FLAGS="--dry-run"
fi

# install.sh 在 CLI 源码目录跑；Step 5 是 per-project 的脚手架，
# 会在源码仓库 docs/ 留临时上下文，所以 install 阶段跳过 Step 5
# 用户在项目根目录单独跑 `superflow init` 才会执行 Step 5
SDD_INIT_FLAGS="$SDD_INIT_FLAGS --yes --no-openspec-init --no-scan"

"$BIN_TARGET" init $SDD_INIT_FLAGS

# ----- 完成 -----
echo ""
log_ok "@chenmk/superflow 安装完成"
echo ""
log_info "下一步建议："
echo "  1. superflow doctor            # 验证依赖、hook 和技能"
echo "  2. superflow clarify [feature]  # 校验 superflow-clarify 部署"
echo "  3. 重启对应 agent          # 让 agent 加载新部署的 SuperBridge Flow 技能"
echo ""
log_warn "注意：重启前请清理 backup 残留（如果之前 init 过）："
echo "  rm -rf ~/.claude/skills/superflow-*.backup-* ~/.codex/skills/superflow-*.backup-*"
echo ""
