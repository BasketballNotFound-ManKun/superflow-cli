# Money Precision Algorithm Baseline

Money correctness is a contract across representation, currency units,
calculation, rounding, allocation, FX, persistence, and audit. Apply this
baseline to monetary design, implementation prompts, review, and verification.
An evidenced legal, tax, settlement, or provider contract takes precedence.

## Exact representation and units

- Use an exact decimal type such as Java `BigDecimal`, JSR 354
  `MonetaryAmount`, or integer minor units coupled with an explicit currency.
  Never represent or calculate money with binary `float` or `double`.
- Construct decimals from strings, exact integers, or exact database values,
  never from a `double`.
- Every amount contract declares currency, unit, and scale. Never assume two
  decimal places. Distinguish ISO 4217 minor units, internal calculation scale,
  settlement scale, and provider-specific minor units.
- Convert to integer minor units only at an adapter boundary, with provider
  rule, range, and overflow checks.
- Persist money as `DECIMAL` or `NUMERIC`. Code, DDL, mapper, and API
  precision/scale must agree. Implicit database conversion is not a business
  rounding policy.

## Rounding policy matrix

Every rounding point declares its business level, input precision, output
scale, rounding mode, currency or cash increment, and policy source. Do not
apply global `HALF_UP`, or mix line-level and aggregate-level rounding inside
one identity without an explicit reconciliation rule.

- Division declares precision and rounding mode. Use `UNNECESSARY` as an
  assertion where an exact result is required.
- Retain rate, quantity, product, ratio, and FX precision until a contracted
  settlement boundary.
- Negative values change the meaning of modes such as `CEILING` and `FLOOR`.
  Test refunds and reversals explicitly instead of inferring from positives.
- Freeze either line-level or invoice-level tax rounding as the authoritative
  path. Route any permitted alternative through an explicit adjustment rule.

## Authoritative totals and complement derivation

For `total = component 1 + ... + component N`, identify the authoritative
total, calculate only N-1 components independently, and derive the final
component as `authoritative total - sum(other components)`. Never calculate and
round all components independently and then rebuild the authoritative total.

## Allocation and residual units

Calculate high-precision ideal shares, then quantize at the settlement unit:

1. Express the authoritative target in integer settlement units.
2. Calculate ideal shares and base allocations.
3. Compute `residual units = target units - sum(base allocation units)`.
4. Assign one unit at a time until the residual reaches zero.
5. Use a declared strategy and stable tie-breaker such as a business key.

Prefer the largest-remainder method for neutral proportional allocation. Apply
the same absolute ordering symmetrically to refunds and negative totals.
Largest-value or last-row policies are allowed only when the contract requires
them. Never depend on database natural order. Prove conservation, stable order,
and idempotence.

## FX conversion

- Treat an FX rate as directional data with base/quote currencies, source,
  timestamp, validity, and precision.
- Never truncate or round the rate early. Do not synthesize an inverse when a
  canonical directional rate exists.
- Freeze one conversion path. For triangulation, use the contracted reference
  currency and operation order, then round only at the target settlement unit.
- Round-trip conversion is a tolerance check, not an exact identity.

## Audit and verification

Record raw inputs, formula/version, currency/unit, pre-round value, policy,
post-round value, residual, and residual recipient. Record FX metadata when
applicable. Test positive, zero, negative/refund, half-unit, non-terminating
division, multi-detail, tied remainders, overflow, and repeated execution.

Required invariants: authoritative total equals component sum; allocations
equal the settlement target; identical inputs, policy version, and stable order
produce identical outputs; persistence, API, and provider conversions do not
silently change money.

## Primary references

- ISO 4217: <https://www.iso.org/iso-4217-currency-codes.html>
- JSR 354: <https://www.jcp.org/en/jsr/detail?id=354>
- Java `BigDecimal`: <https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/math/BigDecimal.html>
- MySQL `DECIMAL`: <https://dev.mysql.com/doc/refman/en/fixed-point-types.html>
- PostgreSQL `numeric`: <https://www.postgresql.org/docs/15/datatype-numeric.html>
- Stripe minor units: <https://docs.stripe.com/api/payment_intents/object>
- Adyen minor units: <https://docs.adyen.com/development-resources/currency-codes/>
- EU conversion rules: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A31997R1103>
- HMRC VAT rounding: <https://www.gov.uk/hmrc-internal-manuals/vat-trader-records/vatrec12030>
- SAP allocation residuals: <https://help.sap.com/docs/PRODUCT_ID/56471df1959f4cfd9e3bf7a6d2d5be42/56a2dfe71e8b2ea1e10000000a42189c.html>
