# 实现编排指南：多 Agent 协作开发

> **分批实现优先**：对复杂需求，编排前必须先按 [分批实现拆分指南](batch-split-guide.md) 拆分为 P0 → P1 → P2 → P3 → P4 批次。每批独立编排、独立验收，通过后才能开始下一批。

## 编排决策

### 何时使用单 Agent vs 多 Agent

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 任务数量 <= 5 个，无复杂依赖 | 单 Agent 串行 | 上下文切换成本低于协作成本 |
| 任务数量 > 5 个，有明确分组 | Agent Team（2-4 人） | 并行开发，缩短周期 |
| 涉及多个模块（Controller/Service/Mapper） | Agent Team | 模块间解耦，可并行 |
| 有严格的跨模块依赖 | 单 Agent 或 Leader + Worker | 避免冲突，顺序执行 |
| 需要同时修改同一文件 | 单 Agent | 避免代码冲突 |

### 任务分组原则

按**文件亲和性**和**依赖关系**分组：

```
Group 1: Controller 层变更（Bug 9, 10）
  - 同一文件 PvdDebugController.java
  - 无外部依赖

Group 2: Service 核心逻辑（Bug 1, 2, 5, 8）
  - DebugFlowService.java
  - AiRecognitionService.java
  - 有内部依赖（Bug 8 依赖 Bug 2 的冲突处理）

Group 3: 灯色控制（Bug 3, 4）
  - LightControlService.java
  - DeviceOnlineLightSyncListener.java
  - 共享 Listener 逻辑

Group 4: 独立模块（Bug 6, 7, 11）
  - MapManagerServiceImpl.java
  - ModeSwitchService.java
  - PvdDebugReportExportService.java
  - 完全独立，可并行
```

---

## Agent 角色定义

### 角色 1：Leader（主控 Agent）

**职责**：
- 读取 tasks.md 和 design.md，理解全部任务
- 创建 TaskList，按依赖拓扑排序
- 将任务分配给 Worker Agent
- 监控进度，处理阻塞任务
- **亲自执行集成测试和回归测试（不依赖 Worker 报告）**
- 汇总质量报告

**必须遵守**：
- **不要直接编码**，只负责协调和集成验证
- **不信任 Worker 的测试报告**，必须亲自验证至少 30% 的关键用例
- **必须执行进程验证**，确认测试的是新代码而非旧进程

### 角色 2：Worker（执行 Agent）

**职责**：
- 接收 Leader 分配的 1-3 个相关任务
- 读取 design.md 对应章节理解设计
- 修改代码、编译、**启动应用、真实接口测试**
- 向 Leader 报告完成状态（包含进程验证证据）

**必须遵守**：
- 不修改分配任务之外的文件
- 每完成一个任务立即报告（不等全组完成）
- 遇到阻塞立即上报，不自行绕过
- **必须执行进程验证后才能报告完成**
- **编译成功 ≠ 完成，必须通过全部质量门禁才算完成**

### 角色 3：Tester（独立测试 Agent，强制参与）

**职责**：
- **独立于 Worker**，接收 Leader 分配的测试任务
- 按 tests.md 的用例独立执行测试（不依赖 Worker 的自测报告）
- 验证接口、数据库、日志，输出客观测试结果
- 发现失败时，向 Leader 报告失败现象，不直接向 Worker 反馈

**必须遵守**：
- **与 Worker 完全分离**：Worker 负责开发，Tester 负责验证，不能是同一人
- **独立验证**：不参考 Worker 的测试报告，从头执行测试
- **客观报告**：如实报告失败，不替 Worker 找理由（"可能环境问题"、"应该没改这块"）
- **覆盖全部用例**：必须执行 tests.md 中所有标注 [自动化] 的用例，不能抽样

**Tester 的测试流程**：
```
接收测试任务 → 读取 tests.md → 独立执行测试
    → 通过：向 Leader 报告"测试通过，证据如下..."
    → 失败：向 Leader 报告"测试失败，现象如下..."
```

**Tester 报告格式**：
```
测试报告：
- 任务 ID: Task 5.1
- 测试人: Tester（独立）
- 测试用例: 共 X 个，执行 X 个，通过 X 个，失败 X 个
- 失败详情:
  - 用例 1: [接口/断言/数据库/日志] 预期... 实际...
  - 用例 2: ...
- 结论: 通过 / 不通过
```

### 角色 4：Reviewer（评审 Agent，可选）

