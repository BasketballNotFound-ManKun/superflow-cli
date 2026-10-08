# Execution evidence fix evaluation

## Evidence and responsibility

Version 0.5.16 accepted an empty evidence file and an inaccessible URL (both exit 0). The new initial regression suite observed 13 failures/2 passes before the fix. Read-only incident review confirmed a Service argument assignment missing from the actually called Mapper statement, an incorrect implementation claim, mock/placeholder counts, and evidence from a different service entry. Historical state was implement/pending, not full integration PASS. Unknown, unimplemented required, and empty case selections all returned PASS=0/FAIL=0/SKIP=0 with exit 0. No private source, invoice data or credentials are included here.

## Hypothesis and design

Extend existing coverage, report table, lint, verify guard, preflight/final gate and installer. Do not add parallel Skills, Hooks, state machines or Agent protocol versions. Require execution-receipt.v1, unique raw case events, successful commands, executed counts, source/build/runtime identity and frozen persistence comparisons. Keep legacy evidence PARTIAL. Host independently checks exact statements, old-event/new-request isolation, evidence applicability and sufficiency. Hashes are not authenticity guarantees.

The anonymous replay uses two actual local HTTP services sharing a temporary SQLite database, explicit controlled-simulation evidence, successful builds and source/runtime identity. Complete writes pass the actual runChangeGuard path; one omitted write and entry substitution fail. It does not replace the incident task's required real MySQL acceptance. No business environment was contacted.

## Verification and boundaries

Run full tests, build/design gates, lint, strict Skill audit, npm package content checks, installed Codex/Claude scripts, repeated deployment and preservation of custom assets. Record final commands and counts in the Chinese companion. No comparable timing/token baseline exists; do not claim universal cost improvement or framework certification.

Roll back on rejection of valid receipts, installation source drift or damaged historical recovery. Preserve evidence and repair the appropriate layer; never weaken frozen business assertions. npm authentication/release closure must be reported separately from local success.
