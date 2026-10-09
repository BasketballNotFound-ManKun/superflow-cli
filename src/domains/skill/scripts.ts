import {
  promises as fs,
  existsSync,
  readFileSync,
  lstatSync,
  copyFileSync,
  writeFileSync,
  renameSync,
  chmodSync,
  unlinkSync,
  constants,
} from "fs";
import { hashFile } from "../../platform/fs.js";
import { getManifest } from "../config/manifest.js";
import path from "path";
import type { Agent } from "../../types.js";

export interface DeployScriptsOptions {
  agent?: Agent;
  skipExisting?: boolean;
}

export async function deployScripts(
  scriptNames: string[],
  assetsDir: string,
  scriptsDir: string,
  options: DeployScriptsOptions = {},
): Promise<void> {
  await fs.mkdir(scriptsDir, { recursive: true });

  for (const name of scriptNames) {
    const source = path.join(assetsDir, name);
    const dest = path.join(scriptsDir, name);
    try {
      if (options.skipExisting) {
        await fs.access(dest);
        continue;
      }
    } catch {
      // file does not exist; continue with deployment
    }
    try {
      if (lstatSync(dest).isSymbolicLink())
        throw new Error(
          `Preserve custom script symlink: ${dest}; review ownership before updating`,
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (shouldRewriteScript(source)) {
      const content = await fs.readFile(source, "utf-8");
      await fs.writeFile(
        dest,
        rewriteScriptContent(content, options.agent ?? "codex"),
        "utf-8",
      );
    } else {
      await fs.cp(source, dest, { recursive: false, force: true });
    }
    await fs.chmod(dest, 0o755);
  }
  syncLegacyScriptAliases(assetsDir, scriptsDir, options.agent ?? "codex", {
    targets: scriptNames,
    skipExisting: options.skipExisting,
  });
}

function shouldRewriteScript(file: string): boolean {
  return /\.(sh|py|js|json|md)$/i.test(file);
}

export function rewriteScriptContent(content: string, agent: Agent): string {
  if (agent === "codex") return content;
  return content
    .replaceAll("$HOME/.codex/hooks", "$HOME/.claude/scripts")
    .replaceAll("~/.codex/hooks", "~/.claude/scripts")
    .replaceAll("~/.codex/skills", "~/.claude/skills")
    .replaceAll("$HOME/.codex/skills", "$HOME/.claude/skills")
    .replaceAll("codex-auto-backup-hook.sh", "claude-auto-backup-hook.sh");
}

export function scriptMatchesPackage(
  assetsDir: string,
  scriptsDir: string,
  name: string,
  agent: Agent,
): boolean {
  try {
    const source = path.join(assetsDir, name);
    const target = path.join(scriptsDir, name);
    if (
      !existsSync(source) ||
      !existsSync(target) ||
      !lstatSync(target).isFile()
    )
      return false;
    if (process.platform !== "win32" && !(lstatSync(target).mode & 0o111))
      return false;
    const expected = shouldRewriteScript(source)
      ? Buffer.from(rewriteScriptContent(readFileSync(source, "utf8"), agent))
      : readFileSync(source);
    return expected.equals(readFileSync(target));
  } catch {
    return false;
  }
}

export interface LegacyAliasFinding {
  alias: string;
  target: string;
  status: "missing" | "delegated" | "legacy" | "custom";
  targetCurrent: boolean;
  executable: boolean;
  backup?: string;
}

function compatibilityScript(alias: string, target: string): string {
  const marker = `# Superflow managed compatibility v1: ${alias} -> ${target}`;
  if (alias.endsWith(".py"))
    return `#!/usr/bin/env python3
${marker}
import os
import sys
from pathlib import Path
target = Path(__file__).resolve().with_name(${JSON.stringify(target)})
if not target.is_file():
    sys.stderr.write("Superflow compatibility target missing; run superflow update\\n")
    raise SystemExit(2)
os.execv(sys.executable, [sys.executable, str(target), *sys.argv[1:]])
`;
  return `#!/bin/sh
${marker}
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" || exit 2
TARGET="$SCRIPT_DIR/${target}"
if [ ! -x "$TARGET" ]; then
    echo "Superflow compatibility target missing; run superflow update" >&2
    exit 2
fi
exec "$TARGET" "$@"
`;
}

export function auditLegacyScriptAliases(
  assetsDir: string,
  scriptsDir: string,
  agent: Agent,
): LegacyAliasFinding[] {
  return Object.entries(getManifest().legacyScriptAliases ?? {}).map(
    ([alias, definition]) => {
      const file = path.join(scriptsDir, alias);
      let status: LegacyAliasFinding["status"] = "missing";
      if (existsSync(file)) {
        status =
          lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()
            ? "custom"
            : readFileSync(file, "utf8") ===
                compatibilityScript(alias, definition.target)
              ? "delegated"
              : definition.knownHashes.includes(hashFile(file))
                ? "legacy"
                : "custom";
      }
      return {
        alias,
        target: definition.target,
        status,
        executable:
          existsSync(file) &&
          (process.platform === "win32" ||
            Boolean(lstatSync(file).mode & 0o111)),
        targetCurrent: scriptMatchesPackage(
          assetsDir,
          scriptsDir,
          definition.target,
          agent,
        ),
      };
    },
  );
}

export function syncLegacyScriptAliases(
  assetsDir: string,
  scriptsDir: string,
  agent: Agent,
  selection: { targets?: string[]; skipExisting?: boolean } = {},
): LegacyAliasFinding[] {
  const findings = auditLegacyScriptAliases(assetsDir, scriptsDir, agent);
  for (const finding of findings) {
    if (selection.targets && !selection.targets.includes(finding.target))
      continue;
    if (selection.skipExisting && finding.status !== "missing") continue;
    if (
      !finding.targetCurrent ||
      finding.status === "custom" ||
      (finding.status === "delegated" && finding.executable)
    )
      continue;
    const file = path.join(scriptsDir, finding.alias);
    if (finding.status === "delegated") {
      chmodSync(file, 0o755);
      finding.executable = true;
      continue;
    }
    if (finding.status === "legacy") {
      finding.backup = `${file}.superflow-migrate-${Date.now()}.bak`;
      copyFileSync(file, finding.backup, constants.COPYFILE_EXCL);
    }
    const temporary = `${file}.superflow-migrate-${process.pid}.tmp`;
    try {
      writeFileSync(
        temporary,
        compatibilityScript(finding.alias, finding.target),
        { flag: "wx", mode: 0o755 },
      );
      chmodSync(temporary, 0o755);
      renameSync(temporary, file);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    finding.status = "delegated";
    finding.executable = true;
  }
  return findings;
}
