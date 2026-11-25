export const BOOKING_MINUTES = 25;
const apiHosts = { eu: "https://api.eu.nylas.com/v3", us: "https://api.us.nylas.com/v3" };
const durationSeconds = BOOKING_MINUTES * 60;
const id = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);

export function nylasConfigured(env) {
  return !!env.NYLAS_API_KEY && Object.hasOwn(apiHosts, env.NYLAS_API_REGION) &&
    id(env.NYLAS_GRANT_ID) && id(env.NYLAS_CONFIGURATION_ID);
}

export function zoomJoinUrl(...fields) {
  for (const field of fields) {
    if (typeof field !== "string") continue;
    const links = field.match(/https:\/\/[^\s<>"']+/gi) ?? [];
    for (const link of links) {
      try {
        const url = new URL(link.replaceAll("&amp;", "&"));
        if (url.username || url.password || url.port) continue;
        if (!/(^|\.)zoom\.(us|com)$/i.test(url.hostname)) continue;
        if (/^\/(?:j\/\d+|my\/[\w.-]+|wc\/join\/\d+)(?:\/|$)/.test(url.pathname)) return url.href;
      } catch {
        continue;
      }
    }
  }
  return "";
}

export function createScheduler(provider, fail) {
  function request(env, path, { token = env.NYLAS_API_KEY, body, timeout = 8_000 } = {}) {
    return provider(`${apiHosts[env.NYLAS_API_REGION]}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    }, timeout);
  }

  async function session(env) {
    const { response, data } = await request(env, "/scheduling/sessions", {
      body: { configuration_id: env.NYLAS_CONFIGURATION_ID, time_to_live: 5 },
      timeout: 6_000
    });
    const token = data?.data?.session_id;
    if (!response.ok || typeof token !== "string" || !token) fail("service_unavailable", 503);
    return token;
  }

  async function configuration(env) {
    const path = `/grants/${env.NYLAS_GRANT_ID}/scheduling/configurations/${env.NYLAS_CONFIGURATION_ID}`;
    const { response, data } = await request(env, path);
    const config = data?.data;
    const booking = config?.event_booking;
    const organizer = config?.participants?.find((participant) => participant.is_organizer);
    if (!response.ok || config?.requires_session_auth !== true || !organizer?.booking?.calendar_id ||
        config.availability?.duration_minutes !== BOOKING_MINUTES ||
        (booking?.booking_type ?? "booking") !== "booking" || booking?.disable_emails !== true || booking.notify_participants === true ||
        booking.conferencing?.provider !== "Zoom Meeting" || !id(booking.conferencing.autocreate?.conf_grant_id) ||
        booking.reminders?.some((reminder) => reminder.type !== "webhook")) {
      fail("service_unavailable", 503);
    }
    return organizer.booking.calendar_id;
  }

  async function slots(env, token, start, end) {
    const query = new URLSearchParams({ start_time: String(start), end_time: String(end) });
    const { response, data } = await request(env, `/scheduling/availability?${query}`, { token });
    const timeSlots = data?.data?.time_slots;
    if (!response.ok || (timeSlots !== null && !Array.isArray(timeSlots))) fail("service_unavailable", 503);
    return [...new Set((timeSlots ?? [])
      .filter((slot) => Number.isSafeInteger(slot?.start_time) && slot.start_time >= start &&
        slot.end_time === slot.start_time + durationSeconds && slot.end_time <= end)
      .map((slot) => slot.start_time))].sort((a, b) => a - b);
  }

  async function availability(env, start, end) {
    if (start >= end) return [];
    return slots(env, await session(env), start, end);
  }

  async function book(env, start, guest) {
    const [token, calendarId] = await Promise.all([session(env), configuration(env)]);
    const end = start + durationSeconds;
    let result;
    try {
      result = await request(env, "/scheduling/bookings", {
        token,
        body: { start_time: start, end_time: end, guest },
        timeout: 12_000
      });
    } catch {
      fail("booking_uncertain", 503);
    }
    const { response, data } = result;
    if (response.status === 409) fail("slot_unavailable", 409);
    if (response.status >= 500 || (response.ok && data?.data?.status === "pending")) fail("booking_uncertain", 503);
    const booking = data?.data;
    if (!response.ok || booking?.status !== "booked" || !id(booking?.booking_id)) fail("service_unavailable", 503);
    return { booking, calendarId };
  }

  async function event(env, eventId, calendarId, timeout) {
    if (typeof eventId !== "string" || !eventId || typeof calendarId !== "string" || !calendarId) return null;
    const query = new URLSearchParams({ calendar_id: calendarId });
    const path = `/grants/${env.NYLAS_GRANT_ID}/events/${encodeURIComponent(eventId)}?${query}`;
    const { response, data } = await request(env, path, { timeout });
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok || !data?.data) fail("service_unavailable", 503);
    return data.data;
  }

  return { availability, book, event };
}
