#!/usr/bin/env python3
"""Select and run local delivery checks using the CI change selector."""

import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import delivery_pr

ROOT = Path(__file__).resolve().parents[1]


def load_selector():
    spec = importlib.util.spec_from_file_location('ci_changes', ROOT / '.github/scripts/ci_changes.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True, stderr=subprocess.PIPE)


def impact(base, working_tree):
    selector = load_selector()
    merge_base = git('merge-base', base, 'HEAD').strip()
    paths = set(git('diff', '--name-only', '--no-renames', '-z', merge_base, 'HEAD').split('\0'))
    if working_tree:
        paths.update(git('diff', '--name-only', '--no-renames', '-z', 'HEAD').split('\0'))
        paths.update(git('ls-files', '--others', '--exclude-standard', '-z').split('\0'))
    paths.discard('')
    base_workflow = git('show', f'{merge_base}:{selector.WORKFLOW}')
    head_workflow = (ROOT / selector.WORKFLOW).read_text() if working_tree else git('show', f'HEAD:{selector.WORKFLOW}')
    selected = selector.select_checks(paths, base_workflow, head_workflow)
    names = {**selector.SERVICES, 'agents': 'agent-infrastructure', 'deploy': 'deploy-tooling'}
    reasons = {names[k]: [] for k, enabled in selected.items() if enabled}
    unresolved = []
    for path in sorted(paths):
        individual = selector.select_checks([path], base_workflow, head_workflow)
        for key, enabled in individual.items():
            if enabled:
                reasons[names[key]].append(path)
        if not any(individual.values()) and not path.startswith(('docs/', '.lab/')) and path not in {'README.md', 'LICENSE', '.gitignore'}:
            unresolved.append(f'Unmapped path: {path}')
    return {'operation': 'impact', 'status': 'blocked' if unresolved else 'passed',
            'head_sha': git('rev-parse', 'HEAD').strip(), 'merge_base': merge_base, 'working_tree': working_tree,
            'changed_paths': sorted(paths), 'affected_services': [names[k] for k in selector.SERVICES if selected[k]],
            'checks': list(reasons), 'reasons': reasons, 'unresolved_impact': unresolved}


def check(base, working_tree):
    result = impact(base, working_tree)
    result['operation'] = 'check'
    result['outcomes'] = []
    if not working_tree and git('status', '--porcelain', '--untracked-files=normal').strip():
        result.update(status='blocked', issues=['Committed-head validation requires a clean working tree'])
        return result
    if result['unresolved_impact']:
        return result
    commands = [(name, ['make', 'cc', name]) for name in result['affected_services']]
    if 'agent-infrastructure' in result['checks']:
        for test in ('test_agent_infrastructure.py', 'test_ci_changes.py', 'test_dev_delivery.py'):
            commands.append((test, [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', test]))
    if 'deploy-tooling' in result['checks']:
        result['outcomes'].append({'target': 'deploy-tooling', 'status': 'unverified', 'reason': 'CI-only checks require separate validation'})
    log_dir = Path(tempfile.mkdtemp(prefix='languee-delivery-'))
    for name, command in commands:
        invocation = [sys.executable, str(ROOT / 'forge/command_summary.py'), '--label', name,
                      '--cwd', str(ROOT), '--log-dir', str(log_dir), '--max-tail-chars', '1000',
                      '--max-diagnostics', '5', '--', *command]
        completed = subprocess.run(invocation, cwd=ROOT, capture_output=True, text=True, check=False)
        try:
            summary = json.loads(completed.stdout)
        except json.JSONDecodeError:
            summary = {'status': 'failed', 'exit_code': completed.returncode, 'diagnostics': ['Command summarizer failed']}
        # Raw output may contain credentials; inspect the local logs deliberately.
        summary.pop('stdout_tail', None)
        summary.pop('stderr_tail', None)
        summary.pop('diagnostics', None)
        summary['target'] = name
        result['outcomes'].append(summary)
        if completed.returncode:
            result['status'] = 'failed'
            break
    return result


def pr_body(args):
    if not args.trello_url.strip():
        raise ValueError('A Trello card URL is required')
    summary = Path(args.summary_file).read_text(encoding='utf-8').strip()
    if not summary:
        raise ValueError('Summary must not be empty')
    checks = json.loads(Path(args.check_results).read_text(encoding='utf-8'))
    lines = [args.trello_url, '', summary, '', '## Validation', '']
    lines.append('Affected services: ' + (', '.join(checks.get('affected_services', [])) or 'none'))
    lines.append('')
    for outcome in checks.get('outcomes', []):
        lines.append(f"- {outcome['target']}: {outcome['status']}")
    if not checks.get('outcomes'):
        lines.append('- No validation results supplied.')
    lines.extend(['', f"Head: {checks.get('head_sha', 'unverified')}", ''])
    Path(args.output).write_text('\n'.join(lines), encoding='utf-8')
    return {'operation': 'pr body', 'status': 'passed', 'output': args.output}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='operation', required=True)
    for name in ('impact', 'check'):
        command = sub.add_parser(name)
        command.add_argument('--base', default='origin/develop')
        command.add_argument('--working-tree', action='store_true')
        command.add_argument('--json', action='store_true')
    pr = sub.add_parser('pr')
    pr_commands = pr.add_subparsers(dest='pr_operation', required=True)
    body = pr_commands.add_parser('body')
    body.add_argument('--trello-url', required=True)
    body.add_argument('--summary-file', required=True)
    body.add_argument('--check-results', required=True)
    body.add_argument('--output', required=True)
    body.add_argument('--json', action='store_true')
    preflight = pr_commands.add_parser('preflight')
    preflight.add_argument('--base', default='origin/develop')
    preflight.add_argument('--title', required=True)
    preflight.add_argument('--check-results')
    preflight.add_argument('--json', action='store_true')
    publish = pr_commands.add_parser('publish')
    publish.add_argument('--base', default='develop')
    publish.add_argument('--title', required=True)
    publish.add_argument('--body-file', required=True)
    publish.add_argument('--check-results')
    publish.add_argument('--json', action='store_true')
    watch = pr_commands.add_parser('watch')
    watch.add_argument('--pr', required=True)
    watch.add_argument('--head', required=True)
    watch.add_argument('--timeout', type=int, default=1800)
    watch.add_argument('--interval', type=int, default=20)
    watch.add_argument('--json', action='store_true')
    args = parser.parse_args()
    try:
        if args.operation == 'pr':
            functions = {'body': pr_body, 'preflight': delivery_pr.preflight,
                         'publish': delivery_pr.publish, 'watch': delivery_pr.watch}
            if args.pr_operation in ('preflight', 'publish'):
                args.expected_impact = impact('origin/develop' if args.pr_operation == 'publish' else args.base, False)
            result = functions[args.pr_operation](args)
        else:
            result = (impact if args.operation == 'impact' else check)(args.base, args.working_tree)
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        result = {'operation': args.operation, 'status': 'blocked', 'issues': [str(exc)]}
    print(json.dumps(result, separators=(',', ':')))
    return 0 if result['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
