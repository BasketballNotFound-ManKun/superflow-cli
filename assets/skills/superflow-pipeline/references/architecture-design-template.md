# 架构设计文档模板（0→1 全新系统）

用于从零开始构建系统的顶层设计文档。增量变更（1→1.1）不需要此文档，使用 design.md 的变更矩阵即可。

## 文档结构

```markdown
# 架构设计：<系统名称>

## 1. 项目背景与目标

- 业务场景描述
- 核心目标（1-3 句话）
- 非目标（明确不做的事）

## 2. 技术选型

| 层级 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| 后端框架 | Spring Boot | 3.x | 项目技术栈 |
| ORM | MyBatis / MyBatis-Plus | - | 复杂 SQL 可控 |
| 数据库 | MySQL | 8.0 | 关系型数据，事务支持 |
| 缓存 | Redis / Caffeine | - | 按需选择 |
| 前端 | Vue 3 + Vite | - | 项目前端技术栈 |
| 构建工具 | Maven / Gradle | - | 按项目约定 |
| 容器化 | Docker | - | 部署标准化 |

## 3. 系统架构

### 3.1 整体架构图（文字描述）

```
[前端] → [Nginx] → [Spring Boot 应用] → [MySQL]
                        ↓
                    [Redis/缓存]
                        ↓
                    [外部服务/Mock]
```

### 3.2 模块划分

| 模块 | 职责 | 对应包路径 |
|------|------|-----------|
| controller | HTTP 接口暴露 | `com.example.module.controller` |
| service | 业务逻辑编排 | `com.example.module.service` |
| mapper/dao | 数据访问 | `com.example.module.mapper` |
| model/entity | 实体定义 | `com.example.module.model` |
| config | 配置类 | `com.example.module.config` |
| client | 外部服务调用 | `com.example.module.client` |

## 4. 数据模型

### 4.1 核心实体关系

```
User 1:N Order
Order 1:N OrderItem
```

### 4.2 核心表结构

| 表名 | 说明 | 核心字段 |
|------|------|----------|
| `tb_user` | 用户表 | id, username, status, created_at |
| `tb_order` | 订单表 | id, user_id, status, amount |

## 5. 接口概览

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 用户注册 | POST | /api/v1/users | 创建用户 |
| 用户登录 | POST | /api/v1/auth/login | 返回 JWT |

详见 [api-design-template.md](api-design-template.md) 编写完整接口文档。

## 6. Mock 策略

外部依赖清单及 Mock 方案：

| 外部依赖 | 实际能力 | Mock 方式 | 替代验证方式 |
|----------|----------|-----------|-------------|
| 支付网关 | 真实支付 | Spring MockBean | 固定返回 success |
| 短信服务 | 真实发送 | WireMock | 验证调用次数 |
| 设备回调 | 硬件触发 | 本地模拟 HTTP 服务 | 手动调接口模拟 |

详见 [mock-strategy-guide.md](mock-strategy-guide.md)。

## 7. 部署架构

```
开发环境：本地 IDEA + H2/MySQL
测试环境：Docker Compose（MySQL + Redis + App）
生产环境：K8s / 物理机
```

### Dockerfile 示例

```dockerfile
FROM eclipse-temurin:17-jdk-alpine
COPY target/*.jar app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

## 8. 安全设计

- 认证：JWT Bearer Token
- 鉴权：RBAC 角色权限
- 敏感数据：密码 BCrypt 加密
- 接口安全：防重放（timestamp + nonce + sign）

## 9. 非功能性设计

| 维度 | 方案 |
|------|------|
| 性能 | 数据库索引、缓存、分页 |
| 并发 | 乐观锁 / 分布式锁 |
| 日志 | SLF4J + Logback，结构化日志 |
| 监控 | Actuator + 自定义指标 |
| 异常 | 全局异常处理器，统一错误码 |
