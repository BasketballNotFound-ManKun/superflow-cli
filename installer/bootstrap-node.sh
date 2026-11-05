#!/usr/bin/env bash
# The sole POSIX Node bootstrap. stdout is only the selected executable path.
set -euo pipefail

YES=0
for arg in "$@"; do
  case "$arg" in --yes) YES=1 ;; *) printf 'Unknown option / 未知参数: %s\n' "$arg" >&2; exit 1 ;; esac
done
ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/superflow/node"
HERE="$(cd "${BASH_SOURCE[0]%/*}" && pwd)"
LIB="$HERE/../scripts/npm-runtime.cjs"

supported() {
  local version major
  [ -x "$1" ] || return 1
  version="$("$1" --version 2>/dev/null)" || return 1
  version="${version#v}"; major="${version%%.*}"
  case "$major" in ''|*[!0-9]*) return 1 ;; esac
  [ "$major" -ge 20 ]
}
try_node() {
  local selected
  supported "$1" || return 1
  selected="$("$1" "$LIB" --select-installer-node 2>/dev/null)" || return 1
  [ -x "$selected" ] || return 1
  printf '%s\n' "$selected"
}

CURRENT="$(command -v node 2>/dev/null || true)"
if [ -n "$CURRENT" ] && try_node "$CURRENT"; then exit 0; fi
if [ -n "${NVM_BIN:-}" ] && try_node "$NVM_BIN/node"; then exit 0; fi
OLD_IFS="$IFS"; IFS=:
for directory in ${PATH:-}; do
  IFS="$OLD_IFS"
  if [ -n "$directory" ] && try_node "$directory/node"; then exit 0; fi
  IFS=:
done
IFS="$OLD_IFS"
for candidate in "$HOME"/.nvm/versions/node/*/bin/node "$ROOT/current/bin/node"; do
  if try_node "$candidate"; then exit 0; fi
done

BASE="${SUPERFLOW_NODE_DOWNLOAD_BASE_URL:-https://nodejs.org/dist}"
case "$BASE" in https://*) ;; *) printf 'Node download requires HTTPS / Node 下载必须使用 HTTPS\n' >&2; exit 1 ;; esac
printf '[Superflow] No usable Node.js 20+/npm found / 未找到可用的 Node.js 20+/npm。\n' >&2
printf 'Install current LTS into / 将当前 LTS 安装到: %s\nSource / 来源: %s\n' "$ROOT" "$BASE" >&2
printf 'SHA-256 is verified. Node defaults and npm configuration stay unchanged. / 核验 SHA-256，不修改现有 Node 默认版本和 npm 配置。\n' >&2
printf 'If needed, append only the Superflow command directory to shell PATH / 必要时仅将 Superflow 命令目录追加到 Shell PATH: %s\n' "$HOME/.local/bin" >&2
if [ "$YES" -ne 1 ]; then
  if [ ! -t 0 ]; then
    printf 'Interactive confirmation required; use --yes only after accepting this plan. / 请交互确认，或认可方案后显式使用 --yes。\n' >&2
    exit 1
  fi
  printf 'Continue? / 是否继续？ [y/N] > ' >&2
  read -r answer || exit 1
  case "$answer" in y|Y|yes|YES) ;; *) printf 'Cancelled / 已取消\n' >&2; exit 1 ;; esac
fi

case "$(uname -s)" in Darwin) OS=darwin ;; Linux) OS=linux ;; *) printf 'Unsupported platform / 不支持的平台\n' >&2; exit 1 ;; esac
case "$(uname -m)" in arm64|aarch64) ARCH=arm64 ;; x86_64|amd64) ARCH=x64 ;; *) printf 'Unsupported architecture / 不支持的架构\n' >&2; exit 1 ;; esac
command -v curl >/dev/null 2>&1 || { printf 'curl is required / 缺少 curl\n' >&2; exit 1; }
mkdir -p "$ROOT"
LOCK="$ROOT/.install.lock"
mkdir "$LOCK" 2>/dev/null || { printf 'Another Node installation is active / 另一项 Node 安装正在进行\n' >&2; exit 1; }
TEMP=""
trap '[ -z "$TEMP" ] || rm -rf "$TEMP"; rmdir "$LOCK" 2>/dev/null || true' EXIT
TEMP="$(mktemp -d "${TMPDIR:-/tmp}/superflow-node.XXXXXX")"
fetch() { curl -fsSL --proto '=https' --proto-redir '=https' --retry 2 -o "$2" "$1"; }
fetch "${BASE%/}/index.tab" "$TEMP/index.tab"
VERSION="$(awk -F '\t' 'NR>1 && $1 ~ /^v[0-9]+\.[0-9]+\.[0-9]+$/ && $10 != "-" && $10 != "" { split(substr($1,2),v,"."); if(v[1]>=20){print $1;exit} }' "$TEMP/index.tab")"
[ -n "$VERSION" ] || { printf 'Cannot identify a supported LTS / 无法确认合格的 LTS 版本\n' >&2; exit 1; }
RELEASE="node-$VERSION-$OS-$ARCH"
ARCHIVE="$RELEASE.tar.gz"
fetch "${BASE%/}/$VERSION/SHASUMS256.txt" "$TEMP/SHASUMS256.txt"
fetch "${BASE%/}/$VERSION/$ARCHIVE" "$TEMP/$ARCHIVE"
EXPECTED="$(awk -v name="$ARCHIVE" '$2==name {print $1}' "$TEMP/SHASUMS256.txt")"
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TEMP/$ARCHIVE")"
else
  ACTUAL="$(shasum -a 256 "$TEMP/$ARCHIVE")"
