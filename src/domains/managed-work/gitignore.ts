import { existsSync, lstatSync, readFileSync, writeFileSync } from "fs";
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
  if (lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error("Refusing to modify a symlinked .gitignore");
  }
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
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const lastRule = lines.filter((line) => line && !line.startsWith("#")).at(-1);
  return lastRule !== undefined && /^\/?\.superflow\/?$/.test(lastRule);
}
