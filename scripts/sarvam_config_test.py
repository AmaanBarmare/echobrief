"""Diagnostic: resubmit a stored meeting audio to Sarvam with overridable job_parameters.

Usage:
    python3 scripts/sarvam_config_test.py <meeting_id> key=value [key=value ...]

Example:
    python3 scripts/sarvam_config_test.py ad76ec69-... language_code=en-IN
    python3 scripts/sarvam_config_test.py ad76ec69-... mode=transcribe language_code=unknown

Bools: with_diarization=true/false. Ints: num_speakers=2.
Creates a fresh Sarvam job, uploads the stored audio, starts it, prints job_id.
Read-only on the DB. Does NOT modify the meeting row.
"""
import json
import sys
import urllib.request

if len(sys.argv) < 2:
    print("Usage: python3 scripts/sarvam_config_test.py <meeting_id> [key=value ...]")
    sys.exit(1)

MEETING_ID = sys.argv[1]

# Defaults mirror prod, then apply CLI overrides.
params = {
    "model": "saaras:v3",
    "mode": "translate",
    "with_diarization": True,
    "language_code": "unknown",
}
for arg in sys.argv[2:]:
    k, v = arg.split("=", 1)
    if v.lower() in ("true", "false"):
        params[k] = v.lower() == "true"
    elif v.isdigit():
        params[k] = int(v)
    else:
        params[k] = v

env = {}
with open("/Users/amaanbarmare/Desktop/echobrief/.env") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        env[key.strip()] = val.strip().strip('"').strip("'")

SUPABASE_URL = env["SUPABASE_URL"]
SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
SARVAM_API_KEY = env["SARVAM_API_KEY"]
SARVAM_BASE = "https://api.sarvam.ai/speech-to-text/job/v1"


def sb_get(path):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def sarvam_post(path, body):
    req = urllib.request.Request(
        f"{SARVAM_BASE}{path}",
        data=json.dumps(body).encode(),
        headers={"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


rows = sb_get(f"meetings?id=eq.{MEETING_ID}&select=id,audio_url")
if not rows:
    print("Meeting not found"); sys.exit(1)
audio_path = rows[0]["audio_url"].replace("recordings/", "", 1)

req = urllib.request.Request(
    f"{SUPABASE_URL}/storage/v1/object/sign/recordings/{audio_path}",
    data=json.dumps({"expiresIn": 3600}).encode(),
    headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as r:
    signed_url = f"{SUPABASE_URL}/storage/v1{json.loads(r.read())['signedURL']}"
with urllib.request.urlopen(signed_url) as r:
    audio_bytes = r.read()

job = sarvam_post("", {"job_parameters": params})
job_id = job["job_id"]
upload_resp = sarvam_post("/upload-files", {"job_id": job_id, "files": ["recall-audio.mp3"]})
presigned = upload_resp["upload_urls"]["recall-audio.mp3"]["file_url"]
put = urllib.request.Request(
    presigned, data=audio_bytes,
    headers={"Content-Type": "application/octet-stream", "x-ms-blob-type": "BlockBlob"},
    method="PUT",
)
urllib.request.urlopen(put)
sarvam_post(f"/{job_id}/start", {})
print(f"{job_id}  |  {json.dumps(params)}  |  {len(audio_bytes)/1024/1024:.1f}MB")
