#!/usr/bin/env python3
"""
SDD SQL sync hook.

Warns when database-backed Java/XML changes are made without a version-level
summary SQL change. Blocks forbidden migration SQL style before commit.

Forbidden (B1-B8, blocks commit):
- B1 ALTER TABLE ADD COLUMN IF NOT EXISTS
- B2 CREATE [UNIQUE] INDEX IF NOT EXISTS
- B3 INFORMATION_SCHEMA 判断字段/索引
- B4 PREPARE / EXECUTE / DEALLOCATE PREPARE 动态 DDL
- B5 SET @变量 拼接或控制 DDL
- B6 ALTER TABLE ... ALGORITHM= / LOCK= 强制指定
- B7 FOREIGN KEY 外键约束（跨服务/多租户业务通常由代码层控制一致性）
- B8 NOT NULL 字段缺失 DEFAULT（老数据回填失败风险）

Warning (W1-W13, does not block, must be addressed in test-report.md):
- W1 回填类 UPDATE 使用相关子查询（应改 JOIN，O(k·N) -> O(N)）
- W2 JSON_EXTRACT/JSON_UNQUOTE 后无 COALESCE/IFNULL 兜底
- W3 唯一键包含 DATETIME 列且未指定精度
- W4 INSERT IGNORE 在数据迁移中使用
- W7 SQL 文件头缺失（目标 MySQL 版本、关联批次、风险等级、评审人）

Header requirement: every sql/**/*.sql file should declare
`-- 目标 MySQL 版本`、`-- 关联批次`、`-- 风险等级`、`-- 评审人` in its
leading comment block. Missing header triggers W7 warning.

Exempt syntax:
- File-level: `-- allow-dynamic-ddl: <reason>` exempts all forbidden rules
- Rule-level: `-- allow-sql-risk-rule: <B#|W#>` exempts the matching rule
  for the line on which the comment appears (or until next DDL boundary)

Subcommands:
- (default)        Hook mode: invoked by PreToolUse/PostToolUse hooks
- --check-staged   Run on `git diff --cached` SQL files; blocks on forbidden
- --risk-review    Run on disk SQL files under cwd; reports warnings +
                   forbidden issues, exits 0 (non-blocking report)
- --check-all      Scan sql/ under git root; CI-friendly exit codes 0/1/2/3
- --auto-fix       Apply safe auto-fixes (B1/B2/B6/W7), print report.
                   Dry-run by default; exits 0.
- --auto-fix-write Same as --auto-fix but writes fixed content to disk
                   (with .sql.bak backup of original)

Auto-fixable rules (safe to apply without business context):
- B1: drop 'IF NOT EXISTS' from ALTER TABLE ADD COLUMN
- B2: drop 'IF NOT EXISTS' from CREATE [UNIQUE] INDEX
- B6: drop ALGORITHM= and LOCK= sub-clauses
- W7: prepend SQL file header (version/batch/risk/reviewer inferred from path)

Manual review rules (cannot auto-fix; --auto-fix outputs a fix template
per finding for the developer to apply):
- B3/B4/B5: dynamic DDL rewrite requires business decision
- B7: dropping FK requires code-layer replacement verification
- B8: NOT NULL DEFAULT requires business default value
- W1-W6, W8-W10: require SQL semantics or schema decision
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path


DB_CODE_FILE = re.compile(r"\.(java|xml)$", re.I)
SQL_SUMMARY_FILE = re.compile(r"(^|/)sql/.*\.sql$", re.I)
NO_SQL_ACK_FILE = re.compile(
    r"(^|/)(openspec/.*\.(md|yaml|yml)|ReleaseNotes\.md)$",
    re.I,
)
NO_SQL_ACK = re.compile(
    r"(无|无需|不涉及|没有|未涉及).{0,20}"
    r"(SQL|sql|数据库|表结构|字段|索引|DDL|ddl).{0,20}"
    r"(变更|修改|调整|迁移|脚本|改动|新增)?|"
    r"(SQL|sql|数据库|表结构|字段|索引|DDL|ddl).{0,20}"
    r"(无|无需|不涉及|没有|未涉及).{0,20}"
    r"(变更|修改|调整|迁移|脚本|改动|新增)?",
    re.I,
)
SQL_STYLE_EXEMPT = re.compile(r"--\s*allow-dynamic-ddl\s*:", re.I)
SQL_RISK_RULE_EXEMPT = re.compile(
    r"--\s*allow-sql-risk-rule\s*:\s*([BW]\d+(?:\s*,\s*[BW]\d+)*)",
    re.I,
)
SQL_COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.S)
SQL_FORBIDDEN_PATTERNS = (
    (
        re.compile(r"\binformation_schema\b", re.I),
        "[B3] 不要用 information_schema 判断字段或索引是否存在",
    ),
    (
        re.compile(r"\bPREPARE\b", re.I),
        "[B4] 不要用 PREPARE 动态执行 DDL",
    ),
    (
        re.compile(r"\bEXECUTE\b", re.I),
        "[B4] 不要用 EXECUTE 动态执行 DDL",
    ),
    (
        re.compile(r"\bDEALLOCATE\s+PREPARE\b", re.I),
        "[B4] 不要用 DEALLOCATE PREPARE 动态执行 DDL",
    ),
    (
        re.compile(r"\bSET\s+@\w+\b", re.I),
        "[B5] 不要用 SET @变量 拼接或控制 DDL",
    ),
    (
        re.compile(r"\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b", re.I),
        "[B1] 不要用 ADD COLUMN IF NOT EXISTS 静默兼容字段冲突",
    ),
    (
        re.compile(
            r"\bCREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b",
            re.I,
        ),
        "[B2] 不要用 CREATE INDEX IF NOT EXISTS 静默兼容索引冲突",
    ),
    (
        re.compile(r"\bALGORITHM\s*=", re.I),
        "[B6] 不要在发布 SQL 中强制指定 ALGORITHM",
    ),
    (
        re.compile(r"\bLOCK\s*=", re.I),
        "[B6] 不要在发布 SQL 中强制指定 LOCK",
    ),
    (
        re.compile(r"\bFOREIGN\s+KEY\s*\(", re.I),
        "[B7] 不要使用数据库外键（FOREIGN KEY）做强制关联，"
        "改由代码层 + 唯一键 + 状态机控制一致性",
    ),
    (
        re.compile(
            r"\bADD\s+COLUMN\s+\w+\s+\w+(?:\s*\([^)]*\))?\s+NOT\s+NULL\b"
            r"(?!\s+DEFAULT)",
            re.I,
        ),
        "[B8] ADD COLUMN 的 NOT NULL 字段缺少 DEFAULT，老数据回填时该字段"
        "以 NULL 写入导致失败；必须有 DEFAULT 或显式 NULL 允许",
    ),
)


SQL_WARNING_PATTERNS = (
    (
        re.compile(
            r"\bUPDATE\b[^;]*?\bSET\b\s+\w+\s*=\s*\(\s*SELECT\b",
            re.I | re.S,
        ),
        "[W1] 回填类 UPDATE 使用了相关子查询，性能为 O(k·N)；"
        "应改写为 JOIN，单表扫描 O(N)。同时检查 W1 评审勾选",
    ),
    (
        re.compile(
            r"\bJSON_(?:EXTRACT|UNQUOTE)\b[\s\S]{0,400}?\bAS\s+"
            r"(?!COALESCE\b|IFNULL\b|UNSIGNED\b|CHAR\b|VARCHAR\b|"
            r"DECIMAL\b|INT\b|BIGINT\b|DATETIME\b|DATE\b|TIME\b|JSON\b)",
            re.I,
        ),
        "[W2] JSON_EXTRACT/UNQUOTE 后未发现 COALESCE/IFNULL 兜底，"
        "NULL 会传播到业务字段，破坏 -1=不限额等业务语义"
        "（当 AS 后面直接接业务数值/字符串类型时容易漏 COALESCE）",
    ),
    (
        re.compile(
            r"\bUNIQUE\s+(?:KEY\s+)?\w+\s*\([^)]*\bDATETIME\b[^)]*\)",
            re.I,
        ),
        "[W3] 唯一键包含 DATETIME 列，秒级默认精度下毫秒级业务可能冲突；"
        "建议改 DATETIME(3) 或加 segment_seq INT 等序号；改精度时也要改源表字段"
        "；改精度时也要核对所有源表和消费表字段",
    ),
    (
        re.compile(r"\bINSERT\s+IGNORE\b", re.I),
        "[W4] 迁移类 INSERT IGNORE 静默吞错；应改用显式 WHERE NOT EXISTS 预检查"
        "或先清空目标表，让错误显式抛出",
    ),
    (
        # W11: 关系同步表（含物理 delete/insert 模式）—— 实战中容易被误判为
        # 业务实体表，W6 hook 检测不到的源码审查场景
        re.compile(
            r"\bCREATE\s+TABLE\b\s+(?:IF\s+NOT\s+EXISTS\s+)?\w+\s*\("
            r"[\s\S]{0,2000}?"
            r"\b(PRIMARY\s+KEY|UNIQUE)",
            re.I | re.S,
        ),
        None,  # 占位：W11 实际靠人工源码审查（见 reference §6.1 SOP），hook 抓不到
    ),
)


# W12: 检测 JSON 提取后是否在 CASE WHEN REGEXP 中已做数字校验
# CASE WHEN REGEXP 校验比单纯 COALESCE 更严，
# 能同时兜底 NULL 和 "abc" 等非数字字符串。
W12_CAST_REGEX_PATTERN = re.compile(
    r"CASE\s+[\s\S]{0,200}?"
    r"\bWHEN\b[\s\S]{0,200}?"
    r"\bREGEXP\b[\s\S]{0,200}?"
    r"\bTHEN\b[\s\S]{0,100}?\bCAST\b",
    re.I | re.S,
)


# W13: 宽索引（>3 列）—— 实战中需要源码审查（Mapper XML 查询）才能判断是否有用
# hook 只能识别"宽索引是否存在"，不能识别"是否有查询支撑"
W13_WIDE_INDEX_PATTERN = re.compile(
    r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+\s+ON\s+\w+\s*\(([^)]+)\)",
    re.I,
)


SQL_HEADER_REQUIRED_KEYS = (
    "目标 MySQL 版本",
    "关联批次",
    "风险等级",
    "评审人",
)
SQL_HEADER_WINDOW_LINES = 30


_RULE_LABELS = {
    "B1": "ALTER ADD COLUMN IF NOT EXISTS",
    "B2": "CREATE INDEX IF NOT EXISTS",
    "B3": "INFORMATION_SCHEMA 判断",
    "B4": "PREPARE/EXECUTE/DEALLOCATE PREPARE 动态 DDL",
    "B5": "SET @变量 拼接 DDL",
    "B6": "ALTER TABLE ALGORITHM=/LOCK= 强制",
    "B7": "FOREIGN KEY 外键约束",
    "B8": "ADD COLUMN NOT NULL 缺 DEFAULT",
    "W1": "回填 UPDATE 相关子查询",
    "W2": "JSON 提取缺 COALESCE/IFNULL 兜底",
    "W3": "唯一键含 DATETIME 列",
    "W4": "INSERT IGNORE 迁移",
    "W5": "宽索引 > 3 列",
    "W6": "业务实体表缺 update_time/deleted",
    "W7": "SQL 文件头缺失",
    "W8": "JSON 字段无 CHECK 约束",
    "W9": "大批量迁移未分批",
    "W10": "test-report 缺 SQL 收口对账表",
    "W11": "关系同步表误判（源码审查）",
    "W12": "JSON 提取 NULL 兜底不充分（实战：优先 CASE WHEN REGEXP）",
    "W13": "宽索引无查询支撑（源码审查）",
}
_B_RULE_ORDER = ("B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8")
_W_RULE_ORDER = (
    "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10",
    "W11", "W12", "W13",
)


EXIT_CLEAN = 0
EXIT_WARN_ONLY = 1
EXIT_FORBIDDEN = 2
EXIT_ERROR = 3


_FIX_TEMPLATES = {
    "B3": "修复模板：移除 information_schema 判断；评审人根据目标表实际结构显式"
          "写 ALTER/CREATE INDEX。字段已存在则让 DDL 报错显式暴露，不要静默兼容。",
    "B4": "修复模板：把 PREPARE/EXECUTE 块替换为显式 DDL，例如\n"
          "      ALTER TABLE <t> ADD COLUMN <col> <type> DEFAULT <v>;\n"
          "      评审人确认目标表当前结构后写入。",
    "B5": "修复模板：把 'SET @var := ...' 拼接 SQL 字符串的逻辑改为显式 DDL；"
          "评审人重写。",
    "B7": "修复模板：移除外键约束；由代码层（Service + 唯一键 + 状态机）控制"
          "一致性。评审人确认代码层已有等效的引用完整性保护。",
    "B8": "修复模板：NOT NULL 字段必须显式 DEFAULT 或允许 NULL；评审人根据"
          "业务语义选默认值（0/''/CURRENT_TIMESTAMP/-1 等）。",
    "W1": "修复模板：相关子查询改 JOIN：\n"
          "      原: UPDATE t SET x = (SELECT s.x FROM s WHERE s.id = t.id)\n"
          "      新: UPDATE t JOIN s ON s.id = t.id SET t.x = s.x",
    "W2": "修复模板：JSON 提取后必须 COALESCE 兜底：\n"
          "      原: CAST(JSON_UNQUOTE(JSON_EXTRACT(j, '$.k')) AS DECIMAL(12,4))\n"
          "      新: COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(j, '$.k')) AS DECIMAL(12,4)),"
          " <业务默认值>)",
    "W3": "修复模板：唯一键含 DATETIME 时指定精度 (3) 或加 segment_seq INT 替代"
          "时间字段；评审人根据业务唯一性保障策略调整。",
    "W4": "修复模板：INSERT IGNORE 改为显式预检查：\n"
          "      原: INSERT IGNORE INTO t SELECT ...\n"
          "      新: INSERT INTO t SELECT ... WHERE NOT EXISTS\n"
          "          (SELECT 1 FROM t WHERE t.id = src.id)\n"
          "      或先清空目标表：DELETE FROM t; INSERT INTO t SELECT ...;",
    "W5": "修复模板：单条索引 > 3 列时按业务查询场景拆分；评审人评估。",
    "W6": "修复模板：业务实体表必须加 update_time DATETIME ON UPDATE "
          "CURRENT_TIMESTAMP 和 deleted TINYINT NOT NULL DEFAULT 0；评审人"
          "判断表类型（业务实体/快照/关系/流水）。",
    "W7": "修复模板：已由 --auto-fix 自动添加文件头；评审人补充 '评审人/'涉及表'"
          "'变更摘要' 字段。",
    "W8": "修复模板：JSON 字段加 CHECK 约束：\n"
          "      CONSTRAINT chk_<table>_<col>_json\n"
          "        CHECK (<col> IS NULL OR JSON_TYPE(<col>) = 'OBJECT')\n"
          "      评审人选 JSON_TYPE（OBJECT/ARRAY）。",
    "W9": "修复模板：大批量迁移必须分批：\n"
          "      INSERT INTO t SELECT ... FROM src LIMIT 0, 5000; -- 循环\n"
          "      评审人评估表大小。",
    "W10": "修复模板：test-report.md 末尾加 SQL 收口对账表：\n"
           "      | P编号 | 表 | 字段/索引/数据 | 源码引用 | 总SQL位置 | "
           "开发库状态 | 测试库状态 | 处理结论 |\n"
           "      评审人填写。",
}
DB_HINT = re.compile(
    r"(@TableName|BaseMapper<|<result\s+column=|<id\s+column=|"
    r"@TableField|Wrappers\.lambdaQuery|LambdaQueryWrapper|QueryWrapper|"
    r"\b(SELECT|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\b[\s\S]{0,120}\b\w+\b|"
    r"\b[A-Za-z][A-Za-z0-9]*Mapper\.xml\b|"
    r"\b[a-z][a-z0-9_]*(status|type|amount|balance|quota|limit|count|flag|id)\b)",
    re.I | re.S,
)
MYBATIS_PLUS_ENTITY = re.compile(r"@TableName\s*\(|BaseMapper<", re.I)
CROSS_SCHEMA_RISK = re.compile(
    r"(@TableName\s*\(|BaseMapper<|LambdaQueryWrapper|QueryWrapper|"
    r"@TableField\s*\(|resultMap|<result\s+column=|<id\s+column=)",
    re.I,
)


def run(cmd, cwd=None):
    return subprocess.run(
        cmd,
        cwd=cwd,
        text=True,
        capture_output=True,
        timeout=10,
    )


def repo_root(start):
    result = run(["git", "-C", str(start), "rev-parse", "--show-toplevel"])
    if result.returncode != 0:
        return None
    return Path(result.stdout.strip())


def staged_files(root):
    result = run(["git", "diff", "--cached", "--name-only"], cwd=root)
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def staged_content(root, path):
    result = run(["git", "show", f":{path}"], cwd=root)
    if result.returncode == 0:
        return result.stdout
    disk_path = root / path
    if disk_path.is_file():
        return disk_path.read_text(encoding="utf-8", errors="ignore")
    return ""


def sql_content_without_comments(content):
    content = SQL_COMMENT_BLOCK.sub("", content or "")
    lines = []
    for line in content.splitlines():
        idx_dash = line.find("--")
        if idx_dash >= 0:
            line = line[:idx_dash]
        idx_hash = line.find("#")
        if idx_hash >= 0:
            line = line[:idx_hash]
        lines.append(line.rstrip())
    return "\n".join(lines)


def line_number(content, index):
    return content.count("\n", 0, index) + 1


def _exempted_rules(content):
    """Parse all `-- allow-sql-risk-rule: B3,B4` directives in content.

    Returns a set of uppercased rule ids. Per-file exemption is the
    implementation chosen here to keep the linter stateless; line-level
    scope can be layered on later if needed.
    """
    rules = set()
    for match in SQL_RISK_RULE_EXEMPT.finditer(content or ""):
        for token in match.group(1).split(","):
            token = token.strip().upper()
            if token:
                rules.add(token)
    return rules


def _rule_id_from_reason(reason):
    if not reason:
        return ""
    return reason.split("]", 1)[0].lstrip("[").strip().upper()


def _check_sql_header(content):
    head = "\n".join((content or "").splitlines()[:SQL_HEADER_WINDOW_LINES])
    return [k for k in SQL_HEADER_REQUIRED_KEYS if k not in head]


def lint_sql_style(path, content):
    if not SQL_SUMMARY_FILE.search(path):
        return []
    if SQL_STYLE_EXEMPT.search(content or ""):
        return []

    check_content = sql_content_without_comments(content)
    exempted = _exempted_rules(content)
    issues = []
    for pattern, reason in SQL_FORBIDDEN_PATTERNS:
        if _rule_id_from_reason(reason) in exempted:
            continue
        for match in pattern.finditer(check_content):
            issues.append(
                f"{path}:{line_number(check_content, match.start())} {reason}"
            )
    return issues


def lint_sql_warnings(path, content):
    if not SQL_SUMMARY_FILE.search(path):
        return []
    if SQL_STYLE_EXEMPT.search(content or ""):
        return []

    check_content = sql_content_without_comments(content)
    exempted = _exempted_rules(content)
    warnings = []
    for pattern, reason in SQL_WARNING_PATTERNS:
        if reason is None:
            continue  # 占位规则（hook 抓不到，靠源码审查）
        if _rule_id_from_reason(reason) in exempted:
            continue
        for match in pattern.finditer(check_content):
            # W2 精确度提升：如果整段 SQL 包含 CASE WHEN REGEXP 数字校验
            # 模式，W2 视为已覆盖，不重复警告
            if _rule_id_from_reason(reason) == "W2" and W12_CAST_REGEX_PATTERN.search(
                check_content
            ):
                break
            warnings.append(
                f"{path}:{line_number(check_content, match.start())} {reason}"
            )

    # W11 占位提示：hook 抓不到，靠源码审查（仅在 SQL 提到 mapper.delete/
    # deleted/物理删除模式时给出"请确认表类型"提示）
    if re.search(
        r"\bmapper\.delete\b|物理删除|关系同步表|业务实体表",
        check_content,
        re.I,
    ):
        warnings.append(
            f"{path}:1 [W11] 提示：检测到物理 delete 或表类型讨论关键字，"
            "请按 reference §6.1 源码审查 SOP 确认：业务 Service 是"
            " mapper.delete()（物理）还是 deleted=1（软删除），"
            "避免 W6/W11 误判"
        )

    # W13 宽索引提示：列出索引列数，提示需源码审查
    for match in W13_WIDE_INDEX_PATTERN.finditer(check_content):
        cols_text = match.group(1)
        cols = [c.strip() for c in cols_text.split(",") if c.strip()]
        if len(cols) > 3:
            line_no = line_number(check_content, match.start())
            warnings.append(
                f"{path}:{line_no} [W13] 检测到 {len(cols)} 列宽索引（"
                f"{', '.join(cols)}）；按 reference §6.1 源码审查 SOP，"
                "需审查 Mapper XML/Repository 真实查询和数据量，"
                "确认索引是否真有加速效果"
            )

    missing = _check_sql_header(content)
    if missing:
        warnings.append(
            f"{path}:1 [W7] SQL 文件头缺失必填键：{', '.join(missing)}；"
            "参考 sql-risk-review-checklist.md §4 模板"
        )
    return warnings


def is_db_related_file(path, content):
    if not DB_CODE_FILE.search(path):
        return False
    normalized = path.replace("\\", "/")
    if "/mapper/" in normalized.lower() or normalized.endswith("Mapper.xml"):
        return True
    if DB_HINT.search(content or ""):
        return True
    return False


def no_sql_ack_files(root, files):
    if os.environ.get("SDD_SQL_NO_CHANGE") == "1":
        return ["环境变量 SDD_SQL_NO_CHANGE=1"]

    matches = []
    for path in files:
        if not NO_SQL_ACK_FILE.search(path):
            continue
        content = staged_content(root, path)
        if NO_SQL_ACK.search(content or ""):
            matches.append(path)
    return matches


def warn(message, block=False):
    prefix = "阻断" if block else "提醒"
    print(f"[SDD SQL 收口{prefix}] {message}", file=sys.stderr)


def handle_commit(command, root):
    if not re.search(r"\bgit\s+commit\b", command):
        return 0

    files = staged_files(root)
    if not files:
        return 0

    sql_files = [path for path in files if SQL_SUMMARY_FILE.search(path)]
    db_files = []
    schema_risk_files = []
    sql_style_issues = []
    for path in files:
        content = staged_content(root, path)
        if SQL_SUMMARY_FILE.search(path):
            sql_style_issues.extend(lint_sql_style(path, content))
            continue
        if is_db_related_file(path, content):
            db_files.append(path)
        if CROSS_SCHEMA_RISK.search(content or ""):
            schema_risk_files.append(path)

    if sql_style_issues:
        warn(
            "检测到已暂存的 SQL 使用过度兼容或动态 DDL 写法。\n"
            "发布 SQL 应使用普通 ALTER TABLE / CREATE INDEX，让字段或索引"
            "冲突在部署时直接暴露。\n"
            "如确需例外，请在 SQL 文件中加入明确白名单注释："
            "-- allow-dynamic-ddl: 原因。\n"
            "问题：\n  - "
            + "\n  - ".join(sql_style_issues[:12]),
            block=True,
        )
        return 2

    if schema_risk_files:
        warn(
            "检测到已暂存的 MyBatis/MyBatis-Plus 实体、Mapper 或查询条件变更。\n"
            "请确认已完成跨仓数据合同对账：表结构真源、全部消费仓、"
            "实体/Mapper/SQL 字段、真实库 information_schema/SHOW CREATE。\n"
            "重点检查 BaseMapper 是否会 SELECT 不存在列，旧字段是否已 "
            "@TableField(exist = false) 或删除，查询条件是否仍依赖已迁移字段。\n"
            "相关文件：\n  - "
            + "\n  - ".join(schema_risk_files[:12]),
            block=False,
        )

    if not db_files or sql_files:
        return 0

    ack_files = no_sql_ack_files(root, files)
    if ack_files:
        warn(
            "检测到疑似涉库 Java/XML 变更，但本次提交已有“无 SQL 变更”说明，"
            "不再要求创建 sql/ 下的空标记文件。\n"
            "确认来源：\n  - "
            + "\n  - ".join(ack_files[:12]),
            block=False,
        )
        return 0

    block = (root / ".sdd-enforced").exists()
    message = (
        "检测到已暂存的 Java/XML 变更疑似依赖数据库结构，但本次提交未暂存 "
        "sql/ 下的版本总 SQL 文件。\n"
        "请确认已完成三方对账：源码/Mapper、开发库、测试库现状+总SQL。\n"
        "若本任务确认没有 SQL/数据库/表结构变更，请在 OpenSpec 或 "
        "ReleaseNotes 中写明“无 SQL 变更”或“不涉及数据库变更”，"
        "不要创建 noop.sql 空标记文件。\n"
        "涉库文件：\n  - "
        + "\n  - ".join(db_files[:12])
    )
    if len(db_files) > 12:
        message += f"\n  ... 共 {len(db_files)} 个文件"
    warn(message, block=block)
    return 2 if block else 0


def handle_edit(file_path, edit_content):
    if not file_path:
        return 0
    if SQL_SUMMARY_FILE.search(file_path):
        sql_style_issues = lint_sql_style(file_path, edit_content)
        if sql_style_issues:
            warn(
                "正在写入的 SQL 使用过度兼容或动态 DDL 写法。\n"
                "发布 SQL 应使用普通 ALTER TABLE / CREATE INDEX。\n"
                "问题：\n  - "
                + "\n  - ".join(sql_style_issues[:12]),
                block=True,
            )
            return 2
        return 0
    if not is_db_related_file(file_path, edit_content):
        return 0
    warn(
        "正在编辑疑似涉库 Java/XML 文件。若本次改动新增或修改表、字段、索引、"
        "初始化数据依赖，任务完成前必须同步版本总 SQL 并输出 SQL 收口对账表。",
        block=False,
    )
    if MYBATIS_PLUS_ENTITY.search(edit_content or ""):
        warn(
            "检测到 MyBatis-Plus @TableName/BaseMapper 相关编辑。"
            "如果实体字段不在真实表结构中，BaseMapper 默认 SELECT 会运行时失败；"
            "跨仓复制实体时必须逐仓对账，不存在列请删除或标注 "
            "@TableField(exist = false)。",
            block=False,
        )
    return 0


def handle_check_staged():
    root = repo_root(Path.cwd())
    if root is None:
        return 0
    files = staged_files(root)
    sql_style_issues = []
    sql_warning_issues = []
    for path in files:
        if SQL_SUMMARY_FILE.search(path):
            content = staged_content(root, path)
            sql_style_issues.extend(lint_sql_style(path, content))
            sql_warning_issues.extend(lint_sql_warnings(path, content))

    if sql_warning_issues:
        warn(
            "检测到已暂存的 SQL 命中警告项（W1-W13），提交流程不阻断，"
            "但 test-report.md 必须记录每条处理结论。\n"
            "参考 sql-risk-review-checklist.md 警告项说明。\n"
            "问题：\n  - "
            + "\n  - ".join(sql_warning_issues[:12])
            + (f"\n  ... 共 {len(sql_warning_issues)} 条" if len(sql_warning_issues) > 12 else ""),
            block=False,
        )

    if not sql_style_issues:
        return 0

    warn(
        "检测到已暂存的 SQL 使用禁用项（B1-B8）。\n"
        "发布 SQL 应使用普通 ALTER TABLE / CREATE INDEX，让字段或索引"
        "冲突在部署时直接暴露。\n"
        "如确需例外，请在 SQL 文件中加入明确白名单注释：\n"
        "  -- allow-sql-risk-rule: B3,B4 # 仅豁免指定规则\n"
        "  -- allow-dynamic-ddl: <原因> # 整文件豁免（慎用）\n"
        "问题：\n  - "
        + "\n  - ".join(sql_style_issues[:12]),
        block=True,
    )
    return 2


def _rule_id_from_issue(issue):
    if "[" in issue and "]" in issue:
        lb = issue.index("[")
        rb = issue.index("]", lb)
        return issue[lb + 1:rb].strip().upper()
    return "未分类"


def _format_risk_report(sql_files, all_issues, all_warnings, title):
    lines = [f"[{title}] 扫描文件: {len(sql_files)}"]
    if sql_files:
        lines.append("  " + "\n  ".join(sql_files))
    lines.append("")

    by_issue = {}
    for issue in all_issues:
        by_issue.setdefault(_rule_id_from_issue(issue), []).append(issue)
    by_warning = {}
    for warning in all_warnings:
        by_warning.setdefault(_rule_id_from_issue(warning), []).append(warning)

    lines.append("【禁用项 B1-B8】（命中会阻断 commit）")
    for rule_id in _B_RULE_ORDER:
        hits = by_issue.get(rule_id, [])
        if not hits:
            continue
        label = _RULE_LABELS.get(rule_id, rule_id)
        lines.append(f"  {rule_id} {label}（命中 {len(hits)}）")
        for h in hits:
            lines.append(f"    - {h}")
    if not by_issue:
        lines.append("  无命中")

    lines.append("")
    lines.append("【警告项 W1-W13】（不阻断，test-report 须记录处理结论）")
    for rule_id in _W_RULE_ORDER:
        hits = by_warning.get(rule_id, [])
        if not hits:
            continue
        label = _RULE_LABELS.get(rule_id, rule_id)
        lines.append(f"  {rule_id} {label}（命中 {len(hits)}）")
        for h in hits:
            lines.append(f"    - {h}")
    if not by_warning:
        lines.append("  无命中")
    return "\n".join(lines) + "\n"


def _scan_sql_files(root, paths):
    sql_files = []
    for p in paths:
        if p.is_file() and SQL_SUMMARY_FILE.search(str(p)):
            try:
                sql_files.append(str(p.relative_to(root)))
            except ValueError:
                sql_files.append(str(p))
    return sorted(sql_files)


def _collect_risks(root, sql_files):
    all_issues = []
    all_warnings = []
    for rel in sql_files:
        full_path = root / rel
        if not full_path.is_file():
            continue
        content = full_path.read_text(encoding="utf-8", errors="ignore")
        all_issues.extend(lint_sql_style(rel, content))
        all_warnings.extend(lint_sql_warnings(rel, content))
    return all_issues, all_warnings


def _exit_code(all_issues, all_warnings):
    if all_issues:
        return EXIT_FORBIDDEN
    if all_warnings:
        return EXIT_WARN_ONLY
    return EXIT_CLEAN


def handle_risk_review():
    """Scan SQL files under cwd; non-blocking report (exit 0/1/2)."""
    root = Path.cwd()
    sql_files = _scan_sql_files(root, root.glob("sql/**/*.sql"))
    if not sql_files:
        print("[SDD SQL 风险评审] 未发现 sql/**/*.sql 文件")
        return EXIT_CLEAN

    all_issues, all_warnings = _collect_risks(root, sql_files)
    print(_format_risk_report(
        sql_files, all_issues, all_warnings, "SDD SQL 风险评审"
    ))
    return _exit_code(all_issues, all_warnings)


def handle_check_all():
    """Scan SQL files under git root; CI-friendly exit codes (0/1/2/3)."""
    root = repo_root(Path.cwd())
    if root is None:
        warn("当前目录不在 Git 仓库内，无法定位 sql/ 根目录", block=False)
        return EXIT_ERROR
    sql_files = _scan_sql_files(root, root.glob("sql/**/*.sql"))
    if not sql_files:
        print(f"[SDD SQL 全量扫描] git root={root} 未发现 sql/**/*.sql 文件")
        return EXIT_CLEAN

    all_issues, all_warnings = _collect_risks(root, sql_files)
    print(_format_risk_report(
        sql_files, all_issues, all_warnings, "SDD SQL 全量扫描"
    ))
    print(
        f"[退出码] clean={EXIT_CLEAN} warn_only={EXIT_WARN_ONLY} "
        f"forbidden={EXIT_FORBIDDEN}；本次返回 "
        f"{_exit_code(all_issues, all_warnings)}"
    )
    return _exit_code(all_issues, all_warnings)


def _generate_sql_header(path):
    """Build a SQL header block inferred from filename."""
    name = Path(path).name
    m = re.match(r"^v(\d+\.\d+\.\d+)(?:\.([a-zA-Z0-9_-]+))?\.sql$", name)
    if m:
        version = m.group(1)
        batch = m.group(2) or f"批次-{Path(path).stem}"
    else:
        version = "未知"
        batch = f"批次-{Path(path).stem}"
    return (
        "-- ============================================================================\n"
        f"-- 目标 MySQL 版本：5.7\n"
        "-- 平台 SQL 解析校验：（待填，parser/version）\n"
        f"-- 关联批次：{batch}\n"
        "-- 风险等级：中\n"
        "-- 评审人：（待填）\n"
        "-- 评审 checklist：参考 ~/.codex/skills/superflow-pipeline/references/sql-risk-review-checklist.md\n"
        "-- 涉及表：（待补充）\n"
        "-- 变更摘要：（待补充）\n"
        "-- ============================================================================\n"
    )


def _auto_fix_sql(path, content):
    """Apply safe auto-fixes; return (new_content, auto_fixes, manual_items).

    Auto-fixable: B1 (drop IF NOT EXISTS from ADD COLUMN),
                  B2 (drop IF NOT EXISTS from CREATE INDEX),
                  B6 (drop ALGORITHM= / LOCK= sub-clauses),
                  W7 (prepend SQL file header).
    Manual review: anything remaining, with fix templates.
    """
    fixed = content
    auto = []

    new, n = re.subn(
        r"(\bADD\s+COLUMN\s+[^,\n]+?)\s+IF\s+NOT\s+EXISTS\b",
        r"\1", fixed, flags=re.I,
    )
    if n:
        auto.append(f"[B1] 移除 {n} 处 'IF NOT EXISTS' (ADD COLUMN)")
        fixed = new

    new, n = re.subn(
        r"(\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+\s+ON\s+[^,\n]+?)"
        r"\s+IF\s+NOT\s+EXISTS\b",
        r"\1", fixed, flags=re.I,
    )
    if n:
        auto.append(f"[B2] 移除 {n} 处 'IF NOT EXISTS' (CREATE INDEX)")
        fixed = new

    new = re.sub(r",\s*ALGORITHM\s*=\s*\w+", "", fixed, flags=re.I)
    new, n_alg = re.subn(r",\s*ALGORITHM\s*=\s*\w+", "", fixed, flags=re.I)
    new, n_lock = re.subn(r",\s*LOCK\s*=\s*\w+", "", new, flags=re.I)
    if n_alg or n_lock:
        auto.append(
            f"[B6] 移除 {n_alg} 处 ALGORITHM= 和 {n_lock} 处 LOCK= 子句"
        )
        fixed = new

    if _check_sql_header(fixed):
        header = _generate_sql_header(path)
        fixed = header + fixed
        auto.append("[W7] 添加 SQL 文件头（版本/批次已基于路径推断，"
                    "评审人/涉及表/变更摘要待人工补充）")

    issues = lint_sql_style(path, fixed)
    warnings = lint_sql_warnings(path, fixed)
    manual = list(issues) + list(warnings)
    return fixed, auto, manual


def _print_fix_template(rule_id):
    template = _FIX_TEMPLATES.get(rule_id)
    if not template:
        return
    for line in template.split("\n"):
        print(f"      {line}")


def handle_auto_fix(write):
    """Scan SQL files, apply safe auto-fixes, output per-file report.

    write=False (default): dry-run, print report only.
    write=True: write fixed content to disk with .bak backup.
    """
    root = Path.cwd()
    sql_files = _scan_sql_files(root, root.glob("sql/**/*.sql"))
    if not sql_files:
        print("[SDD SQL 自动修复] 未发现 sql/**/*.sql 文件")
        return EXIT_CLEAN

    mode = "WRITE" if write else "DRY-RUN"
    print(f"[SDD SQL 自动修复] 扫描文件: {len(sql_files)} 模式: {mode}\n")

    total_auto = 0
    total_manual = 0
    for rel in sql_files:
        full_path = root / rel
        content = full_path.read_text(encoding="utf-8", errors="ignore")
        fixed, auto, manual = _auto_fix_sql(rel, content)

        if not auto and not manual:
            print(f"  ✓ {rel}  无风险")
            continue

        if auto:
            print(f"\n=== {rel} ===")
            for a in auto:
                print(f"  ✅ [自动修] {a}")
            total_auto += len(auto)
            if write:
                bak_path = full_path.with_suffix(full_path.suffix + ".bak")
                bak_path.write_text(content, encoding="utf-8")
                full_path.write_text(fixed, encoding="utf-8")
                print(f"  📝 已写入 {rel}（备份: {bak_path.name}）")
        else:
            print(f"\n=== {rel} ===")

        for m in manual:
            rule_id = _rule_id_from_issue(m)
            print(f"  ⚠️  [需开发者确认] {m}")
            _print_fix_template(rule_id)
            total_manual += 1

    print(f"\n=== 总结 ===")
    print(f"自动修复：{total_auto} 项")
    print(f"需开发者确认：{total_manual} 项")
    if not write and total_auto:
        print(f"\n如确认修复，运行：python3 ~/.codex/hooks/"
              f"superflow-sql-sync-hook.py --auto-fix-write")
    return EXIT_CLEAN


def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == "--check-staged":
            return handle_check_staged()
        if sys.argv[1] == "--risk-review":
            return handle_risk_review()
        if sys.argv[1] == "--check-all":
            return handle_check_all()
        if sys.argv[1] == "--auto-fix":
            return handle_auto_fix(write=False)
        if sys.argv[1] == "--auto-fix-write":
            return handle_auto_fix(write=True)

    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return 0

    tool_input = payload.get("tool_input", {})
    command = tool_input.get("command") or tool_input.get("cmd") or ""
    file_path = tool_input.get("file_path") or ""

    start = Path.cwd()
    if file_path:
        start = Path(file_path).expanduser().resolve().parent
    root = repo_root(start)
    if root is None:
        return 0

    if command:
        return handle_commit(command, root)

    edit_content = tool_input.get("new_string") or tool_input.get("content") or ""
    return handle_edit(file_path, edit_content)


if __name__ == "__main__":
    sys.exit(main())
