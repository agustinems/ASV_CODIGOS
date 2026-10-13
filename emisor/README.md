# ESP32 emisora con página web local

Firmware: [`esp32_lora_local/esp32_lora_local.ino`](esp32_lora_local/esp32_lora_local.ino).

Crea la red WiFi **ASV-San-Roque**, contraseña **SR-7F3C-92A6-4B1D**. Conectarse a esa red y abrir **http://192.168.4.1/**. El servidor HTTP usa el puerto 80 y el WebSocket el 81. Recibe los controles de la página y los transmite por LoRa cada 300 ms; el control inicia desarmado. No acciona motores directamente.

## Compilar y cargar

Desde esta carpeta, con PlatformIO instalado:

```sh
python3 -m platformio run -e emisor
python3 -m platformio run -e emisor -t upload --upload-port PUERTO_USB
python3 -m platformio run -e emisor -t uploadfs --upload-port PUERTO_USB
```

Reemplazar `PUERTO_USB` por el puerto real de la placa. `upload` carga el firmware y `uploadfs` la página y el mapa en LittleFS; ambos son necesarios en una placa nueva. Se incluye `control-web/dist-esp32` ya generado.

## Modificar la página

El código fuente está en `control-web`. Requiere Node.js >=22.13.0:

```sh
cd control-web
npm ci
npm run build:esp32
cd ..
python3 -m platformio run -e emisor -t uploadfs --upload-port PUERTO_USB
```

El emisor envía neutro si pierde los comandos de la página durante más de 750 ms. La red local no tiene salida a Internet.
