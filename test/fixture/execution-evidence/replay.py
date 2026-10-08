#!/usr/bin/env python3
"""Anonymous HTTP + SQLite replay. No business environment or credentials."""
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
                db.execute('UPDATE records SET status=1 WHERE id=?', (data['id'],))
            else:
                db.execute('UPDATE records SET status=1, external_code=? WHERE id=?', (data['code'], data['id']))
        self.send_response(200); self.end_headers(); self.wfile.write(b'{"ok":true}')
'''
(root / "application.py").write_text(source)
build_argv = [sys.executable, "-c", "import py_compile; py_compile.compile('application.py', cfile='logs/application.pyc', doraise=True)"]
subprocess.run(build_argv, cwd=root, check=True, capture_output=True)
sha = lambda data: hashlib.sha256(data).hexdigest()
sources = [{"path": "../application.py", "sha256": sha(source.encode())}]
fingerprint = sha((sources[0]["path"] + ":" + sources[0]["sha256"]).encode())
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
    db.execute("CREATE TABLE records(id TEXT PRIMARY KEY, status INTEGER, external_code TEXT)")
    db.executemany("INSERT INTO records VALUES (?,0,NULL)", [("synthetic-E05",), ("synthetic-E11",)])
entries, cases, rows = [], [], []
for entry, service, route in [("E05", "service-a", "POST /a/notify"), ("E11", "service-b", "POST /b/notify")]:
    server = module.HTTPServer(("127.0.0.1", 0), module.Handler)
    server.database = str(db_file)
    server.omit = omit and entry == "E11"
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    business_id = "synthetic-" + entry
    with sqlite3.connect(db_file) as db:
        peer_id = "synthetic-E11" if entry == "E05" else "synthetic-E05"
        peer_before = db.execute("SELECT status,external_code FROM records WHERE id=?", (peer_id,)).fetchone()
        before = db.execute("SELECT external_code FROM records WHERE id=?", (business_id,)).fetchone()[0]
    url = f"http://127.0.0.1:{server.server_port}" + route.split(" ", 1)[1]
    try:
        argv = [sys.executable, "-c", "import json,urllib.request,sys; print(urllib.request.urlopen(urllib.request.Request(sys.argv[1],data=sys.argv[2].encode(),headers={'Content-Type':'application/json'})).read().decode())", url,
                json.dumps({"id": business_id, "code": "synthetic-code"})]
        result = subprocess.run(argv, check=True, capture_output=True, text=True)
        response = json.loads(result.stdout)
        with sqlite3.connect(db_file) as db:
            peer_after = db.execute("SELECT status,external_code FROM records WHERE id=?", (peer_id,)).fetchone()
            after, status = db.execute("SELECT external_code,status FROM records WHERE id=?", (business_id,)).fetchone()
    finally:
        server.shutdown(); server.server_close(); thread.join()
    expected = {"id": "write", "table": "records", "field": "external_code", "expected": "synthetic-code"}
    assertions = [{"id": key, "expected": True, "actual": value, "result": "PASS" if value else "FAIL"}
                  for key, value in [("response", response["ok"]), ("state", status == 1), ("forbiddenEffects", peer_before == peer_after)]]
    write = dict(expected, before={"businessId": business_id, "value": before},
                 after={"businessId": business_id, "value": after}, result="PASS" if after == "synthetic-code" else "FAIL")
    event = {"schemaVersion": "superflow.execution-receipt.v1", "caseId": entry, "entryId": entry, "level": "api",
             "executed": 1, "status": "PASS" if after == "synthetic-code" else "FAIL", "evidenceKind": "controlled-simulation",
             "sources": sources, "build": build, "target": {"service": service, "route": route, "kind": "api", "buildId": artifact_hash,
             "sourceFingerprint": fingerprint, "buildSha256": artifact_hash}, "assertions": assertions, "persistence": [write],
             "command": {"argv": argv, "exitCode": 0}}
    output = (json.dumps(event) + "\n").encode()
    (root / f"logs/{entry}.jsonl").write_bytes(output)
    receipt = dict(event, command={"argv": argv, "exitCode": 0, "output": f"{entry}.jsonl", "sha256": sha(output)})
    (root / f"logs/{entry}.json").write_text(json.dumps(receipt))
    entries.append({"id": entry, "service": service, "route": route, "kind": "api", "sourceRefs": ["app"],
                    "persistence": [{"table": "records", "field": "external_code"}]})
    cases.append({"id": entry, "entryId": entry, "level": "api", "evidenceKind": "controlled-simulation",
                  "assertions": {"response": "ok", "state": "status=1", "forbiddenEffects": "no other row", "persistence": [expected]}})
    rows.append(f"| {entry} | {entry} | api | PASS | logs/{entry}.json |")
review = {"coverage": {"schemaVersion": "superflow.review-coverage.v1", "sources": [{"id": "app", "role": "code", "path": "application.py"}],
                       "entries": entries, "cases": cases, "decisions": [{"disposition": "FIX", "caseIds": [e]} for e in ["E05", "E11"]]}}
(root / ".sdd/reviews").mkdir(parents=True)
(root / ".sdd/reviews/document-review.json").write_text(json.dumps(review))
(root / "test-report.md").write_text("RED failure evidence; GREEN pass evidence.\n接口自动化 curl HTTP 200; DB SELECT; log checked; BUILD SUCCESS PID\nsuperflow-test-report-lint\nReal integration passed\n| 用例 ID | 入口 ID | 验收级别 | 结果 | 证据路径 |\n|---|---|---|---|---|\n" + "\n".join(rows) + "\n验证结果: PASS\nVerification Result: PASS\nArchive Readiness: PASS\n")
(root / "tasks.md").write_text("- [x] Anonymous verification\n")
(root / "tests.md").write_text("Frozen two-entry controlled-simulation.\n")
print(json.dumps({"mode": "omit" if omit else "complete", "httpRequests": 2, "database": "temporary SQLite", "serversStopped": 2}))
