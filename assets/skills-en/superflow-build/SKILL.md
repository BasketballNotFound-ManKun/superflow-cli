---
name: superflow-build
description: Implement tasks from an OpenSpec change. Use when the user wants to start implementing, continue implementation, or work through tasks.
license: MIT
metadata:
  requires: openspec CLI
  author: openspec
  version: "1.0"
  generatedBy: "1.3.1"
---

# Build one verifiable capability at a time

The current Flow Owner implements authorized work and runs its signals. [Flow Owner](../superflow/references/flow-owner.md) owns continuity and recovery; [test-guide](../superflow/references/test-guide.md#owner-led-test-planning) owns signal selection and evidence; [Reviewer checklist](../superflow/references/reviewer-checklist.md) owns independent review. Read each branch when it is needed, rather than preparing final review paperwork before the first working slice.

## 1. Read the current work

Select the explicit change, or resolve ambiguity before acting. For a Superflow change run:

```sh
superflow implement <change> --instructions --json
```

This read-only snapshot returns the task frontier, original task lines, declared Delivers/Verify/Case references, canonical paths and admission/resume commands. It neither grants permission nor marks business work complete. Read the returned contextFiles (the existing manifest dynamically lists specs, requirement sources and declared technical design), then the selected task, the main Prompt's canonical links, current tests and recovery evidence. Follow original paths; do not guess native OpenSpec workspace paths or substitute another change.

Before the first edit or dispatch run `superflow check <change> --level coding-ready`. Resume an admitted implementation with the returned `superflow-review-coverage.mjs <change-dir>` command, without `--check-sources`. Missing or stale contracts remain `Blocked for docs` and return to the existing document owner via [Document Delivery Exit](../superflow/SKILL.md#document-delivery-exit); source edits alone do not require strict document re-admission. A snapshot or OpenSpec readiness never overrides this gate. Existing document intake follows [document-readiness](../superflow/references/document-readiness.md#existing-contract-intake).

## 2. Close a runnable slice

Choose a dependency-ready task by its observable capability and frozen verification, not its technical layer. Resolve missing dependency or signal references from the canonical contract. Do not invent an execution order or drop required branches. If the approved batch is too broad, complete its smallest runnable path and required signals before widening implementation; keep incomplete tasks unchecked.

Run native verification according to the selected tdd_mode and applicable signals. When RED/GREEN applies, inspect the actual failure before implementation and rerun affected signals. Document-only work and tdd_mode: off do not require RED merely because of this guidance; original mandatory signals still apply. Keep business assertions in native tests; provenance wrappers attach identities to real observations, not a second implementation of business expectations. The [first verification chain](../superflow/references/test-guide.md#first-verification-action) is prepared with the first applicable slice. Repair ordinary failures within authorization, then continue; do not postpone all runtime checks until horizontal layers are finished.

For capture, reuse the existing ordered plan interface:

```sh
superflow verify <change> --execution-plan build-plan.json case-plan.json --run --reuse-valid --sync-report
```

Use plans and commands frozen in the project contract. Preflight checks the whole sequence; explicit run executes it, stopping on failure. Reuse requires current validated raw evidence, sources, artifact, command and environment. Changed input reruns its affected scope; unknown output ownership remains an error. Original attempts stay immutable. Missing, skipped or failed required branches remain PARTIAL; method counts are not Case counts. Read [capture details](../superflow/references/test-guide.md#capture-boundaries-without-test-coupling) when integrating or diagnosing capture, not as a separate test framework to reinvent.

Mark a task complete only when its required signals hold. Re-read the work snapshot after integration. A process update is followed by the next authorized task, not a request to continue.

## 3. Review and deliver

When a readable diff and named risk exist, use the [Reviewer checklist](../superflow/references/reviewer-checklist.md), including its report shape, dispatch identity, source manifest and finding closure. Independent review may begin while other verification is being prepared. Implementation delegation is not independent review; inspect real returns and unresolved concerns. Preserve original findings, repair within scope, rerun affected signals and obtain actual re-review; do not rewrite reports or rebind old hashes.

Complete required integration/regression and reconcile tasks, Case branches, current evidence and resource cleanup. Keep `workflowPolicy: observed-delivery.v1`, actual `runner-captured.v1` receipts and current Independent Review / Reviewed Sources bindings. All implementation checkboxes complete still means verification and delivery remain: run the existing implement guard, read the actual next verify skill and run its CHECK commands. Follow [phase handoff and final package](../superflow/references/flow-owner.md#phase-handoff-and-final-package). No summary, copied evidence or green structural check replaces semantic acceptance.

## Continuity and stopping

Read [Owner-led delegation](../superflow/references/flow-owner.md#owner-led-delegation) at actual dispatch decisions. Shared files, test outputs and fixtures require isolation or sequential execution; waiting on a child does not justify repeated polling or preparing another copy of its context. Carry a compact recovery point in the existing report; valid evidence is reused.

Continue repairable errors and all dependency-ready authorized work. Pause dependent work only for user interruption, a real business decision, unavailable permission/environment/quota, explicit manual boundary or existing non-convergence limit. Preserve selected build_mode/isolation/tdd_mode/review_mode; never fall back from a failed Superflow gate to native OpenSpec. Git, archive and publishing follow their separate existing authorization.
