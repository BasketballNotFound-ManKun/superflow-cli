import path from "path";
import { existsSync } from "fs";
import type {
  ManagedRunState,
  ManagedTaskContract,
  ReviewFinding,
} from "./types.js";
import { managedRunDir, managedTaskDir } from "./paths.js";

export function buildExecutorPrompt(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  repairFindings: ReviewFinding[] = [],
  handoffPath?: string,
): string {
  if (contract.language === "en") {
    return buildExecutorPromptEnglish(
      contract,
      state,
      repairFindings,
      handoffPath,
    );
  }
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const runDir = managedRunDir(
    contract.projectRoot,
    contract.taskId,
    state.runId,
  );
  const frozenPrompt = contract.taskPrompt
    ? [
        `${contract.taskPrompt.origin === "generated_standard" ? "冻结标准执行合同" : "冻结任务 Prompt"}：${contract.taskPrompt.snapshotPath}`,
        ...(contract.taskPrompt.origin === "generated_standard"
          ? []
          : [
              `原始 Prompt 目录：${path.dirname(contract.taskPrompt.originalPath)}`,
            ]),
        `Prompt SHA-256：${contract.taskPrompt.sha256}`,
      ]
    : [];
  const deliveryChecklist = buildDeliveryChecklist(contract, "zh");
  const repair =
    repairFindings.length === 0
      ? ""
      : [
          "",
          "## 本轮必须整改的问题",
          "",
          ...repairFindings.map((finding) =>
            [
              `- ${finding.id} [${finding.severity}] ${finding.target}`,
              `  - 证据：${finding.evidence}`,
              `  - 风险：${finding.risk}`,
              `  - 必须修复：${finding.requiredFix}`,
              `  - 验收：${finding.acceptanceChecks.join("；")}`,
            ].join("\n"),
          ),
        ].join("\n");
  const rollover =
    state.executorInvocations > 1 && !state.executorSession.sessionId
      ? [
          "- 这是全新的短执行会话，不继承旧聊天。以当前工作区、冻结任务 Prompt、已落盘结果和本轮 finding 为唯一交接事实。",
          "- 先读取项目级 CLAUDE.md、适用的 `.claude/rules` 和冻结 Prompt，再检查当前 diff；不得凭旧会话记忆猜测已完成内容。",
          "- 只有真实工具调用返回错误时，才允许声明工具不可用；不得只总结旧工作、重复合同或因会话轮换而提前返回 blocked。",
        ]
      : [];

  return [
    "你是这个托管任务唯一允许修改目标产物的执行者。",
    "请持续完成任务，不要因为配置、依赖、端口、开发数据库或测试失败就降低标准。",
    "",
    `任务编号：${contract.taskId}`,
    `运行编号：${state.runId}`,
    `任务档位：${contract.profile}`,
    `合同哈希：${contract.contractHash}`,
    `项目目录：${contract.projectRoot}`,
    `关联可写仓库：${contract.relatedProjectRoots.join("、") || "无"}`,
    `任务合同：${path.join(taskDir, "task-brief.md")}`,
    ...(handoffPath ? [`本轮压缩交接包：${handoffPath}`] : []),
    ...frozenPrompt,
    `运行证据目录（只读，不要修改）：${runDir}`,
    ...deliveryChecklist,
    "",
    "## 用户目标",
    "",
    contract.objective,
    "",
    "## 强制边界",
    "",
    ...(contract.mandatoryEngineeringRules?.length
      ? [
          "### Host 冻结的强制工程规则",
          ...contract.mandatoryEngineeringRules.map((rule) => `- ${rule}`),
          "",
        ]
      : []),
    "- 开始前读取项目级 CLAUDE.md 与当前文件类型适用的 `.claude/rules`，并遵守项目规范。",
    ...(handoffPath
      ? [
          "- 开始执行前必须完整读取本轮压缩交接包；旧会话记忆与交接包冲突时，以交接包和当前工作区为准。",
        ]
      : []),
    "- 编码前先搜索现有模块、公共方法、组件、测试和依赖，优先复用。",
    "- 若本任务修改 Superflow CLI 自身，开始前必须完整读取项目根目录下 `docs/superflow-cli-design-principles.md` 和 `docs/superflow-cli-evaluation-framework.md`；涉及托管时再读取 `docs/managed-work-design-principles.md` 和 `docs/managed-agent-protocol.md`。交付前逐项核对全局纲领、统一评价记录和专项强制回归清单。",
    ...(contract.taskPrompt
      ? [
          `- 开始工作前必须完整读取冻结${contract.taskPrompt.origin === "generated_standard" ? "标准执行合同" : "任务 Prompt"}；它是本次执行入口。`,
          ...(contract.taskPrompt.origin === "generated_standard"
            ? [
                "- 该合同只冻结执行边界；会改变实现方向的业务或架构选择必须返回 Host 澄清。",
              ]
            : [
                `- Prompt 内相对路径统一以 ${path.dirname(contract.taskPrompt.originalPath)} 为基准解析。`,
              ]),
          "- tasks.md 只用于清单追踪，不得替代冻结任务 Prompt。",
        ]
      : []),
    "- 可以在同一业务平台相关仓库内追踪真实 owner，但必须记录涉及仓库。",
    "- 可以使用已确认的开发环境数据库。禁止删库、清理既有表和无条件批量更新删除。仅当冻结 Prompt 明确授权清理唯一命名、由本任务创建的开发测试表时，才允许在验证结束后删除该表，并必须保留表已不存在的证据。",
    "- 禁止 Git commit、push、发布、部署和生产写入。",
    "- 禁止关闭沙箱、绕过权限、修改测试迎合实现或用默认值掩盖业务缺口。",
    "- 不要修改 `.superflow/tasks` 下的状态、事件、历史 Prompt 和报告，由后台统一维护。",
    "- Runner 支持非 Git 工作区的文件快照。禁止为 diff、预检或交付执行 `git init`，禁止创建、替换 `.git` 或改变启动时冻结的仓库身份。",
    "- 托管资产分四类：runtime 资源和 workspace-temporary 临时文件由你清理；delivery-artifacts 源码、SQL、测试和报告必须保留给 Host 评审；protected-contracts 冻结需求、设计、Prompt、handoff 和任务事实在终态前不得删除。受保护清单中 immutable 文件只读，retain 文件可更新进度/证据但不得移除。",
    "- 禁止使用 pkill、killall、裸 kill、只按端口/进程名清理或未经 owner 校验的 rm -rf；任务进程、容器和运行目录必须调用已认证 owner helper，普通构建缓存只能在仓库内清理。",
    "- 你负责管理自己启动的应用、构建、测试及辅助进程；退出前应清理，确需保留时必须在结果中记录 PID、用途和状态，不能把进程善后转交给只读检查者。",
    "- 任务涉及代码时必须执行与风险匹配的构建、测试和运行验证；只编译或只跑单测不等于完成。",
    ...verificationScopeGuidance(contract, repairFindings.length > 0, "zh"),
    "- 遇到确实需要用户决定、凭据或高风险权限时返回 blocked，写清已经尝试的替代方案。",
    "- 缺少真实数据库、真实 token 或生产权限，不得作为延期本地可实现代码、测试、SQL 候选和文档回填的理由。",
    "- 同批部署、原子切读或发布窗口约束的是上线时点，不是源码实现时点；必须提前完成并验证本地代码，禁止只写迁移清单后把实现推迟到发布阶段。",
    "- tasks.md 或冻结 Prompt 仍有本地代码项未完成时，不得声称本地工作已完成或已用尽。",
    "- 一次调用内持续完成全部本地可执行任务，不得只完成一个模块、一个测试或一个 finding 就提前返回评审。先维护内部清单，完成后再统一验证。",
    "- 任务需要真实应用、数据库、缓存、浏览器或其他运行环境时，首轮就必须提供仓库内的单命令验收入口：从干净状态完成前置检查、setup、构建、启动、真实调用、断言和 cleanup；成功链路与一个代表性 setup/验证失败都必须清理本任务创建的资源。入口不得硬编码个人绝对路径，必须支持项目约定或环境变量，并能在清理后重复执行。",
    "- 详细构建、框架、数据库和客户端日志必须持久化为任务证据；交付引用的路径在 cleanup 删除 nonce/运行目录后仍须存在并可由 Host 读取，不能引用交付时已删除的临时日志。",
    "- 单命令验收入口必须为每个临时进程、端口、数据库、缓存和目录建立可验证 owner 身份。cleanup 不得只凭端口、进程名或裸 PID 操作；必须验证任务 nonce/唯一目录、进程启动指纹或等价身份。优先通过可配置路径直接复用 Superflow 已认证 owner helper；只绑定任务参数的 wrapper 不算自定义清理原语，复制/重写身份判断、kill/delete 或绕过 helper 才算。普通业务任务只验证自身 owner 绑定、一个能在主要资源创建后触发统一 cleanup 的代表性失败和最终零残留；存在多个互不相同的业务删除路径时仍须分别证明删除条件。不重复 helper 的非 owner、伪造 state、PID 复用与信号升级认证套件。只有冻结 Prompt 明确要求、修改 helper/托管编排或新增自定义清理原语时，才运行完整框架认证。",
    "- 单命令验收入口声称可移植时，必须在清除工具路径覆盖变量的干净 shell 中真实运行；成功证据不得通过个人绝对路径注入 Node、owner helper 或项目工具。应从稳定 CLI 入口、项目约定或 PATH 解析安装根，并保留显式环境覆盖作为兼容能力。",
    "- 实现和验证必须继承冻结文档中的 API、DB、并发、事务与测试合同；托管执行不得自行改写 design.md/tests.md 的业务方案。口头简单需求若缺少会影响实现方向的业务或架构决策，交回 Host 澄清，不得在 Executor Prompt 中发明第二套设计。",
    "- SDD/OpenSpec 任务必须同步更新 tasks.md 和 test-report.md：只勾选真实完成项，记录真实命令、测试数量、失败、应用启动和 HTTP 结果；禁止复制旧数字或把未执行项写成通过。",
    "- OpenSpec 任务分类只认机器标签 `[local_required]`、`[environment_required]`、`[release_required]`；没有标签一律按 local_required。不得用 Blocker、owner 或自由文本把本地实现降级为外部前置。",
    "- Runner 会从 tasks.md、Git 差异和成功命令生成基础任务证据；仅当某项需要不同证据时补充 taskEvidence，禁止为凑格式重复填充所有任务。",
    "- 返回 ready_for_review 前执行最终完成度扫描：逐项核对冻结 Prompt、tasks.md、本轮全部 finding、Git diff、构建、测试、应用启动、真实 HTTP、测试报告和进程善后。",
    "- 未经冻结 Prompt 或用户明确授权，不得自行把当前任务项改标为未来版本、增量范围或发布 owner 待办。",
    "- 必须执行并核验冻结文档明确要求的真实后端、应用启动、接口、浏览器和跨仓链路；不得用替代实现关闭文档门禁。具体命令、断言和证据位置只从冻结 tests.md/implementation prompt 继承，不由托管 Prompt 补写。",
    "- 只要仍有本地可处理的 blockers 就必须返回 blocked；只有本地可完成工作全部完成时，才允许返回 ready_for_review。权限合同明确禁止且只能在 Git 批准后由 DBA/测试/SRE 完成的真实环境、部署或发布验收，必须逐项写入 releasePrerequisites，不得放入 blockers 阻止源码评审。没有发布前置条件时也必须返回空数组。",
    ...rollover,
    repair,
    "",
    "最终必须严格按照 JSON Schema 返回结构化结果。",
  ].join("\n");
}

