#!/usr/bin/env python3
"""
Claude Code settings.json 备份过滤器。
删除运行时状态和敏感信息，保留用户显式配置。

用法:
  python3 sync-settings-json.py <src.json> <dest.json>
"""
import json
import sys


def filter_settings(data: dict) -> dict:
    result = {}
    for key, value in data.items():
        # 完全删除的运行时状态键
        if key in ("permissions", "enabledPlugins", "extraKnownMarketplaces"):
            continue

        # env 中删除敏感 token
        if key == "env" and isinstance(value, dict):
            env_copy = dict(value)
            env_copy.pop("ANTHROPIC_AUTH_TOKEN", None)
            if env_copy:
                result[key] = env_copy
            continue

        result[key] = value

    return result


def main():
    if len(sys.argv) != 3:
        print("用法: python3 sync-settings-json.py <src.json> <dest.json>", file=sys.stderr)
        sys.exit(1)

    src_path = sys.argv[1]
    dest_path = sys.argv[2]

    with open(src_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    filtered = filter_settings(data)

    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(filtered, f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
