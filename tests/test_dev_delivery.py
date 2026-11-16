"""Tests for deterministic local change selection."""

import importlib.util
from pathlib import Path
import sys
import json
import tempfile
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
        with patch.object(delivery.delivery_pr, 'pr_info', return_value=info):
            result = delivery.delivery_pr.watch(args)
        self.assertEqual(result['status'], 'blocked')

    def test_watch_rejects_missing_required_checks(self):
        args = SimpleNamespace(pr=1, head='abc', timeout=1, interval=1)
        info = {'headRefOid': 'abc', 'url': 'https://example.test/pr/1'}
        with patch.object(delivery.delivery_pr, 'pr_info', return_value=info), \
             patch.object(delivery.delivery_pr, 'run', return_value=CompletedProcess([], 0, '[]', '')):
            result = delivery.delivery_pr.watch(args)
        self.assertEqual(result['status'], 'blocked')

    def test_publish_is_gated(self):
        self.assertEqual(delivery.delivery_pr.publish(None)['status'], 'blocked')

    def test_failed_local_check_stops_remaining_checks(self):
        impact = {'status': 'passed', 'unresolved_impact': [], 'affected_services': ['languee-back'],
                  'checks': ['languee-back', 'agent-infrastructure']}
        output = json.dumps({'status': 'failed', 'exit_code': 1, 'stderr_log': '/tmp/check.log'})
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
        with patch.object(delivery.delivery_pr, 'pr_info', side_effect=[before, after]), \
             patch.object(delivery.delivery_pr, 'run', return_value=CompletedProcess([], 0, checks, '')):
            result = delivery.delivery_pr.watch(args)
        self.assertEqual(result['status'], 'blocked')


if __name__ == '__main__':
    unittest.main()
