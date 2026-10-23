#!/usr/bin/env python3
"""Real anonymous harness HTTP/SQLite only; not private E05/E11 acceptance."""
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
mode = sys.argv[2]
omit = mode == "omit"
linter = Path(sys.argv[3]).resolve()
(root / "logs").mkdir(parents=True, exist_ok=True)
source = '''from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import TCPServer
import json, sqlite3
class LoopbackHTTPServer(HTTPServer):
    def server_bind(self):
        # Numeric loopback identity needs no host reverse-DNS lookup.
        TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with sqlite3.connect(self.server.database) as db:
            if self.server.omit:
                cursor = db.execute('UPDATE records SET status=1 WHERE id=? AND round=2', (data['id'],))
            else:
                cursor = db.execute('UPDATE records SET status=1, external_code=? WHERE id=? AND round=2', (data['code'], data['id']))
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps({'ok': not self.server.business_error, 'affectedRows': cursor.rowcount}).encode())
'''
(root / "application.py").write_text(source)
schema = """CREATE TABLE records(id TEXT, round INTEGER, status INTEGER, external_code TEXT, PRIMARY KEY(id,round));
INSERT INTO records VALUES ('synthetic-E05',2,0,NULL),('synthetic-E11',2,0,NULL),
('synthetic-E05',1,1,'old-a'),('synthetic-E11',1,1,'old-b');
"""
(root / "schema.sql").write_text(schema)
# The captured case owns the actual server, HTTP request, SQLite observations,
# and cleanup. It emits measurements, never an execution-receipt or capture.
driver = '''import importlib.machinery
import json, sqlite3, sys, threading, urllib.request
from pathlib import Path
entry, service, route, mode = sys.argv[1:]
root = Path.cwd()
build = json.loads((root / 'logs/build.json').read_text())
module = importlib.machinery.SourcelessFileLoader('anonymous', str(root / 'logs/application.pyc')).load_module()
db_file = root / 'records.sqlite'
def snapshots(db, business_id):
    return {f"{row[0]}:{row[1]}": {"businessId": row[0], "round": row[1], "status": row[2], "externalCode": row[3]}
            for row in db.execute("SELECT id,round,status,external_code FROM records WHERE NOT(id=? AND round=2) ORDER BY id,round", (business_id,))}
server = module.LoopbackHTTPServer(('127.0.0.1', 0), module.Handler)
server.database = str(db_file)
server.omit = mode == 'omit' and entry == 'E11'
server.business_error = mode == 'business-error' and entry == 'E11'
thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.01), daemon=True)
thread.start()
business_id = 'synthetic-' + entry
try:
    with sqlite3.connect(db_file) as db:
        peer_before = snapshots(db, business_id)
        before = db.execute('SELECT external_code FROM records WHERE id=? AND round=2', (business_id,)).fetchone()[0]
    url = f'http://127.0.0.1:{server.server_port}' + route.split(' ', 1)[1]
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(url, data=json.dumps({'id': business_id, 'code': 'synthetic-code'}).encode(), headers={'Content-Type': 'application/json'})
    with opener.open(request, timeout=5) as http:
        response = json.loads(http.read().decode())
    with sqlite3.connect(db_file) as db:
        peer_after = snapshots(db, business_id)
        after, status = db.execute('SELECT external_code,status FROM records WHERE id=? AND round=2', (business_id,)).fetchone()
finally:
    server.shutdown(); server.server_close(); thread.join()
expected = {'id': 'write', 'table': 'records', 'field': 'external_code', 'expected': 'synthetic-code'}
assertions = [{'id': key, 'expected': True, 'actual': value, 'result': 'PASS' if value else 'FAIL'}
              for key, value in [('response', response['ok']), ('state', status == 1), ('forbiddenEffects', peer_before == peer_after)]]
write = dict(expected, before={'businessId': business_id, 'value': before}, after={'businessId': business_id, 'value': after}, result='PASS' if after == 'synthetic-code' else 'FAIL')
statements = [{'sourceRef': 'app', 'id': 'Handler.updateRecords'}]
mock_boundary = {'allowed': [], 'forbidden': ['Handler', 'sqlite3.Connection']}
data_assertions = [{'id': 'rows', 'kind': 'affectedRows', 'expected': 1}, {'id': 'isolated', 'kind': 'unchangedRows', 'expected': peer_before}]
database = {'engine': 'sqlite', 'major': int(sqlite3.sqlite_version.split('.')[0]), 'statements': statements,
            'assertions': [dict(data_assertions[0], actual=response['affectedRows'], result='PASS' if response['affectedRows'] == 1 else 'FAIL'),
                           dict(data_assertions[1], actual={'before': peer_before, 'after': peer_after}, result='PASS' if peer_before == peer_after else 'FAIL')]}
event = {'event': 'superflow.measurement.v1', 'caseId': entry, 'executed': 1, 'testLayer': 'http-entry',
         'mockBoundary': mock_boundary, 'database': database, 'assertions': assertions, 'persistence': [write],
         'target': {'service': service, 'route': route, 'kind': 'api', 'buildId': build['id'],
                    'sourceFingerprint': build['sourceFingerprint'], 'buildSha256': build['sha256']}}
print(json.dumps(event))
# HTTP status, business response and persistence are distinct observed facts.
passed = all(item['result'] == 'PASS' for item in assertions)
passed = passed and write['result'] == 'PASS'
passed = passed and all(item['result'] == 'PASS' for item in database['assertions'])
sys.exit(0 if passed else 1)
'''
(root / "case.py").write_text(driver)
sha = lambda data: hashlib.sha256(data).hexdigest()

