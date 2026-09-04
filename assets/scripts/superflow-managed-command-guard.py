#!/usr/bin/env python3
"""Pre-tool guard for Superflow managed Agent roles."""

from __future__ import annotations

import json
import os
import re
import shlex
import sys
from pathlib import Path


def task_language() -> str:
    root = os.environ.get("SUPERFLOW_MANAGED_PROJECT_ROOT", "")
    task_id = os.environ.get("SUPERFLOW_MANAGED_TASK_ID", "")
    if not root or not task_id:
        return "zh"
    task_file = Path(root) / ".superflow" / "tasks" / task_id / "task.json"
    try:
        return json.loads(task_file.read_text(encoding="utf-8")).get(
            "language", "zh"
        )
    except (OSError, ValueError):
        return "zh"


def block(zh: str, en: str | None = None) -> None:
    message = en if task_language() == "en" and en else zh
    print(f"[Superflow managed-work guard] {message}", file=sys.stderr)
    raise SystemExit(2)


def tool_field(payload: dict, *names: str) -> str:
    tool_input = payload.get("tool_input") or {}
    for name in names:
        value = tool_input.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def canonical(value: str, root: Path) -> Path:
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    return candidate.resolve(strict=False)


def overlaps_protected(candidate: Path, protected: list[Path]) -> bool:
    for item in protected:
        if candidate == item or candidate in item.parents:
            return True
    return False


def protected_entries() -> tuple[list[Path], list[Path]]:
    manifest_path = os.environ.get("SUPERFLOW_MANAGED_CONTEXT_MANIFEST", "")
    if not manifest_path:
        return [], []
    try:
        manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        block(
            f"无法读取受保护输入清单，按失败关闭：{error}",
            f"Cannot read the protected-input manifest; failing closed: {error}",
        )
    immutable: list[Path] = []
    retained: list[Path] = []
    for entry in manifest.get("entries", []):
        entry_path = entry.get("path")
        if not isinstance(entry_path, str) or not entry_path:
            continue
        target = Path(entry_path).resolve(strict=False)
        if entry.get("protection", "immutable") == "retain":
            retained.append(target)
        else:
            immutable.append(target)
    return immutable, retained


def shell_tokens(command: str) -> list[str]:
    try:
        return shlex.split(command, posix=os.name != "nt")
    except ValueError:
        return command.split()


def path_tokens(command: str, root: Path) -> list[Path]:
    tokens = shell_tokens(command)
    values: list[Path] = []
    for token in tokens:
        cleaned = token.strip("'\"")
        if (
            not cleaned
            or cleaned.startswith("-")
            or "$" in cleaned
            or cleaned in {"rm", "mv", "cp", "truncate", "unlink", "rmdir"}
        ):
            continue
        values.append(canonical(cleaned, root))
    return values


def mutates_files(command: str) -> bool:
    return bool(
        re.search(
            r"(?:^|[;&|]\s*)(?:rm|mv|cp|truncate|unlink|rmdir)\s"
            r"|\bsed\s+[^;&|]*-[A-Za-z]*i\b"
            r"|\bperl\s+[^;&|]*-[A-Za-z]*i\b"
            r"|(?:^|[^>])>{1,2}\s*[^&]",
            command,
            re.IGNORECASE,
        )
    )


def safe_workspace_rm(command: str, root: Path) -> bool:
    allowed = {
        "target",
        "build",
        "dist",
        "coverage",
        ".gradle",
        ".cache",
        ".tmp",
        "tmp",
    }
    matched = False
    for segment in re.split(r"[;&|]", command):
        if not re.search(r"(?:^|\s)rm\s+-[^\s]*r[^\s]*f", segment):
            continue
        matched = True
        tokens = shell_tokens(segment)
        try:
            start = tokens.index("rm") + 1
        except ValueError:
            return False
        targets = [token for token in tokens[start:] if not token.startswith("-")]
        if not targets:
            return False
        for value in targets:
            if "$" in value:
                return False
            target = canonical(value, root)
            try:
                relative = target.relative_to(root)
            except ValueError:
                return False
            if not relative.parts or relative.parts[0] not in allowed:
                return False
    return matched


def guard_supervisor(tool_name: str, command: str) -> None:
    if tool_name in {"Edit", "Write", "MultiEdit", "NotebookEdit", "apply_patch"}:
        block(
            "监督角色只允许检查，禁止修改目标文件。",
            "The supervisor is read-only and cannot modify target files.",
        )
    if command and re.search(
        r"(?:^|\s)(?:rm|mv|cp|mkdir|touch|chmod|chown)(?:\s|$)"
        r"|git\s+(?:add|commit|push|tag|reset|checkout|restore)"
        r"|npm\s+publish|apply_patch|sed\s+-i|(?:^|[^>])>{1,2}\s|tee\s",
        command,
        re.IGNORECASE,
    ):
        block(
            "监督角色的 Bash 仅允许只读检查，检测到可能写入的命令。",
            "Supervisor shell access is read-only; a mutating command was detected.",
        )