export function buildReviewPrompt(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  factsPath?: string,
): string {
  if (contract.language === "en") {
    return buildReviewPromptEnglish(contract, state, factsPath);
  }
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const runDir = managedRunDir(
    contract.projectRoot,
    contract.taskId,
    state.runId,
  );
  const frozenPrompt = contract.taskPrompt
    ? [
        `冻结任务 Prompt：${contract.taskPrompt.snapshotPath}`,
        `原始 Prompt 目录：${path.dirname(contract.taskPrompt.originalPath)}`,
        `Prompt SHA-256：${contract.taskPrompt.sha256}`,
      ]
    : [];
  return [
    "你是这个任务持续跟踪的只读检查者。本轮不得修改任何目标文件。",
    "不要相信执行者的口头完成声明，必须独立检查当前工作区和原始证据。",
    "",
    `任务编号：${contract.taskId}`,
    `运行编号：${state.runId}`,
    `检查轮次：${state.reviewRound}`,
    `合同哈希：${contract.contractHash}`,
    `任务合同：${path.join(taskDir, "task-brief.md")}`,
    ...frozenPrompt,
    `执行结果：${state.lastExecutorResult}`,
    `任务报告：${path.join(runDir, "task-report.md")}`,
    ...(factsPath ? [`Runner 事实包：${factsPath}`] : []),
    "",
    "## 检查要求",
    "",
    "- 独立检查用户目标、修改范围、代码差异和命令证据。",
    ...(factsPath
      ? [
          "- 先读取 Runner 事实包减少重复机械检索；它只证明路径、哈希、退出码和计数，不能代替源码语义审查。",
        ]
      : []),
    "- 若本任务修改 Superflow CLI 自身，必须先对照全局设计纲领和统一评价框架完成职责分层审查；涉及托管时再对照 `docs/managed-work-design-principles.md` 和 `docs/managed-agent-protocol.md`，明确指出是否改变角色所有权、JSON 协议、状态机、证据继承或调用经济原则。",
    ...(contract.taskPrompt
      ? [
          "- 必须以冻结任务 Prompt 及其引用的 SDD 文档作为评审合同。",
          "- 必须真实运行 openspec instructions apply 并留存输出，核对 tasks.md；只认 `[local_required]`、`[environment_required]`、`[release_required]` 三类机器标签，未标注一律是 local_required。",
          "- 对本轮新增勾选逐项反查 Runner 推导证据、可选 taskEvidence、源码 diff、证据路径和验证命令；缺少真实证据必须退回，但不得只因 Executor 未重复填写可推导字段而退回。",
        ]
      : []),
    "- 检查是否复用了现有能力，是否出现重复实现。",
    "- 检查正确性、安全、数据、并发、事务、配置和真实运行风险。",
    "- 任务需要启动/API/数据库/日志证据时，缺少任一项必须阻断。",
    "- 按冻结文档逐项核对真实后端、应用启动、接口、浏览器和跨仓测试证据；托管评审不得另行发明测试合同。",
    "- 必须区分三段状态：local_delivery_ready 表示本地源码交付就绪，environment_validation_blocked 表示环境验收未闭环，release_ready 表示结构化发布任务全部签收；任何状态都不自动授权 Git、部署或生产写入。",
    "- 若冻结 Prompt 或权限合同禁止真实数据库写入、部署或发布，不得反向要求执行这些动作才能通过源码评审；应检查候选脚本和本地证据，并把真实环境验收记录为非阻断的发布前置条件。",
    "- 不得要求评审开始前已经进入任何交付终态；源码满足条件时返回 pass，由统一 CompletionPolicy 原子裁决三段状态。",
    "- 纯格式和个人偏好不要阻断，避免浪费整改轮次。",
    "- Runner 会自动合并历次有效命令证据。若当前结果仅因结构化元数据、负向断言退出码或未重复携带历史证据而被机械拒绝，而历史原始证据足以独立确认交付，则直接返回 pass，由 Runner 审计式晋升；不得要求 Executor 重跑环境或重写 JSON。",
    "- 按三级验证模型评审：先把当前 diff/finding 映射到失效的历史证据；普通业务任务执行任务级真实验收，只有冻结 Prompt 明确要求、修改 owner helper/托管编排或新增自定义清理原语时升级框架认证。不得因文档或证据格式变化要求重跑无关真实链路。",
    "- 对需要真实运行环境的任务，必须在首轮全量审查仓库内单命令验收入口：确认可从干净状态重复执行，不依赖命令外手工 setup，不硬编码个人路径，并在成功、一个代表性 setup/验证失败时清理本任务创建的数据库、进程、端口及临时文件。同轮一次性汇总所有入口缺陷，并确认交付引用的详细日志在运行临时目录删除后仍实际存在。只有冻结 Prompt 明确要求、修改 Superflow owner helper/托管编排或新增自定义清理原语时，才要求逐任务重跑 SIGINT/SIGTERM 等完整框架认证；不得为每个业务任务重复。",
    "- 首轮必须检查验收入口的资源所有权，而不只检查最终端口为空：每个 cleanup 动作都要有任务唯一身份和进程实例指纹，不能按端口、进程名或裸 PID 清理。直接复用已认证 owner helper 时，核对 helper 来源/完整性、任务特定 owner 参数、主要资源创建后的代表性失败、各业务删除路径条件和最终零残留即可；只有 helper 被复制修改、自建清理原语或冻结合同明确要求时，才核对非 owner、残留/伪造 state、PID 复用及全部中断路径。",
    "- 本轮必须完成全量审查并一次性汇总全部实质 finding；覆盖所有受影响模块、调用入口、SQL、测试和运行证据，不得发现第一个严重问题后提前结束。",
    "- 同一类问题存在多个位置时，必须在一个 finding 中枚举完整范围或拆成同轮多个 finding，禁止留到下一轮才逐个暴露。",
    "- 每个阻断问题必须给出事实证据、风险、明确修复要求和可执行验收条件。",
    "- 同一问题跨轮未解决时必须复用 finding ID；禁止只给旧问题换编号来伪装评审进度。",
    "- 没有阻断问题时返回 pass；执行范围外且需要用户决定时返回 blocked。",
    "- 你只读核验应用进程、端口、日志与测试证据，不负责替执行者启动、停止或清理应用进程；进程善后缺失应形成 finding 交回执行者，不要在评审调用中代为处理。",
    "",
    "最终必须严格按照 JSON Schema 返回结构化结果。",
  ].join("\n");
}

