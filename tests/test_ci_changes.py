"""Check that CI selects the jobs affected by the PR."""

import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ci_changes', ROOT / '.github/scripts/ci_changes.py')
ci_changes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci_changes)

WORKFLOW = '''name: CI
jobs:
  changes:
    runs-on: ubuntu-latest
  back:
    run: backend
  nlp:
    run: nlp
  droid:
    run: android
  required:
    run: gate
'''


class ChangeSelectionTest(unittest.TestCase):
    def select(self, paths, head=WORKFLOW):
        return ci_changes.select_checks(paths, WORKFLOW, head)

    def test_agent_infrastructure_and_its_workflow_only(self):
        head = WORKFLOW.replace('  required:', '  agent-infrastructure:\n    run: tests\n  required:')
        result = self.select(['AGENTS.md', '.claude/agents/explorer.md', ci_changes.WORKFLOW], head)
        self.assertTrue(result['agents'])
        self.assertTrue(result['deploy'])
        self.assertFalse(any(result[name] for name in ci_changes.SERVICES))

    def test_each_service_path_selects_only_its_job(self):
        for job, service in ci_changes.SERVICES.items():
            with self.subTest(service=service):
                result = self.select([f'apps/{service}/source'])
                self.assertEqual({name for name in ci_changes.SERVICES if result[name]}, {job})
                self.assertFalse(result['agents'])

    def test_shared_root_inputs_select_back_and_nlp(self):
        for path in ('package.json', 'yarn.lock', '.dockerignore'):
            with self.subTest(path=path):
                result = self.select([path])
                self.assertEqual({name for name in ci_changes.SERVICES if result[name]}, {'back', 'nlp'})

    def test_agent_only_paths_do_not_select_services(self):
        for path in ('AGENTS.md', 'CLAUDE.md', '.agents/roles/explorer.md',
                     '.claude/agents/explorer.md', '.codex/agents/explorer.toml',
                     'tests/test_agent_infrastructure.py'):
            with self.subTest(path=path):
                result = self.select([path])
                self.assertTrue(result['agents'])
                self.assertFalse(any(result[name] for name in ci_changes.SERVICES))

    def test_monitoring_configuration_selects_deploy_checks(self):
        for path in ('.env.example', 'provision/alloy/config.alloy', 'deploy/scripts/check-disk-health.py'):
            with self.subTest(path=path):
                result = self.select([path])
                self.assertTrue(result['deploy'])
                self.assertFalse(any(result[name] for name in ci_changes.SERVICES))

    def test_changed_service_job_selects_that_service(self):
        for job in ci_changes.SERVICES:
            with self.subTest(job=job):
                head = WORKFLOW.replace(f'  {job}:\n', f'  {job}:\n    timeout-minutes: 30\n')
                result = self.select([ci_changes.WORKFLOW], head)
                self.assertEqual({name for name in ci_changes.SERVICES if result[name]}, {job})

    def test_global_workflow_changes_select_all_services(self):
        result = self.select([ci_changes.WORKFLOW], WORKFLOW.replace('name: CI', 'name: Updated'))
        self.assertTrue(all(result[name] for name in ci_changes.SERVICES))

    def test_missing_service_job_fails_closed(self):
        with self.assertRaises(ValueError):
            self.select([ci_changes.WORKFLOW], WORKFLOW.replace('  nlp:\n', '  other:\n'))

    def test_agent_paths(self):
        for path in ('CLAUDE.md', '.agents/rules/a.md', '.codex/config.toml',
                     'tests/test_agent_infrastructure.py', 'tests/test_ci_changes.py',
                     '.github/scripts/ci_changes.py'):
            with self.subTest(path=path):
                self.assertTrue(self.select([path])['agents'])


if __name__ == '__main__':
    unittest.main()
