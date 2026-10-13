# Mock 策略与边界声明指南

## 适用与事实源

设计隔离测试或报告替代证据时读取；选择验证信号先读 [test-guide.md](test-guide.md)。
数据库分层、mockBoundary 和执行凭证只继承
[document-review-coverage.md](document-review-coverage.md#数据库分层合同)。
本指南说明可隔离范围，不授权降低 tests.md 已冻结的真实环境验收。

| 场景 | 可隔离的范围 | 能证明什么 / 仍需验证什么 |
|---|---|---|
| 纯逻辑单测 | 被测逻辑之外的数据访问/HTTP/MQ依赖 | 分支、参数与失败处理；不能证明真实 SQL 或落库 |
| 必测持久化/事务/CAS | mockBoundary.allowed 的外部客户端 | 生产 Service/Mapper 不得 mock；实际同引擎数据库与生产 statement 必须执行 |
| 外部支付/短信/设备 | 合同允许的客户端、沙箱或模拟消息 | 局部处理；真实外部能力必须另有沙箱/真实入口证据，缺环境记阻塞 |
| MQ/Redis/OSS | 纯逻辑测试的接口边界 | 内存队列、本地缓存/文件不能关闭真实协议、锁、持久化或外部链路要求 |

真实同引擎 Docker/Testcontainers 数据库不是 Mock。冻结环境允许时复用；共享环境要求
不能擅自替换。H2/SQLite 不能替代 MySQL 的方言、锁、事务或落库语义；缺库时保留
逻辑局部证据，必测数据库项 BLOCKED/PARTIAL。

## 声明与报告

每个隔离边界写入现有 tests.md / test-report.md：实际能力、替换对象、mockBoundary、
假设、可证明范围、仍未验证范围、真实验证命令/阻塞原因及证据路径。
分开记录 `Mock 验证`、`测试端点验证`、`真实入口验证`。辅助逻辑 case 可通过，
但 mock-only 不能关闭同一入口的必要数据库或真实链路 case。

## 示例：隔离支付客户端，验证真实落库

当合同允许隔离 PaymentClient 时，用固定成功响应驱动**真实**业务 Service 和 Mapper，
在已冻结的 MySQL 上按订单 ID 检查 before/after、金额与状态，并核验必要副作用。
这个用例证明业务处理与落库，不证明支付网关实际扣款；后者单独验证或记录阻塞。
纯 Service 单测可 mock Mapper，但只能报告逻辑结果，不得称为数据库集成通过。

## 禁止事项

- mock 被测主体，或在必测数据库 case 中 mock 生产 Service/Mapper。
- 用固定成功、调用次数、HTTP 200、影响行数非零代替业务/数据库值断言。
- 混合替代证据和真实证据，或把未执行/跳过用例计入完整通过。
- 为赶交付静默更换冻结后端、放宽断言，或在生产代码保留 Mock。
