import { promises as fs } from 'fs';
import path from 'path';
import type { Agent } from '../../types.js';

export interface DeployScriptsOptions {
  agent?: Agent;
  skipExisting?: boolean;
}

export async function deployScripts(
  scriptNames: string[],
  assetsDir: string,
  scriptsDir: string,
  options: DeployScriptsOptions = {}
): Promise<void> {
  await fs.mkdir(scriptsDir, {recursive: true});

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
    if (shouldRewriteScript(source)) {
      const content = await fs.readFile(source, 'utf-8');
      await fs.writeFile(dest, rewriteScriptContent(content, options.agent ?? 'codex'), 'utf-8');
    } else {
      await fs.cp(source, dest, {recursive: false, force: true});
    }
    await fs.chmod(dest, 0o755);
  }
}

function shouldRewriteScript(file: string): boolean {
  return /\.(sh|py|js|json|md)$/i.test(file);
}

function rewriteScriptContent(content: string, agent: Agent): string {
  if (agent === 'codex') return content;
  if (agent === 'opencode') {
    return content
      .replaceAll('$HOME/.codex/hooks', '$HOME/.opencode/scripts')
      .replaceAll('~/.codex/hooks', '~/.opencode/scripts')
      .replaceAll('~/.codex/skills', '~/.opencode/skills')
      .replaceAll('$HOME/.codex/skills', '$HOME/.opencode/skills')
      .replaceAll('codex-auto-backup-hook.sh', 'opencode-auto-backup-hook.sh');
  }
  return content
    .replaceAll('$HOME/.codex/hooks', '$HOME/.claude/scripts')
    .replaceAll('~/.codex/hooks', '~/.claude/scripts')
    .replaceAll('~/.codex/skills', '~/.claude/skills')
    .replaceAll('$HOME/.codex/skills', '$HOME/.claude/skills')
    .replaceAll('codex-auto-backup-hook.sh', 'claude-auto-backup-hook.sh');
}
