import {
  assert,
  assertEquals,
  assertAlmostEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  checkInstanceIo,
  classifyIo,
  computeIoRates,
  describeIo,
  IoCounters,
  parseMetrics,
} from "../_shared/instance-io.ts";

// A trimmed slice of a real scrape, including the shapes that broke naive
// parsing: two devices, long label sets, a comment line, and metric names that
// are prefixes of one another.
const SCRAPE = `# HELP node_disk_read_bytes_total Read bytes.
# TYPE node_disk_read_bytes_total counter
node_disk_read_bytes_total{supabase_project_ref="abc",service_type="db",device="nvme0n1"} 1000000
node_disk_read_bytes_total{supabase_project_ref="abc",service_type="db",device="nvme1n1"} 2000000
node_disk_written_bytes_total{service_type="db",device="nvme0n1"} 500000
node_disk_written_bytes_total{service_type="db",device="nvme1n1"} 100000
node_disk_reads_completed_total{service_type="db",device="nvme0n1"} 100
node_disk_reads_completed_total{service_type="db",device="nvme1n1"} 20
node_disk_writes_completed_total{service_type="db",device="nvme0n1"} 50
node_disk_writes_completed_total{service_type="db",device="nvme1n1"} 10
node_disk_reads_merged_total{service_type="db",device="nvme0n1"} 999999
node_vmstat_pswpin{service_type="db"} 1000
node_vmstat_pswpout{service_type="db"} 900
node_memory_MemTotal_bytes{service_type="db"} 431308800
node_memory_MemAvailable_bytes{service_type="db"} 266162176
node_memory_Committed_AS_bytes{service_type="db"} 1436631040
`;

function shift(base: IoCounters, deltas: {
  readBytes?: number;
  writeBytes?: number;
  reads?: number;
  writes?: number;
  swapInPages?: number;
  swapOutPages?: number;
  seconds: number;
}): IoCounters {
  const next: IoCounters = JSON.parse(JSON.stringify(base));
  next.at = base.at + deltas.seconds * 1000;
  const d = next.devices["nvme0n1"];
  d["node_disk_read_bytes_total"] += deltas.readBytes ?? 0;
  d["node_disk_written_bytes_total"] += deltas.writeBytes ?? 0;
  d["node_disk_reads_completed_total"] += deltas.reads ?? 0;
  d["node_disk_writes_completed_total"] += deltas.writes ?? 0;
  next.pswpin += deltas.swapInPages ?? 0;
  next.pswpout += deltas.swapOutPages ?? 0;
  return next;
}

Deno.test("parseMetrics extracts both devices and ignores unrelated metrics", () => {
  const c = parseMetrics(SCRAPE, 1000);
  assertEquals(Object.keys(c.devices).sort(), ["nvme0n1", "nvme1n1"]);
  assertEquals(c.devices["nvme0n1"]["node_disk_read_bytes_total"], 1_000_000);
  // reads_merged is not one of ours; it must not be counted as IOPS.
  assertEquals(c.devices["nvme0n1"]["node_disk_reads_merged_total"], undefined);
  assertEquals(c.pswpin, 1000);
  assertEquals(c.memTotal, 431_308_800);
});

Deno.test("computeIoRates converts counters to per-second rates", () => {
  const a = parseMetrics(SCRAPE, 0);
  // 60 MB read + 6 MB written over 60 s = 1.1 MB/s; 600+300 ops = 15 IOPS.
  const b = shift(a, {
    readBytes: 60_000_000,
    writeBytes: 6_000_000,
    reads: 600,
    writes: 300,
    seconds: 60,
  });
  const r = computeIoRates(a, b, 30)!;
  assert(r !== null);
  assertAlmostEquals(r.mbPerSec, 1.1, 1e-9);
  assertAlmostEquals(r.iops, 15, 1e-9);
  assertEquals(r.windowSeconds, 60);
});

Deno.test("pgdata share is reported separately — the whole point of the split", () => {
  const a = parseMetrics(SCRAPE, 0);
  const b = shift(a, { readBytes: 60_000_000, seconds: 60 }); // all on root
  const r = computeIoRates(a, b, 30)!;
  assertEquals(r.pgdataMbPerSec, 0);
  assert(r.mbPerSec > 0);
});

Deno.test("a reboot resets the counters, and a negative delta is not a rate", () => {
  const a = parseMetrics(SCRAPE, 0);
  const b: IoCounters = JSON.parse(JSON.stringify(a));
  b.at = a.at + 900_000;
  b.devices["nvme0n1"]["node_disk_read_bytes_total"] = 10; // restarted from ~0
  assertEquals(computeIoRates(a, b, 30), null);
});

Deno.test("swap counters going backwards is also treated as a reboot", () => {
  const a = parseMetrics(SCRAPE, 0);
  const b = shift(a, { seconds: 900, swapInPages: -500 });
  assertEquals(computeIoRates(a, b, 30), null);
});

Deno.test("a window shorter than the scrape interval is refused, not reported", () => {
  const a = parseMetrics(SCRAPE, 0);
  const b = shift(a, { readBytes: 1_000_000, seconds: 30 });
  // 30 s aliases against the ~60 s scrape; the guard must reject it.
  assertEquals(computeIoRates(a, b, 120), null);
  assert(computeIoRates(a, b, 10) !== null);
});

