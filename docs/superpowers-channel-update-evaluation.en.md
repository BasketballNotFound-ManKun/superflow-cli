# 0.5.11: Superpowers channel migration and dependency update evaluation

## Evidence and ownership

Version 0.5.10 used the retired openai-api-curated channel and local configuration to
infer enablement. Official 6.4.1 still contains all three required skills. Its new
channel is openai-curated-remote, and native enabled state is not necessarily stored
in config.toml. Old cached files do not prove the active plugin is healthy.
This belongs to host adaptation and installation/update closure, not business
contracts, managed state transitions, or relaxed verification requirements.

## Baseline, hypothesis, and reuse

- Baseline: 0.5.10 passed 80 files / 577 tests, while three real doctor checks failed.
- Reuse the dependency module, update command, Hook, and failure aggregation.
- Native catalog discovery, official-channel filtering, and active-version file
  verification should eliminate incorrect detection.
- Install the CLI first, then let that runtime update dependencies; old processes
  and shadowing PATH shims must not retain outdated compatibility rules.

## Cases and results

- Initial red tests exposed missing channel selection; targeted tests passed after implementation.
- Enabled remote installation without a config.toml section passes native inspection.
- Installed-only catalog entries remain upgradable when available is empty.
- Third-party namesakes, prereleases, downgraded results, and unverified already-installed messages fail.
- Missing current-version skills and unavailable native inventory cannot borrow stale cache evidence.
- Claude installation is followed by plugin update; simulated only, without changing user Claude skills.
- Package updates and daily apply hand dependency ownership to the new CLI; failures propagate and do not retain success stamps.
- Real installation and repeat upgrade confirmed Superpowers 6.4.1 and all three skills.
- Final full suite passed 81 files / 585 tests, including installed-only upgrade coverage; lint and build passed.
- Live dependency update succeeded, updating the global OpenSpec package to 1.13.1; all doctor checks passed.

## Scope, conclusion, and rollback

Daily policy remains check by default: npm version checks and plugin refresh hints.
Only apply or explicit dependency updates actually upgrade OpenSpec, Superpowers,
and Superflow assets. No silent switch to background mutation was introduced.
Help and installation instructions are bilingual. Codex live verification and
Claude simulation are not equivalent to live cross-host verification.
No charging-platform business code or managed protocol changed; no business-bug
fix or new Agent semantic-quality benchmark is claimed.

If native inventory or installation layout changes, fail explicitly and repair the
adapter. Do not fall back to directory-existence success or skip required skills.
Rollback the CLI if necessary while preserving installed plugins and diagnostic evidence.
