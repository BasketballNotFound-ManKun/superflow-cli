# 可追溯性矩阵

## 目的

确保从需求到设计到实现到测试的完整可追溯，避免"设计漂移"和"实现遗漏"。

---

## 矩阵结构

```markdown
# Traceability Matrix

## 需求层（spec.md）

| Req ID | Requirement | Scenario | 对应 Design | 对应 Task | 对应 Test | 对应 Prompt |
|--------|-------------|----------|-------------|-----------|-----------|-------------|
| R1 | 主数据支持多种业务类型 | S1.1 | design.md ## 主数据 | Task 1.1 | tests.md T1 | P1 |
| R2 | 业务创建时校验用户资格或资源充足 | S2.1 | design.md ## 创建校验 | Task 2.1 | tests.md T2 | P2 |
| ... | ... | ... | ... | ... | ... | ... |

## 设计层（design.md）

| Design 章节 | 涉及文件 | 涉及方法 | 对应 Task | 对应 Prompt |
|-------------|----------|----------|-----------|-------------|
| ## 主数据 | BusinessRecord.java | - | Task 1.1 | P1 |
| ## 开通校验 | OrderService.java | validateBalance() | Task 2.1 | P2 |
| ... | ... | ... | ... | ... |

## 任务层（tasks.md）

| Task ID | 文件 | 方法 | 对应 Design | 对应 Prompt | 状态 |
|---------|------|------|-------------|-------------|------|
| Task 1.1 | BusinessRecordMapper.xml | insert | design.md ## 主数据 | P1 | 待执行 |
| ... | ... | ... | ... | ... | ... |

## Prompt 层（prompt/*.md）

| Prompt | 覆盖 Task | 覆盖 Design | 依赖 Prompt | 状态 |
|--------|-----------|-------------|-------------|------|
| P0 | - | - | 无 | 待执行 |
| P1 | Task 1.1-1.5 | design.md ## 数据模型 | P0 | 待执行 |
| ... | ... | ... | ... | ... |
```

---

## 一致性检查规则

### 规则 1：设计漂移检查

**定义**：prompt 中出现了 design.md / api.md / database-contract.md 没有定义的新方案。

**检查方法**：
1. 读取每份 prompt 的"精确实现步骤"
2. 检查每个步骤是否能在 design.md 中找到对应章节
3. 检查 prompt 中提到的字段、接口、MQ topic 是否在设计文档中有定义

**标记方式**：
```
⚠️ 设计漂移：prompt/p2-charge-order.md 步骤 3 提到"使用乐观锁防止并发下单"，
   但 design.md ## 下单流程 中未提及乐观锁策略。
   处理方式：上报 Leader 确认 / 按设计文档原方案实现
```

### 规则 2：实现遗漏检查

**定义**：design.md 有章节，但没有对应的 prompt 覆盖。

**检查方法**：
1. 遍历 design.md 的所有章节
2. 检查每个章节是否被至少一份 prompt 覆盖
3. 检查 api.md 中的每个接口是否被至少一份 prompt 覆盖

**标记方式**：
```
⚠️ 实现遗漏风险：design.md ## 订单快照 描述了快照表结构和写入时机，
   但没有 prompt 覆盖该功能（P1-P4 均未提及）。
   处理方式：补充 P2 或新增 Pn 覆盖
```

### 规则 3：测试覆盖检查

**定义**：tests.md 中的用例与 prompt 的测试要求不一致。

**检查方法**：
1. 检查每份 prompt 的"测试要求"是否覆盖了 tests.md 中对应章节的全部用例
2. 检查 prompt 中"未执行测试及原因"是否合理

**标记方式**：
```
⚠️ 测试覆盖不足：tests.md T3.2（边界：资源刚好等于业务阈值）
   在 prompt/p2-charge-order.md 中未提及。
   处理方式：补充到 P2 测试要求中
```

---

## 自动化检查建议

在生成所有 prompt 后，执行以下检查：

1. **生成矩阵**：从 spec.md、design.md、tasks.md、tests.md、prompt/*.md 中提取对应关系
2. **扫描漂移**：对比 prompt 内容与设计文档，标记未定义的方案
3. **扫描遗漏**：对比设计文档与 prompt 覆盖范围，标记未覆盖的章节
4. **输出报告**：列出所有漂移和遗漏项，供人工确认
