# Managed Work Rules

Managed work is built into `superflow-pipeline`. The user only says to use
Superflow and provides an implementation prompt, change directory, or direct
task. Direct tasks receive a minimal contract. SDD work freezes the generated
implementation prompt and never substitutes `tasks.md` for the execution prompt.

Always dispatch through:

```bash
superflow pipeline "<implementation-prompt|change-dir|task>" --managed --project "<root>" \
  --supervisor <codex|claude> --executor <claude|codex>
```

The command always starts the independent background service and follows the
local event journal to a terminal state. Losing the follower does not stop the
task. After return, the current agent reads the report and summarizes it in the
original conversation.

Hard gates:

- Claim the 5/7/12 budgets before an Agent call.
- Revalidate the frozen contract hash, non-overridable permissions, and 5/7/12 hard limits on every start and resume. Fail closed if persisted contract data changed.
- Resolve change directories through `.sdd/state.yaml` `implementation_prompt`; treat `tasks.md` as a checklist only. Copy the prompt into a managed snapshot and freeze its SHA-256 for both agents.
- Persist and resume exact supervisor and executor session IDs.
- Treat `progress.jsonl`, the task contract, review results, and evidence as truth.
- Executor cannot edit managed state or commit, push, publish, deploy, or bypass sandbox.
- Supervisor cannot modify target files.
- Non-zero exits, invalid JSON, missing session IDs, and review-time workspace drift block pass.
- Engineering and SDD tasks need successful command evidence from at least two categories among build, test, and runtime/real invocation. Compile-only or unit-test-only delivery cannot enter formal review.
- Run `superflow-managed-work-check.mjs <root> <task-id>` before delivery-ready.
- Append the single `run.delivery_ready` event only after the integrity script passes. On failure, require human attention without leaving false delivery-ready evidence.
- A passing run waits for explicit Git approval.
