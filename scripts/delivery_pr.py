"""Read-only PR safety checks and final-head CI monitoring."""

import json
from pathlib import Path
import re
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = ('feature/', 'fix/', 'chore/', 'docs/', 'refactor/', 'test/', 'ci/', 'deps/')
TITLE = re.compile(r'^(feat|fix|deps|chore|docs|refactor|test|ci)\([a-z0-9][a-z0-9-]*\): \S.*$')


def run(*command, check=True):
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if check and result.returncode:
        raise ValueError(f'{command[0]} command failed (exit {result.returncode})')
    return result


def git(*args):
    return run('git', *args).stdout.strip()


def preflight(args):
    issues = []
    branch = git('branch', '--show-current')
    head = git('rev-parse', 'HEAD')
    if not branch.startswith(ALLOWED):
        issues.append('Branch must use an allowed prefix')
    if not TITLE.fullmatch(args.title):
        issues.append('Title must be a scoped Conventional Commit')
    if run('git', 'merge-base', '--is-ancestor', args.base, 'HEAD', check=False).returncode:
        issues.append('Branch does not contain the current base; reconcile before publishing')
    if git('status', '--porcelain', '--untracked-files=normal'):
        issues.append('Working tree is not clean')
    upstream = run('git', 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}', check=False)
    remote = run('git', 'ls-remote', '--heads', 'origin', f'refs/heads/{branch}', check=False)
    if remote.returncode:
        issues.append('Could not inspect remote branch')
    remote_sha = remote.stdout.split()[0] if remote.stdout.strip() else None
    if remote_sha and remote_sha != head:
        issues.append('Remote branch head differs from local head')
    if run('gh', 'auth', 'status', check=False).returncode:
        issues.append('GitHub CLI is unavailable or unauthenticated')
    try:
        checks = json.loads(Path(args.check_results).read_text()) if args.check_results else {}
    except (OSError, ValueError):
        checks = {}
    if checks.get('operation') != 'check' or checks.get('status') != 'passed' or checks.get('head_sha') != head or checks.get('working_tree'):
        issues.append('Passing committed-head check results are required')
    if checks.get('checks') != args.expected_impact['checks'] or checks.get('merge_base') != args.expected_impact['merge_base'] or args.expected_impact['unresolved_impact']:
        issues.append('Validation does not match the current impact selection and base')
    outcomes = {item.get('target'): item.get('status') for item in checks.get('outcomes', [])}
    required = list(args.expected_impact['affected_services'])
    if 'agent-infrastructure' in args.expected_impact['checks']:
        required += ['test_agent_infrastructure.py', 'test_ci_changes.py', 'test_dev_delivery.py']
    if any(outcomes.get(name) != 'passed' for name in required):
        issues.append('Required local validations are missing or have not passed')
    return {'operation': 'pr preflight', 'status': 'blocked' if issues else 'passed',
            'branch': branch, 'base': args.base, 'head_sha': head,
            'upstream': upstream.stdout.strip() or None, 'remote_sha': remote_sha, 'issues': issues}


def pr_info(pr):
    result = run('gh', 'pr', 'view', str(pr), '--json', 'number,url,headRefName,baseRefName,headRefOid')
    return json.loads(result.stdout)


def failure_evidence(checks):
    evidence = []
    for check in checks:
        match = re.search(r'/actions/runs/(\d+)', check.get('link', ''))
        if not match:
            continue
        output = run('gh', 'run', 'view', match.group(1), '--log-failed', check=False)
        directory = Path(tempfile.mkdtemp(prefix='languee-ci-'))
        path = directory / 'failed.log'
        path.write_text(output.stdout + output.stderr, encoding='utf-8')
        evidence.append({'check': check['name'], 'log': str(path), 'exit_code': output.returncode})
    return evidence


def watch(args):
    if args.timeout <= 0 or args.interval <= 0:
        raise ValueError('Timeout and interval must be positive')
    deadline = time.monotonic() + args.timeout
    while True:
        info = pr_info(args.pr)
        if info['headRefOid'] != args.head:
            return {'operation': 'pr watch', 'status': 'blocked', 'issues': ['PR head changed'], 'head_sha': info['headRefOid'], 'expected_head': args.head, 'url': info['url']}
        check = run('gh', 'pr', 'checks', str(args.pr), '--required', '--json', 'name,state,link', check=False)
        try:
            checks = json.loads(check.stdout)
        except ValueError:
            checks = []
        result = {'operation': 'pr watch', 'head_sha': args.head, 'url': info['url'], 'checks': checks}
        if check.returncode not in (0, 8):
            result.update(status='failed', issues=['Unable to retrieve required checks or a required check failed; inspect linked jobs'], evidence=failure_evidence(checks))
            return result
        if not checks:
            result.update(status='blocked', issues=['Required checks are missing or unavailable'])
            return result
        failures = [c for c in checks if c['state'].upper() in ('FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'SKIPPED', 'STALE', 'NEUTRAL')]
        pending = [c for c in checks if c['state'].upper() not in ('SUCCESS', 'PASS')]
        if failures:
            result.update(status='failed', issues=['Required checks failed or were skipped'], evidence=failure_evidence(failures))
            return result
        if not pending and check.returncode == 0:
            if pr_info(args.pr)['headRefOid'] != args.head:
                result.update(status='blocked', issues=['PR head changed during final verification'])
            else:
                result['status'] = 'passed'
            return result
        if time.monotonic() >= deadline:
            result.update(status='blocked', issues=['Timed out waiting for required checks'])
            return result
        time.sleep(min(args.interval, max(0, deadline - time.monotonic())))


def publish(args):
    gate = ROOT / 'docs/agent-infrastructure/gh-transition-verified.json'
    if not gate.exists():
        return {'operation': 'pr publish', 'status': 'blocked', 'issues': ['GitHub CLI transition gate has not been verified; use the operational GitHub MCP workflow']}
    evidence = json.loads(gate.read_text())
    if not all(evidence.get(key) for key in ('creation', 'update', 'watch', 'comparison')):
        return {'operation': 'pr publish', 'status': 'blocked', 'issues': ['Transition evidence is incomplete']}
    if args.base != 'develop':
        raise ValueError('PR base must be develop')
    args.base = 'origin/develop'
    result = preflight(args)
    result['operation'] = 'pr publish'
    if result['status'] != 'passed':
        return result
    if result['remote_sha'] != result['head_sha']:
        result.update(status='blocked', issues=['Push the validated head separately before publication'])
        return result
    existing = json.loads(run('gh', 'pr', 'list', '--head', result['branch'], '--base', 'develop',
                              '--state', 'open', '--json', 'number,url,headRefOid').stdout)
    if existing:
        if existing[0]['headRefOid'] != result['head_sha']:
            result.update(status='blocked', issues=['Existing PR head differs from the validated head'])
            return result
        result.update(existing[0], existing=True)
        return result
    run('gh', 'pr', 'create', '--base', 'develop', '--head', result['branch'],
        '--title', args.title, '--body-file', args.body_file)
    info = pr_info(result['branch'])
    if info['headRefOid'] != result['head_sha'] or info['baseRefName'] != 'develop':
        result.update(status='blocked', issues=['Published PR head or base changed'])
    result.update(info, existing=False)
    return result
