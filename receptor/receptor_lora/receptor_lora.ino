/*
  ESP32 receptor LoRa para los controles ASV1 de la pagina.

  Los valores recibidos quedan en currentControl y se envian por UART2 como
  X,Y\n a otra ESP32: GPIO17 (TX) -> RX de la otra ESP32 y GND comun.
  UART: 115200 baudios, 8N1, valores 0..4095, centro 2048.
  Esta ESP32 no acciona motores.
*/

#include <Arduino.h>
#include <SPI.h>
#include <LoRa.h>

#include "control_packet.h"

constexpr int LORA_SCK = 18;
constexpr int LORA_MISO = 19;
constexpr int LORA_MOSI = 23;
constexpr int LORA_SS = 5;
constexpr int LORA_RST = 14;
constexpr int LORA_DIO0 = 26;
constexpr long LORA_FREQUENCY = 433E6;
constexpr uint8_t LORA_SYNC_WORD = 0x12;

constexpr uint32_t PACKET_TIMEOUT_MS = 900;
constexpr size_t MAX_PACKET_LENGTH = 96;
constexpr uint32_t UART_REFRESH_MS = 100;
constexpr int JOYSTICK_CENTER = 2048;
constexpr uint32_t UART_BAUD = 115200;
constexpr int UART_RX_PIN = 16;
constexpr int UART_TX_PIN = 17;

HardwareSerial joystickUart(2);

ControlPacket currentControl = neutralControl();
bool haveSequence = false;
uint32_t lastSequence = 0;
uint32_t lastValidPacketAt = 0;
uint32_t lastUartRefreshAt = 0;

int toJoystickRaw(int percent) {
  percent = constrain(percent, -100, 100);
  if (percent < 0) return ((percent + 100) * JOYSTICK_CENTER + 50) / 100;
  return JOYSTICK_CENTER + (percent * (4095 - JOYSTICK_CENTER) + 50) / 100;
}

void publishJoystickUart() {
  const bool active = currentControl.armed;
  const int rawX = toJoystickRaw(active ? currentControl.steering : 0);
  // El joystick HW-504 original usa Y invertido: valor bajo = avance.
  const int rawY = toJoystickRaw(active ? -currentControl.throttle : 0);
  joystickUart.printf("%d,%d\n", rawX, rawY);
}

void setSafeControl() {
  currentControl = neutralControl();
}

bool isNewSequence(uint32_t sequence) {
  return !haveSequence || static_cast<int32_t>(sequence - lastSequence) > 0;
}

void receivePacket(int packetSize) {
  if (packetSize <= 0) return;

  if (packetSize >= static_cast<int>(MAX_PACKET_LENGTH)) {
    while (LoRa.available()) LoRa.read();
    Serial.println("Paquete LoRa demasiado largo; descartado");
    return;
  }

  char message[MAX_PACKET_LENGTH];
  int length = 0;
  while (LoRa.available() && length < packetSize) {
    message[length++] = static_cast<char>(LoRa.read());
  }
  message[length] = '\0';

  if (length != packetSize || strlen(message) != static_cast<size_t>(length)) {
    Serial.println("Paquete LoRa incompleto; descartado");
    return;
  }

  ControlPacket incoming;
  if (!parseControlPacket(message, incoming)) {
    Serial.printf("Trama ASV1 invalida: %s\n", message);
    return;
  }
  if (!isNewSequence(incoming.sequence)) {
    Serial.printf("Secuencia repetida o antigua: %lu\n",
                  static_cast<unsigned long>(incoming.sequence));
    return;
  }

  currentControl = incoming;
  haveSequence = true;
  lastSequence = incoming.sequence;
  lastValidPacketAt = millis();
  publishJoystickUart();

  Serial.printf(
      "RECIBIDO seq=%lu armado=%d empuje=%d giro=%d sonda=%d "
      "motorLeft=%d motorRight=%d RSSI=%d SNR=%.1f\n",
      static_cast<unsigned long>(currentControl.sequence),
      currentControl.armed ? 1 : 0,
      currentControl.throttle, currentControl.steering,
      currentControl.probe, currentControl.motorLeft,
      currentControl.motorRight, LoRa.packetRssi(), LoRa.packetSnr());
}

void setup() {
  Serial.begin(115200);
  joystickUart.begin(UART_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);
  delay(1000);
  publishJoystickUart();
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  Serial.println("Iniciando receptor ASV1...");
  if (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println("ERROR: No se pudo iniciar LoRa");
    while (true) {
      publishJoystickUart();
      delay(UART_REFRESH_MS);
    }
  }

  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(125E3);
  LoRa.enableCrc();

  Serial.println("Receptor LoRa ASV1 listo");
  Serial.printf("Joystick UART2: %lu bps, TX GPIO%d, formato X,Y\\n\n",
                static_cast<unsigned long>(UART_BAUD), UART_TX_PIN);

}

void loop() {
  receivePacket(LoRa.parsePacket());

  if (haveSequence && millis() - lastValidPacketAt > PACKET_TIMEOUT_MS) {
    setSafeControl();
    haveSequence = false;
    publishJoystickUart();
    Serial.println("Sin paquetes LoRa: motores en neutro y control desarmado");
  }

  if (millis() - lastUartRefreshAt >= UART_REFRESH_MS) {
    lastUartRefreshAt = millis();
    publishJoystickUart();
  }
}
