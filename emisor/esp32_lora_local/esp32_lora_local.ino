/*
  ESP32 emisora local: celular -> WiFi AP -> WebSocket -> LoRa 433 MHz.
  El receptor debe entender ASV1 y tener su propio timeout de seguridad.
  Esta placa no controla motores directamente.
*/

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <LoRa.h>
#include <SPI.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <WiFi.h>

const char *const AP_SSID = "ASV-San-Roque";
const char *const AP_PASSWORD = "SR-7F3C-92A6-4B1D";

constexpr int LORA_SCK = 18;
constexpr int LORA_MISO = 19;
constexpr int LORA_MOSI = 23;
constexpr int LORA_SS = 5;
constexpr int LORA_RST = 14;
constexpr int LORA_DIO0 = 26;
constexpr long LORA_FREQUENCY = 433E6;
constexpr uint8_t LORA_SYNC_WORD = 0x12;

constexpr uint32_t LORA_INTERVAL_MS = 300;
constexpr uint32_t COMMAND_TIMEOUT_MS = 750;
constexpr int MOTOR_NEUTRAL = 2048;

WebServer httpServer(80);
WebSocketsServer webSocket(81);
bool radioReady = false;
bool armed = false;
bool haveControl = false;
int controlOwner = -1;
int throttle = 0;
int steering = 0;
int probe = 0;
int motorLeft = MOTOR_NEUTRAL;
int motorRight = MOTOR_NEUTRAL;
uint32_t lastCommandAt = 0;
uint32_t lastLoRaAt = 0;
uint32_t radioSequence = 0;

void clearControl() {
  armed = false;
  haveControl = false;
  controlOwner = -1;
  throttle = 0;
  steering = 0;
  probe = 0;
  motorLeft = MOTOR_NEUTRAL;
  motorRight = MOTOR_NEUTRAL;
}

bool activeControl(uint32_t now) {
  return radioReady && armed && haveControl && controlOwner >= 0 &&
         webSocket.clientIsConnected(static_cast<uint8_t>(controlOwner)) &&
         now - lastCommandAt <= COMMAND_TIMEOUT_MS;
}

void sendLoRaControl() {
  if (!radioReady) return;
  const bool active = activeControl(millis());
  char packet[96];
  const int length = snprintf(
      packet, sizeof(packet), "ASV1,%lu,%d,%d,%d,%d,%d,%d",
      static_cast<unsigned long>(++radioSequence), active ? 1 : 0,
      active ? throttle : 0, active ? steering : 0, active ? probe : 0,
      active ? motorLeft : MOTOR_NEUTRAL,
      active ? motorRight : MOTOR_NEUTRAL);

  if (length < 0 || length >= static_cast<int>(sizeof(packet)) ||
      LoRa.beginPacket() != 1) {
    Serial.println("ERROR: no se pudo preparar LoRa");
    return;
  }
  LoRa.print(packet);
  const int sent = LoRa.endPacket();
  if (sent != 1 || radioSequence % 10 == 1) {
    Serial.printf("LoRa %s: %s\n", sent == 1 ? "enviado" : "ERROR", packet);
  }
}

void sendState(uint8_t client) {
  char message[120];
  snprintf(message, sizeof(message),
           "{\"type\":\"state\",\"gatewayOnline\":%s,\"controlOwner\":%s,\"armed\":%s}",
           radioReady ? "true" : "false", controlOwner >= 0 ? "true" : "false",
           armed ? "true" : "false");
  webSocket.sendTXT(client, message);
}

void broadcastState() {
  char message[120];
  snprintf(message, sizeof(message),
           "{\"type\":\"state\",\"gatewayOnline\":%s,\"controlOwner\":%s,\"armed\":%s}",
           radioReady ? "true" : "false", controlOwner >= 0 ? "true" : "false",
           armed ? "true" : "false");
  webSocket.broadcastTXT(message);
}

void sendError(uint8_t client, const char *code) {
  char message[100];
  snprintf(message, sizeof(message), "{\"type\":\"error\",\"code\":\"%s\"}", code);
  webSocket.sendTXT(client, message);
}

void stopControl(const char *reason) {
  clearControl();
  sendLoRaControl();
  char message[128];
  snprintf(message, sizeof(message),
           "{\"type\":\"safety-stop\",\"reason\":\"%s\"}", reason);
  webSocket.broadcastTXT(message);
  broadcastState();
  Serial.printf("Control desarmado: %s\n", reason);
}

bool percentIsValid(JsonVariantConst value) {
  return value.is<int>() && value.as<int>() >= -100 && value.as<int>() <= 100;
}

int to12Bit(int percent) {
  percent = constrain(percent, -100, 100);
  if (percent < 0) return ((percent + 100) * MOTOR_NEUTRAL + 50) / 100;
  return MOTOR_NEUTRAL + (percent * (4095 - MOTOR_NEUTRAL) + 50) / 100;
}

