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

// The same process must supply every selected Case, without replaying stored output.
describe('measurement capture attempts', () => {
  async function fixture(body = '') {
    const { prepareCapturePackage } = await import('../helpers/execution-receipt.js');
    const { spawnSync } = await import('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-measurement-'));
    const script = prepareCapturePackage(dir);
    const save = (name: string, value: any) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
    const run = (...args: string[]) => spawnSync('python3', [script, ...args], { cwd: dir, encoding: 'utf8' });
    fs.writeFileSync(path.join(dir, 'source.txt'), 'actual');
    fs.writeFileSync(path.join(dir, 'build.cjs'), "require('fs').copyFileSync('source.txt','artifact.txt')");
    fs.writeFileSync(path.join(dir, 'case.cjs'), `
const fs=require('fs'); fs.appendFileSync('calls','x');
const build=JSON.parse(fs.readFileSync('logs/build.json'));
const ids=process.env.SELECTED ? JSON.parse(process.env.SELECTED) : ['C1','C2'];
for (const caseId of ids) console.log(JSON.stringify({event:'superflow.measurement.v1',caseId,executed:1,persistence:[],
assertions:['response','state','forbiddenEffects'].map(id=>({id,expected:true,actual:!(process.env.BAD===id&&(!process.env.BAD_CASE||process.env.BAD_CASE===caseId)),result:process.env.BAD===id&&(!process.env.BAD_CASE||process.env.BAD_CASE===caseId)?'FAIL':'PASS'})),
target:{service:'sample',route:'run',kind:'library',buildId:process.env.OLD_BUILD||build.id,buildSha256:build.sha256,sourceFingerprint:build.sourceFingerprint}}));
${body}
process.exit(Number(process.env.FAIL||0));`);
    const coverage = { entries: [{ id: 'E1', service: 'sample', route: 'run', kind: 'library' }],
      cases: ['C1', 'C2'].map(id => ({ id, entryId: 'E1', level: 'library', executionEvidence: 'runner-captured.v1',
        assertions: { response: 'ok', state: 'unchanged', forbiddenEffects: 'none' },
        executionContext: { argv: [process.execPath, 'case.cjs'], cwd: '.', environmentKeys: [] } })) };
    save('review.json', { coverage });
    save('build-plan.json', { kind: 'build', cwd: '.', argv: [process.execPath, 'build.cjs'],
      sources: ['source.txt', 'build.cjs', 'case.cjs'], artifact: 'artifact.txt', output: 'logs/build.json' });
    const plan = { kind: 'case', changeDir: '.', review: 'review.json', build: 'logs/build.json',
      cases: ['C1', 'C2'].map(caseId => ({ caseId, output: `logs/${caseId}.json` })) };
    save('case-plan.json', plan);
    expect(run('--record-execution', 'build-plan.json').status).toBe(0);
    return { dir, save, run, plan, coverage };
  }
  it('captures two frozen Cases in one process and retains all prior attempts after failure', async () => {
    const f = await fixture();
    try {
      const first = f.run('--record-execution', 'case-plan.json');
      expect(first.status, first.stdout + first.stderr).toBe(0);
      expect(fs.readFileSync(path.join(f.dir, 'calls'), 'utf8')).toBe('x');
      const read = (id: string) => JSON.parse(fs.readFileSync(path.join(f.dir, `logs/${id}.json`), 'utf8'));
      const old = read('C1');
      const oldBytes = fs.readFileSync(path.join(f.dir, 'logs/C1.json'));
      expect(read('C2').capture).toEqual(old.capture);
      const capture = JSON.parse(fs.readFileSync(path.join(f.dir, 'logs', old.capture.path), 'utf8'));
      const offline = f.run('--check-measurement', 'case-plan.json', '--measurement', path.join('logs', capture.stdout.path));
      expect(offline.status, offline.stdout + offline.stderr).toBe(0);
      expect(offline.stdout).toContain('MEASUREMENT_DIAGNOSTIC_ONLY');
      expect(fs.readFileSync(path.join(f.dir, 'calls'), 'utf8')).toBe('x');
      process.env.FAIL = '7';
      const failed = f.run('--record-execution', 'case-plan.json');
      delete process.env.FAIL;
      expect(failed.status).toBe(2);
      expect(read('C1').status, failed.stdout + failed.stderr).toBe('PARTIAL');
      expect(fs.existsSync(path.join(f.dir, 'logs', old.capture.path))).toBe(true);
      const previous = fs.readdirSync(path.join(f.dir, 'logs')).find(file => file.startsWith('C1.previous-'))!;
      expect(fs.readFileSync(path.join(f.dir, 'logs', previous))).toEqual(oldBytes);
      for (const name of [old.capture.path, old.command.output])
        expect(fs.existsSync(path.join(f.dir, 'logs', name))).toBe(true);
    } finally { delete process.env.FAIL; fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it.each([['C1'], ['C1', 'C1', 'C2']])('rejects missing or duplicate measurements %j', async (...ids) => {
    const f = await fixture();
    try {
      process.env.SELECTED = JSON.stringify(ids);
      const result = f.run('--record-execution', 'case-plan.json');
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('measurement');
    } finally { delete process.env.SELECTED; fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it.each(['state', 'forbiddenEffects'])('retains failure for measured %s despite successful process exit', async id => {
    const f = await fixture();
    try {
      process.env.BAD = id;
      const result = f.run('--record-execution', 'case-plan.json');
      expect(result.status).toBe(2);
      expect(result.stdout).toContain(id);
      expect(JSON.parse(fs.readFileSync(path.join(f.dir, 'logs/C1.json'), 'utf8')).status).toBe('PARTIAL');
    } finally { delete process.env.BAD; fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it('rejects a prior target identity attached to a current build', async () => {
    const f = await fixture();
    try {
      process.env.OLD_BUILD = 'old-build';
      const result = f.run('--record-execution', 'case-plan.json');
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('target.buildId');
    } finally { delete process.env.OLD_BUILD; fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it('retains both Case failures when the shared process changes source after measuring', async () => {
    const f = await fixture("fs.writeFileSync('source.txt','changed');");
    try {
      const result = f.run('--record-execution', 'case-plan.json');
      expect(result.status).toBe(2);
      for (const id of ['C1', 'C2'])
        expect(JSON.parse(fs.readFileSync(path.join(f.dir, `logs/${id}.json`), 'utf8')).status).toBe('PARTIAL');
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it('keeps an independently passing Case while returning failure for its measured sibling', async () => {
    const f = await fixture();
    try {
      process.env.BAD = 'state'; process.env.BAD_CASE = 'C1';
      expect(f.run('--record-execution', 'case-plan.json').status).toBe(2);
      expect(JSON.parse(fs.readFileSync(path.join(f.dir, 'logs/C1.json'), 'utf8')).status).toBe('PARTIAL');
      expect(JSON.parse(fs.readFileSync(path.join(f.dir, 'logs/C2.json'), 'utf8')).status).toBe('PASS');
    } finally { delete process.env.BAD; delete process.env.BAD_CASE; fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it('does not promote an archived green XML read by a new process into measurements', async () => {
    const f = await fixture("console.log(fs.readFileSync('old.xml','utf8'));");
    try {
      fs.writeFileSync(path.join(f.dir, 'old.xml'), '<testsuite tests="1" failures="0"/>');
      process.env.SELECTED = '[]';
      const result = f.run('--record-execution', 'case-plan.json');
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('measurement');
      for (const id of ['C1', 'C2'])
        expect(JSON.parse(fs.readFileSync(path.join(f.dir, `logs/${id}.json`), 'utf8')).status).toBe('PARTIAL');
    } finally { delete process.env.SELECTED; fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it('protects aliased source outputs in a batch before any process runs', async () => {
    const f = await fixture();
    try {
      fs.linkSync(path.join(f.dir, 'source.txt'), path.join(f.dir, 'logs/alias.json'));
      f.plan.cases[1].output = 'logs/alias.json'; f.save('case-plan.json', f.plan);
      expect(f.run('--record-execution', 'case-plan.json').status).toBe(2);
      expect(fs.readFileSync(path.join(f.dir, 'source.txt'), 'utf8')).toBe('actual');
      expect(fs.existsSync(path.join(f.dir, 'calls'))).toBe(false);
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it.each(['file', 'symlink', 'hardlink'])('never archives unknown legacy sidecars on first capture: %s', async kind => {
    const f = await fixture();
    try {
      fs.rmSync(path.join(f.dir, 'logs/build.json'));
      const secret = 'Authorization: Bearer synthetic-private-token';
      const privateFile = path.join(f.dir, 'private-user.txt');
      const sidecar = path.join(f.dir, 'logs/build.stdout.log');
      fs.writeFileSync(privateFile, secret);
      if (kind === 'symlink') fs.symlinkSync(privateFile, sidecar);
      else if (kind === 'hardlink') fs.linkSync(privateFile, sidecar);
      else fs.writeFileSync(sidecar, secret);
      const result = f.run('--record-execution', 'build-plan.json');
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(fs.readFileSync(sidecar, 'utf8')).toBe(secret);
      expect(fs.readFileSync(privateFile, 'utf8')).toBe(secret);
      for (const name of fs.readdirSync(path.join(f.dir, 'logs')).filter(file => file.includes('previous')))
        expect(fs.readFileSync(path.join(f.dir, 'logs', name), 'utf8')).not.toContain(secret);
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it('preserves unknown current output without copying or executing', async () => {
    const f = await fixture();
    try {
      const output = path.join(f.dir, 'logs/build.json');
      const original = 'Authorization: Bearer unknown-current-private-token';
      fs.writeFileSync(output, original);
      const before = fs.readdirSync(path.join(f.dir, 'logs')).sort();
      const result = f.run('--record-execution', 'build-plan.json');
      expect(result.status).toBe(2);
      expect(result.stdout).not.toContain('capture build 开始');
      expect(result.stdout).not.toContain('unknown-current-private-token');
      expect(fs.readFileSync(output, 'utf8')).toBe(original);
      expect(fs.readdirSync(path.join(f.dir, 'logs')).sort()).toEqual(before);
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it('does not copy an otherwise owned receipt with unredacted sensitive content', async () => {
    const f = await fixture();
    try {
      const output = path.join(f.dir, 'logs/build.json');
      const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
      receipt.note = 'Authorization: Bearer injected-private-token';
      const original = JSON.stringify(receipt); fs.writeFileSync(output, original);
      const before = fs.readdirSync(path.join(f.dir, 'logs')).sort();
      const result = f.run('--record-execution', 'build-plan.json');
      expect(result.status).toBe(2);
      expect(result.stdout).not.toContain('capture build 开始');
      expect(result.stdout).not.toContain('injected-private-token');
      expect(fs.readFileSync(output, 'utf8')).toBe(original);
      expect(fs.readdirSync(path.join(f.dir, 'logs')).sort()).toEqual(before);
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
  it('diagnoses multiple measurement defects offline without invoking or creating a receipt', async () => {
    const f = await fixture();
    try {
      fs.writeFileSync(path.join(f.dir, 'observed.jsonl'), JSON.stringify({ event: 'superflow.measurement.v1', caseId: 'C1', executed: 0 }) + '\n');
      const result = f.run('--check-measurement', 'case-plan.json', '--measurement', 'observed.jsonl');
      expect(result.status).toBe(2);
      for (const field of ['executed', 'assertions', 'target', 'C2']) expect(result.stdout).toContain(field);
      expect(fs.existsSync(path.join(f.dir, 'calls'))).toBe(false);
      expect(fs.existsSync(path.join(f.dir, 'logs/C1.json'))).toBe(false);
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
  });
});

describe('raw evidence diagnostics', () => {
  it.each([
    ['<testsuite tests="1" failures="0"/>', 'JUnit/XML'],
    ['{"event":"superflow.measurement.v1","caseId":"C1"}', 'measurement'],
    ['{"caseId":"C1"}\n{"caseId":"C2"}\n', 'JSONL'],
    ['[]', 'JSON object'],
  ])('rejects %s with the actual capture recovery entry', async (raw, label) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superflow-raw-evidence-'));
    try {
      writeExecutionReceipt(dir, 'C1', 'E1');
      const review = JSON.parse(fs.readFileSync(path.join(dir, 'capture-review.json'), 'utf8'));
      review.coverage.schemaVersion = 'superflow.review-coverage.v1';
      review.coverage.decisions = [{ disposition: 'FIX', caseIds: ['C1'] }];
      fs.writeFileSync(path.join(dir, 'capture-review.json'), JSON.stringify(review));
      fs.writeFileSync(path.join(dir, 'logs/C1.json'), raw);
      fs.writeFileSync(path.join(dir, 'test-report.md'),
        '| Case ID | Entry ID | Acceptance level | Result | Evidence path |\n' +
        '|---|---|---|---|---|\n| C1 | E1 | api | PASS | logs/C1.json |\nVerification Result: PASS\n');
      const result = await execFileAsync('python3', [LINT, '--review', path.join(dir, 'capture-review.json'),
        path.join(dir, 'test-report.md')]).catch(error => error);
      expect(result).toMatchObject({ code: 2, stdout: expect.stringContaining(label) });
      expect(result.stdout).toContain('--record-execution');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
