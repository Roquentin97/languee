import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import unittest
from urllib.parse import parse_qs, urlsplit

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/query_loki.py"
TOKEN = "secret-token-for-test"


class Handler(http.server.BaseHTTPRequestHandler):
    status = 200
    body = b'{"status":"success","data":{"result":[]}}'
    last_request = None

    def do_GET(self):
        type(self).last_request = (self.path, self.headers.get("Authorization"))
        self.send_response(self.status)
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *args):
        pass


class QueryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        Handler.status = 200
        Handler.body = b'{"status":"success","data":{"result":[]}}'
        self.env = os.environ.copy()
        self.env.update(GRAFANA_URL=f"http://127.0.0.1:{self.server.server_port}/grafana",
                        GRAFANA_SERVICE_ACCOUNT_TOKEN=TOKEN, GRAFANA_LOKI_DATASOURCE_UID="custom uid")

    def run_query(self, *extra):
        return subprocess.run([sys.executable, str(SCRIPT), '{service="back"} |= "a & b"',
                               "--start", "100", "--end", "200", *extra],
                              env=self.env, text=True, capture_output=True, timeout=5)

    def test_query_encoding_and_authentication(self):
        result = self.run_query("--limit", "10")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "success")
        path, auth = Handler.last_request
        parts = urlsplit(path)
        self.assertEqual(parts.path, "/grafana/api/datasources/proxy/uid/custom%20uid/loki/api/v1/query_range")
        self.assertEqual(parse_qs(parts.query), {"query": ['{service="back"} |= "a & b"'],
                         "start": ["100000000000"], "end": ["200000000000"],
                         "limit": ["10"], "direction": ["backward"]})
        self.assertEqual(auth, "Bearer " + TOKEN)

    def test_missing_config_and_bounds(self):
        del self.env["GRAFANA_SERVICE_ACCOUNT_TOKEN"]
        self.assertEqual(self.run_query().returncode, 2)
        self.assertEqual(self.run_query("--limit", "1001").returncode, 2)

    def test_errors_do_not_echo_server_body_or_token(self):
        for status in (401, 403, 400, 500, 302):
            with self.subTest(status=status):
                Handler.status = status
                Handler.body = TOKEN.encode()
                result = self.run_query()
                self.assertEqual(result.returncode, 1)
                self.assertNotIn(TOKEN, result.stdout + result.stderr)
                self.assertIn(str(status), result.stderr)
        Handler.status = 200
        Handler.body = b'{"status":"error","error":"secret-token-for-test"}'
        result = self.run_query()
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(TOKEN, result.stdout + result.stderr)

    def test_network_error(self):
        self.env["GRAFANA_URL"] = "http://127.0.0.1:1"
        result = self.run_query()
        self.assertEqual(result.returncode, 1)
        self.assertIn("network", result.stderr)
        self.assertNotIn(TOKEN, result.stderr)


if __name__ == "__main__":
    unittest.main()
