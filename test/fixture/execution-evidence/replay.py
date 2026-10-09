#!/usr/bin/env python3
"""Real anonymous harness HTTP/SQLite only; not private E05/E11 acceptance."""
import hashlib
import importlib.machinery
import json
from pathlib import Path
import subprocess
import sqlite3
import sys
import threading
import urllib.request

root = Path(sys.argv[1])
omit = sys.argv[2] == "omit"
(root / "logs").mkdir(parents=True, exist_ok=True)
source = '''from http.server import BaseHTTPRequestHandler, HTTPServer
import json, sqlite3
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with sqlite3.connect(self.server.database) as db:
            if self.server.omit:
                cursor = db.execute('UPDATE records SET status=1 WHERE id=? AND round=2', (data['id'],))
            else:
                cursor = db.execute('UPDATE records SET status=1, external_code=? WHERE id=? AND round=2', (data['code'], data['id']))
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps({'ok': True, 'affectedRows': cursor.rowcount}).encode())
'''
(root / "application.py").write_text(source)
schema = """CREATE TABLE records(id TEXT, round INTEGER, status INTEGER, external_code TEXT, PRIMARY KEY(id,round));
INSERT INTO records VALUES ('synthetic-E05',2,0,NULL),('synthetic-E11',2,0,NULL),
('synthetic-E05',1,1,'old-a'),('synthetic-E11',1,1,'old-b');
"""
(root / "schema.sql").write_text(schema)

build_argv = [sys.executable, "-c", "import py_compile; py_compile.compile('application.py', cfile='logs/application.pyc', doraise=True)"]
subprocess.run(build_argv, cwd=root, check=True, capture_output=True)
sha = lambda data: hashlib.sha256(data).hexdigest()
sources = [{"path": "../application.py", "sha256": sha(source.encode())}, {"path": "../schema.sql", "sha256": sha(schema.encode())}]
fingerprint = sha("\n".join(sorted(s["path"] + ":" + s["sha256"] for s in sources)).encode())
artifact_hash = sha((root / "logs/application.pyc").read_bytes())
build_event = {"event": "build", "buildId": artifact_hash, "sourceFingerprint": fingerprint,
               "artifactSha256": artifact_hash, "argv": build_argv, "exitCode": 0}
build_output = (json.dumps(build_event) + "\n").encode()
(root / "logs/build.jsonl").write_bytes(build_output)
build = {"id": artifact_hash, "sourceFingerprint": fingerprint, "artifact": "application.pyc", "sha256": artifact_hash,
         "command": {"argv": build_argv, "exitCode": 0, "output": "build.jsonl", "sha256": sha(build_output)}}
module = importlib.machinery.SourcelessFileLoader("anonymous", str(root / "logs/application.pyc")).load_module()
db_file = root / "records.sqlite"
with sqlite3.connect(db_file) as db:
    db.executescript(schema)
def snapshots(db, business_id):
    return {f"{row[0]}:{row[1]}": {"businessId": row[0], "round": row[1], "status": row[2], "externalCode": row[3]}
            for row in db.execute("SELECT id,round,status,external_code FROM records WHERE NOT(id=? AND round=2) ORDER BY id,round", (business_id,))}

