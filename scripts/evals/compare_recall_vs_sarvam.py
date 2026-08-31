#!/usr/bin/env python3
"""
Recall-native transcript vs Sarvam pipeline — head-to-head on real prod meetings.

Question: can we drop Sarvam (and the chunker, the callback replays, the
speaker-overlap mapping) and instead take Recall's own transcript, translate it
to English with GPT, and feed that to the unchanged insights prompt?

For each meeting this script:
  1. Reads what prod produced via Sarvam (transcripts + meeting_insights rows).
  2. Downloads Recall's transcript for the same bot (names + timestamps built in).
  3. Translates it to English with gpt-4o-mini, one line per utterance.
  4. Generates insights with the SAME prompt as _shared/insights.ts.
  5. Scores both sides with the existing eval scorers (schema, english,
     speaker_attribution, action_item_precision, summary_faithfulness) plus a
     two-way content-coverage judge between the two transcripts.

Read-only against prod. Writes side-by-side artefacts under --out.

    python3 scripts/evals/compare_recall_vs_sarvam.py                 # 5 most recent completed Recall meetings
    python3 scripts/evals/compare_recall_vs_sarvam.py <id> [<id> ...]
    python3 scripts/evals/compare_recall_vs_sarvam.py --limit 3 --skip-judge
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))
import scorers  # noqa: E402
from run_evals import load_env, sb_get  # noqa: E402

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
MODEL = "gpt-4o-mini"
RECALL_REGION = "https://ap-northeast-1.recall.ai"
DEFAULT_OUT = Path(__file__).parent / "compare-out"


# ---------------------------------------------------------------- helpers

def openai_json(api_key: str, system: str, user: str, max_tokens: int = 4096) -> dict[str, Any]:
    body = {
        "model": MODEL,
        "temperature": 0,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    req = urllib.request.Request(
        OPENAI_URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read())
    return json.loads(data["choices"][0]["message"]["content"])


def recall_get(env: dict[str, str], path: str) -> Any:
    base = env.get("RECALL_API_BASE_URL", RECALL_REGION)
    req = urllib.request.Request(f"{base}/api/v1/{path}", headers={"Authorization": env["RECALL_API_KEY"]})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def clock(seconds: float) -> str:
    total = max(0, int(seconds))
    return f"[{total // 60}:{total % 60:02d}]"


def labeled(segments: list[dict[str, Any]]) -> str:
    return "\n".join(f"{clock(s['start'])} {s['speaker']}: {s['text']}".rstrip() for s in segments)


# ---------------------------------------------------------------- Recall side

def fetch_recall_transcript(env: dict[str, str], bot_id: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    bot = recall_get(env, f"bot/{bot_id}/")
    url = None
    for rec in bot.get("recordings") or []:
        url = ((rec.get("media_shortcuts") or {}).get("transcript") or {}).get("data", {}).get("download_url")
        if url:
            break
    if not url:
        raise RuntimeError("no transcript download_url on bot (expired past 7-day retention?)")
    with urllib.request.urlopen(url, timeout=60) as r:
        data = json.loads(r.read())
    segments = []
    for e in data:
        words = e.get("words") or []
        if not words:
            continue
        segments.append({
            "speaker": (e.get("participant") or {}).get("name") or "Unknown",
            "start": words[0]["start_timestamp"]["relative"],
            "end": words[-1]["end_timestamp"]["relative"],
            "text": " ".join(w["text"] for w in words).strip(),
        })
    provider = ((bot.get("recording_config") or {}).get("transcript") or {}).get("provider") or {}
    return segments, provider


def translate_segments(api_key: str, segments: list[dict[str, Any]], batch: int = 60) -> list[dict[str, Any]]:
    """Line-for-line English rendering. Already-English lines pass through untouched."""
    out: list[dict[str, Any]] = []
    for i in range(0, len(segments), batch):
        chunk = segments[i:i + batch]
        lines = [{"i": k, "speaker": s["speaker"], "text": s["text"]} for k, s in enumerate(chunk)]
        verdict = openai_json(
            api_key,
            "You translate meeting transcripts into natural English. Input lines may be Hindi, Hinglish, "
            "another Indian language, or already English. Translate each line to fluent English, keeping "
            "the meaning, names, numbers and product terms. Lines already in English are returned unchanged. "
            "Return exactly one output per input, same order, same count. "
            'JSON: {"lines": [{"i": <int>, "en": "<english>"}]}',
            json.dumps({"lines": lines}, ensure_ascii=False),
            max_tokens=8192,
        )
        got = {int(l["i"]): l["en"] for l in verdict.get("lines") or [] if "i" in l}
        for k, s in enumerate(chunk):
            en = got.get(k)
            if en is None:  # rare: model dropped a line — translate it alone
                en = openai_json(api_key, 'Translate to English. JSON: {"en": "..."}', s["text"]).get("en", s["text"])
            out.append({**s, "text": en.strip(), "source_text": s["text"]})
    return out


def generate_insights(api_key: str, meeting: dict[str, Any], segments: list[dict[str, Any]]) -> dict[str, Any]:
    """Port of _shared/insights.ts generateInsights — prompt kept verbatim."""
    attendees = [a.get("displayName") or a.get("email") for a in (meeting.get("attendees") or []) if isinstance(a, dict)]
    attendees = [a for a in attendees if a]
    attendees_ctx = (f"\nKnown participants (calendar): {', '.join(attendees)}" if attendees
                     else "\nKnown participants: none on file. Keep SPEAKER_XX labels; do not invent names.")
    dur = meeting.get("duration_seconds") or 0
    duration_line = f"\nDuration: {round(dur / 60)} minutes ({round(dur)} seconds)." if dur > 0 else ""
    prompt = f"""Write a meeting report in the style of Fireflies, Read.ai, and Fathom: scannable recap, notes by topic, owners on commitments, empty lists when nothing was decided.