function buildExecutorPromptEnglish(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  repairFindings: ReviewFinding[],
  handoffPath?: string,
): string {
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const runDir = managedRunDir(
    contract.projectRoot,
    contract.taskId,
    state.runId,
  );
  const originalPromptDir =
    contract.taskPrompt && contract.taskPrompt.origin !== "generated_standard"
      ? path.dirname(contract.taskPrompt.originalPath)
      : null;
  const frozenPrompt = contract.taskPrompt
    ? [
        `${contract.taskPrompt.origin === "generated_standard" ? "Frozen standard execution contract" : "Frozen task prompt"}: ${contract.taskPrompt.snapshotPath}`,
        ...(contract.taskPrompt.origin === "generated_standard"
          ? []
          : [`Original prompt directory: ${originalPromptDir}`]),
        `Prompt SHA-256: ${contract.taskPrompt.sha256}`,
      ]
    : [];
  const deliveryChecklist = buildDeliveryChecklist(contract, "en");
  const repair =
    repairFindings.length === 0
      ? ""
      : [
          "",
          "## Required fixes for this round",
          "",
          ...repairFindings.map((finding) =>
            [
              `- ${finding.id} [${finding.severity}] ${finding.target}`,
              `  - Evidence: ${finding.evidence}`,
              `  - Risk: ${finding.risk}`,
              `  - Required fix: ${finding.requiredFix}`,
              `  - Acceptance checks: ${finding.acceptanceChecks.join("; ")}`,
            ].join("\n"),
          ),
        ].join("\n");
  const rollover =
    state.executorInvocations > 1 && !state.executorSession.sessionId
      ? [
          "- This is a fresh short executor session with no inherited chat. Treat the current workspace, frozen task prompt, persisted results, and current findings as the complete handoff.",
          "- Read the project CLAUDE.md, applicable `.claude/rules`, and frozen prompt before inspecting the current diff. Never guess completed work from an old session.",
          "- Claim that tools are unavailable only after a real tool invocation returns an error. Do not merely summarize prior work, repeat the contract, or return blocked because the session rolled over.",
        ]
      : [];

  return [
    "You are the only executor allowed to modify target deliverables for this managed task.",
    "Continue until the task is complete. Do not lower the bar because of configuration, dependencies, ports, development databases, or test failures.",
    "",
    `Task ID: ${contract.taskId}`,
    `Run ID: ${state.runId}`,
    `Task profile: ${contract.profile}`,
    `Contract hash: ${contract.contractHash}`,
    `Project root: ${contract.projectRoot}`,
    `Additional writable repositories: ${contract.relatedProjectRoots.join(", ") || "none"}`,
    `Task contract: ${path.join(taskDir, "task-brief.md")}`,
    ...(handoffPath
      ? [`Condensed handoff for this invocation: ${handoffPath}`]
      : []),
    ...frozenPrompt,
    `Run evidence directory (read-only; do not modify): ${runDir}`,
    ...deliveryChecklist,
    "",
    "## User goal",
    "",
    contract.objective,
    "",
    "## Mandatory boundaries",
    "",
    ...(contract.mandatoryEngineeringRules?.length
      ? [
          "### Mandatory engineering rules frozen by the host",
          ...contract.mandatoryEngineeringRules.map((rule) => `- ${rule}`),
          "",
        ]
      : []),
    "- Read the project-level CLAUDE.md and applicable `.claude/rules` before starting, and follow the project conventions.",
    ...(handoffPath
      ? [
          "- Read the complete condensed handoff before execution. When old session memory conflicts with the handoff or workspace, trust the handoff and current workspace.",
        ]
      : []),
    "- Before coding, search existing modules, shared methods, components, tests, and dependencies; prefer reuse.",
    "- If this task changes Superflow CLI itself, first read `docs/superflow-cli-design-principles.en.md` and `docs/superflow-cli-evaluation-framework.en.md` completely. Managed-work changes also read `docs/managed-work-design-principles.en.md` and `docs/managed-agent-protocol.en.md`. Before delivery, complete the global principles, evaluation record, and specialized mandatory checklist.",
    ...(contract.taskPrompt
      ? [
          `- Read the complete frozen ${contract.taskPrompt.origin === "generated_standard" ? "standard execution contract" : "task prompt"} before starting; it is the execution entry point.`,
          ...(originalPromptDir
            ? [
                `- Resolve relative paths in the prompt against ${originalPromptDir}.`,
              ]
            : [
                "- This contract freezes execution boundaries only; return blocked to Host for an unresolved business or architecture choice that changes implementation direction.",
              ]),
          "- tasks.md is only a checklist and must not replace the frozen task prompt.",
        ]
      : []),
    "- You may trace the real owner across related repositories in the same platform, but record every repository involved.",
    "- You may use an approved development database. Never drop databases, clean existing tables, or run unbounded bulk updates/deletes. You may drop only a uniquely named development test table created by this task when the frozen prompt explicitly requires that cleanup, and must preserve evidence that the table no longer exists.",
    "- Never run Git commit/push, publish, deploy, or write to production.",
    "- Never disable the sandbox, bypass permissions, alter tests to fit the implementation, or hide business gaps with defaults.",
    "- Do not modify state, events, historical prompts, or reports under `.superflow/tasks`; the background service owns them.",
    "- Runner supports filesystem snapshots in non-Git workspaces. Never run `git init` for diff, preflight, or delivery; never create, replace, or otherwise change `.git` or the repository identity frozen at start.",
    "- Classify managed assets: the Executor cleans runtime resources and workspace-temporary files; source, SQL, tests, and reports are delivery artifacts retained for Host review; frozen requirements, designs, prompts, handoffs, and task facts are protected contracts that must not be deleted before terminal state. Immutable protected inputs are read-only; retained progress/report files may be updated but not removed.",
    "- Never use pkill, killall, a bare kill, port/name-only cleanup, or an unverified rm -rf. Use the certified owner helper for task-owned processes, containers, and runtime directories; remove ordinary build caches only inside the repository.",
    "- You own every application, build, test, and helper process you start. Clean them up before returning, or record the PID, purpose, and state when one must remain; never hand process cleanup to the read-only reviewer.",
    "- For code tasks, run build, tests, and runtime verification proportionate to risk. Compilation-only or unit-test-only evidence is not completion.",
    ...verificationScopeGuidance(contract, repairFindings.length > 0, "en"),
    "- Return blocked only when a user decision, credential, or high-risk permission is genuinely required, and list alternatives already attempted.",
    "- Missing real databases, real tokens, or production permissions does not justify deferring locally implementable code, tests, candidate SQL, or documentation updates.",
    "- Same-batch deployment, atomic cutover, and release-window constraints govern deployment timing, not source implementation timing. Implement and verify local code in advance instead of deferring it behind a migration checklist.",
    "- Do not claim local work is complete or exhausted while tasks.md or the frozen prompt still contains unfinished local code work.",
    "- Continue within one invocation until every locally executable task is complete. Do not return for review after only one module, one test, or one finding; maintain an internal checklist and verify the complete batch.",
    "- When the task needs a real application, database, cache, browser, or other runtime, provide a repository-owned one-command acceptance entry in the first invocation. From a clean state it must perform preflight, setup, build, startup, real invocation, assertions, and cleanup. The success path and one representative setup/verification failure must clean resources owned by the task. Never hard-code personal absolute paths; use project conventions or environment overrides, and prove the entry can run again after cleanup.",
    "- Keep verbose build, framework, database, and client logs in task-owned files. Console output must contain bounded stage summaries and a bounded failure tail only; never stream an unbounded DEBUG log through the Agent tool channel. Reference full log paths as delivery evidence, and keep those paths readable after cleanup removes nonce/runtime directories.",
    "- The one-command entry must establish verifiable ownership for every temporary process, port, database, cache, and directory. Cleanup must never act on a port, process name, or bare PID alone; verify a task nonce/unique directory plus process-start fingerprint or equivalent identity. Reuse the certified Superflow owner helper directly through a configurable path. A wrapper that only binds task arguments is not custom cleanup; copied/rewritten identity, kill/delete behavior, or a helper bypass is custom. A normal business task verifies its own owner binding, one representative failure after major resources exist so unified cleanup runs, and final zero residue; materially distinct business deletion paths still need their own deletion-condition proof. It does not rerun the helper's non-owner, forged-state, PID-reuse, and signal-escalation certification suite. Run full framework certification only when the frozen prompt requires it, this task changes managed orchestration/the helper, or custom cleanup primitives are introduced.",
    "- When a one-command acceptance entry claims portability, run it in a clean shell with tool-path overrides removed. Successful evidence must not inject personal absolute paths for Node, the owner helper, or project tools. Resolve the installation through a stable CLI entry, project convention, or PATH while retaining explicit environment overrides for compatibility.",
    "- Implementation and verification inherit the API, database, concurrency, transaction, and test contracts from the frozen documents. Managed execution never rewrites the business design in design.md or tests.md. If an oral simple request lacks a business or architecture decision that changes implementation direction, return it to the Host instead of inventing a second design in the Executor prompt.",
    "- SDD/OpenSpec work must update tasks.md and test-report.md with only genuinely completed items, exact commands, actual test counts, failures, application startup, and HTTP results. Never copy stale numbers or claim unexecuted checks passed.",
    "- Wrap every expected-failure or fault-injection check in a parent acceptance command that verifies the child returned non-zero and then exits 0. Keep the raw child failure in logs; never put it in the ready_for_review commands array or label it as a negative assertion. Negative assertions are only for absence-inspection commands such as grep, rg, pgrep, lsof, or find.",
    "- OpenSpec classification recognizes only `[local_required]`, `[environment_required]`, and `[release_required]`; untagged work is always local_required. Free-form Blocker or owner prose cannot downgrade local work into an external prerequisite.",
    "- The Runner derives baseline task evidence from tasks.md, Git changes, and successful commands. Add taskEvidence only when a task needs distinct evidence; do not duplicate every task just to satisfy formatting.",
    "- Before ready_for_review, run a final completion sweep across the frozen prompt, tasks.md, every current finding, Git diff, build, tests, application startup, real HTTP invocation, test report, and process cleanup.",
    "- Do not move current task work to a future version, incremental scope, or release-owner backlog unless the frozen prompt or user explicitly authorizes it.",
    "- Execute and verify every real backend, application startup, API, browser, and cross-repository path required by the frozen documents. Never close a document gate with a substitute. Inherit concrete commands, assertions, and evidence locations only from frozen tests.md or the implementation prompt; the managed prompt does not rewrite them.",
    "- Return blocked whenever locally actionable blockers remain. Return ready_for_review after all locally completable work is done. Real-environment, deployment, or release validation explicitly forbidden by the permission contract and only executable after Git approval by DBA, test, or SRE owners must be listed item by item in releasePrerequisites, not placed in blockers. Return an empty releasePrerequisites array when none exist.",
    ...rollover,
    repair,
    "",
    "Return the final result strictly according to the JSON Schema.",
  ].join("\n");
}