def guard_executor(
    tool_name: str,
    file_path: str,
    command: str,
    root: Path,
    immutable: list[Path],
    retained: list[Path],
) -> None:
    write_tools = {"Edit", "Write", "MultiEdit", "NotebookEdit", "apply_patch"}
    if tool_name in write_tools:
        if not file_path:
            block(
                "写入工具缺少目标路径，按失败关闭。",
                "The write tool has no target path; failing closed.",
            )
        target = canonical(file_path, root)
        if ".superflow/tasks" in target.as_posix():
            block(
                "执行角色禁止修改托管状态、事件、Prompt 和过程报告。",
                "The executor cannot edit managed state, events, prompts, or run reports.",
            )
        if target in immutable:
            block(
                f"冻结输入只读，禁止修改：{target}",
                f"Frozen input is read-only: {target}",
            )

    if command and ".superflow/tasks/" in command.replace("\\", "/"):
        block(
            "执行角色的 Bash 禁止直接访问托管运行目录，请使用只读工具。",
            "Executor shell commands cannot access the managed run directory; use read-only tools.",
        )
    if command and re.search(
        r"git\s+(?:add|commit|push|tag)|npm\s+publish"
        r"|dangerously-(?:bypass|skip)|kubectl\s+(?:apply|delete)"
        r"|helm\s+(?:install|upgrade)|DROP\s+(?:DATABASE|TABLE)"
        r"|TRUNCATE\s+TABLE",
        command,
        re.IGNORECASE,
    ):
        block(
            "执行角色禁止自动 Git、发布、部署、绕过沙箱或高破坏数据库操作。",
            "The executor cannot perform Git delivery, publish, deploy, bypass the sandbox, or run destructive database operations.",
        )

    if command and mutates_files(command):
        targets = path_tokens(command, root)
        if any(overlaps_protected(target, immutable + retained) for target in targets):
            block(
                "命令试图删除、移动、截断或覆盖受保护合同/交付文档。",
                "The command would delete, move, truncate, or overwrite a protected contract or retained delivery document.",
            )

    if not command:
        return
    if re.search(r"(?:^|[;&|]\s*)(?:pkill|killall)\b", command):
        block(
            "禁止按进程名清理；必须通过 owner helper 校验任务进程身份。",
            "Process-name cleanup is forbidden; verify task ownership through the owner helper.",
        )
    if (
        re.search(r"(?:^|[;&|]\s*)kill\s+(?!-0\b)", command)
        and "superflow_signal_owner" not in command
    ):
        block(
            "禁止使用裸 kill；必须调用 superflow_signal_owner。",
            "Bare kill is forbidden; call superflow_signal_owner.",
        )
    if (
        re.search(
            r"\bdocker\s+(?:(?:container|network|volume)\s+)?rm\b",
            command,
            re.IGNORECASE,
        )
        and "superflow_docker_remove_verified" not in command
    ):
        block(
            "禁止直接删除 Docker 资源；必须调用 owner helper 核验标签。",
            "Direct Docker deletion is forbidden; verify labels through the owner helper.",
        )
    if re.search(r"(?:^|[;&|]\s*)rm\s+-[^;&|]*r[^;&|]*f", command):
        if (
            "superflow_runtime_remove_verified" not in command
            and not safe_workspace_rm(command, root)
        ):
            block(
                "rm -rf 仅允许清理仓库构建缓存；运行目录必须通过 owner helper 删除。",
                "rm -rf may only clean repository build caches; runtime directories require the owner helper.",
            )


def main() -> None:
    role = os.environ.get("SUPERFLOW_MANAGED_ROLE", "")
    if not role:
        return
    if role not in {"supervisor", "executor"}:
        block(
            "检测到非法托管角色，按失败关闭。",
            "Invalid managed role; failing closed.",
        )
    try:
        payload = json.load(sys.stdin)
    except (ValueError, TypeError):
        block(
            "Hook 输入不是有效 JSON，按失败关闭。",
            "Hook input is not valid JSON; failing closed.",
        )
    if not isinstance(payload, dict):
        block(
            "Hook 输入不是 JSON 对象，按失败关闭。",
            "Hook input is not a JSON object; failing closed.",
        )

    tool_name = str(payload.get("tool_name") or payload.get("tool") or "")
    file_path = tool_field(payload, "file_path", "path", "file")
    command = tool_field(payload, "command", "cmd").replace("\n", " ")
    root = Path(
        os.environ.get("SUPERFLOW_MANAGED_PROJECT_ROOT", os.getcwd())
    ).resolve(strict=False)
    immutable, retained = protected_entries()

    if role == "supervisor":
        guard_supervisor(tool_name, command)
    else:
        guard_executor(
            tool_name,
            file_path,
            command,
            root,
            immutable,
            retained,
        )


if __name__ == "__main__":
    main()
