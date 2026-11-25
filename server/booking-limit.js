const SCHEMA = `CREATE TABLE IF NOT EXISTS booking_guards (
  email_hash TEXT PRIMARY KEY,
  lock_id TEXT NOT NULL,
  locked_until INTEGER NOT NULL,
  event_id TEXT,
  calendar_id TEXT,
  booking_ends_at INTEGER NOT NULL DEFAULT 0,
  uncertain_until INTEGER NOT NULL DEFAULT 0
)`;
const LOCK_SECONDS = 120;

export async function reserveBooking(env, email, now, { digest, fail }) {
  const db = env.ANALYTICS_DB;
  if (!db?.prepare || !db?.batch) fail("service_unavailable", 503);
  const emailHash = await digest(email.trim().toLowerCase());
  const lockId = crypto.randomUUID();
  let row;
  try {
    const results = await db.batch([
      db.prepare(SCHEMA),
      db.prepare(`DELETE FROM booking_guards
        WHERE locked_until <= ?1 AND booking_ends_at <= ?1 AND uncertain_until <= ?1`).bind(now),
      db.prepare(`INSERT INTO booking_guards (email_hash, lock_id, locked_until)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(email_hash) DO UPDATE SET
          lock_id = excluded.lock_id, locked_until = excluded.locked_until
        WHERE booking_guards.locked_until <= ?4
        RETURNING event_id, calendar_id, booking_ends_at, uncertain_until`)
        .bind(emailHash, lockId, now + LOCK_SECONDS, now)
    ]);
    row = results[2]?.results?.[0];
  } catch {
    fail("service_unavailable", 503);
  }
  if (!row) fail("booking_in_progress", 409);
  let finished = false;

  async function remember(event, calendarId, end) {
    await db.prepare(`UPDATE booking_guards SET
      event_id = ?1, calendar_id = ?2, booking_ends_at = ?3, uncertain_until = 0
      WHERE email_hash = ?4 AND lock_id = ?5`)
      .bind(typeof event?.id === "string" ? event.id : null, calendarId, end, emailHash, lockId).run();
  }

  return {
    async check(scheduler, configuration) {
      if (row.uncertain_until > now) fail("booking_uncertain", 503);
      if (row.event_id && row.calendar_id && row.booking_ends_at > now) {
        const event = await scheduler.event(env, row.event_id, row.calendar_id);
        const end = event?.when?.end_time;
        if (event && event.status !== "cancelled" && (!Number.isSafeInteger(end) || end > now)) {
          if (Number.isSafeInteger(end)) await remember(event, row.calendar_id, end);
          fail("booking_exists", 409);
        }
      }
      const event = await scheduler.upcoming(env, configuration, email, now);
      if (event) {
        const end = event.when?.end_time;
        if (Number.isSafeInteger(end)) await remember(event, configuration.calendarId, end);
        fail("booking_exists", 409);
      }
    },
    async confirm({ booking, calendarId }, end) {
      // The appointment already exists. A bookkeeping failure must not turn a
      // confirmed booking into a retryable error or send a second booking.
      try {
        await remember({ id: booking.event_id }, calendarId, end);
        await db.prepare(`UPDATE booking_guards SET locked_until = 0
          WHERE email_hash = ?1 AND lock_id = ?2`).bind(emailHash, lockId).run();
      } catch {
        console.error("Confirmed booking limit state could not be saved");
      }
      finished = true;
    },
    async release(error, end) {
      if (finished) return;
      try {
        if (error?.code === "booking_uncertain") {
          await db.prepare(`UPDATE booking_guards SET locked_until = 0,
            uncertain_until = CASE WHEN uncertain_until > 0 THEN uncertain_until ELSE ?1 END
            WHERE email_hash = ?2 AND lock_id = ?3`).bind(end, emailHash, lockId).run();
        } else {
          await db.prepare(`UPDATE booking_guards SET locked_until = 0
            WHERE email_hash = ?1 AND lock_id = ?2`).bind(emailHash, lockId).run();
        }
      } catch {
        console.error("Booking reservation could not be released");
      }
      finished = true;
    }
  };
}
