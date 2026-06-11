"""Real webhook payload shapes captured from prod logs, templated on bot_id."""
from __future__ import annotations

from typing import Any


def recall_event(event: str, bot_id: str, *, code: str | None = None, sub_code: str | None = None, audio_id: str | None = None, recording_id: str | None = None) -> dict[str, Any]:
    """Build a Recall webhook event payload matching their real format.

    event: the event name, e.g. "bot.done", "bot.call_ended", "audio_mixed.done"
    """
    inferred_code = code or event.split(".")[-1]
    data_block: dict[str, Any] = {
        "bot": {"id": bot_id, "metadata": {}},
        "data": {
            "code": inferred_code,
            "sub_code": sub_code,
            "updated_at": "2026-04-24T16:20:34.579934+00:00",
        },
    }
    if event.startswith("audio_mixed"):
        data_block["audio_mixed"] = {"id": audio_id or "00000000-0000-0000-0000-000000000000", "metadata": {}}
        data_block["recording"] = {"id": recording_id or "00000000-0000-0000-0000-000000000000", "metadata": {}}
    return {"data": data_block, "event": event}


# Canned Sarvam transcript long enough to pass the 20-char `noUsableTranscript`
# guard so generateInsights actually calls GPT-4o-mini.
CANNED_SARVAM_TRANSCRIPT = (
    "This is a harness-generated test transcript. The team discussed the "
    "quarterly roadmap, decided to prioritize the new onboarding flow, and "
    "assigned follow-up tasks to engineering for a prototype next week."
)


def sarvam_webhook_success(job_id: str, *, transcript: str = CANNED_SARVAM_TRANSCRIPT) -> dict[str, Any]:
    """Sarvam webhook payload with inline results — bypasses the download step.

    sarvam-webhook checks `payload.results.transcripts[0]` before calling the
    download API, so supplying results inline means we don't need to create a
    real Sarvam job for the harness.
    """
    return {
        "job_id": job_id,
        "job_state": "COMPLETED",
        "results": {
            "transcripts": [
                {
                    "transcript": transcript,
                    "language_code": "en",
                    "diarized_transcript": {
                        "entries": [
                            {
                                "speaker_id": "0",
                                "transcript": transcript,
                                "start_time_seconds": 0.0,
                                "end_time_seconds": 30.0,
                            }
                        ]
                    },
                }
            ]
        },
    }


def sarvam_webhook_failed(job_id: str) -> dict[str, Any]:
    return {"job_id": job_id, "job_state": "FAILED"}


SPEAKER_MAP_TEXT_A = "Welcome everyone, let's review the launch checklist for this sprint and assign the remaining work."
SPEAKER_MAP_TEXT_B = "Thanks Priya. The rollback plan is drafted and I will finish the deployment scripts by Thursday."
SPEAKER_MAP_TEXT_C = "Perfect, sounds good to me."

SPEAKER_MAP_CONFIG = {
    "source": "recall",
    "audio_file_name": "recall-audio.mp3",
    "recall_participants": [
        {"id": 1, "name": "Priya"},
        {"id": 2, "name": "Rahul"},
    ],
    # Priya speaks 0-30s, Rahul 30-60s. The third Sarvam segment (65-68s)
    # falls OUTSIDE both windows → must resolve via nearest-neighbor (Rahul,
    # timeline midpoint 45 vs Priya's 15), never SPEAKER_XX.
    "recall_speaker_timeline": [
        {"speaker": "Priya", "start": 0.0, "end": 30.0},
        {"speaker": "Rahul", "start": 30.0, "end": 60.0},
    ],
}


def sarvam_webhook_speaker_mapping(job_id: str) -> dict[str, Any]:
    """Payload whose diarized segments exercise all three mapping paths:
    timeline overlap (A→Priya), timeline overlap (B→Rahul), and
    nearest-neighbor fallback for an out-of-window segment (C→Rahul)."""
    transcript = f"{SPEAKER_MAP_TEXT_A} {SPEAKER_MAP_TEXT_B} {SPEAKER_MAP_TEXT_C}"
    return {
        "job_id": job_id,
        "job_state": "COMPLETED",
        "results": {
            "transcripts": [
                {
                    "transcript": transcript,
                    "language_code": "en",
                    "diarized_transcript": {
                        "entries": [
                            {"speaker_id": "0", "transcript": SPEAKER_MAP_TEXT_A, "start_time_seconds": 5.0, "end_time_seconds": 25.0},
                            {"speaker_id": "0", "transcript": SPEAKER_MAP_TEXT_B, "start_time_seconds": 35.0, "end_time_seconds": 55.0},
                            {"speaker_id": "1", "transcript": SPEAKER_MAP_TEXT_C, "start_time_seconds": 65.0, "end_time_seconds": 68.0},
                        ]
                    },
                }
            ]
        },
    }


CHUNK_A_TEXT = (
    "First chunk of the harness meeting. The team reviewed the launch checklist "
    "and agreed the beta starts Monday."
)
CHUNK_B_TEXT = (
    "Second chunk of the harness meeting. Priya will draft the announcement "
    "email and Rahul owns the rollback plan."
)


def sarvam_webhook_chunked_success(job_id: str) -> dict[str, Any]:
    """Chunked-job webhook payload using the __harness_inline test seam.

    sarvam-webhook treats results.transcripts as an ORDERED array of per-chunk
    outputs when the meeting's processing_config has split_method=vercel-ffmpeg.
    Timestamps here are chunk-relative; the webhook must offset chunk i by
    i * chunk_seconds (300) when stitching.
    """
    def chunk(text: str) -> dict[str, Any]:
        return {
            "transcript": text,
            "language_code": "en-IN",
            "diarized_transcript": {
                "entries": [
                    {
                        "speaker_id": "0",
                        "transcript": text,
                        "start_time_seconds": 1.0,
                        "end_time_seconds": 29.0,
                    }
                ]
            },
        }

    return {
        "job_id": job_id,
        "job_state": "COMPLETED",
        "__harness_inline": True,
        "results": {"transcripts": [chunk(CHUNK_A_TEXT), chunk(CHUNK_B_TEXT)]},
    }
