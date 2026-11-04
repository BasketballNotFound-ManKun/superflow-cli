---
name: superflow
description: Superflow user entry — the current Agent owns ordinary implementation, testing, review, repair, and delivery; also supports requirement documents and explicit dual-Agent management.
---

# Superflow user entry

Users state goals and constraints; the current Agent selects and carries the
existing phase. Discussion, investigation, documents and review stay within their
requested scope. Coding requires implementation authorization. Git, release,
deployment, archive and shared resources honor their own existing authorization.

## Installed path resolution

Resolve scripts and references against this installed SKILL.md directory and call
scripts with absolute paths; `scripts/...` is never relative to the business cwd.
Prefer the Host's Skill tool. Without it, read the full sibling `<stage>/SKILL.md`
relative to this skill's installed directory (for example `../superflow-build/SKILL.md`),
without scanning personal directories.

## Full phase read

1. Read project rules, workspace and task state. For existing SDD run
   `scripts/superflow-state.sh recover <change-dir>` and `next`; check actual
   contracts, remaining work and frozen execution modes.
2. Select below and **read the entire phase SKILL.md and its required references
   before acting**. Repeat on every phase transition or recovery. Names,
   descriptions, the Flow Owner summary and invocation logs do not replace text.
3. For ordinary implementation read [Flow Owner](references/flow-owner.md);
   continue implementation, tests, repairs and delivery. Before implementation/code
   review read the full [Reviewer checklist](references/reviewer-checklist.md),
   dispatch risk-appropriate isolated read-only bundles, receive reports, retest
   repairs and obtain actual rereview.
4. For applicable specialized contracts or concrete gaps, read the relevant heading
   in [detailed routing rules](references/routing-contract.md). All old detailed
   rules remain; not loading a rule does not exempt its scope. Do not preload all
   detailed rules at entry.

| Goal/state | Existing phase/capability |
|---|---|
| Ideas, alternatives, source investigation | `$superflow-explore` |
| Long/mixed sources, unresolved owner/behavior/API/DB/concurrency/cross-repo choices | `$superflow-clarify`; establish repository facts first |
| One clear low-impact change with an existing test seam | `$superflow-quick-dev`; run admission first, otherwise clarify |
| New base OpenSpec artifacts | `$superflow-propose`; follow OpenSpec CLI dependencies/instructions |
| API, test, traceability and quality contracts | `$superflow-contracts` |
| Requirement review, challenge omissions/errors or design drift | `$superflow-requirement-review` |
| Source-level HOW and technical design | `$superflow-design` |
| Implementation prompts, batch handoff and repair instructions | `$superflow-handoff` |
| Approved implementation and continuation | `$superflow-build` |
| Independent code/evidence review, repair verification, delivery reconciliation | `$superflow-verify` |
| Bounded fix or non-runtime tweak | `$superflow-hotfix` / `$superflow-tweak`; satisfy their admission |
| Database/shared-table/status reverse impact | `$superflow-table-impact-analysis` within the current phase |
| Verified, authorized lifecycle closeout | `$superflow-archive` |

## Contracts, verification and continuity

Original sources/user confirmation → frozen spec/API/design/tests → project rules
→ execution navigation → runtime evidence. Each decision has one canonical owner.
Conflicts return to that phase for prose and consumer-reference repair, followed
by refreshed handoff, review and readiness. Priorities, manually rebound hashes
or receipts do not resolve contradictory current prose. Documents freeze business
HOW; Prompts navigate it. Before tests, implementation or acceptance actually read
the full [test-guide.md](references/test-guide.md). Start the first SDD build/case
verification at [Runner-Captured Execution](references/test-guide.md#runner-captured-execution):
prepare plans from the guide, preflight with
`superflow verify <change> --execution-plan <plan>`, then explicitly `--run`;
Case capture uses `--sync-report` for the same current ledger. Scripts generate
receipts/build fingerprints. Use frozen cases and real entries;
mocks, plans, handwritten PASS, hashes and checkboxes do not prove real acceptance.

Ordinary work follows Flow Owner through progress reports and repairable failures.
The Reviewer checklist owns readable diffs/both source versions, actual dispatch,
identity, disposition and rereview. Distinguish fixed, mitigated, authorized deferred
and not-a-defect outcomes with evidence. Missing mandatory evidence/rereview remains
PARTIAL/Blocked. Stop dependent work only at actual decisions, unavailable required
permissions/environment, user pause, explicit manual boundaries or existing stalled
repair limits. Preserve recovery; exited sessions cannot promise background work.
Delivery reconciles goals, implementation, evidence scope/counts, open items,
external coordination and rereview. Count control actions separately.

For implementation from existing documents, follow [current Owner document continuation](references/flow-owner.md#existing-document-implementation)
through contract repair, independent review and Coding Ready before build.

## Document Delivery Exit

OpenSpec applyRequires only completes base artifacts. Full document requests
continue under the same authorization through `$superflow-contracts` →
`$superflow-design` → `$superflow-handoff`. Before claiming Coding Ready actually run
`superflow check <change> --level coding-ready`, inspect the exit status and current
`.sdd/readiness/coding-ready.json`. Failure means `Blocked for docs`; repair through
the owning phase. Docs-only work stops after document delivery. Admitted implementation
continues through build's receipt check; contract drift requires document refreezing.
Readiness alone is not coding authorization.

## Explicit managed work

Perform Host semantic routing: docs-only requests stay in document phases. For
explicit managed work read [managed-work.md](references/managed-work.md), check
`superflow_managed_runtime`, and pass the original request/skill commands/document
paths to `superflow_managed_start`. New omitted/auto profiles default to native,
retaining native capabilities, configuration and approvals. Pass model/effort only
when selected; leave budgets unset (0 unlimited), respecting each positive limit.
Explicit profiles follow current contracts; SDD admission/continuation grants no legacy
READY exemption. Read their
managed sections in the detailed routing reference. Host owns goals/semantic review,
Executor development and Runner deterministic state/facts. Ordinary Owners may code;
managed Host read-only boundaries do not apply to them. No nested supervision; use
MCP wait and require explicit review pass for delivery.

## Maintaining Superflow itself

First read `docs/superflow-cli-design-principles.en.md` and
`docs/superflow-cli-evaluation-framework.en.md` fully. Identify the owner layer,
then record baseline, hypothesis, cases, results and rollback conditions. Managed
changes also require their charter/protocol. Synchronize languages and Codex/Claude.
Existing scripts own state/deterministic gates; Agents own semantic judgments.
