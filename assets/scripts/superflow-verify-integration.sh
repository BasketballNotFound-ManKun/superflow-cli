#!/bin/bash
# SDD integration evidence verifier
# Checks that a test-report contains real application-level API integration
# evidence: startup, curl/API call, database query, log check, and test output.

set -u

usage() {
  cat <<'USAGE'
用法:
  superflow-verify-integration.sh <test-report.md> [更多 test-report.md]

说明:
  该脚本检查 test-report 是否包含真实启动应用后的 API 集成测试证据。
  它不替代 curl/mysql/日志命令本身，只负责阻止空泛报告冒充完成。
USAGE
}

if [ "$#" -eq 0 ]; then
  usage
  exit 2
fi

FAILED=0

check_pattern() {
  local file="$1"
  local label="$2"
  local pattern="$3"

  if ! grep -Eiq "$pattern" "$file"; then
    echo "FAIL [$file] 缺少${label}证据"
    FAILED=1
  else
    echo "OK   [$file] ${label}证据存在"
  fi
}

for REPORT in "$@"; do
  if [ ! -f "$REPORT" ]; then
    echo "FAIL [$REPORT] 文件不存在"
    FAILED=1
    continue
  fi

  echo "== 检查 $REPORT =="

  check_pattern "$REPORT" "编译/测试执行" \
    "BUILD SUCCESS|Tests run:|mvn .*test|gradle .*test|clean compile|compile"
  check_pattern "$REPORT" "应用启动" \
    "PID|进程|启动时间|Started .*Application|JVM running|端口|健康检查|actuator/health|UP"
  check_pattern "$REPORT" "真实接口调用" \
    "curl|HTTP|POST |GET |PUT |DELETE |PATCH |接口调用|请求|响应"
  check_pattern "$REPORT" "数据库验证" \
    "SHOW CREATE TABLE|SHOW COLUMNS|DESC |SELECT |数据库|DB|mysql"
  check_pattern "$REPORT" "日志检查" \
    "grep .*ERROR|无 ERROR|日志|ERROR|app\\.log"
  check_pattern "$REPORT" "证据等级/真实验证结论" \
    "Real integration passed|Partial real entry|Partially verified|Blocked|真实入口|API 集成|冒烟|Smoke"

  if [ -x "$HOME/.codex/hooks/superflow-test-report-lint.py" ]; then
    "$HOME/.codex/hooks/superflow-test-report-lint.py" "$REPORT"
    if [ $? -ne 0 ]; then
      FAILED=1
    fi
  fi

  if grep -Eiq "跳过|未执行|待补充|TODO|后续测试|建议.*测试|是否.*测试" "$REPORT"; then
    echo "FAIL [$REPORT] 存在跳过/待补充/后续测试类表述，不能标记完成"
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  cat <<'BLOCK_MSG'

[SDD 集成验收未通过]
任务不能交付。请补齐真实启动应用后的 API 集成测试证据：
  1. 编译/测试真实输出
  2. 应用新进程启动证据：PID、启动时间、端口、健康检查
  3. 真实 curl/API 请求与响应摘要
  4. SHOW CREATE TABLE / SELECT 等数据库验证
  5. grep ERROR 或等效日志检查
  6. 明确证据等级：Real integration passed / Partially verified / Blocked
BLOCK_MSG
  exit 2
fi

echo "SDD 集成验收证据检查通过"
exit 0
