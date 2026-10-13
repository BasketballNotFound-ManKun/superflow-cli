# Pure OpenSpec archive

Run only when the exact target directory has no `.sdd/state.yaml`. If it exists, return to the main skill's SDD gates; this procedure cannot bypass them.

1. Resolve the change name from the request or current context. If ambiguous, run `openspec list --json` and ask the user to select; never archive another change by guessing.
2. Run `openspec status --change <name> --json` and inspect `tasks.md`. Collect unfinished artifacts and tasks; proceed only if the user explicitly accepts those boundaries.
3. Compare `openspec/changes/<name>/specs/` with `openspec/specs/` and show additions, modifications, removals, and renames. Skipping spec merging requires an explicit user choice.
4. Reuse existing archive authorization. If absent, show completion status, merge scope, and archive destination before asking for confirmation.
5. Run `openspec archive <name> --yes`. Only when the user explicitly skips spec merging, use `openspec archive <name> --yes --skip-specs`. Do not use `--no-validate` or fall back to `mv` after CLI failure.
6. Confirm the exact archived directory from CLI output and inspect `.openspec.yaml`, tasks, and merged specs. Do not move it again after successful CLI archive or create an SDD state file.
7. Report the change, archive location, merge status, and accepted incomplete boundaries. Do not automatically commit, push, or publish.
