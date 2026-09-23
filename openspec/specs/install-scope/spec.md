# install-scope Specification

## Purpose
定义 init / uninstall / update 三个命令在安装范围（scope）上的一致性行为：对同一份安装状态，三个命令必须操作同一个目标文件集合，杜绝因 scope 推导不一致导致清错文件或留残留。

## Requirements

### Requirement: 安装范围决定操作目标

init、uninstall、update MUST 依据同一份安装范围记录推导操作目标（settingsFile、scripts、skills、rules 等路径）；同一安装状态下，三命令解析出的目标路径 MUST 一致。

#### Scenario: 全局安装后的卸载

- **WHEN** init 以 global 范围安装后执行 uninstall
- **THEN** uninstall 清理用户级 settingsFile 中的 superflow hooks 与全局资产，不触碰任何项目级文件

#### Scenario: 项目安装后的卸载

- **WHEN** init 以 project 范围安装到项目 P 后在 P 内执行 uninstall
- **THEN** uninstall 清理 P 的项目级文件，用户级 settingsFile 中的 hooks 不被清除

#### Scenario: 安装范围记录缺失

- **WHEN** 安装范围记录缺失（旧版本安装产物）且执行 uninstall
- **THEN** 按默认 global 范围回落处理，并在输出中明确提示所采用的回落范围

### Requirement: 目标缺失时幂等

uninstall 与 update MUST 在目标 settingsFile 或资产不存在时幂等处理（跳过并继续），不得报错中断。

#### Scenario: settingsFile 不存在时卸载

- **WHEN** uninstall 运行且对应 settingsFile 不存在
- **THEN** 命令以成功结束，输出中说明该目标无需清理

### Requirement: 清理范围与注册范围匹配

uninstall 清理 hooks 时 MUST 只清除本工具写入的 superflow hooks 条目，不得清除用户或其他工具的 hooks 配置。

#### Scenario: settingsFile 含用户自定义 hooks

- **WHEN** uninstall 清理含用户自定义 hooks 的 settingsFile
- **THEN** 仅移除 superflow hooks 条目，用户自定义条目原样保留
