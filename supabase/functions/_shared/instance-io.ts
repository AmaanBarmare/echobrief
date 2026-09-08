/**
 * Disk IO Budget guard.
 *
 * Supabase emails "your project is depleting its Disk IO Budget" and the obvious
 * places to look — `pg_stat_statements`, table sizes — are blind to it. The
 * instance has two block devices and Postgres only owns one; on 2026-09-08 the
 * `pgdata` volume was idle at 0.1% busy while the ROOT volume ran at 10.5 MB/s
 * because the instance was swapping. By the time the alert was investigated the
 * project had already gone unresponsive (PostgREST 522, metrics endpoint
 * hanging) while the Management API still reported ACTIVE_HEALTHY.
 *
 * So this exists to notice the depletion from a measurement rather than from an
 * outage. See docs/engineering-notes.md #25.
 *
 * Two design constraints, both learned the hard way:
 *
 *  - **No sleeping and no extra cron.** Rates need two points. Rather than block
 *    an invocation for 75 s, each monitor tick stores the raw counters and diffs
 *    against the PREVIOUS tick — a ~15 minute window, which is wider than the
 *    ~60 s metrics scrape interval and so cannot alias. (Sampling at 30 s reads
 *    as a perfect alternation of zero and double-rate samples, which looks
 *    exactly like a bursty workload and is not one.)
 *  - **The counters reset.** They are since-boot, so a restart makes the delta
 *    negative. A negative delta is a reboot, not a negative rate; it must be
 *    discarded rather than reported.
 */
import { C, emailShell, escapeHtml, MONO, panel, paragraph, row } from "./email-brand.ts";

/** Baseline sustained disk throughput per compute tier (Supabase docs). */
export const TIER_BASELINES = {
  nano: { mbPerSec: 5, iops: 250 },
  micro: { mbPerSec: 11, iops: 500 },
  small: { mbPerSec: 22, iops: 1000 },
  medium: { mbPerSec: 35, iops: 1600 },
} as const;

export type Tier = keyof typeof TIER_BASELINES;

/** Which volume a device is. The root volume is where swap lives. */
export const PGDATA_DEVICE = "nvme1n1";

export interface IoCounters {
  /** Unix millis when the scrape was taken. */
  at: number;
  /** device -> counter name -> value */
  devices: Record<string, Record<string, number>>;
  pswpin: number;
  pswpout: number;
  memTotal: number;
  memAvailable: number;
  committedAs: number;
}

export interface IoRates {
  windowSeconds: number;
  /** Combined read+write across every device, MB/s. */
  mbPerSec: number;
  /** Combined read+write IOPS across every device. */
  iops: number;
  /** MB/s attributable to the Postgres data volume. */
  pgdataMbPerSec: number;
  swapInMbPerSec: number;
  swapOutMbPerSec: number;
  memAvailableMb: number;
  memTotalMb: number;
  /** Committed address space as a multiple of physical RAM. */
  committedRatio: number;
}

const DEVICE_METRICS = [
  "node_disk_read_bytes_total",
  "node_disk_written_bytes_total",
  "node_disk_reads_completed_total",
  "node_disk_writes_completed_total",
] as const;

const SCALAR_METRICS: Record<string, keyof IoCounters> = {
  node_vmstat_pswpin: "pswpin",
  node_vmstat_pswpout: "pswpout",
  node_memory_MemTotal_bytes: "memTotal",
  node_memory_MemAvailable_bytes: "memAvailable",
  node_memory_Committed_AS_bytes: "committedAs",
};

/**
 * Parse the Prometheus exposition text into just the counters we need.
 *
 * Deliberately tolerant: the endpoint carries ~2300 lines across several
 * services and any of them may be added, renamed or dropped by Supabase without
 * notice. A missing metric yields 0 and is caught by the sanity check in
 * `computeIoRates`, rather than throwing inside the monitor's hot path.
 */
