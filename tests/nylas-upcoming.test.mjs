import test from "node:test";
import assert from "node:assert/strict";
import { createScheduler } from "../server/nylas.js";

const now = 1_800_000_000;
const day = 86400;
const env = { NYLAS_API_KEY: "test-only", NYLAS_API_REGION: "eu", NYLAS_GRANT_ID: "test-grant" };
const config = { calendarId: "test-calendar" };
const match = { id: "event", status: "confirmed", when: { start_time: now + day, end_time: now + day + 1500 }, participants: [{ email: "CLIENT@EXAMPLE.COM" }] };
const fail = (code, status) => { throw Object.assign(new Error(code), { code, status }); };
const result = (data, status = 200) => ({ response: new Response(null, { status }), data });

test("upcoming lookup follows pagination and respects iCloud's query window limit", async () => {
  const calls = [];
  const scheduler = createScheduler(async (url, options) => {
    const parsed = new URL(url);
    calls.push(parsed);
    assert.equal(options.headers.Authorization, "Bearer test-only");
    assert.equal(parsed.searchParams.get("attendees"), "client@example.com");
    assert.equal(parsed.searchParams.get("calendar_id"), config.calendarId);
    const start = Number(parsed.searchParams.get("start")), end = Number(parsed.searchParams.get("end"));
    assert.ok(end - start <= 365 * day);
    if (start > now) return result({ data: [] });
    if (!parsed.searchParams.has("page_token")) return result({ data: [], next_cursor: "next-page" });
    assert.equal(parsed.searchParams.get("page_token"), "next-page");
    return result({ data: [match] });
  }, fail);
  assert.deepEqual(await scheduler.upcoming(env, config, "  Client@Example.com  ", now), match);
  assert.equal(calls.length, 3);
});

test("past, cancelled and other attendees' events do not consume a booking", async () => {
  const events = [
    { ...match, status: "cancelled" },
    { ...match, when: { end_time: now } },
    { ...match, participants: [{ email: "another@example.com" }] }
  ];
  const scheduler = createScheduler(async () => result({ data: events }), fail);
  assert.equal(await scheduler.upcoming(env, config, "client@example.com", now), null);
});

test("failed or malformed calendar lookups block creation", async () => {
  for (const response of [result({}, 500), result({ data: null }), result({ data: {} })]) {
    const scheduler = createScheduler(async () => response, fail);
    await assert.rejects(scheduler.upcoming(env, config, "client@example.com", now), { code: "service_unavailable" });
  }
});

test("a repeated pagination cursor cannot allow a partial calendar scan", async () => {
  const scheduler = createScheduler(async () => result({ data: [], next_cursor: "repeated" }), fail);
  await assert.rejects(scheduler.upcoming(env, config, "client@example.com", now), { code: "service_unavailable" });
});
