#!/usr/bin/env python3
"""Remove old application image tags while protecting rollback and running images."""
import json
import os
from pathlib import Path
import subprocess
import sys


def docker(*args):
    return subprocess.run(['docker', *args], check=True, capture_output=True, text=True).stdout.strip()


def cleanup(app_dir, prefix):
    state_path = app_dir / '.deploy-state.json'
    states = []
    for path in (state_path, app_dir / '.config-previous' / '.deploy-state.json'):
        if path.exists():
            state = json.loads(path.read_text())
            if not isinstance(state, dict):
                raise ValueError(f'invalid deployment state: {path}')
            if not ((isinstance(state.get('back_tag'), str) and state['back_tag']
                     and isinstance(state.get('nlp_tag'), str) and state['nlp_tag'])
                    or (isinstance(state.get('tag'), str) and state['tag'])):
                raise ValueError(f'invalid deployment tags: {path}')
            states.append(state)
    if not states and (app_dir / '.env').exists():
        raise ValueError('deployment state missing; skipping cleanup')
    protected_tags = {'back': set(), 'nlp': set()}
    for state in states:
        for kind in protected_tags:
            for key in (f'{kind}_tag', f'previous_{kind}_tag', 'tag', 'previous_tag'):
                value = state.get(key)
                if isinstance(value, str) and value:
                    protected_tags[kind].add(value)
    running = docker('ps', '-q').splitlines()
    protected_ids = set()
    if running:
        protected_ids.update(docker('inspect', '--format', '{{.Image}}', *running).splitlines())
    repos = [(f'{prefix}/languee-back', 'back'), (f'{prefix}/languee-back-migrator', 'back'),
             (f'{prefix}/languee-nlp', 'nlp')]
    entries = []
    for repo, kind in repos:
        rows = docker('image', 'ls', '--format', '{{json .}}', repo).splitlines()
        tags = []
        for row in rows:
            item = json.loads(row)
            if item['Repository'] != repo or item['Tag'] == '<none>':
                continue
            ref = f"{repo}:{item['Tag']}"
            image = json.loads(docker('image', 'inspect', ref))[0]
            tags.append((image['Created'], image['Id'], ref, item['Tag']))
        tags.sort(reverse=True)
        # Count versions by image ID so aliases do not consume rollback slots.
        newest = set()
        for _, image_id, _, _ in tags:
            if len(newest) < 3:
                newest.add(image_id)
        protected_ids.update(newest)
        protected_ids.update(image_id for _, image_id, _, tag in tags if tag in protected_tags[kind])
        entries.extend(tags)
    failures = False
    for _, image_id, ref, _ in entries:
        if image_id in protected_ids:
            continue
        try:
            docker('image', 'rm', '--no-prune', ref)
            print(f'image cleanup removed {ref}', flush=True)
        except subprocess.CalledProcessError as exc:
            failures = True
            print(f'image cleanup failed for {ref}: {exc.stderr.strip()}', file=sys.stderr)
    if failures:
        raise RuntimeError('one or more image removals failed')
    print('image cleanup complete', flush=True)


if __name__ == '__main__':
    try:
        cleanup(Path(os.environ.get('APP_DIR', '/opt/languee')),
                os.environ.get('IMAGE_PREFIX', 'ghcr.io/roquentin97/languee'))
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError, RuntimeError) as exc:
        print(f'image cleanup error: {exc}', file=sys.stderr)
        sys.exit(1)
