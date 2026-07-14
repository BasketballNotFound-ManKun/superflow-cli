# 版本迭代参考

> superflow-cli 长期立项目的、外部项目吸收判断与版本迭代决策记录。

---

## 立项目的

Superflow CLI 是面向个人开发工作流的 SDD 一站式编排工具，只重点支持
Codex 和 Claude Code，不以扩大 Agent/IDE 平台覆盖数量为目标。

它要打通的主链路是：

1. 读取产品需求、原型、在线文档和已有 OpenSpec 产物。
2. 使用 understand-anything 定位平台级影响面，再回到当前源码、Mapper/XML、
   数据库、接口、日志和真实消费入口核实事实。
3. 探索并确认业务边界、架构边界、字段语义、上下游关系和回归影响。
4. 冻结需求、API、数据、详设、任务、测试和验收证据等 OpenSpec/SDD 合同文档，
   避免需求理解偏差和实现自由发挥。
5. 生成一个继承完整合同、技术详设、handoff hash、允许/禁止修改范围和验证要求的
   任务 Prompt。
6. 由 Superpowers 负责源码级 HOW，组织开发、独立测试、评审和验证，完成编码到
   测试报告收口的一站式流水线交付。

### 权责边界

- **OpenSpec/SDD**：需求、API、DB、SQL、字段语义、测试和验收合同的事实源。
- **understand-anything**：影响面定位器和代码地图，不是最终事实源。
- **当前源码与真实数据**：用于核实架构、调用链、表关系、字段语义和运行行为。
- **Superpowers**：在已冻结合同内完成技术方案、编码、测试、评审和验证。
- **Superflow**：编排以上能力，维护阶段、上下文、任务 Prompt 和强制质量门。

### 效率原则

- 一站式不等于减少必要文档，而是减少重复解释、人工接力和上下文丢失。
- 任务 Prompt 是从确定性文档进入自主实现的主要交接边界。
- 新命令、新阶段或新文档只有在解决已证明的流程缺口时才引入。
- 不为平台数量、生态规模或概念完整性增加与个人开发主链路无关的复杂度。

---

## 外部项目吸收判断标准

评估其他开源项目时，不按“它有什么命令”或“社区是否流行”决定是否吸收，必须逐项回答：

1. 是否直接增强上述主链路的需求准确性、边界发现、文档确定性、Prompt 完整性、
   自主实现能力、真实验证能力或总体开发效率？
2. Superflow 当前是否已经覆盖，而且现有实现是否更贴合真实工程？
3. 吸收后的收益是否大于新增命令、阶段、依赖、文档和维护成本？
4. 是否会产生第二套需求、设计、任务或测试事实源？
5. 是否只服务于多平台、多人生态或分发市场，而不是 Codex/Claude 个人工作流？
6. 能否以最小机制吸收，而不是连同对方的产品形态一起搬入？

### 决策类型

- **吸收**：存在明确缺口，能直接提升主链路，且不会制造第二套事实源。
- **不吸收**：已有且更强、偏离立项目的，或收益不足以覆盖复杂度。
- **观察**：当前无真实缺口，但未来条件变化后可能有价值。

无论是否吸收都必须记录。每次外部项目评估的整体记录至少包含：

`项目/版本 | 候选能力 | 与立项目的关系 | 现有覆盖证据 | 决定 | 理由 |
不确定项 | 重新评估触发条件 | 事实证据路径`

当前判断允许出错，因此“不吸收”不是永久否决；只要触发条件出现，就必须回到当时的
证据重新评估，不能只复用旧结论。

如果决定吸收，还必须补充 Sync Impact Report（同步影响报告），列出需要同步的 CLI、
skills、prompts、hooks、tests、中英文资产和迁移兼容边界。

---

## GitHub Spec Kit 评估（2026-07-14）

评估基线：`github/spec-kit`，`main@654793b`，`0.12.15.dev0`。

### 吸收

