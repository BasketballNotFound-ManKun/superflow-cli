# OpenSpec 规范基础

## 三阶段工作流

| 阶段 | 文件名 | 说明 |
|------|--------|------|
| Stage 1: Creating Changes | `proposal.md` / `spec.md` / `design.md` / `tasks.md` | 写提案/规范/设计/任务 |
| Stage 2: Implementing Changes | 按 `tasks.md` 顺序逐项实现 | 确保实现满足 spec 场景 |
| Stage 3: Archiving Changes | 上线后将 `changes/<id>/` 移入 `changes/archive/` | 归档已完成的需求 |

## 目录规范

所有文档必须放在 `doc/openspec/` 目录下：

```
doc/openspec/
├── project.md              # 项目定义
├── SPEC.md                 # OpenSpec 规范（含目录规范）
├── specs/                  # 功能规格文档
│   └── <feature-name>/
│       └── spec.md
├── changes/                # 需求变更/新功能
│   └── <change-name>/
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       ├── tests.md
│       └── specs/<feature>/
│           └── spec.md
├── designs/                # 架构/技术设计
├── reviews/                # 设计评审报告
├── plans/                  # 计划文档
└── tests/                  # 测试文档
```

**禁止：**
- 在 `doc/openspec/` 根目录散落文档
- 使用中文目录名
- 在其他位置创建 openspec 文档

## Spec 编写规则（必须遵守）

```markdown
## ADDED|MODIFIED|REMOVED|RENAMED Requirements

### Requirement: <需求描述>
#### Scenario: <场景名称>
- **WHEN** <前置条件>
- **THEN** <预期结果>
- **AND** <附加条件>
```

**规则：**
- 使用 `## ADDED|MODIFIED|REMOVED|RENAMED Requirements`
- 每个 `### Requirement:` 至少包含 1 个 `#### Scenario:`
- Scenario 用 `- **WHEN** / - **THEN** / - **AND**` 描述可验收行为
- 涉及边界条件的必须单独写 Scenario
