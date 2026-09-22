# Test Report — v0-5-12 全局安装架构优化

> 对应用例：[tests.md](tests.md) TC-01 ~ TC-12。执行日期：2026-09-22。

## 执行环境

- Node v24.14.1 / macOS (Darwin 27.0.0) / @chenmk/superflow 0.5.11（工作版本，发版 0.5.12）
- 框架：vitest；构建：`npm run build`；lint：`eslint src/ test/`（零告警）

## 单元测试（TC-01 ~ TC-09）

- `npm test` 全量：**82 个测试文件 / 593 个用例全部通过**（含 pretest 设计门禁检查）。
- 新增 `test/unit/install-scope.test.ts` 8 个用例：TC-04/05（scope 推导与回落）、TC-06/07（清单登记幂等、缺失/损坏按空清单 + 警告）、TC-08（遍历收集 targets/staleRoots）、TC-10（project scope init 记录 scope + 登记 managedProjects 链路）。
- RED 证据：实现前运行 `npx vitest run test/unit/install-scope.test.ts` → 7 个用例全部失败（导出不存在），见会话记录；实现后同文件 8/8 通过。
- TC-01 短路耗时（空目录，8 个 hook × 3 轮 = 24 次触发）：**总 0.220s（均值 ~9ms/次）**；旧行为基线（仅最小 stdin+python3 解析段）单次 ~32ms（0.097s/3），实际旧脚本解析段更长（多次 python3 调用），真实差距大于 3.5×。短路路径不读 stdin、不调用 python3 已由代码审查与 `output_len=0` 证实。
- TC-02/03：临时目录含 `.sdd/` 时 enforce-hook 放行进入原逻辑（git 仓库外按原逻辑 exit 0）；`openspec/`、`.sdd-enforced` 判据同路径实现。
- TC-08/09：`collectManagedProjectTargets` 单测覆盖目录存在→targets、目录消失→staleRoots；update 主循环改造为 `collectUpdateFailure` 收集（单目标失败仅汇总输出，不阻断其余目标）。

## CLI 集成（TC-10 ~ TC-11）

- TC-10：`runInit`（scope=project，mock saveState 捕获）→ 断言 `platforms[agent].scope='project'` 且 `managedProjects` 含该项目（agents/scope 正确）；重复登记幂等由 TC-06 覆盖。
- TC-11 真实拦截：临时 git 仓库 + `.sdd-enforced` 下触发 enforce-hook → **exit 2，完整输出主工作树拦截消息**（门禁行为与引入短路前一致）。scope 记录缺失回落 global + 提示由 TC-05 覆盖。
- 任务口径说明：tasks.md 1.2 原列 verify-integration/test-report-lint——二者为手动命令工具（不在 hooks 注册清单，无触发开销），按 spec「hook 脚本」合同判定**不加短路**（避免手动调用被静默跳过），已短路对象为 8 个注册 hook（enforce/hook-guard/contract/integration-evidence/delivery-check/managed-work-guard/archive-command/sql-sync）。此判定与 spec 一致，属于任务清单到 spec 合同的对齐。

## 发版迁移验收（TC-12）

- 待回填：0.5.12 安装输出；`~/.claude/settings.json` 无 superflow 残留的检查结果
- 待回填：`claude --debug` 非 SDD 项目 hook 短路耗时；本仓库门禁正常证据

## 结论

- 状态：**代码与单元/集成证据通过；TC-12 待发版装版后回填**（0.5.12 安装后补齐终态证据）。
