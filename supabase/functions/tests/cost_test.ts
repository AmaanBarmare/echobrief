/**
 * Tests for cost metering.
 *
 * The metering proxy sits between the pipeline and the real OpenAI SDK, so the
 * failure that matters is not "the numbers are slightly off" — it is "the proxy
 * broke a completion". Hence the emphasis below on passing everything through
 * untouched, including the paths it does not meter at all (Whisper lives on
 * `openai.audio.transcriptions`, and a spread copy of the client would have
 * silently lost it).
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { meterOpenAI, newCostMeter, saveCosts } from "../_shared/cost.ts";

/** Stands in for the SDK: a class, so prototype methods and `this` are real. */
class FakeOpenAI {
  #apiKey = "sk-private-field";
  public calls: unknown[] = [];

  chat = {
    completions: {
      create: (args: Record<string, unknown>) => {
        this.calls.push(args);
        return Promise.resolve({
          choices: [{ message: { content: "{}" } }],
          usage: { prompt_tokens: 1200, completion_tokens: 300 },
        });
      },
    },
  };

  audio = {
    transcriptions: {
      create: () => Promise.resolve({ text: "whisper output" }),
    },
  };

  /** Reads a private field: throws if called with a proxy as `this`. */
  keyPrefix(): string {
    return this.#apiKey.slice(0, 3);
  }
}

Deno.test("tokens from every completion accumulate on the meter", async () => {
  const meter = newCostMeter("m1");
  const client = meterOpenAI(new FakeOpenAI(), meter);
  await (client as any).chat.completions.create({ model: "gpt-4o-mini", messages: [] });
  await (client as any).chat.completions.create({ model: "gpt-4o-mini", messages: [] });
  assertEquals(meter.llmCalls, 2);
  assertEquals(meter.tokensIn, 2400);
  assertEquals(meter.tokensOut, 600);
  assertEquals(Array.from(meter.models), ["gpt-4o-mini"]);
});

Deno.test("the completion result reaches the caller unchanged", async () => {
  const meter = newCostMeter("m1");
  const client = meterOpenAI(new FakeOpenAI(), meter);
  const result = await (client as any).chat.completions.create({ model: "gpt-4o-mini", messages: [] });
  assertEquals(result.choices[0].message.content, "{}");
});

Deno.test("arguments reach the real client untouched", async () => {
  const meter = newCostMeter("m1");
  const real = new FakeOpenAI();
  const client = meterOpenAI(real, meter);
  await (client as any).chat.completions.create({ model: "gpt-4o-mini", temperature: 0.2, messages: [{ role: "user", content: "hi" }] });
  assertEquals((real.calls[0] as any).temperature, 0.2);
  assertEquals((real.calls[0] as any).messages[0].content, "hi");
});

Deno.test("the Whisper path passes through unmetered and unbroken", async () => {
  // process-meeting calls openai.audio.transcriptions on this same client. A
  // spread copy would have dropped it; the proxy must not touch it.
  const meter = newCostMeter("m1");
  const client = meterOpenAI(new FakeOpenAI(), meter);
  const out = await (client as any).audio.transcriptions.create();
  assertEquals(out.text, "whisper output");
  assertEquals(meter.llmCalls, 0);
});

Deno.test("methods using private fields still work through the proxy", () => {
  // The real SDK uses #private fields; calling such a method with the proxy as
  // `this` throws a TypeError. Binding to the target is what prevents it.
  const client = meterOpenAI(new FakeOpenAI(), newCostMeter("m1"));
  assertEquals((client as any).keyPrefix(), "sk-");
});

Deno.test("a response with no usage block is counted as a call, not a crash", async () => {
  const meter = newCostMeter("m1");
  const bare = { chat: { completions: { create: () => Promise.resolve({ choices: [] }) } } };
  const client = meterOpenAI(bare, meter);
  await (client as any).chat.completions.create({ model: "gpt-4o-mini" });
  assertEquals(meter.llmCalls, 1);
  assertEquals(meter.tokensIn, 0);
});

Deno.test("an error from the API propagates rather than being swallowed", async () => {
  const meter = newCostMeter("m1");
  const failing = {
    chat: { completions: { create: () => Promise.reject(new Error("rate limited")) } },
  };
  const client = meterOpenAI(failing, meter);
  let threw = false;
  try {
    await (client as any).chat.completions.create({ model: "gpt-4o-mini" });
  } catch (err) {
    threw = err instanceof Error && err.message === "rate limited";
  }
  assert(threw, "the caller must still see API failures");
  assertEquals(meter.llmCalls, 0, "a failed call bought no tokens");
});

Deno.test("two meetings in one isolate keep separate meters", async () => {
  // The reason the meter is not module-level state.
  const a = newCostMeter("meeting-a");
  const b = newCostMeter("meeting-b");
  const clientA = meterOpenAI(new FakeOpenAI(), a);
  const clientB = meterOpenAI(new FakeOpenAI(), b);
  await Promise.all([
    (clientA as any).chat.completions.create({ model: "gpt-4o-mini" }),
    (clientB as any).chat.completions.create({ model: "gpt-4o-mini" }),
    (clientA as any).chat.completions.create({ model: "gpt-4o-mini" }),
  ]);
  assertEquals(a.llmCalls, 2);
  assertEquals(b.llmCalls, 1);
});

Deno.test("saveCosts never throws when the database rejects it", async () => {
  const db = { rpc: () => Promise.resolve({ error: { message: "nope" } }) };
  await saveCosts(db, newCostMeter("m1"), { recallSeconds: 100 });
  const exploding = { rpc: () => { throw new Error("down"); } };
  await saveCosts(exploding, newCostMeter("m1"), {});
});

Deno.test("saveCosts sends the units the function expects", async () => {
  let sent: Record<string, unknown> | null = null;
  const db = {
    rpc: (_name: string, args: Record<string, unknown>) => {
      sent = args;
      return Promise.resolve({ error: null });
    },
  };
  const meter = newCostMeter("m1");
  meter.llmCalls = 3;
  meter.tokensIn = 50;
  meter.tokensOut = 10;
  meter.models.add("gpt-4o-mini");
  await saveCosts(db, meter, { recallSeconds: 1800, sttSeconds: 1800, sttProvider: "sarvam" });
  assertEquals(sent!.p_meeting_id, "m1");
  assertEquals(sent!.p_llm_calls, 3);
  assertEquals(sent!.p_recall_seconds, 1800);
  assertEquals(sent!.p_stt_provider, "sarvam");
  assertEquals(sent!.p_models, ["gpt-4o-mini"]);
});
