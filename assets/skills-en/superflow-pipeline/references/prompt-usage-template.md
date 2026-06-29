# AI Prompt Usage Record Template

Use this template when a project needs to record prompts, outputs, adoption
status, and human edits for delivery review or retrospective analysis.

## Format

Create one entry per prompt in chronological order.

```markdown
# AI Prompt Usage Record

## Entry N

### Time

YYYY-MM-DD HH:mm

### Context

Describe the current problem and workflow phase.

### Original Prompt

Paste the full prompt.

### AI Output Summary

Summarize the useful output in 2-3 sentences.

### Adoption

- [x] Adopted directly
- [ ] Partially adopted after edits
- [ ] Rejected and replaced by another prompt or manual solution

### Human Edits

If partially adopted, list the changes:

1. Changed ____ because ____.
2. Removed ____ because ____.
3. Added ____ because ____.

### Verification

Record how the output was verified, such as build, tests, review, real API call,
database check, or manual acceptance.

### Lessons

If the output was wrong or incomplete, record why and how to avoid it next time.
```
