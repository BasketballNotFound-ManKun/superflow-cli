# SDD Project Config

Use project-level `.sdd/config.yaml` for defaults that should apply to all SDD
changes in the repo.

## Supported Fields

```yaml
auto_transition: true        # true|false
context_compression: off     # off|beta
review_mode: standard        # off|standard|thorough
```

## Precedence

Runtime scripts resolve configuration in this order:

1. Environment variable:
   - `SUPERFLOW_REVIEW_MODE`
   - `SDD_AUTO_TRANSITION`
   - `SDD_CONTEXT_COMPRESSION`
   - `SDD_REVIEW_MODE`
2. Change-local config: `<change-dir>/.sdd/config.yaml`
3. Project config: `<repo-root>/.sdd/config.yaml`
4. Existing state value when applicable
5. Script default

## Rules

- Use `auto_transition: false` when the user wants manual review between SDD
  phases.
- Use `context_compression: beta` for large changes, long sessions, multi-agent
  work, or repeated context compression risk.
- Use `review_mode: standard` for normal full workflow. Use `thorough` when the
  change touches API contracts, database fields, cross-repo behavior, third-party
  integrations, or production-like verification. Use `off` only for hotfix/tweak
  flows or explicitly documented low-risk work.
- Beta handoff keeps `api.md`, `spec.md`, and `tests.md` projected while
  supporting docs are referenced by hash. If a supporting detail is needed,
  read the original source file.
