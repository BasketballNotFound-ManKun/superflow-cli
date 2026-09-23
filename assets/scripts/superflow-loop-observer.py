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


def project_root():
    result = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                            capture_output=True, text=True, check=False)
    return Path(result.stdout.strip()).resolve() if result.returncode == 0 else None


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
            return {"edits": data.get("edits", {}),
                    "failures": data.get("failures", {})}
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
    patch = tool_input.get("patch") or ""
    paths += re.findall(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", patch, re.M)
    result = set()
    for raw in paths:
        if not isinstance(raw, str) or not raw:
            continue
        candidate = Path(raw).expanduser()
        candidate = (candidate if candidate.is_absolute() else root / candidate).resolve()
        try:
            result.add(candidate.relative_to(root).as_posix())
        except ValueError:
            continue
    return result


def observe_success(root, payload, state, now):
    tool = str(payload.get("tool_name") or "unknown")
    state["failures"].pop(tool, None)
    if not re.search(r"(?:^|[._])(Edit|Write|MultiEdit|apply_patch)$", tool, re.I):
        return
    for path in edited_paths(root, payload):
        entry = state["edits"].get(path, {})
        stamps = recent(entry.get("times", []), now, EDIT_WINDOW)
        was_warned = bool(entry.get("warned")) and bool(stamps)
        stamps.append(now)
        state["edits"][path] = {"times": stamps, "warned": was_warned}
        if len(stamps) > EDIT_LIMIT and not was_warned:
            print(f"[Superflow 循环提醒] {path} 在 10 分钟内修改 {len(stamps)} 次；"
                  "请核对失败原因和实现方案。", file=sys.stderr)
            state["edits"][path]["warned"] = True


def observe_failure(payload, state, now):
    tool = str(payload.get("tool_name") or "unknown")
    entry = state["failures"].get(tool, {})
    stamps = recent(entry.get("times", []), now, FAILURE_WINDOW)
    was_warned = bool(entry.get("warned")) and bool(stamps)
    stamps.append(now)
    state["failures"][tool] = {"times": stamps, "warned": was_warned}
    if len(stamps) >= FAILURE_LIMIT and not was_warned:
        print(f"[Superflow 失败提醒] {tool} 在 5 分钟内连续失败 "
              f"{len(stamps)} 次；先分析原因，再决定是否重试。", file=sys.stderr)
        state["failures"][tool]["warned"] = True


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
        root = project_root()
        if not root or not ((root / "openspec").exists() or
                            (root / ".sdd").exists() or
                            (root / ".sdd-enforced").exists()):
            return 0
        file = state_path(root, payload)
        if file is None:
            return 0
        if "--end" in sys.argv:
            file.unlink(missing_ok=True)
            return 0
        state = load_state(file)
        now = time.time()
        prune_state(state, now)
        if "--failure" in sys.argv:
            observe_failure(payload, state, now)
        else:
            observe_success(root, payload, state, now)
        save_state(file, state)
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
