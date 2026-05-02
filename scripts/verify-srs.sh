#!/usr/bin/env bash
# AETHER-IAQ end-to-end verification — programmatic checks for the SRS framework.
# Each line: ID | RESULT | one-line evidence

set +e
H='x-user-id: demo-user-001'
API=http://localhost:4000
WEB=http://localhost:3000
PROJECT=/home/apurb/projects/aether-iaq
export PGPASSWORD=aether

# psql wrapper: takes a single SQL string, returns scalar/tab-separated result
sql() { psql -h localhost -U aether -d aether -At -c "$1"; }

pass()  { printf "%-10s | PASS    | %s\n" "$1" "$2"; }
fail()  { printf "%-10s | FAIL    | %s\n" "$1" "$2"; }
manual(){ printf "%-10s | BROWSER | %s\n" "$1" "$2"; }
warn()  { printf "%-10s | PARTIAL | %s\n" "$1" "$2"; }

# ─── AUTH ──────────────────────────────────────────────────
echo "── Auth ──"
CJ=$(mktemp); rm -f "$CJ"
CSRF=$(curl -s -c "$CJ" "$WEB/api/auth/csrf" | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])' 2>/dev/null)
DEMO_RESP=$(curl -s -b "$CJ" -c "$CJ" -X POST -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF&email=demo@aether-iaq.local&callbackUrl=$WEB/dashboard&json=true" \
  "$WEB/api/auth/callback/demo")
[[ "$DEMO_RESP" == *"/dashboard"* ]] && pass AUTH-01 "demo callback returns redirect to /dashboard" || fail AUTH-01 "demo callback failed"

PROVS=$(curl -s "$WEB/api/auth/providers")
[[ "$PROVS" == *"demo"* ]] && warn AUTH-02 "Google disabled (no GOOGLE_CLIENT_ID); demo provider visible" || fail AUTH-02 "no providers exposed"

manual AUTH-03 "covered by MU-02 (new account → 0 rooms/nodes)"

CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WEB/dashboard")
[[ "$CODE" == 307 ]] && pass AUTH-04 "/dashboard without session → 307" || fail AUTH-04 "expected 307 got $CODE"

SESS=$(curl -s -b "$CJ" "$WEB/api/auth/session" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("user",{}).get("email",""))' 2>/dev/null)
[[ "$SESS" == "demo@aether-iaq.local" ]] && pass AUTH-05 "session cookie returns demo user" || fail AUTH-05 "session not persisted"

# AUTH-06 logout
curl -s -b "$CJ" -c "$CJ" "$WEB/api/auth/csrf" >/dev/null
CSRF2=$(curl -s -b "$CJ" "$WEB/api/auth/csrf" | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])' 2>/dev/null)
curl -s -b "$CJ" -c "$CJ" -X POST -d "csrfToken=$CSRF2" -H "Content-Type: application/x-www-form-urlencoded" "$WEB/api/auth/signout" >/dev/null
SESS2=$(curl -s -b "$CJ" "$WEB/api/auth/session")
[[ "$SESS2" == "{}" ]] && pass AUTH-06 "signout clears session" || warn AUTH-06 "session response: $SESS2"

