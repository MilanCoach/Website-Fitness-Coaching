import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { reserveBooking } from "../server/booking-limit.js";
import { memoryD1 } from "./d1-helper.mjs";

const now = 1_800_000_000;
const email = "client@example.com";
const config = { calendarId: "calendar" };
const helpers = {
  digest: async (value) => createHash("sha256").update(value).digest("hex"),
  fail(code, status) { throw Object.assign(new Error(code), { code, status }); }
};
const emptyCalendar = { event: async () => null, upcoming: async () => null };

test("a completed call expires its stored limit and permits another booking", async () => {
  const env = { ANALYTICS_DB: memoryD1() };
  const first = await reserveBooking(env, email, now, helpers);
  await first.check(emptyCalendar, config);
  await first.confirm({ booking: { event_id: "event" }, calendarId: "calendar" }, now + 60);
  const next = await reserveBooking(env, email, now + 61, helpers);
  await next.check(emptyCalendar, config);
  await next.release(null, now + 3600);
});

test("a deleted calendar event releases the email for a new call", async () => {
  const env = { ANALYTICS_DB: memoryD1() };
  const first = await reserveBooking(env, email, now, helpers);
  await first.confirm({ booking: { event_id: "event" }, calendarId: "calendar" }, now + 3600);
  const next = await reserveBooking(env, email, now + 1, helpers);
  await next.check(emptyCalendar, config);
  await next.release(null, now + 7200);
});

test("different email addresses can reserve concurrently", async () => {
  const env = { ANALYTICS_DB: memoryD1() };
  const [first, second] = await Promise.all([
    reserveBooking(env, email, now, helpers),
    reserveBooking(env, "another@example.com", now, helpers)
  ]);
  assert.equal(env.ANALYTICS_DB.sqlite.prepare("SELECT COUNT(*) AS count FROM booking_guards").get().count, 2);
  await Promise.all([first.release(null, now + 3600), second.release(null, now + 3600)]);
});

test("a rescheduled call is still counted after its old expiry time", async () => {
  const env = { ANALYTICS_DB: memoryD1() };
  const first = await reserveBooking(env, email, now, helpers);
  await first.confirm({ booking: { event_id: "event" }, calendarId: "calendar" }, now + 60);
  const next = await reserveBooking(env, email, now + 61, helpers);
  const event = { id: "event", when: { end_time: now + 7200 } };
  const calendar = { event: async () => event, upcoming: async () => event };
  await assert.rejects(next.check(calendar, config), { code: "booking_exists" });
  await next.release({ code: "booking_exists" }, now + 3600);
  assert.equal(env.ANALYTICS_DB.sqlite.prepare("SELECT booking_ends_at FROM booking_guards").get().booking_ends_at, now + 7200);
});

test("database failure does not silently disable the limit", async () => {
  const db = memoryD1();
  const env = { ANALYTICS_DB: { ...db, batch: async () => { throw new Error("database unavailable"); } } };
  await assert.rejects(reserveBooking(env, email, now, helpers), { code: "service_unavailable", status: 503 });
});

test("a state-save failure after confirmation preserves the reservation instead of inviting a retry", async (t) => {
  t.mock.method(console, "error", () => {});
  const db = memoryD1();
  const env = { ANALYTICS_DB: {
    ...db,
    prepare(sql) {
      if (sql.startsWith("UPDATE booking_guards SET")) throw new Error("write unavailable");
      return db.prepare(sql);
    }
  } };
  const reservation = await reserveBooking(env, email, now, helpers);
  await reservation.confirm({ booking: { event_id: "event" }, calendarId: "calendar" }, now + 3600);
  await reservation.release(null, now + 3600);
  await assert.rejects(reserveBooking(env, email, now + 1, helpers), { code: "booking_in_progress" });
});
