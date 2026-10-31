-- 131: wrong-code counter for the optional demo access gate. It lives in the database (not in server memory)
-- so the limit holds when the API runs as many short-lived serverless instances. Only a hash of the client
-- address is stored, never the address itself.
CREATE TABLE IF NOT EXISTS util.access_attempt (
  client_hash text PRIMARY KEY,
  fails       integer NOT NULL,
  first_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE util.access_attempt IS 'Wrong access-code attempts per hashed client address, 10-minute window. Not patient data.';