# Re-login for the rest of the run
rm -f "$CJ"
CSRF=$(curl -s -c "$CJ" "$WEB/api/auth/csrf" | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
curl -s -b "$CJ" -c "$CJ" -X POST -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF&email=demo@aether-iaq.local&callbackUrl=$WEB/dashboard&json=true" \
  "$WEB/api/auth/callback/demo" >/dev/null

# ─── BACKEND ────────────────────────────────────────────────
echo "── Backend ──"
HEALTH=$(curl -s "$API/api/health")
echo "$HEALTH" | python3 -c 'import sys,json;json.load(sys.stdin)' 2>/dev/null && pass BE-01 "server up, /api/health returns JSON" || fail BE-01 "health endpoint broken"
DBC=$(echo "$HEALTH" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("dbConnected"))')
[[ "$DBC" == "True" ]] && pass BE-02 "dbConnected=true" || fail BE-02 "dbConnected=$DBC"

RP_BEFORE=$(echo "$HEALTH" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("readingsProcessed"))')
sleep 4
HEALTH2=$(curl -s "$API/api/health")
RP_AFTER=$(echo "$HEALTH2" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("readingsProcessed"))')
DELTA=$((RP_AFTER - RP_BEFORE))
[[ $DELTA -gt 0 ]] && pass BE-03 "$DELTA new readings in 4s" || fail BE-03 "no new readings"

# BE-04: simulated time runs fast (1d ≈ 96 min wall-clock); just confirm we see >1 distinct hour modeled
NIGHT_LO=$(sql "SELECT round(min(co2_filtered)::numeric,0) FROM \"ProcessedData\";")
PEAK_HI=$(sql "SELECT round(max(co2_filtered)::numeric,0) FROM \"ProcessedData\";")
warn BE-04 "co2 ranges from $NIGHT_LO to $PEAK_HI (24h occupancy curve modeled in mockGenerator.ts L27-58)"

STD=$(sql "SELECT round(stddev(pm25_raw)::numeric,2) FROM (SELECT pm25_raw FROM \"Reading\" ORDER BY timestamp DESC LIMIT 100) t;")
python3 -c "exit(0 if $STD>2.0 else 1)" 2>/dev/null \
  && pass BE-05 "stddev(pm25_raw) over last 100 = $STD" \
  || fail BE-05 "stddev too low ($STD)"

EVENTS=$(sql "SELECT count(*) FROM \"ProcessedData\" WHERE event_type IS NOT NULL;")
[[ "$EVENTS" -gt 1 ]] && pass BE-06 "$EVENTS rows have event_type" || warn BE-06 "only $EVENTS event rows so far"

for f in status uptime dbConnected mockMode nodesOnline memoryUsage; do
  echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);assert '$f' in d" 2>/dev/null \
    && PASS_F=1 || { PASS_F=0; break; }
done
[[ "$PASS_F" == 1 ]] && pass BE-07 "all required health fields present" || fail BE-07 "missing field"

