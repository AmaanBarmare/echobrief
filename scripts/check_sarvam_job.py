"""Check a Sarvam job's status and output.

Usage:
    python3 scripts/check_sarvam_job.py <job_id>

Prints job status, then downloads the output JSON and shows transcript length,
language detected, and a preview. Designed for quick triage of empty-output bugs.
"""
import json
import sys
import urllib.request

if len(sys.argv) < 2:
    print("Usage: python3 scripts/check_sarvam_job.py <job_id>")
    sys.exit(1)

JOB_ID = sys.argv[1]

env = {}
with open("/Users/amaanbarmare/Desktop/echobrief/.env") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

SARVAM_API_KEY = env["SARVAM_API_KEY"]
SARVAM_BASE = "https://api.sarvam.ai/speech-to-text/job/v1"

# 1. Status
print(f"=== Job status: {JOB_ID} ===")
req = urllib.request.Request(
    f"{SARVAM_BASE}/{JOB_ID}/status",
    headers={"api-subscription-key": SARVAM_API_KEY},
)
with urllib.request.urlopen(req) as r:
    status = json.loads(r.read())

print(f"  job_state:             {status.get('job_state')}")
print(f"  created_at:            {status.get('created_at')}")
print(f"  updated_at:            {status.get('updated_at')}")
print(f"  successful_files:      {status.get('successful_files_count')}")
print(f"  failed_files:          {status.get('failed_files_count')}")
print(f"  top-level error:       {status.get('error_message') or '(none)'}")

job_details = status.get("job_details") or []
output_files = []
for d in job_details:
    print(f"  detail.state:          {d.get('state')}")
    print(f"  detail.error_message:  {d.get('error_message') or '(none)'}")
    print(f"  detail.exception_name: {d.get('exception_name') or '(none)'}")
    for o in d.get("outputs") or []:
        if o.get("file_name"):
            output_files.append(o["file_name"])

state = (status.get("job_state") or "").upper()
if state not in ("COMPLETED", "FAILED"):
    print(f"\nJob is still {status.get('job_state')} — re-run when finished.")
    sys.exit(0)

if not output_files:
    print("\nNo output files listed. Cannot fetch result.")
    sys.exit(0)

# 2. Download each output file
for fname in output_files:
    print(f"\n=== Output: {fname} ===")
    req = urllib.request.Request(
        f"{SARVAM_BASE}/download-files",
        data=json.dumps({"job_id": JOB_ID, "files": [fname]}).encode(),
        headers={"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            dl = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  download-files failed: {e.code} {e.read().decode()[:300]}")
        continue

    url = dl.get("download_urls", {}).get(fname, {}).get("file_url")
    if not url:
        print(f"  no download URL returned for {fname}")
        continue

    with urllib.request.urlopen(url) as r:
        body = r.read()
    try:
        result = json.loads(body)
    except Exception:
        print(f"  (non-JSON body, {len(body)} bytes)")
        continue

    transcript = result.get("transcript") or ""
    diarized = result.get("diarized_transcript")
    diar_entries = (diarized or {}).get("entries") if isinstance(diarized, dict) else None

    print(f"  transcript length:   {len(transcript)} chars")
    print(f"  transcript preview:  {repr(transcript[:120])}")
    print(f"  language_code:       {result.get('language_code')}")
    print(f"  language_probability:{result.get('language_probability')}")
    print(f"  diarized_transcript: {'present' if diarized else 'null'}")
    if diar_entries is not None:
        print(f"  diar entries:        {len(diar_entries)}")
        speaker_ids = sorted({str(e.get('speaker_id')) for e in diar_entries})
        print(f"  unique speaker_ids:  {speaker_ids}")
    print(f"  timestamps:          {'present' if result.get('timestamps') else 'null'}")

    # Verdict
    print()
    if not transcript.strip():
        print("  >>> EMPTY OUTPUT — silent failure (Sarvam length-correlated bug).")
    elif diar_entries and len({str(e.get('speaker_id')) for e in diar_entries}) <= 1:
        print("  >>> SINGLE-SPEAKER DIARIZATION — known translate-mode limitation.")
    else:
        print("  >>> Looks healthy.")
