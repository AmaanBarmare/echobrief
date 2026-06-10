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

## The 8 evals

Deterministic (free):
1. **schema_validity** — insights have non-empty summary + list-typed action_items/decisions
2. **english_output** — translate mode actually produced English (ASCII ratio ≥ 0.95)
3. **stitch_integrity** — chunk-stitched segments are time-ordered, non-negative, non-empty; last timestamp ≤ duration + slack
4. **speaker_attribution** — no phantom `SPEAKER_XX` labels when real participant names are known

LLM-judge (gpt-4o-mini, temperature 0, strict JSON):
5. **action_item_recall** — gold action items covered by generated ones (gate ≥ 0.7)
6. **action_item_precision** — every generated action item grounded in the transcript; ANY hallucinated item fails (gate = 1.0)
7. **summary_faithfulness** — every summary claim supported by the transcript (gate ≥ 0.9)
8. **decision_accuracy** — gold decisions covered (gate ≥ 0.7)

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
