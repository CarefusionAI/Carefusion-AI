#!/usr/bin/env bash
# Smoke test for EventsModule + CitizenAppModule against a running API (default http://127.0.0.1:3055) as Anjali.
# Start the API first, for example:
#   DATABASE_URL=postgresql://... DEMO_MODE=true DEMO_NOW=2026-10-17T09:00:00Z PORT=3055 \
#     node dist/citizen-app/testing/test-main.js
# Needs the migrations + seeds applied (carefusion-db/run_migrations.sh <conn> all). Changes data: use a throwaway database.
BASE="${BASE:-http://127.0.0.1:3055}"
fail=0
call() { # name method path expected_status [json] [role]
  local name=$1 m=$2 p=$3 want=$4 body=${5:-} role=${6:-CITIZEN} out code
  if [ -n "$body" ]; then
    out=$(curl -s -w '\n%{http_code}' -X "$m" -H "Authorization: Bearer demo:$role" -H 'Content-Type: application/json' -d "$body" "$BASE$p")
  else
    out=$(curl -s -w '\n%{http_code}' -X "$m" -H "Authorization: Bearer demo:$role" "$BASE$p")
  fi
  code=${out##*$'\n'}; LAST=${out%$'\n'*}
  if [ "$code" = "$want" ]; then echo "ok   $name ($code)"; else echo "FAIL $name: wanted $want got $code: ${LAST:0:200}"; fail=1; fi
}
has() { # name needle
  if grep -q -- "$2" <<<"$LAST"; then echo "ok   $1 contains '$2'"; else echo "FAIL $1 missing '$2'"; fail=1; fi
}
call "dates calendar" GET "/api/v1/citizen/dates/calendar?month=2026-10" 200; has "calendar" "Follow-up with Dr. Arun Nair"
call "dates upcoming" GET "/api/v1/citizen/dates/upcoming?limit=3" 200
call "add reminder" POST /api/v1/citizen/dates/reminders 201 '{"title":"Smoke reminder","startsAt":"2026-10-30T04:00:00Z","repeat":"weekly"}'
call "vitals summary" GET /api/v1/citizen/vitals/summary 200; has "vitals" '"bp30"'
call "add bp (high) notifies doctor" POST /api/v1/citizen/vitals/readings 201 '{"kind":"bp","systolic":150,"diastolic":95}'; has "bp" '"doctorNotified":true'
call "bad reading" POST /api/v1/citizen/vitals/readings 400 '{"kind":"bp","systolic":10}'
call "ai chat reviewed result" POST /api/v1/citizen/ai-chat/sessions 201 '{"text":"explain my chest x-ray result"}'; has "chat" 'simulated AI output'
call "ai chat red flag" POST /api/v1/citizen/ai-chat/sessions 201 '{"text":"I have chest pain"}'; has "red flag" '"redFlag":true'
call "threads" GET /api/v1/citizen/messages/threads 200
call "reply" POST /api/v1/citizen/messages/threads/cfd00000-0130-4000-8000-000000000001/messages 201 '{"text":"Smoke test message"}'
call "announcement thread is read-only" POST /api/v1/citizen/messages/threads/cfd00000-0130-4000-8000-000000000006/messages 403 '{"text":"hi"}'
call "providers" GET "/api/v1/citizen/care/providers?limit=5" 200
call "slots" GET "/api/v1/citizen/care/providers/cfd00000-0002-4000-8000-000000000002/slots?days=7" 200
call "appointments" GET /api/v1/citizen/care/appointments 200; has "appointments" DEMO-APT-58213
call "alerts" GET /api/v1/citizen/alerts 200
call "alert prefs" GET /api/v1/citizen/alerts/preferences 200
call "emergency alerts cannot be switched off" PUT /api/v1/citizen/alerts/preferences 400 '{"prefs":[{"category":"emergency","channel":"app","enabled":false}]}'
call "settings" GET /api/v1/citizen/settings 200
call "export request" POST /api/v1/citizen/settings/export 201 '{"format":"zip"}'
call "reviews" GET /api/v1/citizen/reviews?targetType=hospital 200
call "my reviews" GET /api/v1/citizen/reviews/mine 200
call "complaints" GET /api/v1/citizen/complaints 200; has "complaints" CMP-0412
call "file complaint" POST /api/v1/citizen/complaints 201 '{"category":"billing","title":"Smoke complaint","body":"Smoke test","hospitalId":"cfd00000-0010-4000-8000-000000000001"}'
call "access key" GET /api/v1/citizen/access/key 200
call "access overview" GET /api/v1/citizen/access/overview 200
call "access history" GET /api/v1/citizen/access/history 200
call "emergency switch is locked" PUT /api/v1/citizen/access/categories/emg 400 '{"enabled":false}'
call "citizen routes refuse a doctor" GET /api/v1/citizen/vitals/summary 403 "" DOCTOR
call "events (citizen)" GET "/api/v1/events?role=citizen" 200
call "events (other role's feed refused)" GET "/api/v1/events?role=doctor" 403
call "events (doctor sees the vitals alert)" GET "/api/v1/events?role=doctor" 200 "" DOCTOR; has "doctor feed" "Home reading outside target"
call "event with outside link refused" POST /api/v1/events 400 '{"type":"prescription","to":["pharmacist"],"title":"x","href":"https://evil.com"}' DOCTOR
call "unread count" GET /api/v1/events/unread-count 200 "" DOCTOR
exit $fail
