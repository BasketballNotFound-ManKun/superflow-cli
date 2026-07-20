# 托管任务执行规则

## 入口

托管任务属于 `superflow-pipeline` 内建能力。用户只需说“用 Superflow 托管完成”并给出
implementation prompt、change 目录或简单任务，不需要知道内部 Skill 名和 CLI 参数。
简单任务生成最小合同；SDD 任务冻结 Superflow 已生成的 implementation prompt，不以
`tasks.md` 代替执行 Prompt。

## 角色

- 当前主 Agent：提交任务、查看结果、向用户汇总并申请 Git 批准。
- 监督 Agent：固定会话、只读检查、生成结构化问题和整改要求。
- 执行 Agent：固定会话、唯一写入者、实现并完成验证。
- 后台服务：状态、预算、队列、会话恢复和证据的唯一写入者。

## 必须通过 CLI

不要由聊天中的 Agent 手工启动另一 CLI。调用：

```bash
superflow pipeline "<implementation-prompt|change-dir|task>" --managed --project "<root>" \
  --supervisor <codex|claude> --executor <claude|codex> --language <zh|en>
```

查看：

```bash
superflow status <root>
```

托管命令默认启动独立后台服务并监听本地事件账本，直到任务进入交付、阻塞或预算耗尽等
终态。监听进程退出不影响后台任务。命令返回后，当前 Agent 读取任务报告并在原会话汇总。

## 硬门槛

- 5/7/12 调用上限由状态机先占用后调用，Prompt 无权上调。
- 语言写入冻结合同；执行 Prompt、账本、报告、通知、错误和恢复轮次始终使用同一语言。
- 每次启动和恢复都重新校验冻结合同哈希、不可覆盖权限及 5/7/12 硬上限；磁盘文件被
  改写时按失败关闭，不能继续调用 Agent。
- change 目录必须通过 `.sdd/state.yaml` 的 `implementation_prompt` 定位执行入口；
  `tasks.md` 仅作清单。Prompt 原文复制为托管快照并冻结 SHA-256，执行和评审使用同一份。
- 两个 session ID 必须落盘，禁止 `--last` / `--continue` 猜测。
- `.superflow/tasks/<task-id>/runs/<run-id>/progress.jsonl` 是追加式事实账本。
- 执行角色禁止修改托管目录、Git 提交/推送、发布、生产写入、跳过沙箱。
- 监督角色禁止修改目标文件。
- Agent 非零退出、非法 JSON、缺 session ID、工作区在检查期间变化都不能判通过。
- 工程和 SDD 任务至少提供构建、测试、启动/真实调用中的两类成功命令证据；只编译或
  只跑单元测试不能进入正式检查。
- 最终通过前运行 `superflow-managed-work-check.mjs <root> <task-id>`。
- 完整性脚本必须先通过，后台才允许写入唯一的 `run.delivery_ready` 事件；脚本失败时
  转入等待人工处理，不得留下“已可交付”的假证据。
- 通过后只进入等待 Git 批准，不能自动提交。

## 恢复

后台异常后读取任务合同、事件账本、运行状态、最近检查结果和两个 session ID。恢复原
会话并从最后确认动作继续。监督会话丢失可在完整接管后显式重建；执行会话丢失默认暂停。
