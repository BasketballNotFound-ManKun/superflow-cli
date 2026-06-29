# External Systems And Integration Contracts

> **Purpose**: Record external systems, APIs, messages, files, accounts, and
> integration evidence for this project.
> **Owners**: Integration owner / module owner / QA owner

## 1. System Topology

```text
<Current system>
  +- HTTP / RPC -> <External system A>
  +- MQ / Event -> <External system B>
  +- File / Object Storage -> <External system C>
  +- Webhook / Callback <- <External system D>
```

## 2. External System Inventory

| System | Responsibility | Integration Type | Environment | Owner | Failure Handling |
|--------|----------------|------------------|-------------|-------|------------------|
| `<System A>` | `<Responsibility>` | `<HTTP/MQ/SDK/File>` | `<dev/test/prod>` | `<Owner>` | `<Retry/alert/compensation>` |
| `<System B>` | `<Responsibility>` | `<HTTP/MQ/SDK/File>` | `<dev/test/prod>` | `<Owner>` | `<Retry/alert/compensation>` |

## 3. API / SDK Contracts

| System | API/SDK | Caller | Auth | Timeout/Retry | Real Test Entry |
|--------|---------|--------|------|---------------|-----------------|
| `<System A>` | `<Path/method/SDK method>` | `<Module>` | `<Method>` | `<Policy>` | `<curl/console/simulator>` |

Rules:

- Real API paths, parameters, and responses must come from source code,
  official docs, or integration records.
- Do not invent fields from memory. If semantics are unclear, return to the
  source of truth.
- When a field is added, removed, or renamed, reverse-scan callers, DTOs,
  mappers, logs, and tests.

## 4. Messages And Async Flows

| Topic / Queue / Event | Producer | Consumer | Payload Source | Idempotency Key | Verification |
|-----------------------|----------|----------|----------------|-----------------|--------------|
| `<Event>` | `<System>` | `<System>` | `<Schema/code>` | `<Field>` | `<Log/DB/consumer record>` |

Async completion evidence should include:

- Producer log or send record.
- Consumer log or handling record.
- State transition, database write, or downstream callback.
- Retry, dead-letter, or compensation strategy.

## 5. Files, Object Storage, And Batch Jobs

| File / Job | Source | Format | Storage | Trigger | Verification |
|------------|--------|--------|---------|---------|--------------|
| `<File/job>` | `<Source>` | `<CSV/XLSX/JSON>` | `<Path/bucket>` | `<Manual/scheduled/API>` | `<Sample/log/result>` |

## 6. Environments And Credentials

| Environment | Address | Credential Source | Test Account | Notes |
|-------------|---------|-------------------|--------------|-------|
| dev | `<URL>` | `<env/secret manager>` | `<Account>` | `<Notes>` |
| test | `<URL>` | `<env/secret manager>` | `<Account>` | `<Notes>` |
| prod | `<URL>` | `<env/secret manager>` | `<Account>` | `<Notes>` |

Do not write real secrets, tokens, or private keys here. Record only where they
come from and how to request access.

## 7. Integration Acceptance

- When sandbox or test environments are available, mock-only evidence is not
  enough.
- If real integration is blocked, record the blocker, owner, recovery condition,
  and temporary substitute verification.
- `test-report.md` must include actual requests, responses, logs, or data
  evidence.
- Compatibility logic for external systems must be observable; do not silently
  swallow errors.
