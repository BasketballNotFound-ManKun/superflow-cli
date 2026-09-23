#!/usr/bin/env python3
"""Advisory Markdown placement reminder; always exits successfully."""
import json
import os
import sys
from pathlib import Path

ROOT = {"README.md", "AGENTS.md", "CLAUDE.md", "CONTEXT.md", "CHANGELOG.md"}

def main():
    try:
        data = json.loads(sys.stdin.read() or "{}")
        tool = data.get("tool_input") or {}
        raw = tool.get("file_path") or ""
        if not raw.lower().endswith(".md"):
            return 0
        cwd = Path(data.get("cwd") or os.getcwd()).resolve()
        path = Path(raw).expanduser()
        path = (path if path.is_absolute() else cwd / path).resolve()
        if path.exists():
            return 0
        try:
            relative = path.relative_to(cwd).as_posix()
        except ValueError:
            return 0
        parts = relative.split("/")
        if len(parts) == 1 and relative not in ROOT:
            print(f"[Superflow 文档落位] 新建 {relative} 不在仓根白名单；"
                  "任务产物建议放入 .ake/tasks/<日期>-<slug>/。", file=sys.stderr)
        elif len(parts) == 2 and parts[0].lower() == "docs":
            print(f"[Superflow 文档落位] 新建 {relative} 位于 docs/ 顶层；"
                  "请放入 docs/adr/、docs/howto/ 等主题子目录。", file=sys.stderr)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        pass
    return 0

if __name__ == "__main__":
    sys.exit(main())
