(() => {
  "use strict";
  const preview = location.protocol === "file:" || window.COACHING_SITE?.backend?.mode !== "live";
  let statusPromise = null;
  const messages = { invalid_email: "You've entered an invalid E-Mail address.", invalid_phone: "Please enter a valid phone number including its country code.", rate_limited: "Please wait a moment before trying again.", slot_unavailable: "That time is no longer available. Please choose another time.", service_unavailable: "This service is temporarily unavailable. Please try again later.", invalid_request: "Please check your entries and try again.", network_error: "We couldn't connect. Please try again." };
  messages.delivery_uncertain = "This request is already being processed. Please check your E-Mail before trying again.";
  messages.booking_uncertain = "Your booking may have gone through. Please check your E-Mail or use Contact me before choosing another time.";
  async function request(path, data, requestId) {
    const controller = new AbortController();
    const timeout = path === "/api/book" ? 55000 : data ? 27000 : 16000;
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(path, { method: data ? "POST" : "GET", credentials: "same-origin", headers: data ? { "Content-Type": "application/json", ...(requestId ? { "Idempotency-Key": requestId } : {}) } : {}, body: data ? JSON.stringify(data) : undefined, signal: controller.signal });
      let result;
      try { result = await response.json(); } catch { result = {}; }
      if (!response.ok || (data && result?.ok !== true)) {
        const code = result?.code || "service_unavailable";
        const error = new Error(window.CoachValidation.messages[code] || messages[code] || messages.service_unavailable);
        error.code = code;
        error.field = result?.field;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.code) throw error;
      const failed = new Error(messages.network_error);
      failed.code = "network_error";
      throw failed;
    } finally { clearTimeout(timer); }
  }
  function getStatus() {
    if (preview) return Promise.resolve({ preview: true, contact: false, newsletter: false, calendar: false, durationMinutes: 25 });
    if (!statusPromise) statusPromise = request("/api/status").catch((error) => { statusPromise = null; throw error; });
    return statusPromise;
  }
  function submit(path, data, requestId) {
    if (preview) return Promise.resolve({ ok: true, preview: true });
    return request(path, data, requestId);
  }
  window.CoachAPI = Object.freeze({ preview, getStatus, subscribe: (data, id) => submit("/api/newsletter", data, id), contact: (data, id) => submit("/api/contact", data, id), requestContact: (data, id) => submit("/api/application", data, id), availability: (start, end, timeZone) => request(`/api/availability?${new URLSearchParams({ start, end, timeZone })}`), book: (data, id) => submit("/api/book", data, id), requestId: () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}` });
})();
