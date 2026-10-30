# Validation Integrity

## Anti-Fake-Delivery Rules

- Do not write pass when a command was not executed.
- Do not replace real-entry evidence with mock evidence.
- Do not hide skipped tests inside a success summary.
- Do not claim app verification from an old process.
- Do not claim DB verification without SELECT, SHOW CREATE, or equivalent proof.
- Do not claim log verification without checking current logs.
- Reconcile shared-schema fields in every authorized, locally controlled consumer repository;
  missing/uncontrolled consumers remain coordination dependencies with owners and completion
  conditions. They do not authorize implementation or justify claiming end-to-end readiness.

## Allowed Outcomes

- Passed: evidence exists and matches tests.md.
- Partially verified: some evidence exists, and gaps are explicit.
- Blocked: external dependency or environment prevents execution, with reason.
