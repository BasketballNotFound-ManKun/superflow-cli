# SDD Decision Point

Use this when an SDD phase needs a human decision before continuing.

## Required Format

Write a short decision block in the relevant SDD document or reply:

```md
## Decision Point

- phase: docs|implement|verify|archive
- decision_needed: <one concrete decision>
- options:
  - A: <option and consequence>
  - B: <option and consequence>
- recommended: <A|B>
- blocked_until: user confirms the decision
- state_command: `superflow-state.sh set <change-dir> build_pause plan-ready`
```

## Rules

- Ask for a decision only when the next action changes scope, API/DB contract,
  implementation strategy, verification boundary, or archive closeout.
- Do not ask open-ended questions when a recommended option can be stated.
- Record the decision in `design.md`, `sdd-quality-gate.md`, `test-report.md`,
  or the implementation prompt, depending on the phase.
- After confirmation, update `.sdd/state.yaml` with the selected field and
  rerun the current phase guard.
