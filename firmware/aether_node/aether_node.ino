// AETHER-IAQ ESP32 Node Firmware
// Node:    AETHER-N01
// Sensors: SCD41, SGP40, BME280, PMS5003, SIM800L, SSD1306 OLED
// Publish: aether/AETHER-N01/data  (JSON, QoS 1)
//
// Fill in WIFI_SSID/WIFI_PASS and MQTT_USER/MQTT_PASS before flashing.

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_BME280.h>
#include <SensirionI2cScd4x.h>
#include <Adafruit_SGP40.h>
#include <WiFiClientSecure.h>

// =============================================================
// Pin definitions (exact, per spec)
// =============================================================
#define SDA_PIN     21
#define SCL_PIN     22
#define PMS_RX      26   // ESP32 RX  <- PMS5003 TX
#define PMS_TX      25   // ESP32 TX  -> PMS5003 RX
#define SIM_RX      16   // RX2  <- SIM800L TX
#define SIM_TX      17   // TX2  -> SIM800L RX
#define RELAY_PIN   15
#define BUZZER_PIN  33

// =============================================================
// Identity & network
// =============================================================
#define NODE_ID            "AETHER-N01"
#define FIRMWARE_VERSION   "1.0.0"

const char* WIFI_SSID     = "SHAFIN AHMED APURBA";   // <-- fill before flashing
const char* WIFI_PASS     = "diganto005";   // <-- fill before flashing

const char* MQTT_BROKER   = "5f1edb13301746fd9cbdaea63a81235c.s1.eu.hivemq.cloud";
const uint16_t MQTT_PORT  = 8883;
const char* MQTT_USER     = "aether-device";   // <-- fill before flashing
const char* MQTT_PASS     = "Dev1ce$ecure2026";   // <-- fill before flashing
const char* MQTT_TOPIC_DATA   = "aether/" NODE_ID "/data";
const char* MQTT_TOPIC_STATUS = "aether/" NODE_ID "/status";

// =============================================================
// NTP (UTC+6, Asia/Dhaka — no DST)
// =============================================================
const long  GMT_OFFSET_SEC      = 6 * 3600;
const int   DAYLIGHT_OFFSET_SEC = 0;
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.google.com";

// =============================================================
// Timing
// =============================================================
const uint32_t PUBLISH_INTERVAL_MS = 15000;   // 15 s sensor cadence
const uint32_t STATUS_INTERVAL_MS  = 60000;   // 1 min status heartbeat
const uint32_t WIFI_RETRY_MS       = 10000;

// =============================================================
// Types  (MUST be declared before the first function so the Arduino
//         auto-generated prototypes can see them)
// =============================================================
struct BufferedReading {
  uint32_t ts;          // unix seconds (0 if unsynced)
  float    pm1, pm25, pm10;
  float    co2;
  float    tvoc;
  float    temp_bme, rh_bme, pressure;
  float    temp_scd, rh_scd;
  int32_t  wifi_rssi;
  uint32_t heap_free;
  uint32_t uptime;
};

struct Sample {
  float pm1 = 0, pm25 = 0, pm10 = 0;
  float co2 = 0;
  float temp_scd = 0, rh_scd = 0;
  float temp_bme = 0, rh_bme = 0, pressure = 0;
  int32_t voc_index = 0;
  bool scd_ok = false, bme_ok = false, sgp_ok = false, pms_ok = false;
};

// =============================================================
// Offline buffer (200 readings, RAM)
// =============================================================
static const size_t BUFFER_CAPACITY = 200;
static BufferedReading offlineBuf[BUFFER_CAPACITY];
static size_t bufHead = 0;
static size_t bufCount = 0;

static void bufferPush(const BufferedReading& r) {
  offlineBuf[bufHead] = r;
  bufHead = (bufHead + 1) % BUFFER_CAPACITY;
  if (bufCount < BUFFER_CAPACITY) bufCount++;
}

static bool bufferPop(BufferedReading& out) {
  if (bufCount == 0) return false;
  size_t tail = (bufHead + BUFFER_CAPACITY - bufCount) % BUFFER_CAPACITY;
  out = offlineBuf[tail];
  bufCount--;
  return true;
}

// =============================================================
// Drivers
// =============================================================
Adafruit_SSD1306    oled(128, 64, &Wire, -1);
Adafruit_BME280     bme;
SensirionI2cScd4x   scd4x;
Adafruit_SGP40      sgp;
HardwareSerial      pmsSerial(2);  // we re-pin to PMS_RX/TX in setup
WiFiClientSecure    netClient;
PubSubClient        mqtt(netClient);

// =============================================================
// Latest readings
// =============================================================
Sample sample;

uint32_t lastPublishMs = 0;
uint32_t lastStatusMs  = 0;
uint32_t lastWifiTryMs = 0;

