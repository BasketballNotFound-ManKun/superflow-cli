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
import hashlib
import json
import ntpath
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
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
CASE_EVIDENCE_HEADER = re.compile(
    r"^\|\s*(?:用例\s*ID|Case\s*ID)\s*\|\s*(?:入口\s*ID|Entry\s*ID)\s*\|"
    r"\s*(?:验收级别|Acceptance\s*level)\s*\|\s*(?:结果|Result)\s*\|"
    r"\s*(?:证据|Evidence)(?:路径|\s*path)?\s*\|$",
    re.I,
)
CASE_RESULTS = {"PASS", "FAIL", "BLOCKED", "PARTIAL"}
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


def fence_container_line(line: str) -> tuple[str, list]:
    prefixes = []
    text = line
    while True:
        quote = re.match(r"^ {0,3}> ?", text)
        item = re.match(r"^ {0,3}(?:[-+*]|\d{1,9}[.)]) +", text)
        prefix = quote or item
        if prefix is None:
            return text, prefixes
        prefixes.append("quote" if quote else len(prefix[0]))
        text = text[len(prefix[0]):]


def closing_fence_line(line: str, prefixes: list) -> str | None:
    text = line
    for prefix in prefixes:
        pattern = r"^ {0,3}> ?" if prefix == "quote" else r"^ {%d}" % prefix
        match = re.match(pattern, text)
        if match is None:
            return None
        text = text[len(match[0]):]
    return text


def task_list_container(line: str, columns: list[int]) -> tuple[int, bool]:
    indent = len(line) - len(line.lstrip(" "))
    while columns and indent < columns[-1]:
        columns.pop()
    container = columns[-1] if columns else 0
    if indent - container >= 4:
        return container, True
    item = re.match(r"^ *(?:([-+*])|(\d{1,9}[.)]))( +)", line)
    if item:
        marker = item[1] or item[2]
        padding = len(item[3]) if len(item[3]) <= 4 else 1
        columns.append(indent + len(marker) + padding)
    return container, False


def task_comment_line(line: str, in_comment: bool) -> tuple[str, bool]:
    visible = []
    cursor = 0
    while cursor < len(line):
        if in_comment:
            end = line.find("-->", cursor)
            if end < 0:
                return "".join(visible), True
            cursor, in_comment = end + 3, False
        else:
            start = line.find("<!--", cursor)
            if start < 0:
                visible.append(line[cursor:])
                break
            visible.append(line[cursor:start])
            cursor, in_comment = start + 4, True
    return "".join(visible), in_comment


def markdown_body_lines(text: str, task_index: bool = False,
                        preserve_code: bool = False) -> tuple[list[str], bool]:
    """Structural report content only; preserve original line positions."""
    fence = None
    prefixes = []
    unsupported_tab = False
    result = []
    columns: list[int] = []
    in_comment = False
    unsupported_markup = False
    for line in text.splitlines():
        if task_index:
            line = line.expandtabs(4)
        if fence is not None:
            candidate = closing_fence_line(line, prefixes)
            marker = None if candidate is None else re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", candidate)
            if (marker and marker[1][0] == fence[0]
                    and len(marker[1]) >= len(fence)
                    and not marker[2].strip(" \t")):
                fence = None
            result.append(line if preserve_code else "")
            continue
        container = 0
        if not task_index:
            expanded = line.expandtabs(4)
            indentation = len(expanded) - len(expanded.lstrip(" "))
            if not in_comment and indentation >= 4:
                result.append(line if preserve_code else "")
                continue
            line, in_comment = task_comment_line(line, in_comment)
            # Raw HTML/XML needs block/paragraph semantics beyond this narrow
            # Markdown classifier. Fail closed rather than erase current facts.
            if re.match(r"^ {0,3}<(?:/?[A-Za-z]|[?!])", line):
                unsupported_markup = True
        if task_index:
            if in_comment:
                line, in_comment = task_comment_line(line, True)
            if not line.strip():
                result.append("")
                continue
            # Determine the container before erasing blocks. Root fences and
            # comments terminate a prior list; list-local blocks retain it.
            indent = len(line) - len(line.lstrip(" "))
            while columns and indent < columns[-1]:
                columns.pop()
            container = columns[-1] if columns else 0
            if indent - container >= 4:
                result.append("")
                continue
            line, in_comment = task_comment_line(line, in_comment)
            if not line.strip():
                result.append("")
                continue
            container, is_code = task_list_container(line, columns)
            if is_code:
                result.append("")
                continue
        possible_container = re.match(r"^((?:[ \t]*>[ \t]*|[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+)+)(`{3,}|~{3,})", line)
        if possible_container and "\t" in possible_container[1]:
            unsupported_tab = True
        candidate, next_prefixes = fence_container_line(line[container:])
        if container:
            next_prefixes = [container, *next_prefixes]
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", candidate)
        if marker and (marker[1][0] == "~" or "`" not in marker[2]):
            fence = marker[1]
            prefixes = next_prefixes
            result.append(line if preserve_code else "")
        else:
            result.append(line)
    return result, unsupported_markup or unsupported_tab or (fence is not None and bool(prefixes))


def current_report_text(text: str) -> str:
    """Exclude explicitly bounded history, preserving raw evidence and line numbers."""
    body, ambiguous = markdown_body_lines(text)
    if ambiguous:
        return text
    raw_lines, _ = markdown_body_lines(text, preserve_code=True)
    history_level = None
    current = []
    for raw, structural in zip(raw_lines, body):
        heading = re.fullmatch(r" {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?", structural)
        if heading:
            level, title = len(heading[1]), heading[2].strip()
            if history_level is not None and level <= history_level:
                history_level = None
            if title.casefold() in {"history", "historical evidence", "历史记录", "历史证据"}:
                history_level = level if history_level is None else min(level, history_level)
        current.append(raw if history_level is None else "")
    return "\n".join(current)


def task_ids_from_body(lines: list[str]) -> list[str]:
    """Extract IDs only after the canonical parser classified task blocks."""
    return [match[1] for line in lines
            if (match := re.match(r"^ *- \[[ xX]\]\s+([^\s]+)\s", line))]


def final_report_result(text: str) -> str:
    # Current declarations must agree; only explicit history can retain old results.
    return report_summary_result(text, {"验证结果": "zh", "验证结论": "zh",
                                        "Verification Result": "en"},
                                 {"通过": "PASS", "失败": "FAIL"})


def archive_readiness_result(text: str) -> str:
    return report_summary_result(text, {"归档就绪": "zh", "Archive Readiness": "en"},
                                 {"READY": "PASS", "通过": "PASS",
                                  "就绪": "PASS", "失败": "FAIL"})


def report_summary_result(text: str, labels: dict[str, str], aliases: dict[str, str]) -> str:
    lines, ambiguous = markdown_body_lines(current_report_text(text))
    if ambiguous:
        return "INVALID"
    text = "\n".join(lines)
    pattern = "|".join(re.escape(label) for label in labels)
    results = set()
    for match in re.finditer(rf"^({pattern})[ \t]*[:：][ \t]*([^\r\n]*)$", text, re.I | re.M):
        value = match[2].strip().upper()
        # MISSING denotes an absent summary, never an explicit unknown status.
        value = "UNKNOWN" if not value or value == "MISSING" else value
        results.add(aliases.get(value, value))
    if len(results) > 1:
        return "CONFLICT"
    return next(iter(results), "MISSING")


def verified_file(base: Path, value: str) -> Path:
    """Local retained artifacts only. Hashes prove identity, not truthfulness."""
    if not isinstance(value, str) or not value.strip() or re.match(r"^[a-z]+://", value, re.I):
        raise ValueError("需要本地可读取的执行证据，远端 URL 不能作为通过凭据")
    file = (base / value).resolve()
    if not file.is_file() or file.stat().st_size == 0:
        raise ValueError(f"证据文件不存在或无内容：声明值={value!r}；"
                         f"解析基准={base.resolve()}；实际路径={file}")
    return file


def hashed_file(base: Path, value: str, sha256: str) -> Path:
    file = verified_file(base, value)
    if not isinstance(sha256, str) or not re.fullmatch(r"[a-f0-9]{64}", sha256):
        raise ValueError(f"缺少有效 SHA-256：{value}")
    if hashlib.sha256(file.read_bytes()).hexdigest() != sha256:
        raise ValueError(f"证据指纹不一致或源码已变化：{value}")
    return file


