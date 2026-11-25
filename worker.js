import "../assets/vendor/libphonenumber-max.js";
import "../assets/validation.js";
import { countRequest, pageRequestMetric } from "./analytics.js";
import { BOOKING_MINUTES, createScheduler, nylasConfigured, zoomJoinUrl } from "./nylas.js";

const V = globalThis.CoachValidation;
const DAY = 86400000;
const PLUNK_SEND_URL = "https://next-api.useplunk.com/v1/send";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
class PublicError extends Error { constructor(code, status = 400, field) { super(code); this.code = code; this.status = status; this.field = field; } }
const fail = (code, status, field) => { throw new PublicError(code, status, field); };
const zoneIsValid = (zone) => { try { return typeof zone === "string" && zone.length < 100 && !!new Intl.DateTimeFormat("en", { timeZone: zone }); } catch { return false; } };
const dateValue = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ? Date.parse(value) : NaN;
const clean = (value) => typeof value === "string" ? value.trim() : "";
const htmlEntities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "{": "&#123;", "}": "&#125;" };
const html = (value) => value.replace(/[&<>"'{}]/g, (character) => htmlEntities[character]).replace(/\n/g, "<br>");

function capabilities(env) {
  const plunkReady = !!(env.PLUNK_API_KEY && V.email(env.MAIL_FROM));
  const mailReady = plunkReady && V.email(env.MAIL_TO);
  return {
    contact: mailReady,
    newsletter: plunkReady,
    calendar: mailReady && nylasConfigured(env),
    durationMinutes: BOOKING_MINUTES
  };
}
async function readBytes(request, maxBytes) {
  if (Number(request.headers.get("Content-Length")) > maxBytes) fail("invalid_request", 413);
  if (!request.body) fail("invalid_request", 400);
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); fail("invalid_request", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.length; });
  return bytes;
}
function parseBody(bytes) {
  try { const body = JSON.parse(new TextDecoder().decode(bytes)); if (!body || typeof body !== "object" || Array.isArray(body)) fail("invalid_request", 400); return body; }
  catch { fail("invalid_request", 400); }
}
async function readBody(request) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) fail("invalid_request", 415);
  return parseBody(await readBytes(request, 8192));
}
async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function appointmentTime(start, timeZone) {
  const fields = { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short" };
  return new Intl.DateTimeFormat("en-GB", fields).format(start);
}
function enquiryDetails(body) {
  return [`Name: ${clean(body.name)}`, ...(body.salutation ? [`Address: ${body.salutation}`] : []), `E-Mail: ${clean(body.email)}`];
}

export function createHandler({ fetch: providerFetch = globalThis.fetch, now = () => Date.now() } = {}) {
  async function rate(env, binding, key) {
    if (!env[binding]?.limit) fail("service_unavailable", 503);
    const result = await env[binding].limit({ key: await digest(key) });
    if (!result.success) fail("rate_limited", 429);
  }
  async function provider(url, options, timeout = 12_000) {
    try {
      const response = await providerFetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(timeout) });
      let data; try { data = await response.json(); } catch { data = null; }
      return { response, data };
    } catch (error) {
  const message = typeof error?.message === "string" ? error.message : "";
  let code = "provider_fetch_failed";

  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    code = "provider_timeout";
  } else if (/header|ByteString|ISO-8859|invalid character/i.test(message)) {
    code = "provider_invalid_headers";
  } else if (/illegal invocation|incorrect.*this/i.test(message)) {
    code = "provider_invalid_receiver";
  } else if (/AbortSignal|timeout.*not a function/i.test(message)) {
    code = "provider_timeout_setup_failed";
  } else if (/redirect/i.test(message)) {
    code = "provider_redirect_blocked";
  } else if (/dns|resolve|resolution|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    code = "provider_dns_failed";
  } else if (/ssl|tls|certificate/i.test(message)) {
    code = "provider_tls_failed";
  } else if (/different request|outside.*request|request context/i.test(message)) {
    code = "provider_request_context_failed";
  }

  fail(code, 503);
}
  }
  const scheduler = createScheduler(async (...args) => {
  const path = new URL(args[0]).pathname;
  const stage = path === "/v3/scheduling/sessions" ? "session"
    : path === "/v3/scheduling/availability" ? "availability" : null;

  if (!stage) return provider(...args);

  let result;
  try {
    result = await provider(...args);
 } catch (error) {
  if (error instanceof PublicError) throw error;
  fail(`calendar_${stage}_connection_failed`, 503);
}

  if (!result.response.ok) {
    fail(`calendar_${stage}_http_${result.response.status}`, 503);
  }

  if (stage === "session" &&
      (typeof result.data?.data?.session_id !== "string" ||
       !result.data.data.session_id)) {
    fail("calendar_session_invalid_response", 503);
  }

  const slots = result.data?.data?.time_slots;
  if (stage === "availability" &&
      slots !== null && !Array.isArray(slots)) {
    fail("calendar_availability_invalid_response", 503);
  }

  return result;
}, fail);
  async function sendPlunk(env, message, requestId, purpose, timeout) {
    const sender = { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME || "Milan Grubor" };
    const body = JSON.stringify({ from: sender, ...message });
    const key = `${purpose}-${requestId}-${await digest(body)}`;
    const { response, data } = await provider(PLUNK_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PLUNK_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key
      },
      body
    }, timeout);
    if (response.status === 409 && data?.error?.code === "IDEMPOTENCY_KEY_REUSED") fail("delivery_uncertain", 409);
    const delivery = data?.data?.emails?.[0];
    if (!response.ok || data?.success !== true || !["queued", "sent", "scheduled"].includes(delivery?.status)) {
      fail("service_unavailable", 503);
    }
  }
  async function mail(env, body, kind, requestId) {
    const isContact = kind === "contact";
    const title = isContact ? "New website enquiry" : "New WhatsApp coaching request";
    const email = clean(body.email);
    const lines = enquiryDetails(body);
    if (!isContact) {
      lines.push(`WhatsApp: ${V.phone(body.phone)}`);
      lines.push(`Goals: ${clean(body.goals) || "Not provided"}`);
      lines.push(`Obstacle: ${clean(body.obstacles) || "Not provided"}`);
    }
    lines.push("", clean(body.message) || "No additional message.");
    await sendPlunk(env, { to: env.MAIL_TO, subject: title, body: `<p>${html(lines.join("\n"))}</p>`, reply: email }, requestId, `${kind}-enquiry`);

    const requestType = isContact ? "message" : "WhatsApp contact request";
    const receipt = `Hello ${clean(body.name)},\n\nI received your ${requestType} and will get back to you.\n\n${env.MAIL_FROM_NAME || "Milan Grubor"}`;
    try {
      await sendPlunk(env, { to: email, subject: "Your request has been received", body: `<p>${html(receipt)}</p>`, reply: env.MAIL_TO }, requestId, `${kind}-receipt`);
      return true;
    } catch {
      // The enquiry is already queued. Keep the receipt state separate so the visitor does not resend it.
      return false;
    }
  }
  async function videoEmail(env, { email, name, start, timeZone, zoomUrl }, bookingId, reminder = false) {
    const time = appointmentTime(start, timeZone);
    const subject = reminder ? "Reminder: your coaching call with Milan Grubor" : "Your coaching call with Milan Grubor is booked";
    const introduction = reminder ? "Here are the details for your upcoming coaching call." : "Your coaching call is confirmed.";
    const link = zoomUrl ? `<a href="${html(zoomUrl)}">Join the Zoom call</a>` : "I’ll send your Zoom link to this address before the call.";
    const content = `<p>Hello ${html(name)},</p><p>${introduction}</p><p>${html(time)}<br>${BOOKING_MINUTES}-minute video call via Zoom</p><p>${link}</p><p>Reply to this email if you need to change or cancel the call.</p><p>${html(env.MAIL_FROM_NAME || "Milan Grubor")}</p>`;
    const key = reminder ? `${bookingId}-${start}` : bookingId;
    await sendPlunk(env, { to: email, subject, body: content, reply: env.MAIL_TO }, key, reminder ? "booking-reminder" : "booking-confirmation", reminder ? 5_000 : undefined);
  }

  async function bookingEmails(env, body, start, { booking, calendarId }) {
    let zoomUrl = zoomJoinUrl(booking.location, booking.description);
    if (!zoomUrl) {
      try {
        const event = await scheduler.event(env, booking.event_id, calendarId);
        zoomUrl = zoomJoinUrl(event?.conferencing?.details?.url, event?.location, event?.description);
      } catch {
        // The booking is already confirmed. The owner can retrieve the link from the calendar.
      }
    }
    const email = clean(body.email);
    const guest = { email, name: clean(body.name), start, timeZone: body.timeZone, zoomUrl };
    const lines = [
      ...enquiryDetails(body),
      `Video call: ${appointmentTime(start, body.timeZone)} (visitor’s time zone)`,
      `Nylas booking reference: ${booking.booking_id}`,
      zoomUrl ? `Zoom: ${zoomUrl}` : "Retrieve the Zoom link from the calendar and send it to the applicant.",
      "",
      clean(body.message) || "No additional message."
    ];
    const [confirmation, owner] = await Promise.allSettled([
      videoEmail(env, guest, booking.booking_id),
      sendPlunk(env, { to: env.MAIL_TO, subject: "New coaching video call booked", body: `<p>${html(lines.join("\n"))}</p>`, reply: email }, booking.booking_id, "booking-owner")
    ]);
    if (confirmation.status === "rejected") console.error("Booking confirmation email could not be queued");
    if (owner.status === "rejected") console.error("Booking owner email could not be queued");
    const confirmationEmail = confirmation.status === "fulfilled";
    return { confirmationEmail, ...(!confirmationEmail ? { contactEmail: env.MAIL_TO, zoomUrl } : {}) };
  }

  async function bookingReminder(request, env) {
    if (request.method === "GET") {
      const challenge = new URL(request.url).searchParams.get("challenge");
      if (!challenge || challenge.length > 512 || /[\x00-\x1F\x7F]/.test(challenge)) fail("invalid_request", 400);
      return new Response(challenge, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (request.method !== "POST") fail("invalid_request", 405);
    if (!env.NYLAS_WEBHOOK_SECRET || !capabilities(env).calendar) fail("service_unavailable", 503);
    const signature = request.headers.get("x-nylas-signature");
    if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) fail("invalid_request", 401);
    const bytes = await readBytes(request, 65_536);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.NYLAS_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signatureBytes = Uint8Array.from(signature.match(/../g), (byte) => parseInt(byte, 16));
    if (!await crypto.subtle.verify("HMAC", key, signatureBytes, bytes)) fail("invalid_request", 401);
    const notification = parseBody(bytes);
    const payload = notification.data?.object;
    const info = payload?.booking_info;
    if (notification.type !== "booking.reminder" || notification.data?.grant_id !== env.NYLAS_GRANT_ID ||
        payload?.configuration_id !== env.NYLAS_CONFIGURATION_ID || info?.is_group_event === true) return json({ ok: true });
    const start = info?.start_time * 1_000;
    if (!Number.isSafeInteger(start) || start <= now()) return json({ ok: true });
    const guestList = info.participants?.filter((person) => V.email(person.email) && person.email.toLowerCase() !== info.organizer_email?.toLowerCase());
    if (!V.email(info.organizer_email) || guestList?.length !== 1 || typeof payload.booking_id !== "string") fail("invalid_request", 400);
    const [guest] = guestList;
    // Skip stale reminders when the calendar event was deleted or moved.
    const event = await scheduler.event(env, info.event_id, info.organizer_calendar_id, 4_000);
    if (!event || event.status === "cancelled" || event.when?.start_time !== info.start_time) return json({ ok: true });
    const zoomUrl = zoomJoinUrl(event.conferencing?.details?.url, event.location, event.description, info.location);
    if (!zoomUrl) fail("service_unavailable", 503);
    const timeZone = zoneIsValid(info.guest_timezone) ? info.guest_timezone : "Europe/Berlin";
    await videoEmail(env, { email: guest.email, name: clean(guest.name), start, timeZone, zoomUrl }, payload.booking_id, true);
    return json({ ok: true });
  }
  return async function handle(request, env = {}, context) {
    const url = new URL(request.url);
    const count = (metric) => countRequest(env, context, metric, now());
    if (!url.pathname.startsWith("/api/")) {
      const response = env.ASSETS ? await env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
      count(pageRequestMetric(request, response));
      return response;
    }
    try {
      const path = url.pathname;
      if (path === "/api/status" && request.method === "GET") {
  const validId = (value) =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);

  return json({
    ...capabilities(env),
    checks: {
      NYLAS_API_KEY: !!env.NYLAS_API_KEY,
      NYLAS_API_REGION: ["eu", "us"].includes(env.NYLAS_API_REGION),
      NYLAS_GRANT_ID: validId(env.NYLAS_GRANT_ID),
      NYLAS_CONFIGURATION_ID: validId(env.NYLAS_CONFIGURATION_ID)
    }
  });
}
      if (path === "/api/nylas/reminders") return await bookingReminder(request, env);
      const isAvailability = path === "/api/availability";
      if (!isAvailability && !["/api/contact", "/api/application", "/api/newsletter", "/api/book"].includes(path)) fail("not_found", 404);
      if (request.method !== (isAvailability ? "GET" : "POST")) fail("invalid_request", 405);
      if (!isAvailability && request.headers.get("Origin") !== url.origin) fail("invalid_request", 403);
      await rate(env, "REQUEST_LIMITER", `${path}:${request.headers.get("CF-Connecting-IP") || "local"}`);
      const status = capabilities(env);
      if (isAvailability) {
        if (!status.calendar) fail("service_unavailable", 503);
        const start = url.searchParams.get("start"), end = url.searchParams.get("end"), timeZone = url.searchParams.get("timeZone");
        const a = dateValue(start), b = dateValue(end);
        if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 35 * DAY || a < now() - 32 * DAY || b > now() + 370 * DAY || !zoneIsValid(timeZone)) fail("invalid_request", 400);
        count("calendar_availability_requests");
        const starts = await scheduler.availability(env, Math.max(Math.ceil(a / 1_000), Math.ceil(now() / 1_000)), Math.floor(b / 1_000));
        const slots = starts.map((start) => new Date(start * 1_000).toISOString());
        return json({ slots, timeZone, durationMinutes: status.durationMinutes });
      }
      const body = await readBody(request);
      if (typeof body.website !== "undefined" && typeof body.website !== "string") fail("invalid_request", 400);
      if (body.website) return json({ ok: true }, 202);
      if (!V.email(body.email)) fail("invalid_email", 400, "email");
      await rate(env, "RECIPIENT_LIMITER", `${path}:${body.email.trim().toLowerCase()}`);
      const requestId = request.headers.get("Idempotency-Key");
      if (!requestId || !/^[A-Za-z0-9-]{8,100}$/.test(requestId)) fail("invalid_request", 400);
      if (path === "/api/newsletter") {
        if (!status.newsletter) fail("service_unavailable", 503);
        // Plunk creates new recipients unsubscribed. Its confirmation link opts them in.
        await sendPlunk(env, {
          to: clean(body.email),
          subject: "Confirm your Milan Grubor newsletter subscription",
          body: '<p>Confirm your email address to receive my newsletter.</p><p><a href="{{subscribeUrl}}">Confirm my subscription</a></p><p>Milan Grubor</p>'
        }, requestId, "newsletter-confirmation");
        return json({ ok: true }, 202);
      }
      const validation = V.validateDetails(body, path === "/api/contact" ? "contact" : path === "/api/application" ? "whatsapp" : "application");
      if (validation) fail(validation.code, 400, validation.field);
      if (path !== "/api/book") {
        if (!status.contact) fail("service_unavailable", 503);
        const confirmationEmail = await mail(env, body, path === "/api/contact" ? "contact" : "whatsapp", requestId);
        if (path === "/api/application") count("whatsapp_requests_successful");
        return json({ ok: true, confirmationEmail }, 202);
      }
      if (!status.calendar) fail("service_unavailable", 503);
      const start = dateValue(body.start);
      if (!Number.isFinite(start) || start % 1_000 !== 0 || start <= now() || start > now() + 366 * DAY || !zoneIsValid(body.timeZone)) fail("invalid_request", 400);
      count("booking_attempts_valid");
      const result = await scheduler.book(env, start / 1_000, { name: clean(body.name), email: clean(body.email), timezone: body.timeZone });
      count("bookings_confirmed");
      const receipts = bookingEmails(env, body, start, result);
      if (typeof context?.waitUntil === "function") {
        context.waitUntil(receipts.catch(() => {
          console.error("Booking notification work could not be completed");
        }));
        return json({ ok: true, bookingUid: result.booking.booking_id, confirmationEmailPending: true }, 201);
      }
      return json({ ok: true, bookingUid: result.booking.booking_id, ...await receipts }, 201);
    } catch (error) {
      return json({ code: error instanceof PublicError ? error.code : "service_unavailable", ...(error instanceof PublicError && error.field ? { field: error.field } : {}) }, error instanceof PublicError ? error.status : 503);
    }
  };
}
export default { fetch: createHandler() };
