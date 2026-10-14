"""Drive one owned CLI process through a real POSIX terminal."""
import errno
import json
import os
import pty
import select
import subprocess
import sys
import time

command, answers = json.loads(sys.argv[1]), json.loads(sys.argv[2])
master, slave = pty.openpty()
process = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave,
                           start_new_session=True)
os.close(slave)
output, sent, deadline = b"", 0, time.monotonic() + 20
try:
    while time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], 0.1)
        if ready:
            try:
                chunk = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if not chunk:
                break
            output += chunk
            while sent < len(answers) and output.count(b"> ") > sent:
                value = answers[sent]
                payload = {"__EOF__": b"\x04", "__SIGINT__": b"\x03"}.get(value)
                os.write(master, payload if payload is not None else (value + "\n").encode())
                sent += 1
        if process.poll() is not None and not ready:
            break
    # A PTY may close just before waitpid observes the child's exit.
    try:
        code = process.wait(timeout=5)
    except subprocess.TimeoutExpired as error:
        raise TimeoutError("CLI did not finish within 25 seconds") from error
    print(json.dumps({"code": code, "output": output.decode(errors="replace"),
                      "answersSent": sent}))
finally:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    os.close(master)
