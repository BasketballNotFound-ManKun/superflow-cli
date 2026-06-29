# SuperBridge Flow 安装、初始化与日常使用教程

`@chenmk/superflow` 是面向 Claude Code 和 Codex 的 SDD 开发工作流 CLI。它把
OpenSpec、Superpowers、SuperBridge Flow 技能、状态机、handoff 上下文包、hook 脚本和
质量门禁安装到你的 agent 环境里，让一个需求可以沿着固定阶段推进：

```text
docs -> design -> implement -> verify -> archive
```

核心分工：

- OpenSpec/SDD 负责 WHAT：需求、API、DB/SQL、字段语义、spec、tests、
  traceability、验收标准和归档。
- Superpowers 负责 HOW：源码级技术详设、反向影响面、TDD/RED 顺序、
  worktree/端口并行、review/tester 分工和任务 prompt 执行策略。
- `.sdd/state.yaml`、`.sdd/handoff/` 和 `superflow-guard.sh` 负责流程状态、
  上下文防漂移和阶段推进门禁。

## 1. 前置要求

| 项 | 要求 | 检查命令 |
|----|------|----------|
| Node.js | 20+ | `node -v` |
| npm | 9+ | `npm -v` |
| Git | 已安装 | `git --version` |
| Agent | Claude Code 或 Codex 至少一个 | `claude --version` / `codex --version` |
| Shell | macOS/Linux 原生 shell；Windows 使用 Git Bash 或兼容 shell | `bash --version` |
| Python | hook 中的 Python 脚本需要 | `python3 --version` |

支持系统：

- macOS 10.15+
- Linux 主流发行版
- Windows 10+，建议配合 Git Bash；CLI 本体跨平台，hook 脚本依赖 bash
  和 python3。

## 2. 安装 CLI

### 2.1 npm 全局安装（推荐给普通用户）

```bash
npm install -g @chenmk/superflow
superflow --version
```

如果网络慢，可以切换 npm registry：

```bash
npm config set registry https://registry.npmmirror.com
npm install -g @chenmk/superflow
```

### 2.2 从源码安装（贡献者或本地调试）

```bash
git clone <your-repo-url>
cd superflow
npm install
npm run build
npm install -g .
superflow --version
```

macOS/Linux 也可以使用仓库里的脚本：

```bash
bash install.sh
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

## 3. 初始化 SDD 环境

进入你要使用 SDD 的项目根目录后执行：

```bash
cd your-project
superflow init
```

CLI 会弹出工具选择列表。你可以只选 Codex、只选 Claude Code，或两者都选。
选择结果会替代手写 `--agent codex` / `--agent claude`。

`superflow init` 会执行：

1. 检测系统、安装范围和 agent 目录。
2. 安装 OpenSpec CLI。
3. 在当前项目目录执行 OpenSpec 原生初始化，并把你选择的工具下发给
   OpenSpec，例如 `openspec init <project> --tools claude,codex --profile custom`。
4. 为目标 agent 安装 Superpowers；这是 Superflow 的核心 HOW/TDD 依赖，
   安装失败会中断初始化。
5. 尝试安装 understand-anything，并复制 api-doc-changelog；失败只警告，
   不阻断初始化。
6. 部署 SuperBridge Flow/OpenSpec skills。
7. 部署 hook 脚本并注册到 Codex `hooks.json` 或 Claude
   `settings.json`。
8. 部署 SuperBridge Flow 防漂移规则。
9. 初始化 `docs/sdd-context/` 项目上下文模板，并提示
   understand-anything 扫描状态。

如果直接运行 `superflow init`，CLI 会像 OpenSpec 一样弹出工具选择列表：

```text
请选择要初始化的 agent 工具（可多选）：
  1) Claude Code
  2) Codex
  a) 两者都安装（默认）
