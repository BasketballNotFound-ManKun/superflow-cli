#!/usr/bin/env python3
"""Record Java edits and compile affected Maven/Gradle modules once at Stop."""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


BUILD_FILES = {"pom.xml", "build.gradle", "build.gradle.kts",
               "settings.gradle", "settings.gradle.kts", "gradle.properties"}


def project_root():
    result = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                            capture_output=True, text=True, check=False)
    return Path(result.stdout.strip()).resolve() if result.returncode == 0 else None


def state_file(root, payload):
    session = str(payload.get("session_id") or os.environ.get("CODEX_SESSION_ID")
                  or os.environ.get("CLAUDE_CODE_SESSION_ID") or "default")
    safe = "".join(char if char.isalnum() or char in "-_" else "_" for char in session)
    import hashlib
    digest = hashlib.sha256(str(root).encode()).hexdigest()[:12]
    return Path(tempfile.gettempdir()) / f"superflow-java-edits-{digest}-{safe}.txt"


def in_root(root, file_path):
    try:
        path = Path(file_path).expanduser()
        path = (path if path.is_absolute() else root / path).resolve()
        path.relative_to(root)
        return path
    except (ValueError, OSError):
        return None


def record(root, payload):
    tool_input = payload.get("tool_input") or {}
    targets = [tool_input.get("file_path")]
    patch = tool_input.get("patch") or ""
    targets += re.findall(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$",
                          patch, re.M)
    paths = [in_root(root, target) for target in targets if target]
    relevant = {path for path in paths if path and
                (path.suffix == ".java" or path.name in BUILD_FILES)}
    if relevant:
        with state_file(root, payload).open("a", encoding="utf-8") as state:
            state.write("\n".join(str(path) for path in sorted(relevant)) + "\n")
    return 0


def build_root(root, file_path):
    directory = file_path.parent
    while directory == root or root in directory.parents:
        if any((directory / name).is_file()
               for name in ("pom.xml", "build.gradle", "build.gradle.kts")):
            return directory
        if directory == root:
            break
        directory = directory.parent
    return None


def maven_reactor(root, module):
    current = module.parent
    while current == root or root in current.parents:
        pom = current / "pom.xml"
        if pom.is_file():
            relative = module.relative_to(current).as_posix()
            pattern = r"<module>\s*" + re.escape(relative) + r"\s*</module>"
            if re.search(pattern, pom.read_text(encoding="utf-8")):
                return current, relative
        if current == root:
            break
        current = current.parent
    return module, None


def gradle_reactor(root, module):
    current = module.parent
    while current == root or root in current.parents:
        settings = current / "settings.gradle"
        kotlin = current / "settings.gradle.kts"
        config = settings if settings.is_file() else kotlin
        if config.is_file():
            relative = module.relative_to(current).as_posix().replace("/", ":")
            if f":{relative}" in config.read_text(encoding="utf-8"):
                return current, f":{relative}:compileJava"
        if current == root:
            break
        current = current.parent
    return module, "compileJava"


def compile_command(root, modules):
    module = modules[0]
    if (module / "pom.xml").is_file():
        reactor, _ = maven_reactor(root, module)
        executable = reactor / "mvnw"
        command = str(executable) if executable.is_file() else shutil.which("mvn")
        if not command:
            return None, "未找到 mvn/mvnw，无法确认编译结果"
        args = [command, "-q", "-f", str(reactor / "pom.xml")]
        relatives = [maven_reactor(root, item)[1] for item in modules]
        if all(relatives):
            args += ["-pl", ",".join(sorted(relatives)), "-am"]
        return args + ["compile"], None
    reactor, _ = gradle_reactor(root, module)
    executable = reactor / "gradlew"
    command = str(executable) if executable.is_file() else shutil.which("gradle")
    if not command:
        return None, "未找到 gradle/gradlew，无法确认编译结果"
    tasks = sorted({gradle_reactor(root, item)[1] for item in modules})
    return [command, "-q", "-p", str(reactor), *tasks], None


def stop(root, payload):
    state = state_file(root, payload)
    if not state.is_file():
        return 0
    files = {in_root(root, line.strip()) for line in state.read_text().splitlines()}
    modules = {build_root(root, file) for file in files if file}
    modules.discard(None)
    if not modules:
        state.unlink(missing_ok=True)
        return 0
    groups = {}
    for module in modules:
        if (module / "pom.xml").is_file():
            reactor, _ = maven_reactor(root, module)
        else:
            reactor, _ = gradle_reactor(root, module)
        groups.setdefault(reactor, []).append(module)
    for reactor, members in sorted(groups.items()):
        command, error = compile_command(root, sorted(members))
        if error:
            print(f"[Superflow Java 编译] {reactor}: {error}", file=sys.stderr)
            return 2
        try:
            result = subprocess.run(command, cwd=root, capture_output=True,
                                    text=True, timeout=120, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            print(f"[Superflow Java 编译] {reactor}: {exc}", file=sys.stderr)
            return 2
        if result.returncode:
            detail = (result.stdout + result.stderr).strip()[-3000:]
            print(f"[Superflow Java 编译] {reactor} 编译失败：\n{detail}",
                  file=sys.stderr)
            return 2
    state.unlink(missing_ok=True)
    return 0


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return 0
    root = project_root()
    if not root or not ((root / "openspec").exists() or
                        (root / ".sdd").exists() or
                        (root / ".sdd-enforced").exists()):
        return 0
    try:
        return stop(root, payload) if "--stop" in sys.argv else record(root, payload)
    except OSError as exc:
        print(f"[Superflow Java 编译] Hook 内部错误：{exc}", file=sys.stderr)
        return 0


if __name__ == "__main__":
    sys.exit(main())
