"""HTTP + DB helpers for the pipeline harness.

All calls go at the real deployed edge functions against the real DB.
Every test row is prefixed "[harness]" in the title and has a unique UUID so
cleanup and human inspection are unambiguous.
"""
from __future__ import annotations

import json
import sys
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Any


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_ENV_PATH = os.environ.get("ECHOBRIEF_ENV", os.path.join(REPO_ROOT, ".env"))


def load_env(path: str = DEFAULT_ENV_PATH) -> dict[str, str]:
    env: dict[str, str] = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
SUPABASE_URL: str = ENV["SUPABASE_URL"]
SERVICE_KEY: str = ENV["SUPABASE_SERVICE_ROLE_KEY"]
RECALL_WEBHOOK_SECRET: str = ENV["RECALL_WEBHOOK_SECRET"]
SARVAM_WEBHOOK_SECRET: str = ENV["SARVAM_WEBHOOK_SECRET"]
SPLIT_AUDIO_URL: str = ENV.get("SPLIT_AUDIO_URL", "https://www.echobrief.in/api/split-audio")
SPLIT_AUDIO_SECRET: str = ENV.get("SPLIT_AUDIO_SECRET", "")

# Harness meetings are owned by a real prod user so RLS doesn't get in the way;
# the "[harness]" title prefix makes them easy to find and delete.
#
# Resolved at import rather than hardcoded. The previous hardcoded id belonged to
# a user who was later deleted from auth.users, which failed 10 of 11 scenarios
# with an opaque foreign-key 23503 that looked nothing like the real problem.
# Override with HARNESS_USER_ID if you need a specific account.
def _resolve_user_id() -> str:
    override = ENV.get("HARNESS_USER_ID") or os.environ.get("HARNESS_USER_ID")
    if override:
        return override
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/profiles?select=user_id&limit=1",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
    )
    rows = json.loads(urllib.request.urlopen(req, timeout=30).read())
    if not rows:
        raise RuntimeError("no profiles rows — cannot pick a harness user id")
    return rows[0]["user_id"]


TEST_USER_ID: str = _resolve_user_id()

# Bot ids from real meetings. Reusing real ids means calls like getRecallBot()
# actually succeed when handlers query Recall.
#   - GOOD_BOT: bot that reached recording_done/done
#   - KICKED_BOT: bot that went joining_call -> fatal (never admitted, no recording)
#
# These are workspace- AND region-scoped: Recall regions are separate deployments,
# and a bot id from another workspace returns 404. Re-point them (or set the env
# overrides) whenever the Recall account changes. Recall also ages out recorded
# media, so an old GOOD_BOT eventually reports audio_mixed "missing" rather than
# "done" — only bot_done_defers_on_unknown_audio actually cares.
GOOD_BOT_ID = ENV.get("HARNESS_GOOD_BOT_ID") or "d16b6ebf-5890-4826-be61-fbebe9bee95b"
KICKED_BOT_ID = ENV.get("HARNESS_KICKED_BOT_ID") or "98eacdd6-9cc8-4973-86b5-3838007adffc"


class HTTPError(Exception):
    def __init__(self, status: int, body: str, url: str):
        super().__init__(f"{status} {url}\n{body[:500]}")
        self.status = status
        self.body = body
        self.url = url


def _request(method: str, url: str, headers: dict[str, str], body: bytes | None = None, timeout: int = 60) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


# ---------- Supabase PostgREST ----------
def _rest_headers() -> dict[str, str]:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def insert_meeting(
    *,
    title: str,
    recall_bot_id: str | None,
    sarvam_job_id: str | None = None,
    status: str = "scheduled",
    processing_config: dict[str, Any] | None = None,
    audio_url: str | None = None,
    age_minutes: int = 0,
) -> str:
    """Insert a test meeting. age_minutes back-dates created_at AND updated_at,
    so the row appears `age_minutes` old to the monitor. The meetings table has
    a BEFORE UPDATE trigger on updated_at so we set it on INSERT only."""
    meeting_id = str(uuid.uuid4())
    backdated_iso = time.strftime(
        "%Y-%m-%dT%H:%M:%SZ",
        time.gmtime(time.time() - age_minutes * 60),
    )
    body = {
        "id": meeting_id,
        "user_id": TEST_USER_ID,
        "title": f"[harness] {title} {meeting_id[:8]}",
        "source": "recall",
        "start_time": backdated_iso,
        "status": status,
        "recall_bot_id": recall_bot_id,
        "sarvam_job_id": sarvam_job_id,
        "processing_config": processing_config or {},
        "audio_url": audio_url,
        "created_at": backdated_iso,
        "updated_at": backdated_iso,
    }
    status_code, resp_body = _request(
        "POST",
        f"{SUPABASE_URL}/rest/v1/meetings",
        headers={**_rest_headers(), "Prefer": "return=minimal"},
        body=json.dumps(body).encode(),
    )
    if status_code >= 300:
        raise HTTPError(status_code, resp_body.decode(), "insert_meeting")
    return meeting_id