输入序号，例如 1,2 / 2 / a：
```

选择结果会同时影响：

- SuperBridge Flow skills、hooks、rules 安装到哪一侧。
- OpenSpec 原生 `openspec init --tools <tools>` 的工具列表。

在脚本或 CI 中可以显式传 `--agent`，或使用 `--yes` 默认选择两者；
普通交互使用不需要手写 `--agent`。

常用初始化选项：

| 命令 | 说明 |
|------|------|
| `superflow init` | 交互式初始化，可多选 Codex / Claude Code |
| `superflow init --yes` | 非交互执行，默认初始化 Claude Code + Codex |
| `superflow init --scope global` | 安装到用户主目录，默认值 |
| `superflow init --scope project` | 安装到当前项目目录 |
| `superflow init --no-hooks` | 只安装技能和脚本，不注册 hook |
| `superflow init --no-openspec-init` | 跳过当前项目 OpenSpec 原生初始化 |
| `superflow init --no-scan` | 跳过项目上下文脚手架和扫描提示 |
| `superflow init --dry-run` | 只打印计划，不写文件 |
| `superflow init --json` | 输出 JSON，适合脚本集成 |
| `superflow init --resume` | 从上次失败步骤继续 |
| `superflow init --overwrite` | 覆盖已安装的 SuperBridge Flow 技能 |
| `superflow init --skip-existing` | 保留已存在技能，不覆盖 |

语言可以通过两种方式选择：

```bash
# 单次命令使用英文 help / 提示
superflow --language en --help
superflow init --language en

