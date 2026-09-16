import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

/**
 * Superflow runtime state is resumable working data, not a deliverable.
 * Projects keep the task directory out of Git by default so a normal
 * `git status` reflects the user's changes instead of orchestration noise.
 * The rule is additive and idempotent; user-authored ignore content is never
 * rewritten or removed.
 */
export function ensureSuperflowGitignore(projectRoot: string): void {
  const file = path.join(projectRoot, ".gitignore");
  const existing = existsSync(file) ? readFileSync(file, "utf-8") : "";
  if (superflowIgnorePresent(existing)) return;
  const separator = existing.length === 0 ? "" : existing.endsWith("\n") ? "" : "\n";
  const header =
    existing.length === 0
      ? "# Superflow managed-task runtime state (resumable; not a deliverable)\n"
      : "\n# Superflow managed-task runtime state (resumable; not a deliverable)\n";
  writeFileSync(file, `${existing}${separator}${header}.superflow/\n`);
}

function superflowIgnorePresent(content: string): boolean {
  return content
    .split(/\r?\n/)
    .some((line) => /^\s*\.superflow\b/.test(line));
}
