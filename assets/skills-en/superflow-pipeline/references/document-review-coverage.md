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