**职责**：
- 对 Worker 提交的代码进行 review
- 检查编码规范、安全漏洞、性能问题
- 验证是否符合 design.md 的设计方案
- 使用 `code-review-java` skill 进行评审

**必须遵守**：
- **Worker 必须在测试前先自审代码**，不能等全部编码完成再补审
- **Reviewer 必须在 Tester 测试前完成评审**，不能事后补做
- 发现 CRITICAL/HIGH 级别问题，Worker 必须修复并重新评审后才能继续
- build 阶段准备进入 verify 前，Leader 必须加载 Superpowers
  `requesting-code-review`，完成一次面向全量 diff、OpenSpec/SDD 合同、
  API/DB/真实入口证据和任务勾选一致性的最终评审；未完成该评审不得运行
  `superflow-guard.sh ... implement --apply`。

---

## 交付判断标准（强制执行）

### 核心原则

```
❌ 完成代码修改  ≠ 完成任务
❌ 编译成功      ≠ 完成任务
❌ 单元测试通过   ≠ 完成任务
❌ Worker 自测通过 ≠ 完成任务
✅ 集成测试完成（启动 + 调接口 + 验数据库 + 查日志）= 任务完成前提
✅ 独立 Tester 验证通过 = 任务完成
```

### 任务完成定义

一个任务只有满足以下**全部条件**，才能标记为"完成"：

| # | 条件 | 验证人 | 说明 |
|---|------|--------|------|
| 1 | 代码已修改 | Worker | git diff 确认 |
| 2 | 代码自审通过 | Worker | 已执行 review，无 CRITICAL/HIGH |
| 3 | 编译通过 | Worker | clean compile 无 ERROR |
| 4 | 应用已重新启动 | Worker | 进程验证通过（新进程、新时间戳） |
| 5 | **接口已真实调用** | **Worker** | **逐项执行 L3 checklist，记录 curl + 响应** |
| 6 | **数据库已验证** | **Worker** | **SHOW CREATE TABLE / SELECT 确认数据状态** |
| 7 | **日志已检查** | **Worker** | **grep ERROR 无 ERROR** |
| 8 | test-report 已回填 | Worker | 包含 curl、响应、DB、日志证据 |
| 9 | **独立 Tester 测试通过** | **Tester** | **Tester 独立执行全部用例，客观报告** |
| 10 | Leader 已独立验证 | Leader | Leader 亲自验证或抽查 |
| 11 | build→verify 最终代码评审通过 | Leader/Reviewer | 使用 `requesting-code-review`，确认无 CRITICAL/HIGH 遗留 |

**关键规则**：
- **Worker 不只是开发，还必须完成步骤 4~8（启动 + 接口调用 + 数据库验证 + 日志检查 + 报告回填）**
- **缺少步骤 4~8 中任一证据，Worker 不得报告"完成"**
- **Tester 独立测试后，向 Leader 报告客观结果（通过/失败）**
- **Leader 根据 Tester 报告 + Worker 证据判断是否完成，不信任口头报告**
- **build 阶段必须先完成最终 code review，再进入 verify；verify 阶段负责复验、
  失败决策、branch/worktree 收口和 archive 前确认，不替代 build 阶段评审**

---

## 构建工具命令矩阵

实现阶段涉及编译、启动、测试，**必须先识别项目使用的构建工具**。

### 如何判断构建工具

1. 检查项目根目录：
   - 存在 `pom.xml` → **Maven**
   - 存在 `build.gradle` 或 `build.gradle.kts` → **Gradle**
2. 如果两者都存在，优先使用 Gradle（较新的项目）

### 命令对照表

| 操作 | Maven | Gradle |
|------|-------|--------|
| 编译 | `mvn clean compile -DskipTests` | `./gradlew clean compileJava -x test` |
| 单元测试 | `mvn test` | `./gradlew test` |
| 启动应用 | `mvn spring-boot:run -Dspring-boot.run.profiles={profile}` | `./gradlew bootRun --args='--spring.profiles.active={profile}'` |
| 打包 | `mvn clean package -DskipTests` | `./gradlew clean bootJar -x test` |

### 关键注意事项

1. **Spring Profile 传递方式不同**
   - Maven: `-Dspring-boot.run.profiles=cmk`
   - Gradle: `--args='--spring.profiles.active=cmk'`
   - **绝对不能用 `-D` 给 Gradle 传 profile，会无效！**

2. **必须先 clean**
   - 每次修改后必须执行 clean，确保加载新编译的 class
   - 不能依赖增量编译

