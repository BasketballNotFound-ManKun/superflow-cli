#!/usr/bin/env bash
# @chenmk/superflow 一键安装脚本
#
# 用途：在新机器上部署 SuperBridge Flow CLI（Claude Code / Codex）
# 用法：bash install.sh
#
# 前置要求：
#   - Node.js 20+
#   - Claude Code 或 Codex 至少一个已安装
#   - 网络可访问 npm registry（推荐 npmmirror.com 国内加速）
#
# 步骤：
#   1. 校验 Node 版本
#   2. npm install（依赖）
#   3. npm run build（生成 dist/）
#   4. link superflow 命令到全局 PATH
#   5. 跑 superflow init 部署 SDD 技能、hook 脚本和第三方依赖
#   6. 注册托管 MCP，并输出状态供重启后核对

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
log_info "Step 1 / 6: 校验 Node 版本"

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
log_info "Step 2 / 6: 安装 npm 依赖"

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
log_info "Step 3 / 6: build 编译 TypeScript"
npm run build
log_ok "build 完成"

# ----- Step 4: link superflow 到全局 PATH -----
log_info "Step 4 / 6: link superflow 命令到全局"

# 选择 link 策略：macOS / Linux / Git Bash 都优先 ~/.local/bin
PREFERRED_BIN="$HOME/.local/bin"
if [ ! -d "$PREFERRED_BIN" ]; then
  mkdir -p "$PREFERRED_BIN"
fi

BIN_TARGET="$PREFERRED_BIN/superflow"
MCP_BIN_TARGET="$PREFERRED_BIN/superflow-mcp"
DIST_BIN="$SCRIPT_DIR/dist/app/cli.js"
DIST_MCP_BIN="$SCRIPT_DIR/dist/mcp/server.js"

if [ -L "$BIN_TARGET" ] || [ -f "$BIN_TARGET" ]; then
  log_warn "$BIN_TARGET 已存在，覆盖"
  rm -f "$BIN_TARGET"
fi
ln -sf "$DIST_BIN" "$BIN_TARGET"
if [ -L "$MCP_BIN_TARGET" ] || [ -f "$MCP_BIN_TARGET" ]; then
  log_warn "$MCP_BIN_TARGET 已存在，覆盖"
  rm -f "$MCP_BIN_TARGET"
fi
ln -sf "$DIST_MCP_BIN" "$MCP_BIN_TARGET"
chmod +x "$DIST_BIN" "$DIST_MCP_BIN"
log_ok "superflow 命令 → $BIN_TARGET"
log_ok "superflow-mcp 命令 → $MCP_BIN_TARGET"

# 检查 PATH
if [[ ":$PATH:" != *":$PREFERRED_BIN:"* ]]; then
  log_warn "$PREFERRED_BIN 不在 PATH 中。请加到 ~/.zshrc / ~/.bashrc:"
  log_warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  log_warn "然后重开 shell"
fi

# ----- Step 5: 在 /tmp 临时目录跑 superflow init（--scope global）-----
# 目的：让本机所有项目仓库自动获得 superflow 守门
#   - hooks 写入 ~/.claude/settings.json（全局生效，所有项目触发，靠 .sdd-enforced 懒激活）
#   - skills 写入 ~/.claude/skills/（任何项目 agent 都能用 superflow-* 命令）
#   - 项目级产物（openspec / .sdd/ 等）写到 /tmp 临时目录，跑完 rm -rf
#   - 不污染任何真实项目仓库（避免之前"在源码目录跑 init 留临时上下文"的问题）
log_info "Step 5 / 6: 全局部署 superflow（不污染任何项目）"

SDD_INIT_FLAGS=""
if [ "${1:-}" = "--dry-run" ]; then
  log_info "用户指定 --dry-run：init 与 MCP 只打印计划；依赖、构建和本地链接仍执行"
  SDD_INIT_FLAGS="--dry-run"
fi

# 只向本机真实存在的 Host 部署，支持任意单侧或组合。
DETECTED_AGENTS=()
command -v codex >/dev/null 2>&1 && DETECTED_AGENTS+=("codex")
command -v claude >/dev/null 2>&1 && DETECTED_AGENTS+=("claude")
if [ "${#DETECTED_AGENTS[@]}" -eq 0 ]; then
  log_err "未检测到 Codex 或 Claude CLI，无法部署 Agent Skills 与托管 MCP"
  exit 1
fi
AGENT_VALUE=$(IFS=,; echo "${DETECTED_AGENTS[*]}")
AGENT_FLAG="--agent $AGENT_VALUE"

INIT_BASE="--yes --overwrite --no-openspec-init --no-scan --scope global $AGENT_FLAG"

if [ "$SDD_INIT_FLAGS" = "--dry-run" ]; then
  "$BIN_TARGET" init $INIT_BASE $SDD_INIT_FLAGS
else
  BOOTSTRAP_DIR="/tmp/superflow-bootstrap-$$"
  rm -rf "$BOOTSTRAP_DIR"
  mkdir -p "$BOOTSTRAP_DIR"
  pushd "$BOOTSTRAP_DIR" > /dev/null
  trap 'popd > /dev/null 2>&1; rm -rf "$BOOTSTRAP_DIR"' EXIT
  "$BIN_TARGET" init $INIT_BASE
  popd > /dev/null 2>&1
  rm -rf "$BOOTSTRAP_DIR"
  trap - EXIT
fi

log_ok "superflow 全局部署完成：hooks/skills 已写入已检测到的 Agent 用户目录"

# ----- Step 6: 注册托管 MCP -----
log_info "Step 6 / 6: 注册托管 MCP"
if [ "$SDD_INIT_FLAGS" = "--dry-run" ]; then
  "$BIN_TARGET" mcp install $AGENT_FLAG --dry-run
else
  "$BIN_TARGET" mcp install $AGENT_FLAG
  "$BIN_TARGET" mcp status $AGENT_FLAG
fi
log_ok "托管 MCP 已按本机 Agent 安装情况完成注册"

# ----- 完成 -----
echo ""
log_ok "@chenmk/superflow 安装完成"
echo ""
log_info "下一步建议："
echo "  1. superflow doctor            # 验证依赖、hook 和技能"
echo "  2. superflow mcp status $AGENT_FLAG # 核对托管 MCP"
echo "  3. 重启对应 agent          # 让 agent 加载技能和 MCP"
echo "  4. superflow clarify [feature]  # 校验 superflow-clarify 部署"
echo ""
log_ok "重复安装使用 --overwrite，不再生成新的 Superflow Skill 备份"
