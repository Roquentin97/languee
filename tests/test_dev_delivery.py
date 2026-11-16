"""Tests for deterministic local change selection."""

import importlib.util
from pathlib import Path
import sys
import json
import tempfile
import subprocess
from types import SimpleNamespace
from subprocess import CompletedProcess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('dev_delivery', ROOT / 'scripts/dev_delivery.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)

WORKFLOW = '''name: CI
jobs:
  back:
    run: back
  nlp:
    run: nlp
  droid:
    run: droid
'''


class ImpactTest(unittest.TestCase):
    def run_impact(self, paths):
        def fake_git(*args):
            if args[0] == 'merge-base':
                return 'base\n'
            if args[0] == 'rev-parse':
                return 'head\n'
            if args[0] == 'show':
                return WORKFLOW
            if args[0] == 'diff':
                return '\0'.join(paths)
            raise AssertionError(args)
        with patch.object(delivery, 'git', side_effect=fake_git):
            return delivery.impact('origin/develop', False)

    def test_agent_only(self):
        result = self.run_impact(['scripts/dev_delivery.py'])
        self.assertEqual(result['affected_services'], [])
        self.assertEqual(result['checks'], ['agent-infrastructure'])
        self.assertEqual(result['status'], 'passed')

    def test_backend_only(self):
        result = self.run_impact(['apps/languee-back/src/example.ts'])
        self.assertEqual(result['affected_services'], ['languee-back'])
        self.assertEqual(result['checks'], ['languee-back'])

    def test_unmapped_path_is_not_silently_ignored(self):
        result = self.run_impact(['scripts/unknown.sh'])
        self.assertEqual(result['status'], 'blocked')
        self.assertTrue(result['unresolved_impact'])


class DeliveryTest(unittest.TestCase):
    def test_body_preserves_first_line_and_actual_outcomes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'summary').write_text('Summary')
            (root / 'checks').write_text(json.dumps({'head_sha': 'abc', 'outcomes': [
                {'target': 'backend', 'status': 'skipped'}, {'target': 'tests', 'status': 'passed'}]}))
            args = SimpleNamespace(trello_url='https://trello.com/c/example', summary_file=root / 'summary',
                                   check_results=root / 'checks', output=root / 'body')
            delivery.pr_body(args)
            content = (root / 'body').read_text()
            self.assertEqual(content.splitlines()[0], args.trello_url)
            self.assertIn('backend: skipped', content)

    def test_watch_rejects_changed_head(self):
        args = SimpleNamespace(pr=1, head='expected', timeout=1, interval=1)
        info = {'headRefOid': 'different', 'url': 'https://example.test/pr/1'}
        with patch.object(delivery.delivery_pr, 'gh_ready', return_value=None), \
             patch.object(delivery.delivery_pr, 'pr_info', return_value=info):
            result = delivery.delivery_pr.watch(args)
        self.assertEqual(result['status'], 'blocked')

    def test_watch_rejects_missing_required_checks(self):
        args = SimpleNamespace(pr=1, head='abc', timeout=1, interval=1)
        info = {'headRefOid': 'abc', 'url': 'https://example.test/pr/1'}
        with patch.object(delivery.delivery_pr, 'gh_ready', return_value=None), \
             patch.object(delivery.delivery_pr, 'pr_info', return_value=info), \
             patch.object(delivery.delivery_pr.time, 'monotonic', side_effect=[0, 2]), \
             patch.object(delivery.delivery_pr, 'run', return_value=CompletedProcess([], 0, '[]', '')):
            result = delivery.delivery_pr.watch(args)
        self.assertEqual(result['status'], 'blocked')

    def test_publish_is_gated(self):
        self.assertEqual(delivery.delivery_pr.publish(None)['status'], 'blocked')

    def test_watch_reports_missing_gh(self):
        with patch.object(delivery.delivery_pr, 'run', side_effect=FileNotFoundError):
            result = delivery.delivery_pr.watch(SimpleNamespace())
        self.assertEqual(result['status'], 'blocked')
        self.assertIn('not installed', result['issues'][0])

    def test_watch_reports_unauthenticated_gh(self):
        with patch.object(delivery.delivery_pr, 'run', return_value=CompletedProcess([], 1, '', '')):
            result = delivery.delivery_pr.watch(SimpleNamespace())
        self.assertEqual(result['status'], 'blocked')
        self.assertIn('authentication', result['issues'][0])

    def test_publish_does_not_accept_unpushed_head(self):
        args = SimpleNamespace(base='develop')
        preflight = {'status': 'passed', 'remote_sha': 'old', 'head_sha': 'new', 'branch': 'feature/example'}
        with patch.object(Path, 'exists', return_value=True), \
             patch.object(Path, 'read_text', return_value='{"creation":true,"update":true,"watch":true,"comparison":true}'), \
             patch.object(delivery.delivery_pr, 'gh_ready', return_value=None), \
             patch.object(delivery.delivery_pr, 'preflight', return_value=preflight):
            result = delivery.delivery_pr.publish(args)
        self.assertEqual(result['status'], 'blocked')
        self.assertIn('Push', result['issues'][0])

    def test_preflight_is_provider_neutral(self):
        with tempfile.TemporaryDirectory() as directory:
            checks = Path(directory) / 'checks.json'
            checks.write_text(json.dumps({'operation': 'check', 'status': 'passed', 'head_sha': 'head',
                                          'working_tree': False, 'checks': [], 'merge_base': 'base', 'outcomes': []}))
            args = SimpleNamespace(title='feat(agents): example', base='origin/develop', check_results=checks,
                                   expected_impact={'checks': [], 'merge_base': 'base',
                                                    'affected_services': [], 'unresolved_impact': []})
            def fake_git(*command):
                if command[:2] == ('branch', '--show-current'):
                    return 'feature/example'
                if command[:2] == ('rev-parse', 'HEAD'):
                    return 'head'
                return ''
            def fake_run(*command, **kwargs):
                self.assertNotEqual(command[0], 'gh')
                return CompletedProcess([], 0, '', '')
            with patch.object(delivery.delivery_pr, 'git', side_effect=fake_git), \
                 patch.object(delivery.delivery_pr, 'run', side_effect=fake_run), \
                 patch.object(delivery.delivery_pr, 'remote_relationship', return_value=('old', 'local-ahead', None)):
                result = delivery.delivery_pr.preflight(args)
            self.assertEqual(result['status'], 'passed')
            self.assertEqual(result['remote_relationship'], 'local-ahead')

    def test_ci_evidence_deduplicates_and_redacts(self):
        checks = [{'name': 'one', 'link': 'https://github.com/a/b/actions/runs/123/job/1'},
                  {'name': 'two', 'link': 'https://github.com/a/b/actions/runs/123/job/2'}]
        output = 'error: assertion failed\nerror: token=do-not-share\n'
        with patch.object(delivery.delivery_pr, 'run', return_value=CompletedProcess([], 0, output, '')) as run:
            evidence = delivery.delivery_pr.failure_evidence(checks)
        self.assertEqual(run.call_count, 1)
        self.assertEqual([item['check'] for item in evidence], ['one', 'two'])
        self.assertEqual(evidence[0]['retrieval'], 'passed')
        self.assertIn('error: assertion failed', evidence[0]['diagnostics'])
        self.assertNotIn('do-not-share', json.dumps(evidence))
        self.assertTrue(Path(evidence[0]['log']).exists())

    def test_ci_evidence_reports_unavailable_logs(self):
        check = {'name': 'one', 'link': 'https://github.com/a/b/actions/runs/123/job/1'}
        for code, output in ((1, ''), (0, '')):
            with self.subTest(code=code), patch.object(delivery.delivery_pr, 'run', return_value=CompletedProcess([], code, output, '')):
                evidence = delivery.delivery_pr.failure_evidence([check])
            self.assertEqual(evidence[0]['retrieval'], 'failed')
            self.assertIn('reason', evidence[0])

    def test_local_summary_is_bounded_and_redacted(self):
        impact = {'status': 'passed', 'unresolved_impact': [], 'affected_services': ['languee-back'], 'checks': ['languee-back']}
        summary = {'status': 'failed', 'exit_code': 1, 'duration_seconds': 1,
                   'stdout_log': '/tmp/out.log', 'stderr_log': '/tmp/err.log',
                   'diagnostics': ['error: test failed', 'Authorization: Bearer do-not-share', 'x' * 500]}
        with patch.object(delivery, 'impact', return_value=impact), \
             patch.object(delivery.subprocess, 'run', return_value=CompletedProcess([], 1, json.dumps(summary), '')):
            outcome = delivery.check('origin/develop', True)['outcomes'][0]
        self.assertEqual(outcome['diagnostics'][0], 'error: test failed')
        self.assertNotIn('do-not-share', json.dumps(outcome))
        self.assertLessEqual(len(outcome['diagnostics'][-1]), 300)
        self.assertEqual(outcome['stderr_log'], '/tmp/err.log')

    def test_successful_local_summary_is_compact(self):
        impact = {'status': 'passed', 'unresolved_impact': [], 'affected_services': ['languee-back'], 'checks': ['languee-back']}
        summary = {'status': 'passed', 'exit_code': 0, 'duration_seconds': 1, 'stdout_log': '/tmp/out',
                   'stderr_log': '/tmp/err', 'diagnostics': ['warning: secret'], 'stdout_tail': 'bulk'}
        with patch.object(delivery, 'impact', return_value=impact), \
             patch.object(delivery.subprocess, 'run', return_value=CompletedProcess([], 0, json.dumps(summary), '')):
            outcome = delivery.check('origin/develop', True)['outcomes'][0]
        self.assertEqual(set(outcome), {'target', 'status', 'exit_code', 'duration_seconds', 'stdout_log', 'stderr_log'})

    def test_invalid_summarizer_output_is_failure(self):
        impact = {'status': 'passed', 'unresolved_impact': [], 'affected_services': ['languee-back'], 'checks': ['languee-back']}
        with patch.object(delivery, 'impact', return_value=impact), \
             patch.object(delivery.subprocess, 'run', return_value=CompletedProcess([], 0, 'invalid', '')):
            result = delivery.check('origin/develop', True)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['outcomes'][0]['exit_code'], 1)
        self.assertTrue(Path(result['outcomes'][0]['log']).exists())

    def test_summarizer_start_failure_is_reported(self):
        impact = {'status': 'passed', 'unresolved_impact': [], 'affected_services': ['languee-back'], 'checks': ['languee-back']}
        with patch.object(delivery, 'impact', return_value=impact), \
             patch.object(delivery.subprocess, 'run', side_effect=OSError):
            result = delivery.check('origin/develop', True)
        self.assertEqual(result['status'], 'failed')
        self.assertIn('summarizer', result['outcomes'][0]['error'])

    def test_failed_local_check_stops_remaining_checks(self):
        impact = {'status': 'passed', 'unresolved_impact': [], 'affected_services': ['languee-back'],
                  'checks': ['languee-back', 'agent-infrastructure']}
        output = json.dumps({'status': 'failed', 'exit_code': 1, 'stdout_log': '/tmp/out.log', 'stderr_log': '/tmp/check.log'})
        with patch.object(delivery, 'impact', return_value=impact), \
             patch.object(delivery.subprocess, 'run', return_value=CompletedProcess([], 1, output, '')) as run:
            result = delivery.check('origin/develop', True)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['outcomes'][0]['stderr_log'], '/tmp/check.log')
        self.assertEqual(run.call_count, 1)

    def test_watch_confirms_final_head_before_success(self):
        args = SimpleNamespace(pr=1, head='abc', timeout=1, interval=1)
        before = {'headRefOid': 'abc', 'url': 'https://example.test/pr/1'}
        after = {'headRefOid': 'new', 'url': before['url']}
        checks = json.dumps([{'name': 'required', 'state': 'SUCCESS', 'link': 'https://example.test'}])
        with patch.object(delivery.delivery_pr, 'gh_ready', return_value=None), \
             patch.object(delivery.delivery_pr, 'pr_info', side_effect=[before, after]), \
             patch.object(delivery.delivery_pr, 'run', return_value=CompletedProcess([], 0, checks, '')):
            result = delivery.delivery_pr.watch(args)
        self.assertEqual(result['status'], 'blocked')

    def test_preflight_rejects_results_for_another_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            checks = Path(directory) / 'checks.json'
            checks.write_text(json.dumps({'operation': 'check', 'status': 'passed', 'head_sha': 'old',
                                          'working_tree': False, 'checks': [], 'merge_base': 'base', 'outcomes': []}))
            args = SimpleNamespace(title='feat(agents): example', base='origin/develop', check_results=checks,
                                   expected_impact={'checks': [], 'merge_base': 'base',
                                                    'affected_services': [], 'unresolved_impact': []})
            def fake_git(*command):
                if command[:2] == ('branch', '--show-current'):
                    return 'feature/example'
                if command[:2] == ('rev-parse', 'HEAD'):
                    return 'new'
                return ''
            success = CompletedProcess([], 0, '', '')
            with patch.object(delivery.delivery_pr, 'git', side_effect=fake_git), \
                 patch.object(delivery.delivery_pr, 'run', return_value=success):
                result = delivery.delivery_pr.preflight(args)
            self.assertEqual(result['status'], 'blocked')
            self.assertIn('Passing committed-head check results are required', result['issues'])


class RemoteRelationshipTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.remote, self.local, self.other = root / 'remote.git', root / 'local', root / 'other'
        self.command(root, 'init', '--bare', str(self.remote))
        self.command(root, 'init', str(self.local))
        self.command(self.local, 'checkout', '-b', 'feature/example')
        self.configure(self.local)
        self.commit(self.local, 'initial')
        self.command(self.local, 'remote', 'add', 'origin', str(self.remote))
        self.command(self.local, 'push', '-u', 'origin', 'feature/example')

    def command(self, cwd, *args):
        return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()

    def configure(self, cwd):
        self.command(cwd, 'config', 'user.name', 'Test')
        self.command(cwd, 'config', 'user.email', 'test@example.invalid')

    def commit(self, cwd, text):
        (cwd / 'file').write_text(text)
        self.command(cwd, 'add', 'file')
        self.command(cwd, 'commit', '-m', text)

    def other_commit(self):
        self.command(self.local.parent, 'clone', '-b', 'feature/example', str(self.remote), str(self.other))
        self.configure(self.other)
        self.commit(self.other, 'remote')
        self.command(self.other, 'push', 'origin', 'feature/example')

    def relationship(self, branch='feature/example'):
        head = self.command(self.local, 'rev-parse', 'HEAD')
        with patch.object(delivery.delivery_pr, 'ROOT', self.local):
            return delivery.delivery_pr.remote_relationship(branch, head)

    def test_equal_and_absent(self):
        self.assertEqual(self.relationship()[1], 'equal')
        self.assertEqual(self.relationship('feature/new')[1], 'absent')

    def test_local_ahead(self):
        self.commit(self.local, 'local')
        _, relationship, issue = self.relationship()
        self.assertEqual(relationship, 'local-ahead')
        self.assertIsNone(issue)

    def test_remote_ahead_fetches_missing_object(self):
        self.other_commit()
        _, relationship, issue = self.relationship()
        self.assertEqual(relationship, 'remote-ahead')
        self.assertIn('synchronize', issue)

    def test_diverged(self):
        self.commit(self.local, 'local')
        self.other_commit()
        _, relationship, issue = self.relationship()
        self.assertEqual(relationship, 'diverged')
        self.assertIn('reconcile', issue)

    def test_unverifiable_remote(self):
        with patch.object(delivery.delivery_pr, 'run', return_value=CompletedProcess([], 1, '', '')):
            self.assertEqual(delivery.delivery_pr.remote_relationship('feature/example', 'a' * 40)[1], 'unknown')

    def test_failed_fetch_is_unverifiable(self):
        remote_sha = 'b' * 40
        def fake_run(*args, **kwargs):
            if args[1] == 'ls-remote':
                return CompletedProcess([], 0, f'{remote_sha}\trefs/heads/feature/example\n', '')
            if args[1] == 'rev-parse':
                return CompletedProcess([], 0, 'false\n', '')
            return CompletedProcess([], 1, '', '')
        with patch.object(delivery.delivery_pr, 'run', side_effect=fake_run):
            _, relationship, issue = delivery.delivery_pr.remote_relationship('feature/example', 'a' * 40)
        self.assertEqual(relationship, 'unknown')
        self.assertIn('fetch', issue)


if __name__ == '__main__':
    unittest.main()
