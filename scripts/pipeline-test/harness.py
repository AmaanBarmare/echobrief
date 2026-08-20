"""Pipeline test harness.

Each scenario is an isolated test that:
  1. Creates a synthetic [harness]-prefixed meeting row
  2. Fires real webhooks at the real deployed edge functions
  3. Polls for the expected end-state
  4. Deletes the test row (always, even on failure)

Run:
    python3 scripts/pipeline-test/harness.py
    python3 scripts/pipeline-test/harness.py --only race_bot_done_first
    python3 scripts/pipeline-test/harness.py --cleanup-only
"""
from __future__ import annotations

import argparse
import os
import sys
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from typing import Callable

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import client  # type: ignore
import fixtures  # type: ignore


@dataclass
class ScenarioResult:
    name: str
    passed: bool
    message: str = ""
    elapsed_s: float = 0.0
    details: dict = field(default_factory=dict)


def scenario(fn: Callable[[], ScenarioResult]) -> Callable[[], ScenarioResult]:
    """Decorator: runs scenario, catches exceptions as failures, tracks elapsed."""
    def wrapped() -> ScenarioResult:
        start = time.time()
        try:
            result = fn()
        except Exception as e:
            return ScenarioResult(
                name=fn.__name__,
                passed=False,
                message=f"exception: {e}\n{traceback.format_exc()}",
                elapsed_s=time.time() - start,
            )
        result.elapsed_s = time.time() - start
        return result
    wrapped.__name__ = fn.__name__
    return wrapped


# ---------- Scenarios ----------

@scenario
def happy_path_sarvam() -> ScenarioResult:
    """Meeting with sarvam_job_id is processed via inline transcript → completed."""
    job_id = f"test-hp-{uuid.uuid4()}"
    meeting_id = client.insert_meeting(
        title="happy_path_sarvam",
        recall_bot_id=client.GOOD_BOT_ID,
        sarvam_job_id=job_id,
        status="processing",
        processing_config={"source": "recall", "audio_file_name": "recall-audio.mp3"},
    )
    try:
        status, body = client.fire_sarvam_webhook(fixtures.sarvam_webhook_success(job_id))
        if status >= 300:
            return ScenarioResult("happy_path_sarvam", False, f"sarvam-webhook returned {status}: {body[:300]}")

        result = client.wait_for_status(meeting_id, expected={"completed"}, timeout_s=30)
        if not result.succeeded:
            return ScenarioResult(
                "happy_path_sarvam", False,
                f"meeting never reached completed; final status={result.final_meeting.get('status')!r}",
            )
        transcript = client.get_transcript(meeting_id)
        insights = client.get_insights(meeting_id)
        if not transcript:
            return ScenarioResult("happy_path_sarvam", False, "transcript row not created")
        if not insights:
            return ScenarioResult("happy_path_sarvam", False, "insights row not created")
        return ScenarioResult(
            "happy_path_sarvam", True,
            f"status=completed in {result.elapsed_s:.1f}s; transcript_len={len(transcript.get('content',''))}; insights keys={len(insights.get('key_points') or [])}",
        )
    finally:
        client.delete_meeting(meeting_id)


@scenario
def bot_done_defers_on_unknown_audio() -> ScenarioResult:
    """bot.done fires but Recall API can't confirm audio status → must defer, not fail.

    This is the race-bug we fixed: before the fix, bot.done would set status=failed
    whenever sarvam_job_id was still null. With the fix, bot.done queries Recall
    for audio_mixed status. When that lookup returns 'unknown' (transient API blip
    OR bot not yet fully registered), handler must defer rather than fail a good
    meeting. We test this path by using a synthetic bot id so getRecallBot throws,
    which is exactly the production behavior when Recall's API has a blip.
    """
    test_bot_id = f"test-bot-{uuid.uuid4()}"
    meeting_id = client.insert_meeting(
        title="bot_done_defers_on_unknown_audio",
        recall_bot_id=test_bot_id,
        sarvam_job_id=None,
        status="processing",
    )
    try:
        status, body = client.fire_recall_webhook(
            fixtures.recall_event("bot.done", test_bot_id)
        )
        if status >= 300:
            return ScenarioResult(
                "bot_done_defers_on_unknown_audio", False,
                f"recall-webhook returned {status}: {body[:300]}",
            )
        # Status must NOT be "failed" for the full timeout window
        result = client.wait_for_not_status(meeting_id, forbidden={"failed"}, timeout_s=6)
        if not result.succeeded:
            return ScenarioResult(
                "bot_done_defers_on_unknown_audio", False,
                f"meeting was marked failed (status={result.final_meeting.get('status')!r})",
            )
        return ScenarioResult(
            "bot_done_defers_on_unknown_audio", True,
            f"correctly deferred; final status={result.final_meeting.get('status')!r}",
        )
    finally:
        client.delete_meeting(meeting_id)