def json_equal(left, right) -> bool:
    """JSON numbers are distinct from booleans, recursively at every level."""
    if type(left) in (int, float) and type(right) in (int, float):
        return left == right
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(json_equal(left[k], right[k]) for k in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(json_equal(a, b) for a, b in zip(left, right))
    return left == right


def validate_database_receipt(receipt: dict, event: dict, case: dict,
                              entry: dict, coverage: dict, change: Path,
                              paths: set) -> None:
    """Compare frozen database obligations, never infer SQL semantics."""
    layer = case.get("testLayer")
    database = entry.get("database")
    if (entry.get("persistence") or case.get("assertions", {}).get("persistence")) and not database:
        raise ValueError("旧持久化 PASS 缺少数据库合同，应保留为 PARTIAL")
    for key in ("testLayer", "mockBoundary", "database"):
        if not json_equal(event.get(key), receipt.get(key)):
            raise ValueError(f"原始执行输出与凭证 {key} 不一致")
    if layer is not None and receipt.get("testLayer") != layer:
        raise ValueError("testLayer 与冻结合同不一致")
    if database and layer not in {"logic", "sql-binding", "database", "http-entry"}:
        raise ValueError("数据库义务缺少 testLayer，应保留 PARTIAL")
    if layer not in {"database", "http-entry"} or not database:
        return
    if case.get("evidenceKind") != "real" or receipt.get("evidenceKind") != "real":
        raise ValueError("数据库义务必须使用 real 证据")
    actual = receipt.get("database", {})
    for key in ("engine", "major"):
        if not json_equal(actual.get(key), database.get(key)):
            raise ValueError(f"数据库 {key} 与冻结合同不一致；替代引擎不能 PASS")
    boundary = case.get("mockBoundary")
    if not boundary or not json_equal(receipt.get("mockBoundary"), boundary):
        raise ValueError("mockBoundary 与冻结合同不一致")
    if (not isinstance(boundary.get("allowed"), list)
            or not boundary.get("forbidden")
            or set(boundary["allowed"]) & set(boundary["forbidden"])):
        raise ValueError("必测生产链不得 mock")
    statements = case.get("statements")
    if not statements or not json_equal(actual.get("statements"), statements):
        raise ValueError("生产 SQL statement 身份与冻结用例不一致")
    source_index = {s["id"]: s for s in coverage.get("sources", [])}
    refs = database.get("schemaSourceRefs", []) + [s["sourceRef"] for s in statements]
    if not database.get("schemaSourceRefs"):
        raise ValueError("数据库合同缺少 schema 来源")
    for ref in refs:
        source = source_index[ref]
        source_path = hashed_file(change, source["path"], source["sha256"])
        if source_path not in paths:
            raise ValueError("数据库 schema/生产 SQL 来源未纳入执行源码指纹")
    expected = case.get("databaseAssertions")
    assertions = actual.get("assertions")
    if not expected or not isinstance(assertions, list) or len(assertions) != len(expected):
        raise ValueError("缺少冻结数据库数据断言")
    for frozen, observed in zip(expected, assertions):
        if (any(not json_equal(observed.get(k), frozen.get(k)) for k in ("id", "kind", "expected"))
                or "actual" not in observed or observed.get("result") != "PASS"):
            raise ValueError("数据库数据/影响行数/不变断言未达到冻结预期")
        wanted, found = frozen["expected"], observed["actual"]
        if frozen["kind"] == "unchangedRows":
            if (not isinstance(wanted, dict) or not wanted
                    or any(not isinstance(row, dict) or not row for row in wanted.values())
                    or not isinstance(found, dict) or set(found) != {"before", "after"}
                    or not json_equal(found["before"], wanted) or not json_equal(found["after"], wanted)):
                raise ValueError("非目标/旧轮次缺少 keyed before/after 快照或值发生变化")
        elif not json_equal(found, wanted):
            raise ValueError("数据库数据/影响行数/不变断言未达到冻结预期")


EXECUTION_ENV_KEYS = frozenset([
    "PATH", "PATHEXT", "NODE_ENV", "NODE_OPTIONS", "LANG", "LC_ALL", "TZ", "JAVA_HOME",
])


def validate_execution_context(receipt: dict, event: dict, case: dict, change: Path) -> None:
    """Validate required frozen command, cwd, and non-secret environment bindings."""
    # Additional metadata alone does not establish a frozen context binding.
    binding = case.get("executionContext")
    if (not isinstance(binding, dict)
            or set(binding) != {"argv", "cwd", "environmentKeys"}
            or not isinstance(binding["argv"], list) or not binding["argv"]
            or any(not isinstance(arg, str) or not arg.strip() for arg in binding["argv"])
            or not isinstance(binding["cwd"], str) or not binding["cwd"].strip()
            or Path(binding["cwd"]).is_absolute() or ntpath.isabs(binding["cwd"])
            or bool(ntpath.splitdrive(binding["cwd"])[0])):
        raise ValueError("executionContext 需要冻结 argv、相对 cwd 和 environmentKeys")
    keys = binding["environmentKeys"]
    if (not isinstance(keys, list)
            or any(not isinstance(key, str) or key not in EXECUTION_ENV_KEYS for key in keys)
            or len(set(keys)) != len(keys)):
        raise ValueError("executionContext 环境项必须是受支持且不重复的非秘密运行配置")
    context = receipt.get("executionContext")
    if (not isinstance(context, dict) or set(context) != {"cwd", "environmentSha256"}
            or not json_equal(event.get("executionContext"), context)):
        raise ValueError("原始执行输出与凭证 executionContext 不一致或缺失")
    if not json_equal(receipt["command"]["argv"], binding["argv"]):
        raise ValueError("执行命令与冻结 executionContext.argv 不一致")
    cwd = (change / binding["cwd"]).resolve()
    if (not cwd.is_dir() or not isinstance(context["cwd"], str)
            or context["cwd"] != str(cwd)):
        raise ValueError("执行工作目录与冻结 executionContext.cwd 不一致："
                         f"声明值={binding['cwd']!r}；解析基准={change.resolve()}；"
                         f"实际路径={cwd}；观测工作目录={context['cwd']!r}")
    expected = {
        key: hashlib.sha256(json.dumps(os.environ.get(key), ensure_ascii=False).encode()).hexdigest()
        for key in keys
    }
    if not json_equal(context["environmentSha256"], expected):
        raise ValueError("绑定运行环境已变化或观测缺失；旧结果不能用于当前完整通过")


def validate_execution_receipt(file: Path, case: dict, coverage: dict, change: Path) -> None:
    if case.get("executionEvidence") != "runner-captured.v1":
        raise ValueError("executionEvidence 必须冻结 runner-captured.v1；capture 不能替代缺失合同")
    recovery = ("按 test-guide.md 的首批验证闭环，使用已安装 superflow-test-report-lint.py "
                "--check-execution-plan BUILD_PLAN CASE_PLAN 预检，再 --record-execution PLAN 实际采集；"
                "不转换旧输出或补造实际值，未采集保持 PARTIAL")
    raw = file.read_text(encoding="utf-8")
    try:
        receipt = json.loads(raw)
    except json.JSONDecodeError as error:
        kind = "JUnit/XML" if raw.lstrip().startswith("<") else "JSONL/非回执 JSON"
        raise ValueError(f"{kind} 不是 execution-receipt.v1：{recovery}") from error
    if not isinstance(receipt, dict):
        raise ValueError(f"执行回执需要 JSON object：{recovery}")
    if receipt.get("schemaVersion") != "superflow.execution-receipt.v1":
        label = "measurement 仅为测试观测，" if receipt.get("event") == "superflow.measurement.v1" else ""
        raise ValueError(f"{label}缺少 execution-receipt.v1：{recovery}")
    for key, expected in [("caseId", case["id"]), ("entryId", case["entryId"]),
                          ("level", case["level"]), ("status", "PASS")]:
        if receipt.get(key) != expected:
            raise ValueError(f"执行凭证 {key} 与冻结用例不一致")
    if type(receipt.get("executed")) is not int or receipt["executed"] < 1:
        raise ValueError("用例零执行/占位不能 PASS")
    kind = case.get("evidenceKind", "real")
    if kind not in {"real", "controlled-simulation", "unit"} or receipt.get("evidenceKind") != kind:
        raise ValueError("执行证据等级与冻结合同不一致；模拟不能替代真实入口")
    command = receipt["command"]
    if (not isinstance(command.get("argv"), list) or not command["argv"]
            or any(not isinstance(arg, str) or not arg.strip() for arg in command["argv"])
            or type(command.get("exitCode")) is not int or command["exitCode"] != 0):
        raise ValueError("缺少真实命令或命令退出码非零")
    output = hashed_file(file.parent, command["output"], command["sha256"])
    events = []
    for line in output.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
            if isinstance(event, dict) and event.get("caseId") == case["id"]:
                events.append(event)
        except ValueError:
            continue
    if len(events) != 1:
        raise ValueError("原始输出缺少唯一用例执行事件；未知 ID/零执行不可 PASS")
    event = events[0]
    for key in ["caseId", "entryId", "level", "status", "executed", "assertions", "persistence",
                "evidenceKind", "sources", "build", "target"]:
        if not json_equal(event.get(key), receipt.get(key)):
            raise ValueError(f"原始执行输出与凭证 {key} 不一致")
    if not json_equal(event.get("command"), {"argv": command["argv"], "exitCode": command["exitCode"]}):
        raise ValueError("原始执行命令与凭证不一致")
    validate_execution_context(receipt, event, case, change)
    sources = receipt["sources"]
    if not isinstance(sources, list) or not sources:
        raise ValueError("缺少当前源码/构建指纹")
    paths = set()
    source_tokens = []
    for source in sources:
        paths.add(hashed_file(file.parent, source["path"], source["sha256"]))
        source_tokens.append(source["path"] + ":" + source["sha256"])
    entry = next((e for e in coverage.get("entries", []) if e["id"] == case["entryId"]), None)
    if entry is None:
        raise ValueError("执行凭证缺少冻结入口定义")
    source_index = {s["id"]: s for s in coverage.get("sources", [])}
    for ref in entry.get("sourceRefs", []):
        source = source_index[ref]
        if source.get("role") == "code" and (change / source["path"]).resolve() not in paths:
            raise ValueError("执行凭证未覆盖该入口冻结的源码写入链")
    validate_database_receipt(receipt, event, case, entry, coverage, change, paths)
    build = receipt["build"]
    target = receipt["target"]
    fingerprint = hashlib.sha256("\n".join(sorted(source_tokens)).encode()).hexdigest()
    if build.get("sourceFingerprint") != fingerprint or target.get("sourceFingerprint") != fingerprint:
        raise ValueError("构建与运行目标未绑定当前源码指纹")
    hashed_file(file.parent, build["artifact"], build["sha256"])
    build_command = build["command"]
    if (not isinstance(build_command.get("argv"), list) or not build_command["argv"]
            or type(build_command.get("exitCode")) is not int or build_command["exitCode"] != 0):
        raise ValueError("缺少成功构建命令")
    build_output = hashed_file(file.parent, build_command["output"], build_command["sha256"])
    expected_build = {"event": "build", "buildId": build["id"], "sourceFingerprint": fingerprint,
                      "artifactSha256": build["sha256"], "argv": build_command["argv"], "exitCode": 0}
    build_events = []
    for line in build_output.read_text(encoding="utf-8").splitlines():
        try:
            value = json.loads(line)
            if isinstance(value, dict) and value.get("event") == "build" and value.get("buildId") == build["id"]:
                build_events.append(value)
        except ValueError:
            continue
    if len(build_events) != 1 or not json_equal(build_events[0], expected_build):
        raise ValueError("构建原始输出未关联当前源码与构建产物")
    if target.get("buildSha256") != build["sha256"]:
        raise ValueError("运行目标不是本次验证的构建产物")
    if not isinstance(build.get("id"), str) or not build["id"].strip() or target.get("buildId") != build["id"]:
        raise ValueError("真实运行目标与构建指纹不一致")
    for key, expected in [("service", entry.get("service", entry["id"])),
                          ("route", entry["route"]), ("kind", case["level"])]:
        if target.get(key) != expected:
            raise ValueError(f"真实运行目标 {key} 与冻结入口不一致")
    validate_measurement_assertions(receipt, case)

    # Every PASS needs observed execution, including cases without a declaration.
    case_capture = validate_capture(file.parent, receipt, "case")
    build_capture = validate_capture(file.parent, build, "build")
    if case_capture["startedNs"] < build_capture["finishedNs"]:
        raise ValueError("case capture 早于绑定构建完成，不能重绑新构建身份")


def validate_measurement_assertions(receipt: dict, case: dict) -> None:
    assertions = receipt["assertions"]
    required = set(case.get("assertions", {})) - {"persistence"}
    required |= {"response", "state", "forbiddenEffects"}
    if not isinstance(assertions, list) or {a["id"] for a in assertions} != required or len(assertions) != len(required):
        raise ValueError("缺少冻结响应/状态/禁止副作用断言")
    for assertion in assertions:
        if (assertion.get("result") != "PASS" or "expected" not in assertion
                or "actual" not in assertion or not json_equal(assertion["expected"], assertion["actual"])):
            raise ValueError("断言失败或缺少预期值/实际值")
    expected_writes = case.get("assertions", {}).get("persistence", [])
    writes = receipt.get("persistence", [])
    if not isinstance(writes, list) or len(writes) != len(expected_writes):
        raise ValueError("缺少持久化字段同业务 ID 的调用前后对照")
    for expected, actual in zip(expected_writes, writes):
        for key in ["id", "table", "field", "expected"]:
            if key not in actual or not json_equal(actual[key], expected[key]):
                raise ValueError("持久化断言与冻结字段/预期值不一致")
        before, after = actual["before"], actual["after"]
        if (not before.get("businessId") or before["businessId"] != after.get("businessId")
                or "value" not in before or "value" not in after
                or not json_equal(after["value"], expected["expected"])
                or (after["value"] is None and not expected.get("allowNull", False))
                or actual.get("result") != "PASS"):
            raise ValueError("持久化值未达到预期；结构存在/全 NULL/跨业务 ID 不能替代写入")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def execution_file_identity(file: Path) -> tuple:
    """Existing aliases share device/inode; future files use resolved paths."""
    file = file.resolve()
    try:
        observed = file.stat()
    except (FileNotFoundError, NotADirectoryError):
        return ("path", str(file))
    return ("file", observed.st_dev, observed.st_ino)


def captured_sources(cwd: Path, sources: list, base: Path) -> list:
    if (not isinstance(sources, list) or not sources
            or any(not isinstance(source, str) or not source.strip() for source in sources)):
        raise ValueError("capture sources 需要完整且不重复的显式文件清单；目录须先展开")
    files, errors = [], []
    for source in sources:
        try:
            files.append(verified_file(cwd, source))
        except (OSError, ValueError) as error:
            errors.append(str(error))
    if errors:
        raise ValueError("sources 需要显式非空文件，目录须先展开：" + "；".join(errors))
    if len({execution_file_identity(file) for file in files}) != len(files):
        raise ValueError("capture sources 解析后存在重复文件；请去重显式文件清单")
    return [{"path": os.path.relpath(file, base),
             "sha256": sha256_bytes(file.read_bytes())} for file in files]


def source_fingerprint(sources: list) -> str:
    return sha256_bytes("\n".join(sorted(s["path"] + ":" + s["sha256"]
                                        for s in sources)).encode())


def canonical_module(relative: str, label: str = "规范模块") -> Path:
    # Reuse installed canonical policies; do not maintain parallel parsers.
    executable = shutil.which("superflow")
    roots = list(Path(__file__).resolve().parents)
    if executable:
        roots += list(Path(executable).resolve().parents)
    for root in roots:
        # npm's Windows shim is a regular .cmd file, not a Unix symlink.
        for package in (root, root / "node_modules/@chenmk/superflow"):
            candidate = package / relative
            if candidate.is_file():
                return candidate
    raise ValueError(f"缺少已构建的{label} {relative}；请修复 Superflow 安装")


def capture_redactor() -> Path:
    # Reuse the installed canonical redactor; never ship a second regex policy.
    return canonical_module("dist/domains/managed-work/redaction.js", "规范脱敏器")


def redact_capture(values: list, redactor: Path) -> list:
    script = """import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {redactManagedLog,redactManagedValue}=await import(pathToFileURL(process.argv[1]));
const values=JSON.parse(fs.readFileSync(0,'utf8'));
console.log(JSON.stringify(values.map(v=>typeof v==='string'?redactManagedLog(v):redactManagedValue(v))));"""
    result = subprocess.run(["node", "--input-type=module", "-e", script, str(redactor)],
                            input=json.dumps(values), capture_output=True, text=True)
    if result.returncode:
        raise ValueError("capture 规范脱敏失败；未写入原始敏感内容")
    return json.loads(result.stdout)


class CaptureOutputConflict(ValueError):
    """Recorder must stop without attempting another evidence write."""


def write_capture_text(file: Path, value: str, write_guard) -> None:
    write_guard(file)
    file.write_text(value, encoding="utf-8")


def observe_command(argv: list, cwd: Path, output: Path, kind: str,
                    sources: list, redactor: Path, write_guard, case_ids=None) -> dict:
    if (not isinstance(argv, list) or not argv
            or any(not isinstance(arg, str) or not arg.strip() for arg in argv)):
        raise ValueError("capture 需要非空 argv 数组，不使用隐式 Shell")
    before = captured_sources(output.parent, [s["path"] for s in sources], output.parent)
    started = time.time_ns()
    print(f"capture {kind} 开始；startedNs={started}", flush=True)
    try:
        child = subprocess.Popen(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"capture {kind} 运行中；pid={child.pid}", flush=True)
        stdout, stderr = child.communicate()
        exit_code = child.returncode
    except OSError as error:
        exit_code, stdout, stderr = 127, b"", str(error).encode()
    finished = time.time_ns()
    print(f"capture {kind} 结束；exitCode={exit_code}；elapsedMs={(finished-started)//1000000}", flush=True)
    stdout_text, stderr_text, safe_argv = redact_capture(
        [stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace"), argv], redactor)
    # The first persisted bytes already pass the same redactor as Runner logs.
    captured = {"schemaVersion": "superflow.execution-capture.v1", "kind": kind,
                "argv": safe_argv, "cwd": str(cwd), "exitCode": exit_code,
                "startedNs": started, "finishedNs": finished, "sourcesBefore": before}
    if kind == "case":
        captured["caseIds"] = case_ids
    for key, value in [("stdout", stdout_text), ("stderr", stderr_text)]:
        file = output.with_suffix("." + key + ".log")
        write_capture_text(file, value, write_guard)
        captured[key] = {"path": file.name, "sha256": sha256_bytes(file.read_bytes())}
    try:
        captured["sourcesAfter"] = captured_sources(
            output.parent, [s["path"] for s in sources], output.parent)
    except (OSError, ValueError) as error:
        # A failed after-snapshot must not erase the process that already ran.
        captured["sourcesAfter"] = None
        captured["sourceObservationError"] = redact_capture([str(error)], redactor)[0]
    file = output.with_suffix(".capture.json")
    write_capture_text(file, json.dumps(captured, ensure_ascii=False), write_guard)
    return {"path": file.name, "sha256": sha256_bytes(file.read_bytes())}


def validate_capture(base: Path, record: dict, kind: str) -> dict:
    reference = record.get("capture")
    if not isinstance(reference, dict):
        raise ValueError("缺少 runner capture；旧/合成凭证应保留为 PARTIAL")
    file = hashed_file(base, reference["path"], reference["sha256"])
    captured = json.loads(file.read_text(encoding="utf-8"))
    if (captured.get("schemaVersion") != "superflow.execution-capture.v1"
            or captured.get("kind") != kind
            or type(captured.get("exitCode")) is not int or captured["exitCode"] != 0
            or not json_equal(captured.get("argv"), record["command"]["argv"])
            or captured.get("exitCode") != record["command"]["exitCode"]
            or type(captured.get("startedNs")) is not int
            or type(captured.get("finishedNs")) is not int
            or captured["finishedNs"] < captured["startedNs"]):
        raise ValueError("capture 命令、退出码或执行时间不一致")
    sources = captured.get("sourcesBefore")
    if not sources or not json_equal(sources, captured.get("sourcesAfter")):
        raise ValueError("capture 执行期间源码发生变化")
    for source in sources:
        hashed_file(base, source["path"], source["sha256"])
    if not json_equal(sources, record.get("sources")):
        raise ValueError("capture 源码清单与凭证不一致")
    if kind == "build" and source_fingerprint(sources) != record.get("sourceFingerprint"):
        raise ValueError("capture 构建源码清单与构建指纹不一致")
    streams = {}
    for key in ("stdout", "stderr"):
        stream = captured[key]
        stream_file = (base / stream["path"]).resolve()
        # Empty stderr/stdout are valid captured process facts.
        if not stream_file.is_file() or sha256_bytes(stream_file.read_bytes()) != stream["sha256"]:
            raise ValueError("capture 原始输出缺失或指纹不一致")
        streams[key] = stream_file.read_text(encoding="utf-8")
    if kind == "case":
        if captured.get("cwd") != record.get("executionContext", {}).get("cwd"):
            raise ValueError("capture 实际工作目录与冻结执行上下文不一致")
        case_ids = captured.get("caseIds")
        if (not isinstance(case_ids, list) or not case_ids
                or any(not isinstance(value, str) for value in case_ids)
                or len(set(case_ids)) != len(case_ids) or record["caseId"] not in case_ids):
            raise ValueError("capture 缺少唯一同次 Case 清单")
        observed_ids = [event.get("caseId") for event in measurement_events(streams["stdout"])]
        if sorted(observed_ids, key=str) != sorted(case_ids):
            raise ValueError("capture measurement Case 清单遗漏、重复或包含未声明事件")
        measured = measurement_event(streams["stdout"], record["caseId"])
        for key in ("executed", "assertions", "persistence", "target", "database", "mockBoundary", "testLayer"):
            if not json_equal(measured.get(key), record.get(key)):
                raise ValueError(f"capture 实测 {key} 与凭证不一致")
        if not json_equal(sources, record.get("sources")):
            raise ValueError("capture 用例源码清单与凭证不一致")
    return captured


def measurement_events(stdout: str) -> list:
    events = []
    for line in stdout.splitlines():
        try:
            value = json.loads(line)
            if isinstance(value, dict) and value.get("event") == "superflow.measurement.v1":
                events.append(value)
        except ValueError:
            continue
    return events


def measurement_event(stdout: str, case_id: str) -> dict:
    selected = [event for event in measurement_events(stdout) if event.get("caseId") == case_id]
    if len(selected) != 1:
        raise ValueError(f"capture measurement 缺少唯一实测事件 {case_id}；不能按 expected 生成 actual")
    return selected[0]


def measurement_diagnostics(stdout: str, prepared: list) -> list:
    """Read-only structural observations; only receipt validation can award PASS."""
    events = measurement_events(stdout)
    problems = []
    selected = {item["case"]["id"] for item in prepared if item.get("case")}
    for event in events:
        if not isinstance(event.get("caseId"), str) or event["caseId"] not in selected:
            problems.append(f"measurement 未声明 Case: {event.get('caseId')!r}")
    for item in prepared:
        case, entry = item["case"], item["entry"]
        prefix = f"measurement {case['id']}: "
        matches = [event for event in events if event.get("caseId") == case["id"]]
        if len(matches) != 1:
            problems.append(prefix + f"需要唯一事件，实际 {len(matches)}")
            continue
        event = matches[0]
        if type(event.get("executed")) is not int or event["executed"] < 1:
            problems.append(prefix + "executed 必须为正整数")
        assertions = event.get("assertions")
        required = (set(case.get("assertions", {})) - {"persistence"}) | {"response", "state", "forbiddenEffects"}
        if (not isinstance(assertions, list) or any(not isinstance(value, dict) or not isinstance(value.get("id"), str) for value in assertions)
                or {value.get("id") for value in assertions} != required or len(assertions) != len(required)):
            problems.append(prefix + "assertions 缺少唯一冻结 response/state/forbiddenEffects")
        else:
            for assertion in assertions:
                if (assertion.get("result") != "PASS" or "expected" not in assertion or "actual" not in assertion
                        or not json_equal(assertion["expected"], assertion["actual"])):
                    problems.append(prefix + f"assertions {assertion.get('id')} 失败或缺少 expected/actual")
        target = event.get("target")
        if not isinstance(target, dict):
            problems.append(prefix + "target 缺少当前构建/源码/入口身份")
        else:
            expected = {"service": entry.get("service", entry["id"]), "route": entry["route"], "kind": case["level"]}
            build = item.get("build")
            if build:
                expected.update(buildId=build["id"], buildSha256=build["sha256"], sourceFingerprint=build["sourceFingerprint"])
            else:
                problems.append(prefix + "target 当前构建尚未执行，无法核验构建身份")
            for key, value in expected.items():
                if not json_equal(target.get(key), value):
                    problems.append(prefix + f"target.{key} 与冻结入口/当前构建不一致")
        try:
            validate_measurement_assertions(event, case)
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            problems.append(prefix + f"assertions/persistence: {error}")
        if not isinstance(event.get("persistence", []), list):
            problems.append(prefix + "persistence 必须为数组")
        elif len(event.get("persistence", [])) != len(case.get("assertions", {}).get("persistence", [])):
            problems.append(prefix + "persistence 数量与冻结合同不一致")
        try:
            paths = {(item["output"].parent / source["path"]).resolve()
                     for source in (item.get("build") or {}).get("sources", [])}
            validate_database_receipt({"evidenceKind": case.get("evidenceKind", "real"), **event},
                                      event, case, entry, item["coverage"], item["change"], paths)
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            problems.append(prefix + f"database: {error}")
    return problems


def write_capture_record(output: Path, record: dict, event: dict, write_guard) -> None:
    event_file = output.with_name(output.stem + ".attempt-" + uuid.uuid4().hex + ".events.jsonl")
    write_capture_text(event_file, json.dumps(event, ensure_ascii=False) + "\n", write_guard)
    record["command"].update(output=event_file.name, sha256=sha256_bytes(event_file.read_bytes()))
    write_capture_text(output, json.dumps(record, ensure_ascii=False), write_guard)


def execution_plan_path(base: Path, value, label: str) -> Path:
    if (not isinstance(value, str) or not value.strip()
            or re.match(r"^[a-z]+://", value, re.I)
            or Path(value).is_absolute() or ntpath.isabs(value)
            or bool(ntpath.splitdrive(value)[0])):
        raise ValueError(f"{label} 必须是相对路径；解析基准={base.resolve()}")
    return (base / value).resolve()


def execution_output_files(output: Path) -> list:
    return [output] + [output.with_suffix(suffix) for suffix in (
        ".stdout.log", ".stderr.log", ".capture.json", ".events.jsonl")]


def execution_id_index(items, label: str) -> dict:
    if not isinstance(items, list) or not items:
        raise ValueError(f"{label} ID 清单不能为空")
    result = {}
    for item in items:
        if (not isinstance(item, dict) or not isinstance(item.get("id"), str)
                or not item["id"].strip()):
            raise ValueError(f"{label} 缺少非空 ID")
        if item["id"] in result:
            raise ValueError(f"{label} 重复 ID: {item['id']}")
        result[item["id"]] = item
    return result


def prepare_execution_plan(plan_file: Path, allow_pending_build: bool = False, override=None) -> dict:
    """One read-only preparation path for preview and actual capture."""
    base = plan_file.parent
    plan = override if override is not None else json.loads(verified_file(base, plan_file.name).read_text(encoding="utf-8"))
    if not isinstance(plan, dict):
        raise ValueError("plan 必须为 JSON object")
    prepared = {"plan": plan, "planFile": plan_file, "inputs": {plan_file},
                "buildEvidence": set(), "errors": [], "dependency": None}
    errors = prepared["errors"]

    def check(label, action):
        try:
            return action()
        except (OSError, ValueError, KeyError, TypeError, StopIteration) as error:
            errors.append(f"{label}: {error}")
            return None

    def path_value(key, root=base):
        return execution_plan_path(root, plan.get(key), f"plan.{key}")

    output = check("output", lambda: path_value("output"))
    prepared["output"] = output
    if output:
        for file in execution_output_files(output):
            if file.exists() and not file.is_file():
                errors.append(f"output 不是普通文件路径：{file}")
        parent = output.parent
        while not parent.exists() and parent != parent.parent:
            parent = parent.parent
        if not parent.is_dir():
            errors.append(f"output 父路径不是目录：{parent}")
    kind = plan.get("kind")
    if kind == "build":
        cwd = check("cwd", lambda: path_value("cwd"))
        prepared["cwd"] = cwd
        if cwd is not None and not cwd.is_dir():
            errors.append(f"cwd 目录不存在：声明值={plan.get('cwd')!r}；"
                          f"解析基准={base}；实际路径={cwd}")
        argv = plan.get("argv")
        if (not isinstance(argv, list) or not argv
                or any(not isinstance(arg, str) or not arg.strip() for arg in argv)):
            errors.append("argv 需要非空字符串数组，不使用隐式 Shell")
        sources = check("sources", lambda: captured_sources(cwd or base, plan.get("sources"),
                                                            output.parent if output else base))
        prepared["sources"] = sources
        if sources:
            source_base = output.parent if output else base
            prepared["inputs"].update((source_base / source["path"]).resolve() for source in sources)
        artifact = check("artifact", lambda: path_value("artifact", cwd or base))
        prepared["artifact"] = artifact
        if artifact:
            prepared["inputs"].add(artifact)
            if artifact.exists() and not artifact.is_file():
                errors.append(f"artifact 必须是一个真实文件产物：{artifact}")
    elif kind == "case":
        change = check("changeDir", lambda: path_value("changeDir"))
        prepared["change"] = change
        if change is not None and not change.is_dir():
            errors.append(f"case plan.changeDir 指向的 change 目录不存在："
                          f"声明值={plan.get('changeDir')!r}；解析基准={base}；实际路径={change}")
        def review_input():
            path_value("review")
            return verified_file(base, plan.get("review"))
        review = check("review", review_input)
        if review:
            prepared["inputs"].add(review)
            coverage = check("review.coverage", lambda: json.loads(review.read_text())["coverage"])
            prepared["coverage"] = coverage
            if not isinstance(coverage, dict):
                errors.append("review.coverage 必须是 JSON object，修复原 coverage 合同")
            if isinstance(coverage, dict):
                cases = check("Case", lambda: execution_id_index(coverage.get("cases"), "Case"))
                entries = check("Entry", lambda: execution_id_index(coverage.get("entries"), "Entry"))
                case = cases.get(plan.get("caseId")) if cases and isinstance(plan.get("caseId"), str) else None
                prepared["case"] = case
                if case is None:
                    errors.append(f"caseId 必须对应唯一冻结 Case ID：{plan.get('caseId')!r}")
                else:
                    if case.get("executionEvidence") != "runner-captured.v1":
                        errors.append("executionEvidence 必须冻结 runner-captured.v1")
                    entry = entries.get(case.get("entryId")) if entries and isinstance(case.get("entryId"), str) else None
                    prepared["entry"] = entry
                    if entry is None:
                        errors.append(f"entryId 缺少唯一冻结 Entry：{case.get('entryId')!r}")
                    else:
                        check("冻结入口/用例", lambda: validate_plan_case_shape(case, entry))
                    context = case.get("executionContext")
                    if isinstance(context, dict) and change:
                        cwd = check("executionContext.cwd", lambda: execution_plan_path(
                            change, context.get("cwd"), "executionContext.cwd"))
                        prepared["cwd"] = cwd
                        observed = {"cwd": str(cwd), "environmentSha256": {}}
                        keys = context.get("environmentKeys")
                        if isinstance(keys, list) and all(isinstance(key, str) for key in keys):
                            observed["environmentSha256"] = {
                                key: sha256_bytes(json.dumps(os.environ.get(key), ensure_ascii=False).encode())
                                for key in keys}
                        prepared["observedContext"] = observed
                        check("executionContext", lambda: validate_execution_context(
                            {"command": {"argv": context.get("argv")}, "executionContext": observed},
                            {"executionContext": observed}, case, change))
                    else:
                        errors.append("executionContext 需要冻结 argv、相对 cwd 和 environmentKeys")
        build_file = check("build", lambda: path_value("build"))
        prepared["buildFile"] = build_file
        if build_file:
            if output and build_file.parent != output.parent:
                errors.append("capture 构建和用例凭证须保存在同一证据目录："
                              f"声明值={plan.get('build')!r}；解析基准={base}；"
                              f"实际路径={build_file}；用例凭证目录={output.parent}")
            if not build_file.exists() and allow_pending_build:
                prepared["dependency"] = "BUILD_NOT_RUN"
            else:
                def load_build():
                    file = verified_file(base, plan.get("build"))
                    build = json.loads(file.read_text())
                    capture = validate_capture(file.parent, build, "build")
                    for reference in (build["capture"], build["command"], capture["stdout"], capture["stderr"]):
                        prepared["buildEvidence"].add((file.parent / reference.get("path", reference.get("output"))).resolve())
                    prepared["inputs"].add(hashed_file(file.parent, build["artifact"], build["sha256"]))
                    prepared["inputs"].update((file.parent / item["path"]).resolve() for item in build["sources"])
                    return build
                prepared["build"] = check("build", load_build)
    else:
        errors.append("capture plan.kind 必须为 build 或 case")
    return prepared


def validate_plan_case_shape(case: dict, entry: dict) -> None:
    """Check declared shapes, not the semantic sufficiency owned by review."""
    problems = []
    if entry.get("kind") not in ("browser", "api", "job", "event", "library", "cli"):
        problems.append("entry.kind 无效")
    if case.get("level") != entry.get("kind"):
        problems.append("case.level 与 entry.kind 不一致")
    for key in ("service", "route"):
        value = entry.get(key, entry["id"] if key == "service" else None)
        if not isinstance(value, str) or not value.strip():
            problems.append(f"entry.{key} 需要非空字符串")
    if case.get("evidenceKind", "real") not in ("real", "controlled-simulation", "unit"):
        problems.append("case.evidenceKind 无效")
    if "assertions" in case:
        assertions = case["assertions"]
        if (not isinstance(assertions, dict)
                or any(not isinstance(assertions.get(key), str) or not assertions[key].strip()
                       for key in ("response", "state", "forbiddenEffects"))
                or not isinstance(assertions.get("persistence", []), list)):
            problems.append("case.assertions 需要 response/state/forbiddenEffects 字符串及可选 persistence 数组")
    if "testLayer" in case and case["testLayer"] not in ("logic", "sql-binding", "database", "http-entry"):
        problems.append("case.testLayer 无效")
    assertions = case.get("assertions")
    writes = assertions.get("persistence", []) if isinstance(assertions, dict) else []
    if isinstance(writes, list):
        ids = []
        for write in writes:
            if (not isinstance(write, dict)
                    or any(not isinstance(write.get(key), str) or not write[key].strip()
                           for key in ("id", "table", "field"))
                    or "expected" not in write
                    or (write["expected"] is None and write.get("allowNull") is not True)):
                problems.append("assertions.persistence 需要 id/table/field/expected；NULL 预期需 allowNull=true")
                break
            ids.append(write["id"])
        if len(set(ids)) != len(ids):
            problems.append("assertions.persistence 存在重复 ID")
    if entry.get("database") and case.get("testLayer") not in ("logic", "sql-binding", "database", "http-entry"):
        problems.append("数据库义务需要冻结有效 testLayer")
    if (entry.get("persistence") or writes) and not entry.get("database"):
        problems.append("persistence 义务需要冻结 Entry.database 合同")
    real_database = bool(entry.get("database")) and case.get("testLayer") in ("database", "http-entry")
    if "mockBoundary" in case or real_database:
        boundary = case.get("mockBoundary")
        if (not isinstance(boundary, dict)
                or any(not isinstance(boundary.get(key), list)
                       or any(not isinstance(value, str) or not value.strip() for value in boundary[key])
                       for key in ("allowed", "forbidden"))
                or (real_database and not boundary["forbidden"])
                or set(boundary["allowed"]) & set(boundary["forbidden"])):
            problems.append("case.mockBoundary 需要 allowed/非空 forbidden 字符串数组且不得相交")
    if problems:
        raise ValueError("；".join(problems) + "；修复原 coverage/tests 合同后重跑计划检查")


def execution_output_issues(prepared: list, plan_files: list) -> list:
    """Inspect current output identities without creating or changing files."""
    errors = []
    identities = {}

    def identity(file):
        if file is None:
            return None
        if file not in identities:
            identities[file] = execution_file_identity(file)
        return identities[file]

    def same_file(left, right):
        return left is not None and right is not None and identity(left) == identity(right)
    inputs = set(plan_files)
    for item in prepared:
        inputs.update(item["inputs"])
        item["buildEvidenceIdentities"] = {identity(file) for file in item["buildEvidence"]}
    input_identities = {identity(file) for file in inputs}
    outputs, output_identities = set(), set()
    for item in prepared:
        if not item["output"]:
            continue
        for file in dict.fromkeys(execution_output_files(item["output"]) + item.get("runtimeOutputs", [])):
            file = file.resolve()
            # Explicit plan/review/source/artifact inputs never receive an
            # exemption, even if the same path also serves as a build receipt.
            collision = (identity(file) in input_identities
                         or any(file in source.parents or source in file.parents for source in inputs))
            for other in prepared:
                producer = (item["plan"].get("kind") == "build"
                            and same_file(item["output"], other.get("buildFile")))
                if same_file(file, other.get("buildFile")) and not (producer and same_file(file, item["output"])):
                    collision = True
                # These facts were discovered by reading the dependency, not
                # declared as inputs. Its producer may regenerate its own logs;
                # explicit review/source references above remain protected.
                if identity(file) in other["buildEvidenceIdentities"] and not producer:
                    collision = True
            if (collision or identity(file) in output_identities
                    or any(file in output.parents or output in file.parents for output in outputs)):
                message = f"output 覆盖输入或同批输出：{file}"
                item["errors"].append(message)
                errors.append(f"{item['planFile']}: {message}")
            outputs.add(file)
            output_identities.add(identity(file))
    return errors


def check_execution_plans(plan_files: list, allow_pending_build: bool = True) -> tuple:
    prepared, errors = [], []
    for file in plan_files:
        try:
            plan = json.loads(file.read_text(encoding="utf-8"))
            selected = plan.get("cases") if isinstance(plan, dict) else None
            if selected is not None:
                if (plan.get("kind") != "case" or not isinstance(selected, list) or not selected
                        or "caseId" in plan or "output" in plan
                        or any(not isinstance(value, dict) or set(value) != {"caseId", "output"}
                               for value in selected)):
                    raise ValueError("cases 需要非空 {caseId, output} 数组，不能混用顶层 caseId/output")
                ids = [value["caseId"] for value in selected]
                if any(not isinstance(value, str) for value in ids) or len(set(ids)) != len(ids):
                    raise ValueError("cases caseId 必须唯一且为字符串")
            group = []
            for selection in selected if selected is not None else [None]:
                expanded = {**plan, **selection} if selection is not None else plan
                item = prepare_execution_plan(file, allow_pending_build, expanded)
                prepared.append(item)
                group.append(item)
                errors.extend(f"{file}: {error}" for error in item["errors"])
            if selected is not None:
                contexts = [value.get("case", {}).get("executionContext") for value in group if value.get("case")]
                if (len(contexts) != len(group) or any(not json_equal(contexts[0], value) for value in contexts)
                        or len({value["output"].parent for value in group if value.get("output")}) != 1):
                    raise ValueError("cases 同次执行必须共享冻结 executionContext 和证据目录")
        except (OSError, ValueError, KeyError, TypeError) as error:
            errors.append(f"{file}: {error}")
    for item in prepared:
        if item["plan"].get("kind") != "case" or not item.get("case") or not item.get("entry"):
            continue
        producer = next((other for other in prepared if other["plan"].get("kind") == "build"
                         and other["output"] is not None and item.get("buildFile") is not None
                         and execution_file_identity(other["output"]) == execution_file_identity(item["buildFile"])), None)
        source_paths = set()
        if item.get("build"):
            source_paths = {(item["buildFile"].parent / source["path"]).resolve()
                            for source in item["build"]["sources"]}
        elif producer and producer.get("sources"):
            source_paths = {(producer["output"].parent / source["path"]).resolve()
                            for source in producer["sources"]}
        try:
            coverage = item["coverage"]
            if item["entry"].get("sourceRefs"):
                index = execution_id_index(coverage.get("sources"), "来源 sources")
                for ref in item["entry"]["sourceRefs"]:
                    source = index.get(ref)
                    if source is None:
                        raise ValueError(f"sources 缺少冻结来源 ID：{ref}")
                    if source.get("role") == "code":
                        file = verified_file(item["change"], source.get("path"))
                        item["inputs"].add(file)
                        if ((item.get("build") or producer)
                                and execution_file_identity(file) not in {execution_file_identity(source) for source in source_paths}):
                            raise ValueError(f"sources 未覆盖该入口冻结的源码写入链：{file}")
        except (OSError, ValueError, KeyError, TypeError) as error:
            message = f"sources: {error}"
            item["errors"].append(message)
            errors.append(f"{item['planFile']}: {message}")
    errors.extend(execution_output_issues(prepared, plan_files))
    return prepared, errors


def snapshot_owned_receipt(output: Path, kind: str, redactor: Path, write_guard) -> None:
    """Only the verified current pointer is replaced; immutable attempts stay in place."""
    if not output.exists():
        return
    if output.is_symlink() or not output.is_file():
        raise CaptureOutputConflict("当前 output 不是已核实的普通回执；保留未知资产原位")
    original = output.read_bytes()
    try:
        text = original.decode("utf-8")
        record = json.loads(text)
        if (not isinstance(record, dict) or record.get("status") not in {"PASS", "PARTIAL"}
                or not isinstance(record.get("sources"), list)
                or (kind == "case" and record.get("schemaVersion") != "superflow.execution-receipt.v1")
                or (kind == "build" and not isinstance(record.get("id"), str))):
            raise ValueError("不是当前 capture 回执")

        def owned_reference(reference, path_key="path"):
            value = reference[path_key]
            if (not isinstance(value, str) or Path(value).name != value
                    or not re.fullmatch(r".+\.attempt-[0-9a-f]{32}\.(capture\.json|events\.jsonl|stdout\.log|stderr\.log)", value)):
                raise ValueError("引用不是同目录的不可变 attempt")
            file = output.parent / value
            if (file.is_symlink() or not file.is_file()
                    or sha256_bytes(file.read_bytes()) != reference["sha256"]):
                raise ValueError("attempt 引用不是已核实普通文件")
            return file

        capture = json.loads(owned_reference(record["capture"]).read_text(encoding="utf-8"))
        if (capture.get("schemaVersion") != "superflow.execution-capture.v1"
                or capture.get("kind") != kind
                or capture.get("argv") != record["command"]["argv"]
                or capture.get("exitCode") != record["command"]["exitCode"]):
            raise ValueError("capture 身份与当前回执不一致")
        owned_reference(record["command"], "output")
        for stream in ("stdout", "stderr"):
            owned_reference(capture[stream])
        if not json_equal(redact_capture([record], redactor)[0], record):
            raise ValueError("当前原件含未脱敏内容，拒绝复制")
    except (UnicodeError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise CaptureOutputConflict(f"output 所有权无法核实；未知资产原位保留：{error}") from error
    saved = output.with_name(output.stem + ".previous-" + uuid.uuid4().hex + output.suffix)
    write_guard(saved)
    with saved.open("xb") as stream:
        stream.write(original)


def record_execution(plan_file: Path) -> int:
    prepared, errors = check_execution_plans([plan_file], allow_pending_build=False)
    if errors:
        raise ValueError("\n".join(errors))
    item = prepared[0]
    plan = item["plan"]
    output = item["output"]

    def write_guard(file=None):
        if file is not None and all(file not in execution_output_files(selected["output"]) for selected in prepared):
            item.setdefault("runtimeOutputs", [])
            if file not in item["runtimeOutputs"]:
                item["runtimeOutputs"].append(file)
        # Never reuse pre-command inode observations: the child may have created
        # or replaced an output path. Preserve conflicting inputs, not PARTIAL.
        issues = execution_output_issues(prepared, [plan_file])
        if issues:
            raise CaptureOutputConflict("\n".join(issues))

    redactor = capture_redactor()
    # Validate executable/module availability before running a side-effecting
    # command whose output would otherwise have no safe persistence path.
    redact_capture([], redactor)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Never infer ownership from legacy sidecar names, or copy their targets.
    # Raw attempt files already have immutable names and need no duplicate copy.
    for previous in prepared:
        write_guard()
        snapshot_owned_receipt(previous["output"], plan["kind"], redactor, write_guard)
    attempt = output.with_name(output.stem + ".attempt-" + uuid.uuid4().hex + output.suffix)
    if plan.get("kind") == "build":
        cwd = item["cwd"]
        sources = item["sources"]
        capture = observe_command(plan["argv"], cwd, attempt, "build", sources, redactor, write_guard)
        facts = json.loads((output.parent / capture["path"]).read_text())
        artifact = item["artifact"]
        record = {"id": "build-" + uuid.uuid4().hex, "sources": sources, "status": "PARTIAL",
                  "sourceFingerprint": source_fingerprint(sources), "capture": capture,
                  "artifact": os.path.relpath(artifact, output.parent),
                  "sha256": sha256_bytes(artifact.read_bytes()) if artifact.is_file() else None,
                  "command": {"argv": facts["argv"], "exitCode": facts["exitCode"]}}
        event = {"event": "build", "buildId": record["id"],
                 "sourceFingerprint": record["sourceFingerprint"], "artifactSha256": record["sha256"],
                 "argv": facts["argv"], "exitCode": facts["exitCode"]}
        write_capture_record(output, record, event, write_guard)
        validate_capture(output.parent, record, "build")
        if not record["sha256"]:
            raise ValueError("capture 构建未生成产物")
        record["status"] = "PASS"
        write_capture_text(output, json.dumps(record, ensure_ascii=False), write_guard)
    elif plan.get("kind") == "case":
        build = item["build"]
        context = item["case"]["executionContext"]
        capture = observe_command(context["argv"], item["cwd"], attempt, "case",
                                  build["sources"], redactor, write_guard,
                                  [selected["case"]["id"] for selected in prepared])
        facts = json.loads((output.parent / capture["path"]).read_text())
        stdout = (output.parent / facts["stdout"]["path"]).read_text()
        diagnostics = measurement_diagnostics(stdout, prepared)
        for selected in prepared:
            case = selected["case"]
            destination = selected["output"]
            record = {"schemaVersion": "superflow.execution-receipt.v1", "caseId": case["id"],
                      "entryId": case["entryId"], "level": case["level"], "status": "PARTIAL",
                      "evidenceKind": case.get("evidenceKind", "real"), "sources": build["sources"],
                      "build": build, "capture": capture,
                      "command": {"argv": facts["argv"], "exitCode": facts["exitCode"]},
                      "executionContext": selected["observedContext"]}
            try:
                measured = measurement_event(stdout, case["id"])
                for key in ("executed", "assertions", "persistence", "target", "database", "mockBoundary", "testLayer"):
                    if key in measured:
                        record[key] = measured[key]
                case_errors = [error for error in diagnostics if error.startswith(f"measurement {case['id']}:")
                               or error.startswith("measurement 未声明")]
                if facts["exitCode"] == 0 and not case_errors:
                    record["status"] = "PASS"
                write_capture_record(destination, record, {**record, "command": dict(record["command"])}, write_guard)
                validate_execution_receipt(destination, case, selected["coverage"], selected["change"])
            except CaptureOutputConflict:
                raise
            except (ValueError, KeyError, TypeError) as error:
                record["status"] = "PARTIAL"
                write_capture_record(destination, record, {**record, "command": {
                    "argv": facts["argv"], "exitCode": facts["exitCode"]}}, write_guard)
                diagnostics.append(f"{case['id']}: {error}")
        if diagnostics:
            raise ValueError("\n".join(dict.fromkeys(diagnostics)))
    else:
        raise ValueError("capture plan.kind 必须为 build 或 case")
    print("capture 已记录；业务充分性仍须独立评审")
    return 0


def check_git_index_files(root: Path, files: list[Path]) -> None:
    """Compare version-controlled dependencies with the actual commit snapshot.

    Untracked/ignored local evidence may remain private. This does not require
    publishing logs, and does not replace review of source/build applicability.
    """
    root = root.resolve()
    for file in set(files):
        file = file.resolve()
        try:
            relative = file.relative_to(root).as_posix()
        except ValueError:
            continue
        tracked = subprocess.run(["git", "-C", str(root), "ls-files", "--error-unmatch", "--", relative],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if tracked.returncode:
            previous = subprocess.run(["git", "-C", str(root), "cat-file", "-e", "HEAD:" + relative],
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if previous.returncode:
                continue
        indexed = subprocess.run(["git", "-C", str(root), "rev-parse", ":" + relative], capture_output=True)
        working = subprocess.run(["git", "-C", str(root), "hash-object", "--path=" + relative, "--stdin"],
                                 input=file.read_bytes(), capture_output=True)
        if indexed.returncode or working.returncode or indexed.stdout.strip() != working.stdout.strip():
            raise ValueError(f"Git index 与报告依赖工作树不一致：{relative}；请暂存已验证快照")


def check_receipt_index(file: Path, report: Path, review: Path, root: Path) -> None:
    receipt = json.loads(file.read_text())
    dependencies = [file, report, review]
    command = receipt["command"]
    build = receipt["build"]
    dependencies.extend((file.parent / value).resolve() for value in
                        [command["output"], build["artifact"], build["command"]["output"]])
    dependencies.extend((file.parent / source["path"]).resolve() for source in receipt["sources"])
    coverage = json.loads(review.read_text())["coverage"]
    dependencies.extend((report.parent / source["path"]).resolve() for source in coverage.get("sources", []))
    tests = infer_tests_path(report)
    if tests is not None:
        dependencies.append(tests)
    check_git_index_files(root, dependencies)


def lint_case_evidence(report_path: Path, report_text: str, review_path: Path, index_root: Path | None = None) -> list[Issue]:
    """Check the frozen R/E/C index against per-case execution receipts."""
    issues: list[Issue] = []
    try:
        review = json.loads(review_path.read_text(encoding="utf-8"))
        coverage = review["coverage"]
        if coverage["schemaVersion"] != "superflow.review-coverage.v1":
            raise ValueError("unsupported coverage schema")
        cases = {case["id"]: case for case in coverage["cases"]}
        decisions = coverage["decisions"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        return [Issue("FAIL", report_path, 0, f"入口评审凭证无法读取：{error}")]

    required = {
        case_id
        for decision in decisions
        if decision.get("disposition") != "EXCLUDED"
        for case_id in decision.get("caseIds", [])
    }
    if final_report_result(report_text) == "CONFLICT":
        issues.append(Issue("FAIL", report_path, 0, "中英文最终验证结果冲突"))
    lines, ambiguous = markdown_body_lines(current_report_text(report_text))
    if ambiguous:
        return [Issue("FAIL", report_path, 0, "列表/引用代码块结构无法确定或含原始 HTML/XML；请使用 Markdown/代码围栏并明确闭合，不能沿用早期 PASS")]
    headers = [i for i, line in enumerate(lines)
               if CASE_EVIDENCE_HEADER.fullmatch(line.strip())]
    if len(headers) > 1:
        return [Issue("FAIL", report_path, 0, "只能有一个当前逐用例执行证据表；历史结果请放 History/历史记录 节或独立证据文件")]
    header_at = headers[0] if headers else None
    if header_at is None:
        return [Issue("FAIL", report_path, 0, "缺少逐用例执行证据表；不能用汇总通过数代替 R/E/C 回填")]

    receipts: dict[str, tuple[str, str, str, str]] = {}
    for index, line in enumerate(lines[header_at + 2 :], start=header_at + 3):
        if not line.startswith("|"):
            break
        columns = [column.strip() for column in line.strip().strip("|").split("|")]
        if len(columns) != 5:
            issues.append(Issue("FAIL", report_path, index, "逐用例执行证据表必须有五列"))
            continue
        case_id, entry_id, level, result, evidence = columns
        if case_id in receipts:
            issues.append(Issue("FAIL", report_path, index, f"用例 {case_id} 重复回填"))
        receipts[case_id] = (entry_id, level, result.upper(), evidence)

    for case_id in sorted(required):
        if case_id not in receipts:
            issues.append(Issue("FAIL", report_path, 0, f"用例 {case_id} 缺少逐项执行结果"))
            continue
        entry_id, level, result, evidence = receipts[case_id]
        case = cases.get(case_id)
        if case is None or entry_id != case.get("entryId") or level != case.get("level"):
            issues.append(Issue("FAIL", report_path, 0, f"用例 {case_id} 的入口或验收级别与冻结合同不一致"))
        if result not in CASE_RESULTS or not evidence or evidence.lower() in {"pending", "todo", "待补"}:
            issues.append(Issue("FAIL", report_path, 0, f"用例 {case_id} 缺少有效结果或证据位置"))
        elif result == "PASS":
            try:
                evidence_file = verified_file(report_path.parent, evidence.split("#", 1)[0])
                validate_execution_receipt(evidence_file, case or {}, coverage, report_path.parent)
                if index_root is not None:
                    check_receipt_index(evidence_file, report_path, review_path, index_root)
            except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
                issues.append(Issue("FAIL", report_path, 0, f"用例 {case_id} 的通过证据不可验证：{error}"))
        if result != "PASS" and final_report_result(report_text) == "PASS":
            issues.append(Issue("FAIL", report_path, 0, f"用例 {case_id} 为 {result}，报告不能声明整体验证 PASS"))
    for case_id in receipts.keys() - required:
        issues.append(Issue("FAIL", report_path, 0, f"用例 {case_id} 未在冻结入口评审中要求执行"))
    return issues


def delivery_evidence_files(report: Path, text: str) -> list[Path]:
    """Verify declared retained copies; receipts remain the execution authority."""
    lines, ambiguous = markdown_body_lines(current_report_text(text))
    header = re.compile(r"^\|\s*Source\s*\|\s*Delivered copy\s*\|\s*SHA-256\s*\|$", re.I)
    headers = [i for i, line in enumerate(lines) if header.fullmatch(line.strip())]
    declared = any(line.strip() == "## Delivery Evidence" for line in lines)
    if not headers and not declared:
        return []
    if ambiguous or len(headers) != 1:
        raise ValueError("Delivery Evidence 需要唯一的 | Source | Delivered copy | SHA-256 | 表")
    start = headers[0]
    if start + 1 >= len(lines) or not re.fullmatch(r"\|[\s:|-]+\|", lines[start + 1].strip()):
        raise ValueError("Delivery Evidence 表缺少分隔行")
    files = []
    delivered = set()
    for line in lines[start + 2:]:
        if not line.lstrip().startswith("|"):
            break
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 3:
            raise ValueError("Delivery Evidence 必须有 Source、Delivered copy、SHA-256 三列")
        source, copy, digest = cells
        try:
            original = hashed_file(report.parent, source, digest)
            retained = hashed_file(report.parent, copy, digest)
        except (OSError, ValueError) as error:
            raise ValueError(f"Delivery Evidence 原件/交付副本不一致：{error}") from error
        if original == retained or retained in delivered:
            raise ValueError("Delivery Evidence 副本必须独立且不能重复登记")
        delivered.add(retained)
        files.extend([original, retained])
    if not delivered:
        raise ValueError("Delivery Evidence 已声明但没有实际副本；直接引用原件时移除此节")
    return files


def lint_independent_review(report: Path, text: str, root: Path | None,
                            review_path: Path | None, index_root: Path | None) -> list[Issue]:
    """Identity/status only: this cannot prove reviewer independence or sufficiency."""
    ready = report.parent / ".sdd/readiness/coding-ready.json"
    document = review_path or report.parent / ".sdd/reviews/document-review.json"
    # A full SDD delivery is identified by its coverage/state, never by the age
    # of its READY receipt. Ordinary reports without SDD retain their own scope.
    state = report.parent / ".sdd/state.yaml"
    full_sdd = state.is_file() and re.search(
        r"^workflow:\s*[\"']?full[\"']?\s*$", state.read_text(), re.M)
    if not document.is_file() and not full_sdd:
        return []
    try:
        frozen = json.loads(document.read_text())
        if not frozen.get("coverage") and not full_sdd:
            return []
        if not ready.is_file():
            raise ValueError("完整 SDD 需要当前 READY workflowPolicy=observed-delivery.v1")
        marker = json.loads(ready.read_text())
        if marker.get("workflowPolicy") != "observed-delivery.v1":
            raise ValueError("完整 SDD READY workflowPolicy 必须为 observed-delivery.v1")
        if marker.get("codingReady") is not True:
            raise ValueError("完整 SDD READY codingReady 必须为 true；BLOCKED 不能完整交付")
        project = (report.parent / frozen["projectRoot"]).resolve() if frozen.get("projectRoot") else (root or report.parent).resolve()
        lines, ambiguous = markdown_body_lines(current_report_text(text))
        if ambiguous:
            raise ValueError("Independent Review Markdown 结构无法确定")
        sections = [i for i, line in enumerate(lines) if line.strip() == "## Independent Review"]
        if len(sections) != 1:
            raise ValueError("完整交付需要一个 Independent Review 报告引用表")
        references = []
        for line in lines[sections[0] + 1:]:
            if line.startswith("## "):
                break
            if not line.strip() or re.fullmatch(r"\|\s*Report\s*\|", line) or re.fullmatch(r"\|[\s:|-]+\|", line):
                continue
            match = re.fullmatch(r"\|\s*([^|]+?)\s*\|", line)
            if not match:
                raise ValueError("Independent Review 必须使用 | Report | 本地路径表")
            references.append(verified_file(report.parent, match[1]))
        if not references or len(set(references)) != len(references):
            raise ValueError("Independent Review 缺少报告或引用重复")
        module = canonical_module("dist/domains/review/report.js")
        script = """import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {auditReviewReport}=await import(pathToFileURL(process.argv[1]));
const input=JSON.parse(fs.readFileSync(0,'utf8'));
console.log(JSON.stringify(input.reports.map(file=>auditReviewReport(fs.readFileSync(file,'utf8'),input.root))));"""
        result = subprocess.run(["node", "--input-type=module", "-e", script, str(module)],
                                input=json.dumps({"reports": list(map(str, references)), "root": str(project)}),
                                capture_output=True, text=True)
        if result.returncode:
            raise ValueError("Independent Review 规范审计器执行失败；请修复 Superflow 安装")
        audits = json.loads(result.stdout)
        reviewed = set()
        dependencies = [document, *references]
        if ready.is_file():
            dependencies.append(ready)
        for file, audit in zip(references, audits):
            for dependency in audit.get("dependencies", []):
                dependencies.append(verified_file(project, dependency))
            if (audit.get("state") != "DONE" or not audit.get("eligibleForTriage")
                    or audit.get("findings") != 0 or not audit.get("findingsClear")
                    or not audit.get("reviewedSources")):
                raise ValueError(f"Independent Review 未闭环 {file.name}: " + "; ".join(audit.get("issues", []))
                                 + "; 需要 DONE、Findings 明确 None/无且无未决项，以及当前 Reviewed Sources")
            for source in audit["reviewedSources"]:
                current = hashed_file(project, source["path"], source["sha256"])
                reviewed.add(current)
                dependencies.append(current)
        required = set()
        for source in frozen["coverage"].get("sources", []):
            if source.get("role") in {"code", "build", "config", "schema"}:
                required.add(verified_file(report.parent, source["path"]))
        # Reuse the already checked per-case receipts: their sources include the
        # source/build input snapshot, not merely the entry point anchor.
        for line in lines:
            if not line.startswith("|"):
                continue
            columns = [column.strip() for column in line.strip().strip("|").split("|")]
            if len(columns) == 5 and columns[0] in {case["id"] for case in frozen["coverage"]["cases"]} and columns[3].upper() == "PASS":
                receipt_file = verified_file(report.parent, columns[4].split("#", 1)[0])
                receipt = json.loads(receipt_file.read_text())
                for source in receipt["sources"]:
                    required.add(hashed_file(receipt_file.parent, source["path"], source["sha256"]))
        copies = delivery_evidence_files(report, text)
        dependencies.extend(copies)
        required.update(copies[1::2])
        missing = required - reviewed
        if missing:
            raise ValueError("Independent Review 未覆盖当前源码/构建输入：" + ", ".join(sorted(map(str, missing))))
        if index_root is not None:
            check_git_index_files(index_root, dependencies)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        return [Issue("FAIL", report, 0, str(error))]
    return []


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


def lint_report(path: Path, repo: Path | None, tests_path: Path | None = None,
                review_path: Path | None = None, index_root: Path | None = None) -> list[Issue]:
    issues: list[Issue] = []
    text = current_report_text(path.read_text(encoding="utf-8", errors="replace"))
    try:
        copies = delivery_evidence_files(path, text)
        if index_root is not None:
            check_git_index_files(index_root, copies)
    except (OSError, ValueError) as error:
        issues.append(Issue("FAIL", path, 0, str(error)))
    lines = text.splitlines()
    command_tests: dict[str, set[tuple[int, int, int, int]]] = {}
    command_ratios: dict[str, set[tuple[int, int]]] = {}
    db_backed = bool(DB_BACKED_RE.search(text))
    blocked = bool(BLOCKED_RE.search(text))
    passed_or_partial = bool(PASS_WORDS.search(text) or re.search(r"Partially verified|部分验证", text, re.I))
    adjacent_review = path.parent / ".sdd/reviews/document-review.json"
    if review_path is None and adjacent_review.is_file():
        review_path = adjacent_review
    state_path = path.parent / ".sdd/state.yaml"
    full = state_path.is_file() and re.search(r"^workflow:\s*[\"']?full[\"']?\s*$", state_path.read_text(), re.M)
    if full and review_path is None:
        issues.append(Issue("FAIL", path, 0, "完整 SDD 缺少冻结入口评审凭证，不能以旧关键词报告交付"))
    if review_path is not None:
        issues.extend(lint_case_evidence(path, text, review_path, index_root))
    else:
        issues.extend(lint_against_tests_contract(path, text, tests_path or infer_tests_path(path)))

    if review_path is None and db_backed and passed_or_partial and not blocked:
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
    parser.add_argument("reports", nargs="*")
    parser.add_argument("--record-execution", metavar="PLAN", default="",
                        help="实际执行冻结 build/case plan 并保留脱敏 stdout/stderr")
    parser.add_argument("--check-execution-plan", metavar="PLAN", nargs="+", default=[],
                        help="只读批量检查 build/case plan；不执行命令、不创建证据、不代表测试通过")
    parser.add_argument("--check-measurement", metavar="PLAN", default="",
                        help="只读集中诊断实际 measurement；不执行命令、不生成或晋升凭证")
    parser.add_argument("--measurement", metavar="FILE", default="",
                        help="--check-measurement 的实际脱敏 stdout/JSONL 文件")
    parser.add_argument("--tests", default="")
    parser.add_argument("--review", default="")
    parser.add_argument("--repo-root", default="")
    parser.add_argument("--git-index-root", default="")
    parser.add_argument("--require-complete", action="store_true")
    parser.add_argument("--warn-only", action="store_true")
    parser.add_argument("--task-index", action="store_true")
    parser.add_argument("--markdown-body", action="store_true")
    parser.add_argument("--current-report", action="store_true",
                        help="输出明确排除历史节的当前报告，保留命令代码块与行号")
    args = parser.parse_args()

    if args.check_measurement or args.measurement:
        if (not args.check_measurement or not args.measurement or args.record_execution
                or args.check_execution_plan or args.reports):
            parser.error("--check-measurement PLAN --measurement FILE 必须成对且单独使用")
        try:
            prepared, errors = check_execution_plans([Path(args.check_measurement).resolve()])
            if any(item["plan"].get("kind") != "case" for item in prepared):
                errors.append("measurement 诊断需要 case plan")
            if not errors:
                errors.extend(measurement_diagnostics(Path(args.measurement).read_text(encoding="utf-8"), prepared))
            for error in errors:
                print(f"FAIL measurement: {error}")
            print("MEASUREMENT_DIAGNOSTIC_ONLY：未执行命令、未生成或晋升回执；不证明真实来源或测试通过")
            return 2 if errors else 0
        except (OSError, ValueError, KeyError, TypeError) as error:
            print(f"FAIL measurement: {error}")
            return 2
    if args.check_execution_plan:
        if args.record_execution or args.reports:
            parser.error("--check-execution-plan 不能与报告或 --record-execution 混用")
        try:
            prepared, errors = check_execution_plans([Path(file).resolve() for file in args.check_execution_plan])
        except OSError as error:
            print(f"FAIL plan: 无法只读核验文件身份：{error}")
            return 2
        for error in errors:
            print(f"FAIL plan: {error}")
        for item in prepared:
            if not item["errors"]:
                print(json.dumps({"plan": str(item["planFile"]), "status": "PLAN_VALID",
                                  "dependency": item["dependency"],
                                  "cwd": str(item.get("cwd")), "output": str(item["output"])}, ensure_ascii=False))
        print("计划检查未执行构建或用例，未生成 actual/target；不代表业务正确或测试通过")
        return 2 if errors else 0
    if args.record_execution:
        try:
            return record_execution(Path(args.record_execution).resolve())
        except (OSError, ValueError, KeyError, TypeError, StopIteration) as error:
            print(f"FAIL capture: {error}")
            return 2
    if not args.reports:
        parser.error("需要报告路径或 --record-execution PLAN")

    if args.current_report:
        if len(args.reports) != 1 or args.task_index or args.markdown_body:
            parser.error("--current-report requires exactly one report")
        text = Path(args.reports[0]).read_text(encoding="utf-8")
        _, ambiguous = markdown_body_lines(text)
        if ambiguous:
            print("FAIL 当前报告 Markdown 结构无法确定；原始 HTML/XML 请改用 Markdown 或代码围栏", file=sys.stderr)
            return 2
        print(current_report_text(text))
        return 0

    if args.markdown_body:
        # Navigation consumes the same body classification as task indexes.
        if len(args.reports) != 1 or args.task_index:
            parser.error("--markdown-body requires exactly one Markdown file")
        lines, ambiguous = markdown_body_lines(
            Path(args.reports[0]).read_text(encoding="utf-8"), task_index=True)
        print(json.dumps({"lines": lines, "ambiguous": ambiguous}))
        return 0

    if args.task_index:
        # The coverage checker uses this canonical body parser, not a second
        # Markdown regex that could promote fenced examples into current tasks.
        if len(args.reports) != 1:
            parser.error("--task-index requires exactly one tasks.md")
        lines, ambiguous = markdown_body_lines(
            Path(args.reports[0]).read_text(encoding="utf-8"), task_index=True)
        ids = task_ids_from_body(lines)
        print(json.dumps({"ids": ids, "ambiguous": ambiguous}))
        return 0

    all_issues: list[Issue] = []
    for report in args.reports:
        path = Path(report).resolve()
        if not path.exists():
            all_issues.append(Issue("FAIL", path, 0, "文件不存在"))
            continue
        repo = Path(args.repo_root).resolve() if args.repo_root else repo_root_for(path)
        tests_path = Path(args.tests).resolve() if args.tests else None
        if tests_path is not None and not tests_path.exists():
            all_issues.append(Issue("FAIL", path, 0, f"显式指定的 tests.md 不存在：{tests_path}"))
        review_path = Path(args.review).resolve() if args.review else None
        all_issues.extend(lint_report(path, repo, tests_path, review_path, Path(args.git_index_root) if args.git_index_root else None))
        if args.require_complete:
            text = path.read_text(encoding="utf-8")
            all_issues.extend(lint_independent_review(path, text, repo, review_path,
                              Path(args.git_index_root) if args.git_index_root else None))
            if final_report_result(text) != "PASS":
                all_issues.append(Issue("FAIL", path, 0, "完整交付要求最终验证结果 PASS；局部证据保留为 PARTIAL"))

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