fi
ACTUAL="${ACTUAL%% *}"
[ "${#EXPECTED}" -eq 64 ] && [ "$EXPECTED" = "$ACTUAL" ] || { printf 'SHA-256 mismatch / SHA-256 校验失败\n' >&2; exit 1; }
tar -tzf "$TEMP/$ARCHIVE" | awk -v root="$RELEASE" '
  $0 !~ ("^" root "(/|$)") || $0 ~ /(^|\/)\.\.(\/|$)/ {bad=1}
  END {exit bad}' || { printf 'Unsafe archive paths / 压缩包路径不安全\n' >&2; exit 1; }
tar -xzf "$TEMP/$ARCHIVE" -C "$TEMP"
supported "$TEMP/$RELEASE/bin/node" && [ -s "$TEMP/$RELEASE/lib/node_modules/npm/bin/npm-cli.js" ] || {
  printf 'Downloaded runtime cannot run / 下载的运行时不可用\n' >&2; exit 1;
}
DEST="$ROOT/$RELEASE"
if [ -e "$DEST" ]; then
  supported "$DEST/bin/node" && [ -s "$DEST/lib/node_modules/npm/bin/npm-cli.js" ] || {
    printf 'Preserve existing runtime directory / 保留已有运行时目录，请先核验: %s\n' "$DEST" >&2; exit 1;
  }
else
  mv "$TEMP/$RELEASE" "$DEST"
fi
if [ -e "$ROOT/current" ] && [ ! -L "$ROOT/current" ]; then
  printf 'Preserve custom current directory / 保留用户自定义 current 目录\n' >&2; exit 1
fi
ln -sfn "$RELEASE" "$ROOT/current"
case ":${PATH:-}:" in
  *":$HOME/.local/bin:"*) ;;
  *)
    case "${SHELL:-}" in
      */zsh) PROFILES=("$HOME/.zprofile" "$HOME/.zshrc") ;;
      */bash) PROFILES=("$HOME/.bashrc"); if [ -f "$HOME/.bash_profile" ]; then PROFILES+=("$HOME/.bash_profile"); else PROFILES+=("$HOME/.profile"); fi ;;
      */sh|*/dash|'') PROFILES=("$HOME/.profile") ;;
      *) printf 'Configure the CLI path in your shell before continuing / 请先在当前 Shell 配置命令目录: %s\n' "$HOME/.local/bin" >&2; exit 1 ;;
    esac
    for profile in "${PROFILES[@]}"; do
      [ ! -L "$profile" ] || { printf 'Preserve custom profile symlink / 保留用户配置软链接: %s\n' "$profile" >&2; exit 1; }
      if [ -f "$profile" ]; then
        if awk '/# >>> Superflow CLI path >>>/ {found=1} END {exit !found}' "$profile"; then continue; fi
        if [ ! -e "$profile.superflow-backup" ]; then cp -p "$profile" "$profile.superflow-backup"; fi
      fi
      printf '\n' >> "$profile"
      cat >> "$profile" <<'PROFILE'
# >>> Superflow CLI path >>>
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$PATH:$HOME/.local/bin" ;; esac
# <<< Superflow CLI path <<<
PROFILE
    done
    printf 'Restart the terminal/Agent to load the command path / 请重启终端和 Agent 加载命令路径。\n' >&2
    ;;
esac
printf '%s\n' "$DEST/bin/node"