| 候选能力 | 决定 | 理由 | 落点 |
|---------|------|------|------|
| Constitution 式产品北极星 | ✅ 吸收思想，不新增命令 | 外部能力必须先对齐立项目的，防止因功能丰富而偏离主链路 | 本文“立项目的” |
| 决策同步影响报告 | ✅ 吸收方法 | 吸收规则后必须核对 CLI、技能、Prompt、Hook、测试和双语资产，避免只改一处 | 本文吸收标准 |

#### Sync Impact Report

| 同步面 | 本次处理 | 兼容边界 |
|-------|----------|----------|
| CLI / 状态机 / Hooks | 不改 | 本次只吸收决策方法，不引入 Spec Kit 运行依赖或第二套状态模型 |
| Skills / Prompts | 不改 | 立项目的和吸收判断先作为维护决策规则，不改变现有命令语义 |
| Tests | 不改 | 没有运行时代码变化；后续吸收可执行能力时必须补回归测试 |
| 中英文资产 | 不改 | 本文是中文内部决策记录，不属于安装时分发的双语 Skill 资产 |
| 事实证据 | 已核对 | `github/spec-kit` 的 `main@654793b`、CLI 参考、Workflows、Bundles 与 Integrations 文档 |

### 不吸收

| 候选能力 | 决定 | 理由 | 现有覆盖证据 |
|---------|------|------|-------------|
| `specify/plan/tasks/implement` 命令链 | ❌ | 会和 OpenSpec/Superflow 主链路重复，并引入第二套规格和任务模型 | `superflow-clarify/docs/design/implement` |
| `analyze/converge` 命令 | ❌ | 跨文档一致性、实现收敛和遗漏补齐已由详设、追溯矩阵、任务 Prompt、独立 Tester、Reviewer 和 verify 负责 | `superflow-design/implement/verify` |
| 通用 YAML Workflow Engine | ❌ | 当前强约束状态机、guard、hook 和 handoff 更贴合 SDD 交付，通用编排会增加一层状态模型 | `.sdd/state.yaml`、`superflow-state.sh`、`superflow-guard.sh` |
| Extensions/Presets/Bundles/Catalog | ❌ | 面向多人生态和能力分发，不直接提升个人一站式开发效率 | 当前 assets manifest 与固定技能集 |
| 30+ Agent Integration Registry | ❌ | 立项目的只重点支持 Codex 和 Claude Code | `src/domains/agent.ts` |
| Spec Kit 文档目录和模板模型 | ❌ | OpenSpec/SDD 已是合同事实源，并且包含 API、DB、tests、traceability 和 evidence | `superflow-docs`、OpenSpec change 目录 |
| 将 Spec Kit 作为运行依赖 | ❌ | 没有不可替代的运行能力，反而增加版本、安装和语义耦合 | 当前 Superflow 独立安装链路 |

### 观察与重新评估触发条件

| 观察项 | 当前不吸收原因 | 重新评估触发条件 |
|-------|---------------|-----------------|
| Workflow resume / converge | 当前状态恢复、handoff 和 verify 已覆盖 | 完整任务 Prompt 反复因中断、遗漏或上下文超限而无法稳定闭环 |
| Preset / Extension | 当前只服务个人固定工作流 | Superflow 明确转为多人、多团队或多种治理方案的产品 |
| 声明式条件分支、循环、Fan-out/Fan-in | 当前定制状态机更简单、更强 | 真实需求无法由现有 phase/transition 表达，并出现重复手写编排 |
| 更多 Agent 集成 | 不服务当前目标 | Codex 或 Claude 无法覆盖必要开发场景，且出现明确的新工具刚需 |

本次结论不是“Spec Kit 没有价值”，而是它的主要价值在通用 SDD 脚手架和生态平台；
Superflow 的目标是把 OpenSpec、understand-anything、真实源码与 Superpowers 组合成
个人高确定性的一站式工程交付流水线，两者的产品重心不同。

本次不确定项主要是 Workflow resume/converge、Preset/Extension、声明式并行编排和
更多 Agent 集成的长期收益；重新评估触发条件见上表。事实证据基线为
`https://github.com/github/spec-kit/tree/654793b65906` 及该提交下的官方 reference 文档。

