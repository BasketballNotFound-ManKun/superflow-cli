# Test Guide

## Levels

- L0: unit test.
- L1: component test.
- L2: integration with real infrastructure such as Testcontainers.
- L3: API or message contract test with executable command.
- L4: real external entry such as callback, device, scheduler, client, or
  third-party sandbox.

## Rule

When tests.md requires L3/L4, test-report.md must include real command,
response, DB/log assertion, and final state evidence. Unit tests alone do not
close the requirement.
