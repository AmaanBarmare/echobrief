/**
 * What each meeting costs us.
 *
 * Margin was invisible: the only per-meeting numbers stored were the ones we
 * bill the customer for (`usage_events`), never the ones we pay. A customer who
 * is unprofitable — a long call, a Whisper fallback, a regeneration or two —
 * looked identical to a cheap one until the invoice arrived at the end of the
 * month, by which point the pricing decision had already been made.
 *
 * RAW UNITS ONLY IN THE TABLE. Seconds and tokens are facts; rupees are an
 * opinion that changes with every rate renegotiation. Prices live in the
 * `meeting_margin` view, so a new Recall rate is a view change and does not
 * silently rewrite history.
 *
 * The OpenAI client is injected into every module that uses it
 * (`extractFacts(openai, ...)`, `generateCoaching(openai, ...)`, and so on), so
 * metering wraps the client once in the pipeline and the seven call sites stay
 * untouched. State lives on the wrapper, not in a module-level variable: edge
 * isolates serve concurrent requests, and a shared accumulator would bill one
 * meeting's tokens to another.
 */

export interface CostMeter {
  meetingId: string;
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  models: Set<string>;
}

export function newCostMeter(meetingId: string): CostMeter {
  return { meetingId, llmCalls: 0, tokensIn: 0, tokensOut: 0, models: new Set() };
}

/**
 * Wrap an OpenAI client so every chat completion is counted.
 *
 * A Proxy rather than a spread: these modules receive the real SDK client and
 * a spread copy would lose its prototype — and `openai.audio.transcriptions`
 * (the Whisper path) has to keep working untouched. Functions are bound to the
 * original target because the SDK uses private class fields, which throw when
 * called on a proxy receiver.
 */
export function meterOpenAI<T extends object>(openai: T, meter: CostMeter): T {
  const bind = (target: any, prop: string | symbol) => {
    const value = Reflect.get(target, prop);
    return typeof value === "function" ? value.bind(target) : value;
  };

  return new Proxy(openai, {
    get(target, prop) {
      if (prop !== "chat") return bind(target, prop);
      const chat = Reflect.get(target, prop) as object;
      return new Proxy(chat, {
        get(chatTarget, chatProp) {
          if (chatProp !== "completions") return bind(chatTarget, chatProp);
          const completions = Reflect.get(chatTarget, chatProp) as object;
          return new Proxy(completions, {
            get(cTarget, cProp) {
              if (cProp !== "create") return bind(cTarget, cProp);
              const create = Reflect.get(cTarget, cProp).bind(cTarget);
              return async (...args: unknown[]) => {
                const result = await create(...args);
                try {
                  const usage = (result as any)?.usage;
                  meter.llmCalls += 1;
                  meter.tokensIn += Number(usage?.prompt_tokens ?? 0);
                  meter.tokensOut += Number(usage?.completion_tokens ?? 0);
                  const model = (args[0] as any)?.model;
                  if (typeof model === "string") meter.models.add(model);
                } catch {
                  // Metering must never be the reason a completion fails.
                }
                return result;
              };
            },
          });
        },
      });
    },
  }) as T;
}

export interface PipelineCostFacts {
  /** Bot wall-clock we are billed for. In practice the recording length. */
  recallSeconds?: number | null;
  /** Audio seconds sent to speech-to-text. */
  sttSeconds?: number | null;
  /** 'sarvam' normally, 'whisper' when the fallback fired — 15x the price. */
  sttProvider?: string | null;
  /** True when this run was a regeneration, which pays the LLM cost again. */
  regenerated?: boolean;
}

/**
 * Persist what this run cost. Never throws.
 *
 * Increments rather than replaces: a meeting that falls back to Whisper, or is
 * regenerated later, genuinely costs the sum of its runs, and recording that as
 * the last run's cost would understate exactly the meetings worth finding.
 */
export async function saveCosts(
  supabase: any,
  meter: CostMeter,
  facts: PipelineCostFacts = {},
): Promise<void> {
  try {
    const { error } = await supabase.rpc("record_meeting_cost", {
      p_meeting_id: meter.meetingId,
      p_llm_calls: meter.llmCalls,
      p_tokens_in: meter.tokensIn,
      p_tokens_out: meter.tokensOut,
      p_models: Array.from(meter.models),
      p_recall_seconds: facts.recallSeconds ?? null,
      p_stt_seconds: facts.sttSeconds ?? null,
      p_stt_provider: facts.sttProvider ?? null,
      p_regenerated: facts.regenerated ?? false,
    });
    if (error) console.error(`[cost] could not record for ${meter.meetingId}: ${error.message}`);
  } catch (err) {
    console.error(`[cost] could not record for ${meter.meetingId}: ${err}`);
  }
}
