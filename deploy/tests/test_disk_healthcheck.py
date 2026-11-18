import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
from urllib.error import URLError
import pytest

SCRIPT = Path(__file__).parents[1] / 'scripts/check-disk-health.py'
spec = importlib.util.spec_from_file_location('disk_health', SCRIPT)
disk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(disk)


def call(tmp_path, *, used=85, now=1000, state=None, measure=None, send=None, send_result=True):
    state_path = tmp_path / 'state.json'
    lock_path = tmp_path / 'lock'
    if state is not None:
        state_path.write_text(json.dumps(state) if isinstance(state, dict) else state)
    calls = send if send is not None else []
    def transport(url, fail):
        calls.append((url, fail))
        return send_result
    def measurement():
        if measure:
            return measure()
        return SimpleNamespace(total=100, free=100-used)
    result = disk.run(base_url='https://hc.invalid/private', state_path=state_path,
                      lock_path=lock_path, measure=measurement, clock=lambda: now,
                      send_ping=transport)
    return result, calls, state_path


def test_healthy_exact_threshold_and_recovery(tmp_path):
    assert call(tmp_path, used=85)[1] == [('https://hc.invalid/private', False)]
    _, calls, path = call(tmp_path, used=86, now=1000)
    assert calls[-1][1] is False
    _, calls, _ = call(tmp_path, used=85, now=1060, state=json.loads(path.read_text()))
    assert calls[-1][1] is False
    assert json.loads(path.read_text())['high_since'] is None


def test_transient_sustained_and_stale_state(tmp_path):
    _, calls, path = call(tmp_path, used=86, now=1000)
    state=json.loads(path.read_text())
    for now in (1060, 1120, 1180, 1240):
        _, calls, path = call(tmp_path, used=86, now=now, state=json.loads(path.read_text()) if now > 1060 else state)
        assert calls[-1][1] is False
    _, calls, _ = call(tmp_path, used=86, now=1300, state=json.loads(path.read_text()))
    assert calls[-1][1] is True
    _, calls, path = call(tmp_path, used=86, now=2000, state=state)
    assert json.loads(path.read_text())['high_since'] == 2000


def test_corrupt_state_invalid_measurement_and_failed_ping(tmp_path):
    _, _, path = call(tmp_path, used=86)
    path.write_text('corrupt')
    _, _, _ = call(tmp_path, used=86, now=1100, state='corrupt')
    signals=[]
    result, calls, _ = call(tmp_path, measure=lambda: (_ for _ in ()).throw(OSError()), send=signals)
    assert result == 1 and calls == [('https://hc.invalid/private', True)]
    result, calls, _ = call(tmp_path, send_result=False)
    assert result == 1


def test_empty_url_sends_no_request_and_lock_serializes(tmp_path):
    calls=[]
    assert disk.run(base_url='', state_path=tmp_path/'s', lock_path=tmp_path/'l',
                    measure=lambda: SimpleNamespace(total=100, free=20), clock=lambda: 1,
                    send_ping=lambda url, fail: calls.append((url, fail)) or True) == 0
    assert calls == [('', False)]
    lock=tmp_path/'held'; lock.touch()
    import fcntl
    with lock.open() as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        import threading
        done=[]
        worker=threading.Thread(target=lambda: done.append(disk.run(
            base_url='', state_path=tmp_path/'s', lock_path=lock,
            measure=lambda: SimpleNamespace(total=100, free=20), clock=lambda: 1,
            send_ping=lambda url, fail: True)))
        worker.start()
        assert worker.is_alive()
        fcntl.flock(handle, fcntl.LOCK_UN)
    worker.join(timeout=2)
    assert done == [0]


def test_ping_failure_redacts_secret_url(monkeypatch, capsys):
    secret = 'https://hc-ping.com/private-secret'
    monkeypatch.setattr(disk, 'urlopen', lambda *args, **kwargs: (_ for _ in ()).throw(URLError(secret)))
    monkeypatch.setattr(disk.time, 'sleep', lambda _: None)
    assert disk.ping(secret, True) is False
    output = capsys.readouterr()
    assert secret not in output.out + output.err
    assert output.err.strip() == 'disk health ping failed'


def test_runbook_has_idempotent_cron_and_preserves_existing_backup():
    runbook = (Path(__file__).parents[1] / 'VAULT.md').read_text()
    assert 'crontab -l > /tmp/languee-crontab' in runbook
    assert 'grep -Fqx' in runbook
    assert 'preserving existing entries (including the database backup)' in runbook
    assert '*/fail' not in runbook
