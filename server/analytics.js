const pageMetrics = new Map([
  ["/", "home_page_requests"],
  ["/index.html", "home_page_requests"],
  ["/application", "application_page_requests"],
  ["/faq", "faq_page_requests"],
  ["/privacy-policy", "privacy_policy_page_requests"],
  ["/legal-notice", "legal_notice_page_requests"]
]);

export function pageRequestMetric(request, response) {
  if (request.method !== "GET" || !response.ok || !/^text\/html(?:;|$)/i.test(response.headers.get("Content-Type") || "")) return null;
  const { pathname } = new URL(request.url);
  const canonical = pathname === "/" ? pathname : pathname.replace(/\/$|\.html$/, "");
  return pageMetrics.get(pathname) ?? pageMetrics.get(canonical);
}

export function countRequest(env, context, metric, timestamp) {
  if (!env.ANALYTICS_DB || !context?.waitUntil || !metric) return;
  try {
    const write = Promise.resolve().then(() => {
      const monday = new Date(timestamp);
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      return env.ANALYTICS_DB.prepare(
        `INSERT INTO weekly_analytics (week_start, metric, total) VALUES (?, ?, 1)
         ON CONFLICT (week_start, metric) DO UPDATE SET total = total + 1`
      ).bind(monday.toISOString().slice(0, 10), metric).run();
    }).catch(() => {
      console.warn("Weekly analytics write failed");
    });
    context.waitUntil(write);
  } catch {
    // Website responses still work if background analytics are unavailable.
  }
}
