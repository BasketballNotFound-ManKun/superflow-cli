import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { deployScripts } from '../../src/domains/skill/scripts.js';

const TMP = path.join(os.tmpdir(), 'sdd-test-scripts-' + Date.now());
const TMP_SCRIPTS = path.join(TMP, '.claude', 'scripts');
const TMP_ASSETS = path.join(TMP, 'assets', 'scripts');

describe('core/scripts', () => {
  beforeEach(async () => {
    await fs.promises.mkdir(TMP_SCRIPTS, {recursive: true});
    await fs.promises.mkdir(TMP_ASSETS, {recursive: true});
    await fs.promises.writeFile(
      path.join(TMP_ASSETS, 'test.sh'),
      '#!/bin/bash\nHOOK="$HOME/.codex/hooks/codex-auto-backup-hook.sh"\n'
    );
  });

  afterEach(async () => {
    await fs.promises.rm(TMP, {recursive: true, force: true});
  });

  it('deployScripts 复制 1 个脚本到目标', async () => {
    await deployScripts(['test.sh'], TMP_ASSETS, TMP_SCRIPTS);
    expect(fs.existsSync(path.join(TMP_SCRIPTS, 'test.sh'))).toBe(true);
  });

  it('deployScripts 设置可执行权限', async () => {
    await deployScripts(['test.sh'], TMP_ASSETS, TMP_SCRIPTS);
    const stat = fs.statSync(path.join(TMP_SCRIPTS, 'test.sh'));
    // mode 包含 x bit
    expect(stat.mode & 0o111).not.toBe(0);
  });

  it('deployScripts 部署到 Claude 时改写 Codex hook 路径', async () => {
    await deployScripts(['test.sh'], TMP_ASSETS, TMP_SCRIPTS, { agent: 'claude' });
    const content = fs.readFileSync(path.join(TMP_SCRIPTS, 'test.sh'), 'utf-8');
    expect(content).toContain('$HOME/.claude/scripts/claude-auto-backup-hook.sh');
    expect(content).not.toContain('$HOME/.codex/hooks');
  });

  it('deployScripts 部署到 OpenCode 时改写 Codex hook 路径', async () => {
    await deployScripts(['test.sh'], TMP_ASSETS, TMP_SCRIPTS, { agent: 'opencode' });
    const content = fs.readFileSync(path.join(TMP_SCRIPTS, 'test.sh'), 'utf-8');
    expect(content).toContain('$HOME/.opencode/scripts/opencode-auto-backup-hook.sh');
    expect(content).not.toContain('$HOME/.codex/hooks');
  });
});
