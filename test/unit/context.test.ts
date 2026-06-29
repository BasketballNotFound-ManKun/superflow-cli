import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scaffoldBusinessContext, printSoftPrompt, checkUnderstandScan } from '../../src/core/context.js';

// 重新导出一个测试可访问的文件名列表（因为原文件未 export）
const CONTEXT_FILES = ['business-rules.md', 'incidents.md', 'decisions.md', 'external-systems.md'] as const;

const TMP = path.join(os.tmpdir(), 'sdd-test-context-' + Date.now());

describe('core/context', () => {
  beforeEach(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  describe('scaffoldBusinessContext', () => {
    it('复制 4 个初始文件到 <cwd>/docs/sdd-context/', async () => {
      const result = await scaffoldBusinessContext(TMP);
      const targetDir = path.join(TMP, 'docs', 'sdd-context');

      expect(result.copied.length).toBe(4);
      expect(result.skipped.length).toBe(0);
      expect(fs.existsSync(targetDir)).toBe(true);
      for (const f of CONTEXT_FILES) {
        expect(fs.existsSync(path.join(targetDir, f))).toBe(true);
        const content = fs.readFileSync(path.join(targetDir, f), 'utf-8');
        expect(content.length).toBeGreaterThan(0);  // 文件非空
      }
    });

    it('已存在的文件跳过（不覆盖）', async () => {
      // 第一次跑
      await scaffoldBusinessContext(TMP);
      const targetDir = path.join(TMP, 'docs', 'sdd-context');

      // 手动修改其中一个文件
      const editedFile = path.join(targetDir, 'business-rules.md');
      const editedContent = '# 用户自定义内容\n\n不要覆盖我\n';
      fs.writeFileSync(editedFile, editedContent);

      // 第二次跑
      const result = await scaffoldBusinessContext(TMP);
      expect(result.copied.length).toBe(0);
      expect(result.skipped.length).toBe(4);

      // 验证用户编辑保留
      const contentAfter = fs.readFileSync(editedFile, 'utf-8');
      expect(contentAfter).toBe(editedContent);
    });

    it('language=en 时复制英文上下文模板', async () => {
      const result = await scaffoldBusinessContext(TMP, 'en');
      const targetDir = path.join(TMP, 'docs', 'sdd-context');
      const content = fs.readFileSync(path.join(targetDir, 'business-rules.md'), 'utf-8');

      expect(result.copied.length).toBe(4);
      expect(content).toContain('# Business Rules');
      expect(content).toContain('Real Acceptance Evidence');
    });

    it('部分文件已存在时，只复制不存在的', async () => {
      const targetDir = path.join(TMP, 'docs', 'sdd-context');
      fs.mkdirSync(targetDir, { recursive: true });
      // 预创建 2 个
      fs.writeFileSync(path.join(targetDir, 'business-rules.md'), '# pre');
      fs.writeFileSync(path.join(targetDir, 'incidents.md'), '# pre');

      const result = await scaffoldBusinessContext(TMP);
      expect(result.copied.length).toBe(2);  // decisions + external-systems
      expect(result.skipped.length).toBe(2);  // business-rules + incidents
      expect(result.copied).toContain('decisions.md');
      expect(result.copied).toContain('external-systems.md');
      expect(result.skipped).toContain('business-rules.md');
      expect(result.skipped).toContain('incidents.md');
    });

    it('cwd 目录不存在也能正常创建', async () => {
      const nonExistent = path.join(TMP, 'deeply', 'nested', 'project');
      const result = await scaffoldBusinessContext(nonExistent);

      const targetDir = path.join(nonExistent, 'docs', 'sdd-context');
      expect(fs.existsSync(targetDir)).toBe(true);
      expect(result.copied.length).toBe(4);
    });
  });

  describe('printSoftPrompt', () => {
    it('打印包含关键提示词', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => { logs.push(args.join(' ')); };

      try {
        const scaffolding = { copied: CONTEXT_FILES as unknown as string[], skipped: [] };
        const understand = { ok: true, reason: 'already-scanned' as const, graphPath: '/tmp/test/.understand-anything/knowledge-graph.json' };
        printSoftPrompt('/tmp/test', scaffolding, understand);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join('\n');
      expect(output).toContain('docs/sdd-context/');
      expect(output).toContain('business-rules.md');
      expect(output).toContain('incidents.md');
      expect(output).toContain('decisions.md');
      expect(output).toContain('external-systems.md');
      expect(output).toContain('LLM 协助补全');
    });

    it('understand-anything 未扫时打印 fallback 提示', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => { logs.push(args.join(' ')); };

      try {
        const scaffolding = { copied: CONTEXT_FILES as unknown as string[], skipped: [] };
        const understand = { ok: false, reason: 'not-scanned' as const };
        printSoftPrompt('/tmp/test', scaffolding, understand);
      } finally {
        console.log = originalLog;
      }

      const output = logs.join('\n');
      expect(output).toContain('understand-anything 还没扫');
      expect(output).toContain('/understand');
    });

    it('language=en 时打印英文软提示', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => { logs.push(args.join(' ')); };

      try {
        const scaffolding = { copied: CONTEXT_FILES as unknown as string[], skipped: [] };
        const understand = { ok: false, reason: 'not-scanned' as const };
        printSoftPrompt('/tmp/test', scaffolding, understand, 'en');
      } finally {
        console.log = originalLog;
      }

      const output = logs.join('\n');
      expect(output).toContain('Generated 4 starter files');
      expect(output).toContain('understand-anything has not scanned');
    });
  });

  describe('checkUnderstandScan', () => {
    it('.understand-anything/knowledge-graph.json 存在时返回 ok', async () => {
      const uaDir = path.join(TMP, '.understand-anything');
      fs.mkdirSync(uaDir, { recursive: true });
      fs.writeFileSync(path.join(uaDir, 'knowledge-graph.json'), '{}');

      const result = await checkUnderstandScan(TMP);
      expect(result.ok).toBe(true);
      expect(result.reason).toBe('already-scanned');
      expect(result.graphPath).toContain('knowledge-graph.json');
    });

    it('.understand-anything/ 不存在时返回 not-scanned', async () => {
      const result = await checkUnderstandScan(TMP);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('not-scanned');
    });
  });
});