export function parseMetrics(text: string, at: number = Date.now()): IoCounters {
  const counters: IoCounters = {
    at,
    devices: {},
    pswpin: 0,
    pswpout: 0,
    memTotal: 0,
    memAvailable: 0,
    committedAs: 0,
  };

  for (const line of text.split("\n")) {
    if (!line || line.charCodeAt(0) === 35 /* # */) continue;
    const brace = line.indexOf("{");
    const space = line.lastIndexOf(" ");
    if (space < 0) continue;
    const name = brace >= 0 ? line.slice(0, brace) : line.slice(0, space);
    const value = Number(line.slice(space + 1));
    if (!Number.isFinite(value)) continue;

    if ((DEVICE_METRICS as readonly string[]).includes(name)) {
      const dev = /device="([^"]+)"/.exec(line)?.[1];
      // Only real block devices. Loop/dm entries would double-count.
      if (!dev || !dev.startsWith("nvme")) continue;
      (counters.devices[dev] ??= {})[name] = value;
      continue;
    }

    const key = SCALAR_METRICS[name];
    if (key) (counters[key] as number) = value;
  }

  return counters;
}

const PAGE_BYTES = 4096;

/**
 * Rates between two scrapes, or null when the pair cannot be trusted.
 *
 * Returns null — rather than a zero or a negative rate — when the window is too
 * short to be meaningful, or when any counter went backwards (the instance
 * rebooted and the since-boot counters restarted).
 */
export function computeIoRates(
  prev: IoCounters,
  cur: IoCounters,
  minWindowSeconds = 120,
): IoRates | null {
  const windowSeconds = (cur.at - prev.at) / 1000;
  if (!(windowSeconds >= minWindowSeconds)) return null;
  if (cur.memTotal <= 0) return null;

  let bytes = 0;
  let ops = 0;
  let pgdataBytes = 0;
  let sawDevice = false;

  for (const [dev, cnt] of Object.entries(cur.devices)) {
    const before = prev.devices[dev];
    if (!before) continue; // device appeared mid-window; skip it, don't guess
    let devBytes = 0;
    for (const m of DEVICE_METRICS) {
      const d = (cnt[m] ?? 0) - (before[m] ?? 0);
      if (d < 0) return null; // counters reset => reboot
      if (m.endsWith("bytes_total")) devBytes += d;
      else ops += d;
    }
    bytes += devBytes;
    if (dev === PGDATA_DEVICE) pgdataBytes += devBytes;
    sawDevice = true;
  }
  if (!sawDevice) return null;

  const swapIn = (cur.pswpin - prev.pswpin) * PAGE_BYTES;
  const swapOut = (cur.pswpout - prev.pswpout) * PAGE_BYTES;
  if (swapIn < 0 || swapOut < 0) return null;

  const perSec = (n: number) => n / windowSeconds;
  return {
    windowSeconds,
    mbPerSec: perSec(bytes) / 1e6,
    iops: perSec(ops),
    pgdataMbPerSec: perSec(pgdataBytes) / 1e6,
    swapInMbPerSec: perSec(swapIn) / 1e6,
    swapOutMbPerSec: perSec(swapOut) / 1e6,
    memAvailableMb: cur.memAvailable / 1e6,
    memTotalMb: cur.memTotal / 1e6,
    committedRatio: cur.committedAs / cur.memTotal,
  };
}

export type IoVerdict = "ok" | "above_baseline";

/**
 * Whether a measured window is over the tier's sustained baseline.
 *
 * Bursting above baseline is a feature, not a fault — that is what the budget
 * is for. What matters is bursting for a whole 15-minute window, which is why
 * the caller requires consecutive breaches before it emails anyone.
 */
export function classifyIo(rates: IoRates, tier: Tier = "nano"): IoVerdict {
  const base = TIER_BASELINES[tier];
  return rates.mbPerSec > base.mbPerSec || rates.iops > base.iops
    ? "above_baseline"
    : "ok";
}

/** Signature recorded in monitor_events / errors.md. */
export const IO_SIGNATURE = "instance:disk_io_above_baseline";

export async function fetchInstanceMetrics(
  supabaseUrl: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
  at: number = Date.now(),
): Promise<IoCounters> {
  const base = supabaseUrl.replace(/\/+$/, "");
  const res = await fetchImpl(`${base}/customer/v1/privileged/metrics`, {
    headers: { Authorization: `Basic ${btoa(`service_role:${serviceKey}`)}` },
  });
  if (!res.ok) throw new Error(`metrics endpoint ${res.status}`);
  // The scrape is stamped by the caller's clock, not read from the payload:
  // the window is measured between OUR two observations, and the sample row's
  // captured_at must be the same instant the delta is computed against.
  return parseMetrics(await res.text(), at);
}