function verificationScopeGuidance(
  contract: ManagedTaskContract,
  repairing: boolean,
  language: "zh" | "en",
): string[] {
  const taskLevel = ["engineering", "sdd"].includes(contract.profile);
  if (language === "en") {
    return [
      `- Default verification level for this task: ${taskLevel ? "task-level real acceptance" : "change-scoped verification"}. If a quick/monitor task actually changes code or depends on a real runtime, raise it to task-level real acceptance. The frozen prompt may explicitly raise, but never silently lower, this level.`,
      "- Verification has three levels: change-scoped checks; task-level real acceptance; and framework certification. Task-level real acceptance executes the business and runtime evidence frozen by the document contract, plus task owner binding, one representative failure cleanup, and final zero residue. Generic non-owner/PID-reuse/forged-state/signal disaster tests belong to framework certification, not every business task.",
      "- Reuse valid historical commands from the handoff. Rerun only checks invalidated by the current diff or finding. A production runtime, SQL, configuration, authorization, public contract, or acceptance-entry change invalidates its real chain; documentation, evidence formatting, or an isolated test change does not automatically invalidate unrelated startup/HTTP/database evidence.",
      ...(repairing
        ? [
            "- In this repair round, map each finding to invalidated evidence before running commands. Do not rerun the entire acceptance suite by habit; run affected checks first and rerun the complete chain only when that chain was invalidated or an acceptance check explicitly requires it.",
          ]
        : []),
    ];
  }
  return [
    `- 本任务默认验证层级：${taskLevel ? "任务级真实验收" : "受影响验证"}。quick/monitor 若实际修改代码或依赖真实运行环境，必须提高为任务级真实验收。冻结 Prompt 可以明确提高，但不得静默降低该层级。`,
    "- 验证分三级：受影响验证、任务级真实验收、框架认证。任务级真实验收执行文档合同冻结的业务与运行证据，并保留任务 owner 绑定、一个代表性失败清理和最终零残留；非 owner、PID 复用、伪造 state、信号升级等通用灾难测试属于框架认证，不属于每个业务任务。",
    "- 复用交接包中的历史有效命令，只重跑被当前 diff 或 finding 失效的证据。生产运行逻辑、SQL、配置、鉴权、公开合同或验收入口变化会使对应真实链路失效；纯文档、证据格式或隔离测试修改不会自动使无关的启动/HTTP/数据库证据失效。",
    ...(repairing
      ? [
          "- 本轮整改先把每个 finding 映射到失效证据，再执行命令。禁止习惯性重跑全套验收；先跑受影响检查，仅当真实链路已失效或 acceptanceChecks 明确要求时才重跑完整链路。",
        ]
      : []),
  ];
}