# 当前 shell 默认使用英文提示
export SUPERFLOW_LANG=en
superflow init
```

如果只想重新生成项目上下文模板，可以使用：

```bash
superflow scan --language zh
superflow scan --language en --force
```

`scan` 默认保留已经编辑过的文件；加 `--force` 才会覆盖
`docs/sdd-context/` 下的 4 个模板文件。

初始化后建议重启 Claude Code 或 Codex，让 agent 重新加载技能列表。

## 4. 验证安装

```bash
superflow doctor --agent codex
superflow doctor --agent claude
```

也可以同时检查两侧：

```bash
superflow doctor
```

`doctor` 会检查：

- `superflow` CLI 是否在 PATH。
- `openspec` CLI 是否可用。
- Superpowers、understand-anything、api-doc-changelog 是否可检测。
- SuperBridge Flow skills 是否完整。
- hook 脚本是否存在。
- hook 是否已注册。
- SDD rule 是否已部署。
- 当前项目里的 `.sdd/state.yaml` 是否符合状态机字段约束。

如果只想确认某个技能是否已经装好：

```bash
superflow pipeline --agent codex
superflow docs --agent codex
superflow design --agent codex
superflow implement --agent codex
superflow verify --agent codex
superflow archive --agent codex
```

## 5. 日常使用流程

### 5.1 开始一个完整需求

Codex 和 Claude Code 的触发方式不同：

- Codex：通常用自然语言或 `$skill-name` 触发，例如“请使用 SuperBridge Flow 流程”或
  `$superflow-pipeline`。
- Claude Code：安装后可以直接使用 slash command，例如
  `/superflow-pipeline`、`/superflow-clarify`、`/superflow-docs`、`/superflow-design`、
  `/superflow-implement`、`/superflow-verify`、`/superflow-archive`。

普通使用建议始终先走总路由，让 SDD 自己判断阶段：

- Codex：优先 `$superflow-pipeline` 或自然语言“请使用 SuperBridge Flow 流程”。
- Claude Code：优先 `/superflow-pipeline`。

只有你非常明确当前就是需求澄清、文档补齐、技术详设或实现阶段时，才直达
`$superflow-clarify` / `/superflow-clarify`、`$superflow-docs` / `/superflow-docs` 等阶段命令。

在 Codex 会话里描述需求，并明确使用 SuperBridge Flow 流程。例如：

```text
请使用 SuperBridge Flow 流程处理这个需求：……
```

在 Claude Code 会话里可以直接运行：

```text
/superflow-pipeline 处理这个需求：……
```

两种方式都会从 SDD 总入口路由，通常按下面阶段推进。

#### 示例：读取飞书在线文档中的某个小节

SuperBridge Flow CLI 不内置安装 `lark-cli`。如果团队使用飞书，可以自行准备
`lark-cli` 或其它文档下载工具；SDD 只负责读取结果、分段分析和冻结需求。

Claude Code：

```text
/superflow-pipeline
使用 lark-cli 读取这份飞书在线文档：<文档链接>。
只分析 1.1 这个需求。
```

Codex：

```text
请使用 $superflow-pipeline。
使用 lark-cli 读取这份飞书在线文档：<文档链接>。
只分析 1.1 这个需求。
```

#### 示例：读取本地需求文件中的某个小节

适用于不使用飞书、语雀或在线文档工具的项目。可以直接给本地文件路径：

Claude Code：

```text
/superflow-pipeline
读取本地需求文件：docs/requirements/charging-package-prd.md。
只分析 1.1 这个需求。
```

Codex：

```text
请使用 $superflow-pipeline。
读取本地需求文件：docs/requirements/charging-package-prd.md。
只分析 1.1 这个需求。
```

当用户指定某个小节或功能点时，SDD clarify 会自动按分段冻结流程处理：
先定位来源范围，再分析当前功能点，不会要求用户额外说明“不要整篇生成任务”。

### 5.2 docs 阶段：需求和合同文档

负责技能 / 命令：

- Codex：`$superflow-clarify`、`$openspec-propose`、`$superflow-docs`
- Claude Code：`/superflow-clarify`、`/openspec-propose`、`/superflow-docs`

长 PRD、飞书/语雀导出、截图很多或多个功能混在一起的需求，必须先用
clarify 阶段分段处理：先建 `source-ingestion.md` 和
`feature-inventory.md`，按文档顺序一次只冻结一个功能点。不能整篇需求一次性
总结成 `tasks.md` 或实现 prompt。

产物通常包括：

- `proposal.md`
- `api.md`
- `spec.md` 或 `specs/<capability>/spec.md`
- `design.md`
- `tasks.md`
- `tests.md`
- `traceability-matrix.md`
- `review-checklist.md`
- `sdd-quality-gate.md`
- `test-report.md`
- `.sdd/state.yaml`
- `.sdd/handoff/sdd-context.md`
- `.sdd/handoff/sdd-context.json`
- `.sdd/handoff/sdd-context.sha256`

这一阶段只冻结 WHAT 和合同边界。`design.md` 会写
`Superpowers Technical Design Handoff` 占位，告诉下一阶段技术详设放到哪里，
但不会在 docs 阶段抢写最终源码级 HOW。

docs 阶段退出前由 `superflow-guard.sh <change-dir> docs --apply` 检查完整性，
通过后状态进入 `phase: design`。

### 5.3 design 阶段：Superpowers 技术详设

负责技能 / 命令：

- Codex：`$superflow-design`
- Claude Code：`/superflow-design`
- 内部会使用 Superpowers 的 brainstorming、writing-plans、TDD 等能力

产物：

- `docs/superpowers/specs/<date>-<change-id>-technical-design.md`

技术详设必须说明：

- OpenSpec/SDD 文档仍是事实源，不能覆盖 API、DB、字段语义、tests 或验收合同。
- 源码级 HOW：入口、服务、Mapper/XML、消费者、同步链路、测试切入点。
- 字段或状态变更的反向影响面：
  writers、readers、filters、derived/sync、consumers、tests。
- TDD/RED 顺序和验证策略。
- worktree、端口、worker/tester/reviewer 分工。

design 阶段退出前由 `superflow-guard.sh <change-dir> design --apply` 检查
`technical_design` 是否存在、是否记录到 `.sdd/state.yaml`、是否写入
quality gate，并推进到 `phase: implement`。

### 5.4 implement 阶段：任务 prompt 和实现

负责技能 / 命令：

- Codex：`$superflow-implement`、`$openspec-apply-change`
- Claude Code：`/superflow-implement`、`/openspec-apply-change`
- 内部会使用 Superpowers 的 executing-plans、test-driven-development、
  subagent-driven-development、using-git-worktrees 等能力

必须生成：

- `prompt/implementation.md`
- `prompt/<task-name>.md`

如果 `tasks.md` 中存在任务 checkbox，只有 `prompt/implementation.md` 不够，
必须至少有任务级 prompt。任务 prompt 还要被 `tasks.md`、
`traceability-matrix.md`、`sdd-quality-gate.md` 或 `test-report.md`
交叉引用，防止长会话压缩后丢任务。

implement 阶段会继承：

- `.sdd/handoff/sdd-context.md`
- `.sdd/state.yaml` 中的 `technical_design`
- docs 阶段冻结的 API/spec/tests/quality gate

建议执行方式：

1. 先跑 RED 测试或写失败用例。
2. 按任务 prompt 分批实现。
3. 每批实现后更新 `tasks.md` 和 `test-report.md`。
4. 对接口、DB、状态字段、MQ/消费者、跨模块影响做真实证据验证。
5. 进入 verify 前跑 `superflow-guard.sh <change-dir> implement --apply`。

### 5.5 verify 阶段：验证和证据收口

负责技能 / 命令：

- Codex：`$superflow-verify`
- Claude Code：`/superflow-verify`
- 内部会使用 Superpowers 的 verification-before-completion、requesting-code-review、
  systematic-debugging

产物重点：

- `test-report.md`
- 自动化测试命令和输出摘要
- API 联调证据
- DB/SQL 验证证据
- hook/script 检查结果
- 未验证项、阻塞项、人工判断项

verify 阶段不能只写“已验证”。需要写清：

- RED 证据
- GREEN 证据
- 接口自动化或真实请求证据
- 数据库证据
- SDD hook/script 证据
- 剩余风险和不可自动化验证项

### 5.6 archive 阶段：归档

负责技能 / 命令：

- Codex：`$superflow-archive`、`$openspec-archive-change`
- Claude Code：`/superflow-archive`、`/openspec-archive-change`

归档前要求：

- `verify_result: pass`
- `verification_report` 已记录
- 相关 docs、technical design、prompt、test report 都已标注最终状态
- 用户确认可以归档

归档会把 OpenSpec change 生命周期收口，并在 SDD 状态里标注归档结果。

## 6. 中断后如何恢复

查看当前项目有哪些活跃 change：

```bash
superflow status
```

输出会告诉你当前 phase 和下一步建议命令。也可以输出 JSON：

```bash
superflow status --json
```

在 agent 会话里，也可以直接说：

```text
继续当前 SuperBridge Flow change，请先读取 .sdd/state.yaml 和 .sdd/handoff/sdd-context.md，
再按 superflow status 推荐阶段继续。
```

Claude Code 里也可以直接用当前阶段命令继续，例如：

```text
/superflow-design
/superflow-implement
/superflow-verify
```

恢复时不要只靠会话摘要。必须读取：

- `.sdd/state.yaml`
- `.sdd/handoff/sdd-context.md`
- 当前阶段相关文档
- `technical_design` 指向的 Superpowers 技术详设
- prompt 文件和 `test-report.md`

## 7. 快捷路径：hotfix 和 tweak

小修可以走轻量路径，但不能绕过真实证据。

适合 hotfix：

- 小 bug 修复
- 不涉及新 API、大 DB 变更或跨模块设计
- 仍需要测试和报告

适合 tweak：

- 文案、prompt、规则说明、非运行时代码注释
- 不改变 API、DB、业务行为、hook 执行语义

如果触及 API、SQL、Mapper/XML、状态字段、消费者、跨模块联动或真实业务行为，
必须升级为 full SDD。

## 8. 更新

### 8.1 会话级自动检查更新

注册 hook 后，Superflow 会在新会话开始时检查一次核心依赖：

- `@chenmk/superflow`
- `@fission-ai/openspec`
- Claude Code / Codex 的 Superpowers 插件

同一会话只检查一次；默认只提示，不自动安装。至少间隔 6 小时才真正访问
npm/plugin 源，避免每次 prompt 都联网。可用：

```bash
# 默认推荐：只检查并提示
export SUPERFLOW_AUTO_UPDATE=check

