CREATE TABLE IF NOT EXISTS locations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id  TEXT    NOT NULL,
  lat        REAL    NOT NULL,
  lng        REAL    NOT NULL,
  speed_kmh  REAL    NOT NULL DEFAULT 0,
  satellites INTEGER NOT NULL DEFAULT 0,
  ts         TEXT    NOT NULL,
  source     TEXT    NOT NULL DEFAULT 'http',
  sms_from   TEXT
);

CREATE INDEX IF NOT EXISTS idx_device_ts ON locations (device_id, ts DESC);

-- One row per device, holds the most recent prepaid balance reply
-- as raw text from the carrier USSD response (e.g. *214# on Smart).
CREATE TABLE IF NOT EXISTS sim_balances (
  device_id TEXT PRIMARY KEY,
  balance   TEXT NOT NULL,
  ts        TEXT NOT NULL
);
