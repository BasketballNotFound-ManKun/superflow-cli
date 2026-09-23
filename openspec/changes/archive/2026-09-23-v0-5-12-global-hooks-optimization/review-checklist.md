# Review Checklist — v0-5-12 全局安装架构优化

## 评审范围

- 脚本短路：`assets/scripts/superflow-*`（9 个门禁脚本头部）
- CLI：`src/app/commands/{init,uninstall,update}.ts`、新增/调整的 state 读写模块
- 文档与双端一致性：中英文 Skill/文档同步、Codex/Claude 双端行为一致

## 安全（最高优先）

- [ ] 短路分支无 stdin 读取、无解释器调用（防注入面缩小）
- [ ] state.json 读写对损坏输入 fail-safe（不抛错、不写坏文件）
- [ ] 遍历清理只删除清单内项目资产，路径不存在越界（`..`、绝对路径拼接）防护

## 正确性

- [ ] 三项判据（openspec/.sdd/.sdd-enforced）并集实现与 spec 一致
- [ ] scope 回落 global 时输出提示；project 安装后 uninstall 不清用户级
- [ ] managedProjects 幂等去重；目录不存在条目移除且命令成功
- [ ] update 遍历单项目失败不阻断且汇总输出
- [ ] dependency-update-hook 与 auto-backup hooks 未被改动

## 兼容与迁移

- [ ] 旧 state 文件（无新字段）全命令正常
- [ ] 0.5.11 重装可回滚（无破坏性 schema 变更）
- [ ] 迁移步骤（uninstall → 清 cc-switch → install）在输出/文档中可发现

## 双端与文档

- [ ] Codex 与 Claude 路径行为一致（settingsFile/hooks.json 两侧短路判据相同）
- [ ] 中英文文档同步无语义漂移

## 评审结论

- [ ] 上述全部通过，或发现项已按桶分类并修复后复检通过
