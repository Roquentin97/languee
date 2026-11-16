"""Select PR checks from changed paths and the service jobs they execute."""

import os
from pathlib import Path
import re
import subprocess

WORKFLOW = '.github/workflows/ci.yml'
SERVICES = {'back': 'languee-back', 'nlp': 'languee-nlp', 'droid': 'languee-droid'}


def workflow_sections(text):
    """Extract top-level workflow settings and individual jobs without parsing YAML."""
    prefix, marker, jobs = text.partition('\njobs:\n')
    if not marker:
        raise ValueError('CI workflow has no jobs mapping')
    matches = list(re.finditer(r'^  ([a-z][a-z0-9-]*):[ \t]*$', jobs, re.MULTILINE))
    if not matches:
        raise ValueError('CI workflow has no recognizable jobs')
    sections = {
        match.group(1): jobs[match.start():matches[index + 1].start() if index + 1 < len(matches) else len(jobs)]
        for index, match in enumerate(matches)
    }
    if not all(name in sections for name in SERVICES):
        raise ValueError('CI workflow is missing a service job')
    return prefix, sections


def select_checks(paths, base_workflow, head_workflow):
    base_prefix, base_jobs = workflow_sections(base_workflow)
    head_prefix, head_jobs = workflow_sections(head_workflow)
    workflow_changed = WORKFLOW in paths
    common_changed = workflow_changed and base_prefix != head_prefix
    selected = {}
    for job, service in SERVICES.items():
        selected[job] = (
            any(path.startswith(f'apps/{service}/') for path in paths)
            or (workflow_changed and (common_changed or base_jobs[job] != head_jobs[job]))
        )
    selected['agents'] = any(
        path in {'AGENTS.md', 'CLAUDE.md', WORKFLOW, '.github/scripts/ci_changes.py',
                 'tests/test_agent_infrastructure.py', 'tests/test_ci_changes.py'}
        or path.startswith(('.agents/', '.claude/', '.codex/'))
        for path in paths
    )
    selected['deploy'] = any(
        path.startswith(('deploy/', '.github/workflows/'))
        or path in {'docker-compose.yml', 'docker-compose.prod.yml'}
        for path in paths
    )
    return selected


def main():
    paths = subprocess.check_output(['git', 'diff', '--name-only', '--no-renames', '-z', 'HEAD^1', 'HEAD']).decode().split('\0')
    base = subprocess.check_output(['git', 'show', f'HEAD^1:{WORKFLOW}'], text=True)
    head = Path(WORKFLOW).read_text()
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
        for name, enabled in select_checks(paths, base, head).items():
            print(f'{name}={str(enabled).lower()}', file=output)


if __name__ == '__main__':
    main()
