# Mock 策略与边界声明指南

比赛/项目中涉及外部接口、设备回调、第三方服务时，必须明确 Mock 策略并在交付物中声明。

## 何时需要 Mock

| 场景 | 是否 Mock | 说明 |
|------|-----------|------|
| 外部 HTTP API（支付、短信、地图） | ✅ 必须 | 避免真实调用产生费用或副作用 |
| 设备回调（门禁、摄像头、传感器） | ✅ 必须 | 无真实硬件环境 |
| 数据库（无测试环境） | ✅ 可选 | 可用 H2 / Docker MySQL |
| 消息队列 | ✅ 可选 | 可用内存队列替代 |
| 缓存（Redis） | ✅ 可选 | 可用 Caffeine / 本地缓存 |
| 文件存储（OSS） | ✅ 可选 | 可用本地文件系统 |

## Mock 方式选择

| 方式 | 适用场景 | 实现手段 | 验证能力 |
|------|----------|----------|----------|
| `@MockBean` | Spring Boot 单元/集成测试 | Mockito | 验证调用次数、参数 |
| `WireMock` | HTTP 外部服务 | 独立 Mock 服务器 | 验证请求格式、返回预设响应 |
| 本地模拟服务 | 设备回调、Webhook | 单独启动的 HTTP 服务 | 手动触发回调 |
| 接口假实现 | 无测试框架时 | 接口的硬编码实现 | 固定返回 |
| H2 内存数据库 | 无 MySQL 环境 | `spring.datasource.url=jdbc:h2:mem` | 标准 SQL 验证 |

## Mock 边界声明模板

每个使用 Mock 的外部依赖必须在交付文档中填写下表：

```markdown
## Mock 声明

### 外部依赖 1：<名称>

| 项目 | 说明 |
|------|------|
| 实际能力 | ____（如：真实支付扣款） |
| Mock 方式 | ____（如：@MockBean + 固定返回 success） |
| Mock 范围 | ____（哪些接口/方法被 Mock） |
| 假设条件 | ____（如：假设支付网关永远返回成功） |
| 替代验证 | ____（如何验证代码逻辑正确，如：检查数据库状态变化） |
| 恢复真实 | ____（如何切回真实服务，如：去掉 @MockBean 注解） |
```

## 示例：门禁设备回调 Mock

```markdown
### 外部依赖：人行门禁设备

| 项目 | 说明 |
|------|------|
| 实际能力 | 真实硬件设备，刷卡/人脸识别后主动回调服务器 |
| Mock 方式 | 本地启动模拟 HTTP 服务（Python Flask / Node.js） |
| Mock 范围 | `/device/callback` 接口接收回调 |
| 假设条件 | 假设设备回调的报文格式与真实设备一致 |
| 替代验证 | 手动 POST 模拟回调报文，验证服务器处理逻辑（记录通行日志、开门指令） |
| 恢复真实 | 将回调地址指向真实设备网关 |
```

## 示例：支付接口 Mock

```java
// 测试中使用 @MockBean
@MockBean
private PaymentClient paymentClient;

@BeforeEach
void setUp() {
    when(paymentClient.charge(any()))
        .thenReturn(PaymentResult.success("mock-trade-no"));
}

// 验证替代方式：检查订单状态是否变为 PAID
@Test
void shouldUpdateOrderStatusWhenPaymentSuccess() {
    // 执行支付流程
    // 断言：数据库订单状态 = PAID（不依赖真实支付）
}
```

## 禁止事项

1. ❌ Mock 后不声明假设条件
2. ❌ Mock 范围过大（把整个 Service 层都 Mock 掉）
3. ❌ 无替代验证方式（Mock 后不知道代码对不对）
4. ❌ 生产代码中残留 Mock 逻辑
