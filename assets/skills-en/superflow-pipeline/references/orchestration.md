# Workflow Orchestration

Inherit verification only from tests.md and read [test-guide.md](test-guide.md).
Apply startup, API, DB, and team checklists to frozen applicable cases; give source
reasons for inapplicability, keeping missing required environments blocked. Reuse
healthy instances matching the tested build; load new code/configuration before
verification. Independently inspect raw evidence; implementers rerun invalidated
or contract-required paths, not every environment merely because roles changed.

SuperBridge Flow is a stateful orchestrator, not just a set of installed skills.

## Ownership

- OpenSpec/SDD: WHAT and contract.
- Superpowers: HOW and source-level execution.
- Handoff/state files: deterministic memory across sessions.
- Guard scripts: phase readiness and delivery integrity.

## Loop

1. Read state and handoff.
2. Execute the current phase skill.
3. Write artifacts.
4. Refresh handoff when docs change.
5. Run guard.
6. Transition state only after guard passes.

## Anti-Drift Rule

Conversation summary is never the source of truth. Reload files after every
context compression, new terminal, new worktree, or agent handoff.