3. **启动前先停止旧进程（只停自己的，不碰别人的）**
   - `pkill -f "spring-boot:run"` 或 `pkill -f "GradleDaemon"`
   - **启动前必须检查端口占用**：`lsof -i :{port}` 或 `netstat -tlnp | grep {port}`
   - **如果端口被其他 agent 占用**：自己换一个端口启动，不得关闭其他进程
   - 确认端口释放后再启动

---

## 编排工作流

### Phase 1：初始化（Leader 执行）

1. **读取文档**：
   ```
   design.md → 理解源码修改点
   tasks.md  → 提取所有任务和依赖
   tests.md  → 提取验证方法
   ```

2. **识别构建工具**：
   - 检查 `pom.xml` 或 `build.gradle`
   - 确定启动命令（Maven vs Gradle）

3. **构建任务依赖图**：
   ```
   Task 5.1 (markException修复)
      |
   Task 7.1 (switchMode释放锁)
      |
   Task 9.1 + 10.1 (Controller修改)
      |
   Task 2.1 + 8.1 (绑定流程)
      |
   Task 1.1 (AI识别)
      |
   Task 3.1 + 4.1 (灯色同步)
      |
   Task 6.1 (地图校验)
   Task 11.1 (导出统计)
   ```

4. **分组决策**：
   - Group A (独立): Task 5, 7, 9, 10, 11 → Worker-1
   - Group B (绑定链): Task 1, 2, 8 → Worker-2
   - Group C (灯色链): Task 3, 4 → Worker-3
   - Group D (独立): Task 6 → Worker-4

### Phase 2：并行开发与测试（Workers + Testers 执行）

**Worker 流程（Worker 只做开发到启动，Tester 独立验证）：**

```
Worker 流程：
[开始] → 数据库前置门禁（SHOW CREATE TABLE 确认结构）→ 修改代码 → 代码自审 → 编译(clean) → 进程验证 → 启动应用 → [报告：应用已启动，等待测试]
         ↑                                                    |
         │              数据库缺失时 → 执行汇总 SQL → 复查确认  ──┘
         ↑      ↑                                          |
         │      └───────── 自审发现问题，修复后重新自审 ────┤
         └──────────────── 编译/启动失败，修复后重新编译 ───┘

Tester 流程（Worker 启动后）：
[接收任务] → 读取 tests.md → 独立执行测试 → 数据库验证 → 日志检查 → [报告：测试通过/失败]
                 ↑                                              |
                 └──────── 测试失败，报告 Leader ────────────────┘
```

**关键分离原则**：
- Worker 不报告"测试通过"，只报告"应用已启动，可供测试"
- Tester 独立执行测试，不参考 Worker 的自测结果
- Tester 的测试报告直接发给 Leader，不发给 Worker
- Leader 根据 Tester 报告判断任务是否完成

**代码自审要求（每个任务修改后必须先做）**：
1. 读取修改后的文件，逐行检查
2. 对照 design.md 检查是否按设计实现
3. 检查：空指针风险、异常处理、事务边界、日志规范
4. 使用 `code-review-java` skill 进行正式评审
5. **自审未通过不得进入编译环节**

**Worker-1** 执行 Group A：
```
[开始] → 修改 markException → 代码自审 → 编译 → 进程验证 → 启动 → 接口测试 → DB验证 → 日志检查 → [完成报告]
       → 修改 switchMode → 代码自审 → 编译 → 进程验证 → 启动 → 接口测试 → DB验证 → 日志检查 → [完成报告]
       → 修改 Controller → 代码自审 → 编译 → 进程验证 → 启动 → 接口测试 → DB验证 → 日志检查 → [完成报告]
       → 修改导出统计 → 代码自审 → 编译 → 进程验证 → 启动 → 接口测试 → DB验证 → 日志检查 → [完成报告]
```

**Worker-2** 执行 Group B（注意依赖顺序）：
```
[开始] → 修改 aiRecognize → 代码自审 → 编译 → 进程验证 → 启动 → 接口测试 → DB验证 → 日志检查 → [完成报告]
       → 修改 confirmAndBind → 代码自审 → 编译 → 进程验证 → 启动 → 接口测试 → DB验证 → 日志检查 → [完成报告]
       → 修改 markConflictAsException → 代码自审 → 编译 → 进程验证 → 启动 → 接口测试 → DB验证 → 日志检查 → [完成报告]
```

### Phase 3：进程验证（Worker 和 Leader 都必须执行）

