# hook-short-circuit Specification

## Purpose
定义 superflow 门禁 hook 脚本的前置短路行为：让非 SDD 项目的 hook 触发成本降为一次进程启动加一次文件系统判断，同时保证 SDD 项目（无论是否执行过项目级 init）的完整门禁不被削弱。

## Requirements

### Requirement: 非 SDD 项目短路退出

所有 superflow 门禁 hook 脚本 MUST 在当前工作目录所属项目不满足 SDD 项目判据时，以退出码 0 立即退出，不执行任何门禁逻辑。

SDD 项目判据为以下任一存在（相对项目根）：

- `openspec/` 目录
- `.sdd/` 目录
- `.sdd-enforced` 文件

#### Scenario: 普通项目 Edit 触发 PreToolUse hook

- **WHEN** 当前项目不存在 `openspec/`、`.sdd/` 与 `.sdd-enforced`，且 PreToolUse hook 被触发
- **THEN** 脚本以退出码 0 退出，不读取 stdin、不调用 python3、不产生任何输出

#### Scenario: 存在 openspec 目录的项目

- **WHEN** 当前项目存在 `openspec/` 目录
- **THEN** 脚本放行进入原有门禁执行逻辑，行为与短路引入前一致

#### Scenario: 仅存在 .sdd 目录的项目

- **WHEN** 当前项目不存在 `openspec/` 但存在 `.sdd/` 目录
- **THEN** 脚本放行进入原有门禁执行逻辑

#### Scenario: 存在 .sdd-enforced 标记的项目

- **WHEN** 当前项目不存在 `openspec/` 与 `.sdd/` 但存在 `.sdd-enforced` 文件
- **THEN** 脚本放行进入原有门禁执行逻辑

### Requirement: 短路先于输入解析

短路判断 MUST 置于 stdin 读取与解释器依赖（python3 等）调用之前，保证短路路径的成本与输入内容大小无关。

#### Scenario: 大体积 hook 输入

- **WHEN** hook 收到大体积 stdin 输入且当前项目不满足 SDD 判据
- **THEN** 脚本在不读取 stdin 的情况下短路退出

### Requirement: SDD 项目门禁行为不回退

短路引入 MUST NOT 改变任何脚本在 SDD 项目内的既有判定结果，包括拦截、放行、警告与超时行为。

#### Scenario: 受管项目写入受保护路径

- **WHEN** 活跃 SDD 变更存在且写入与 `.sdd/state.yaml` 冲突的路径
- **THEN** 对应 hook 按原有逻辑拦截（退出码 2），与引入短路之前行为一致

### Requirement: 用户级服务脚本不参与项目短路

`superflow-dependency-update-hook.sh` 属用户级服务（检查 superflow 自身依赖更新），MUST NOT 增加项目判据短路；其余非 superflow 门禁脚本（如 auto-backup hooks）行为不变。

#### Scenario: 无关项目提问触发 dependency-update-hook

- **WHEN** 任意项目中 UserPromptSubmit 触发 dependency-update-hook
- **THEN** 该脚本照常执行依赖检查，不受项目短路判据影响
