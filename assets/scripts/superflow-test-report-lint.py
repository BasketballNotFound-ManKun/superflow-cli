#!/usr/bin/env python3
"""SuperBridge Flow test-report evidence linter.

This hook catches delivery-report issues that are cheap to detect
mechanically:

- skipped tests being reported as passed
- contradictory `Tests run` / `N/N` evidence for the same command
- stale source anchors such as deleted methods referenced as current evidence
- cross-repo evidence that claims test success without acknowledging skipTests
- L3/L4 or real-entry tests being closed with mock-only/unit-only evidence
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


PASS_WORDS = re.compile(r"(✅|pass|passed|通过|成功|Real integration passed)", re.I)
RISK_WORDS = re.compile(
    r"(风险|默认|直接跑|会被|被跳过|假绿|不能|不得|临时|回滚|需|必须|注意|说明|blocked|skipTests)",
    re.I,
)
DELETED_CONTEXT = re.compile(r"(旧|已删除|删除|不再|清理|移除|历史|旧实现|旧口径)", re.I)
COMMAND_RE = re.compile(r"(mvn\s+[^\n`|；。]+(?:test|surefire:test)[^\n`|；。]*)")
TESTS_RUN_RE = re.compile(
    r"Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)",
    re.I,
)
RATIO_RE = re.compile(r"(?<![\w./-])(\d{1,4})/(\d{1,4})(?![\w./-])")
ANCHOR_RE = re.compile(r"\b([A-Z][A-Za-z0-9_]+)\.([a-z][A-Za-z0-9_]+)\b")
DB_BACKED_RE = re.compile(
    r"("
    r"数据库|数据表|表结构|字段|状态字段|SQL|Mapper|XML|@TableName|BaseMapper|"
    r"SHOW\s+CREATE\s+TABLE|SHOW\s+COLUMNS|DESC\s+|SELECT\s+|UPDATE\s+|INSERT\s+|DELETE\s+|"
    r"\b[a-z][a-z0-9]*_[a-z0-9_]*\b|running_status|connector_status|own_status|is_online|is_use|deleted|is_deleted"
    r")",
    re.I,
)
TABLE_REVERSE_HEADER_RE = re.compile(
    r"表/字段.*写入方.*(读取|过滤).*真实入口.*(反向状态|验证证据|必测用例)",
    re.I | re.S,
)
REAL_CONSUMER_RE = re.compile(
    r"(真实入口|小程序|扫码|启动充电|订单创建|支付|退款|通知|回调|第三方|MQ|定时任务|"
    r"curl|POST\s+|GET\s+|PUT\s+|DELETE\s+|接口调用|业务入口)",
    re.I,
)
SYNC_ONLY_RE = re.compile(r"(同步.*成功|任务.*成功|写入.*成功|更新.*成功)", re.I)
BLOCKED_RE = re.compile(r"(Blocked|阻塞|未验证|无法验证|待.*确认)", re.I)
REAL_TEST_REQUIRED_RE = re.compile(
    r"("
    r"\bL[34]\b|T\d+(?:\.\d+)+|真实入口|真实接口|真实链路|真实环境|联调|端到端|E2E|"
    r"curl|Postman|Newman|pytest|RestAssured|HTTP|POST\s+|GET\s+|PUT\s+|DELETE\s+|"
    r"dev\s*tool|dev工具|第三方|开放平台|外部事件|外部平台|key|secret|"
    r"设备|回调|callback|MQ|数据库|DB|SELECT\s+|日志|grep\s+.*ERROR"
    r")",
    re.I,
)
EXTERNAL_TEST_REQUIRED_RE = re.compile(
    r"(第三方|开放平台|dev\s*tool|dev工具|外部事件|外部平台|"
    r"callback|回调|key|secret|设备|业务终态|对账)",
    re.I,
)
MOCK_ONLY_RE = re.compile(
    r"(mock-only|mock only|仅.*mock|只.*mock|仅.*单元|只.*单元|虚设数据|模拟数据|Mockito|@MockBean)",
    re.I,
)
REAL_COMMAND_RE = re.compile(
    r"(curl\s+|http://|https://|POST\s+|GET\s+|PUT\s+|DELETE\s+|PATCH\s+|"
    r"Postman|Newman|pytest|RestAssured|dev\s*tool|dev工具)",
    re.I,
)
REAL_ENV_RE = re.compile(
    r"(PID|进程|Started .*Application|JVM running|端口|server\.port|Base URL|"
    r"localhost:\d+|127\.0\.0\.1:\d+|10\.\d+\.\d+\.\d+:\d+|测试环境|dev环境|"
    r"actuator/health|健康检查)",
    re.I,
)
RESPONSE_ASSERTION_RE = re.compile(
    r"(HTTP/[0-9.]+\s+2\d\d|HTTP\s*2\d\d|status\s*[:=]\s*2\d\d|响应|response|"
    r"断言|assert|success|matched|pending|accepted|confirmed|对账|业务终态)",
    re.I,
)
DB_EVIDENCE_RE = re.compile(
    r"(SELECT\s+|SHOW\s+CREATE\s+TABLE|SHOW\s+COLUMNS|DESC\s+|数据库|DB|mysql|"
    r"记录数|字段值|表数据|写入|更新后)",
    re.I,
)
LOG_EVIDENCE_RE = re.compile(r"(grep\s+.*ERROR|无\s*ERROR|日志|log|ERROR|WARN)", re.I)
EXTERNAL_EVIDENCE_RE = re.compile(
    r"(第三方|开放平台|dev\s*tool|dev工具|外部事件|外部平台|callback|回调|"
    r"外部请求|外部响应|业务终态|对账|10\.\d+\.\d+\.\d+:\d+)",
    re.I,
)
CASE_ID_RE = re.compile(r"\bT\d+(?:\.\d+)+\b")
OLD_PHRASES = (
    "不会按周期边界拆分子切片",
    "1 秒空窗落入下一周期对账无实质影响",
    "空窗子段优惠电费金额极小",
)


@dataclass
class Issue:
    level: str
    path: Path
    line: int
    message: str


def repo_root_for(path: Path) -> Path | None:
    cur = path.parent if path.is_file() else path
    while True:
        if (cur / ".git").exists():
            return cur
        if cur.parent == cur:
            return None
        cur = cur.parent


def normalize_command(command: str) -> str:
    command = re.sub(r"\s+", " ", command.strip())
    command = command.replace('"', "'")
    command = re.sub(r"\s+-s\s+\S+", "", command)
    command = re.sub(r"\s+-DfailIfNoTests=\S+", "", command)
    command = re.sub(r"\s+-DskipTests=\S+", "", command)
    command = re.sub(r"\s+-Dmaven\.test\.skip=\S+", "", command)
    return command


def grep_source(repo: Path, method: str) -> bool:
    try:
        subprocess.check_output(
            ["rg", "-n", rf"\b{re.escape(method)}\s*\(", "src"],
            cwd=str(repo),
            text=True,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


def class_seen_in_source(repo: Path, class_name: str) -> bool:
    try:
        subprocess.check_output(
            ["rg", "-n", rf"\b{re.escape(class_name)}\b", "src"],
            cwd=str(repo),
            text=True,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


def find_recent_command(lines: list[str], index: int) -> str | None:
    start = max(0, index - 8)
    for j in range(index, start - 1, -1):
        match = COMMAND_RE.search(lines[j])
        if match:
            return normalize_command(match.group(1))
    return None


def first_missing_evidence(text: str, required: list[tuple[str, re.Pattern[str]]]) -> str | None:
    for label, pattern in required:
        if not pattern.search(text):
            return label
    return None


def lint_against_tests_contract(report_path: Path, report_text: str, tests_path: Path | None) -> list[Issue]:
    issues: list[Issue] = []
    if tests_path is None or not tests_path.exists():
        return issues

    tests_text = tests_path.read_text(encoding="utf-8", errors="replace")
    real_required = bool(REAL_TEST_REQUIRED_RE.search(tests_text))
    external_required = bool(EXTERNAL_TEST_REQUIRED_RE.search(tests_text))
    blocked = bool(BLOCKED_RE.search(report_text))
    passed_or_partial = bool(
        PASS_WORDS.search(report_text)
        or re.search(r"Real integration passed|Partially verified|部分验证", report_text, re.I)
    )

    if not real_required or blocked or not passed_or_partial:
        return issues

    if MOCK_ONLY_RE.search(report_text):
        issues.append(
            Issue(
                "FAIL",
                report_path,
                0,
                f"{tests_path.name} 要求真实链路/L3/L4 证据，但 test-report 出现 mock-only/单元测试闭环口径；"
                "mock 只能作为辅助证据，不能作为完成态。",
            )
        )

    required = [
        ("真实命令/curl/dev 工具/API 调用", REAL_COMMAND_RE),
        ("真实环境/进程/端口/健康检查", REAL_ENV_RE),
        ("响应与业务断言", RESPONSE_ASSERTION_RE),
        ("数据库 SELECT/字段校验", DB_EVIDENCE_RE),
        ("日志/ERROR 检查", LOG_EVIDENCE_RE),
    ]
    missing = first_missing_evidence(report_text, required)
    if missing:
        issues.append(
            Issue(
                "FAIL",
                report_path,
                0,
                f"{tests_path.name} 声明真实链路/L3/L4 验证，但 test-report 缺少 `{missing}` 证据；"
                "不能用单元测试、BUILD SUCCESS 或关键词替代真实验收。",
            )
        )

    if external_required and not EXTERNAL_EVIDENCE_RE.search(report_text):
        issues.append(
            Issue(
                "FAIL",
                report_path,
                0,
                f"{tests_path.name} 涉及第三方/dev 工具/设备/回调验证，但 test-report 缺少外部平台请求、"
                "回调、业务终态或双方数据对账证据。",
            )
        )

    tests_cases = set(CASE_ID_RE.findall(tests_text))
    report_cases = set(CASE_ID_RE.findall(report_text))
    missing_cases = sorted(tests_cases - report_cases)
    if tests_cases and missing_cases:
        preview = ", ".join(missing_cases[:8])
        suffix = " ..." if len(missing_cases) > 8 else ""
        issues.append(
            Issue(
                "FAIL",
                report_path,
                0,
                f"test-report 缺少 tests.md 用例 ID 回填：{preview}{suffix}；"
                "每个要求执行的 case 必须记录 Passed/Blocked/Partially verified。",
            )
        )

    return issues


def infer_tests_path(report: Path) -> Path | None:
    direct = report.parent / "tests.md"
    if direct.exists():
        return direct
    cur = report.parent
    for _ in range(4):
        candidate = cur / "tests.md"
        if candidate.exists():
            return candidate
        if cur.parent == cur:
            break
        cur = cur.parent
    return None


def lint_report(path: Path, repo: Path | None, tests_path: Path | None = None) -> list[Issue]:
    issues: list[Issue] = []
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    command_tests: dict[str, set[tuple[int, int, int, int]]] = {}
    command_ratios: dict[str, set[tuple[int, int]]] = {}
    db_backed = bool(DB_BACKED_RE.search(text))
    blocked = bool(BLOCKED_RE.search(text))
    passed_or_partial = bool(PASS_WORDS.search(text) or re.search(r"Partially verified|部分验证", text, re.I))
    issues.extend(lint_against_tests_contract(path, text, tests_path or infer_tests_path(path)))

    if db_backed and passed_or_partial and not blocked:
        if not TABLE_REVERSE_HEADER_RE.search(text):
            issues.append(
                Issue(
                    "FAIL",
                    path,
                    0,
                    "数据库/状态字段相关报告缺少数据表反向影响面表："
                    "`表/字段 | 写入方 | 读取/过滤方 | 跨仓/外部消费方 | 真实入口 | 反向状态场景 | 验证证据`。",
                )
            )
        if not REAL_CONSUMER_RE.search(text):
            issues.append(
                Issue(
                    "FAIL",
                    path,
                    0,
                    "数据库/状态字段相关报告缺少真实消费入口证据；不能只证明 SQL/同步任务成功。",
                )
            )
        if SYNC_ONLY_RE.search(text) and not TABLE_REVERSE_HEADER_RE.search(text):
            issues.append(
                Issue(
                    "FAIL",
                    path,
                    0,
                    "报告出现同步/写入成功口径，但缺少表字段反向消费方验证；同步成功不能替代业务入口通过。",
                )
            )

    for i, line in enumerate(lines):
        line_no = i + 1
        if "Tests are skipped" in line or "测试被跳过" in line:
            window = "\n".join(lines[max(0, i - 2) : min(len(lines), i + 3)])
            if PASS_WORDS.search(window) and not RISK_WORDS.search(window):
                issues.append(
                    Issue("FAIL", path, line_no, "测试被跳过却被写成通过；BUILD SUCCESS 不能替代 Tests run。")
                )

        for phrase in OLD_PHRASES:
            if phrase in line:
                window = "\n".join(lines[max(0, i - 1) : min(len(lines), i + 2)])
                if re.search(r"(不再包含|不再存在|已清理|旧措辞|旧口径|不得|禁止)", window):
                    issues.append(
                        Issue("WARN", path, line_no, f"报告反向引用旧口径 `{phrase}`；建议改为概括性表述。")
                    )
                else:
                    issues.append(Issue("FAIL", path, line_no, f"报告仍包含旧口径 `{phrase}`。"))

        tests_match = TESTS_RUN_RE.search(line)
        if tests_match:
            command = find_recent_command(lines, i)
            if command:
                command_tests.setdefault(command, set()).add(
                    tuple(int(tests_match.group(n)) for n in range(1, 5))
                )

        command_match = COMMAND_RE.search(line)
        if command_match and line.count("mvn ") == 1:
            normalized = normalize_command(command_match.group(1))
            for ratio in RATIO_RE.finditer(line):
                passed, total = int(ratio.group(1)), int(ratio.group(2))
                if passed == total and total > 0:
                    command_ratios.setdefault(normalized, set()).add((passed, total))

        if repo is not None:
            for class_name, method in ANCHOR_RE.findall(line):
                if class_name.startswith("D"):
                    continue
                if method in {"java", "xml", "yml", "yaml", "properties", "class", "md"}:
                    continue
                if class_name in {"BigDecimal", "LocalDateTime", "DateUtil", "StrUtil"}:
                    continue
                if DELETED_CONTEXT.search(line):
                    continue
                if class_name.endswith(("Test", "DTO", "VO", "PO", "Mapper")):
                    continue
                if not class_seen_in_source(repo, class_name):
                    continue
                if not grep_source(repo, method):
                    issues.append(
                        Issue(
                            "FAIL",
                            path,
                            line_no,
                            f"源码锚点 `{class_name}.{method}` 在当前 src/ 下未找到；若是旧实现请改写为已删除说明。",
                        )
                    )

    for command, results in command_tests.items():
        if len(results) > 1:
            issues.append(Issue("FAIL", path, 0, f"同一测试命令 `{command}` 出现多个 Tests run 结果：{sorted(results)}。"))

    for command, ratios in command_ratios.items():
        tests = command_tests.get(command)
        if not tests:
            continue
        test_totals = {item[0] for item in tests}
        ratio_totals = {item[1] for item in ratios}
        mismatch = ratio_totals - test_totals
        if mismatch:
            issues.append(
                Issue("FAIL", path, 0, f"命令 `{command}` 的 N/N 口径 {sorted(ratios)} 与 Tests run {sorted(tests)} 不一致。")
            )

    if re.search(r"(interconnect|跨仓|sibling)", text, re.I):
        if "Tests are skipped" in text and "临时" not in text and "回滚" not in text:
            issues.append(Issue("FAIL", path, 0, "跨仓报告提到测试被跳过，但缺少临时改 skipTests 后真执行并回滚的证据。"))

    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint SuperBridge Flow test-report evidence")
    parser.add_argument("reports", nargs="+")
    parser.add_argument("--tests", default="")
    parser.add_argument("--repo-root", default="")
    parser.add_argument("--warn-only", action="store_true")
    args = parser.parse_args()

    all_issues: list[Issue] = []
    for report in args.reports:
        path = Path(report).resolve()
        if not path.exists():
            all_issues.append(Issue("FAIL", path, 0, "文件不存在"))
            continue
        repo = Path(args.repo_root).resolve() if args.repo_root else repo_root_for(path)
        tests_path = Path(args.tests).resolve() if args.tests else None
        all_issues.extend(lint_report(path, repo, tests_path))

    printable = []
    for issue in all_issues:
        if args.warn_only and issue.level == "FAIL":
            issue = Issue("WARN", issue.path, issue.line, issue.message)
        printable.append(issue)

    for issue in printable:
        loc = f"{issue.path}:{issue.line}" if issue.line else str(issue.path)
        print(f"{issue.level} [{loc}] {issue.message}")

    failed = any(issue.level == "FAIL" for issue in all_issues)
    if failed and not args.warn_only:
        print("\n[SuperBridge Flow test-report 证据一致性拦截]")
        print("请修正测试数字、假绿、真实链路证据、源码锚点或跨仓证据后重新提交。")
        return 2
    if not failed:
        print("SuperBridge Flow test-report 证据一致性检查通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
