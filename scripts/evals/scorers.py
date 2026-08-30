"""Eval scorers for EchoBrief output quality.

Two kinds:
  - Deterministic scorers: pure-python checks (schema, language, timestamps,
    speaker labels). Fast, free, no API calls.
  - LLM-judge scorers: gpt-4o-mini grades semantic quality (action-item
    recall/precision, summary faithfulness, decision accuracy) and returns
    strict JSON.

Every scorer returns: {"name", "passed": bool, "score": float 0..1, "detail": str}
"""
from __future__ import annotations

import json
import re
import urllib.request
from typing import Any

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
JUDGE_MODEL = "gpt-4o-mini"


def _result(name: str, passed: bool, score: float, detail: str) -> dict[str, Any]:
    return {"name": name, "passed": passed, "score": round(score, 3), "detail": detail}


# ---------- Deterministic scorers ----------

def schema_validity(case: dict[str, Any]) -> dict[str, Any]:
    """Insights must have a non-empty summary and list-typed action_items/decisions."""
    ins = case.get("insights") or {}
    problems = []
    if not isinstance(ins.get("summary"), str) or len(ins.get("summary", "").strip()) < 20:
        problems.append("summary missing/too short")
    if not isinstance(ins.get("action_items"), list):
        problems.append("action_items not a list")
    if not isinstance(ins.get("decisions"), list):
        problems.append("decisions not a list")
    ok = not problems
    return _result("schema_validity", ok, 1.0 if ok else 0.0, "; ".join(problems) or "all required fields present")


def english_output(case: dict[str, Any]) -> dict[str, Any]:
    """Translate mode must output English: transcript+summary should be largely ASCII."""
    text = (case.get("transcript") or "") + " " + ((case.get("insights") or {}).get("summary") or "")
    if not text.strip():
        return _result("english_output", False, 0.0, "no text to check")
    ascii_ratio = sum(1 for c in text if ord(c) < 128) / len(text)
    ok = ascii_ratio >= 0.95
    return _result("english_output", ok, ascii_ratio, f"ascii_ratio={ascii_ratio:.3f}")


def stitch_integrity(case: dict[str, Any]) -> dict[str, Any]:
    """Chunk-stitch sanity: segments time-ordered, non-negative, non-empty text,
    and (if duration known) last timestamp within duration + slack."""
    segs = case.get("speakers") or []
    if not segs:
        return _result("stitch_integrity", True, 1.0, "no segments (skipped)")
    problems = []
    last_start = -1.0
    for i, s in enumerate(segs):
        start, end = float(s.get("start", 0)), float(s.get("end", 0))
        if start < 0 or end < 0:
            problems.append(f"seg{i} negative time")
        if start < last_start:
            problems.append(f"seg{i} out of order ({start} < {last_start})")
        last_start = start
        if not (s.get("text") or "").strip():
            problems.append(f"seg{i} empty text")
    dur = case.get("duration_seconds")
    if dur and segs:
        last_end = max(float(s.get("end", 0)) for s in segs)
        if last_end > dur * 1.15 + 60:
            problems.append(f"last_end {last_end:.0f}s exceeds duration {dur}s")
    ok = not problems
    return _result("stitch_integrity", ok, 1.0 if ok else 0.0, "; ".join(problems[:4]) or f"{len(segs)} segments ordered & non-empty")


def speaker_attribution(case: dict[str, Any]) -> dict[str, Any]:
    """When real participant names are known, no segment should keep a SPEAKER_XX label."""
    segs = case.get("speakers") or []
    participants = case.get("participants") or []
    if not segs or not participants:
        return _result("speaker_attribution", True, 1.0, "no segments/participants (skipped)")
    phantom = [s for s in segs if re.match(r"^SPEAKER_\d+$", str(s.get("speaker", "")))]
    ratio = 1 - len(phantom) / len(segs)
    ok = len(phantom) == 0
    return _result("speaker_attribution", ok, ratio, f"{len(phantom)}/{len(segs)} segments with phantom SPEAKER_XX labels")


# ---------- LLM-judge scorers ----------

def _judge(api_key: str, system: str, user: str) -> dict[str, Any]:
    body = {
        "model": JUDGE_MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        OPENAI_URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read())
    return json.loads(data["choices"][0]["message"]["content"])


