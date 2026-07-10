import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { deploySkill, listDeployedSkills } from '../../src/domains/skill/deploy.js';

const TMP = path.join(os.tmpdir(), 'sdd-test-skills-' + Date.now());
const TMP_SKILLS = path.join(TMP, '.claude', 'skills');
const TMP_ASSETS = path.join(TMP, 'assets', 'skills');

describe('core/skills', () => {
  beforeEach(async () => {
    await fs.promises.mkdir(TMP_SKILLS, { recursive: true });
    await fs.promises.mkdir(path.join(TMP_ASSETS, 'sdd-test-skill'), {recursive: true});
    await fs.promises.writeFile(
      path.join(TMP_ASSETS, 'sdd-test-skill', 'SKILL.md'),
      '# test\n\nRead ~/.codex/hooks before using Codex Hooks.\n'
    );
  });

  afterEach(async () => {
    await fs.promises.rm(TMP, {recursive: true, force: true});
  });

  it('deploySkill 从 assets 复制到 skills 目录', async () => {
    await deploySkill('sdd-test-skill', TMP_ASSETS, TMP_SKILLS);
    expect(fs.existsSync(path.join(TMP_SKILLS, 'sdd-test-skill', 'SKILL.md'))).toBe(true);
  });

  it('deploySkill 目标已存在时备份', async () => {
    await fs.promises.mkdir(path.join(TMP_SKILLS, 'sdd-test-skill'), {recursive: true});
    await fs.promises.writeFile(
      path.join(TMP_SKILLS, 'sdd-test-skill', 'SKILL.md'),
      '# old\n'
    );
    await deploySkill('sdd-test-skill', TMP_ASSETS, TMP_SKILLS);
    const backups = fs.readdirSync(TMP_SKILLS).filter(d => d.startsWith('sdd-test-skill.backup-'));
    expect(backups.length).toBe(1);
  });

  it('listDeployedSkills 列出已部署技能', async () => {
    await deploySkill('sdd-test-skill', TMP_ASSETS, TMP_SKILLS);
    const list = await listDeployedSkills(TMP_SKILLS);
    expect(list).toContain('sdd-test-skill');
  });

  it('deploySkill 部署到 Claude 时改写 Codex 文档路径', async () => {
    await deploySkill('sdd-test-skill', TMP_ASSETS, TMP_SKILLS, { agent: 'claude' });
    const content = fs.readFileSync(
      path.join(TMP_SKILLS, 'sdd-test-skill', 'SKILL.md'),
      'utf-8'
    );
    expect(content).toContain('~/.claude/scripts');
    expect(content).toContain('Claude Code Hooks');
    expect(content).not.toContain('~/.codex/hooks');
  });

  it('deploySkill 部署到 OpenCode 时改写 Codex 文档路径', async () => {
    await deploySkill('sdd-test-skill', TMP_ASSETS, TMP_SKILLS, { agent: 'opencode' });
    const content = fs.readFileSync(
      path.join(TMP_SKILLS, 'sdd-test-skill', 'SKILL.md'),
      'utf-8'
    );
    expect(content).toContain('~/.opencode/scripts');
    expect(content).toContain('OpenCode Commands');
    expect(content).not.toContain('~/.codex/hooks');
  });
});