/**
 * Number of consecutive above-baseline windows before anyone is emailed.
 *
 * One window is not a fault. Bursting above baseline is exactly what the burst
 * budget exists for, and a single 15-minute spike is usually a batch of
 * meetings finishing. Two consecutive windows is ~30 minutes of sustained
 * over-baseline IO, which is the shape that actually drains the budget.
 */
export const CONSECUTIVE_BREACHES_TO_ALERT = 2;

/** Do not re-send while the condition persists; once a day is enough. */
export const ALERT_COOLDOWN_HOURS = 24;

export interface IoCheckResult {
  status: "ok" | "above_baseline" | "skipped";
  reason?: string;
  rates?: IoRates;
  consecutiveBreaches?: number;
  shouldAlert?: boolean;
}

interface MinimalClient {
  from(table: string): {
    select(cols: string): {
      order(col: string, opts: { ascending: boolean }): {
        limit(n: number): PromiseLike<
          { data: unknown[] | null; error: unknown }
        >;
      };
    };
    insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
}

interface SampleRow {
  captured_at: string;
  counters: IoCounters;
  above_baseline: boolean;
  alerted: boolean;
}

/**
 * Take a sample, compare it to the previous one, and decide whether to alert.
 *
 * Never throws. This runs inside the stuck-meeting monitor, and a telemetry
 * probe must not be able to stop meetings from being recovered — the same rule
 * `notifyRecentFailures` follows.
 */
export async function checkInstanceIo(
  supabase: MinimalClient,
  opts: {
    supabaseUrl: string;
    serviceKey: string;
    tier?: Tier;
    fetchImpl?: typeof fetch;
    now?: number;
  },
): Promise<IoCheckResult> {
  try {
    const nowMs = opts.now ?? Date.now();
    const cur = await fetchInstanceMetrics(
      opts.supabaseUrl,
      opts.serviceKey,
      opts.fetchImpl ?? fetch,
      nowMs,
    );

    const { data, error } = await supabase
      .from("instance_io_samples")
      .select("captured_at, counters, above_baseline, alerted")
      .order("captured_at", { ascending: false })
      .limit(CONSECUTIVE_BREACHES_TO_ALERT + 8);
    if (error) throw error;

    const history = (data ?? []) as unknown as SampleRow[];
    const prev = history[0];
    const rates = prev
      ? computeIoRates(
        { ...prev.counters, at: Date.parse(prev.captured_at) },
        cur,
      )
      : null;

    const verdict = rates ? classifyIo(rates, opts.tier ?? "nano") : null;
    const aboveBaseline = verdict === "above_baseline";

    // Count this window plus the preceding run of breaches.
    let consecutive = aboveBaseline ? 1 : 0;
    if (aboveBaseline) {
      for (const row of history) {
        if (!row.above_baseline) break;
        consecutive++;
      }
    }

    const cooldownMs = ALERT_COOLDOWN_HOURS * 3600 * 1000;
    const alertedRecently = history.some(
      (r) => r.alerted && nowMs - Date.parse(r.captured_at) < cooldownMs,
    );
    const shouldAlert = aboveBaseline &&
      consecutive >= CONSECUTIVE_BREACHES_TO_ALERT &&
      !alertedRecently;

    await supabase.from("instance_io_samples").insert({
      captured_at: new Date(cur.at).toISOString(),
      counters: cur,
      rates: rates ?? null,
      above_baseline: aboveBaseline,
      alerted: shouldAlert,
    });

    if (!rates) {
      return {
        status: "skipped",
        reason: prev
          ? "counters reset (reboot) or window too short"
          : "no previous sample",
      };
    }
    return {
      status: aboveBaseline ? "above_baseline" : "ok",
      rates,
      consecutiveBreaches: consecutive,
      shouldAlert,
    };
  } catch (err) {
    // Telemetry failing is not an incident. Say so and move on.
    console.error("[monitor] instance IO check failed:", err);
    return {
      status: "skipped",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** One-line human summary for the alert email and the log. */
export function describeIo(r: IoRates, tier: Tier = "nano"): string {
  const b = TIER_BASELINES[tier];
  const pct = Math.round((r.pgdataMbPerSec / Math.max(r.mbPerSec, 1e-9)) * 100);
  return [
    `${r.mbPerSec.toFixed(2)} MB/s and ${Math.round(r.iops)} IOPS`,
    `against a ${tier} baseline of ${b.mbPerSec} MB/s / ${b.iops} IOPS`,
    `over ${Math.round(r.windowSeconds / 60)} min.`,
    `pgdata is ${pct}% of it`,
    `(swap in ${r.swapInMbPerSec.toFixed(2)} MB/s, out ${r.swapOutMbPerSec.toFixed(2)} MB/s;`,
    `${Math.round(r.memAvailableMb)}MB of ${Math.round(r.memTotalMb)}MB available,`,
    `committed ${r.committedRatio.toFixed(1)}x RAM).`,
  ].join(" ");
}

/**
 * The alert body. Uses the one email shell like everything else we send —
 * see _shared/email-brand.ts; never hand-roll another layout.
 */
export function buildIoAlert(
  r: IoRates,
  consecutive: number,
  tier: Tier = "nano",
): { subject: string; html: string } {
  const b = TIER_BASELINES[tier];
  const pgdataPct = Math.round(
    (r.pgdataMbPerSec / Math.max(r.mbPerSec, 1e-9)) * 100,
  );
  const swapping = r.swapInMbPerSec + r.swapOutMbPerSec > 0.5;
  const minutes = Math.round((r.windowSeconds * consecutive) / 60);

  const subject =
    `[ECHOBRIEF] Disk IO above baseline — ${r.mbPerSec.toFixed(1)} MB/s vs ${b.mbPerSec} MB/s`;

  const stat = (label: string, value: string) =>
    `<tr><td style="padding:2px 12px 2px 0;font-family:${MONO};font-size:13px;color:${C.inkFaint};">${escapeHtml(label)}</td>` +
    `<td style="padding:2px 0;font-family:${MONO};font-size:13px;color:${C.ink};">${escapeHtml(value)}</td></tr>`;

  const table = `<table cellpadding="0" cellspacing="0" role="presentation">
    ${stat("throughput", `${r.mbPerSec.toFixed(2)} MB/s   (baseline ${b.mbPerSec})`)}
    ${stat("IOPS", `${Math.round(r.iops)}   (baseline ${b.iops})`)}
    ${stat("pgdata share", `${pgdataPct}%`)}
    ${stat("swap in / out", `${r.swapInMbPerSec.toFixed(2)} / ${r.swapOutMbPerSec.toFixed(2)} MB/s`)}
    ${stat("memory", `${Math.round(r.memAvailableMb)}MB free of ${Math.round(r.memTotalMb)}MB, committed ${r.committedRatio.toFixed(1)}x`)}
    ${stat("sustained for", `~${minutes} min (${consecutive} windows)`)}
  </table>`;

  // The verdict is the point of the mail. If pgdata is a small share, no query
  // or cron change can help and reaching for one wastes the on-call's time.
  const verdict = pgdataPct < 25 && swapping
    ? `The Postgres data volume is only <strong>${pgdataPct}%</strong> of this, and the instance is swapping — so this is memory pressure on the root volume, <strong>not</strong> query or cron load. On 2026-09-08 the fix was a restart, not a plan upgrade: <code>POST https://api.supabase.com/v1/projects/&lt;ref&gt;/restart</code>. Re-measure with <code>scripts/disk-io-probe.sh</code> afterwards.`
    : `The Postgres data volume is <strong>${pgdataPct}%</strong> of this, so unlike the 2026-09-08 incident the database itself is implicated. Check <code>pg_stat_statements</code> — keyed on <code>(userid, dbid, toplevel, queryid)</code>, not queryid alone — before assuming it is swap.`;

  const html = emailShell({
    eyebrow: "Instance telemetry",
    headline: "Disk IO is above baseline",
    meta: `${IO_SIGNATURE} · ${tier}`,
    bodyRows: [
      row(paragraph(
        `Sustained disk IO has been over the ${tier} baseline for ${consecutive} consecutive ` +
          `${Math.round(r.windowSeconds / 60)}-minute windows. Once the burst budget is spent the ` +
          `instance throttles to baseline and can stop responding entirely.`,
      )),
      row(panel(table, "ember")),
      row(paragraph(verdict)),
    ].join(""),
    signoff: "Sent by",
    hideFooterLink: true,
  });

  return { subject, html };
}