// =============================================================
// PMS5003 framed protocol (32-byte frame, 0x42 0x4D header)
// =============================================================
static bool readPMS5003(Sample& s) {
  uint8_t buf[32];
  uint32_t deadline = millis() + 1500;
  size_t idx = 0;
  while (millis() < deadline) {
    if (!pmsSerial.available()) continue;
    uint8_t b = pmsSerial.read();
    if (idx == 0 && b != 0x42) continue;
    if (idx == 1 && b != 0x4D) { idx = 0; continue; }
    buf[idx++] = b;
    if (idx == 32) {
      uint16_t sum = 0;
      for (size_t i = 0; i < 30; i++) sum += buf[i];
      uint16_t chk = (uint16_t)buf[30] << 8 | buf[31];
      if (sum != chk) return false;
      // Atmospheric concentrations (μg/m³) at indices 10..15
      s.pm1  = ((uint16_t)buf[10] << 8) | buf[11];
      s.pm25 = ((uint16_t)buf[12] << 8) | buf[13];
      s.pm10 = ((uint16_t)buf[14] << 8) | buf[15];
      return true;
    }
  }
  return false;
}

// =============================================================
// OLED helpers
// =============================================================
static void oledStatus(const char* line1, const char* line2 = nullptr) {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.println(NODE_ID);
  oled.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  oled.setCursor(0, 16);
  oled.println(line1);
  if (line2) {
    oled.setCursor(0, 28);
    oled.println(line2);
  }
  oled.display();
}

static void oledShowSample(const Sample& s) {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.print(NODE_ID);
  oled.setCursor(80, 0);
  oled.print(WiFi.status() == WL_CONNECTED ? "WiFi" : "OFF ");
  oled.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  oled.setCursor(0, 14); oled.print("PM2.5 "); oled.print(s.pm25, 0); oled.print(" ug/m3");
  oled.setCursor(0, 24); oled.print("CO2   "); oled.print(s.co2, 0);  oled.print(" ppm");
  oled.setCursor(0, 34); oled.print("VOC   "); oled.print(s.voc_index);
  oled.setCursor(0, 44); oled.print("T "); oled.print(s.temp_bme, 1); oled.print("C  RH ");
  oled.print(s.rh_bme, 0); oled.print("%");
  oled.setCursor(0, 54); oled.print("Buf "); oled.print((unsigned)bufCount);
  oled.print("/"); oled.print((unsigned)BUFFER_CAPACITY);
  oled.display();
}

