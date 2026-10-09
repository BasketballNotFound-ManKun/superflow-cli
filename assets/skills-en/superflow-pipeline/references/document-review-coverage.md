# Requirement × real-entry review

Starting in 0.5.10, full document delivery adds `coverage` to the existing
`document-review.json`. It indexes the existing source inventory, source audit,
entry ledger and test contract; it does not create a second requirements authority.
Reuse stable IDs. Discover entries from current callers/writers, never from FIX tasks alone.

## Ownership and semantic checks

The Agent extracts requirements from original user statements/confirmations, independently
discovers actual entry points, and checks omissions, narrowing, inversion and exclusions.
The script checks declared coverage, references, file hashes and review records. A structural
PASS cannot prove inventory completeness, business correctness or test sufficiency.
Ask the user only about real business ambiguity, implementation direction or authorization;
investigate source-resolvable questions autonomously.

1. Distinguish permission to act from allowed ownership/state/resource effects. Never change
   “allowed, but owned by the original principal” into “reject with zero effects”.
2. EXCLUDED applies to one requirement × one entry. Inapplicability of one filter must not
   exclude ownership, permissions, financial or other constraints on the same entry.
3. Independently review FIX, VERIFY_EXISTING, EXCLUDED and unchanged paths against original
   requirements. Existing code is not authorization to deviate. Scope changes return to owner confirmation.
4. Follow each actor's real action through caller branch, request, writes, visibility and
   downstream resources. Give different actor branches distinct entry IDs. Do not test only
   the newly selected API.
5. Assert response, final state and forbidden effects. For read-only/pure-function work explain
   why no persistent change applies; do not leave blanks. Browser paths require browser acceptance;
   API checks can supplement, not replace them.
6. For cross-page or field changes, inventory frontend routes, list columns and clickable actions
   independently from backend Controllers, exact Mapper statements and all writers. Reconcile both
   inventories before writing tasks/tests. Similar method names are not call-chain evidence. For
   every list record page request, Controller, Service, exact Mapper statement, response DTO and
   table; for every management button record its mutation API and write point. Investigate missing
   or conflicting entries instead of treating matching totals as proof.
7. A database-backed display case needs both a non-null fixture and a separate allowed historical
   NULL case. Compare API fields with authoritative DB values for the same business ID, then check
   browser rendering. Field keys, HTTP 200, empty lists and historical NULL alone are insufficient.
   Mutation cases also check write-then-read behavior and forbidden side effects.

## Receipt extension

Add the following `coverage` object to the existing three-round review; preserve its other
fields. Paths are relative to the change and may reference authorized sibling repositories.
Save online originals as local snapshots with URL and confirmation context. SHA-256 hashes
file bytes, unlike the normalized handoff hash. Reference code, do not copy its body.

```json
{
  "schemaVersion": "superflow.review-coverage.v1",
  "sources": [
    {"id":"S1","role":"requirement","path":"source-ingestion.md","sha256":"<64 hex>"},
    {"id":"S2","role":"code","path":"../../../src/caller.ts","sha256":"<64 hex>"},
    {"id":"S3","role":"contract","path":"tests.md","sha256":"<64 hex>"}
  ],
  "requirements": [
    {"id":"R1","statement":"Complete confirmed constraint, preserving allowed actions and outcome boundaries","sourceRefs":["S1"]}
  ],
  "entries": [
    {"id":"E1","kind":"browser","actor":"specified actor","route":"page action -> actual request path","sourceRefs":["S2"]}
  ],
  "decisions": [
    {"requirementId":"R1","entryId":"E1","disposition":"FIX","rationale":"This entry is subject to the requirement; see design","currentBehavior":"actual current behavior","targetBehavior":"preserve allowed action and constrain ownership","sourceRefs":["S1","S2"],"caseIds":["C1"]}
  ],
  "cases": [
    {"id":"C1","entryId":"E1","level":"browser","action":"Actor performs action on actual page","sourceRefs":["S3"],
     "assertions":{"response":"contracted success","state":"correct ownership and visibility","forbiddenEffects":"no independent resources"}}
  ]
}
```

