<p align="center">
  <img src="./assets/brand/superflow-banner.svg" alt="SuperBridge Flow banner">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@chenmk/superflow"><img alt="npm version" src="https://img.shields.io/npm/v/@chenmk/superflow?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/@chenmk/superflow"><img alt="monthly downloads" src="https://img.shields.io/npm/dm/@chenmk/superflow?style=flat-square&label=Downloads/mo"></a>
  <a href="https://www.npmjs.com/package/@chenmk/superflow"><img alt="weekly downloads" src="https://img.shields.io/npm/dw/@chenmk/superflow?style=flat-square&label=Downloads/wk"></a>
  <a href="https://github.com/BasketballNotFound-ManKun/superflow-cli/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/BasketballNotFound-ManKun/superflow-cli?style=flat-square"></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square"></a>
  <img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square">
</p>

<p align="center">
  <strong>把 OpenSpec/SDD 的合同约束和 Superpowers 的工程纪律，收束成一个可执行的交付工作流。</strong>
</p>

<p align="center">
  <a href="./README.md">English</a>
  ·
  <a href="#安装">安装</a>
  ·
  <a href="#工作流">工作流</a>
  ·
  <a href="#star-history">Star History</a>
</p>

# SuperBridge Flow

通用 SDD 开发工作流 CLI，支持 Claude Code、Codex 和 OpenCode。

SuperBridge Flow 不是简单“装两个工具”，而是把 OpenSpec/SDD 和
Superpowers 编排成一个有状态的研发流程：前者负责需求、合同和验收口径，
后者负责源码级设计、TDD 顺序、实现分工、review 和真实验证。

CLI 会把 SuperBridge Flow 技能、配套 hook/command 脚本整合为单一 npm 包，
自动部署到：

- Claude Code：`~/.claude/skills/`、`~/.claude/scripts/`，并注册 `~/.claude/settings.json` hook
- Codex：`~/.codex/skills/`、`~/.codex/hooks/`
- OpenCode：`.opencode/skills/`、`.opencode/commands/`、`.opencode/scripts/`
  或全局 `~/.config/opencode/`

## 工作流

```text
docs -> design -> implement -> verify -> archive
```

| 阶段 | 主责 | 产物 |
|------|------|------|
| `docs` | OpenSpec/SDD | 需求、接口、数据库、测试和验收合同 |
| `design` | Superpowers | 源码级技术详设、影响面分析和 TDD 计划 |
| `implement` | Superpowers + SuperBridge Flow | 分批任务 prompt、review 门禁和执行状态 |
| `verify` | SuperBridge Flow hooks | 有证据的测试报告、真实入口和联调校验 |
| `archive` | OpenSpec/SDD | 归档后的 spec 状态和生命周期闭环 |

## 安装

```bash
npm install -g @chenmk/superflow
```

完整安装、初始化和日常使用教程见 [INSTALL.md](./INSTALL.md)。

## 快速开始

```bash
# 交互式选择 Claude Code / Codex / OpenCode（可多选）
superflow init

# 非交互模式，默认同时安装 Claude Code + Codex
superflow init --yes

# 显式安装 OpenCode
superflow init --agent opencode

# 同时安装 Claude Code + Codex + OpenCode
superflow init --agent all

# 跳过 hook 注册（手工管理）
superflow init --no-hooks

# 只打印计划不执行
superflow init --dry-run

# 从失败步骤继续
superflow init --resume

# 验证安装
superflow doctor
```

语言也可以全局切换：

```bash
# 查看英文 CLI help
superflow --language en --help

# 当前 shell 默认使用英文提示
export SUPERFLOW_LANG=en
superflow init
```

## SDD 分工

- OpenSpec/SDD 负责 WHAT 和合同：需求、API、DB、SQL、字段语义、tests、真实入口验收和质量门禁。
- Superpowers 负责 HOW：源码级技术详设、TDD/RED 顺序、团队分工、worktree/端口并行、review/tester 编排和验证闭环。
- 完整流程是 `docs -> design -> implement -> verify -> archive`。Superpowers 技术详设落到 `docs/superpowers/specs/*-technical-design.md`，并记录到 `.sdd/state.yaml` 的 `technical_design`，避免长会话压缩后漂移。
- Codex 侧通常用自然语言或 `$superflow-pipeline` 触发；Claude Code 侧可以直接用 `/superflow-pipeline`、`/superflow-docs`、`/superflow-design` 等 slash command。
- 飞书、语雀等在线文档读取工具不内置在 SuperBridge Flow CLI 中；可自行用 `lark-cli` 等外部工具读取，再通过 `/superflow-pipeline` 或 `$superflow-pipeline` 分段分析指定小节。

