import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../server/worker.js";
import { memoryD1 } from "./d1-helper.mjs";

const now = Date.parse("2026-11-08T12:00:00Z");
const start = "2026-11-09T10:00:00.000Z";
const startSeconds = Date.parse(start) / 1_000;
const endSeconds = startSeconds + 25 * 60;
const details = { name: "Milan Grubor", email: "client@example.com", message: "A coaching enquiry.", website: "" };
const bookingDetails = { ...details, start, timeZone: "Europe/Berlin" };
const zoomUrl = "https://zoom.example.invalid/";
const joinUrl = "https://us02web.zoom.us/j/123456789?pwd=invite";
const env = () => ({
  PLUNK_API_KEY: "test-only", MAIL_FROM: "coach@example.com", MAIL_TO: "owner@example.com",
  NYLAS_API_KEY: "nylas-test", NYLAS_API_REGION: "eu", NYLAS_GRANT_ID: "icloud-grant", NYLAS_CONFIGURATION_ID: "coaching-config",
  NYLAS_WEBHOOK_SECRET: "webhook-test-only",
  ANALYTICS_DB: memoryD1(),
  REQUEST_LIMITER: { limit: async () => ({ success: true }) },
  RECIPIENT_LIMITER: { limit: async () => ({ success: true }) }
});
const request = (path, body, options = {}) => new Request(`https://coaching.example/api/${path}`, { method: "POST", headers: { Origin: "https://coaching.example", "Content-Type": "application/json", "Idempotency-Key": "test-request-1234", ...options }, body: JSON.stringify(body) });
const okay = (value, status = 200) => new Response(JSON.stringify(value), { status });
const queued = () => okay({ success: true, data: { emails: [{ status: "queued" }] } });
function mockHandler(callback) { return createHandler({ now: () => now, fetch: callback }); }
function providerGate() {
  let enter, release;
  const entered = new Promise((resolve) => { enter = resolve; });
  const resumed = new Promise((resolve) => { release = resolve; });
  return { entered, release, async wait() { enter(); await resumed; } };
}
function mockScheduler({ slots = [{ start_time: startSeconds, end_time: endSeconds, participants: ["private@example.com"] }], availabilityWindowStart, bookingStatus = "booked", bookingResponseStatus = 200, bookingConnectionFails = false, bookingGate, eventGate, emailGate, configuration, eventStart = startSeconds, confirmationFails = false, upcomingEvents = [] } = {}) {
  const calls = [];
  const sends = [];
  const eventRecord = { id: "event-123", title: "Coaching call", status: "confirmed", participants: [{ email: details.email }], conferencing: { details: { url: joinUrl } }, when: { start_time: eventStart, end_time: eventStart + 25 * 60 } };
  const handle = mockHandler(async (url, options) => {
    const path = new URL(url).pathname;
    const payload = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, path, options, payload });
    if (path === "/v3/scheduling/sessions") {
      assert.equal(options.headers.Authorization, "Bearer nylas-test");
      assert.deepEqual(payload, { configuration_id: "coaching-config", time_to_live: 5 });
      return okay({ data: { session_id: "private-session" } });
    }
    if (path === "/v3/grants/icloud-grant/scheduling/configurations/coaching-config") {
      return okay({ data: configuration ?? {
        requires_session_auth: true,
        participants: [{ is_organizer: true, booking: { calendar_id: "icloud-calendar" } }],
        availability: { duration_minutes: 25 },
        event_booking: { title: "Coaching call", booking_type: "booking", disable_emails: true, notify_participants: false, conferencing: { provider: "Zoom Meeting", autocreate: { conf_grant_id: "zoom-grant" } } }
      } });
    }
    if (path === "/v3/scheduling/availability") {
      assert.equal(options.headers.Authorization, "Bearer private-session");
      assert.equal(new URL(url).searchParams.has("start_time"), true);
      if (availabilityWindowStart !== undefined && Number(new URL(url).searchParams.get("start_time")) !== availabilityWindowStart) {
        return okay({ data: { time_slots: [] } });
      }
      return okay({ data: { time_slots: slots } });
    }
    if (path === "/v3/grants/icloud-grant/events") {
      assert.equal(options.headers.Authorization, "Bearer nylas-test");
      assert.equal(new URL(url).searchParams.get("attendees"), details.email);
      return okay({ data: upcomingEvents });
    }
    if (path === "/v3/scheduling/bookings") {
      if (bookingGate) await bookingGate.wait();
      if (bookingConnectionFails) throw new TypeError("Test connection failure");
      assert.equal(options.headers.Authorization, "Bearer private-session");
      assert.deepEqual(payload, {
        start_time: startSeconds, end_time: endSeconds,
        guest: { name: details.name, email: details.email, timezone: "Europe/Berlin" }
      });
      if (bookingResponseStatus !== 200) return okay({ error: { type: "test_booking_error" } }, bookingResponseStatus);
      eventRecord.status = "confirmed";
      eventRecord.when = { start_time: eventStart, end_time: eventStart + 25 * 60 };
      return okay({ data: { booking_id: "booking-123", status: bookingStatus, event_id: "event-123" } });
    }
    if (path === "/v3/grants/icloud-grant/events/event-123") {
      assert.equal(new URL(url).searchParams.get("calendar_id"), "icloud-calendar");
      if (eventGate) await eventGate.wait();
      return okay({ data: eventRecord });
    }
    if (url === "https://next-api.useplunk.com/v1/send") {
      sends.push(payload);
      if (emailGate) await emailGate.wait();
      return confirmationFails && payload.to === details.email ? okay({}, 500) : queued();
    }
    assert.fail(`Unexpected provider request to ${path}`);
  });
  return { handle, calls, sends, eventRecord };
}