- Every requirements × entries pair requires exactly one decision. Bound the inventory to
  the change; do not scan irrelevant platform modules. EXCLUDED requires a requirement source,
  a specific rationale and empty caseIds. FIX/VERIFY_EXISTING require cases for that same entry.
- `kind`/`level`: `browser|api|job|event|library|cli`; case level must match entry kind.
- Both `source-contract` and `e2e-environment` rounds add
  `"reviewedPairs": [["R1", "E1"]]` covering every pair, including exclusions.
  Filling the record is not a substitute for performing the review.
- Complete canonical documents/inventories, refresh handoff, perform all three reviews against
  current content, record coverage file hashes, then run coding-ready. Retain findings;
  updating hashes alone is not re-review.

## Verification, invalidation and migration

Document audit checks current content and coverage. Coding-ready binds the review file hash.
CLI/managed dispatch recomputes handoff and every source hash. The edit Hook checks documents
and review while allowing implementation source changes. Existing handoff normalization
preserves task checkbox updates and test-report progress without invalidating contracts.
If an earlier batch changed entry source before a new Prompt dispatch, the Host assesses its
impact and refreshes affected review evidence rather than blindly updating hashes.
A failed coding-ready recheck persists BLOCKED, revoking an earlier READY.

Old receipts remain readable but cannot authorize new dispatch or source edits without
coverage/reviewHash. Follow the migration/re-review steps above; empty objects do not bypass
them. Existing managed Run recovery protocols are unchanged. No project records are silently rewritten.

During verification, reuse R/E/C IDs in `test-report.md`, recording actual actor, action,
request route, state/forbidden-effect assertions, raw evidence paths and outcomes. The Host
compares them to original sources, not only a test summary. Planned cases are not execution
evidence; API-only results cannot claim browser E2E. Do not claim automatic semantic assurance.
Full SDD reports use one per-case execution evidence table for the existing report linter:

| Case ID | Entry ID | Acceptance level | Result | Evidence path |
|---|---|---|---|---|
| C1 | E1 | browser | PASS | logs/C1-receipt.json |

Results are `PASS/FAIL/BLOCKED/PARTIAL`. Evidence points to actual command output, browser trace,
response or DB reconciliation. Retain readable local execution receipts for PASS; remote material must be saved locally. Explain blockers in the report body. This table proves case-level
accounting only; the Host must inspect evidence contents. Any non-PASS case prevents an overall PASS.

## Replayable execution receipts (0.5.17)

A PASS evidence path must reference a retained local `superflow.execution-receipt.v1` JSON. Empty files, arbitrary prose, remote URLs and aggregate counts cannot replace execution evidence. Keep legacy evidence PARTIAL until affected checks are completed.

Receipt fields: `caseId/entryId/level/status=PASS/executed>=1/evidenceKind`; `command{argv,exitCode=0,output,sha256}`; `sources[{path,sha256}]`; `build{id,artifact,sha256,sourceFingerprint}`; `target{service,route,kind,buildId,buildSha256,sourceFingerprint}`; `assertions[{id,expected,actual,result=PASS}]`. Paths are relative to the receipt, including authorized sibling sources. Retain raw output. Compute sourceFingerprint as SHA-256 of sorted `path:sha256` lines joined with newline, without a trailing newline. Build and runtime target share the fingerprint and artifact identity. The reviewer still checks build commands and the actual process/image.

Raw command output includes exactly one JSON line per case with `caseId/entryId/level/status/executed/assertions/persistence` matching the receipt. Other logs may coexist. Unknown IDs, zero execution, SKIP, placeholders and missing assertion events cannot PASS. Multiple cases may share one retained log, with each receipt selecting its own event.

Frozen entries may declare `service` (default entryId) and `persistence:[{table,field}]`. Cases default to `evidenceKind=real`; `controlled-simulation` or `unit` require explicit frozen approval. Services writing the same table remain separate entries and source chains, with separate evidence.

Freeze writes in `assertions.persistence:[{id,table,field,expected,allowNull?}]`. Receipt/raw event add `before{businessId,value}`, `after{businessId,value}`, and `result`. Business IDs must match and after.value must equal the frozen expectation. New/changed fields require non-null expectations; historical NULL explicitly uses allowNull. Schema/index existence, mock arguments and all-NULL samples cannot prove writes.