#### 为什么需要进程验证

Worker 可能看到端口监听就误以为应用启动成功，但实际上：
- 端口被旧进程占用（IDEA 之前启动的）
- 启动命令错误导致 profile 未生效
- 增量编译未加载新代码

#### 验证步骤

**步骤 1：停止所有旧进程**
```bash
pkill -f "spring-boot:run" 2>/dev/null || true
pkill -f "GradleDaemon" 2>/dev/null || true
sleep 2
```

**步骤 2：确认端口已释放**
```bash
# 应该无输出，如果有输出说明旧进程还在
netstat -tlnp 2>/dev/null | grep {port} || ss -tlnp | grep {port}
```

**步骤 3：清理并重新编译**
```bash
# Maven
mvn clean compile -DskipTests

# Gradle
./gradlew clean compileJava -x test
```

**步骤 4：启动应用**
```bash
# Maven
nohup mvn spring-boot:run -Dspring-boot.run.profiles={profile} > app.log 2>&1 &

# Gradle
nohup ./gradlew bootRun --args='--spring.profiles.active={profile}' > app.log 2>&1 &

echo $! > /tmp/app.pid  # 记录 PID
```

**步骤 5：等待并确认是新进程**
```bash
sleep 15  # 等待启动

# 获取监听端口的 PID
NEW_PID=$(cat /tmp/app.pid)

# 检查进程存在且启动时间接近当前时间
ps -o pid,lstart,cmd -p $NEW_PID

# 检查端口绑定的是否是这个 PID
netstat -tlnp | grep {port}
```

**步骤 6：检查日志确认本次启动**
```bash
tail -30 app.log
# 日志中必须有本次启动的时间戳
# 如果看到几天前的日志或旧时间戳，说明是旧进程！必须停止重来！
```

**步骤 7：验证加载的是新代码**
```bash
# Gradle
ls -la build/classes/java/main/{修改的类路径}.class

# Maven
ls -la target/classes/{修改的类路径}.class

# 时间戳应该在本次编译时间附近（5分钟内）
```

**步骤 8：健康检查**
```bash
curl -s http://localhost:{port}{context-path}/actuator/health | grep UP
# 必须返回 UP，否则启动失败
```

### Phase 4：集成验证（Leader 执行）

所有 Worker 完成后：

1. **合并检查**：确认没有同一文件的冲突修改
2. **Leader 亲自执行全量编译**：使用正确的构建工具命令
3. **Leader 亲自执行进程验证**：按 Phase 3 步骤执行
4. **Leader 亲自执行回归测试**：
   ```
   start → aiRecognize → confirm → finish
   ```
5. **全链路验证**：
   - Bug 1: AI 识别后 debug_status = 1
   - Bug 2: 绑定后 debug_status = 2，灯色 = AUTO_CTRL
   - Bug 3: 已完成设备上线后灯色 = AUTO_CTRL
   - Bug 4: PENDING 设备灯色 = PURPLE+FLICKER
   - Bug 5: markException 后 debug_status = 3
   - Bug 6: 地图保存冲突时事务回滚
   - Bug 7: 模式切换后可立即再次切换
   - Bug 8: 绑定冲突后 debug_status = 3
   - Bug 9: 成功时 message = "绑定成功"
   - Bug 10: 冲突时 code != 0
   - Bug 11: 导出 Excel 设备总数按 IP 去重

### Phase 5：强制质量门禁（必须全部满足）

⚠️ **以下门禁为强制要求，任一未通过不得交付。**

#### 门禁 1：编译门禁
- **执行**：`mvn clean compile -DskipTests` 或 `./gradlew clean compileJava -x test`
- **通过标准**：BUILD SUCCESS，无 ERROR 级别日志
- **验证人**：Worker 执行，Leader 抽查
- **失败处理**：修复代码后重新 clean compile

#### 门禁 2：启动门禁
- **执行**：按构建工具命令矩阵正确启动应用
- **通过标准**：
  1. 进程是新启动的（非旧进程）——通过进程验证确认
  2. 健康检查返回 UP：`curl http://localhost:{port}{context-path}/actuator/health`
  3. 日志中出现本次启动时间戳
- **验证人**：Worker 执行并报告 PID，Leader 独立验证
- **禁止**：看到端口监听就报告 UP，必须验证是新进程