# 关闭自动检查
export SUPERFLOW_AUTO_UPDATE=0

# 个人机器可选：检查到新版本后自动安装
export SUPERFLOW_AUTO_UPDATE=apply

# 调整最小检查间隔，默认 21600 秒（6 小时）
export SUPERFLOW_UPDATE_MIN_INTERVAL_SECONDS=21600
```

团队或企业环境建议保持默认 `check`，由开发者显式执行
`superflow update --with-package` 更新；个人机器如果接受自动升级风险，再设置
`SUPERFLOW_AUTO_UPDATE=apply`。

### 8.2 手动更新

只刷新已安装技能、脚本、规则和 hook：

```bash
superflow update --agent codex
superflow update --agent claude
```

同时更新 npm 包：

```bash
superflow update --with-package
```

该命令会统一更新 `@chenmk/superflow`、`@fission-ai/openspec` 和已选择
agent 的 Superpowers 插件。

只查看更新计划：

```bash
superflow update --dry-run --json
```

## 9. 卸载

卸载 SDD 管理的技能、规则、脚本和 hook 注册：

```bash
superflow uninstall --agent codex --scope global --force
superflow uninstall --agent claude --scope global --force
```

同时卸载依赖：

```bash
superflow uninstall --agent codex --with-deps --force
```

卸载前查看计划：

```bash
superflow uninstall --agent codex --dry-run --json
```

卸载只移除 `@chenmk/superflow` 管理的 SuperBridge Flow/OpenSpec 技能、规则和脚本，不会删除
agent 的其它自定义配置。历史 backup 目录会保留，便于回滚。

## 10. 常见问题

### `superflow: command not found`

检查全局 npm bin 是否在 PATH：

```bash
npm bin -g
which superflow
```

如果是源码安装，也可以重新链接：

```bash
cd superflow
npm run build
npm install -g .
```

### `openspec: command not found`

```bash
npm install -g @fission-ai/openspec@latest
superflow doctor
```

### Windows hook 不执行

确认安装 Git Bash，并且 `bash`、`python3` 在 PATH：

```bash
bash --version
python3 --version
```

### 技能装好了，但 agent 没触发

重启 Claude Code 或 Codex。若仍不触发：

```bash
superflow doctor --agent codex
superflow pipeline --agent codex
```

然后在会话里明确说：

```text
请使用 $superflow-pipeline 处理这个需求。
```

### 任务 prompt 偶发缺失

当前版本的 implement 门禁会拦截这种情况。若 `tasks.md` 有 checkbox，
但 `prompt/<task-name>.md` 缺失，`superflow-guard.sh <change-dir> implement`
会失败。补齐任务 prompt 并刷新 handoff 后再继续。

### handoff hash 过期

修改 docs、technical design、prompt 或 test report 后，重新生成 handoff：

```bash
# Codex 全局安装
~/.codex/skills/superflow-pipeline/scripts/superflow-handoff.sh <change-dir> --refresh

