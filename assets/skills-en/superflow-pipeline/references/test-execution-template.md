# Test Execution Template

Use the environment frozen in tests.md; do not substitute local containers or
mocks for an explicitly required shared development environment. When the user
requires every endpoint to be exercised, freeze an endpoint/role/scenario matrix,
reuse one healthy application instance and test accounts, and record redacted
requests, response files, and expected versus actual database sets for every row.
List missing, failed and blocked rows explicitly. Restart only when code,
configuration or process health requires it, and record the reason. Future release
environments must not become gates for a development-only delivery.

## Test Case

- ID:
- Level: L0 unit, L1 component, L2 integration, L3 API, L4 real-entry
- Preconditions:
- Command:
- RED expected failure:
- GREEN expected pass:
- Response assertion:
- DB assertion:
- Log assertion:
- Evidence location:

## Report Entry

- Environment:
- Command executed:
- Result:
- Evidence:
- Blocker if not executed:

## Money Precision Boundary Evidence

Required when monetary calculation, settlement, proration, allocation,
reconciliation, or financial display changes:

| Case | Identity/authoritative total | Currency/minor unit | Complement | Pre/post round | Strategy/residual recipient | Positive/zero/refund/tied residual | Reconciliation |
|---|---|---|---|---|---|---|---|
| TC-M01 | `original = discount + actual` / `original` | CNY/minor unit | `actual = original - discount` | | largest remainder / | | pass/blocked |

Prove that calculation-state values were not rounded before the confirmed final
boundary and that original, discount, actual, refund, and allocated totals obey
the design contract. When an authoritative total exists, prove the final
component was derived by subtraction instead of independently calculated and
rounded. Record currency, provider minor unit, pre/post-round values, residual
recipient, and positive/zero/negative or refund, tied remainder, and idempotent
recalculation evidence. FX cases also record base/quote, rate source, and target
settlement rounding. A two-decimal display assertion alone is insufficient.

## Closeout

Verification Result: PASS / FAIL / BLOCKED / PARTIALLY_VERIFIED
Archive Readiness: PASS / BLOCKED

Required for `verify_mode: full`:

- Test environment:
- Branch/commit/build number or image:
- Base URL:
- Verification timestamp:
