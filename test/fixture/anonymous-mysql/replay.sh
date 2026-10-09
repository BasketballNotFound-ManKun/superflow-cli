#!/usr/bin/env bash
set -euo pipefail
fixture="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$fixture/../../.." && pwd)"
source "$root/assets/scripts/superflow-managed-owner-verification.sh"
output="${1:?Output directory required}"
mkdir -p "$output/classes"
mybatis="${MYBATIS_JAR:-$HOME/.m2/repository/org/mybatis/mybatis/3.5.19/mybatis-3.5.19.jar}"
mysql="${MYSQL_JAR:-$HOME/.m2/repository/com/mysql/mysql-connector-j/8.0.33/mysql-connector-j-8.0.33.jar}"
[ -f "$mybatis" ] && [ -f "$mysql" ] || { echo 'PARTIAL: MyBatis/MySQL JDBC jars unavailable'; exit 3; }
docker info >/dev/null 2>&1 || { echo 'PARTIAL: Docker unavailable'; exit 3; }
nonce="$(python3 -c 'import uuid; print(uuid.uuid4())')"
name="superflow-anonymous-$nonce"
task='anonymous-mysql-replay'
cleanup() {
  superflow_docker_remove_verified docker container "$name" "$task" "$nonce" "$name"
}
trap cleanup EXIT
# Task-owned disposable DB, with no host data mounts and no business connection.
docker run -d --name "$name" --label "superflow.task=$task" \
  --label "superflow.nonce=$nonce" -e MYSQL_ALLOW_EMPTY_PASSWORD=yes \
  -e MYSQL_DATABASE=replay -p 127.0.0.1::3306 mysql:8.0.36 >"$output/container.log"
for attempt in $(seq 1 60); do
  if docker exec "$name" mysqladmin ping -h 127.0.0.1 --silent >/dev/null 2>&1; then break; fi
  sleep 1
done
port="$(docker port "$name" 3306/tcp | sed 's/.*://')"
export REPLAY_JDBC_URL="jdbc:mysql://127.0.0.1:$port/replay?allowPublicKeyRetrieval=true&useSSL=false"
classpath="$mybatis:$mysql"
java_bin="${REPLAY_JAVA_BIN:-}"
if [ -z "$java_bin" ]; then
  if [ -x /usr/libexec/java_home ]; then java_bin="$(/usr/libexec/java_home -v 17)/bin";
  elif [ -n "${JAVA_HOME:-}" ]; then java_bin="$JAVA_HOME/bin";
  else java_bin="$(dirname "$(command -v javac)")"; fi
fi
build_argv=("$java_bin/javac" -cp "$classpath" -d "$output/classes" "$fixture/MapperReplay.java")
python3 -c 'import json,sys; print(json.dumps(sys.argv[1:]))' "${build_argv[@]}" >"$output/build-command.json"
"${build_argv[@]}" >"$output/build.log" 2>&1
"$java_bin/java" -cp "$output/classes:$classpath" MapperReplay mock >"$output/mock.jsonl"
"$java_bin/java" -cp "$output/classes:$classpath" MapperReplay real "$fixture/AttemptMapper.xml" "$fixture/schema.sql" >"$output/correct.jsonl" 2>"$output/correct.err"
set +e
"$java_bin/java" -cp "$output/classes:$classpath" MapperReplay real "$fixture/AttemptMapper-omitted.xml" "$fixture/schema.sql" >"$output/omitted.jsonl" 2>"$output/omitted.err"
omitted_status=$?
set -e
[ "$omitted_status" -ne 0 ] || { echo 'Missing field unexpectedly passed'; exit 1; }
echo "MySQL replay: Mock PASS; correct XML PASS; omitted XML FAIL ($omitted_status)"
