# 金额精度算法基线

金额正确性不是“统一保留两位小数”，而是表示、币种单位、计算、舍入、分配、
汇率、存储和审计共同构成的合同。涉及金额的技术详设、实现提示、评审和验证必须
应用本基线；若法律、财税、清算机构或支付渠道另有规则，以有证据的外部合同为准。

## 1. 精确表示与单位

- 计算态使用十进制精确类型（如 Java `BigDecimal`、JSR 354 `MonetaryAmount`）
  或带明确币种的整数最小单位。禁止用二进制 `float`/`double` 表示或计算金额。
- 从字符串、整数最小单位或精确数据库值构造十进制金额；禁止从 `double` 构造。
- 每个金额合同必须携带币种、金额单位和 scale。不得假定所有币种都是两位小数；
  同时区分 ISO 4217 小数位、内部计算 scale、结算 scale 和支付渠道最小单位。
- 对外转换为整数最小单位时，只在适配器边界转换，并校验范围、溢出和渠道规则。
- 数据库使用 `DECIMAL`/`NUMERIC`，代码、DDL、Mapper 和 API 的 precision/scale
  必须一致。数据库写入时的隐式截断或舍入不能代替业务舍入合同。

## 2. 舍入策略矩阵

每个舍入点必须声明：业务层级（明细/订单/发票/支付/展示）、输入精度、输出
scale、rounding mode、币种或现金最小增量、规则来源。禁止全局默认 `HALF_UP`，
也禁止在同一恒等式中混用“逐行舍入”和“汇总后舍入”而没有对账规则。

- 除法必须显式声明精度和 rounding mode；预期精确的运算可用 `UNNECESSARY`
  作为断言，使非整除或意外舍入直接失败。
- 中间费率、数量、乘积、比例和汇率保留计算精度，只在合同指定的结算边界舍入。
- `CEILING`、`FLOOR` 等模式对负数含义不同；退款、冲正、负数分摊必须单独验证，
  不能用正数用例推断。
- 税额和发票必须冻结逐行或整单口径，只实现一个权威路径；若外部合同允许另一
  口径，差异必须进入显式调节或对账规则。

## 3. 权威总额与差额反推

若合同存在 `总额 = 组成项 1 + ... + 组成项 N`，先识别权威总额。只独立计算
N-1 个组成项，最后一项按 `权威总额 - 其余组成项合计` 差额反推。禁止所有组成
项分别计算、分别舍入后相加重建权威总额。确实不适用时，必须记录真实权威来源和
owner 证据。

## 4. 比例分配与尾差

比例分配必须先计算高精度理想份额，再量化到结算最小单位：

1. 将权威总额转换为目标最小单位，得到必须守恒的整数总量。
2. 计算各明细高精度理想份额及基础分配额。
3. 计算 `剩余单位 = 权威总额单位 - 基础分配单位合计`。
4. 每次分配一个最小单位，直到剩余为零。
5. 明确确定性策略和稳定 tie-breaker（同余数时按业务主键等稳定字段排序）。

默认优先使用最大余数法：按被截去余数从大到小补单位；退款或负数按相同绝对
排序规则对称扣减。合同也可指定最大金额、最后一行等策略，但必须说明依据，不能
依赖数据库自然顺序。必须验证合计守恒、顺序稳定、重复执行幂等。

## 5. 汇率换算

- 汇率是带方向的数据：记录 base/quote 币种、来源、时间点、有效期和精度。
- 禁止提前截断或舍入汇率；存在权威方向汇率时，不用其倒数构造替代汇率。
- 冻结唯一换算路径；跨币种中转使用合同指定的基准币种和顺序，最终仅在目标
  结算边界按目标币种或渠道单位舍入。
- 往返换算只能验证合同容差，不能当作精确恒等式。

## 6. 审计与验证

金额证据至少记录原始输入、公式/版本、币种与单位、舍入前值、舍入策略、舍入后
值、尾差和尾差接收方；汇率场景另记录汇率元数据。测试至少覆盖正数、零、负数/
退款、半最小单位、非整除、多明细、并列余数、极值/溢出和重复执行。

核心不变量：

- 权威总额始终等于组成项合计。
- 分配结果始终等于目标结算金额。
- 相同输入、策略版本和稳定排序始终产生相同结果。
- 持久化、API 和支付渠道转换不会静默改变金额。

## 官方依据

- ISO 4217 currency codes：<https://www.iso.org/iso-4217-currency-codes.html>
- JSR 354 Money and Currency API：<https://www.jcp.org/en/jsr/detail?id=354>
- Java `BigDecimal`：<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/math/BigDecimal.html>
- MySQL exact-value `DECIMAL`：<https://dev.mysql.com/doc/refman/en/fixed-point-types.html>
- PostgreSQL exact `numeric`：<https://www.postgresql.org/docs/15/datatype-numeric.html>
- Stripe smallest currency unit：<https://docs.stripe.com/api/payment_intents/object>
- Adyen currency minor units：<https://docs.adyen.com/development-resources/currency-codes/>
- EU conversion and rounding rules：<https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A31997R1103>
- HMRC VAT rounding：<https://www.gov.uk/hmrc-internal-manuals/vat-trader-records/vatrec12030>
- SAP allocation residual strategies：<https://help.sap.com/docs/PRODUCT_ID/56471df1959f4cfd9e3bf7a6d2d5be42/56a2dfe71e8b2ea1e10000000a42189c.html>