#### 门禁 3：接口测试门禁
- **执行**：按 tests.md 逐个执行 curl 命令
- **通过标准**：所有 Scenario 的断言全部通过
- **验证人**：Worker 执行，Leader 独立验证（不信任 Worker 报告）
- **禁止**：仅 grep 代码就认为修复正确，必须实际调接口

#### 门禁 4：数据库验证门禁
- **执行**：mysql 查询验证数据状态
- **通过标准**：数据状态符合 tests.md 断言
- **验证人**：Worker 执行，Leader 抽查关键数据

#### 门禁 5：日志门禁
- **执行**：`grep ERROR logs/mpgs.log` 或 `grep ERROR app.log`
- **通过标准**：
  1. 无 ERROR 级别日志（除已知无关错误）
  2. 关键日志出现（如 `[Bug5] markException called`）
- **验证人**：Worker + Leader 都必须检查

#### 门禁 6：代码评审门禁
- **执行**：使用 `code-review-java` skill
- **通过标准**：无 CRITICAL / HIGH 级别问题
- **验证人**：Reviewer 或 Leader

#### 门禁 7：全链路回归门禁
- **执行**：按 tests.md 的 end-to-end 场景完整执行一遍
- **通过标准**：全流程通过，无异常
- **验证人**：Leader 必须亲自执行

#### 门禁未通过的处理

1. **Worker 执行时门禁未通过**：
   - 不得报告任务完成
   - 必须修复问题并重新执行全部门禁
   - 若无法修复，立即上报 Leader

2. **Leader 验证时门禁未通过**：
   - 标记 Worker 任务为"未完成"
   - 要求 Worker 重新执行
   - 连续 2 次未通过，Leader 亲自介入修复

---

## 通信协议

### Leader → Worker 消息格式

```
任务分配：
- 任务 ID: Task 5.1
- 修改文件: DebugFlowService.java
- 修改方法: markException()
- 源码锚点: DebugFlowService.java:911-969
- design.md 对应章节: ## Bug 5
- 验收标准:
  1. 调用 markException 后 debug_status = 3
  2. 不校验 debugSessionId
  3. 插入 device_debug_record
- 阻塞条件: 无
- 预计工时: 0.5 人天
- 强调：必须通过全部质量门禁才能报告完成，编译成功不算完成
```

### Worker → Leader 报告格式（应用启动后）

```
开发完成报告：
- 任务 ID: Task 5.1
- 状态: 开发完成 / 阻塞中 / 失败
- 修改文件: DebugFlowService.java
- 修改内容摘要: 移除 validateDebugSessionId() 调用，直接透传
- 数据库前置门禁：
  - 检查的表/字段: {列出}
  - 汇总 SQL 文件路径: {路径}
  - 执行的脚本: {具体脚本}
  - 执行结果: {成功/失败}
  - 复查确认: {SHOW CREATE TABLE 结果摘要}
- 代码自审结果: 通过（无 CRITICAL/HIGH 问题）
  - 检查项: 空指针 ✓ 异常处理 ✓ 事务边界 ✓ 日志规范 ✓
- 编译状态: 通过（mvn clean compile -DskipTests）
- 进程验证:
  - PID: 12345
  - 启动时间: 2026-05-08 14:32:15
  - class 文件时间戳: 2026-05-08 14:31:58（编译后）
  - 健康检查: UP ✓
- 说明: 应用已启动，等待 Tester 独立测试
- 阻塞原因: （如适用）
```

### Leader → Tester 测试分配格式

```
测试任务：
- 任务 ID: Task 5.1
- 测试范围: tests.md 中 Bug 5 的全部用例
- 应用状态: Worker 已启动，PID: 12345，健康检查: UP
- 测试要求:
  1. 独立执行全部用例，不参考 Worker 的自测结果
  2. 覆盖接口测试、数据库验证、日志检查
  3. 如实报告失败，不替 Worker 找理由
- 报告对象: 直接回复 Leader，不发给 Worker
```

### Tester → Leader 测试报告格式

```
独立测试报告：
- 任务 ID: Task 5.1
- 测试人: Tester（独立）
- 测试用例: 共 X 个，执行 X 个，通过 X 个，失败 X 个
- 测试详情:
  - 用例 1 [通过]: 接口返回值 code=0，数据库 debug_status=3，日志无 ERROR
  - 用例 2 [失败]: 预期... 实际... 现象...
- 数据库验证: ...
- 日志检查: ...
- 结论: 通过 / 不通过
- 备注: （如适用）
```

---

## 禁止事项（红线）

以下行为在实现阶段**严格禁止**：