void handleMessage(uint8_t client, uint8_t *payload, size_t length) {
  StaticJsonDocument<384> doc;
  if (deserializeJson(doc, payload, length)) {
    sendError(client, "invalid_json");
    return;
  }
  const char *type = doc["type"] | "";
  if (strcmp(type, "stop") == 0) {
    stopControl("emergency");
    return;
  }
  if (strcmp(type, "arm") == 0) {
    if ((doc["armed"] | false) != true) {
      if (controlOwner == client || controlOwner < 0) stopControl("manual_disarm");
      return;
    }
    if (!radioReady) {
      sendError(client, "gateway_offline");
      return;
    }
    if (controlOwner >= 0 && controlOwner != client) {
      sendError(client, "control_busy");
      return;
    }
    clearControl();
    armed = true;
    controlOwner = client;
    lastCommandAt = millis();
    broadcastState();
    Serial.println("Control armado; esperando comandos");
    return;
  }
  if (strcmp(type, "control") != 0) return;
  if (!armed || controlOwner != client) {
    sendError(client, "not_armed");
    return;
  }
  if (!percentIsValid(doc["throttle"]) || !percentIsValid(doc["steering"]) ||
      !percentIsValid(doc["probe"])) {
    stopControl("invalid_control");
    return;
  }
  const int nextThrottle = doc["throttle"].as<int>();
  const int nextSteering = doc["steering"].as<int>();
  const int nextLeft = to12Bit(nextThrottle + nextSteering);
  const int nextRight = to12Bit(nextThrottle - nextSteering);
  if ((!doc["motorLeft"].isNull() &&
       (!doc["motorLeft"].is<int>() || doc["motorLeft"].as<int>() != nextLeft)) ||
      (!doc["motorRight"].isNull() &&
       (!doc["motorRight"].is<int>() || doc["motorRight"].as<int>() != nextRight))) {
    stopControl("invalid_control");
    return;
  }
  throttle = nextThrottle;
  steering = nextSteering;
  probe = doc["probe"].as<int>();
  motorLeft = nextLeft;
  motorRight = nextRight;
  lastCommandAt = millis();
  haveControl = true;
}

void onWebSocketEvent(uint8_t client, WStype_t type, uint8_t *payload,
                      size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("Panel conectado: %u\n", client);
      sendState(client);
      break;
    case WStype_DISCONNECTED:
      if (controlOwner == client) stopControl("controller_disconnected");
      Serial.printf("Panel desconectado: %u\n", client);
      break;
    case WStype_TEXT:
      handleMessage(client, payload, length);
      break;
    default:
      break;
  }
}

const char *contentType(const String &path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".json") || path.endsWith(".geojson"))
    return "application/json; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".webmanifest")) return "application/manifest+json";
  if (path.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

void serveFile() {
  String path = httpServer.uri();
  if (path == "/") path = "/index.html";
  if (path.indexOf("..") >= 0 || !LittleFS.exists(path)) {
    httpServer.send(404, "text/plain", "Archivo no encontrado");
    return;
  }
  File file = LittleFS.open(path, "r");
  if (!file || file.isDirectory()) {
    httpServer.send(404, "text/plain", "Archivo no encontrado");
    return;
  }
  httpServer.sendHeader("Cache-Control",
                        path.startsWith("/assets/")
                            ? "public, max-age=31536000, immutable"
                            : "no-cache");
  httpServer.streamFile(file, contentType(path));
  file.close();
}

void setup() {
  Serial.begin(115200);
  delay(400);

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  radioReady = LoRa.begin(LORA_FREQUENCY);
  if (radioReady) {
    LoRa.setSyncWord(LORA_SYNC_WORD);
    LoRa.setSpreadingFactor(7);
    LoRa.setSignalBandwidth(125E3);
    LoRa.enableCrc();
  } else {
    Serial.println("ERROR: LoRa no inicia; armado bloqueado");
  }

  if (!LittleFS.begin(false)) {
    Serial.println("ERROR: faltan archivos web en LittleFS (uploadfs)");
  }

  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1),
                    IPAddress(255, 255, 255, 0));
  if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) {
    Serial.println("ERROR: no se pudo crear el punto de acceso WiFi");
  }

  httpServer.on("/health", HTTP_GET, []() {
    char message[96];
    snprintf(message, sizeof(message),
             "{\"ok\":true,\"radioReady\":%s,\"armed\":%s}",
             radioReady ? "true" : "false", armed ? "true" : "false");
    httpServer.send(200, "application/json", message);
  });
  httpServer.onNotFound(serveFile);
  httpServer.begin();

  webSocket.onEvent(onWebSocketEvent);
  webSocket.begin();
  webSocket.enableHeartbeat(15000, 3000, 2);

  Serial.printf("WiFi local: %s\n", AP_SSID);
  Serial.printf("Pagina: http://%s\n", WiFi.softAPIP().toString().c_str());
  Serial.printf("LoRa: %s\n", radioReady ? "listo" : "ERROR");
}

void loop() {
  webSocket.loop();
  httpServer.handleClient();
  const uint32_t now = millis();
  if (armed && now - lastCommandAt > COMMAND_TIMEOUT_MS) {
    stopControl("deadman_timeout");
  }
  if (now - lastLoRaAt >= LORA_INTERVAL_MS) {
    lastLoRaAt = now;
    sendLoRaControl();
  }
}