MEETING: {meeting.get('title')}{duration_line}{attendees_ctx}

TRANSCRIPT (each line is [mm:ss] Speaker: speech — use these times, do not guess):
{labeled(segments)}

RULES
- Only facts from the transcript. No market commentary, no invented strategy.
- "We should" / "maybe" / "let's think about" is NOT a decision. A decision is explicit agreement.
- Owner on an action item only if that person committed or was assigned. Otherwise owner is null.
- due_date only if a time was spoken ("Friday", "by Thursday", "next week"). Never invent a calendar date.
- Prefer an empty list over a padded one. Casual / off-topic chat is not an action item.
- Keep SPEAKER_XX labels unless that speaker's real name is used in the speech itself.
- summary_short: 3–5 sentences. Why this meeting, what changed, what happens next. No agenda restatement.
- summary_detailed: notes grouped by topic (the Fireflies "Notes" section), with speaker names. Not a second recap.
- key_points: 4–8 bullets of what was actually discussed.
- strategic_insights: at most 3, and only if the discussion itself supports an implication. Skip if this was operational/casual.
- speaker_highlights: at most one notable quote per speaker, with why it mattered in this meeting.
- timeline_entries: 4–8 chapter headings covering the meeting in order. timestamp MUST be a number of seconds copied from a [mm:ss] line above.
- sentiment_score: overall tone from -1 (tense/negative) to 1 (warm/positive). Neutral meetings are ~0, not 0.5. Do not report talk time or engagement.