function buildDeliveryChecklist(
  contract: ManagedTaskContract,
  language: "zh" | "en",
): string[] {
  if (contract.source !== "sdd" || !contract.taskPrompt) return [];
  const changeDir = findSddChangeDir(contract.taskPrompt.originalPath);
  if (!changeDir) return [];
  const tasksFile = path.join(changeDir, "tasks.md");
  const reportFile = path.join(changeDir, "test-report.md");
  const reportStatus = existsSync(reportFile)
    ? language === "zh"
      ? `- 测试报告已存在，必须用本轮真实结果更新：${reportFile}`
      : `- The test report exists and must be updated with real results from this run: ${reportFile}`
    : language === "zh"
      ? `- 当前缺少必交测试报告，返回评审前必须创建并填写：${reportFile}`
      : `- Required test report is missing; create and complete it before review: ${reportFile}`;
  return [
    "",
    language === "zh"
      ? "## 本轮交付清单（返回评审前逐项完成）"
      : "## Delivery checklist for this invocation",
    "",
    language === "zh"
      ? `- 逐项完成并按真实状态更新任务清单：${tasksFile}`
      : `- Complete every applicable item and update its real state: ${tasksFile}`,
    reportStatus,
    language === "zh"
      ? "- 执行风险匹配的真实验证，记录命令、退出码和关键结果。"
      : "- Run risk-appropriate real verification and record commands, exit codes, and key results.",
    language === "zh"
      ? "- 检查实际差异和进程善后后，再一次性返回 ready_for_review。"
      : "- Inspect the actual diff and process cleanup, then return ready_for_review once.",
  ];
}