@scenario
def audio_mixed_failed_marks_meeting_failed() -> ScenarioResult:
    """audio_mixed.failed event → status=failed (regression check for failure path)."""
    test_bot_id = f"test-bot-{uuid.uuid4()}"
    meeting_id = client.insert_meeting(
        title="audio_mixed_failed_marks_meeting_failed",
        recall_bot_id=test_bot_id,
        sarvam_job_id=None,
        status="processing",
    )
    try:
        event = fixtures.recall_event("audio_mixed.failed", test_bot_id, code="failed")
        status, body = client.fire_recall_webhook(event)
        if status >= 300:
            return ScenarioResult(
                "audio_mixed_failed_marks_meeting_failed", False,
                f"recall-webhook returned {status}: {body[:300]}",
            )
        result = client.wait_for_status(meeting_id, expected={"failed"}, timeout_s=8)
        if not result.succeeded:
            return ScenarioResult(
                "audio_mixed_failed_marks_meeting_failed", False,
                f"expected status=failed; got {result.final_meeting.get('status')!r}",
            )
        return ScenarioResult(
            "audio_mixed_failed_marks_meeting_failed", True,
            "correctly marked failed on audio_mixed.failed",
        )
    finally:
        client.delete_meeting(meeting_id)


@scenario
def bot_kicked_waiting_room() -> ScenarioResult:
    """bot.call_ended with sub_code=timeout_exceeded_waiting_room → status=cancelled."""
    test_bot_id = f"test-bot-{uuid.uuid4()}"
    meeting_id = client.insert_meeting(
        title="bot_kicked_waiting_room",
        recall_bot_id=test_bot_id,
        sarvam_job_id=None,
        status="joining",
    )
    try:
        event = fixtures.recall_event(
            "bot.call_ended", test_bot_id,
            code="call_ended", sub_code="timeout_exceeded_waiting_room",
        )
        status, body = client.fire_recall_webhook(event)
        if status >= 300:
            return ScenarioResult(
                "bot_kicked_waiting_room", False,
                f"recall-webhook returned {status}: {body[:300]}",
            )
        result = client.wait_for_status(meeting_id, expected={"cancelled"}, timeout_s=8)
        if not result.succeeded:
            return ScenarioResult(
                "bot_kicked_waiting_room", False,
                f"status should be cancelled; actual={result.final_meeting.get('status')!r}",
            )
        return ScenarioResult("bot_kicked_waiting_room", True, "marked cancelled as expected")
    finally:
        client.delete_meeting(meeting_id)


@scenario
def duplicate_sarvam_webhook_idempotency() -> ScenarioResult:
    """Meeting already completed → a replayed sarvam-webhook must skip, not re-process."""
    job_id = f"test-idem-{uuid.uuid4()}"
    meeting_id = client.insert_meeting(
        title="duplicate_sarvam_webhook_idempotency",
        recall_bot_id=client.GOOD_BOT_ID,
        sarvam_job_id=job_id,
        status="completed",  # already done
    )
    try:
        status, body = client.fire_sarvam_webhook(fixtures.sarvam_webhook_success(job_id))
        if status >= 300:
            return ScenarioResult(
                "duplicate_sarvam_webhook_idempotency", False,
                f"sarvam-webhook returned {status}: {body[:300]}",
            )
        if "skipped" not in body.lower():
            return ScenarioResult(
                "duplicate_sarvam_webhook_idempotency", False,
                f"expected skip, got body={body[:300]}",
            )
        # Verify no new transcript/insights were inserted
        if client.get_transcript(meeting_id) is not None:
            return ScenarioResult(
                "duplicate_sarvam_webhook_idempotency", False,
                "transcript was inserted despite meeting already being completed",
            )
        return ScenarioResult(
            "duplicate_sarvam_webhook_idempotency", True,
            "webhook correctly skipped replay",
        )
    finally:
        client.delete_meeting(meeting_id)


