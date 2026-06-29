import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '../..');
const LINT = path.join(ROOT, 'assets', 'scripts', 'superflow-test-report-lint.py');

describe('superflow-test-report-lint.py', () => {
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
});
