# 验收证据完整性门禁

Use this reference whenever SDD docs, implementation prompts, or test reports
claim that an API, integration flow, external dependency, dropdown, enum, or
frontend payload has been tested.

## Hard Gates

- Do not mark L3/L4 tests as passed without real evidence.
- Do not mark any Maven or Gradle test evidence as passed when the output says
  `Tests are skipped` / `测试被跳过`. `BUILD SUCCESS` only proves the build
  finished; it does not prove tests ran.
- Do not collapse multiple Maven commands into one test count. Each command
  must have its own `Tests run` summary. If a wildcard such as
  `-Dtest='*P47*'` does not match a needed test class, record and execute a
  separate command for that class.
- Do not keep deleted methods, removed classes, or old algorithms in current
  evidence tables. Old anchors may be mentioned only as explicitly deleted or
  historical context.
- Do not treat a generic fallback error as success unless the requirement
  explicitly defines that fallback as the expected business result.
- Do not use placeholder values such as `TEST_PARK_001` to prove frontend or
  production-like integration unless the source of that value is documented.
- Do not let mock-only evidence close a case that requires real frontend data,
  real database state, real operator/site/park codes, real token, or an external
  SDK/service call.
- Do not let a test controller, mock endpoint, bypass-auth endpoint, or direct
  service-call endpoint close a case that requires a real external entry.
- Do not treat one repository's schema verification as complete when sibling
  services copy the same PO/Mapper or read the same table.
- If required test data is missing, mark the case `Blocked: missing test data`
  and ask for or discover the data before claiming completion.

## tests.md Requirements

For every L3/L4 or frontend integration case, include these columns or equivalent
fields:

| Field | Required content |
|---|---|
| 用例 ID | Stable test id, referenced from spec/tasks/prompt |
| 接口/流程 | Full URL or user workflow |
| 数据来源 | User-provided, frontend captured payload, DB query, seeded fixture, or mock |
| 关键参数 | Real values such as parkCode/operatorId/plotId/templateId; no unexplained placeholders |
| 预期断言 | Response, DB, log, and external-call assertions |
| 证据要求 | curl/request/response/DB/log/external response required in test-report.md |
| 证据等级 | Mock only / Test endpoint / Real external entry |

For dropdowns, enums, external SDK calls, device callbacks, payment/refund,
invoice, export, import, and cross-system flows, add at least one real-data case
or explicitly mark the case blocked.

## test-report.md Requirements

Every passed L3/L4 case must include:

- test id and requirement/spec reference
- environment, profile, port, context path, branch, and commit
- exact command or curl
- real request parameters and where they came from
- raw or summarized response
- assertion result
- database evidence when state changes or persistence matters
- relevant logs
- external SDK/service request and response when external dependencies matter
- evidence level: `Mock only`, `Test endpoint`, `Partial real entry`, or
  `Real integration passed`
- for cross-repository database contracts: source schema, each consumer
  repository, entity/Mapper/SQL fields, real database columns, and conclusion
- exact command-to-result mapping for every automated test command. If the same
  command appears with different `Tests run` values, the report is not
  acceptable until reconciled.
- for sibling repositories whose build config skips tests by default, record the
  direct command result (`Tests are skipped` if applicable), the temporary
  change or profile that makes tests run, the real `Tests run` output, and the
  clean git status after rollback.

If any of those are absent, status must be `Not executed`, `Blocked`, or
`Partially verified`, not `Passed`.

Before delivery, run:

```bash
~/.codex/hooks/superflow-test-report-lint.py <embedded test-report.md>
```

For root aggregate reports, run the same script with `--warn-only` and review
all warnings before signing off.

## Cross-Repository Schema Rule

When a table is shared across repositories or a service copies another
service's PO/Entity/Mapper:

- identify the source-of-truth schema: version SQL, database contract, and
  `SHOW CREATE TABLE`
- list every consuming repository and runtime path, including interconnect,
  callback, scheduled job, import/export, and test endpoint paths
- compare MyBatis-Plus `@TableName` entity fields, `BaseMapper` default
  selection, Mapper XML/resultMap, and handwritten SQL against real database
  columns
- fields removed from the final schema must be removed from mapped entities or
  marked `@TableField(exist = false)`
- if code still queries a removed column, the fix is code/schema contract
  alignment, not adding obsolete columns back to test database

The case is blocked if any consumer repository maps or queries a non-existent
column.

## Red-Green Rule

For bug fixes and CR/Px follow-ups:

1. Record the red evidence first: the exact failing test, curl, or workflow
   before the fix, including the error response/log/DB mismatch.
2. Apply the fix.
3. Run the same evidence path again and record the green result.

For new features where no old failing path exists, use a negative control:

- one invalid or unauthorized case fails with the expected error
- one real happy-path case passes with response and DB/log evidence

## External Dependency Rule

When an external service is unavailable:

- record the external request parameters, endpoint/config source, exception type,
  external code/message if available, and whether the failure is environmental or
  code-related
- do not mark the business case passed unless the requirement only promises a
  stable error under external failure
- keep the delivery conclusion explicit: `Blocked by external dependency`,
  `Code path verified with mock`, or `Real integration passed`
