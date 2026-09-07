#!/usr/bin/env bash
# Measure what is actually consuming the Supabase Disk IO Budget.
#
# Why this exists: the Disk IO alert is routinely blamed on query load, and the
# two obvious places to look (pg_stat_statements, table sizes) both said the
# database was idle while the budget kept draining. The IO is on the *root*
# volume, not the pgdata volume, and neither Postgres view can see it. Only the
# project's Prometheus endpoint can.
#
# Usage: SUPABASE_SERVICE_ROLE_KEY=... ./scripts/disk-io-probe.sh [window_seconds]
#
# Compare the total against the compute tier's baseline (Nano 5 MB/s / 250 IOPS,
# Micro 11 / 500, Small 22 / 1000). Sustained above baseline = budget depletion.
#
# NOTE: the metrics endpoint is scraped about every 60s, so a window shorter
# than ~75s aliases badly — you get alternating zero and double-rate samples.
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-lekkpfpojlspbuwrtmzt}"
WINDOW="${1:-75}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY (see .env)}"

scrape() {
  curl -sf -u "service_role:$SUPABASE_SERVICE_ROLE_KEY" \
    "https://${REF}.supabase.co/customer/v1/privileged/metrics" \
  | grep -E '^(node_disk_(read_bytes|written_bytes|reads_completed|writes_completed|io_time_seconds)_total|node_vmstat_pswp(in|out)|node_memory_(MemAvailable|MemTotal|Committed_AS)_bytes)' \
  | sed -E 's/^([a-z_A-Z]+)\{[^}]*device="([a-z0-9]+)"[^}]*\} (.*)$/\1 \2 \3/; s/^([a-z_A-Z]+)\{[^}]*\} (.*)$/\1 - \2/'
}

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
scrape > "$tmp/a"; sleep "$WINDOW"; scrape > "$tmp/b"

WINDOW="$WINDOW" python3 - "$tmp/a" "$tmp/b" <<'PY'
import os, sys
def load(p):
    d = {}
    for line in open(p):
        f = line.split()
        if len(f) == 3:
            d[(f[0], f[1])] = float(f[2])
    return d
a, b = load(sys.argv[1]), load(sys.argv[2])
dt = float(os.environ["WINDOW"])
rate = lambda m, dev: (b[(m, dev)] - a[(m, dev)]) / dt

tot_bytes = tot_iops = 0.0
print(f"{'device':<9} {'read':>12} {'write':>12} {'IOPS':>8} {'busy':>7}")
for dev in sorted({k[1] for k in a if k[1].startswith("nvme")}):
    rb, wb = rate("node_disk_read_bytes_total", dev), rate("node_disk_written_bytes_total", dev)
    io = rate("node_disk_reads_completed_total", dev) + rate("node_disk_writes_completed_total", dev)
    busy = rate("node_disk_io_time_seconds_total", dev) * 100
    tot_bytes += rb + wb; tot_iops += io
    print(f"{dev:<9} {rb/1e6:9.2f}MB/s {wb/1e6:9.2f}MB/s {io:8.0f} {busy:6.1f}%")

si, so = rate("node_vmstat_pswpin", "-") * 4096, rate("node_vmstat_pswpout", "-") * 4096
mt = b[("node_memory_MemTotal_bytes", "-")]; ma = b[("node_memory_MemAvailable_bytes", "-")]
ca = b[("node_memory_Committed_AS_bytes", "-")]
print(f"\nTOTAL     {tot_bytes/1e6:9.2f}MB/s combined, {tot_iops:.0f} IOPS")
print(f"swap      in {si/1e6:.2f}MB/s  out {so/1e6:.2f}MB/s")
print(f"memory    {ma/1e6:.0f}MB available of {mt/1e6:.0f}MB;  committed {ca/1e6:.0f}MB "
      f"({ca/mt:.1f}x RAM)")
print("\nbaselines: Nano 5MB/s 250 IOPS | Micro 11MB/s 500 | Small 22MB/s 1000")
if si + so > 0.5e6:
    print("!! swapping under an idle database => memory pressure, not query load.")
PY