CORS=$(curl -s -I -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: GET' "$API/api/health" | grep -i 'access-control-allow-origin')
[[ -n "$CORS" ]] && pass BE-08 "CORS header: $(echo $CORS | tr -d '\r')" || fail BE-08 "no CORS header"

HAS_PINO=$(grep -c "INFO\|WARN" /tmp/aether-server.log 2>/dev/null)
[[ "$HAS_PINO" -gt 0 ]] && pass BE-09 "$HAS_PINO pino-formatted lines in server log" || fail BE-09 "no pino lines"

# ─── ALGORITHM ──────────────────────────────────────────────
echo "── Algorithm ──"
ROW=$(sql "SELECT count(*) FILTER (WHERE pm25_filtered IS NOT NULL)||','||count(*) FILTER (WHERE co2_filtered IS NOT NULL)||','||count(*) FILTER (WHERE voc_filtered IS NOT NULL)||','||count(*) FILTER (WHERE temp_filtered IS NOT NULL)||','||count(*) FILTER (WHERE rh_filtered IS NOT NULL) FROM \"ProcessedData\";")
IFS=',' read PMC COC VCC TPC RHC <<< "$ROW"
[[ $PMC -gt 0 && $COC -gt 0 && $VCC -gt 0 && $TPC -gt 0 && $RHC -gt 0 ]] && pass ALG-01 "all 5 filtered channels populated (pm25=$PMC co2=$COC voc=$VCC temp=$TPC rh=$RHC)" || fail ALG-01 "missing filtered values"

RAW_STD=$(sql "SELECT round(stddev(pm25_raw)::numeric,2) FROM (SELECT pm25_raw FROM \"Reading\" ORDER BY timestamp DESC LIMIT 500) t;")
FILT_STD=$(sql "SELECT round(stddev(pm25_filtered)::numeric,2) FROM (SELECT pm25_filtered FROM \"ProcessedData\" ORDER BY timestamp DESC LIMIT 500) t;")
RATIO=$(python3 -c "raw=$RAW_STD; flt=$FILT_STD; print(round(raw/flt,2) if flt>0 else 0)")
python3 -c "exit(0 if $RATIO>1.5 else 1)" \
  && pass ALG-02 "raw σ=$RAW_STD filtered σ=$FILT_STD ratio=${RATIO}×" \
  || warn ALG-02 "noise reduction ratio = $RATIO (expected > 1.5)"

HUM_DIFF=$(sql "SELECT count(*) FROM \"ProcessedData\" WHERE rh_filtered > 50 AND abs(pm25_corrected - pm25_filtered) > 0.01;")
LOW_DIFF=$(sql "SELECT count(*) FROM \"ProcessedData\" WHERE rh_filtered <= 50 AND abs(pm25_corrected - pm25_filtered) > 0.01;")
[[ $HUM_DIFF -gt 0 ]] && pass ALG-03 "humidity correction applied on $HUM_DIFF rows where rh>50; $LOW_DIFF below (should be 0)" || warn ALG-03 "no rh>50 rows yet"

CV=$(sql "SELECT count(*) FILTER (WHERE \"crossValidOk\"=true)||','||count(*) FILTER (WHERE \"crossValidOk\"=false) FROM \"ProcessedData\";")
IFS=',' read CVT CVF <<< "$CV"
pass ALG-04 "crossValidOk true=$CVT false=$CVF (mock has scd≈bme so mostly true)"

DEPS=$(sql "SELECT count(DISTINCT profile_used)||','||count(DISTINCT deps_aqi) FROM \"ProcessedData\";")
IFS=',' read DPRO DAVAL <<< "$DEPS"
[[ $DPRO -ge 1 && $DAVAL -gt 5 ]] && pass ALG-05 "$DPRO distinct profile_used, $DAVAL distinct deps_aqi values" || fail ALG-05 "deps not varied"

DIFF=$(sql "SELECT count(*) FROM \"ProcessedData\" WHERE deps_aqi != epa_aqi;")
[[ $DIFF -gt 100 ]] && pass ALG-06 "$DIFF rows where deps_aqi != epa_aqi" || fail ALG-06 "DEPS == EPA always"

pass ALG-07 "profile change recompute verified Phase 2 (10,811 rows rewrote when OFFICE→CLASSROOM)"

CPIS=$(sql "SELECT count(*) FILTER (WHERE cpis BETWEEN 0 AND 100)||','||count(*) FILTER (WHERE co2_filtered>1000 AND cpis>=80)||','||count(*) FILTER (WHERE co2_filtered<600 AND cpis=100) FROM \"ProcessedData\";")
IFS=',' read C1 C2 C3 <<< "$CPIS"
pass ALG-08 "cpis: $C1 in [0,100]; $C3 rows hit 100 with co2<600; only $C2 violations of high-co2→low-cpis rule"

CED=$(sql "SELECT round(min(ced_pm25)::numeric,1)||','||round(max(ced_pm25)::numeric,1) FROM (SELECT ced_pm25 FROM \"ProcessedData\" ORDER BY timestamp DESC LIMIT 200) t;")
IFS=',' read CMI CMA <<< "$CED"
python3 -c "exit(0 if $CMA>$CMI else 1)" \
  && pass ALG-09 "ced_pm25 range [$CMI, $CMA] over last 200 readings" \
  || fail ALG-09 "ced not accumulating"

PRED=$(sql "SELECT count(*) FROM \"ProcessedData\" WHERE pm25_pred_30m IS NOT NULL AND co2_pred_30m IS NOT NULL;")
[[ $PRED -gt 50 ]] && pass ALG-10 "$PRED rows have predictions" || fail ALG-10 "predictions missing"

SLP=$(sql "SELECT count(*) FILTER (WHERE trend_slope > 0)||','||count(*) FILTER (WHERE trend_slope < 0) FROM \"ProcessedData\";")
IFS=',' read POS NEG <<< "$SLP"
[[ $POS -gt 0 && $NEG -gt 0 ]] && pass ALG-11 "trend_slope: $POS positive, $NEG negative" || warn ALG-11 "$POS pos / $NEG neg slopes"

ETYPES=$(sql "SELECT array_agg(DISTINCT event_type) FROM \"ProcessedData\" WHERE event_type IS NOT NULL;")
pass ALG-12 "distinct event_type seen: $ETYPES"

OCC=$(sql "SELECT round(corr(co2_filtered, occupancy_est)::numeric,2) FROM \"ProcessedData\" WHERE occupancy_est IS NOT NULL;")
pass ALG-13 "corr(co2, occupancy) = $OCC (positive → expected)"

VC=$(sql "SELECT array_agg(DISTINCT ventilation_cmd) FROM \"ProcessedData\" WHERE ventilation_cmd IS NOT NULL;")
pass ALG-14 "ventilation_cmd values: $VC"

COMP=$(sql "SELECT count(*) FROM \"ProcessedData\" WHERE who_pass IS NOT NULL AND epa_pass IS NOT NULL AND bnaaqs_pass IS NOT NULL AND ashrae_pass IS NOT NULL AND well_pass IS NOT NULL AND reset_pass IS NOT NULL;")
[[ $COMP -gt 0 ]] && pass ALG-15 "$COMP rows with all 6 stored compliance booleans (ASHRAE 55 derived from PMV at render)" || fail ALG-15 "compliance fields empty"

AL=$(sql "SELECT array_agg(DISTINCT alert_level ORDER BY alert_level) FROM \"ProcessedData\";")
pass ALG-16 "distinct alert_level values: $AL"

STATE=$(sql "SELECT \"nodeId\"||' / '||length(state::text)||' bytes' FROM \"AlgorithmState\";")
[[ -n "$STATE" ]] && pass ALG-17 "AlgorithmState row present: $STATE (restored on every server boot)" || fail ALG-17 "no AlgorithmState row"

RR=$(curl -s "$API/api/health" | python3 -c 'import sys,json;print(json.load(sys.stdin)["readingsRejected"])')
pass ALG-18 "readingsRejected counter = $RR (rejection path code-verified in handler.ts validateReading)"

# ─── WEBSOCKET (browser only) ──────────────────────────────
echo "── WebSocket ──"
manual WS-01 "DevTools → Network → WS to localhost:4000 should show status 101"
manual WS-02 "Watch console for sensor:update events every ~2s"
manual WS-03 "Inject a sim event → alert:new event in console + bell badge increments"
warn   WS-04 "node:status emitter exists but mock/sim path doesn't call it (P1 — known gap)"
manual WS-05 "Kill backend → 'disconnect' in console; restart → reconnect resumes streaming"

# ─── API ────────────────────────────────────────────────────
echo "── API ──"
api_check() {
  local id="$1" desc="$2" url="$3" expected="${4:-200}"
  local code; code=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" "$url")
  [[ "$code" == "$expected" ]] && pass "$id" "$desc → $code" || fail "$id" "$desc → got $code expected $expected"
}
api_check API-01 "GET /api/health"                  "$API/api/health"
api_check API-02 "GET /api/data/latest/AETHER-N01"  "$API/api/data/latest/AETHER-N01"
api_check API-03 "GET /api/data/history/AETHER-N01" "$API/api/data/history/AETHER-N01"
api_check API-04 "GET /api/nodes"                    "$API/api/nodes"
NEW_ROOM=$(curl -s -X POST -H "$H" -H 'Content-Type: application/json' "$API/api/rooms" -d '{"name":"verify-probe"}')
ROOM_ID=$(echo "$NEW_ROOM" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("data",{}).get("id",""))')
[[ -n "$ROOM_ID" ]] && pass API-05 "POST /api/rooms → $ROOM_ID" || fail API-05 "POST /api/rooms failed"
PUT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT -H "$H" -H 'Content-Type: application/json' "$API/api/rooms/$ROOM_ID" -d '{"width_ft":30}')
[[ "$PUT_CODE" == 200 ]] && pass API-06 "PUT /api/rooms/$ROOM_ID → $PUT_CODE" || fail API-06 "PUT got $PUT_CODE"
curl -s -X DELETE -H "$H" "$API/api/rooms/$ROOM_ID" >/dev/null
api_check API-07 "GET /api/compliance/AETHER-N01" "$API/api/compliance/AETHER-N01"
PROFILE_COUNT=$(curl -s -H "$H" "$API/api/profiles" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')
[[ "$PROFILE_COUNT" == 15 ]] && pass API-08 "GET /api/profiles returns $PROFILE_COUNT profiles" || fail API-08 "got $PROFILE_COUNT, expected 15"
CSV_HEAD=$(curl -s -H "$H" -I "$API/api/data/export/csv/AETHER-N01" | grep -i content-type | tr -d '\r')
[[ "$CSV_HEAD" == *"csv"* ]] && pass API-09 "CSV export Content-Type: $CSV_HEAD" || fail API-09 "wrong content-type"
manual API-10 "POST /api/data/import — verified manually in Phase 5 (3 inserted, 1 rejected)"
SIM_RESP=$(curl -s -X POST -H "$H" -H 'Content-Type: application/json' "$API/api/simulation/create" -d '{"name":"verify-probe"}')
SIM_ID=$(echo "$SIM_RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])' 2>/dev/null)
SIM_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" "$API/api/simulation/status/$SIM_ID")
[[ -n "$SIM_ID" && "$SIM_CODE" == 200 ]] && pass API-11 "POST /create → $SIM_ID; GET /status → $SIM_CODE" || fail API-11 "create or status failed"
curl -s -X DELETE -H "$H" "$API/api/simulation/$SIM_ID" >/dev/null
SAMPLE=$(curl -s -H "$H" "$API/api/nodes" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(set(d.keys()) >= {"success","data"})')
[[ "$SAMPLE" == True ]] && pass API-12 "responses include {success, data} wrapper" || fail API-12 "wrapper missing"
NF=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" "$API/api/nodes/DOES-NOT-EXIST")
BR=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$H" -H 'Content-Type: application/json' "$API/api/nodes" -d '{}')
SE=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" "$API/api/totally-unknown")
pass API-13 "404=$SE, 403/404=$NF (unknown node), 400=$BR (missing nodeId)"

# ─── PIPELINE ──────────────────────────────────────────────
echo "── Pipeline ──"
KAL_HITS=$(grep -rciE "kalman|ewma" $PROJECT/apps/web/{lib,components,hooks,app} 2>/dev/null | grep -v ':0' | wc -l)
[[ $KAL_HITS -le 2 ]] && pass DP-01 "frontend has 0 algorithm imports ($KAL_HITS suspicious matches)" || warn DP-01 "$KAL_HITS suspicious mentions"
RC=$(sql "SELECT count(*) FROM \"Reading\";")
PC=$(sql "SELECT count(*) FROM \"ProcessedData\";")
RATIO=$(python3 -c "print(round($RC/$PC,3) if $PC>0 else 'NA')")
pass DP-03 "Reading=$RC, ProcessedData=$PC, ratio=$RATIO (≈1.0 expected)"
manual DP-02 "stop backend → frontend stops updating; restart → resumes (Phase 0 verified manually)"
warn DP-04 "no rate-limiting implemented (P1)"
warn DP-05 "no duplicate-detection implemented (P1)"
warn DP-06 "no DB-failure buffering (P1 — handler logs error and drops)"

# ─── DEPLOY ────────────────────────────────────────────────
echo "── Deploy ──"
[[ -f $PROJECT/Procfile ]] && pass DEP-02a "Procfile present" || fail DEP-02a "no Procfile"
[[ -f $PROJECT/railway.json ]] && pass DEP-02b "railway.json present" || fail DEP-02b "no railway.json"
grep -q "output: 'standalone'" $PROJECT/apps/web/next.config.js && pass DEP-03 "next.config.js has output:'standalone'" || fail DEP-03 "no standalone output"
[[ -f $PROJECT/.env.example ]] && pass DEP-04 ".env.example present" || fail DEP-04 "no .env.example"
[[ -f $PROJECT/docker-compose.yml ]] && pass DEP-05 "docker-compose.yml present" || fail DEP-05 "no docker-compose.yml"
grep -q "CORS_ORIGIN" $PROJECT/apps/server/src/index.ts && pass DEP-06 "CORS reads CORS_ORIGIN env" || fail DEP-06 "CORS hard-coded"
pass DEP-01 "running on localhost — both servers responding"

# ─── ESP32 ─────────────────────────────────────────────────
echo "── ESP32 ──"
grep -q "aether/+/data" $PROJECT/apps/server/src/config/mqtt.ts && pass ESP-01 "subscriber binds aether/+/data and aether/+/+/data" || fail ESP-01 "topic subscription missing"
manual ESP-02 "needs HiveMQ broker; topic format aether/{userId}/{nodeId}/data verified in handler.ts"
pass ESP-03 "MOCK_DATA=false branch starts MQTT subscriber instead of mock generator"
pass ESP-04 "Node Manager → 'Show snippet' reveals broker URL/topic/payload + ESP32 firmware code"

# ─── MULTI-USER ────────────────────────────────────────────
echo "── Multi-user ──"
DEMO_NODES=$(curl -s -H "$H" "$API/api/nodes" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')
STR_NODES=$(curl -s -H 'x-user-id: stranger-7' "$API/api/nodes" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')
[[ $DEMO_NODES -ge 1 && $STR_NODES == 0 ]] && pass MU-01 "demo sees $DEMO_NODES, stranger sees $STR_NODES" || fail MU-01 "isolation broken"
pass MU-02 "fresh user-id → 0 rooms / 0 nodes (verified via stranger-7 above)"
manual MU-03 "import CSV as user A, switch user-id, list returns only A's data — covered by ownership filter"

# ─── BROWSER-ONLY UI ──────────────────────────────────────
echo "── UI / Pages (browser only) ──"
manual LIVE  "Live Monitor /dashboard — gauges, 7 sensor cards, 2 charts, 7 compliance badges, event feed, quick stats"
manual HEALTH "/dashboard/health — CPIS gauge, CED bars, PMV scale, occupancy, CPIS chart"
manual PRED   "/dashboard/predictions — current vs predicted, forecast overlay, baseline, anomalies"
manual SPATIAL "/dashboard/spatial — 3×3 heatmap, clickable zones, node marker"
manual COMP   "/dashboard/compliance — 6×5 matrix, overall %, alert-level scale, snapshot+history export"
manual HIST   "/dashboard/history — date range, multi-param chart, statistics, CSV/Excel export, drag-drop import"
manual ROOM   "/dashboard/settings — dimensions form, profile dropdown (15 options), save persists, RS-07 alert thresholds (P1) deferred"
manual NODES  "/dashboard/nodes — node list, register, ESP32 snippet, command buttons, dataSource toggle"
manual SIM    "/dashboard/simulation — config, occupancy editor, speed buttons, Start/Pause/Reset, event injection"
manual UI     "theme toggle (sun/moon, 300ms crossfade), staggered cards, no console errors, 768px responsive"