JSON shape:
{{
  "summary_short": "",
  "summary_detailed": "",
  "strategic_insights": [{{"insight": "", "category": "market|risk|opportunity|process"}}],
  "speaker_highlights": [{{"speaker": "", "highlight": "", "context": ""}}],
  "key_points": [""],
  "action_items": [
    {{
      "task": "verb-first commitment",
      "owner": "Name or null",
      "due_date": "as spoken, or null",
      "priority": "high|medium|low",
      "confidence": "high|medium|low",
      "outcome": "what done looks like",
      "source_timestamp": 0
    }}
  ],
  "decisions": [
    {{"decision": "", "owner": "Name or null", "context": ""}}
  ],
  "risks": [""],
  "open_questions": [""],
  "follow_ups": [
    {{"description": "", "assignee": "Name or null", "type": "meeting|research|validation"}}
  ],
  "timeline_entries": [
    {{"timestamp": 0, "type": "topic|question|decision|action|risk", "content": "", "speaker": "Name or null"}}
  ],
  "meeting_metrics": {{
    "sentiment_score": 0
  }}
}}"""
    return openai_json(
        api_key,
        "You are a meeting notetaker. Your notes must be faithful to the transcript, specific, and useful the next morning. "
        "Never invent owners, deadlines, decisions, or names. Empty arrays are correct when the meeting did not produce "
        "that kind of output. Always respond with valid JSON.",
        prompt,
    )


# ---------------------------------------------------------------- judges

def coverage(api_key: str, name_a: str, a: str, name_b: str, b: str) -> dict[str, Any]:
    """What fraction of the concrete facts in A are also present in B?"""
    v = openai_json(
        api_key,
        "Two transcripts of the SAME meeting were produced by different systems. Extract 12-20 concrete, "
        "specific facts from transcript A (names, numbers, decisions, tasks, product details — not vague topics). "
        "For each, decide whether transcript B conveys the same fact (allow paraphrase and translation). "
        'JSON: {"facts": ["..."], "in_b": [bool per fact], "missing_examples": ["<up to 3 facts absent from B>"]}',
        f"TRANSCRIPT A ({name_a}):\n{a[:30000]}\n\nTRANSCRIPT B ({name_b}):\n{b[:30000]}",
    )
    in_b = v.get("in_b") or []
    return {
        "score": (sum(bool(x) for x in in_b) / len(in_b)) if in_b else 0.0,
        "missing": v.get("missing_examples") or [],
    }


def as_text(v: Any) -> str:
    """normalizeInsights flattens topic-keyed summaries in prod; mirror that."""
    if isinstance(v, str):
        return v
    if isinstance(v, list):
        return "\n".join(as_text(x) for x in v)
    if isinstance(v, dict):
        return "\n".join(f"{k}: {as_text(x)}" for k, x in v.items())
    return "" if v is None else str(v)


def make_case(meeting: dict[str, Any], transcript: str, segments: list[dict[str, Any]], insights: dict[str, Any],
              participants: list[str]) -> dict[str, Any]:
    return {
        "id": meeting["id"][:8],
        "duration_seconds": meeting.get("duration_seconds"),
        "participants": participants,
        "transcript": transcript,
        "speakers": segments,
        "insights": {
            "summary": as_text(insights.get("summary_detailed") or insights.get("summary_short") or ""),
            "action_items": insights.get("action_items") or [],
            "decisions": insights.get("decisions") or [],
        },
        "gold": {},
        "expect": {},
    }


def score(case: dict[str, Any], api_key: str, skip_judge: bool) -> dict[str, Any]:
    res = {}
    for fn in (scorers.schema_validity, scorers.english_output, scorers.speaker_attribution):
        r = fn(case)
        res[r["name"]] = r
    if not skip_judge:
        for fn in (scorers.action_item_precision, scorers.summary_faithfulness):
            try:
                r = fn(case, api_key)
            except Exception as e:  # noqa: BLE001
                r = {"name": fn.__name__, "passed": False, "score": 0.0, "detail": f"judge error: {e}"}
            res[r["name"]] = r
    return res


# ---------------------------------------------------------------- main

def compare_one(env: dict[str, str], meeting_id: str, out_dir: Path, skip_judge: bool) -> dict[str, Any]:
    api_key = env["OPENAI_API_KEY"]
    meeting = sb_get(env, f"meetings?id=eq.{meeting_id}&select=*")[0]
    t_rows = sb_get(env, f"transcripts?meeting_id=eq.{meeting_id}&select=*")
    i_rows = sb_get(env, f"meeting_insights?meeting_id=eq.{meeting_id}&select=*")
    if not t_rows:
        raise RuntimeError("no Sarvam transcript row")
    config = meeting.get("processing_config") or {}
    participants = [p.get("name") for p in (config.get("recall_participants") or []) if p.get("name")]

    # --- Sarvam side (as stored by prod)
    sarvam_segments = t_rows[0].get("speakers") or []
    sarvam_text = t_rows[0].get("content") or ""
    sarvam_insights = i_rows[0] if i_rows else {}
    sarvam_case = make_case(meeting, sarvam_text, sarvam_segments, sarvam_insights, participants)

    # --- Recall side (computed here)
    t0 = time.time()
    raw_segments, provider = fetch_recall_transcript(env, meeting["recall_bot_id"])
    t_fetch = time.time() - t0
    t0 = time.time()
    en_segments = translate_segments(api_key, raw_segments)
    t_translate = time.time() - t0
    recall_text = " ".join(s["text"] for s in en_segments)
    t0 = time.time()
    recall_insights = generate_insights(api_key, meeting, en_segments)
    t_insights = time.time() - t0
    recall_case = make_case(meeting, recall_text, en_segments, recall_insights, participants)

    # --- persist side-by-side
    d = out_dir / meeting_id[:8]
    d.mkdir(parents=True, exist_ok=True)
    (d / "sarvam_transcript.txt").write_text(labeled(sarvam_segments) or sarvam_text)
    (d / "recall_transcript_en.txt").write_text(labeled(en_segments))
    (d / "recall_transcript_source.txt").write_text(
        "\n".join(f"{clock(s['start'])} {s['speaker']}: {s['source_text']}" for s in en_segments))
    (d / "sarvam_insights.json").write_text(json.dumps(sarvam_insights, indent=2, ensure_ascii=False))
    (d / "recall_insights.json").write_text(json.dumps(recall_insights, indent=2, ensure_ascii=False))

    # --- score
    s_scores = score(sarvam_case, api_key, skip_judge)
    r_scores = score(recall_case, api_key, skip_judge)
    cov = {}
    if not skip_judge:
        cov["sarvam_facts_in_recall"] = coverage(api_key, "Sarvam", sarvam_case["transcript"], "Recall", recall_case["transcript"])
        cov["recall_facts_in_sarvam"] = coverage(api_key, "Recall", recall_case["transcript"], "Sarvam", sarvam_case["transcript"])

    phantom = sum(1 for s in sarvam_segments if str(s.get("speaker", "")).startswith("SPEAKER_"))
    src_all = " ".join(s["source_text"] for s in en_segments)
    report = {
        "meeting_id": meeting_id,
        "title": meeting.get("title"),
        "duration_seconds": meeting.get("duration_seconds"),
        "participants": participants,
        "recall_provider": provider,
        "stats": {
            "sarvam": {"chars": len(sarvam_text), "segments": len(sarvam_segments),
                        "speakers": sorted({str(s.get("speaker")) for s in sarvam_segments}),
                        "phantom_speaker_segments": phantom,
                        "action_items": len(sarvam_case["insights"]["action_items"]),
                        "decisions": len(sarvam_case["insights"]["decisions"])},
            "recall": {"chars_en": len(recall_text), "segments": len(en_segments),
                        "speakers": sorted({s["speaker"] for s in en_segments}),
                        "source_ascii_ratio": round(sum(c < "\x80" for c in src_all) / max(1, len(src_all)), 3),
                        "action_items": len(recall_case["insights"]["action_items"]),
                        "decisions": len(recall_case["insights"]["decisions"]),
                        "seconds": {"fetch": round(t_fetch, 1), "translate": round(t_translate, 1), "insights": round(t_insights, 1)}},
        },
        "scores": {"sarvam": s_scores, "recall": r_scores},
        "coverage": cov,
    }
    (d / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    return report


def print_report(r: dict[str, Any]) -> None:
    print(f"\n=== {r['title']}  ({r['meeting_id'][:8]}, {round((r['duration_seconds'] or 0) / 60)} min)")
    s, c = r["stats"]["sarvam"], r["stats"]["recall"]
    print(f"  Sarvam : {s['chars']:>6} chars, {s['segments']:>4} segs, speakers={s['speakers']}, phantom={s['phantom_speaker_segments']}, "
          f"AI={s['action_items']} dec={s['decisions']}")
    print(f"  Recall : {c['chars_en']:>6} chars, {c['segments']:>4} segs, speakers={c['speakers']}, source ascii={c['source_ascii_ratio']}, "
          f"AI={c['action_items']} dec={c['decisions']}  t={c['seconds']}")
    names = sorted(set(r["scores"]["sarvam"]) | set(r["scores"]["recall"]))
    print(f"  {'eval':<24}{'sarvam':>10}{'recall':>10}")
    for n in names:
        a = r["scores"]["sarvam"].get(n, {}); b = r["scores"]["recall"].get(n, {})
        fa = f"{a.get('score', 0):.2f}{'✓' if a.get('passed') else '✗'}" if a else "-"
        fb = f"{b.get('score', 0):.2f}{'✓' if b.get('passed') else '✗'}" if b else "-"
        print(f"  {n:<24}{fa:>10}{fb:>10}")
    for k, v in (r.get("coverage") or {}).items():
        print(f"  {k:<32}{v['score']:.2f}" + (f"   missing e.g. {v['missing'][0][:70]!r}" if v["missing"] else ""))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("meeting_ids", nargs="*")
    ap.add_argument("--limit", type=int, default=5, help="when no ids given: N most recent completed Recall meetings")
    ap.add_argument("--skip-judge", action="store_true", help="deterministic checks only (no judge / coverage calls)")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    env = load_env()

    ids = args.meeting_ids
    if not ids:
        q = ("meetings?select=id&status=eq.completed&recall_bot_id=not.is.null"
             f"&title=not.ilike.*harness*&order=created_at.desc&limit={args.limit}")
        ids = [m["id"] for m in sb_get(env, q)]
    reports = []
    for mid in ids:
        try:
            r = compare_one(env, mid, args.out, args.skip_judge)
        except Exception as e:  # noqa: BLE001
            print(f"\n=== {mid[:8]}: SKIPPED — {e}")
            continue
        reports.append(r)
        print_report(r)

    if reports and not args.skip_judge:
        def avg(side: str, name: str) -> float:
            vals = [r["scores"][side][name]["score"] for r in reports if name in r["scores"][side]]
            return sum(vals) / len(vals) if vals else 0.0
        print("\n=== AVERAGES over", len(reports), "meetings")
        for n in ("english_output", "speaker_attribution", "action_item_precision", "summary_faithfulness"):
            print(f"  {n:<24}{avg('sarvam', n):>10.2f}{avg('recall', n):>10.2f}")
        for k in ("sarvam_facts_in_recall", "recall_facts_in_sarvam"):
            vals = [r["coverage"][k]["score"] for r in reports if k in r.get("coverage", {})]
            if vals:
                print(f"  {k:<32}{sum(vals) / len(vals):.2f}")
    print(f"\nSide-by-side artefacts: {args.out}")
    (args.out / "summary.json").write_text(json.dumps(reports, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