---

## 历史吸收 ✅

| # | 能力 | 值得？ | 理由 |
|---|------|--------|------|
| 1 | **三层分层架构** (app/domains/platform) | ✅ P0 已完成 | 32 文件混放 → platform/domains/app 三层清晰 |
| 2 | **RunState 与用户配置分离** | ✅ P0 已完成 | workflow-state + run-state + state-events 三层状态 |
| 3 | **review_mode 三级审查** | ✅ P1 已完成 | `superflow config --review-mode off\|standard\|thorough` |
| 4 | **auto_transition 自动流转** | ✅ P1 已完成 | `superflow config --auto-transition`，status 展示 |
| 5 | **意图路由** | ✅ P1 已完成 | `domains/intent.ts` 自动识别 full/hotfix/tweak/resume |
| 6 | **审计日志** (state-events.jsonl) | ✅ P1 已完成 | `domains/state-events.ts`，config 命令自动记录 |
| 7 | **文档完整性检查** | ✅ 自主新增 | `superflow check <change>` 对照 13 项必备文件清单逐项核验 |
| 8 | ~~Dashboard 本地看板~~ | ❌ | 多终端各盯一个需求，不需要鸟瞰视图 |

---

## 历史不吸收 ❌

### 已有且更强

| # | 能力 | 不吸收？ | 理由 |
|---|------|---------|------|
| 8 | 阶段写入拦截 (hook guard) | ❌ | superflow-hook-guard.sh 已实现 |
| 9 | 交付完整性检查 | ❌ | superflow-delivery-check.sh 200+ 行，已足够全面 |
| 10 | Pre-commit 拦截 | ❌ | 已有 git hook 触发 |
| 11 | 上下文防漂移 | ❌ | delivery-check.sh 已有 handoff hash 校验 |

### 用不上

| # | 能力 | 不吸收？ | 理由 |
|---|------|---------|------|
| 12 | Eval 评估系统 | ❌ | 评 Skill 本身质量，不辅助日常开发；个人迭代靠感觉够了 |
| 13 | 29+ 平台支持 | ❌ | 自己用，Claude Code + Codex 足够 |
| 14 | CodeGraph 语义索引 | ❌ | understand-anything 已解决项目理解 |
| 15 | Skill 组合平台 | ❌ | 面向 Skill 分发，个人不需要 |
| 16 | Bundle 编译与分发 | ❌ | 同上 |
| 17 | Skill 评审-批准-发布流水线 | ❌ | 同上 |
| 18 | LangSmith/LangFuse 集成 | ❌ | 需要额外服务 |
| 19 | 多语言 Skill 选择 | ❌ | 中文够用 |

### 已被覆盖

| # | 能力 | 不吸收？ | 理由 |
|---|------|---------|------|
| 20 | init/doctor/update/uninstall/status | ❌ | superflow 已有对应命令 |

---

## 执行顺序

```
P0: 分层架构 → RunState 分离  ✅ 已完成
        ↓
P1: review_mode → auto_transition → 意图路由 → 审计日志  ✅ 已完成
```

进度：
- **P0 完成**：`src/platform/`(4) → `src/domains/`(17) → `src/app/`(15) 三层架构；RunState/WorkflowState 分离
- **P1 完成**：`superflow config` 命令设置 review_mode/auto_transition；意图路由 `domains/intent.ts`；审计事件 `domains/state-events.ts`；status 展示 auto_transition

每阶段完成跑 `npm test`，不回归再进下一阶段。

## 参考实现

| 参考什么 | 位置 |
|---------|------|
| 状态定义 | `classic-state.ts` |
| 门禁逻辑 | `classic-guard.ts` |
| 阶段转换表 | `classic-transitions.ts` |
| 审计日志 | `classic-state-events.ts` |
| RunState | `engine/state.ts` |
| CLI 组织 | `app/cli/index.ts` |
