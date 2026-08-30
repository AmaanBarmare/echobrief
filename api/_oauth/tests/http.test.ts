import test from "node:test";
import assert from "node:assert/strict";
import { firstString, parseBody } from "../http.js";

const fake = (body: unknown, contentType: string) =>
  ({ body, headers: { "content-type": contentType } }) as any;

test("parseBody reads a urlencoded string", () => {
  const out = parseBody(fake("grant_type=authorization_code&code=abc%20d", "application/x-www-form-urlencoded"));
  assert.deepEqual(out, { grant_type: "authorization_code", code: "abc d" });
});

test("parseBody reads an object Vercel already parsed", () => {
  const out = parseBody(fake({ grant_type: "refresh_token", n: 5 }, "application/x-www-form-urlencoded"));
  assert.deepEqual(out, { grant_type: "refresh_token", n: "5" });
});

test("parseBody reads a JSON string", () => {
  const out = parseBody(fake('{"client_name":"Claude"}', "application/json"));
  assert.deepEqual(out, { client_name: "Claude" });
});

test("parseBody tolerates an empty or malformed body", () => {
  assert.deepEqual(parseBody(fake(undefined, "application/json")), {});
  assert.deepEqual(parseBody(fake("{not json", "application/json")), {});
});

test("firstString takes the first of an array and ignores non-strings", () => {
  assert.equal(firstString(["a", "b"]), "a");
  assert.equal(firstString("x"), "x");
  assert.equal(firstString(undefined), undefined);
  assert.equal(firstString(3), undefined);
});
