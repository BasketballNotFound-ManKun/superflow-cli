# 版本迭代参考

> superflow-cli 0.2.x 版本迭代决策记录。

---

## 吸收 ✅

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

## 不吸收 ❌

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
