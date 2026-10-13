# Validation Integrity

## Anti-Fake-Delivery Rules

- Do not write pass when a command was not executed.
- Do not replace real-entry evidence with mock evidence.
- Do not hide skipped tests inside a success summary.
- Do not claim app verification from an old process.
- Do not claim DB verification without SELECT, SHOW CREATE, or equivalent proof.
- Do not claim log verification without checking current logs.

## Allowed Outcomes

- Passed: evidence exists and matches tests.md.
- Partially verified: some evidence exists, and gaps are explicit.
- Blocked: external dependency or environment prevents execution, with reason.
