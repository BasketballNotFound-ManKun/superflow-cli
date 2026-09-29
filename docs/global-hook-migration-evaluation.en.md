# Evaluation: global legacy Hook migration

## Evidence and owner

Codex `Stop` registered both the old relative
`bash scripts/hooks/stop-compile-check.sh` and the current
`superflow-java-stop-hook.sh`. The former is absent in operator-api and can
exit 127. The 0.5.14 project migration does not touch global config. The
current global Codex and Claude configs held 12 and 17 known old relative
registrations. Some other projects still contain those scripts; global removal
is therefore an explicit capability tradeoff, not proof that every project is
missing them. The user chose the global Superflow Hooks as authoritative and
accepted that the old global registrations would stop firing elsewhere.

The existing Hook migration CLI owns this fix. No new Hook, Skill, or install
state is introduced. Normal `update` does not silently remove global entries
of uncertain provenance. Only an explicit `--scope global --apply` writes the
two home-directory configs after a read-only audit.

## Cases and observed results

| Case | Expected and observed |
|---|---|
| Twelve Codex and seventeen Claude allowlisted commands | Global audit listed them; none remained after apply |
| Similar command with custom arguments or unknown script | Preserved by exact matching |
| Both hosts and a project config coexist | Only the selected host's global file changed; project bytes stayed intact |
| Repeated migration | Second apply returned `changed=false` without another write or backup |
| Symlinked or damaged config | Existing safe read path rejects migration |

The explicit local migration backed up `~/.codex/hooks.json` and
`~/.claude/settings.json` and removed only the 29 allowlisted registrations.
Seventeen other Codex and eighteen other Claude Hooks remain. Both second
applies were no-ops. Hosts must restart to reload the new Hook definitions.
Full regression passed: **95 files and 656 tests**, plus build, ESLint, both
design gates, and `skill-audit --strict`. One run's duration is not a trend.
The migration adds no runtime Hooks and removes attempts to invoke missing
global relative scripts.

Risk: projects that relied on the old global AKE registrations will no longer
receive them; project-owned config remains unchanged. Roll back from the
same-directory `.superflow-migrate-*.bak` file and restart the host. Stop
release if matching deletes a custom command, backup fails, scope leaks, or
a repeated apply rewrites config.

## 0.5.16 install and update closure

Version 0.5.15 exposed explicit migration only. This machine was cleaned, but
ordinary installs and updates on other machines still retained old global
registrations. To meet the user's requirement that others avoid the same 127,
global npm postinstall, init, resumed init, and update now invoke the same
allowlisted migration. Project-scoped operations also check the
selected host's global config because global Hooks still fire in projects.
Unknown and custom registrations remain. Migration failure makes install or
update fail rather than reporting success.

Isolated HOME fixtures cover global npm install, global/project init, resume,
global/project update, repeated update, `--no-hooks`, and damaged config,
checking cleanup, backup, custom
preservation, idempotence, and fail-closed behavior. This machine's old entries
were already removed explicitly in 0.5.15, so the 0.5.16 automatic path should
be a no-op here. npm `--ignore-scripts` explicitly skips postinstall and requires
a later `superflow init/update`. Roll back automatic invocation if project scope
removes a custom Hook, damaged config reports success, or `--no-hooks` still edits Hooks;
retain backups for recovery.
A real `npm install -g --prefix <temporary directory>` of the 0.5.16 tarball
under an isolated HOME also removed both hosts' old `stop-compile-check.sh`
registrations, retained custom Hooks, made one backup per host, and installed
a CLI reporting 0.5.16. Final full regression passed **96 files and 666 tests**;
build, ESLint, design gates, and `skill-audit --strict` passed.
