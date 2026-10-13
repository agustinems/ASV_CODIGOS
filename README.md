# ASV: códigos actuales del emisor y receptor

Sistema de control local: **página web → WiFi → ESP32 emisora → LoRa 433 MHz → ESP32 receptora → UART → otra ESP32**.

- [`emisor/`](emisor/): servidor web local, página de control y transmisión LoRa.
- [`receptor/`](receptor/): recepción LoRa y salida del joystick X/Y por UART2. No tiene salida I²C.

Cada carpeta es un proyecto independiente de PlatformIO para ESP32 Dev Module (`esp32dev`). Los sketches `.ino` también se pueden abrir con Arduino IDE; el emisor requiere además cargar los archivos web en LittleFS.

## Pines LoRa en ambas placas

| Señal | GPIO |
| --- | --- |
| SCK | 18 |
| MISO | 19 |
| MOSI | 23 |
| CS | 5 |
| RST | 14 |
| DIO0 | 26 |

Radio SX1278: 433 MHz, sync word `0x12`, SF7, ancho de banda 125 kHz y CRC. Ambas placas usan el protocolo ASV1. Ver instrucciones de compilación y carga en cada carpeta.

La página incluye geometría de Lago San Roque de OpenStreetMap contributors y conserva la atribución en el mapa. La telemetría real del barco todavía no se devuelve a la página.