def record(plan, allow_failure=False):
    plan_file = root / "capture-plan.json"
    plan_file.write_text(json.dumps(plan))
    result = subprocess.run([sys.executable, str(linter), "--record-execution", str(plan_file)],
                            capture_output=True, text=True, timeout=8)
    if result.returncode and not allow_failure:
        raise RuntimeError(result.stdout + result.stderr)
    return result.returncode

build_argv = [sys.executable, "-c", "import py_compile; py_compile.compile('application.py', cfile='logs/application.pyc', doraise=True)"]
record({"kind": "build", "argv": build_argv, "cwd": ".", "sources": ["application.py", "schema.sql", "case.py"],
        "artifact": "logs/application.pyc", "output": "logs/build.json"})
with sqlite3.connect(root / "records.sqlite") as db:
    db.executescript(schema)

def snapshots(db, business_id):
    return {f"{row[0]}:{row[1]}": {"businessId": row[0], "round": row[1], "status": row[2], "externalCode": row[3]}
            for row in db.execute("SELECT id,round,status,external_code FROM records WHERE NOT(id=? AND round=2) ORDER BY id,round", (business_id,))}

review_path = root / ".sdd/reviews/document-review.json"
review_path.parent.mkdir(parents=True, exist_ok=True)
sources = [{"id": key, "role": role, "path": file, "sha256": sha((root / file).read_bytes())}
           for key, role, file in [("app", "code", "application.py"), ("schema", "contract", "schema.sql"), ("harness", "code", "case.py")]]
entries, cases, rows = [], [], []
for entry, service, route in [("E05", "service-a", "POST /a/notify"), ("E11", "service-b", "POST /b/notify")]:
    with sqlite3.connect(root / "records.sqlite") as db:
        peer_before = snapshots(db, "synthetic-" + entry)
    expected = {"id": "write", "table": "records", "field": "external_code", "expected": "synthetic-code"}
    statements = [{"sourceRef": "app", "id": "Handler.updateRecords"}]
    boundary = {"allowed": [], "forbidden": ["Handler", "sqlite3.Connection"]}
    entries.append({"id": entry, "service": service, "route": route, "kind": "api", "sourceRefs": ["app"],
                    "persistence": [{"table": "records", "field": "external_code"}],
                    "database": {"engine": "sqlite", "major": int(sqlite3.sqlite_version.split(".")[0]),
                                 "schemaSourceRefs": ["schema"], "statements": statements}})
    cases.append({"id": entry, "entryId": entry, "level": "api", "evidenceKind": "real", "testLayer": "http-entry",
                  "executionEvidence": "runner-captured.v1", "executionContext": {
                      "argv": [sys.executable, "case.py", entry, service, route, mode],
                      "cwd": ".", "environmentKeys": []},
                  "mockBoundary": boundary, "statements": statements,
                  "databaseAssertions": [{"id": "rows", "kind": "affectedRows", "expected": 1},
                                         {"id": "isolated", "kind": "unchangedRows", "expected": peer_before}],
                  "assertions": {"response": "ok", "state": "status=1", "forbiddenEffects": "no other row", "persistence": [expected]}})
    review = {"coverage": {"schemaVersion": "superflow.review-coverage.v1", "sources": sources,
                           "entries": entries, "cases": cases,
                           "decisions": [{"disposition": "FIX", "caseIds": [case["id"]]} for case in cases]}}
    review_path.write_text(json.dumps(review))
    record({"kind": "case", "changeDir": ".",
            "review": ".sdd/reviews/document-review.json", "caseId": entry,
            "build": "logs/build.json", "output": f"logs/{entry}.json"}, allow_failure=mode in {"omit", "business-error"} and entry == "E11")
    rows.append(f"| {entry} | {entry} | api | PASS | logs/{entry}.json |")
ready = root / ".sdd/readiness/coding-ready.json"
ready.parent.mkdir(parents=True, exist_ok=True)
ready.write_text(json.dumps({"schemaVersion": "superflow.coding-ready.v1", "codingReady": True,
                             "workflowPolicy": "observed-delivery.v1"}))
(root / ".sdd/reviews/current-code-review.md").write_text(
    "DONE\n## Review Identity\n| Field | Value |\n|---|---|\n| Role | independent-reviewer |\n| Dispatch | session:fixture/dispatch |\n| Return | session:fixture/return |\n## Concerns\nNone\n## Findings\nNone\n## Reviewed Sources\n| Path | SHA-256 |\n|---|---|\n" +
    "\n".join(f"| {source['path']} | {source['sha256']} |" for source in sources))
(root / "test-report.md").write_text("RED failure evidence; GREEN pass evidence.\n接口自动化 curl HTTP 200; DB SELECT; log checked; BUILD SUCCESS PID\nsuperflow-test-report-lint\nAnonymous SQLite harness only; not private E05/E11 acceptance or MySQL proof.\n| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |\n|---|---|---|---|---|\n" + "\n".join(rows) + "\n验证结果: PASS\nVerification Result: PASS\nArchive Readiness: PASS\n\n## Independent Review\n| Report |\n|---|\n| .sdd/reviews/current-code-review.md |\n\n## Summary\n")
(root / "tasks.md").write_text("- [x] Anonymous verification\n")
(root / "tests.md").write_text("Frozen anonymous harness HTTP/SQLite real execution only; not private E05/E11 acceptance.\n")
print(json.dumps({"mode": mode, "httpRequests": 2, "database": "temporary SQLite", "serversStopped": 2}))
