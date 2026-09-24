---
name: superflow-quick-dev
description: Fast admission and Quick Spec for small code tasks. Stop and switch to formal SDD when intent, seam, or blast radius is unclear.
license: MIT
metadata:
  author: superflow
  version: '1.0'
---

# Superflow Quick Dev

Accept only one low-blast-radius code task that follows an existing seam.

## Narrow gate

Inspect current source, callers, and tests, then run
`superflow quick "<request>" --json --path <changed-files...> --seam <existing-file>`.
Pass `--active-sdd` only after confirming an active SDD change owns the **same
behavior**; reusing its code or depending on its output is insufficient. Continue only
when it returns `QUICK`. Public APIs, databases/migrations, transactions,
concurrency, locks, permissions, security, payments, cross-module work, active
SDD changes, or a non-exclusive worktree must return `STOP` and switch to
`superflow-clarify`. If ake-harness's `ssd-propose` is also visible, do not
route there merely because it is installed. Switch to ake SSD only when the
user explicitly chooses that workflow.

## Quick Spec

Write and show the current disk version at
`.sdd/tasks/<YYYY-MM-DD>-<slug>/spec.md` with Intent / Non-goals, current and
target behavior, confirmed test seam, ordered implementation steps, Given /
When / Then acceptance, risks, escalation conditions, deferred work, baseline
commit, and exact file scope.

Do not edit runtime code before approval. After explicit approval of the current
disk version, run `superflow quick "<request>" --path <files...> --seam <existing-file> --spec <spec> --approve`.
The CLI binds the approval to the current content digest. If Intent, Non-goals, or Acceptance
Criteria change, return to `draft` and obtain approval again. Use TDD and
verification-loop RED/GREEN signals, then close with `superflow review-coverage`
and `superflow eval` evidence.

Quick work creates no OpenSpec checkpoint and never commits, pushes, or releases.
When scope expands, keep the spec as a lead and switch to formal SDD.
