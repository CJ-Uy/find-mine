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
