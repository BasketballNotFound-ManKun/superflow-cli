#!/usr/bin/env python3
"""Project-private ECC governance reminder for maintaining Superflow CLI."""
import json
import os
import subprocess
import sys

ACTION = (
    "修改", "修复", "新增", "增加", "完善", "优化", "重构", "实现", "更新",
    "调整", "开发", "删除", "移除", "评审", "改", "fix", "add", "update",
    "refactor", "implement", "review",
)

def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        prompt = str(payload.get("prompt") or payload.get("user_prompt") or payload.get("message") or "")
        if not any(word in prompt.lower() for word in ACTION):
            return 0
        try:
            status = subprocess.run(["git", "status", "--short"], cwd=os.getcwd(),
                                    text=True, capture_output=True, timeout=3).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            status = "无法读取 git 状态"
        print("[Superflow ECC 治理提醒] 本次维护先回答：")
        print("  1. 唯一 owner 和规范事实源是什么？能否复用现有能力？")
        print("  2. Skill/Hook/Rule/Runner/Host 应放在哪一层？触发与不触发边界是什么？")
        print("  3. Codex/Claude、中英文、全局/项目安装是否保持等价且幂等？")
        print("  4. 正反例、误报成本、真实验证和回滚条件是什么？")
        print("  5. 是否只是在增加另一套路由、状态或重复 Hook？")
        if status:
            print(f"  当前工作区已有改动：{len(status.splitlines())} 项；先区分基线与本次范围。")
    except (OSError, ValueError, TypeError):
        pass
    return 0

if __name__ == "__main__":
    sys.exit(main())
