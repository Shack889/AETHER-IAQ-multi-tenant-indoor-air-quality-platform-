# AETHER-IAQ ESP32 Firmware

Node: **AETHER-N01**
Sketch: `aether_node/aether_node.ino`

## Pin map

| Function     | GPIO |
|--------------|------|
| I2C SDA      | 21   |
| I2C SCL      | 22   |
| PMS5003 RX (ESP RX, sensor TX) | 26 |
| PMS5003 TX (ESP TX, sensor RX) | 25 |
| SIM800L RX (RX2) | 16 |
| SIM800L TX (TX2) | 17 |
| Relay        | 15   |
| Buzzer       | 33   |

No LEDs, no MQ-135, no DHT22.

## Sensors on I2C (SDA 21 / SCL 22)

- SCD41 — CO₂, temperature, humidity (addr 0x62)
- SGP40 — VOC index with humidity compensation (addr 0x59)
- BME280 — temperature, humidity, pressure (addr 0x76 or 0x77)
- SSD1306 OLED 128x64 (addr 0x3C)

Out-of-band:

- PMS5003 — PM1 / PM2.5 / PM10 on UART2 (GPIO 26/25)
- SIM800L — cellular fallback on UART1 (GPIO 16/17)

## Arduino libraries

Install via Library Manager:

- `PubSubClient`
- `ArduinoJson`
- `Adafruit GFX Library`
- `Adafruit SSD1306`
- `Adafruit BME280 Library`
- `Adafruit SGP40 Sensor`
- `Sensirion I2C SCD4x`

Board: **ESP32 Dev Module** (esp32 core ≥ 2.0.14).

## Credentials — fill before flashing

Edit the top of `aether_node.ino`:

```cpp
const char* WIFI_SSID   = "your-ssid";
const char* WIFI_PASS   = "your-pass";

const char* MQTT_BROKER = "your-cluster.s1.eu.hivemq.cloud";
const char* MQTT_USER   = "your-hivemq-user";
const char* MQTT_PASS   = "your-hivemq-pass";
```

`NODE_ID` and `MQTT_TOPIC_DATA` are already set to `AETHER-N01` and
`aether/AETHER-N01/data`.

## Behavior

- Publishes JSON every 15 s to `aether/AETHER-N01/data` (QoS 0, retained=false).
  Payload includes `"simulated": false` so the backend stamps the reading as
  real hardware on the legacy 3-segment topic.
- Status heartbeat every 60 s on `aether/AETHER-N01/status` with LWT for clean
  offline detection.
- NTP sync to UTC+6 (Asia/Dhaka, no DST) using `pool.ntp.org` and
  `time.google.com`.
- Offline buffer: 200 readings held in RAM. Drained oldest-first (20 per cycle)
  once MQTT reconnects. Ring-buffer overwrites oldest on overflow.
- OLED shows PM2.5, CO₂, VOC index, temp/RH, WiFi state, and buffer fill.

## Payload schema

```json
{
  "node_id":   "AETHER-N01",
  "simulated": false,
  "pm1":  4.0, "pm25": 12.0, "pm10": 18.0,
  "co2":  650,
  "tvoc": 95,
  "temp_bme": 26.1, "rh_bme": 54.2, "pressure": 1011.3,
  "temp_scd": 26.3, "rh_scd": 54.8,
  "uptime":    1234,
  "wifi_rssi": -48,
  "heap_free": 184320,
  "ts": 1717777215
}
```
