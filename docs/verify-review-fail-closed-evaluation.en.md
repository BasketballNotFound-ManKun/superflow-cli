# Evaluation: frozen entry review at full SDD verification

## Evidence, baseline, and owner

The operator-api 15-page audit replay showed that the 0.5.14 per-case lint rejects
13/15 receipts when given `document-review.json`. With that file missing, the full
workflow verify guard passed only `tests.md`, so the same C-case report bypassed
the entry index. This is a deterministic fail-closed gap, not a business-semantic
judgment. A focused regression failed before the change because the missing review
did not produce a blocking diagnostic.

The hypothesis is that the existing guard can require the frozen review for a full
workflow and keep passing it to the existing `--review` lint. Quick, hotfix, and
tweak workflows retain their lighter contract.

## Representative results

| Case | Expected and observed |
|---|---|
| Full SDD without `document-review.json` | Verify blocks and points back to the docs entry review |
| Fifteen frozen cases with thirteen receipts | Existing lint receives `--review` and reports missing C14/C15 |
| Fifteen frozen cases with all fifteen receipts | Both guard mirrors pass verify |
| Tweak without a full entry review | Verify continues to pass |

Only the Chinese and English mirrors of the existing guard and its focused tests
change. There is no new Skill, Hook, Prompt, state, Agent call, or model polling.
The source-contract review and real acceptance still own entry completeness,
exact Mapper selection, and non-null same-ID assertions. The script only checks
review presence and receipt completeness.

Full regression passed: **95 files and 652 tests**, plus build, ESLint, both
design gates, and `skill-audit --strict`. This adds two focused tests to the
650 in the 0.5.14 release. One run's duration is not a performance trend.
The operator-api browser and test-cluster acceptance were not rerun for this
framework change. The observed missing-review bypass is closed; semantic
inventory completeness and evidence quality remain Agent judgments. Runtime
cost is one local file-existence check, with no additional call or durable state.
`npm pack --dry-run` succeeded with 402 files, including both guard mirrors and
the existing report lint. Focused regression ran both guards with matching results.

Rollback if valid full-workflow verification is blocked, a Quick path is forced
into full review, or installed Codex/Claude guards diverge. Keep the injected
failure evidence; do not weaken the per-case lint to obtain a passing result.
