# Test Execution Template

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

| Case | Amount field | Original input/precision | Rounding boundary and mode | Half-cent/residual/multi-detail case | Original | Discount | Actual | Allocated total | Reconciliation |
|---|---|---|---|---|---|---|---|---|---|
| TC-M01 | | | | | | | | | pass/blocked |

Prove that calculation-state values were not rounded before the confirmed final
boundary and that original, discount, actual, refund, and allocated totals obey
the design contract. A two-decimal display assertion alone is insufficient.