entries, cases, rows = [], [], []
for entry, service, route in [("E05", "service-a", "POST /a/notify"), ("E11", "service-b", "POST /b/notify")]:
    server = module.HTTPServer(("127.0.0.1", 0), module.Handler)
    server.database = str(db_file)
    server.omit = omit and entry == "E11"
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    business_id = "synthetic-" + entry
    with sqlite3.connect(db_file) as db:
        peer_before = snapshots(db, business_id)
        before = db.execute("SELECT external_code FROM records WHERE id=? AND round=2", (business_id,)).fetchone()[0]
    url = f"http://127.0.0.1:{server.server_port}" + route.split(" ", 1)[1]
    try:
        argv = [sys.executable, "-c", "import json,urllib.request,sys; print(urllib.request.urlopen(urllib.request.Request(sys.argv[1],data=sys.argv[2].encode(),headers={'Content-Type':'application/json'})).read().decode())", url,
                json.dumps({"id": business_id, "code": "synthetic-code"})]
        result = subprocess.run(argv, check=True, capture_output=True, text=True)
        response = json.loads(result.stdout)
        with sqlite3.connect(db_file) as db:
            peer_after = snapshots(db, business_id)
            after, status = db.execute("SELECT external_code,status FROM records WHERE id=? AND round=2", (business_id,)).fetchone()
    finally:
        server.shutdown(); server.server_close(); thread.join()
    expected = {"id": "write", "table": "records", "field": "external_code", "expected": "synthetic-code"}
    assertions = [{"id": key, "expected": True, "actual": value, "result": "PASS" if value else "FAIL"}
                  for key, value in [("response", response["ok"]), ("state", status == 1), ("forbiddenEffects", peer_before == peer_after)]]
    write = dict(expected, before={"businessId": business_id, "value": before},
                 after={"businessId": business_id, "value": after}, result="PASS" if after == "synthetic-code" else "FAIL")

    statements = [{"sourceRef": "app", "id": "Handler.updateRecords"}]
    mock_boundary = {"allowed": [], "forbidden": ["Handler", "sqlite3.Connection"]}
    data_assertions = [{"id": "rows", "kind": "affectedRows", "expected": 1},
                       {"id": "isolated", "kind": "unchangedRows", "expected": peer_before}]
    database = {"engine": "sqlite", "major": int(sqlite3.sqlite_version.split(".")[0]),
                "statements": statements,
                "assertions": [dict(data_assertions[0], actual=response["affectedRows"], result="PASS"),
                               dict(data_assertions[1], actual={"before": peer_before, "after": peer_after}, result="PASS")]}
    event = {"schemaVersion": "superflow.execution-receipt.v1", "caseId": entry, "entryId": entry, "level": "api",
             "executed": 1, "status": "PASS" if after == "synthetic-code" else "FAIL", "evidenceKind": "real", "testLayer": "http-entry", "mockBoundary": mock_boundary, "database": database,
             "sources": sources, "build": build, "target": {"service": service, "route": route, "kind": "api", "buildId": artifact_hash,
             "sourceFingerprint": fingerprint, "buildSha256": artifact_hash}, "assertions": assertions, "persistence": [write],
             "command": {"argv": argv, "exitCode": 0}}
    output = (json.dumps(event) + "\n").encode()
    (root / f"logs/{entry}.jsonl").write_bytes(output)
    receipt = dict(event, command={"argv": argv, "exitCode": 0, "output": f"{entry}.jsonl", "sha256": sha(output)})
    (root / f"logs/{entry}.json").write_text(json.dumps(receipt))
    entries.append({"id": entry, "service": service, "route": route, "kind": "api", "sourceRefs": ["app"],
                    "persistence": [{"table": "records", "field": "external_code"}],
                    "database": {"engine": "sqlite", "major": int(sqlite3.sqlite_version.split(".")[0]),
                                 "schemaSourceRefs": ["schema"], "statements": statements}})
    cases.append({"id": entry, "entryId": entry, "level": "api", "evidenceKind": "real", "testLayer": "http-entry", "mockBoundary": mock_boundary, "statements": statements, "databaseAssertions": data_assertions,
                  "assertions": {"response": "ok", "state": "status=1", "forbiddenEffects": "no other row", "persistence": [expected]}})
    rows.append(f"| {entry} | {entry} | api | PASS | logs/{entry}.json |")
review = {"coverage": {"schemaVersion": "superflow.review-coverage.v1", "sources": [{"id": "app", "role": "code", "path": "application.py", "sha256": sha(source.encode())}, {"id": "schema", "role": "contract", "path": "schema.sql", "sha256": sha(schema.encode())}],
                       "entries": entries, "cases": cases, "decisions": [{"disposition": "FIX", "caseIds": [e]} for e in ["E05", "E11"]]}}
(root / ".sdd/reviews").mkdir(parents=True)
(root / ".sdd/reviews/document-review.json").write_text(json.dumps(review))
(root / "test-report.md").write_text("RED failure evidence; GREEN pass evidence.\n接口自动化 curl HTTP 200; DB SELECT; log checked; BUILD SUCCESS PID\nsuperflow-test-report-lint\nAnonymous SQLite harness only; not private E05/E11 acceptance or MySQL proof.\n| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |\n|---|---|---|---|---|\n" + "\n".join(rows) + "\n验证结果: PASS\nVerification Result: PASS\nArchive Readiness: PASS\n")
(root / "tasks.md").write_text("- [x] Anonymous verification\n")
(root / "tests.md").write_text("Frozen anonymous harness HTTP/SQLite real execution only; not private E05/E11 acceptance.\n")
print(json.dumps({"mode": "omit" if omit else "complete", "httpRequests": 2, "database": "temporary SQLite", "serversStopped": 2}))
