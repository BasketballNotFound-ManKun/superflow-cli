#!/usr/bin/env python3
"""Fail-open session observation for repeated edits and tool failures."""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path


EDIT_WINDOW = 600
FAILURE_WINDOW = 300
EDIT_LIMIT = 5
FAILURE_LIMIT = 3
# These bounds limit advisory observation, never the Agent's tool execution.
MAX_OBSERVED_FILES = 128
MAX_OBSERVED_BYTES = 8 * 1024 * 1024
MAX_FILE_BYTES = 1024 * 1024
GIT_TIMEOUT = 1


def working_directory(payload):
    return Path(payload.get("cwd") or os.getcwd()).expanduser().resolve()


def project_root(payload):
    cwd = working_directory(payload)
    result = subprocess.run(["git", "-C", str(cwd), "rev-parse",
                             "--show-toplevel"], capture_output=True,
                            text=True, check=False, timeout=GIT_TIMEOUT)
    if result.returncode:
        return None, None
    repository = Path(result.stdout.strip()).resolve()
    # Reuse the existing planning-home marker conventions without a recursive
    # repository search: only cwd's ancestry can select this Hook's project.
    for candidate in (cwd, *cwd.parents):
        if not candidate.is_relative_to(repository):
            break
        if ((candidate / "openspec").is_dir() or
                (candidate / "doc" / "openspec").is_dir() or
                (candidate / ".sdd").is_dir() or
                (candidate / ".sdd-enforced").is_file()):
            return candidate, repository
    return None, repository


def state_path(root, payload):
    session = (payload.get("session_id") or
               os.environ.get("CODEX_SESSION_ID") or
               os.environ.get("CLAUDE_CODE_SESSION_ID"))
    if not session:
        return None
    identity = f"{root}:{session}"
    digest = hashlib.sha256(identity.encode()).hexdigest()[:24]
    return Path(tempfile.gettempdir()) / f"superflow-loop-{digest}.json"


def load_state(file):
    if not file.is_file():
        return {"edits": {}, "failures": {}}
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            state = {"edits": data.get("edits", {}),
                     "failures": data.get("failures", {})}
            if isinstance(data.get("contents"), dict):
                state["contents"] = data["contents"]
            if isinstance(data.get("git_paths"), list):
                state["git_paths"] = data["git_paths"]
            return state
    except (OSError, ValueError):
        pass
    return {"edits": {}, "failures": {}}


def save_state(file, state):
    temporary = file.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    temporary.replace(file)


def recent(values, now, window):
    return [stamp for stamp in values if isinstance(stamp, (int, float))
            and 0 <= now - stamp < window]


