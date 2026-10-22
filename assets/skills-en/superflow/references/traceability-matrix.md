# Requirement–Entry–Implementation–Test Traceability

## One relationship source

Existing coverage in `.sdd/reviews/document-review.json` owns sources, original
requirements, real entries, cases and `decisions.taskIds/caseIds` relationships.
traceability-matrix.md is its readable navigator, not a second set of IDs or state.
The tasks index establishes existence and original checkboxes own progress. HOW and
current source/review manifests own implementation locations. test-report and real
receipts own case results/evidence. Reference them without copying business decisions,
SQL, commands or PASS claims.

## Readable matrix

| Requirement ID | Entry ID | Decision | Task IDs | Case IDs | HOW / implementation | Current evidence |
|---|---|---|---|---|---|---|
| R1 | E1 | FIX | 1.1 | C1 | Exact design/HOW section and current source reference | Current case row in test-report |
| R1 | E2 | VERIFY_EXISTING | No new task | C2 | Current caller-chain source | Real execution or remaining gap |
| R1 | E3 | EXCLUDED | None | None | Original requirement exclusion | No claimed acceptance |

## Bidirectional reconciliation

1. Original requirement → real entries: examine behavior beyond the listed matrix.
2. Write method/SQL/field → all callers: inspect single, batch, internal/async re-save,
   job/event and bypass routes. Add discovered entries to the same entries/decisions/cases
   and refresh affected tasks/reviews.
3. Actual request → ownership/snapshot → writes: inspect real UI/SDK/caller payloads and
   who supplies required identifiers. Tests must not invent a value absent from real
   callers. Content snapshots and version/identity tokens share the same observation.
4. Writes → transaction/proxy/side effects: distinguish auto-commit, same transaction,
   post-commit, async and swallowed errors. Challenge interleavings where business data
   commits but its guard/version does not, rather than only sequential stale writes.
5. Cases → implementation and original goal: verify the actual entry, condition and
   assertions trigger that branch. Identical responses or manual SQL do not establish
   another business entry. Forbidden effects require distinguishable, nonempty data.
6. Main/batch prompts → the same Task/Entry/Case IDs: use the
   [navigation table](implementation-prompt-template.md#execution-navigation). Batches own
   increments; canonical owners own shared contracts. Prompts do not prove design completeness.

## Responsibilities and closure

Scripts verify registered IDs, links, source identity and relationships, not entry
completeness, actual reading or assertion sufficiency. Source-contract reviewers
challenge the reverse search; code reviewers separately examine current diffs and
unchanged callers. New entries or consumers first repair their canonical body and
references, then refreeze/review. Link current PARTIAL outcomes without substituting
historical PASS or a complete matrix. Record authorized deferral, mitigation and repair distinctly.
