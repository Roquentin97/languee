#!/usr/bin/env python3
"""Run a bounded Loki range query through Grafana's datasource proxy."""

import argparse
import ipaddress
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", help="LogQL expression")
    start_group = parser.add_mutually_exclusive_group(required=True)
    start_group.add_argument("--start", type=int, help="start Unix time in seconds")
    start_group.add_argument("--start-ns", type=int, help="start Unix time in nanoseconds")
    end_group = parser.add_mutually_exclusive_group(required=True)
    end_group.add_argument("--end", type=int, help="exclusive end Unix time in seconds")
    end_group.add_argument("--end-ns", type=int, help="exclusive end Unix time in nanoseconds")
    parser.add_argument("--limit", type=int, default=100, help="maximum entries (1-1000)")
    parser.add_argument("--direction", choices=("forward", "backward"), default="backward")
    args = parser.parse_args()
    start = args.start_ns if args.start_ns is not None else args.start * 10**9
    end = args.end_ns if args.end_ns is not None else args.end * 10**9
    if start < 0 or end <= start or end - start > 86400 * 10**9:
        parser.error("time range must be positive and at most 24 hours")
    if not 1 <= args.limit <= 1000:
        parser.error("limit must be between 1 and 1000")
    base = os.environ.get("GRAFANA_URL", "").rstrip("/")
    token = os.environ.get("GRAFANA_SERVICE_ACCOUNT_TOKEN", "")
    uid = os.environ.get("GRAFANA_LOKI_DATASOURCE_UID", "loki")
    if not base or not token or not uid:
        print("Missing Grafana URL, service-account token, or datasource UID", file=sys.stderr)
        return 2
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        print("Invalid GRAFANA_URL", file=sys.stderr)
        return 2
    if parsed.scheme == "http":
        try:
            loopback = ipaddress.ip_address(parsed.hostname).is_loopback
        except ValueError:
            loopback = False
        if not loopback:
            print("GRAFANA_URL requires HTTPS unless using a loopback IP address", file=sys.stderr)
            return 2
    params = urllib.parse.urlencode({"query": args.query, "start": str(start),
                                     "end": str(end), "limit": args.limit,
                                     "direction": args.direction})
    url = f"{base}/api/datasources/proxy/uid/{urllib.parse.quote(uid, safe='')}/loki/api/v1/query_range?{params}"
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            result = json.load(response)
        if not isinstance(result, dict) or result.get("status") != "success":
            print("Loki query failed: server returned an unsuccessful response", file=sys.stderr)
            return 1
        print(json.dumps(result))
        return 0
    except urllib.error.HTTPError as error:
        category = "authentication or authorization failed" if error.code in (401, 403) else "query or server error"
        print(f"Grafana {category} (HTTP {error.code})", file=sys.stderr)
    except (urllib.error.URLError, TimeoutError, OSError):
        print("Grafana network request failed", file=sys.stderr)
    except (ValueError, UnicodeError):
        print("Grafana returned invalid JSON", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
