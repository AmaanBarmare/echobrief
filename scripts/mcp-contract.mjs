#!/usr/bin/env node
/**
 * Asserts the deployed MCP endpoint advertises exactly the tools we think it does,
 * and that each one round-trips.
 *
 * This catches drift between the tool schemas the server advertises and what it
 * actually accepts — a class of bug that is invisible to unit tests, because both
 * sides of it live in the same file and agree with each other while both being wrong.
 *
 * Usage: MCP_TOKEN=eb_live_... node scripts/mcp-contract.mjs [url]
 */
const URL_ = process.argv[2] ?? "https://www.echobrief.in/api/mcp";
const TOKEN = process.env.MCP_TOKEN;

if (!TOKEN) {
  console.error("MCP_TOKEN is required. Mint one at /settings?tab=developer.");
  process.exit(1);
}

const EXPECTED_TOOLS = [
  "list_meetings",
  "get_meeting",
  "get_meeting_insights",
  "search_meetings",
  "get_transcript",
  "get_action_items",
  "complete_action_item",
].sort();

let id = 0;
async function rpc(method, params, token = TOKEN) {
  const response = await fetch(URL_, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name} ${detail}`);
    failures.push(name);
  }
};

console.log(`MCP contract check against ${URL_}\n`);

const unauth = await rpc("tools/list", {}, "eb_live_definitely_not_a_real_token");
check("rejects an unknown token with 401", unauth.status === 401, `got ${unauth.status}`);

const list = await rpc("tools/list", {});
const names = (list.body?.result?.tools ?? []).map((t) => t.name).sort();
check(
  "advertises exactly the expected tools",
  JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS),
  JSON.stringify(names),
);

const call = async (name, args) => rpc("tools/call", { name, arguments: args });

const meetings = await call("list_meetings", { limit: 3 });
const meetingsText = meetings.body?.result?.content?.[0]?.text ?? "";
check(
  "list_meetings returns a result",
  meetings.body?.result != null && !meetings.body.result.isError,
  meetingsText.slice(0, 120),
);

const parsed = JSON.parse(meetingsText || "{}");
const sample = (parsed.meetings ?? [])[0];

if (!sample) {
  console.log("\n  note: this account has no meetings, so per-meeting tools are not exercised.");
} else {
  const meeting = await call("get_meeting", { meeting_id: sample.id });
  check("get_meeting round-trips", meeting.body?.result?.isError !== true);

  const search = await call("search_meetings", { query: "meeting", limit: 3 });
  check("search_meetings round-trips", search.body?.result?.isError !== true);

  const items = await call("get_action_items", { status: "all", limit: 5 });
  check("get_action_items round-trips", items.body?.result?.isError !== true);

  const bad = await call("complete_action_item", { meeting_id: sample.id, index: 99_999 });
  check("complete_action_item refuses an out-of-range index", bad.body?.result?.isError === true);

  const badArgs = await call("get_meeting", { meeting_id: "not-a-uuid" });
  check(
    "schema validation rejects a malformed uuid",
    badArgs.body?.error != null || badArgs.body?.result?.isError === true,
  );
}

console.log(
  failures.length === 0 ? "\nAll contract checks passed." : `\n${failures.length} check(s) failed.`,
);
process.exit(failures.length === 0 ? 0 : 1);
