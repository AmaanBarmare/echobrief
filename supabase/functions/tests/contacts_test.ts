import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveContacts } from "../_shared/contacts.ts";

const ATTENDEES = [
  { email: "vineet@oltaflock.ai", organizer: true },
  { email: "khush@oltaflock.ai", self: true },
  { email: "mathew@ryanandcotravel.com.au" },
  { email: "Mathew@RyanAndCoTravel.com.au" }, // duplicate, different case
  { email: "jane.doe@gmail.com", displayName: "Jane Doe" },
];

Deno.test("deriveContacts keeps only external attendees, deduped by email", () => {
  const c = deriveContacts(ATTENDEES);
  assertEquals(c.map((x) => x.email), ["mathew@ryanandcotravel.com.au", "jane.doe@gmail.com"]);
});

Deno.test("deriveContacts guesses name from the local part and company from the domain", () => {
  const [mathew, jane] = deriveContacts(ATTENDEES);
  assertEquals(mathew.name, "Mathew");
  assertEquals(mathew.company, "Ryanandcotravel");
  assertEquals(mathew.domain, "ryanandcotravel.com.au");
  // Display name wins; generic mail domains are not companies.
  assertEquals(jane.name, "Jane Doe");
  assertEquals(jane.company, null);
});

Deno.test("deriveContacts is empty for internal-only meetings", () => {
  assertEquals(deriveContacts([{ email: "a@x.com", self: true }, { email: "b@x.com" }]), []);
  assertEquals(deriveContacts([]), []);
});