def action_item_recall(case: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Of the GOLD action items, how many appear in the generated ones? Gate >= 0.7."""
    gold = (case.get("gold") or {}).get("action_items") or []
    generated = (case.get("insights") or {}).get("action_items") or []
    if not gold:
        return _result("action_item_recall", True, 1.0, "no gold action items (skipped)")
    verdict = _judge(
        api_key,
        "You grade meeting-notes systems. For each REFERENCE action item, decide if it is "
        "semantically covered by any GENERATED item (same task + owner, wording may differ). "
        'Return JSON: {"covered": [bool per reference item], "reasoning": "<brief>"}',
        f"REFERENCE:\n{json.dumps(gold, indent=1)}\n\nGENERATED:\n{json.dumps(generated, indent=1)}",
    )
    covered = verdict.get("covered") or []
    score = sum(bool(c) for c in covered) / len(gold)
    return _result("action_item_recall", score >= 0.7, score, f"{sum(bool(c) for c in covered)}/{len(gold)} gold items covered")


def action_item_precision(case: dict[str, Any], api_key: str) -> dict[str, Any]:
    """No generated action item may be hallucinated: each must be grounded in the transcript. Gate = 1.0."""
    generated = (case.get("insights") or {}).get("action_items") or []
    transcript = case.get("transcript") or ""
    if not generated:
        return _result("action_item_precision", True, 1.0, "no generated action items (skipped)")
    verdict = _judge(
        api_key,
        "You are a strict fact-checker for meeting notes. For each ACTION ITEM, decide if the "
        "meeting TRANSCRIPT actually supports it (the task was really discussed/assigned). "
        "Mark unsupported/invented items as false. "
        'Return JSON: {"grounded": [bool per item], "reasoning": "<brief>"}',
        f"TRANSCRIPT:\n{transcript[:24000]}\n\nACTION ITEMS:\n{json.dumps(generated, indent=1)}",
    )
    grounded = verdict.get("grounded") or []
    score = sum(bool(g) for g in grounded) / len(generated)
    return _result("action_item_precision", score >= 0.999, score,
                   f"{len(generated) - sum(bool(g) for g in grounded)} hallucinated of {len(generated)}")


def summary_faithfulness(case: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Every factual claim in the summary must be grounded in the transcript. Gate >= 0.9."""
    summary = (case.get("insights") or {}).get("summary") or ""
    transcript = case.get("transcript") or ""
    if not summary:
        return _result("summary_faithfulness", False, 0.0, "no summary")
    verdict = _judge(
        api_key,
        "You are a strict fact-checker. Split the SUMMARY into its factual claims, then decide "
        "for each whether the TRANSCRIPT supports it. "
        'Return JSON: {"claims": ["..."], "supported": [bool per claim], "reasoning": "<brief>"}',
        f"TRANSCRIPT:\n{transcript[:24000]}\n\nSUMMARY:\n{summary}",
    )
    supported = verdict.get("supported") or []
    if not supported:
        return _result("summary_faithfulness", False, 0.0, "judge returned no claims")
    score = sum(bool(s) for s in supported) / len(supported)
    bad = [c for c, s in zip(verdict.get("claims") or [], supported) if not s]
    return _result("summary_faithfulness", score >= 0.9, score,
                   f"{len(bad)} unsupported claim(s)" + (f": {bad[0][:80]!r}" if bad else ""))


def decision_accuracy(case: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Gold decisions must be captured by generated decisions. Gate >= 0.7."""
    gold = (case.get("gold") or {}).get("decisions") or []
    generated = (case.get("insights") or {}).get("decisions") or []
    if not gold:
        return _result("decision_accuracy", True, 1.0, "no gold decisions (skipped)")
    verdict = _judge(
        api_key,
        "For each REFERENCE decision, decide if it is semantically covered by any GENERATED decision. "
        'Return JSON: {"covered": [bool per reference], "reasoning": "<brief>"}',
        f"REFERENCE:\n{json.dumps(gold, indent=1)}\n\nGENERATED:\n{json.dumps(generated, indent=1)}",
    )
    covered = verdict.get("covered") or []
    score = sum(bool(c) for c in covered) / len(gold)
    return _result("decision_accuracy", score >= 0.7, score, f"{sum(bool(c) for c in covered)}/{len(gold)} decisions covered")


def entity_spelling(case: dict[str, Any]) -> dict[str, Any]:
    """No known-bad entity spelling may survive into the transcript or insights.

    gold.entity_misspellings lists strings the ASR is known to produce for this
    case (e.g. "AltaFlock" for "Oltaflock"). The vocab-correction pass exists
    to remove them; this proves it keeps working. Skips when a case has none.
    """
    banned = (case.get("gold") or {}).get("entity_misspellings") or []
    if not banned:
        return _result("entity_spelling", True, 1.0, "no known misspellings for this case (skipped)")
    ins = case.get("insights") or {}
    haystack = " ".join([
        case.get("transcript") or "",
        ins.get("summary") or "",
        json.dumps(ins.get("action_items") or []),
        json.dumps(ins.get("key_points") or []),
        json.dumps(ins.get("facts") or {}),
    ]).lower()
    found = [b for b in banned if b.lower() in haystack]
    score = 1.0 - len(found) / len(banned)
    return _result("entity_spelling", not found, score,
                   f"banned spellings present: {found}" if found else f"none of {len(banned)} known misspellings present")


def boundary_exclusion(case: dict[str, Any]) -> dict[str, Any]:
    """Internal pre/post-meeting speech must not leak into the insights.

    gold.internal_excerpts lists distinctive strings from the pre/post zones
    (private chatter). None may appear in the summary, key points, action
    items or facts. Skips when a case declares none.
    """
    excerpts = (case.get("gold") or {}).get("internal_excerpts") or []
    if not excerpts:
        return _result("boundary_exclusion", True, 1.0, "no internal excerpts declared (skipped)")
    ins = case.get("insights") or {}
    haystack = " ".join([
        ins.get("summary") or "",
        json.dumps(ins.get("action_items") or [], ensure_ascii=False),
        json.dumps(ins.get("key_points") or [], ensure_ascii=False),
        json.dumps(ins.get("facts") or {}, ensure_ascii=False),
    ])
    leaked = [e for e in excerpts if e in haystack]
    score = 1.0 - len(leaked) / len(excerpts)
    return _result("boundary_exclusion", not leaked, score,
                   f"internal speech leaked into insights: {leaked}" if leaked else f"none of {len(excerpts)} internal excerpts leaked")


def numbers_recall(case: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Every gold hard number must survive into key points or facts. Gate >= 0.95.

    The headline metric: dropped numbers ($5M TTV, $20K average booking) are
    exactly what the user needs for the follow-up proposal.
    """
    gold = (case.get("gold") or {}).get("numbers") or []
    if not gold:
        return _result("numbers_recall", True, 1.0, "no gold numbers (skipped)")
    ins = case.get("insights") or {}
    generated = {
        "key_points": ins.get("key_points") or [],
        "summary": ins.get("summary") or "",
        "facts_numbers": ((ins.get("facts") or {}).get("numbers")) or [],
    }
    verdict = _judge(
        api_key,
        "You grade meeting-notes systems. For each REFERENCE number (a metric + value spoken in "
        "a meeting), decide if it is present anywhere in the GENERATED output (key points, "
        "summary, or extracted facts). The value must match (formatting may differ: $5M = "
        "$5 million = 5 million dollars). "
        'Return JSON: {"covered": [bool per reference], "reasoning": "<brief>"}',
        f"REFERENCE:\n{json.dumps(gold, indent=1)}\n\nGENERATED:\n{json.dumps(generated, indent=1)}",
    )
    covered = verdict.get("covered") or []
    score = sum(bool(c) for c in covered) / len(gold)
    return _result("numbers_recall", score >= 0.95, score,
                   f"{sum(bool(c) for c in covered)}/{len(gold)} gold numbers present")


DETERMINISTIC = [schema_validity, english_output, stitch_integrity, speaker_attribution, entity_spelling, boundary_exclusion]
LLM_JUDGED = [action_item_recall, action_item_precision, summary_faithfulness, decision_accuracy, numbers_recall]

