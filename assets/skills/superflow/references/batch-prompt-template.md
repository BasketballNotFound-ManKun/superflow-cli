# 批次 Prompt 模板

## Thin Prompt Contract

产物只包含本批增量导航：主Prompt链接、Task/Entry/Case ID、文件范围、前置依赖和恢复位置。
**Canonical links** 及公共策略从主Prompt继承；**Acceptance IDs**引用tests，不复制命令、
算法、SQL、业务矩阵或整段团队剧本。所有执行模式使用同一形状。

## 当前批次

```markdown
# 批次 A
## Execution navigation
| Prompt | Task IDs | Entry IDs | Case IDs |
|---|---|---|---|
| [主Prompt](implementation.md) | 1.1 | E1 | C1 |
## 文件与依赖
- 文件：从本批任务/HOW引用的精确修改范围读取。
- 前置：列出真实已完成依赖，未完成时先处理前置。
## 恢复与交付
沿主Prompt继承的策略持续执行，将本批实际结果、未决finding及下一动作回填test-report。
```

本表三组ID与主表中本批行一致，全部来自同一coverage/task索引。批次可以复用同一
入口的不同用例；不能用相同文字和不同P编号代替真实任务拆分。

## 读取与执行

保持 `context_compression` 并核对当前manifest，按Decision/Entry/Case索引读取
本批canonical正文。技术详设、风险合同、SQL原样复制、真实环境及独评义务由主入口
引用的同一owner维护，批次不再各写一套适用性结论或无关检查表。
发现冲突先修规范正文与消费引用，再刷新handoff和当前准入；既有模式、隔离和权限不变。
编写主Prompt时使用[主模板](implementation-prompt-template.md)，验证遵循[test-guide](test-guide.md)，
独评与实际复评遵循[Reviewer清单](reviewer-checklist.md)。

运行test-report属于证据，在所有context_compression模式中只引用，不投影正文。
