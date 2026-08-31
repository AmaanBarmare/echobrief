"""Regenerate insights for completed meetings through the deployed
`regenerate-insights` edge function (no re-transcription).

    python3 scripts/regenerate_insights.py --meeting-id <id>          # one meeting
    python3 scripts/regenerate_insights.py --recent 10                # last N completed real meetings
    python3 scripts/regenerate_insights.py --recent 10 --missing-facts  # only rows without facts

Uses the service role from .env; skips [harness] meetings. ~60–100 s each.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def sb_get(env: dict[str, str], path: str):
    req = urllib.request.Request(
        f"{env['SUPABASE_URL']}/rest/v1/{path}",
        headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def regenerate(env: dict[str, str], meeting_id: str) -> dict:
    req = urllib.request.Request(
        f"{env['SUPABASE_URL']}/functions/v1/regenerate-insights",
        method="POST",
        headers={"Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}", "Content-Type": "application/json"},
        data=json.dumps({"meeting_id": meeting_id}).encode(),
    )
    try:
        with urllib.request.urlopen(req, timeout=400) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.read().decode()[:300]}"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--meeting-id")
    ap.add_argument("--recent", type=int, default=0)
    ap.add_argument("--missing-facts", action="store_true")
    args = ap.parse_args()
    env = load_env()

    ids: list[str] = []
    if args.meeting_id:
        ids = [args.meeting_id]
    elif args.recent:
        rows = sb_get(
            env,
            "meetings?status=eq.completed&title=not.like.%5Bharness%5D%25&select=id,title,start_time,meeting_insights(facts)"
            f"&order=start_time.desc&limit={args.recent}",
        )
        for m in rows:
            ins = m.get("meeting_insights") or []
            has_facts = any(i.get("facts") for i in ins)
            if args.missing_facts and has_facts:
                continue
            ids.append(m["id"])
            print(f"  queued {m['id']}  {m['start_time'][:10]}  {m['title'][:60]}  facts={'yes' if has_facts else 'no'}")
    else:
        ap.error("pass --meeting-id or --recent N")

    failures = 0
    for mid in ids:
        t0 = time.time()
        res = regenerate(env, mid)
        ok = res.get("success") is True
        failures += 0 if ok else 1
        print(f"{'OK  ' if ok else 'FAIL'} {mid} ({time.time() - t0:.0f}s) {json.dumps(res)[:200]}")
    print(f"\n{len(ids) - failures}/{len(ids)} regenerated")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
