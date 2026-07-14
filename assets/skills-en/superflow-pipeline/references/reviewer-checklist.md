# Reviewer Checklist

- Does the implementation match api.md, design.md, and tests.md?
- Are all required files present and cross-linked?
- Is handoff_hash current and repeated in prompts/report?
- Did Superpowers technical design cover source-level HOW?
- Were field/status and architecture-boundary risks checked?
- For monetary changes, were calculation and settlement states separated, were
  scale and rounding mode explicit, and was early rounding rejected?
- Do half-cent, residual, and multi-detail tests prove deterministic allocation
  and reconciliation of original, discount, actual/refund, and allocated totals?
- Are SQL changes reviewed and tied to total version SQL when needed?
- Are RED/GREEN evidence and real-entry evidence present?
- Are mock-only results clearly labeled?
- Did workers stay inside allowed file boundaries?
- Did hooks and guard scripts pass?