def get_monitor_events(meeting_id: str) -> list[dict[str, Any]]:
    status, body = _request(
        "GET",
        f"{SUPABASE_URL}/rest/v1/monitor_events?meeting_id=eq.{meeting_id}&select=*&order=created_at.desc",
        headers=_rest_headers(),
    )
    return json.loads(body) if status < 300 else []


def delete_monitor_events(meeting_id: str) -> None:
    try:
        _request(
            "DELETE",
            f"{SUPABASE_URL}/rest/v1/monitor_events?meeting_id=eq.{meeting_id}",
            headers=_rest_headers(),
        )
    except Exception:
        pass


def get_meeting(meeting_id: str) -> dict[str, Any]:
    status, body = _request(
        "GET",
        f"{SUPABASE_URL}/rest/v1/meetings?id=eq.{meeting_id}&select=*",
        headers=_rest_headers(),
    )
    if status >= 300:
        raise HTTPError(status, body.decode(), "get_meeting")
    rows = json.loads(body)
    if not rows:
        raise RuntimeError(f"meeting {meeting_id} not found")
    return rows[0]


def get_transcript(meeting_id: str) -> dict[str, Any] | None:
    status, body = _request(
        "GET",
        f"{SUPABASE_URL}/rest/v1/transcripts?meeting_id=eq.{meeting_id}&select=*",
        headers=_rest_headers(),
    )
    rows = json.loads(body) if status < 300 else []
    return rows[0] if rows else None


def get_insights(meeting_id: str) -> dict[str, Any] | None:
    status, body = _request(
        "GET",
        f"{SUPABASE_URL}/rest/v1/meeting_insights?meeting_id=eq.{meeting_id}&select=*",
        headers=_rest_headers(),
    )
    rows = json.loads(body) if status < 300 else []
    return rows[0] if rows else None


def delete_meeting(meeting_id: str) -> bool:
    """Cascade-delete transcripts, insights, and the meeting row.

    Returns True when the meeting row itself was deleted. Never raises — this
    runs in every scenario's `finally` — but a failed delete is printed rather
    than swallowed: a [harness] row that survives sits on the real owner's
    dashboard.
    """
    ok = True
    for table in ["transcripts", "meeting_insights", "meetings"]:
        key = "id" if table == "meetings" else "meeting_id"
        try:
            status, body = _request(
                "DELETE",
                f"{SUPABASE_URL}/rest/v1/{table}?{key}=eq.{meeting_id}",
                headers=_rest_headers(),
            )
            if status >= 300:
                ok = False
                print(
                    f"    [cleanup] DELETE {table} for {meeting_id[:8]} returned {status}: {body[:200]!r}",
                    file=sys.stderr,
                )
        except Exception as e:
            ok = False
            print(f"    [cleanup] DELETE {table} for {meeting_id[:8]} failed: {e}", file=sys.stderr)
    return ok


def cleanup_harness_rows(*, older_than_minutes: int | None = None) -> int:
    """Delete every meeting whose title starts with '[harness]'.

    With `older_than_minutes`, only rows created before that cut-off go. The
    start-of-run sweep uses it so a harness running concurrently in another
    session keeps its live rows (scenarios back-date created_at by at most
    20 minutes). Returns the number of meeting rows actually deleted.
    """
    url = f"{SUPABASE_URL}/rest/v1/meetings?title=like.%5Bharness%5D*&select=id"
    if older_than_minutes is not None:
        cutoff = time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - older_than_minutes * 60)
        )
        url += f"&created_at=lt.{cutoff}"
    status, body = _request("GET", url, headers=_rest_headers())
    if status >= 300:
        print(f"    [cleanup] could not list [harness] rows: {status}", file=sys.stderr)
        return 0
    rows = json.loads(body)
    return sum(1 for row in rows if delete_meeting(row["id"]))


# ---------- Edge function invocations ----------
def fire_recall_webhook(event: dict[str, Any]) -> tuple[int, str]:
    """POST to recall-webhook with token-based auth (code supports this fallback)."""
    url = f"{SUPABASE_URL}/functions/v1/recall-webhook?token={urllib.parse.quote(RECALL_WEBHOOK_SECRET)}"
    status, body = _request(
        "POST",
        url,
        headers={"Content-Type": "application/json"},
        body=json.dumps(event).encode(),
    )
    return status, body.decode()


def fire_sarvam_webhook(payload: dict[str, Any]) -> tuple[int, str]:
    url = f"{SUPABASE_URL}/functions/v1/sarvam-webhook"
    status, body = _request(
        "POST",
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SARVAM_WEBHOOK_SECRET}",
        },
        body=json.dumps(payload).encode(),
        timeout=120,
    )
    return status, body.decode()


