# managed-projects Specification

## Purpose
定义基于 `~/.sdd-state.json` 的受管项目清单：登记以项目 scope 初始化的项目，支撑 update 遍历同步与 uninstall 遍历清理，使多项目受管资产可统一维护。

## Requirements

### Requirement: 受管项目登记

init 以 project scope 运行时 MUST 将项目根路径登记进 `~/.sdd-state.json` 的 `managedProjects` 段，并记录各 agent 的安装范围与 hooks 清单；重复 init 同一项目 MUST 幂等更新而非产生重复条目。

#### Scenario: 项目级初始化登记

- **WHEN** 在项目 P 以 project scope 执行 init
- **THEN** `managedProjects` 中存在 P 的条目（含项目根路径与 agent 信息）

#### Scenario: 重复初始化

- **WHEN** 对已登记的项目 P 再次执行 project scope init
- **THEN** P 的条目被更新，清单中不出现重复条目

### Requirement: 遍历清理

uninstall MUST 遍历 `managedProjects`，逐项目清理其受管资产并从清单移除对应条目。

#### Scenario: 清单项目存在

- **WHEN** uninstall 运行且清单中项目 P 的目录存在
- **THEN** P 的项目级 superflow 资产与 hooks 被清理，P 从清单移除

#### Scenario: 清单项目已不存在

- **WHEN** uninstall 运行且清单中项目 P 的目录已被删除
- **THEN** P 从清单移除，uninstall 继续处理其余项目，不报错中断

### Requirement: 遍历同步

update MUST 遍历 `managedProjects`，将各项目的脚本与 hooks 同步到当前版本；单个项目同步失败 MUST NOT 阻断其他项目，失败项在结束时汇总输出。

#### Scenario: 多项目同步

- **WHEN** update 运行且清单含项目 P1、P2
- **THEN** P1、P2 的受管脚本与 hooks 均被同步到当前版本

#### Scenario: 单项目失败不阻断

- **WHEN** update 遍历中项目 P1 同步失败（如目录权限不足）
- **THEN** P2 仍被同步，P1 的失败原因在最终输出中汇总呈现

### Requirement: 状态文件向后兼容

`managedProjects` 段缺失或损坏时 MUST 按空清单处理；既有字段（version、platforms、backups 等）MUST NOT 被修改或删除。

#### Scenario: 旧版本状态文件

- **WHEN** `~/.sdd-state.json` 由旧版本创建、不含 `managedProjects` 字段
- **THEN** init/update/uninstall 正常运行，按空清单处理，旧字段保持不变

#### Scenario: 清单内容损坏

- **WHEN** `managedProjects` 内容不是预期结构
- **THEN** 按空清单处理并给出警告输出，不中断命令，不破坏文件其余部分
