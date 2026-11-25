CREATE TABLE IF NOT EXISTS weekly_analytics (
  week_start TEXT NOT NULL,
  metric TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total >= 0),
  PRIMARY KEY (week_start, metric)
);