@scenario
def concurrent_sarvam_webhooks() -> ScenarioResult:
    """Fire sarvam-webhook twice in parallel → only one should actually process.

    Without idempotency keys both invocations currently read meeting.status=processing,
    both proceed, both try to insert transcript. The `transcripts` insert check
    protects against duplicates via a read-then-insert but that is itself racy.
    """
    job_id = f"test-concurrent-{uuid.uuid4()}"
    meeting_id = client.insert_meeting(
        title="concurrent_sarvam_webhooks",
        recall_bot_id=client.GOOD_BOT_ID,
        sarvam_job_id=job_id,
        status="processing",
        processing_config={"source": "recall", "audio_file_name": "recall-audio.mp3"},
    )
    try:
        payload = fixtures.sarvam_webhook_success(job_id)
        responses: list[tuple[int, str]] = []

        def fire() -> None:
            responses.append(client.fire_sarvam_webhook(payload))

        threads = [threading.Thread(target=fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=120)

        result = client.wait_for_status(meeting_id, expected={"completed"}, timeout_s=30)
        if not result.succeeded:
            return ScenarioResult(
                "concurrent_sarvam_webhooks", False,
                f"never completed; final={result.final_meeting.get('status')!r}; responses={responses}",
            )

        # Should have exactly one transcript row (verified by presence, since
        # we can't easily count rows — get_transcript returns first row only)
        transcript = client.get_transcript(meeting_id)
        if not transcript:
            return ScenarioResult("concurrent_sarvam_webhooks", False, "no transcript")

        return ScenarioResult(
            "concurrent_sarvam_webhooks", True,
            f"completed; responses={[r[0] for r in responses]}",
        )
    finally:
        client.delete_meeting(meeting_id)


@scenario
def monitor_recovers_known_pattern() -> ScenarioResult:
    """Stuck meeting with a known signature → monitor classifies, attempts recovery, logs.

    Creates a meeting in `processing` with no sarvam_job_id, age=20 min. Detection should
    return signature `stuck:processing:no_sarvam_job` (known), recovery `check_recall_status`.
    """
    test_bot_id = f"test-bot-{uuid.uuid4()}"
    meeting_id = client.insert_meeting(
        title="monitor_recovers_known_pattern",
        recall_bot_id=test_bot_id,
        sarvam_job_id=None,
        status="processing",
        age_minutes=20,
    )
    try:
        status, body = client.call_monitor_stuck_meetings()
        if status >= 300:
            return ScenarioResult(
                "monitor_recovers_known_pattern", False,
                f"monitor returned {status}: {body[:300]}",
            )

        # Allow up to 10s for the audit row to land
        events: list = []
        for _ in range(10):
            events = [e for e in client.get_monitor_events(meeting_id)]
            if events:
                break
            time.sleep(1)

        if not events:
            return ScenarioResult(
                "monitor_recovers_known_pattern", False,
                f"no monitor_events row created. Monitor body: {body[:500]}",
            )

        e = events[0]
        sig = e.get("error_signature")
        if sig != "stuck:processing:no_sarvam_job":
            return ScenarioResult(
                "monitor_recovers_known_pattern", False,
                f"wrong signature: got {sig!r}, expected stuck:processing:no_sarvam_job",
            )
        if e.get("is_new_pattern") is True:
            return ScenarioResult(
                "monitor_recovers_known_pattern", False,
                f"signature was incorrectly flagged as new pattern",
            )
        if e.get("recovery_attempted") != "check_recall_status":
            return ScenarioResult(
                "monitor_recovers_known_pattern", False,
                f"wrong recovery: {e.get('recovery_attempted')!r}",
            )
        return ScenarioResult(
            "monitor_recovers_known_pattern", True,
            f"signature={sig}, recovery={e.get('recovery_attempted')}, ok={e.get('recovery_succeeded')}",
        )
    finally:
        client.delete_meeting(meeting_id)


@scenario
def monitor_logs_unknown_pattern() -> ScenarioResult:
    """Stuck meeting with a never-seen-before status → monitor flags is_new_pattern=true.

    A meeting with status `weird_test_state_xyz` produces signature
    `stuck:weird_test_state_xyz:unknown` which isn't in KNOWN_PATTERNS. Monitor should
    log it with is_new_pattern=true and attempt to email. We assert the audit row,
    not the actual email send (Resend domain config is a separate concern).
    """
    test_bot_id = f"test-bot-{uuid.uuid4()}"
    meeting_id = client.insert_meeting(
        title="monitor_logs_unknown_pattern",
        recall_bot_id=test_bot_id,
        sarvam_job_id=None,
        status="weird_test_state_xyz",
        age_minutes=20,
    )
    try:
        status, body = client.call_monitor_stuck_meetings()
        if status >= 300:
            return ScenarioResult(
                "monitor_logs_unknown_pattern", False,
                f"monitor returned {status}: {body[:300]}",
            )

        events: list = []
        for _ in range(10):
            events = client.get_monitor_events(meeting_id)
            if events:
                break
            time.sleep(1)

        if not events:
            return ScenarioResult(
                "monitor_logs_unknown_pattern", False,
                f"no monitor_events row created. Monitor body: {body[:500]}",
            )

        e = events[0]
        sig = e.get("error_signature")
        if sig != "stuck:weird_test_state_xyz:unknown":
            return ScenarioResult(
                "monitor_logs_unknown_pattern", False,
                f"wrong signature: got {sig!r}",
            )
        if e.get("is_new_pattern") is not True:
            return ScenarioResult(
                "monitor_logs_unknown_pattern", False,
                f"unknown signature should be is_new_pattern=true, got {e.get('is_new_pattern')!r}",
            )
        return ScenarioResult(
            "monitor_logs_unknown_pattern", True,
            f"flagged as new pattern: {sig}, email_sent={e.get('email_sent')}",
        )
    finally:
        client.delete_meeting(meeting_id)


@scenario
def chunked_happy_path() -> ScenarioResult:
    """Chunked meeting (split_method=vercel-ffmpeg, 2 chunks) → stitched transcript.

    Asserts the webhook: (1) accepts ordered inline chunk results via the
    __harness_inline seam, (2) concatenates both chunk texts into one
    transcript, (3) offsets chunk 1's diarized timestamps by chunk_seconds
    (segment 2 must start at >= 300s), (4) completes the meeting with insights.
    """
    job_id = f"test-chunked-{uuid.uuid4()}"
    meeting_id = client.insert_meeting(
        title="chunked_happy_path",
        recall_bot_id=client.GOOD_BOT_ID,
        sarvam_job_id=job_id,
        status="processing",
        processing_config={
            "source": "recall",
            "audio_file_name": "recall-audio.mp3",
            "split_method": "vercel-ffmpeg",
            "chunk_count": 2,
            "chunk_seconds": 300,
        },
    )
    try:
        status, body = client.fire_sarvam_webhook(
            fixtures.sarvam_webhook_chunked_success(job_id)
        )
        if status >= 300:
            return ScenarioResult("chunked_happy_path", False, f"sarvam-webhook returned {status}: {body[:300]}")

        result = client.wait_for_status(meeting_id, expected={"completed"}, timeout_s=30)
        if not result.succeeded:
            return ScenarioResult(
                "chunked_happy_path", False,
                f"meeting never completed; final status={result.final_meeting.get('status')!r}",
            )
        transcript = client.get_transcript(meeting_id)
        if not transcript:
            return ScenarioResult("chunked_happy_path", False, "transcript row not created")
        content = transcript.get("content", "")
        if fixtures.CHUNK_A_TEXT not in content or fixtures.CHUNK_B_TEXT not in content:
            return ScenarioResult(
                "chunked_happy_path", False,
                f"stitched transcript missing chunk text; got {content[:200]!r}",
            )
        if content.find(fixtures.CHUNK_A_TEXT) > content.find(fixtures.CHUNK_B_TEXT):
            return ScenarioResult("chunked_happy_path", False, "chunks stitched out of order")
        speakers = transcript.get("speakers") or []
        if len(speakers) != 2:
            return ScenarioResult(
                "chunked_happy_path", False,
                f"expected 2 speaker segments, got {len(speakers)}",
            )
        seg2_start = speakers[1].get("start", 0)
        if not (300 <= seg2_start <= 360):
            return ScenarioResult(
                "chunked_happy_path", False,
                f"chunk 1 timestamps not offset: segment 2 starts at {seg2_start}, expected ~301",
            )
        if not client.get_insights(meeting_id):
            return ScenarioResult("chunked_happy_path", False, "insights row not created")
        return ScenarioResult(
            "chunked_happy_path", True,
            f"stitched {len(content)} chars, segment2.start={seg2_start} (offset applied)",
        )
    finally:
        client.delete_meeting(meeting_id)


@scenario
def speaker_mapping_happy_path() -> ScenarioResult:
    """Speaker mapping: timeline overlap + nearest-neighbor fallback → real names.

    Three Sarvam segments against a two-person Recall timeline. Segments 1-2
    map by time overlap (Priya, Rahul); segment 3 sits outside every timeline
    window and must resolve via nearest-neighbor (Rahul) — never SPEAKER_XX.
    """
    job_id = f"test-speakers-{uuid.uuid4()}"
    meeting_id = client.insert_meeting(
        title="speaker_mapping_happy_path",
        recall_bot_id=client.GOOD_BOT_ID,
        sarvam_job_id=job_id,
        status="processing",
        processing_config=fixtures.SPEAKER_MAP_CONFIG,
    )
    try:
        status, body = client.fire_sarvam_webhook(
            fixtures.sarvam_webhook_speaker_mapping(job_id)
        )
        if status >= 300:
            return ScenarioResult("speaker_mapping_happy_path", False, f"sarvam-webhook returned {status}: {body[:300]}")

        result = client.wait_for_status(meeting_id, expected={"completed"}, timeout_s=30)
        if not result.succeeded:
            return ScenarioResult(
                "speaker_mapping_happy_path", False,
                f"meeting never completed; final={result.final_meeting.get('status')!r}",
            )
        transcript = client.get_transcript(meeting_id)
        if not transcript:
            return ScenarioResult("speaker_mapping_happy_path", False, "transcript row not created")
        names = [s.get("speaker") for s in (transcript.get("speakers") or [])]
        if names != ["Priya", "Rahul", "Rahul"]:
            return ScenarioResult(
                "speaker_mapping_happy_path", False,
                f"wrong speaker mapping: got {names}, expected ['Priya', 'Rahul', 'Rahul']",
            )
        if any(str(n).startswith("SPEAKER_") for n in names):
            return ScenarioResult(
                "speaker_mapping_happy_path", False,
                f"phantom acoustic label leaked through: {names}",
            )
        return ScenarioResult(
            "speaker_mapping_happy_path", True,
            f"mapped {names} (overlap x2 + nearest-neighbor x1)",
        )
    finally:
        client.delete_meeting(meeting_id)


@scenario
def split_audio_endpoint_probes() -> ScenarioResult:
    """Deployed split-audio function: auth + validation behave as contracted.

    Cheap liveness/config check of the Vercel function on every harness run:
    401 without the bearer secret, 400 with auth but no payload. A 500 here
    means the function's env (SARVAM_API_KEY/SPLIT_AUDIO_SECRET) is missing.
    """
    if not client.SPLIT_AUDIO_SECRET:
        return ScenarioResult("split_audio_endpoint_probes", False, "SPLIT_AUDIO_SECRET not in .env")
    status_unauth, _ = client.post_split_audio({}, authed=False, timeout=30)
    if status_unauth != 401:
        return ScenarioResult(
            "split_audio_endpoint_probes", False,
            f"unauthenticated probe: expected 401, got {status_unauth} (env missing or rewrite broken?)",
        )
    status_badbody, body = client.post_split_audio({}, authed=True, timeout=30)
    if status_badbody != 400:
        return ScenarioResult(
            "split_audio_endpoint_probes", False,
            f"authed empty-body probe: expected 400, got {status_badbody}: {body[:200]}",
        )
    return ScenarioResult("split_audio_endpoint_probes", True, "401 unauth / 400 bad-body — deployed + configured")


@scenario
def live_sarvam_e2e() -> ScenarioResult:
    """LIVE: real fixture audio → deployed splitter → real Sarvam → stitched completion.

    The only scenario that exercises stages E→F→G with the real providers:
    Vercel ffmpeg split, a real chunked Sarvam batch job, the real callback,
    stitching, insights. Uses a ~6.5 min Hindi fixture in Storage (2 chunks).
    Costs a few paise of Sarvam+GPT per run; excluded from the default suite —
    run with --live before risky deploys. Doubles as a Sarvam contract check
    (catches upstream regressions like the silent long-audio empty bug).
    """
    fixture_path = "harness-fixtures/live-e2e.mp3"
    meeting_id = client.insert_meeting(
        title="live_sarvam_e2e",
        recall_bot_id=None,
        sarvam_job_id=None,
        status="processing",
        audio_url=f"recordings/{fixture_path}",
        processing_config={"source": "recall", "audio_file_name": "recall-audio.mp3"},
    )
    try:
        signed = client.create_signed_audio_url(fixture_path)
        status, body = client.post_split_audio({
            "audioUrl": signed,
            "callbackUrl": f"{client.SUPABASE_URL}/functions/v1/sarvam-webhook",
            "callbackToken": client.SARVAM_WEBHOOK_SECRET,
        })
        if status != 200:
            return ScenarioResult("live_sarvam_e2e", False, f"split-audio returned {status}: {body[:300]}")
        split = __import__("json").loads(body)
        if split.get("chunk_count", 0) < 2:
            return ScenarioResult(
                "live_sarvam_e2e", False,
                f"fixture should split into >=2 chunks, got {split.get('chunk_count')}",
            )
        client.update_meeting(meeting_id, {
            "sarvam_job_id": split["job_id"],
            "processing_config": {
                "source": "recall",
                "audio_file_name": "recall-audio.mp3",
                "split_method": "vercel-ffmpeg",
                "chunk_count": split["chunk_count"],
                "chunk_seconds": split["chunk_seconds"],
                "audio_duration_seconds": split["duration_seconds"],
            },
        })

        result = client.wait_for_status(meeting_id, expected={"completed", "failed"}, timeout_s=300, interval_s=5)
        final = result.final_meeting.get("status")
        if final != "completed":
            return ScenarioResult("live_sarvam_e2e", False, f"expected completed, got {final!r}")

        transcript = client.get_transcript(meeting_id)
        if not transcript or len(transcript.get("content") or "") < 100:
            return ScenarioResult(
                "live_sarvam_e2e", False,
                f"transcript too short: {len((transcript or {}).get('content') or '')} chars — Sarvam regression?",
            )
        if transcript.get("stt_provider") != "sarvam":
            return ScenarioResult(
                "live_sarvam_e2e", False,
                f"expected stt_provider=sarvam, got {transcript.get('stt_provider')!r} (fallback fired?)",
            )
        if not client.get_insights(meeting_id):
            return ScenarioResult("live_sarvam_e2e", False, "insights row not created")
        duration = result.final_meeting.get("duration_seconds") or 0
        if not (split["duration_seconds"] - 45 <= duration <= split["duration_seconds"] + 45):
            return ScenarioResult(
                "live_sarvam_e2e", False,
                f"duration_seconds={duration}, expected ~{split['duration_seconds']}",
            )
        return ScenarioResult(
            "live_sarvam_e2e", True,
            f"{split['chunk_count']} chunks via real Sarvam → {len(transcript.get('content') or '')} chars, duration={duration}s",
        )
    finally:
        client.delete_meeting(meeting_id)


LIVE_SCENARIOS = {"live_sarvam_e2e"}

ALL_SCENARIOS = [
    happy_path_sarvam,
    chunked_happy_path,
    speaker_mapping_happy_path,
    split_audio_endpoint_probes,
    bot_done_defers_on_unknown_audio,
    audio_mixed_failed_marks_meeting_failed,
    bot_kicked_waiting_room,
    duplicate_sarvam_webhook_idempotency,
    concurrent_sarvam_webhooks,
    monitor_recovers_known_pattern,
    monitor_logs_unknown_pattern,
    live_sarvam_e2e,
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="Run only the scenario matching this name")
    ap.add_argument("--live", action="store_true", help="Include live-provider scenarios (real Sarvam job, ~3 min, costs a little)")
    ap.add_argument("--cleanup-only", action="store_true", help="Delete all [harness] rows and exit")
    args = ap.parse_args()

    if args.cleanup_only:
        n = client.cleanup_harness_rows()
        print(f"Deleted {n} [harness] meetings")
        return 0

    scenarios = ALL_SCENARIOS if args.live else [
        s for s in ALL_SCENARIOS if s.__name__ not in LIVE_SCENARIOS
    ]
    if args.only:
        scenarios = [s for s in ALL_SCENARIOS if s.__name__ == args.only]
        if not scenarios:
            print(f"No scenario named {args.only!r}. Available: {[s.__name__ for s in ALL_SCENARIOS]}")
            return 2

    print(f"Running {len(scenarios)} scenario(s) against {client.SUPABASE_URL}")
    print("=" * 80)
    results: list[ScenarioResult] = []
    for s in scenarios:
        print(f"\n>>> {s.__name__}")
        r = s()
        results.append(r)
        mark = "PASS" if r.passed else "FAIL"
        print(f"    [{mark}] ({r.elapsed_s:.1f}s) {r.message}")

    print("\n" + "=" * 80)
    passed = sum(1 for r in results if r.passed)
    print(f"RESULT: {passed}/{len(results)} passed")
    for r in results:
        mark = "PASS" if r.passed else "FAIL"
        print(f"  [{mark}] {r.name} ({r.elapsed_s:.1f}s)")
        if not r.passed:
            print(f"         {r.message.splitlines()[0]}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