function mockCounters(settings = env()) {
  const writes = [];
  const tasks = [];
  const database = settings.ANALYTICS_DB || memoryD1();
  settings.ANALYTICS_DB = {
    ...database,
    prepare(sql) {
      if (!sql.includes("INSERT INTO weekly_analytics")) return database.prepare(sql);
      assert.match(sql, /ON CONFLICT \(week_start, metric\) DO UPDATE SET total = total \+ 1/);
      return { bind(week, metric) { return { async run() { writes.push([week, metric]); return database.prepare(sql).bind(week, metric).run(); } }; } };
    }
  };
  return { settings, writes, context: { waitUntil(task) { tasks.push(task); } }, async flush() { await Promise.all(tasks); } };
}

test("strict phone metadata rejects junk, accepts valid international formatting", () => {
  const V = globalThis.CoachValidation;
  assert.equal(V.phone("+49 1512 3456789"), "+4915123456789");
  for (const phone of ["1234567", "+12222222222", "+49 hello", "+000 12345"]) assert.equal(V.phone(phone), null);
  assert.equal(V.validateDetails({ ...details, phone: "+4915123456789", goals: "", obstacles: "" }, "whatsapp"), null);
  assert.equal(V.email("name+tag@example.co.uk"), true);
  for (const email of ["a..b@example.com", "name@-bad.com", "name@example", "hello there@example.com"]) assert.equal(V.email(email), false);
  assert.equal(V.name("Željko O’Connor"), true);
  assert.equal(V.name("12345"), false);
});
test("contact and application reject a single name word and accept blank or valid salutations", async () => {
  const V = globalThis.CoachValidation;
  for (const name of ["Grubor", "Anne-Marie", "A -", "John 123", "John\nDoe"]) assert.equal(V.name(name), false);
  for (const name of ["Anne-Marie  O’Connor", "J. Li", "马 伟", "María García León"]) assert.equal(V.name(name), true);
  for (const salutation of [undefined, "", "Mr.", "Ms.", "Other"]) {
    assert.equal(V.validateDetails({ ...details, salutation }), null);
  }
  const handle = mockHandler(async () => assert.fail("Invalid details reached a provider"));
  for (const path of ["contact", "application", "book"]) {
    const single = await handle(request(path, { ...bookingDetails, name: "Grubor" }), env());
    assert.equal(single.status, 400);
    assert.deepEqual(await single.json(), { code: "invalid_name", field: "name" });
    const invalid = await handle(request(path, { ...bookingDetails, salutation: "Unknown" }), env());
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { code: "invalid_salutation", field: "salutation" });
  }
});
test("contact sends separate Plunk messages with distinct keys and escaped content", async () => {
  const sends = [];
  const handle = mockHandler(async (url, options) => {
    assert.equal(url, "https://next-api.useplunk.com/v1/send");
    assert.equal(options.headers.Authorization, "Bearer test-only");
    sends.push({ body: JSON.parse(options.body), key: options.headers["Idempotency-Key"] });
    return queued();
  });
  const response = await handle(request("contact", { ...details, salutation: "Ms.", message: "<script>no</script> {{subscribeUrl}}" }), env());
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, confirmationEmail: true });
  assert.equal(sends.length, 2);
  const [notice, receipt] = sends;
  assert.equal(notice.body.to, "owner@example.com");
  assert.equal(notice.body.reply, details.email);
  assert.match(notice.body.body, /&lt;script&gt;/);
  assert.match(notice.body.body, /Address: Ms\./);
  assert.equal(notice.body.body.includes("{{subscribeUrl}}"), false);
  assert.equal(receipt.body.to, details.email);
  assert.equal("subscribed" in receipt.body, false);
  assert.notEqual(notice.key, receipt.key);
});
test("an enquiry succeeds even if Plunk rejects its acknowledgement", async () => {
  const handle = mockHandler(async (_url, options) => {
    return JSON.parse(options.body).to === "owner@example.com" ? queued() : okay({ success: false }, 503);
  });
  const response = await handle(request("contact", details), env());
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, confirmationEmail: false });
});
test("optional WhatsApp goals and obstacle may be empty; invalid phone never reaches provider", async () => {
  let calls = 0;
  const handle = mockHandler(async () => { calls++; return queued(); });
  assert.equal((await handle(request("application", { ...details, phone: "+4915123456789", goals: "", obstacles: "" }), env())).status, 202);
  const bad = await handle(request("application", { ...details, phone: "+12222222222" }), env());
  assert.equal(bad.status, 400); assert.equal((await bad.json()).field, "phone"); assert.equal(calls, 2);
});
test("newsletter uses a Plunk confirmation link without changing subscription status", async () => {
  let payload;
  const handle = mockHandler(async (url, options) => {
    assert.equal(url, "https://next-api.useplunk.com/v1/send");
    payload = JSON.parse(options.body);
    return queued();
  });
  assert.equal((await handle(request("newsletter", { email: details.email }), env())).status, 202);
  assert.equal(payload.to, details.email);
  assert.match(payload.body, /href="\{\{subscribeUrl\}\}"/);
  assert.equal("subscribed" in payload, false);
});
test("wrong origin, large bodies and exhausted rate limits stop delivery", async () => {
  let calls = 0; const handle = mockHandler(async () => { calls++; return okay({}); });
  assert.equal((await handle(request("contact", details, { Origin: "https://other.example" }), env())).status, 403);
  assert.equal((await handle(request("contact", { ...details, message: "x".repeat(9000) }), env())).status, 413);
  const limited = env(); limited.REQUEST_LIMITER.limit = async () => ({ success: false });
  assert.equal((await handle(request("contact", details), limited)).status, 429); assert.equal(calls, 0);
});
test("provider errors and missing setup never produce a success response", async () => {
  const handle = mockHandler(async () => okay({ message: "provider detail must stay private" }, 500));
  for (const path of ["contact", "newsletter"]) {
    const response = await handle(request(path, details), env());
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: "service_unavailable" });
  }
  assert.equal((await handle(request("contact", details), { ...env(), PLUNK_API_KEY: "" })).status, 503);
  const skipped = mockHandler(async () => okay({ success: true, data: { emails: [{ status: "skipped" }] } }));
  assert.equal((await skipped(request("newsletter", details), env())).status, 503);
});
test("availability opens a private Nylas session and exposes only normalized 25-minute slot starts", async () => {
  const valid = { start_time: startSeconds, end_time: endSeconds, private: "private@example.com" };
  const { handle, calls } = mockScheduler({ slots: [valid, valid, { ...valid, end_time: endSeconds + 300 }] });
  const analytics = mockCounters();
  const response = await handle(new Request(`https://coaching.example/api/availability?${new URLSearchParams({ start: "2026-11-09T00:00:00.000Z", end: "2026-11-10T00:00:00.000Z", timeZone: "Europe/Berlin" })}`), analytics.settings, analytics.context);
  assert.deepEqual(await response.json(), { slots: [start], timeZone: "Europe/Berlin", durationMinutes: 25 });
  assert.match(calls[0].url, /^https:\/\/api\.eu\.nylas\.com\//);
  assert.equal(new URL(calls[1].url).searchParams.get("start_time"), String(Date.parse("2026-11-09T00:00:00.000Z") / 1_000));
  await analytics.flush();
  assert.deepEqual(analytics.writes, [["2026-11-02", "calendar_availability_requests"]]);
});
test("booking accepts an advertised slot when a different availability window would omit it", async () => {
  const availabilityStart = "2026-11-09T00:00:00.000Z";
  const { handle, calls, sends } = mockScheduler({ availabilityWindowStart: Date.parse(availabilityStart) / 1_000 });
  const availability = await handle(new Request(`https://coaching.example/api/availability?${new URLSearchParams({
    start: availabilityStart, end: "2026-11-10T00:00:00.000Z", timeZone: "Europe/Berlin"
  })}`), env());
  assert.equal(availability.status, 200);
  assert.deepEqual((await availability.json()).slots, [start]);

  const response = await handle(request("book", bookingDetails), env());
  assert.equal(response.status, 201);
  assert.equal((await response.json()).confirmationEmail, true);
  assert.equal(calls.filter(({ path }) => path === "/v3/scheduling/bookings").length, 1);
  assert.equal(calls.filter(({ path }) => path === "/v3/scheduling/availability").length, 1);
  assert.equal(sends.length, 2);
});
test("booking responds after Nylas confirms without waiting for the Zoom lookup or emails", async () => {
  const bookingGate = providerGate(), eventGate = providerGate(), emailGate = providerGate();
  const { handle, calls, sends } = mockScheduler({ bookingGate, eventGate, emailGate });
  const background = [];
  let responseFinished = false, backgroundFinished = false;
  const responsePromise = handle(request("book", bookingDetails), env(), {
    waitUntil(task) { background.push(task); }
  }).then((response) => { responseFinished = true; return response; });
  try {
    await bookingGate.entered;
    assert.equal(responseFinished, false);
    assert.equal(sends.length, 0);
    bookingGate.release();

    await eventGate.entered;
    const result = await Promise.race([
      responsePromise.then((response) => ({ response })),
      new Promise((resolve) => setImmediate(() => resolve({ blocked: true })))
    ]);
    assert.equal(result.blocked, undefined, "a confirmed booking must not wait for its notification work");
    assert.equal(result.response.status, 201);
    assert.deepEqual(await result.response.json(), { ok: true, bookingUid: "booking-123", confirmationEmailPending: true });
    assert.ok(background.length > 0);
    const backgroundWork = Promise.all(background).then(() => { backgroundFinished = true; });
    assert.equal(backgroundFinished, false);
    assert.equal(sends.length, 0);

    eventGate.release();
    await emailGate.entered;
    assert.equal(backgroundFinished, false);
    assert.ok(sends.length >= 1);
    emailGate.release();
    await backgroundWork;
    assert.equal(backgroundFinished, true);
    assert.equal(sends.length, 2);
    assert.ok(sends.find(({ to }) => to === details.email).body.includes(joinUrl));
    assert.equal(calls.filter(({ path }) => path === "/v3/scheduling/bookings").length, 1);
  } finally {
    bookingGate.release(); eventGate.release(); emailGate.release();
    await responsePromise;
    await Promise.all(background);
  }
});
test("booking emails and analytics follow a provider-confirmed booking", async () => {
  const { handle, calls, sends } = mockScheduler();
  const analytics = mockCounters();
  const response = await handle(request("book", { ...bookingDetails, salutation: "Other", eventTypeId: 999, allowConflicts: true }), analytics.settings, analytics.context);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, bookingUid: "booking-123", confirmationEmailPending: true });
  await analytics.flush();
  const bookedAt = calls.findIndex(({ path }) => path === "/v3/scheduling/bookings");
  const detailsAt = calls.findIndex(({ path }) => path === "/v3/grants/icloud-grant/events/event-123");
  assert.ok(bookedAt >= 2 && detailsAt > bookedAt);
  assert.equal(calls.some(({ path }) => path === "/v3/scheduling/availability"), false);
  assert.match(response.headers.get("Server-Timing"), /nylas_booking;dur=\d+(?:\.\d+)?/);
  const confirmation = sends.find(({ to }) => to === details.email);
  assert.match(confirmation.body, /11:00/);
  assert.ok(confirmation.body.includes(joinUrl));
  assert.ok(sends.find(({ to }) => to === "owner@example.com").body.includes(details.message));
  assert.deepEqual(analytics.writes, [["2026-11-02", "booking_attempts_valid"], ["2026-11-02", "bookings_confirmed"]]);
});
test("a background confirmation email failure is logged without changing the confirmed booking", async (t) => {
  const errorLog = t.mock.method(console, "error", () => {});
  const { handle, calls, sends } = mockScheduler({ confirmationFails: true });
  const background = [];
  const response = await handle(request("book", bookingDetails), env(), { waitUntil(task) { background.push(task); } });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, bookingUid: "booking-123", confirmationEmailPending: true });
  await Promise.all(background);
  assert.ok(background.length > 0);
  assert.equal(calls.filter(({ path }) => path === "/v3/scheduling/bookings").length, 1);
  assert.equal(sends.length, 2);
  assert.ok(errorLog.mock.calls.some(({ arguments: args }) => args[0] === "Booking confirmation email could not be queued"));
});
test("confirmed booking survives confirmation email failure and returns private fallback details to the applicant", async () => {
  const { handle } = mockScheduler({ confirmationFails: true });
  const response = await handle(request("book", bookingDetails), env());
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, bookingUid: "booking-123", confirmationEmail: false, contactEmail: "owner@example.com", zoomUrl: joinUrl });
});
test("pending, taken or misconfigured bookings produce no confirmation email or confirmed count", async () => {
  for (const [fixture, status, created] of [
    [{ bookingStatus: "pending" }, 503, true],
    [{ bookingResponseStatus: 409 }, 409, true],
    [{ configuration: { requires_session_auth: false } }, 503, false]
  ]) {
    const { handle, calls, sends } = mockScheduler(fixture);
    const analytics = mockCounters();
    const response = await handle(request("book", bookingDetails), analytics.settings, analytics.context);
    assert.equal(response.status, status);
    assert.equal(calls.some(({ path }) => path === "/v3/scheduling/bookings"), created);
    assert.equal(sends.length, 0);
    await analytics.flush();
    assert.deepEqual(analytics.writes, [["2026-11-02", "booking_attempts_valid"]]);
  }
});
test("booking errors do not trigger a different availability query or confirmation emails", async () => {
  for (const bookingResponseStatus of [400, 401, 403, 422, 429]) {
    const { handle, calls, sends } = mockScheduler({ bookingResponseStatus, slots: null });
    const response = await handle(request("book", bookingDetails), env());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "service_unavailable" });
    assert.equal(calls.filter(({ path }) => path === "/v3/scheduling/bookings").length, 1);
    assert.equal(calls.some(({ path }) => path === "/v3/scheduling/availability"), false);
    assert.equal(sends.length, 0);
  }
});
test("an uncertain booking write is not retried or followed by confirmation emails", async () => {
  for (const fixture of [{ bookingResponseStatus: 500 }, { bookingConnectionFails: true }]) {
    const { handle, calls, sends } = mockScheduler(fixture);
    const response = await handle(request("book", bookingDetails), env());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "booking_uncertain" });
    assert.equal(calls.filter(({ path }) => path === "/v3/scheduling/bookings").length, 1);
    assert.equal(sends.length, 0);
  }
});
test("the same email cannot book a second upcoming call, including case and whitespace changes", async () => {
  const settings = env();
  const { handle, calls, sends } = mockScheduler();
  assert.equal((await handle(request("book", bookingDetails), settings)).status, 201);
  const again = await handle(request("book", { ...bookingDetails, email: "  CLIENT@EXAMPLE.COM  " }), settings);
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { code: "booking_exists" });
  assert.equal(calls.filter(({ path }) => path === "/v3/scheduling/bookings").length, 1);
  assert.equal(sends.length, 2);
  const row = settings.ANALYTICS_DB.sqlite.prepare("SELECT * FROM booking_guards").get();
  assert.match(row.email_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(row).toLowerCase().includes(details.email), false);
});
test("booking limits survive a new handler instance", async () => {
  const settings = env();
  const first = mockScheduler(), second = mockScheduler();
  assert.equal((await first.handle(request("book", bookingDetails), settings)).status, 201);
  const again = await second.handle(request("book", bookingDetails), settings);
  assert.equal(again.status, 409);
  assert.equal(second.calls.some(({ path }) => path === "/v3/scheduling/bookings"), false);
});
test("simultaneous requests for the same email create at most one booking", async () => {
  const settings = env();
  const bookingGate = providerGate();
  const first = mockScheduler({ bookingGate }), second = mockScheduler();
  const pending = first.handle(request("book", bookingDetails), settings);
  try {
    await bookingGate.entered;
    const again = await second.handle(request("book", bookingDetails, { "Idempotency-Key": "another-request-1234" }), settings);
    assert.equal(again.status, 409);
    assert.deepEqual(await again.json(), { code: "booking_in_progress" });
    assert.equal(second.calls.some(({ path }) => path === "/v3/scheduling/bookings"), false);
  } finally {
    bookingGate.release();
    assert.equal((await pending).status, 201);
  }
});
test("a cancelled call allows the same email to book again", async () => {
  const settings = env();
  const { handle, calls, eventRecord } = mockScheduler();
  assert.equal((await handle(request("book", bookingDetails), settings)).status, 201);
  eventRecord.status = "cancelled";
  assert.equal((await handle(request("book", bookingDetails), settings)).status, 201);
  assert.equal(calls.filter(({ path }) => path === "/v3/scheduling/bookings").length, 2);
});
test("a definite booking failure releases the reservation for a retry", async () => {
  const settings = env();
  const failed = mockScheduler({ bookingResponseStatus: 400 });
  assert.equal((await failed.handle(request("book", bookingDetails), settings)).status, 503);
  const retry = mockScheduler();
  assert.equal((await retry.handle(request("book", bookingDetails), settings)).status, 201);
});
test("an uncertain booking blocks another create attempt without extending its hold", async () => {
  const settings = env();
  const failed = mockScheduler({ bookingConnectionFails: true });
  assert.equal((await failed.handle(request("book", bookingDetails), settings)).status, 503);
  const previous = settings.ANALYTICS_DB.sqlite.prepare("SELECT uncertain_until FROM booking_guards").get().uncertain_until;
  const retry = mockScheduler();
  const response = await retry.handle(request("book", { ...bookingDetails, start: "2026-11-10T10:00:00.000Z" }), settings);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "booking_uncertain" });
  assert.equal(retry.calls.some(({ path }) => path === "/v3/scheduling/bookings"), false);
  assert.equal(settings.ANALYTICS_DB.sqlite.prepare("SELECT uncertain_until FROM booking_guards").get().uncertain_until, previous);
});
test("bookings made before the guard was installed are included in the email limit", async () => {
  const upcomingEvents = [{
    id: "existing-event", title: "Coaching call", status: "confirmed",
    when: { start_time: startSeconds, end_time: endSeconds },
    participants: [{ email: "CLIENT@EXAMPLE.COM" }]
  }];
  const { handle, calls, sends } = mockScheduler({ upcomingEvents });
  const response = await handle(request("book", bookingDetails), env());
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "booking_exists" });
  assert.equal(calls.some(({ path }) => path === "/v3/scheduling/bookings"), false);
  assert.equal(sends.length, 0);
});
test("booking is unavailable when the persistent guard cannot be used", async () => {
  const settings = env();
  delete settings.ANALYTICS_DB;
  const { handle, calls } = mockScheduler();
  const response = await handle(request("book", bookingDetails), settings);
  assert.equal(response.status, 503);
  assert.equal(calls.some(({ path }) => path === "/v3/scheduling/bookings"), false);
});
test("page counters use the actual HTML responses and retain weekly totals only", async () => {
  const analytics = mockCounters({
    ASSETS: { fetch: async (request) => {
      if (new URL(request.url).pathname === "/index.html") return Response.redirect("https://coaching.example/");
      return new Response("page", { headers: { "Content-Type": "text/html; charset=utf-8" } });
    } }
  });
  const { settings, context } = analytics;
  const handle = mockHandler(() => assert.fail("Page load made a provider request"));
  for (const path of ["/", "/?retry=1", "/application/", "/faq.html", "/privacy-policy", "/legal-notice.html", "/index.html", "/assets/styles.css"]) {
    await handle(new Request(`https://coaching.example${path}`), settings, context);
  }
  await handle(new Request("https://coaching.example/", { method: "HEAD" }), settings, context);
  await analytics.flush();
  assert.deepEqual(analytics.writes, ["home", "home", "application", "faq", "privacy_policy", "legal_notice"].map((page) => ["2026-11-02", `${page}_page_requests`]));
});
test("unavailable analytics cannot interrupt a WhatsApp submission", async () => {
  const settings = { ...env(), ANALYTICS_DB: { prepare() { throw new Error("offline"); } } };
  const tasks = [];
  const { handle } = mockScheduler();
  const response = await handle(request("application", { ...details, phone: "+4915123456789" }), settings, { waitUntil(task) { tasks.push(task); } });
  assert.equal(response.status, 202);
  assert.equal(tasks.length, 1);
  await Promise.all(tasks);
});
test("authenticated Nylas reminder forwards the correct guest and skips cancelled or moved calls", async () => {
  const path = "https://coaching.example/api/nylas/reminders";
  const notification = JSON.stringify({
    type: "booking.reminder",
    data: { grant_id: "icloud-grant", object: {
      configuration_id: "coaching-config", booking_id: "booking-123", booking_info: {
        event_id: "event-123", organizer_calendar_id: "icloud-calendar", start_time: startSeconds,
        organizer_email: "organizer@example.com", guest_timezone: "Europe/Berlin", location: zoomUrl,
        participants: [{ email: "organizer@example.com" }, { email: details.email, name: details.name }]
      }
    } }
  });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env().NYLAS_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(notification))).toString("hex");
  const webhook = (provided = signature) => new Request(path, { method: "POST", headers: { "x-nylas-signature": provided }, body: notification });
  const { handle, sends } = mockScheduler();
  assert.equal(await (await handle(new Request(`${path}?challenge=ready`), env())).text(), "ready");
  assert.equal((await handle(webhook("0".repeat(64)), env())).status, 401);
  assert.equal((await handle(webhook(), env())).status, 200);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].to, details.email);
  assert.match(sends[0].subject, /Reminder/);
  assert.ok(sends[0].body.includes(joinUrl));
  const moved = mockScheduler({ eventStart: startSeconds + 3_600 });
  assert.equal((await moved.handle(webhook(), env())).status, 200);
  assert.equal(moved.sends.length, 0);
});
