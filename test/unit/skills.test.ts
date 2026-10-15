import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { deploySkill, listDeployedSkills, retireSkillAssets } from '../../src/domains/skill/deploy.js';
import { computeDirHash } from '../../src/platform/fs.js';
import { getManifestSkillNames } from '../../src/domains/config/manifest.js';

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

  it('deploySkill 目标已存在时直接替换且不创建备份', async () => {
    await fs.promises.mkdir(path.join(TMP_SKILLS, 'sdd-test-skill'), {recursive: true});
    await fs.promises.writeFile(
      path.join(TMP_SKILLS, 'sdd-test-skill', 'SKILL.md'),
      '# old\n'
    );
    await deploySkill('sdd-test-skill', TMP_ASSETS, TMP_SKILLS);
    const content = fs.readFileSync(
      path.join(TMP_SKILLS, 'sdd-test-skill', 'SKILL.md'),
      'utf-8'
    );
    const backups = fs.readdirSync(TMP_SKILLS)
      .filter(d => d.startsWith('sdd-test-skill.backup-'));

    expect(content).toContain('# test');
    expect(backups).toHaveLength(0);
  });

  it('listDeployedSkills 列出已部署技能', async () => {
    await deploySkill('sdd-test-skill', TMP_ASSETS, TMP_SKILLS);
    const list = await listDeployedSkills(TMP_SKILLS);
    expect(list).toContain('sdd-test-skill');
  });

  it('重复部署保留历史备份但不增加新备份', async () => {
    const historical = path.join(TMP_SKILLS, 'sdd-test-skill.backup-old');
    await fs.promises.mkdir(historical);
    for (let i = 0; i < 2; i++) {
      await deploySkill('sdd-test-skill', TMP_ASSETS, TMP_SKILLS);
    }
    expect(fs.readdirSync(TMP_SKILLS).filter(d => d.includes('.backup-'))).toEqual(['sdd-test-skill.backup-old']);
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

});

describe('Superflow 用户入口安装', () => {
  it.each(['skills', 'skills-en'])('%s 双端重复安装只有统一命名并保留用户资产', async (languageRoot) => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'superflow-entry-'));
    try {
      const names = getManifestSkillNames();
      expect(names).toContain('superflow');
      expect(names.every((name) => name === 'superflow' || name.startsWith('superflow-'))).toBe(true);
      for (const agent of ['codex', 'claude'] as const) {
        const destination = path.join(root, agent);
        const custom = path.join(destination, 'custom-skill', 'SKILL.md');
        await fs.promises.mkdir(path.dirname(custom), { recursive: true });
        await fs.promises.writeFile(custom, '用户自定义技能');
        for (let repeat = 0; repeat < 2; repeat++) {
          for (const name of names) {
            await deploySkill(name, path.resolve('assets', languageRoot), destination, { agent });
            const metadata = path.join(destination, name, 'agents', 'openai.yaml');
            expect(fs.existsSync(metadata), name).toBe(true);
          }
        }
        const entry = fs.readFileSync(path.join(destination, 'superflow', 'SKILL.md'), 'utf-8');
        expect(entry).not.toContain('../superflow/SKILL.md');
        expect(fs.existsSync(path.join(destination, 'superflow', 'scripts', 'superflow-state.sh'))).toBe(true);
        const phase = fs.readFileSync(path.join(destination, 'superflow-build', 'SKILL.md'), 'utf-8');
        expect(phase.includes('user-invocable: false')).toBe(agent === 'claude');
        expect(entry).not.toContain('user-invocable: false');
        const propose = fs.readFileSync(path.join(destination, 'superflow-propose', 'SKILL.md'), 'utf-8');
        expect(propose).not.toContain('Ready for implementation.');
        expect(propose).not.toContain('/opsx:apply');
        expect(propose).toContain('$superflow-contracts');
        expect(propose).toContain('OpenSpec applyRequires');
        const handoff = fs.readFileSync(path.join(destination, 'superflow-handoff', 'SKILL.md'), 'utf-8');
        for (const content of [entry, propose, phase, handoff]) {
          expect(content).toContain('superflow check <change> --level coding-ready');
          expect(content).toContain('Blocked for docs');
        }
        expect(fs.readFileSync(custom, 'utf-8')).toBe('用户自定义技能');
        expect(fs.readdirSync(destination).some((name) => name.includes('.backup-'))).toBe(false);
      }
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it('只备份移出已确认的旧资产，保留自定义和符号链接且重复执行幂等', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'superflow-retire-'));
    const skills = path.join(root, 'skills');
    const old = path.join(skills, 'old-entry');
    const custom = path.join(skills, 'custom-entry');
    try {
      await fs.promises.mkdir(old, { recursive: true });
      await fs.promises.writeFile(path.join(old, 'SKILL.md'), 'known release');
      await fs.promises.cp(old, custom, { recursive: true });
      const fingerprint = computeDirHash(old);
      await fs.promises.writeFile(path.join(custom, 'extra.txt'), 'user addition');
      await fs.promises.symlink(old, path.join(skills, 'linked-entry'));
      const retired = { 'old-entry': [fingerprint], 'custom-entry': [fingerprint], 'linked-entry': [fingerprint] };
      const first = await retireSkillAssets(skills, retired);
      expect(first.removed).toEqual(['old-entry']);
      expect(first.preserved).toEqual(['custom-entry', 'linked-entry']);
      expect(fs.existsSync(old)).toBe(false);
      expect(fs.existsSync(path.join(custom, 'extra.txt'))).toBe(true);
      const backup = path.join(root, '.superflow-retired-assets', fingerprint, 'old-entry', 'SKILL.md');
      expect(fs.readFileSync(backup, 'utf-8')).toBe('known release');
      expect((await retireSkillAssets(skills, retired)).removed).toEqual([]);
      await fs.promises.cp(path.dirname(backup), old, { recursive: true });
      expect((await retireSkillAssets(skills, retired)).removed).toEqual(['old-entry']);
      expect(fs.existsSync(old)).toBe(false);
      expect(fs.readFileSync(backup, 'utf-8')).toBe('known release');
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });
});
