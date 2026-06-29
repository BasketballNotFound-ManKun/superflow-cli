# Mock Strategy Guide

Mocks are allowed for isolation, not for claiming real integration.

## Labels

- Mock verification: dependency replaced or simulated.
- Test endpoint verification: local helper endpoint or bypass path.
- Real-entry verification: production-like user, device, callback, job, MQ,
  client, or third-party entry.

## Report Rule

Keep these labels separate in test-report.md. Mock-only evidence cannot close a
requirement that tests.md marks as L3/L4, real-entry, third-party, DB, or log
verified.
