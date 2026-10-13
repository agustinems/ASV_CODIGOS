# ESP32 receptora LoRa con salida UART

Firmware: [`receptor_lora/receptor_lora.ino`](receptor_lora/receptor_lora.ino). Recibe tramas ASV1, valida sus campos y secuencia, y convierte giro/empuje a valores X/Y de joystick. No tiene servidor web ni salida I²C.

## UART hacia otra ESP32

- GPIO **17 (TX)** del receptor → RX configurado en la otra ESP32, por ejemplo GPIO 16.
- GND común, niveles de 3,3 V.
- **115200 baudios, 8N1**. No hace falta conectar el TX de la otra ESP32.

Formato de texto: `X,Y` terminado en salto de línea (`\n`). Por ejemplo:

```text
2048,2048
```

Rango 0–4095; centro 2048. X mayor gira a la derecha, Y menor avanza. Envía cada 100 ms y al recibir una trama válida. Con control desarmado o tras más de 900 ms sin paquetes válidos, envía `2048,2048`.

## Compilar y cargar

Desde esta carpeta:

```sh
python3 -m platformio run -e receptor
python3 -m platformio run -e receptor -t upload --upload-port PUERTO_USB
```

Reemplazar `PUERTO_USB` por el puerto real de la placa. La placa que recibe UART debe separar los dos enteros por la coma y leer hasta `\n`.
