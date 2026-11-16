"""Read-only PR safety checks and final-head CI monitoring."""

import json
import importlib.util
from pathlib import Path
import re
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = ('feature/', 'fix/', 'chore/', 'docs/', 'refactor/', 'test/', 'ci/', 'deps/')
TITLE = re.compile(r'^(feat|fix|deps|chore|docs|refactor|test|ci)\([a-z0-9][a-z0-9-]*\): \S.*$')
FAILED_STATES = {'FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'SKIPPED', 'STALE', 'NEUTRAL'}
SENSITIVE = re.compile(r'(?i)authorization|password|passwd|secret|token|api[_-]?key|cookie|credential|private.key|\b[a-z_]*(?:key|auth|pass)[a-z_]*\s*[:=]')
TOKEN = re.compile(r'(?i)\b(?:gh[opsu]_[a-z0-9_]+|github_pat_[a-z0-9_]+|sk-[a-z0-9_-]+|eyJ[a-z0-9_-]+\.[a-z0-9_.-]+)\b')


def safe_diagnostics(lines):
    """Bound excerpts and withhold lines likely to contain credentials."""
    excerpts = []
    withheld = False
    for line in lines[:5]:
        line = re.sub(r'\x1b\[[0-9;]*m', '', str(line)).strip()
        if (SENSITIVE.search(line) or TOKEN.search(line) or re.search(r'://[^/\s]+@', line)
                or re.search(r'\b[A-Za-z0-9_+/=-]{40,}\b', line)):
            withheld = True
            continue
        if line:
            excerpts.append(line[:300])
    return excerpts, withheld


def extract_ci_diagnostics(output):
    spec = importlib.util.spec_from_file_location('command_summary', ROOT / 'forge/command_summary.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return safe_diagnostics(module.extract_diagnostics(output, 5))


def run(*command, check=True):
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if check and result.returncode:
        raise ValueError(f'{command[0]} command failed (exit {result.returncode})')
    return result


def git(*args):
    return run('git', *args).stdout.strip()


def remote_relationship(branch, head):
    ref = f'refs/heads/{branch}'
    remote = run('git', 'ls-remote', '--heads', 'origin', ref, check=False)
    if remote.returncode:
        return None, 'unknown', 'Could not inspect remote branch'
    lines = remote.stdout.strip().splitlines()
    if not lines:
        return None, 'absent', None
    fields = lines[0].split()
    if len(lines) != 1 or len(fields) != 2 or fields[1] != ref or not re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}', fields[0]):
        return None, 'unknown', 'Remote branch lookup returned an ambiguous result'
    remote_sha = fields[0]
    if remote_sha == head:
        return remote_sha, 'equal', None
    shallow = run('git', 'rev-parse', '--is-shallow-repository', check=False)
    if shallow.returncode or shallow.stdout.strip() != 'false':
        return remote_sha, 'unknown', 'Cannot verify ancestry in a shallow or unavailable repository'
    if run('git', 'cat-file', '-e', f'{remote_sha}^{{commit}}', check=False).returncode:
        fetched = run('git', 'fetch', '--no-tags', '--no-write-fetch-head', 'origin', remote_sha, check=False)
        if fetched.returncode:
            return remote_sha, 'unknown', 'Could not fetch remote commit for ancestry comparison'
    remote_ancestor = run('git', 'merge-base', '--is-ancestor', remote_sha, head, check=False).returncode
    local_ancestor = run('git', 'merge-base', '--is-ancestor', head, remote_sha, check=False).returncode
    if remote_ancestor not in (0, 1) or local_ancestor not in (0, 1) or (remote_ancestor == 0 and local_ancestor == 0):
        return remote_sha, 'unknown', 'Remote ancestry comparison failed or was ambiguous'
    if remote_ancestor == 0:
        return remote_sha, 'local-ahead', None
    if local_ancestor == 0:
        return remote_sha, 'remote-ahead', 'Remote branch is ahead; synchronize before publishing'
    return remote_sha, 'diverged', 'Local and remote branches diverged; reconcile before publishing'


def gh_ready(operation):
    try:
        result = run('gh', 'auth', 'status', check=False)
    except OSError:
        return {'operation': operation, 'status': 'blocked', 'issues': ['GitHub CLI is not installed or accessible']}
    if result.returncode:
        return {'operation': operation, 'status': 'blocked', 'issues': ['GitHub CLI authentication is unavailable']}
    return None


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
    remote_sha, relationship, remote_issue = remote_relationship(branch, head)
    if remote_issue:
        issues.append(remote_issue)
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
            'upstream': upstream.stdout.strip() or None, 'remote_sha': remote_sha,
            'remote_relationship': relationship, 'issues': issues}


