# Claude 开发指引

修改 Superflow CLI 前必须完整阅读：

- `docs/superflow-cli-design-principles.md`
- `docs/superflow-cli-evaluation-framework.md`

涉及托管编排时，还必须阅读：

- `docs/managed-work-design-principles.md`
- `docs/managed-agent-protocol.md`

专项规则只能细化全局纲领，不能冲突。编码和测试方案属于 OpenSpec/SDD 文档体系；托管
只负责轻量双 Agent 调度、证据、评审整改循环和终态交付。每项优化必须记录问题证据、
责任层、基线、假设、代表性实例、前后结果、结论和回滚条件，并同步中英文以及
Codex、Claude 支持。