Independent review checks the exact Mapper statement called by Service, every write chain, runtime identity, raw assertions and old-event/new-request isolation. Claims that implementation is complete must agree with source and runtime evidence. Hashes prove identity, not authenticity or test sufficiency. No new managed protocol/state owner is introduced; non-behavioral lightweight work does not acquire DB obligations.

Raw case events also carry evidenceKind/sources/build/target and command{argv,exitCode}, exactly matching the receipt. build.command{argv,exitCode,output,sha256} retains build output with a JSON line {event:"build",buildId,sourceFingerprint,artifactSha256,argv,exitCode:0}. Independent review still verifies actual build/runtime behavior. Only the latest consistent bilingual Verification Result authorizes completion; historical records and fenced examples do not.

## Database layer contract

This extends existing coverage/receipt v1, with no new Skill, Hook, or state owner.
Semantic review must declare entry `database` for persistence, field display, CAS,
transaction, or query impacts. Pure logic may omit DB validation with an explicit
no-persistence rationale. Do not infer risks from SQL keywords.

- `case.testLayer=logic|sql-binding|database|http-entry` is separate from entry `level`.
  Logic mocks prove isolated logic; SQL binding proves generated/bound SQL only.
  Required cases must include a `database` or `http-entry` case with `evidenceKind=real`;
  auxiliary logic/SQL-binding cases do not need database connections.
- `entry.database={engine,major,schemaSourceRefs,statements:[{sourceRef,id}]}` freezes
  the real engine, major version, schema sources, and exact production statements.
  H2/SQLite cannot replace MySQL. Schema and Mapper XML use existing sources and
  receipt fingerprints; anonymous SQLite replay validates only the harness.
- Freeze database-case `statements:[{sourceRef,id}]`,
  `mockBoundary={allowed:[external clients],forbidden:[required Service/Mapper]}`,
  and `databaseAssertions:[{id,kind,expected}]`. The contract defines observation kinds:
  writes include `affectedRows` and `unchangedRows`; the latter freezes actual snapshots
  of non-target records and previous rounds. Agents freeze assertions for other risks;
  scripts do not infer business semantics.
- Receipt and original case event repeat `testLayer`, `mockBoundary`, and
  `database={engine,major,statements,assertions:[{id,kind,expected,actual,result}]}`.
  Retain raw command/build/entry/source-version bindings. Database actual values must
  match frozen expectations. Field writes retain `assertions.persistence` and
  same-business-ID before/after/expected. Mock arguments, NULL, field keys, or affected
  rows alone cannot establish persistence.
- An `http-entry` carrying DB obligations must traverse real HTTP → production
  Service/Mapper → same-engine DB and check response, persistence, and isolation.
  Direct Mapper replay cannot claim HTTP or browser acceptance.
- Legacy nonpersistent contracts stay compatible. Legacy persistent PASS without
  the new contract remains PARTIAL. Missing required DB environments are PARTIAL/BLOCKED
  with reasons; green auxiliary mocks/SQL binding cannot promote full PASS.
  Historical evidence bound to a fixed entry, source/build version, and DB engine
  remains valid for that version. Current source changes require new evidence; never
  reclassify historical real tests as unexecuted or reuse them for a changed version.

Positive examples: auxiliary logic/SQL binding plus production XML/MySQL data assertions;
explicit no-persistence rationale for pure logic. Negative examples: mock-only required
sets, HTTP bypassing production Mapper, engine/statement/boundary/source mismatch,
and omitted-field NULL reported PASS. Independently review these positive/negative
examples after document generation in source-contract and e2e-environment rounds.
Structure checks establish frozen/observed consistency; independent Agents assess
sufficiency and the real production chain.

`unchangedRows.expected` must be a nonempty row-snapshot object indexed by stable
business-ID/round keys. `actual={before:{businessKey:rowSnapshot},after:{businessKey:rowSnapshot}}`
retains both real query observations; both must match frozen expected. A success
boolean cannot replace snapshots. JSON observations preserve types recursively:
boolean differs from number (true cannot prove one affected row), including nested
arrays/objects. Documents and independent review choose business keys and fields.
