# Traceability Matrix — v0-5-12 全局安装架构优化

| Requirement（spec） | 设计决策（design.md） | 任务（tasks.md） | 测试用例（tests.md） | 源码锚点 | 禁止项 |
|---|---|---|---|---|---|
| hook-short-circuit：非 SDD 项目短路退出 | D1 项目性质判据、D2 短路置于 stdin 前 | 1.1、1.2、1.3 | TC-01、TC-02、TC-03 | assets/scripts/superflow-*（脚本头部） | 禁止把短路放到 stdin/python3 之后；禁止收紧为单一判据（必须三项并集） |
| hook-short-circuit：SDD 项目门禁不回退 | R1 宽松放行兜底 | 1.1~1.3、4.3 | TC-11、TC-12 | 各脚本原门控段 | 禁止修改脚本内部既有判定逻辑 |
| hook-short-circuit：用户级服务不短路 | N3 dependency-update-hook 定位 | 1.4 | TC-01 反证（该脚本不受影响） | superflow-dependency-update-hook.sh | 禁止给 dependency-update-hook 加项目判据 |
| install-scope：安装范围决定操作目标 | D3 scope 字段显式化 | 2.1、2.2、2.3 | TC-04、TC-05、TC-10 | init.ts/uninstall.ts/update.ts、paths.ts | 禁止三命令各自重新推断 scope |
| install-scope：目标缺失幂等 | 既有 clearSddHooks 幂等语义 | 2.4 | TC-10 | hook.ts 调用方 | 禁止在目标缺失时报错中断 |
| install-scope：只清自有条目 | 既有 clearSddHooks 前缀匹配（ake-harness 独占领地同源） | 2.4 | TC-10 | hook.ts | 禁止清除用户自定义 hooks |
| managed-projects：登记与幂等 | D4 复用 state.json 载体 | 3.1、3.2 | TC-06、TC-10 | ~/.sdd-state.json 读写模块 | 禁止新建第二份 registry 文件 |
| managed-projects：遍历清理/同步 | D5 失败不阻断 | 3.3、3.4 | TC-08、TC-09 | uninstall.ts/update.ts | 禁止单项目失败中断遍历；禁止删除清单外的用户文件 |
| managed-projects：向后兼容 | D4 缺失按空清单 | 3.1 | TC-07 | state 读写模块 | 禁止修改/删除既有字段；禁止损坏时抛错中断 |

## 禁止项汇总（实现 prompt 必须继承）

1. 禁止迁移全局 hooks 到项目级（用户决策：全局安装一次、所有项目可用）。
2. 禁止引入 launcher 转发层（已否决：过度设计）。
3. 禁止修改 `superflow-sql-sync-hook.py` 双 matcher 行为（只补注释）。
4. 禁止给 dependency-update-hook / auto-backup hooks 加项目短路。
5. 禁止在短路分支中读取 stdin 或调用 python3。
6. 禁止让 state.json 损坏阻塞任何命令（空清单回落 + 警告）。
