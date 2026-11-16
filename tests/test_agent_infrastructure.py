"""Validate agent adapters and shared instruction discovery."""

import pathlib
import tomllib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class AgentInfrastructureTest(unittest.TestCase):
    def test_skill_links_and_metadata(self):
        for name in ('open-pr', 'trello-card', 'dependabot', 'local-artifact'):
            canonical = ROOT / '.agents' / 'skills' / name / 'SKILL.md'
            adapter = ROOT / '.claude' / 'skills' / name / 'SKILL.md'
            self.assertEqual(canonical.resolve(), adapter.resolve())
            body = canonical.read_text()
            self.assertTrue(body.startswith(f'---\nname: {name}\n'))
            self.assertIn('\ndescription:', body.split('---', 2)[1])

    def test_agent_adapters_reference_shared_roles(self):
        for role in (ROOT / '.agents' / 'roles').glob('*.md'):
            codex = tomllib.loads((ROOT / '.codex' / 'agents' / (role.stem + '.toml')).read_text())
            claude = (ROOT / '.claude' / 'agents' / (role.stem + '.md')).read_text()
            self.assertEqual(codex['name'], role.stem)
            self.assertIn(f'.agents/roles/{role.name}', codex['developer_instructions'])
            self.assertIn(f'.agents/roles/{role.name}', claude)
            self.assertTrue(claude.startswith('---\nname: '))

    def test_retired_entrypoints_and_import(self):
        self.assertEqual((ROOT / 'CLAUDE.md').read_text().splitlines()[0], '@AGENTS.md')
        self.assertNotIn('CLAUDE.md', (ROOT / 'AGENTS.md').read_text())
        self.assertFalse(list((ROOT / '.claude' / 'commands').glob('forge*.md')))
        config = tomllib.loads((ROOT / '.codex' / 'config.toml').read_text())
        self.assertNotIn('notion', config.get('mcp_servers', {}))

    def test_scoped_rule_adapters(self):
        for adapter in (ROOT / '.claude' / 'rules').glob('*.md'):
            text = adapter.read_text()
            self.assertTrue(text.startswith('---\npaths:\n'))
            self.assertTrue((ROOT / '.agents' / 'rules' / adapter.name).is_file())
            self.assertIn(f'.agents/rules/{adapter.name}', text)


if __name__ == '__main__':
    unittest.main()
