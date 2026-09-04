# 托管 Prompt 职责审计

## 目的

本文审计 `src/domains/managed-work/prompts.ts` 的长期规则，帮助评审哪些应保留在轻量托管
编排，哪些应迁回 Superflow 文档生成体系。它不是新的事实源；最终边界以
`managed-work-design-principles.md` 和 `managed-agent-protocol.md` 为准。

## 结论

当前托管 Prompt 已移除具体乐观锁 SQL，以及 Spring Boot、浏览器、跨端合同、指定数据库
后端和多仓链路等场景专用测试规则。这些已迁入中英文 `superflow-docs`/`superflow-design`
文档编写原则。托管层只保留“执行冻结文档要求且不得降级替代”的通用合同。

## A. 应保留在托管 Prompt

| 规则 | 原因 |
| --- | --- |
| Host 只读、Executor 唯一写入、Runner 唯一状态写入 | 双 Agent 编排职责 |
| 禁止修改 `.superflow/tasks`、commit、push、部署 | 托管安全边界 |
| 一次调用完成全部本地任务，不碎片返回 | 调用经济与自动循环 |
| 冻结 Prompt、handoff、hash、历史 finding | 跨轮通信协议 |
| 结构化 delivery/review JSON | Agent 通信协议 |
| 事件等待、预算、供应商重试、收敛门禁 | Runner 状态机 |
| Executor 管理自己启动的进程 | 角色所有权 |
| 最终完成度扫描、真实证据、测试报告不得假绿 | 通用交付闭环 |
| 证据持久化、脱敏、非空、cleanup 后可读 | 托管审计能力 |
| owner 绑定、失败清理、零残留 | 托管运行资源安全 |
| 干净 shell 验证验收入口可移植性 | 托管执行基础设施质量 |

## B. 应由文档体系定义，托管只继承

| 当前规则主题 | 建议事实源 | 托管层最终只保留 |
| --- | --- | --- |
| API、DTO、错误码和跨端合同 | `api.md`、spec | 遵守冻结 API 合同并执行引用测试 |
| 数据表、SQL、事务、并发和幂等方案 | `design.md`、技术详设 | 不重新设计；按文档实现和评审 |
| 乐观锁 CAS 及并发争用 | `design.md`、`tests.md` | 读取具体用例 ID 和命令 |
| MySQL/Testcontainers/真实后端要求 | `tests.md`、环境 readiness | 不得用替代后端关闭文档门禁 |
| Spring Boot 启动与 HTTP 验收细节 | `tests.md` | 执行文档声明的启动和接口命令 |
| 前端浏览器 E2E、页面权限和截图断言 | `tests.md`、页面蓝图 | 执行文档声明的浏览器用例 |
| 跨端 Controller/前端请求/export snapshot | `api.md`、`tests.md` | 执行冻结合同测试 |
| 多仓构建和跨服务真实链路 | `design.md`、`tests.md` | 按受影响仓和用例执行 |
| 任务分类与发布前置 | `tasks.md`、环境合同 | Runner 只解析机器标签和状态 |

这些规则已从通用托管 Prompt 移除。完整 SDD 任务直接使用文档引用；“只给一句口头需求”
的入口由最小执行合同负责识别实现与受影响验证任务，但不得发明会改变实现方向的业务或
架构方案。出现此类选择时转 Host 澄清。

## C. 应由项目规则选择器注入

| 当前规则主题 | 建议位置 |
| --- | --- |
| 读取 `CLAUDE.md`、`.claude/rules` | context manifest / rule selector |
| 搜索复用、代码风格、Java 行宽等 | 项目规则与 preflight |
| 开发数据库可执行范围 | 项目规则 + 用户授权合同 |
| 具体框架构建命令 | environment readiness / `tests.md` |

通用托管 Prompt 只需声明“遵守已选择并冻结的项目规则”，不应重复规则正文。

## 建议迁移顺序

1. 通用 Executor Prompt 继续收敛为：角色、安全、上下文、完成度、证据、清理和 JSON。
2. 文档规则新增场景时，同步 `design.md/tests.md` 编写原则、实现 Prompt 继承规则和门禁。
3. 每次调整用两类冒烟测试验证：完整 SDD 文档入口、无文档口头简单需求入口。

## 用户评审点

- B 类规则已迁移，请重点评审事实源和托管层保留语句是否合理。
- 口头简单需求继续走最小执行合同；遇到实现方向决策时转 Host，不自动补复杂设计。
- 干净 shell、owner 绑定、失败清理和零残留是否继续作为托管通用质量规则？当前建议保留。
