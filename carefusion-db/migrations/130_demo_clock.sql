-- 130: demo clock. The alpha demo data is dated 17 Oct 2026; the API sets app.demo_now (from DEMO_NOW)
-- per transaction so "today", waiting times and overdue flags follow the demo date.
-- Without the setting the function returns the real time, so production behaviour is unchanged.
CREATE OR REPLACE FUNCTION util.demo_now() RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.demo_now', true), '')::timestamptz, now())
$$;
GRANT EXECUTE ON FUNCTION util.demo_now() TO PUBLIC;
