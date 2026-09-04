# Managed Delivery Loop

Superflow managed delivery is a bounded engineering loop for one Host Agent
and one peer Executor Agent. It accepts either a direct development task or a
frozen Superflow / SDD contract.

## The loop

```text
input → peer implements and verifies → Host review
                                      ├─ needs_fix → peer repair ↺
                                      └─ pass → delivery-ready state
```

The peer does not decide its own release. The Host does not silently edit the
peer's implementation. Superflow persists the task contract, evidence,
findings, and state between each step.

## What drives another loop

The Host reviews the frozen contract, workspace changes, deterministic gates,
and the evidence required by the task. A structured `needs_fix` result returns
the concrete findings to the peer together with the valid prior evidence. The
peer resumes from the current workspace and repairs the named issue.

The loop terminates when the Host returns `pass`, a bounded budget is reached,
a safety block requires human input, or the user pauses the task.

## Ownership

| Responsibility | Owner |
| --- | --- |
| Freeze task and record deterministic state | Superflow Runner |
| Change source, start services, run verification | Peer Executor |
| Judge correctness, adequacy, and delivery evidence | Current Host |
| Approve Git, deployment, or production writes | User |

## Boundaries that matter

- The default budget is 5 Host reviews, 7 peer invocations, and 12 total Agent
  calls. It avoids an unbounded token loop.
- Completed work can reach `local_delivery_ready`,
  `environment_validation_blocked`, or `release_ready`, depending on the
  structured task categories and signed evidence.
- `release_ready` is a delivery decision, not permission to commit, push,
  publish, deploy, execute SQL, or write production data.
- The runner stores snapshots, hashes, journals, findings, and inherited
  evidence so a repair or recovery does not start from an empty context.

For the protocol fields and state-machine details, see
[Managed Agent Protocol](./managed-agent-protocol.en.md) and
[Managed Work Design Principles](./managed-work-design-principles.en.md).
