"""Re-submit a stored meeting audio to Sarvam and print the job ID.

Usage:
    python3 scripts/resubmit_to_sarvam.py <meeting_id>
"""
import json
import sys
import urllib.request

MEETING_ID = sys.argv[1] if len(sys.argv) > 1 else "09429b6c-9b67-4468-9074-2c2f512efcc2"

# Load env
env = {}
with open("/Users/amaanbarmare/Desktop/echobrief/.env") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

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
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{SARVAM_BASE}{path}",
        data=data,
        headers={"api-subscription-key": SARVAM_API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def sarvam_put(url, data):
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/octet-stream", "x-ms-blob-type": "BlockBlob"},
        method="PUT",
    )
    with urllib.request.urlopen(req) as r:
        return r.status

# 1. Fetch meeting row
print(f"Fetching meeting {MEETING_ID}...")
rows = sb_get(f"meetings?id=eq.{MEETING_ID}&select=id,audio_url,status,sarvam_job_id")
if not rows:
    print("Meeting not found"); sys.exit(1)
meeting = rows[0]
print(f"  status={meeting['status']}, existing_job={meeting['sarvam_job_id']}, audio_url={meeting['audio_url']}")

# 2. Get signed URL for stored audio
audio_path = meeting["audio_url"].replace("recordings/", "", 1)
print(f"Getting signed URL for: {audio_path}")
req = urllib.request.Request(
    f"{SUPABASE_URL}/storage/v1/object/sign/recordings/{audio_path}",
    data=json.dumps({"expiresIn": 3600}).encode(),
    headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as r:
    sign_data = json.loads(r.read())
signed_url = f"{SUPABASE_URL}/storage/v1{sign_data['signedURL']}"
print(f"  signed URL obtained")

# 3. Download audio
print("Downloading audio from storage...")
with urllib.request.urlopen(signed_url) as r:
    audio_bytes = r.read()
print(f"  downloaded {len(audio_bytes)/1024/1024:.2f} MB")

# 4. Create Sarvam job (current config: no timestamps)
print("Creating Sarvam job...")
job = sarvam_post("", {
    "job_parameters": {
        "model": "saaras:v3",
        "mode": "translate",
        "with_diarization": True,
        "language_code": "unknown",
    },
})
job_id = job["job_id"]
print(f"  job_id: {job_id}")

# 5. Get presigned upload URL
print("Getting upload URL...")
upload_resp = sarvam_post("/upload-files", {"job_id": job_id, "files": ["recall-audio.mp3"]})
presigned = upload_resp["upload_urls"]["recall-audio.mp3"]["file_url"]

# 6. Upload audio
print("Uploading audio to Sarvam...")
status = sarvam_put(presigned, audio_bytes)
print(f"  upload status: {status}")

# 7. Start job
print("Starting Sarvam job...")
sarvam_post(f"/{job_id}/start", {})
print(f"\nDone. Job ID to send to Sarvam support:")
print(f"\n  {job_id}\n")
print(f"Config used: model=saaras:v3, mode=translate, with_diarization=true, with_timestamps=false (omitted), language_code=unknown")
print(f"Audio: {len(audio_bytes)/1024/1024:.2f} MB")
