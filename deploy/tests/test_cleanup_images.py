import importlib.util
import json
from pathlib import Path
import subprocess

import pytest

spec = importlib.util.spec_from_file_location('cleanup_images', Path(__file__).parents[1] / 'scripts/cleanup-images.py')
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


def test_cleanup_protects_current_previous_running_and_shared_ids(tmp_path, monkeypatch):
    (tmp_path / '.deploy-state.json').write_text(json.dumps({'back_tag': 'current', 'previous_back_tag': 'previous', 'nlp_tag': 'current'}))
    repos = ['registry/languee-back', 'registry/languee-back-migrator', 'registry/languee-nlp']
    tags = ['new1', 'new2', 'new3', 'current', 'previous', 'running', 'shared', 'old']
    removed = []

    def docker(*args):
        if args == ('ps', '-q'):
            return 'container'
        if args[0] == 'inspect':
            return 'running-id'
        if args[:2] == ('image', 'ls'):
            repo = args[-1]
            return '\n'.join(json.dumps({'Repository': repo, 'Tag': tag}) for tag in tags) + '\n' + json.dumps({'Repository': 'unrelated', 'Tag': 'old'})
        if args[:2] == ('image', 'inspect'):
            repo, tag = args[-1].rsplit(':', 1)
            image_id = 'running-id' if tag == 'running' else ('shared-id' if tag == 'shared' or (repo == repos[0] and tag == 'new1') else repo + tag)
            return json.dumps([{'Id': image_id, 'Created': f'{99-tags.index(tag):02}'}])
        if args[:2] == ('image', 'rm'):
            removed.append(args[-1])
            return ''
        raise AssertionError(args)

    monkeypatch.setattr(cleanup, 'docker', docker)
    cleanup.cleanup(tmp_path, 'registry')
    assert set(removed) == {f'{repo}:old' for repo in repos} | {f'{repos[2]}:previous'}


def test_inspection_failure_aborts_before_removal(tmp_path, monkeypatch):
    calls = []
    def docker(*args):
        calls.append(args)
        if args == ('ps', '-q'):
            raise subprocess.CalledProcessError(1, args)
        return ''
    monkeypatch.setattr(cleanup, 'docker', docker)
    with pytest.raises(subprocess.CalledProcessError):
        cleanup.cleanup(tmp_path, 'registry')
    assert not any(args[:2] == ('image', 'rm') for args in calls)