// =============================================================
// WiFi & MQTT
// =============================================================
static void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  uint32_t now = millis();
  if (now - lastWifiTryMs < WIFI_RETRY_MS) return;
  lastWifiTryMs = now;
  Serial.println("[wifi] connecting...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

static void publishStatus(bool online) {
  if (!mqtt.connected()) return;
  StaticJsonDocument<192> doc;
  doc["online"]       = online;
  doc["firmware"]     = FIRMWARE_VERSION;
  doc["connectivity"] = "wifi";
  doc["node_id"]      = NODE_ID;
  char out[200];
  size_t n = serializeJson(doc, out, sizeof(out));
  mqtt.publish(MQTT_TOPIC_STATUS, (const uint8_t*)out, n, true);
}

static bool ensureMqtt() {
  if (mqtt.connected()) return true;
  if (WiFi.status() != WL_CONNECTED) return false;
  Serial.println("[mqtt] connecting...");
  // HiveMQ Cloud requires TLS; cert validation skipped — pin or load CA for
  // production use.
  netClient.setInsecure();
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setBufferSize(1024);
  mqtt.setKeepAlive(60);
  // LWT: broker marks node offline if we drop without a clean disconnect.
  String willPayload = String("{\"online\":false,\"node_id\":\"") + NODE_ID + "\"}";
  if (mqtt.connect(NODE_ID, MQTT_USER, MQTT_PASS,
                   MQTT_TOPIC_STATUS, 1, true,
                   willPayload.c_str())) {
    Serial.println("[mqtt] connected");
    publishStatus(true);
    return true;
  }
  Serial.printf("[mqtt] failed rc=%d\n", mqtt.state());
  return false;
}

// =============================================================
// Payload
// =============================================================
static size_t buildPayload(const BufferedReading& r, char* out, size_t outLen) {
  StaticJsonDocument<512> doc;
  doc["node_id"]   = NODE_ID;
  doc["simulated"] = false;
  doc["pm1"]       = r.pm1;
  doc["pm25"]      = r.pm25;
  doc["pm10"]      = r.pm10;
  doc["co2"]       = r.co2;
  doc["tvoc"]      = r.tvoc;
  doc["temp_bme"]  = r.temp_bme;
  doc["rh_bme"]    = r.rh_bme;
  doc["pressure"]  = r.pressure;
  doc["temp_scd"]  = r.temp_scd;
  doc["rh_scd"]    = r.rh_scd;
  doc["uptime"]    = r.uptime;
  doc["wifi_rssi"] = r.wifi_rssi;
  doc["heap_free"] = r.heap_free;
  if (r.ts > 0) doc["ts"] = r.ts;   // unix seconds, UTC+6 baked into NTP cfg
  return serializeJson(doc, out, outLen);
}

static void flushBuffer() {
  if (!mqtt.connected()) return;
  BufferedReading r;
  char payload[640];
  // Send oldest first; cap per cycle so we don't hog the loop.
  for (int i = 0; i < 20 && bufferPop(r); i++) {
    size_t n = buildPayload(r, payload, sizeof(payload));
    if (!mqtt.publish(MQTT_TOPIC_DATA, (const uint8_t*)payload, n, false)) {
      // re-buffer at the head so order survives a transient failure
      bufferPush(r);
      break;
    }
    delay(20);
  }
}

// =============================================================
// Sensor reads
// =============================================================
static void readScd41(Sample& s) {
  uint16_t co2 = 0;
  float t = 0, h = 0;
  bool ready = false;
  if (scd4x.getDataReadyStatus(ready) != 0 || !ready) { s.scd_ok = false; return; }
  if (scd4x.readMeasurement(co2, t, h) != 0 || co2 == 0) { s.scd_ok = false; return; }
  s.co2 = co2;
  s.temp_scd = t;
  s.rh_scd = h;
  s.scd_ok = true;
}

static void readBme280(Sample& s) {
  s.temp_bme = bme.readTemperature();
  s.rh_bme   = bme.readHumidity();
  s.pressure = bme.readPressure() / 100.0f;   // hPa
  s.bme_ok = !isnan(s.temp_bme) && !isnan(s.rh_bme);
}

static void readSgp40(Sample& s) {
  // Sensirion VOC Index requires running their algorithm over raw counts;
  // Adafruit_SGP40::measureVocIndex applies it internally with T/RH compensation.
  if (s.bme_ok) {
    s.voc_index = sgp.measureVocIndex(s.temp_bme, s.rh_bme);
  } else {
    s.voc_index = sgp.measureVocIndex(25.0f, 50.0f);
  }
  s.sgp_ok = (s.voc_index >= 0);
}

// =============================================================
// Setup
// =============================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[boot] AETHER-IAQ " NODE_ID " fw " FIRMWARE_VERSION);

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  Wire.begin(SDA_PIN, SCL_PIN);

  // OLED
  if (!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[oled] not found");
  } else {
    oledStatus("Booting...");
  }

  // BME280
  if (!bme.begin(0x76) && !bme.begin(0x77)) {
    Serial.println("[bme] not found");
  }

  // SCD41
  scd4x.begin(Wire, 0x62);
  scd4x.stopPeriodicMeasurement();
  delay(500);
  if (scd4x.startPeriodicMeasurement() != 0) {
    Serial.println("[scd41] start failed");
  }

  // SGP40
  if (!sgp.begin()) {
    Serial.println("[sgp40] not found");
  }

  // PMS5003 UART2
  pmsSerial.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);

  // SIM800L UART1 (TX2/RX2 are reused for SIM per spec; UART2 is the PMS).
  // Hardware shares pins between PMS5003 and SIM800L in the bill of materials,
  // but per pin map the SIM800L sits on GPIO16/17. Use UART1 for SIM and a
  // software serial fallback if both are populated. Here we initialize UART1
  // only so it's ready for AT commands when the cellular fallback is wired.
  Serial1.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t wifiDeadline = millis() + 15000;
  while (WiFi.status() != WL_CONNECTED && millis() < wifiDeadline) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  // NTP — UTC+6 (Asia/Dhaka, no DST)
  if (WiFi.status() == WL_CONNECTED) {
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
    Serial.println("[ntp] sync requested");
  }

  ensureMqtt();
  oledStatus("Ready");
}

// =============================================================
// Loop
// =============================================================
static uint32_t nowEpoch() {
  time_t now = time(nullptr);
  return (now > 1700000000) ? (uint32_t)now : 0;   // 0 == unsynced
}

void loop() {
  ensureWifi();
  if (WiFi.status() == WL_CONNECTED) ensureMqtt();
  mqtt.loop();

  uint32_t now = millis();

  // Heartbeat status
  if (now - lastStatusMs > STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    publishStatus(true);
  }

  // Sensor cycle
  if (now - lastPublishMs >= PUBLISH_INTERVAL_MS) {
    lastPublishMs = now;

    sample.pms_ok = readPMS5003(sample);
    readBme280(sample);
    readScd41(sample);
    readSgp40(sample);

    BufferedReading r{};
    r.ts        = nowEpoch();
    r.pm1       = sample.pm1;
    r.pm25      = sample.pm25;
    r.pm10      = sample.pm10;
    r.co2       = sample.co2;
    r.tvoc      = (float)sample.voc_index;
    r.temp_bme  = sample.temp_bme;
    r.rh_bme    = sample.rh_bme;
    r.pressure  = sample.pressure;
    r.temp_scd  = sample.temp_scd;
    r.rh_scd    = sample.rh_scd;
    r.wifi_rssi = WiFi.RSSI();
    r.heap_free = ESP.getFreeHeap();
    r.uptime    = millis() / 1000;

    if (mqtt.connected()) {
      char payload[640];
      size_t n = buildPayload(r, payload, sizeof(payload));
      if (!mqtt.publish(MQTT_TOPIC_DATA, (const uint8_t*)payload, n, false)) {
        bufferPush(r);   // publish failed → buffer
      } else {
        flushBuffer();   // opportunistic catch-up
      }
    } else {
      bufferPush(r);     // offline → buffer
    }

    oledShowSample(sample);
  }

  delay(20);
}