Deno.test("classifyIo compares against the tier baseline on both axes", () => {
  const base = { windowSeconds: 900, pgdataMbPerSec: 0, swapInMbPerSec: 0, swapOutMbPerSec: 0, memAvailableMb: 200, memTotalMb: 431, committedRatio: 3 };
  assertEquals(classifyIo({ ...base, mbPerSec: 2, iops: 100 }, "nano"), "ok");
  // Over on throughput alone.
  assertEquals(classifyIo({ ...base, mbPerSec: 11.85, iops: 100 }, "nano"), "above_baseline");
  // Over on IOPS alone.
  assertEquals(classifyIo({ ...base, mbPerSec: 2, iops: 427 }, "nano"), "above_baseline");
  // The same numbers are fine on a bigger tier.
  assertEquals(classifyIo({ ...base, mbPerSec: 11.85, iops: 427 }, "small"), "ok");
});

// --- checkInstanceIo orchestration -----------------------------------------

function fakeClient(history: unknown[], captured: unknown[]) {
  return {
    from(_t: string) {
      return {
        select: (_c: string) => ({
          order: (_c2: string, _o: { ascending: boolean }) => ({
            limit: (_n: number) =>
              Promise.resolve({ data: history, error: null }),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          captured.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

const fetchOk = (body: string) =>
  ((_u: string | URL | Request, _i?: RequestInit) =>
    Promise.resolve(new Response(body, { status: 200 }))) as typeof fetch;

Deno.test("first ever sample records counters and reports skipped, not ok", async () => {
  const rows: unknown[] = [];
  const res = await checkInstanceIo(fakeClient([], rows), {
    supabaseUrl: "https://x.supabase.co",
    serviceKey: "k",
    fetchImpl: fetchOk(SCRAPE),
  });
  assertEquals(res.status, "skipped");
  assertEquals(res.reason, "no previous sample");
  assertEquals(rows.length, 1); // still stored, so the NEXT tick has a baseline
});

Deno.test("one breach does not alert; two consecutive breaches do", async () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const prevCounters = parseMetrics(SCRAPE, now - 900_000);
  // +12 GB over 15 min on the root volume = ~13.3 MB/s, well over nano's 5.
  const busy = SCRAPE.replace(
    'device="nvme0n1"} 1000000',
    'device="nvme0n1"} 12000001000000',
  );

  // Only the immediately-previous sample exists and it was healthy.
  let rows: unknown[] = [];
  let res = await checkInstanceIo(
    fakeClient([{
      captured_at: new Date(now - 900_000).toISOString(),
      counters: prevCounters,
      above_baseline: false,
      alerted: false,
    }], rows),
    { supabaseUrl: "https://x.supabase.co", serviceKey: "k", fetchImpl: fetchOk(busy), now },
  );
  assertEquals(res.status, "above_baseline");
  assertEquals(res.consecutiveBreaches, 1);
  assertEquals(res.shouldAlert, false);
  assertEquals((rows[0] as Record<string, unknown>).alerted, false);

  // Now the previous window was ALSO above baseline.
  rows = [];
  res = await checkInstanceIo(
    fakeClient([{
      captured_at: new Date(now - 900_000).toISOString(),
      counters: prevCounters,
      above_baseline: true,
      alerted: false,
    }], rows),
    { supabaseUrl: "https://x.supabase.co", serviceKey: "k", fetchImpl: fetchOk(busy), now },
  );
  assertEquals(res.consecutiveBreaches, 2);
  assertEquals(res.shouldAlert, true);
  assertEquals((rows[0] as Record<string, unknown>).alerted, true);
});

Deno.test("cooldown suppresses a second alert while the condition persists", async () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const prevCounters = parseMetrics(SCRAPE, now - 900_000);
  const busy = SCRAPE.replace(
    'device="nvme0n1"} 1000000',
    'device="nvme0n1"} 12000001000000',
  );
  const rows: unknown[] = [];
  const res = await checkInstanceIo(
    fakeClient([
      { captured_at: new Date(now - 900_000).toISOString(), counters: prevCounters, above_baseline: true, alerted: false },
      { captured_at: new Date(now - 3_600_000).toISOString(), counters: prevCounters, above_baseline: true, alerted: true },
    ], rows),
    { supabaseUrl: "https://x.supabase.co", serviceKey: "k", fetchImpl: fetchOk(busy), now },
  );
  assertEquals(res.status, "above_baseline");
  assert((res.consecutiveBreaches ?? 0) >= 2);
  assertEquals(res.shouldAlert, false); // alerted an hour ago
});

Deno.test("a failing metrics endpoint is skipped, never thrown", async () => {
  const rows: unknown[] = [];
  const res = await checkInstanceIo(fakeClient([], rows), {
    supabaseUrl: "https://x.supabase.co",
    serviceKey: "k",
    fetchImpl: (() => Promise.resolve(new Response("nope", { status: 503 }))) as typeof fetch,
  });
  assertEquals(res.status, "skipped");
  assert(res.reason!.includes("503"));
  assertEquals(rows.length, 0);
});

Deno.test("describeIo names the pgdata share, which is the diagnostic", () => {
  const s = describeIo({
    windowSeconds: 900,
    mbPerSec: 11.85,
    iops: 427,
    pgdataMbPerSec: 0.46,
    swapInMbPerSec: 1.06,
    swapOutMbPerSec: 0.86,
    memAvailableMb: 263,
    memTotalMb: 431,
    committedRatio: 3.2,
  }, "nano");
  assert(s.includes("11.85 MB/s"));
  assert(s.includes("427 IOPS"));
  assert(s.includes("pgdata is 4%"));
  assert(s.includes("3.2x RAM"));
});
