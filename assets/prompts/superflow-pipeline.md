---
description: Run the SuperBridge Flow router
argument-hint: requirement or change description
---

Use the `superflow-pipeline` skill for this request.

Route the work through the correct SuperBridge Flow phase. OpenSpec owns WHAT
and contracts; Superpowers owns source-level HOW. Preserve handoff state and run
the required SuperBridge Flow guards before phase transitions.

When the request has unresolved decisions that need owner intent, competing
approaches, unclear source of truth, unclear acceptance behavior, or cross-system
responsibility, enter the embedded deep-clarification mode of
`superflow-clarify`. Investigate repository-verifiable facts first, then ask one
decision question at a time with a recommended answer and consequence. Keep the
decision record in the existing brainstorm handoff. Do not require the user to
invoke another command, and do not use this mode for a clear bounded change.

Input: treat the argument after `/superflow-pipeline` as the requirement,
document path, or change description.