def edited_paths(root, payload):
    tool_input = payload.get("tool_input") or {}
    paths = [tool_input.get("file_path")]
    patch = tool_input.get("patch") or tool_input.get("command") or ""
    paths += re.findall(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", patch, re.M)
    result = set()
    for raw in paths:
        if not isinstance(raw, str) or not raw:
            continue
        candidate = Path(raw).expanduser()
        candidate = (candidate if candidate.is_absolute() else
                     working_directory(payload) / candidate).resolve()
        try:
            result.add(candidate.relative_to(root).as_posix())
        except ValueError:
            continue
    return result


def operation_identity(payload):
    tool = str(payload.get("tool_name") or "unknown")
    tool_input = payload.get("tool_input") or {}
    if re.search(r"(?:^|[._])(Bash|exec_command|shell_command)$", tool, re.I):
        operation = tool_input.get("command") or tool_input.get("cmd")
        if not isinstance(operation, str) or not operation.strip():
            return None
    else:
        if not isinstance(tool_input, dict) or not tool_input:
            return None
        operation = tool_input
    cwd = working_directory(payload)
    declared_cwd = tool_input.get("workdir") or tool_input.get("cwd")
    if declared_cwd:
        cwd = (cwd / Path(declared_cwd).expanduser()).resolve()
    identity = json.dumps([tool, str(cwd), operation],
                          sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(identity.encode()).hexdigest()


def path_content(root, raw, budget):
    candidate = root / raw
    # Do not follow directory symlinks outside the selected project.
    if not candidate.parent.resolve().is_relative_to(root):
        return None
    if candidate.is_symlink():
        return "symlink:" + os.readlink(candidate), 0
    if not candidate.exists():
        return "missing", 0
    if not candidate.is_file():
        return None
    maximum = min(MAX_FILE_BYTES, budget)
    if candidate.stat().st_size > maximum:
        return None
    with candidate.open("rb") as source:
        data = source.read(maximum + 1)
    if len(data) > maximum:
        return None
    return hashlib.sha256(data).hexdigest(), len(data)


def dirty_contents(root, repository, previous_paths):
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "status", "--porcelain=v1", "-z",
             "--untracked-files=all", "--", "."],
            capture_output=True, check=False, timeout=GIT_TIMEOUT,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode:
        return None
    records = iter(result.stdout.split(b"\0"))
    paths = set(previous_paths)
    dirty = set()
    for record in records:
        if not record:
            continue
        # -z quotes no paths; a rename/copy also carries the original path.
        raw_paths = [record[3:]]
        if b"R" in record[:2] or b"C" in record[:2]:
            raw_paths.append(next(records, b""))
        for raw in raw_paths:
            candidate = repository / os.fsdecode(raw)
            if candidate.is_relative_to(root):
                dirty.add(candidate.relative_to(root).as_posix())
        paths.update(dirty)
        if len(paths) > MAX_OBSERVED_FILES:
            return None
    contents = {}
    remaining = MAX_OBSERVED_BYTES
    for raw in paths:
        observed = path_content(root, raw, remaining)
        if observed is None:
            return None
        contents[raw], size = observed
        remaining -= size
    return contents, sorted(dirty)


def reminder_language():
    language = os.environ.get("SUPERFLOW_LANG", "")
    if not language:
        try:
            state = json.loads((Path.home() / ".sdd-state.json").read_text(
                encoding="utf-8"))
            language = state.get("language", "")
        except (OSError, ValueError, AttributeError):
            pass
    return "en" if re.match(r"^en(?:[-_]|$)", str(language)) else "zh"


def reminder(kind, subject, count):
    if reminder_language() == "en":
        if kind == "edit":
            return (f"[Superflow loop reminder] {subject} changed {count} times "
                    "in 10 minutes; review the failure cause and approach.")
        return (f"[Superflow failure reminder] {subject}: the same operation "
                f"failed {count} times in 5 minutes; analyze the cause before "
                "deciding whether to retry.")
    if kind == "edit":
        return (f"[Superflow 循环提醒] {subject} 在 10 分钟内修改 {count} 次；"
                "请核对失败原因和实现方案。")
    return (f"[Superflow 失败提醒] {subject} 同一操作在 5 分钟内失败 "
            f"{count} 次；先分析原因，再决定是否重试。")


def observe_success(root, repository, payload, state, now):
    messages = []
    operation = operation_identity(payload)
    if operation:
        state["failures"].pop(operation, None)
    tool = str(payload.get("tool_name") or "unknown")
    direct = bool(re.search(r"(?:^|[._])(Edit|Write|MultiEdit|apply_patch)$",
                            tool, re.I))
    if not direct and not re.search(
            r"(?:^|[._])(Bash|exec_command|shell_command)$", tool, re.I):
        return
    previous = state.get("contents")
    had_git_baseline = "git_paths" in state
    observed = dirty_contents(root, repository, state.get("git_paths", []))
    contents = {}
    if observed is not None:
        contents, state["git_paths"] = observed
    else:
        state.pop("git_paths", None)
    explicit = edited_paths(root, payload) if direct else set()
    # Explicit editor paths remain observable when Git ignores a file or the
    # repository-wide snapshot exceeds its budget. Both sources share digests.
    remaining = MAX_OBSERVED_BYTES
    for raw in sorted(explicit)[:MAX_OBSERVED_FILES]:
        if raw in contents:
            continue
        observed_path = path_content(root, raw, remaining)
        if observed_path is not None:
            contents[raw], size = observed_path
            remaining -= size
    if previous is None:
        changed = {raw for raw in explicit & contents.keys()
                   if contents[raw] != "missing"}
    else:
        changed = {path for path, digest in contents.items()
                   if previous.get(path) != digest and
                   (digest != "missing" or path in previous) and
                   (had_git_baseline or path in explicit)}
    state["contents"] = {**(previous or {}), **contents}
    for path in sorted(changed):
        entry = state["edits"].get(path, {})
        stamps = recent(entry.get("times", []), now, EDIT_WINDOW)
        was_warned = bool(entry.get("warned")) and bool(stamps)
        stamps.append(now)
        state["edits"][path] = {"times": stamps, "warned": was_warned}
        if len(stamps) > EDIT_LIMIT and not was_warned:
            messages.append(reminder("edit", path, len(stamps)))
            state["edits"][path]["warned"] = True
    return messages


def observe_failure(payload, state, now):
    tool = str(payload.get("tool_name") or "unknown")
    operation = operation_identity(payload)
    if operation is None:
        return
    entry = state["failures"].get(operation, {})
    stamps = recent(entry.get("times", []), now, FAILURE_WINDOW)
    was_warned = bool(entry.get("warned")) and bool(stamps)
    stamps.append(now)
    state["failures"][operation] = {"times": stamps, "warned": was_warned}
    if len(stamps) >= FAILURE_LIMIT and not was_warned:
        state["failures"][operation]["warned"] = True
        return [reminder("failure", tool, len(stamps))]


def prune_state(state, now):
    for bucket, window in (("edits", EDIT_WINDOW), ("failures", FAILURE_WINDOW)):
        for key, entry in list(state[bucket].items()):
            if not isinstance(entry, dict):
                del state[bucket][key]
                continue
            entry["times"] = recent(entry.get("times", []), now, window)
            if not entry["times"]:
                del state[bucket][key]


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        event = payload.get("hook_event_name")
        # Both hosts consume PostToolUse additionalContext. Claude also emits
        # PostToolUseFailure; Codex currently reports tools through PostToolUse.
        # Never infer an event from a tool name or a wrapper's command flags.
        if event not in ("PostToolUse", "PostToolUseFailure", "SessionEnd"):
            return 0
        root, repository = project_root(payload)
        if event == "SessionEnd":
            if not repository:
                return 0
            for candidate in (working_directory(payload),
                              *working_directory(payload).parents):
                if not candidate.is_relative_to(repository):
                    break
                file = state_path(candidate, payload)
                if file:
                    file.unlink(missing_ok=True)
            return 0
        if not root:
            return 0
        file = state_path(root, payload)
        if file is None:
            return 0
        state = load_state(file)
        now = time.time()
        prune_state(state, now)
        if event == "PostToolUseFailure":
            messages = observe_failure(payload, state, now)
        else:
            messages = observe_success(root, repository, payload, state, now)
        save_state(file, state)
        if messages:
            # Exit-0 stderr and plain stdout are not model context for these
            # events. Emit only advisory context: no decision or turn control.
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": event,
                "additionalContext": "\n".join(messages),
            }}, ensure_ascii=False))
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
