#!/usr/bin/env bash
# 由任务验收入口通过可配置路径 source 的 owner 校验公共 helper，禁止复制后分叉维护。
# 模板只提供确定事实：PID、lstart、nonce、真实进程签名、真实监听端口、
# Docker task/nonce/name 标签与 runtime 目录 marker。
# 业务 key/表能否删除仍由任务验收入口与 Host 评审决定。

superflow_lstart_of() {
  ps -o lstart= -p "$1" 2>/dev/null | sed 's/^ *//;s/  */ /g'
}

superflow_pid_listens() {
  lsof -nP -a -p "$1" -iTCP:"$2" -sTCP:LISTEN 2>/dev/null \
    | grep -q LISTEN
}

superflow_owner_matches() {
  local pidfile="$1" fingerprint="$2" nonce="$3" port="$4" signature="$5"
  [ -f "$pidfile" ] && [ -f "$fingerprint" ] || return 1
  local pid recorded_pid recorded_nonce recorded_port recorded_lstart live args
  pid="$(tr -dc '0-9' < "$pidfile")"
  recorded_pid="$(sed -n 's/^PID=//p' "$fingerprint")"
  recorded_nonce="$(sed -n 's/^NONCE=//p' "$fingerprint")"
  recorded_port="$(sed -n 's/^PORT=//p' "$fingerprint")"
  recorded_lstart="$(sed -n 's/^LSTART=//p' "$fingerprint")"
  [ -n "$pid" ] && [ "$pid" = "$recorded_pid" ] || return 1
  [ "$recorded_nonce" = "$nonce" ] || return 1
  [ "$recorded_port" = "$port" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  live="$(superflow_lstart_of "$pid")"
  [ -n "$recorded_lstart" ] && [ "$recorded_lstart" = "$live" ] || return 1
  args="$(ps -o args= -p "$pid" 2>/dev/null || true)"
  printf '%s' "$args" | grep -Fq -- "$signature" || return 1
  superflow_pid_listens "$pid" "$port"
}

superflow_write_fingerprint() {
  local fingerprint="$1" pid="$2" nonce="$3" port="$4" signature="$5"
  local lstart
  lstart="$(superflow_lstart_of "$pid")"
  [ -n "$lstart" ] || return 1
  cat >"$fingerprint" <<EOF
PID=$pid
NONCE=$nonce
PORT=$port
LSTART=$lstart
SIGNATURE=$signature
EOF
}

# 等待后若需升级信号，必须再次调用本函数，禁止复用首次校验后的裸 PID。
superflow_signal_owner() {
  local signal="$1" pidfile="$2" fingerprint="$3" nonce="$4" port="$5"
  local signature="$6" pid
  superflow_owner_matches \
    "$pidfile" "$fingerprint" "$nonce" "$port" "$signature" || return 1
  pid="$(tr -dc '0-9' <"$pidfile")"
  kill "-$signal" "$pid"
}

superflow_docker_exists() {
  local docker_bin="$1" kind="$2" resource="$3"
  case "$kind" in
    container) "$docker_bin" inspect --type container "$resource" >/dev/null 2>&1 ;;
    network|volume) "$docker_bin" "$kind" inspect "$resource" >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

superflow_docker_labels_equal() {
  local docker_bin="$1" kind="$2" resource="$3"
  local task="$4" nonce="$5" expected_name="$6" actual
  case "$kind" in
    container)
      actual="$("$docker_bin" inspect --type container \
        -f '{{index .Config.Labels "superflow.task"}}|{{index .Config.Labels "superflow.nonce"}}|{{.Name}}' \
        "$resource" 2>/dev/null || true)"
      expected_name="/$expected_name"
      ;;
    network|volume)
      actual="$("$docker_bin" "$kind" inspect \
        -f '{{index .Labels "superflow.task"}}|{{index .Labels "superflow.nonce"}}|{{.Name}}' \
        "$resource" 2>/dev/null || true)"
      ;;
    *) return 1 ;;
  esac
  [ "$actual" = "$task|$nonce|$expected_name" ]
}

superflow_docker_remove_verified() {
  local docker_bin="$1" kind="$2" resource="$3"
  local task="$4" nonce="$5" expected_name="$6"
  superflow_docker_exists "$docker_bin" "$kind" "$resource" || return 0
  superflow_docker_labels_equal \
    "$docker_bin" "$kind" "$resource" "$task" "$nonce" "$expected_name" \
    || return 1
  case "$kind" in
    container) "$docker_bin" rm -f -v "$resource" ;;
    network) "$docker_bin" network rm "$resource" ;;
    volume) "$docker_bin" volume rm "$resource" ;;
    *) return 1 ;;
  esac
}

superflow_runtime_remove_verified() {
  local runtime_root="$1" dir="$2" task="$3" nonce="$4"
  [ -d "$dir" ] || return 0
  local real_root real_dir marker
  real_root="$(cd "$runtime_root" 2>/dev/null && pwd -P)" || return 1
  real_dir="$(cd "$dir" 2>/dev/null && pwd -P)" || return 1
  [ "$(dirname "$real_dir")" = "$real_root" ] || return 1
  [ "$(basename "$real_dir")" = "$nonce" ] || return 1
  marker="$real_dir/owner.marker"
  [ -f "$marker" ] || return 1
  grep -qx "task=$task" "$marker" || return 1
  grep -qx "nonce=$nonce" "$marker" || return 1
  rm -rf "$real_dir"
}
