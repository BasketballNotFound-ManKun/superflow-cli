import { describe, expect, it } from 'vitest';
import { writeExecutionReceipt } from '../helpers/execution-receipt.js';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '../..');
const LINT = path.join(ROOT, 'assets', 'scripts', 'superflow-test-report-lint.py');

describe('superflow-test-report-lint.py', () => {
  it.each([
    ['验证结果: 通过\n', 0],
    ['Verification Result: PASS\n验证结果: 通过\n', 0],
    ['验证结果: PASS\n验证结果: 失败\n', 2],
    ['验证结果: PASS\n验证结果: 未知\n', 2],
    ['Verification Result: PASS\n验证结果: 失败\n', 2],
    ['验证结论: 通过\n', 0],
    ['验证结果: FAIL\n验证结论: 通过\n', 2],
    ['验证结论: FAIL\n验证结果: 通过\n', 2],
    ['验证结果: PASS\n验证结论: 失败\n', 2],
    ['Verification Result: PASS\n验证结论: 失败\n', 2],
  ])('normalizes final summary aliases without resurrecting early PASS: %s', async (summary, code) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-lint-'));
    try {
      const report = path.join(dir, 'test-report.md');
      fs.writeFileSync(report, String(summary));
      const command = execFileAsync('python3', [LINT, '--require-complete', report]);
      if (code === 0) {
        await expect(command).resolves.toMatchObject({
          stdout: expect.stringContaining('证据一致性检查通过'),
        });
      } else {
        await expect(command).rejects.toMatchObject({ code });
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ['验证结果: FAIL\n验证结果: PASS\n', 2],
    ['Verification Result: FAIL\nVerification Result: PASS\n', 2],
    ['## 历史记录\n验证结果: FAIL\n## 当前验证\n验证结果: PASS\n', 0],
    ['## History\nVerification Result: FAIL\n### Old run\n验证结果: FAIL\n## Current verification\nVerification Result: PASS\n', 0],
    ['## Historical Evidence\n验证结果: PASS\n', 2],
    ['## History###\n验证结果: FAIL\n## Current verification\n验证结果: PASS\n', 2],
    ['<pre>\n## History\n</pre>\n验证结果: FAIL\n## Current verification\nVerification Result: PASS\n', 2],
    ['<div>\n## History\n</div>\n\n验证结果: FAIL\n## Current verification\nVerification Result: PASS\n', 2],
    ['运行说明\n<span>\n验证结果: FAIL\n</span>\n\nVerification Result: PASS\n', 2],
    ['<?target\n## History\n?>\n验证结果: FAIL\n## Current\nVerification Result: PASS\n', 2],
    ['<![CDATA[\n## History\n]]>\n验证结果: FAIL\n## Current\nVerification Result: PASS\n', 2],
    ['```html\n<pre>\n## History\n验证结果: FAIL\n</pre>\n```\n验证结果: PASS\n', 0],
    ['<!-- 验证结果: FAIL -->\n验证结果: PASS\n', 0],
    ['<!--\n## History\n-->\n验证结果: FAIL\n验证结果: PASS\n', 2],
    ['```markdown\n## History\n```\n验证结果: FAIL\n验证结果: PASS\n', 2],
  ])('separates explicit history from conflicting current summaries: %s', async (body, code) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-summary-'));
    try {
      const report = path.join(dir, 'test-report.md');
      fs.writeFileSync(report, body);
      const result = execFileAsync('python3', [LINT, '--require-complete', report]);
      if (code === 0) await expect(result).resolves.toBeDefined();
      else await expect(result).rejects.toMatchObject({ code });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['duplicate-current', 'explicit-history', 'history-only'])(
    'keeps only the single current case ledger: %s', async (mode) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-ledger-'));
      try {
        const report = path.join(dir, 'test-report.md');
        const review = path.join(dir, 'document-review.json');
        fs.writeFileSync(review, JSON.stringify({ coverage: {
          schemaVersion: 'superflow.review-coverage.v1',
          entries: [{ id: 'entry', route: 'POST /entry', kind: 'api' }],
          cases: [{ id: 'C1', entryId: 'entry', level: 'api' }],
          decisions: [{ disposition: 'FIX', caseIds: ['C1'] }],
        } }));
        writeExecutionReceipt(dir, 'C1', 'entry');
        const table = (status: string) => [
          '| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |',
          '|---|---|---|---|---|',
          `| C1 | entry | api | ${status} | logs/C1.json |`,
        ].join('\n');
        const body = mode === 'duplicate-current'
          ? `${table('PASS')}\n\n## Another result\n${table('PARTIAL')}`
          : mode === 'explicit-history'
            ? `## 历史记录\n${table('PARTIAL')}\n## 当前验证\n${table('PASS')}`
            : `## History\n${table('PASS')}\n## Current verification\n`;
        fs.writeFileSync(report, body + '\n验证结果: PASS\n' +
          (mode === 'explicit-history'
            ? '<!--\n| Case ID | Entry ID | Acceptance level | Result | Evidence path |\n验证结果: FAIL\n-->\n' +
              '\n    | Case ID | Entry ID | Acceptance level | Result | Evidence path |\n'
            : ''));
        const result = execFileAsync('python3', [LINT, '--review', review, report]);
        if (mode === 'explicit-history') await expect(result).resolves.toBeDefined();
        else await expect(result).rejects.toMatchObject({ code: 2 });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it('does not borrow integration signals from explicit historical reports', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-history-signals-'));
    try {
      const report = path.join(dir, 'test-report.md');
      const signals = 'gradle test BUILD SUCCESS PID HTTP SELECT log ERROR Real integration passed 真实入口 curl\n' +
        '| 表/字段 | 写入方 | 读取/过滤方 | 跨仓/外部消费方 | 真实入口 | 反向状态场景 | 验证证据 |';
      const verifier = path.join(ROOT, 'assets/scripts/superflow-verify-integration.sh');
      fs.writeFileSync(report, `## History\n${signals}\n## Current verification\n验证结果: PASS\n`);
      await expect(execFileAsync('bash', [verifier, report])).rejects.toMatchObject({ code: 2 });
      fs.writeFileSync(report,
        `## History\n验证结果: FAIL\nTests run: 9, Failures: 1, Errors: 0, Skipped: 0\n` +
        `## Current verification\n${signals}\n验证结果: PASS\n`);
      await expect(execFileAsync('bash', [verifier, report])).resolves.toBeDefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('阻塞真实外部联调用例被 mock-only 报告冒充完成', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-lint-'));
    const tests = path.join(dir, 'tests.md');
    const report = path.join(dir, 'test-report.md');

    fs.writeFileSync(
      tests,
      [
        '# Tests',
        '',
        '## T5.1.1 L4 真实入口联调',
        '',
        '使用第三方 dev 工具触发真实外部事件，然后验证系统回调和业务终态。',
        '必须记录 curl/HTTP 请求、响应断言、SELECT 数据库证据、日志 grep ERROR 和外部平台回调摘要。',
        '',
      ].join('\n')
    );
    fs.writeFileSync(
      report,
      [
        '# Test Report',
        '',
        'T5.1.1 Passed。',
        'Mockito 单元测试通过，使用虚设数据验证 ExternalSyncService。',
        'mvn test -Dtest=ExternalSyncServiceTest',
        'Tests run: 1, Failures: 0, Errors: 0, Skipped: 0',
        '',
      ].join('\n')
    );

    await expect(
      execFileAsync('python3', [LINT, '--tests', tests, report])
    ).rejects.toMatchObject({
      code: 2,
      stdout: expect.stringContaining('mock-only/单元测试闭环口径'),
    });

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('显式测试合同缺失时拒绝把报告判为通过', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-lint-'));
    try {
      const report = path.join(dir, 'test-report.md');
      fs.writeFileSync(report, '# Test Report\n验证结果: PASS\n');
      await expect(
        execFileAsync('python3', [LINT, '--tests', path.join(dir, 'tests.md'), report])
      ).rejects.toMatchObject({
        code: 2,
        stdout: expect.stringContaining('显式指定的 tests.md 不存在'),
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('逐入口核对报告，阻止遗漏或降级验收冒充整体通过', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-lint-'));
    try {
      const report = path.join(dir, 'test-report.md');
      const review = path.join(dir, 'document-review.json');
      fs.writeFileSync(review, JSON.stringify({
        coverage: {
          schemaVersion: 'superflow.review-coverage.v1',
          entries: [
            { id: 'plot-page', route: 'POST /plot-page', kind: 'browser' },
            { id: 'port-switch', route: 'POST /port-switch', kind: 'api' },
          ],
          cases: [
            { id: 'C1', entryId: 'plot-page', level: 'browser' },
            { id: 'C2', entryId: 'port-switch', level: 'api' },
          ],
          decisions: [
            { disposition: 'FIX', caseIds: ['C1'] },
            { disposition: 'FIX', caseIds: ['C2'] },
          ],
        },
      }));
      const base = [
        '# Test Report',
        '| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |',
        '|---|---|---|---|---|',
        '| C1 | plot-page | browser | PASS | logs/C1.json |',
      ];
      fs.mkdirSync(path.join(dir, 'logs'));
      writeExecutionReceipt(dir, 'C1', 'plot-page', 'browser');
      writeExecutionReceipt(dir, 'C2', 'port-switch');
      fs.writeFileSync(report, [...base, '验证结果: PASS'].join('\n'));
      await expect(execFileAsync('python3', [LINT, '--review', review, report]))
        .rejects.toMatchObject({
          code: 2,
          stdout: expect.stringContaining('用例 C2 缺少逐项执行结果'),
        });

      fs.writeFileSync(report, [
        ...base,
        '| C2 | port-switch | browser | PASS | logs/C2.json |',
        '验证结果: PASS',
      ].join('\n'));
      await expect(execFileAsync('python3', [LINT, '--review', review, report]))
        .rejects.toMatchObject({
          code: 2,
          stdout: expect.stringContaining('用例 C2 的入口或验收级别'),
        });

      fs.writeFileSync(report, [
        ...base,
        '| C2 | port-switch | api | BLOCKED | logs/C2-blocker.txt |',
        '验证结果: PASS',
      ].join('\n'));
      await expect(execFileAsync('python3', [LINT, '--review', review, report]))
        .rejects.toMatchObject({
          code: 2,
          stdout: expect.stringContaining('不能声明整体验证 PASS'),
        });

      fs.writeFileSync(report, [
        ...base,
        '| C2 | port-switch | api | PASS | logs/C2.json |',
        '验证结果: PASS',
      ].join('\n'));
      await expect(execFileAsync('python3', [LINT, '--review', review, report]))
        .resolves.toBeDefined();
      fs.rmSync(path.join(dir, 'logs/C2.json'));
      await expect(execFileAsync('python3', [LINT, '--review', review, report]))
        .rejects.toMatchObject({
          code: 2,
          stdout: expect.stringContaining('用例 C2 的通过证据不可验证'),
        });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('横向十五页改造不能用十三个列表结果宣称全部通过', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-lint-'));
    try {
      const names = [
        'role', 'operator', 'port', 'equipment', 'package',
        'parking-gun', 'rule', 'platform', 'user', 'site-group',
        'menu', 'plot', 'pile', 'shareholder', 'share-ratio',
      ];
      const report = path.join(dir, 'test-report.md');
      const review = path.join(dir, 'document-review.json');
      fs.writeFileSync(review, JSON.stringify({
        coverage: {
          schemaVersion: 'superflow.review-coverage.v1',
          cases: names.map((name, index) => ({
            id: `C${index + 1}`, entryId: name, level: 'api',
          })),
          decisions: names.map((_name, index) => ({
            disposition: 'FIX', caseIds: [`C${index + 1}`],
          })),
        },
      }));
      const rows = names.flatMap((name, index) =>
        name === 'port' || name === 'parking-gun'
          ? []
          : [`| C${index + 1} | ${name} | api | PASS | logs/C${index + 1}.json |`],
      );
      fs.mkdirSync(path.join(dir, 'logs'));
      for (const [index, name] of names.entries()) {
        if (name !== 'port' && name !== 'parking-gun') {
          fs.writeFileSync(path.join(dir, `logs/C${index + 1}.json`), '{}');
        }
      }
      fs.writeFileSync(report, [
        '| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |',
        '|---|---|---|---|---|',
        ...rows,
        '验证结果: PASS',
      ].join('\n'));
      await expect(execFileAsync('python3', [LINT, '--review', review, report]))
        .rejects.toMatchObject({
          code: 2,
          stdout: expect.stringContaining('用例 C3 缺少逐项执行结果'),
        });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
