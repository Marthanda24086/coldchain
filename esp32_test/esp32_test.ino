/*
  CoolChain: Cold Chain Monitoring (ESP32 + DHT11)
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include "DHT.h"

// ---------- WiFi ----------
const char* WIFI_SSID = "Barbarik";
const char* WIFI_PASS = "teja@24806";

// ---------- ThingSpeak ----------
const char* TS_API_KEY = "MEFOPQILFT4TFX4F";
const char* TS_URL     = "https://api.thingspeak.com/update";

// ---------- Pins ----------
#define DHT_PIN    4
#define DHT_TYPE   DHT11
#define BUZZER_PIN 18
#define LED_PIN    2  

// ---------- Safe limits (example: vaccine storage 2-8 C) ----------
const float TEMP_MIN      = 2.0;
const float TEMP_MAX      = 8.0;
const float HUM_MIN       = 30.0;
const float HUM_MAX       = 70.0;
const float TEMP_SETPOINT = 5.0;

// ---------- Timing ----------
const unsigned long READ_INTERVAL_MS = 5000;
const unsigned long TS_INTERVAL_MS   = 15000;   // ThingSpeak free tier: min 15 s

// ---------- Rolling average ----------
const int WINDOW = 12;
float tempBuf[WINDOW];
int bufCount = 0, bufIdx = 0;

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastRead = 0;
unsigned long lastTS = 0;

float rollingAvg(float newVal) {
  tempBuf[bufIdx] = newVal;
  bufIdx = (bufIdx + 1) % WINDOW;
  if (bufCount < WINDOW) bufCount++;
  float sum = 0;
  for (int i = 0; i < bufCount; i++) sum += tempBuf[i];
  return sum / bufCount;
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
    delay(5000);
  } else {
    Serial.println("\nWiFi failed (will retry)");
  }
}

void sendToThingSpeak(float t, float h, float avg, float dev, int breach) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(TS_URL) + "?api_key=" + TS_API_KEY +
               "&field1=" + String(t, 1) +
               "&field2=" + String(h, 1) +
               "&field3=" + String(avg, 2) +
               "&field4=" + String(dev, 2) +
               "&field5=" + String(breach);
  http.begin(url);
  int code = http.GET();
  Serial.printf("ThingSpeak response: %d (0 or negative = failed)\n", code);
  http.end();
}

void readAndProcess() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (isnan(t) || isnan(h)) {
    Serial.println("DHT read failed - check wiring");
    return;
  }

  float avg = rollingAvg(t);
  float dev = ((t - TEMP_SETPOINT) / TEMP_SETPOINT) * 100.0;

  bool breach = (t < TEMP_MIN || t > TEMP_MAX || h < HUM_MIN || h > HUM_MAX);

  Serial.printf("T=%.1fC H=%.1f%% Avg=%.2fC Dev=%.1f%% Breach=%d\n", t, h, avg, dev, breach);

  digitalWrite(LED_PIN, breach ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, breach ? HIGH : LOW);

  if (millis() - lastTS >= TS_INTERVAL_MS || lastTS == 0) {
    sendToThingSpeak(t, h, avg, dev, breach ? 1 : 0);
    lastTS = millis();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  dht.begin();
  connectWiFi();
}

void loop() {
  connectWiFi();
  if (millis() - lastRead >= READ_INTERVAL_MS) {
    lastRead = millis();
    readAndProcess();
  }
}