function findSddChangeDir(promptFile: string): string | null {
  let current = path.dirname(promptFile);
  for (let depth = 0; depth < 4; depth++) {
    if (existsSync(path.join(current, "tasks.md"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function buildReviewPromptEnglish(
  contract: ManagedTaskContract,
  state: ManagedRunState,
  factsPath?: string,
): string {
  const taskDir = managedTaskDir(contract.projectRoot, contract.taskId);
  const runDir = managedRunDir(
    contract.projectRoot,
    contract.taskId,
    state.runId,
  );
  const frozenPrompt = contract.taskPrompt
    ? [
        `${contract.taskPrompt.origin === "generated_standard" ? "Frozen standard execution contract" : "Frozen task prompt"}: ${contract.taskPrompt.snapshotPath}`,
        ...(contract.taskPrompt.origin === "generated_standard"
          ? []
          : [
              `Original prompt directory: ${path.dirname(contract.taskPrompt.originalPath)}`,
            ]),
        `Prompt SHA-256: ${contract.taskPrompt.sha256}`,
      ]
    : [];
  return [
    "You are the persistent read-only reviewer for this task. Do not modify any target files in this round.",
    "Do not trust completion claims from the executor. Independently inspect the workspace and original evidence.",
    "",
    `Task ID: ${contract.taskId}`,
    `Run ID: ${state.runId}`,
    `Review round: ${state.reviewRound}`,
    `Contract hash: ${contract.contractHash}`,
    `Task contract: ${path.join(taskDir, "task-brief.md")}`,
    ...frozenPrompt,
    `Executor result: ${state.lastExecutorResult}`,
    `Task report: ${path.join(runDir, "task-report.md")}`,
    ...(factsPath ? [`Runner facts: ${factsPath}`] : []),
    "",
    "## Review requirements",
    "",
    "- Independently inspect the user goal, change scope, code diff, and command evidence.",
    ...(factsPath
      ? [
          "- Read Runner facts first to avoid repeated mechanical discovery. They prove paths, hashes, exit codes, and counts only; they never replace semantic source review.",
        ]
      : []),
    "- If this task changes Superflow CLI itself, first review responsibility layering against the global design principles and unified evaluation framework. Managed-work changes also review `docs/managed-work-design-principles.en.md` and `docs/managed-agent-protocol.en.md`, explicitly identifying any change to role ownership, JSON protocols, state transitions, evidence inheritance, or call economics.",
    ...(contract.taskPrompt
      ? [
          `- Treat the frozen ${contract.taskPrompt.origin === "generated_standard" ? "standard execution contract" : "task prompt"}${contract.taskPrompt.origin === "generated_standard" ? " as the review boundary; it does not invent business design." : " and its referenced SDD documents as the review contract."}`,
          "- Actually run openspec instructions apply and retain its output. Only `[local_required]`, `[environment_required]`, and `[release_required]` are machine categories; every untagged item is local_required.",
          "- Reverse-check every newly checked item against Runner-derived evidence, optional taskEvidence, source diff, evidence paths, and verification commands. Return missing real evidence, but never reject merely because the executor did not duplicate derivable fields.",
        ]
      : []),
    "- Check reuse of existing capabilities and reject parallel duplicate implementations.",
    "- Check correctness, security, data, concurrency, transactions, configuration, and real runtime risks.",
    "- If startup, API, database, or log evidence is required, block when any required category is missing.",
    "- Check every real backend, application-startup, API, browser, and cross-repository test required by the frozen documents; managed review never invents a separate test contract.",
    "- Distinguish three delivery stages: local_delivery_ready means local source is ready, environment_validation_blocked means environment validation remains, and release_ready means structured release work is signed off. None of them automatically authorizes Git, deployment, or production writes.",
    "- When the frozen prompt or permission contract forbids real database writes, deployment, or release, do not require those actions to pass source review. Review candidate scripts and local evidence, and record real-environment validation as a non-blocking release prerequisite.",
    "- Do not require any delivery terminal state before review. Return pass when source gates are met; the shared CompletionPolicy atomically decides the three-stage state.",
    "- Do not block on formatting or personal preference; preserve review rounds for material risks.",
    "- The Runner automatically merges valid command evidence across invocations. If the current artifact was mechanically rejected only for structured metadata, a negative-assertion exit code, or omitted duplication of valid historical evidence, and the raw history independently proves delivery, return pass and let the Runner promote it with an audit trail. Do not ask the Executor to rerun the environment or rewrite JSON.",
    "- Review with the three verification levels: first map the current diff/findings to invalidated historical evidence. Normal business work uses task-level real acceptance; raise to framework certification only for an explicit frozen prompt, an owner-helper/managed-orchestration change, or a new custom cleanup primitive. Documentation or evidence-format changes do not rerun unrelated real chains.",
    "- For tasks requiring a real runtime, fully review the repository-owned one-command acceptance entry in the first Host round. Confirm it repeats from a clean state, requires no manual setup outside the command, contains no personal hard-coded paths, and cleans task-owned resources on success and one representative setup/verification failure. Report every entry defect together and confirm cited logs survive runtime cleanup. Require per-task SIGINT/SIGTERM framework certification only when the frozen prompt says so, the task changes the Superflow owner helper/managed orchestration, or it introduces custom cleanup primitives; it must not rerun for every business task.",
    "- In the first Host round, review resource identity rather than merely observing free ports. Every cleanup action needs task-unique identity and a process-instance fingerprint; cleanup by port, process name, or bare PID is forbidden. When the certified owner helper is reused unchanged, verify its source/integrity, task-specific owner arguments, representative failure cleanup, and final zero residue. Require non-owner, forged-state, PID-reuse, and every interruption negative only for modified/copied helpers, custom cleanup, or an explicit frozen contract.",
    "- For validation failures, verify that the test sends the actual malformed or forbidden input and reaches the intended parser or validation branch; a matching status code alone is insufficient. For task-owned resource cleanup, compare every frozen identity field on both producer and consumer records (for example nonce, PID, port, and signature), and require mismatch-refusal evidence.",
    "- Complete a full review sweep and return every material finding in this round across affected modules, entry points, SQL, tests, and runtime evidence. Never stop after discovering the first severe issue.",
    "- When one defect class appears in multiple locations, enumerate the complete scope in one finding or multiple findings in the same round instead of revealing occurrences across later rounds.",
    "- Every blocking finding must include factual evidence, risk, a precise required fix, and executable acceptance checks.",
    "- Reuse the same finding ID while an issue remains unresolved across rounds; do not renumber an unchanged blocker to make review progress appear healthier.",
    "- Return pass when there are no blocking findings; return blocked only for decisions outside execution scope that require the user.",
    "- Read-only inspect application processes, ports, logs, and test evidence. Do not start, stop, or clean up application processes for the executor; report missing cleanup as a finding and return it to the executor.",
    "",
    "Return the final result strictly according to the JSON Schema.",
  ].join("\n");
}
