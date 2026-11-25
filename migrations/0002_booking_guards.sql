CREATE TABLE IF NOT EXISTS booking_guards (
  email_hash TEXT PRIMARY KEY,
  lock_id TEXT NOT NULL,
  locked_until INTEGER NOT NULL,
  event_id TEXT,
  calendar_id TEXT,
  booking_ends_at INTEGER NOT NULL DEFAULT 0,
  uncertain_until INTEGER NOT NULL DEFAULT 0
);
