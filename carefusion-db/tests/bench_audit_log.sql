-- Concurrency benchmark for the hash-chained log. Run with:
-- pgbench -n -c 16 -j 4 -T 15 -f tests/bench_audit_log.sql <db>
-- then: SELECT s, audit.verify_chain(s::smallint) FROM generate_series(1,36) s;  -- all NULL = intact
\set s random(1, 36)
INSERT INTO audit.activity_log (stream_id, action, details) VALUES (:s, 'bench.write', '{}');