1. **禁止编译成功就交付**
   - ❌ 错误："代码已修改，编译通过，任务完成"
   - ✅ 正确："代码已修改，编译通过，应用已启动，独立 Tester 验证通过，任务完成"

2. **禁止 Worker 自测自报"完成"**
   - ❌ 错误：Worker 自己测自己报"测试通过，任务完成"
   - ✅ 正确：Worker 只报告"开发完成，应用已启动"，等待独立 Tester 验证

3. **禁止 Tester 参考 Worker 的自测结果**
   - ❌ 错误：Tester 看了 Worker 的报告后"差不多就行"
   - ✅ 正确：Tester 独立从头执行全部用例，不参考 Worker 报告

4. **禁止复用旧进程测试新代码**
   - ❌ 错误：端口已有监听，直接 curl 测试
   - ✅ 正确：先停止旧进程，重新编译启动，确认是新进程后再测试

5. **禁止仅做代码层面验证**
   - ❌ 错误：grep 代码确认修复逻辑正确，未实际调接口
   - ✅ 正确：必须实际调接口验证运行时行为

6. **禁止信任 Worker/Tester 报告而不自己验证**
   - ❌ 错误：Worker 说"测试通过"或 Tester 说"都过了"，Leader 直接相信
   - ✅ 正确：Leader 必须独立执行关键验证（至少抽查 30% 的测试用例）

7. **禁止跳过 clean 直接编译**
   - ❌ 错误：`mvn compile`（无 clean）
   - ✅ 正确：`mvn clean compile`（确保加载新 class）

8. **禁止混淆 Maven/Gradle 命令**
   - ❌ 错误：对 Gradle 项目使用 `-Dspring-boot.run.profiles=xxx`
   - ✅ 正确：Gradle 用 `--args='--spring.profiles.active=xxx'`

9. **禁止忽略 ERROR 日志**
   - ❌ 错误：测试通过了，但日志中有 ERROR，视而不见
   - ✅ 正确：测试通过 + 日志无 ERROR 才算通过

10. **禁止跳过代码评审直接编译/测试**
    - ❌ 错误：代码改完直接编译，等全部任务做完再补审
    - ✅ 正确：每个任务修改后先自审（检查空指针、异常、事务、日志），自审通过后再编译

11. **禁止跳过数据库前置门禁直接写代码**
    - ❌ 错误：不管数据库表结构是否满足设计，直接改业务代码
    - ✅ 正确：先连接开发环境数据库 SHOW CREATE TABLE 确认结构 → 发现缺失时执行汇总 SQL → 确认生效后再写代码

12. **禁止自行创建独立 SQL 文件**
    - ❌ 错误：每个任务各建一个 SQL 文件
    - ✅ 正确：所有 SQL 统一追加到需求级汇总 SQL 文件

13. **禁止用代码绕过数据库结构缺失**
    - ❌ 错误：发现字段不存在时加 if-null 判断兼容
    - ✅ 正确：停止编码 → 执行汇总 SQL → 确认生效后继续

---

## 故障处理

### Worker 长时间无响应

1. Leader 发送状态查询消息
2. 超过 10 分钟无响应 → 标记为超时，重新分配任务
3. 新 Worker 从上次保存点继续

### 代码冲突

1. 发现同一文件被多个 Worker 修改
2. Leader 协调：确定修改范围是否重叠
3. 若重叠：顺序执行，后执行的 Worker 先 pull 最新代码
4. 若无重叠：可同时修改不同方法

### 测试失败

1. Worker 记录失败现象（接口返回值/数据库状态/日志）
2. 对照 design.md 分析根因
3. 若 design 方案有问题 → 上报 Leader → 暂停相关任务
4. 若实现问题 → 修复后重新验证（从 clean compile 开始）

### 编译错误

1. Worker 尝试自行修复（通常是小问题：import 缺失、语法错误）
2. 无法修复 → 上报 Leader
3. Leader 判断是否为跨模块依赖问题

### 应用启动失败

1. 检查启动命令是否正确（Maven vs Gradle）
2. 检查 profile 是否生效（查看日志中的激活 profile）
3. 检查端口是否被占用（旧进程未停止）
4. 检查数据库连接配置是否正确
5. 若无法解决，上报 Leader 协调

### 进程混淆（旧进程占端口）

1. Worker 发现测试的日志时间戳不对
2. 立即停止测试，杀死旧进程
3. 重新执行完整的进程验证流程
4. 重新编译、启动、测试