def call_send_meeting_email(meeting_id: str, recipient_email: str | None = None) -> tuple[int, str]:
    """Invoke send-meeting-email directly. Pass a recipient to keep real mail
    out of it — `delivered@resend.dev` is Resend's sink address."""
    payload: dict[str, Any] = {"meetingId": meeting_id}
    if recipient_email:
        payload["recipientEmail"] = recipient_email
    status, body = _request(
        "POST",
        f"{SUPABASE_URL}/functions/v1/send-meeting-email",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SERVICE_KEY}",
        },
        body=json.dumps(payload).encode(),
        timeout=60,
    )
    return status, body.decode()


def insert_email_delivery(meeting_id: str, recipient_email: str, kind: str = "meeting_summary") -> None:
    status, body = _request(
        "POST",
        f"{SUPABASE_URL}/rest/v1/email_deliveries",
        headers={**_rest_headers(), "Prefer": "return=minimal"},
        body=json.dumps({
            "meeting_id": meeting_id,
            "recipient_email": recipient_email,
            "kind": kind,
        }).encode(),
    )
    if status >= 300:
        raise HTTPError(status, body.decode(), "insert_email_delivery")


def get_email_deliveries(meeting_id: str) -> list[dict[str, Any]]:
    status, body = _request(
        "GET",
        f"{SUPABASE_URL}/rest/v1/email_deliveries?meeting_id=eq.{meeting_id}&select=*",
        headers=_rest_headers(),
    )
    return json.loads(body) if status < 300 else []


def call_monitor_stuck_meetings() -> tuple[int, str]:
    url = f"{SUPABASE_URL}/functions/v1/monitor-stuck-meetings"
    status, body = _request(
        "POST",
        url,
        headers={"Content-Type": "application/json"},
        body=b"{}",
        timeout=120,
    )
    return status, body.decode()


def update_meeting(meeting_id: str, fields: dict[str, Any]) -> None:
    url = f"{SUPABASE_URL}/rest/v1/meetings?id=eq.{meeting_id}"
    _request("PATCH", url, headers=_rest_headers(), body=json.dumps(fields).encode())


def create_signed_audio_url(storage_path: str, expires_s: int = 3600) -> str:
    """Sign a path inside the `recordings` bucket (path WITHOUT the bucket prefix)."""
    url = f"{SUPABASE_URL}/storage/v1/object/sign/recordings/{storage_path}"
    status, body = _request(
        "POST",
        url,
        headers={**_rest_headers(), "Content-Type": "application/json"},
        body=json.dumps({"expiresIn": expires_s}).encode(),
    )
    signed = json.loads(body)["signedURL"]
    return f"{SUPABASE_URL}/storage/v1{signed}"


def post_split_audio(payload: dict[str, Any] | None, *, authed: bool = True, timeout: int = 290) -> tuple[int, str]:
    """POST to the deployed Vercel split-audio function."""
    headers = {"Content-Type": "application/json"}
    if authed:
        headers["Authorization"] = f"Bearer {SPLIT_AUDIO_SECRET}"
    status, body = _request(
        "POST",
        SPLIT_AUDIO_URL,
        headers=headers,
        body=json.dumps(payload or {}).encode(),
        timeout=timeout,
    )
    return status, body.decode()


def call_check_recall_status(meeting_id: str) -> tuple[int, str]:
    url = f"{SUPABASE_URL}/functions/v1/check-recall-status"
    status, body = _request(
        "POST",
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SERVICE_KEY}",
        },
        body=json.dumps({"meeting_id": meeting_id}).encode(),
        timeout=120,
    )
    return status, body.decode()


# ---------- Polling helpers ----------
@dataclass
class WaitResult:
    succeeded: bool
    final_meeting: dict[str, Any]
    elapsed_s: float


def wait_for_status(meeting_id: str, *, expected: set[str], timeout_s: float = 30, interval_s: float = 1.5) -> WaitResult:
    start = time.time()
    meeting: dict[str, Any] = {}
    while time.time() - start < timeout_s:
        meeting = get_meeting(meeting_id)
        if meeting.get("status") in expected:
            return WaitResult(True, meeting, time.time() - start)
        time.sleep(interval_s)
    return WaitResult(False, meeting, time.time() - start)


def wait_for_not_status(meeting_id: str, *, forbidden: set[str], timeout_s: float = 8, interval_s: float = 1.5) -> WaitResult:
    """Used for negative assertions: verify status STAYS out of a set for the full timeout."""
    start = time.time()
    meeting: dict[str, Any] = {}
    last_status: str | None = None
    while time.time() - start < timeout_s:
        meeting = get_meeting(meeting_id)
        if meeting.get("status") in forbidden:
            return WaitResult(False, meeting, time.time() - start)
        last_status = meeting.get("status")
        time.sleep(interval_s)
    return WaitResult(True, meeting, time.time() - start)