## 命令

| 命令 | 说明 |
|------|------|
| `superflow init` | 一站式安装；交互终端中可多选 Claude Code / Codex / OpenCode |
| `superflow init --yes` | 非交互安装，默认 `--agent both` |
| `superflow init --agent opencode` | 安装 OpenCode skills、commands、scripts 和 rules |
| `superflow init --agent all` | 同时安装 Claude Code + Codex + OpenCode |
| `superflow init --dry-run` | 只打印计划不执行 |
| `superflow init --resume` | 从失败步骤继续 |
| `superflow init --no-hooks` | 只装技能 + 脚本，跳过 Codex/Claude hook 注册 |
| `superflow init --no-openspec-init` | 跳过当前项目 OpenSpec 原生初始化 |
| `superflow doctor` | 诊断 CLI / 第三方 / 脚本 / skills |
| `superflow doctor --agent codex` | 只诊断 Codex 侧 |
| `superflow --language en --help` | 查看英文 CLI help |
| `superflow scan --language en` | 重新生成英文项目上下文模板 |
| `superflow clarify [feature]` | 校验 SuperBridge Flow clarify 阶段技能部署 |
| `superflow docs [change]` | 校验 SuperBridge Flow docs 阶段技能部署 |
| `superflow design [change]` | 校验 SuperBridge Flow design 阶段技能部署 |
| `superflow implement [task]` | 校验 SuperBridge Flow implement 阶段技能部署 |
| `superflow pipeline` | 校验 SuperBridge Flow pipeline 阶段技能部署 |

## 系统支持

- macOS 10.15+
- Linux（Ubuntu 20.04+ / 其它主流发行版）
- Windows 10+（CLI 本体支持；hook 脚本需要 Git Bash 或兼容 shell）

## 依赖

- Node.js 20+
- Claude Code、Codex 或 OpenCode（按 `--agent` 选择）
- 第三方（`superflow init` 自动装）：
  - openspec CLI（硬依赖，npm 全局）并在当前项目执行 `openspec init --tools ...`
  - superpowers（Claude Code / Codex 为硬依赖；OpenCode 侧通过已部署 skills/commands 使用流程）
  - understand-anything（尽力安装，失败只警告）
  - api-doc-changelog（辅助 skill，复制到目标 agent skills 目录）

## 自动检查更新

注册 hook 后，Superflow 会在新会话开始时轻量检查核心依赖更新：

- `@chenmk/superflow`
- `@fission-ai/openspec`
- Claude Code / Codex 的 Superpowers 插件；OpenCode 侧的 SuperBridge Flow assets

推荐策略是“自动检查，手动更新”：默认只提示，不自动安装；执行
`superflow update --with-package` 才会统一更新。
同一会话只检查一次，并且默认至少间隔 6 小时才真正访问 npm/plugin 源。

```bash
# 默认：只检查并提示
export SUPERFLOW_AUTO_UPDATE=check

# 关闭自动检查
export SUPERFLOW_AUTO_UPDATE=0

# 个人机器可选：检查到新版本后自动安装
export SUPERFLOW_AUTO_UPDATE=apply

# 调整最小检查间隔，默认 21600 秒（6 小时）
export SUPERFLOW_UPDATE_MIN_INTERVAL_SECONDS=21600
```

## Star History

下图由 Star History 根据 GitHub 公开 star 数据动态生成。仓库保持 private
时，第三方服务通常读不到完整数据；切换为 public 后会正常展示趋势。

[![Star History Chart](https://api.star-history.com/svg?repos=BasketballNotFound-ManKun/superflow-cli&type=Date)](https://star-history.com/#BasketballNotFound-ManKun/superflow-cli&Date)

## 许可证

MIT
