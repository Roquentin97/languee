#!/usr/bin/env python3
"""Report sustained root filesystem pressure to a dedicated Healthchecks check."""

import fcntl
import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path("/")
STATE = Path("/opt/languee/.disk-health-state.json")
LOCK = Path("/opt/languee/.disk-health.lock")
HIGH_PERCENT = 85
SUSTAINED_SECONDS = 300
STALE_SECONDS = 120
PING_TIMEOUT = 8


def read_state(path, now):
    try:
        value = json.loads(path.read_text())
        started = value["high_since"]
        updated = value["updated_at"]
        failed = value.get("failed", False)
        if not isinstance(failed, bool):
            failed = False
        if (not isinstance(updated, (int, float)) or updated > now):
            return {"high_since": None, "failed": failed}
        if (not isinstance(started, (int, float)) or now - updated > STALE_SECONDS
                or started > updated or started < 0):
            return {"high_since": None, "failed": failed}
        return {"high_since": started, "failed": failed}
    except (OSError, ValueError, KeyError, TypeError):
        return {"high_since": None, "failed": False}


def write_state(path, high_since, now, failed):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".disk-health-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as out:
            json.dump({"high_since": high_since, "updated_at": now, "failed": failed}, out)
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def ping(base, failed):
    if not base:
        print("disk health notifications disabled")
        return True
    url = base.rstrip("/") + ("/fail" if failed else "")
    for attempt in range(2):
        try:
            with urlopen(url, timeout=PING_TIMEOUT) as response:
                if 200 <= response.status < 300:
                    return True
        except (URLError, TimeoutError, OSError):
            pass
        if attempt == 0:
            time.sleep(1)
    print("disk health ping failed", file=sys.stderr)
    return False


def run(*, base_url, state_path=STATE, lock_path=LOCK, measure=None, clock=None, send_ping=None):
    measure = measure or (lambda: shutil.disk_usage(ROOT))
    clock = clock or time.time
    send_ping = send_ping or ping
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        now = clock()
        try:
            disk = measure()
            total, available = disk.total, disk.free
            if not isinstance(total, int) or not isinstance(available, int) or total <= 0 or not 0 <= available <= total:
                raise ValueError("invalid disk measurement")
        except Exception:
            sent = send_ping(base_url, True)
            previous = read_state(state_path, now)
            write_state(state_path, None, now, bool(sent or previous["failed"]))
            print("root filesystem measurement failed", file=sys.stderr)
            return 1

        # Compare exact byte ratios: precisely 85% used is healthy.
        high = (total - available) * 100 > total * HIGH_PERCENT
        previous = read_state(state_path, now)
        started = previous["high_since"] if high else None
        if high and started is None:
            started = now
        # A stale timer restarts, but a delivered failure remains failed until
        # a valid healthy sample can successfully send the recovery ping.
        failed = bool(high and (previous["failed"] or now - started >= SUSTAINED_SECONDS))
        sent = send_ping(base_url, failed)
        failed_state = failed if sent else bool(previous["failed"] or failed)
        write_state(state_path, started, now, failed_state)
        return 0 if sent else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--test-fail", action="store_true", help="send one failure signal without changing disk state")
    args = parser.parse_args()
    try:
        with open("/opt/languee/.env", encoding="utf-8") as env_file:
            values = {}
            for line in env_file:
                key, sep, value = line.rstrip("\n").partition("=")
                if sep:
                    values[key] = value
        base_url = values.get("DISK_HEALTHCHECK_URL", "")
        if args.test_fail:
            return 0 if ping(base_url, True) else 1
        return run(base_url=base_url)
    except OSError:
        print("disk health configuration could not be read", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
