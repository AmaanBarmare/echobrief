# EchoBrief Evals

Output-quality evaluation for the meeting pipeline. Complementary to the
pipeline harness:

| Layer | File | Question it answers |
|---|---|---|
| **Harness** (plumbing) | `scripts/pipeline-test/harness.py` | Did the pipeline run? Webhooks, statuses, races, recovery. |
| **Evals** (quality) | `scripts/evals/run_evals.py` | Is the output *good*? Accurate transcript, faithful summary, no hallucinations. |

## Running

```bash
python3 scripts/evals/run_evals.py                    # static dataset gate — run before deploys
python3 scripts/evals/run_evals.py --skip-llm         # deterministic checks only (free, no OpenAI)
python3 scripts/evals/run_evals.py --meeting-id <id>  # grade a live prod meeting
python3 scripts/evals/run_evals.py --snapshot <id>    # pull a prod meeting into dataset/ as a new case
```

Exit code 0 = pass, 1 = regression. Needs `.env` (OPENAI_API_KEY, and Supabase
keys for the live modes).

## The 11 evals

Deterministic (free):
1. **schema_validity** — insights have non-empty summary + list-typed action_items/decisions
2. **english_output** — translate mode actually produced English (ASCII ratio ≥ 0.95)
3. **stitch_integrity** — chunk-stitched segments are time-ordered, non-negative, non-empty; last timestamp ≤ duration + slack
4. **speaker_attribution** — no phantom `SPEAKER_XX` labels when real participant names are known
5. **entity_spelling** — no known-bad ASR spelling (`gold.entity_misspellings`, e.g. "AltaFlock") survives anywhere — transcript, summary, action items, key points or facts. Proves the vocab-correction pass keeps working; skips when a case lists none.
6. **boundary_exclusion** — no internal pre/post-meeting excerpt (`gold.internal_excerpts`) leaks into summary, action items, key points or facts. Proves the privacy trim; skips when a case declares none.

LLM-judge (gpt-4o-mini, temperature 0, strict JSON):
7. **action_item_recall** — gold action items covered by generated ones (gate ≥ 0.7)
8. **action_item_precision** — every generated action item grounded in the transcript; ANY hallucinated item fails (gate = 1.0)
9. **summary_faithfulness** — every summary claim supported by the transcript (gate ≥ 0.9)
10. **decision_accuracy** — gold decisions covered (gate ≥ 0.7)
11. **numbers_recall** — every gold hard number (`gold.numbers`) must survive into key points, summary or extracted facts, formatting differences allowed (gate ≥ 0.95). Dropped numbers ($5M TTV, $20K average booking) are exactly what the follow-up proposal needs, so this is the headline metric.

## Judge calibration

`case_synthetic_hallucination.json` contains a deliberately invented action item
and summary claim, with `"expect": {"action_item_precision": "fail", ...}`.
The suite passes only when the judge CATCHES the plants. If that case ever
starts "passing", the judge has gone lenient — fix the judge, not the case.

## Growing the dataset (production → eval feedback loop)

When a prod meeting produces a bad summary/transcript:
1. `python3 scripts/evals/run_evals.py --snapshot <meeting-id>`
2. Edit the new `dataset/case_live_*.json`: fill `gold.action_items` /
   `gold.decisions` with the true ones (you were in the meeting — you are the
   gold labeler).
3. The case now runs in every future static gate, so that failure mode can
   never silently regress.

Gold references marked by a human are canonical. Auto-generated ("silver")
gold should be reviewed before being trusted.

## Recall-native vs Sarvam (decision support)

`python3 scripts/evals/compare_recall_vs_sarvam.py [meeting-id ...]` — for real
prod meetings inside Recall's 7-day retention, downloads Recall's own transcript,
GPT-translates it to English, generates insights with the prod prompt, and scores
both sides with the scorers above plus a two-way fact-coverage judge. Read-only;
side-by-side text lands in `compare-out/` (gitignored). First run 2026-08-30:
Recall's streaming STT is fine on English-heavy calls but drops ~35% of speech
and mangles product names (Retell, 11Labs) on heavy-Hindi calls; Sarvam stays.