def pr_info(pr):
    result = run('gh', 'pr', 'view', str(pr), '--json', 'number,url,headRefName,baseRefName,headRefOid')
    return json.loads(result.stdout)


def failure_evidence(checks):
    evidence = []
    runs = {}
    for check in checks:
        match = re.search(r'/actions/runs/(\d+)', check.get('link', ''))
        if not match:
            evidence.append({'check': check['name'], 'link': check.get('link'),
                             'retrieval': 'unavailable', 'reason': 'No workflow run link'})
            continue
        run_id = match.group(1)
        if run_id not in runs:
            try:
                output = run('gh', 'run', 'view', run_id, '--log-failed', check=False)
            except OSError:
                runs[run_id] = {'retrieval': 'failed', 'reason': 'GitHub CLI log retrieval is unavailable'}
                evidence.append({'check': check['name'], 'link': check.get('link'), 'run_id': run_id, **runs[run_id]})
                continue
            directory = Path(tempfile.mkdtemp(prefix='languee-ci-'))
            path = directory / 'failed.log'
            path.write_text(output.stdout + output.stderr, encoding='utf-8')
            excerpts, withheld = extract_ci_diagnostics(output.stdout)
            available = output.returncode == 0 and bool(output.stdout.strip())
            runs[run_id] = {'log': str(path), 'exit_code': output.returncode,
                            'retrieval': 'passed' if available else 'failed',
                            'diagnostics': excerpts if available else [],
                            'diagnostics_withheld': withheld or (available and not excerpts),
                            **({'reason': 'Log retrieval failed or returned no output'} if not available else
                               {'reason': 'No safe diagnostic excerpt; inspect the local log'} if not excerpts else {})}
        evidence.append({'check': check['name'], 'link': check.get('link'), 'run_id': run_id, **runs[run_id]})
    return evidence


def watch(args):
    unavailable = gh_ready('pr watch')
    if unavailable:
        return unavailable
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
        failures = [c for c in checks if c['state'].upper() in FAILED_STATES]
        no_checks = not checks and (check.returncode == 0 or 'no required checks reported' in check.stderr.lower())
        if no_checks:
            if time.monotonic() >= deadline:
                result.update(status='blocked', issues=['Required checks are missing or unavailable'])
                return result
            time.sleep(min(args.interval, max(0, deadline - time.monotonic())))
            continue
        if check.returncode not in (0, 8):
            message = check.stderr.lower()
            issue = ('GitHub rate limit encountered' if 'rate limit' in message else
                     'GitHub authentication failed' if 'authentication' in message or '401' in message else
                     'Unable to retrieve required checks or a required check failed; inspect linked jobs')
            result.update(status='failed', issues=[issue], evidence=failure_evidence(failures))
            return result
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
    unavailable = gh_ready('pr publish')
    if unavailable:
        return unavailable
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
    remote_sha, relationship, issue = remote_relationship(result['branch'], result['head_sha'])
    if issue or relationship != 'equal' or remote_sha != result['head_sha']:
        result.update(status='blocked', issues=['Remote head changed; push or reconcile before publication'])
        return result
    run('gh', 'pr', 'create', '--base', 'develop', '--head', result['branch'],
        '--title', args.title, '--body-file', args.body_file)
    info = pr_info(result['branch'])
    if info['headRefOid'] != result['head_sha'] or info['baseRefName'] != 'develop':
        result.update(status='blocked', issues=['Published PR head or base changed'])
    result.update(info, existing=False)
    return result