# Claude Code 全局安装
~/.claude/skills/superflow-pipeline/scripts/superflow-handoff.sh <change-dir> --refresh
```

然后把新的 hash 写回 `design.md`、`sdd-quality-gate.md`、`test-report.md`
或 prompt 中，再跑对应阶段 guard。

## 11. 推荐日常命令速查

| 场景 | 命令 |
|------|------|
| 安装 CLI | `npm install -g @chenmk/superflow` |
| 初始化并选择工具 | `superflow init` |
| 非交互初始化两侧 | `superflow init --yes` |
| 检查健康 | `superflow doctor` |
| 查看当前进度 | `superflow status` |
| 更新技能和 hook | `superflow update` |
| 只看安装计划 | `superflow init --dry-run` |
| 只看卸载计划 | `superflow uninstall --dry-run --json` |
| 卸载 Codex 侧 | `superflow uninstall --agent codex --force` |
| 卸载 Claude 侧 | `superflow uninstall --agent claude --force` |

## 12. 推荐启动语

Codex：

```text
请使用 SuperBridge Flow 流程处理这个需求：……
```

Claude Code：

```text
/superflow-pipeline
处理这个需求：……
```

读取飞书在线文档时：

```text
/superflow-pipeline
使用 lark-cli 读取这份飞书在线文档：<文档链接>。
只分析 1.1 这个需求。
```

读取本地需求文件时：

```text
/superflow-pipeline
读取本地需求文件：docs/requirements/charging-package-prd.md。
只分析 1.1 这个需求。
```

SDD 会自动负责阶段路由、`docs -> design -> implement -> verify -> archive`
推进、OpenSpec/SDD 与 Superpowers 分工、阶段 guard、handoff 生成和 hash
防漂移。用户不需要在启动语里重复这些内部执行要求。

如果是继续中断任务，也只需要说明继续当前 SuperBridge Flow change：

Codex：

```text
继续当前 SuperBridge Flow change。
```

Claude Code：

```text
/superflow-pipeline
继续当前 SuperBridge Flow change。
```

恢复时 SDD 会读取 `superflow status`、`.sdd/state.yaml` 和 `.sdd/handoff/`
上下文包来判断当前 phase，用户不需要手动列出这些步骤。
