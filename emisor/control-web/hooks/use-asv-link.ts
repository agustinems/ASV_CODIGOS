'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  INITIAL_TELEMETRY,
  type LinkMode,
  type LinkSettings,
  type Telemetry,
} from '@/lib/asv-types';
import { motorValues } from '@/lib/motor-values.js';
import { EMBEDDED } from '@/lib/runtime';

const STORAGE_KEY = 'asv-link-settings-v1';

function defaultUrl() {
  if (typeof window === 'undefined') return 'ws://localhost:8081/ws/control';
  if (EMBEDDED) return `ws://${window.location.hostname}:81/ws/control`;
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/control`;
}

function loadSettings(): LinkSettings {
  if (typeof window === 'undefined') return { url: '', token: '' };
  if (EMBEDDED) return { url: defaultUrl(), token: '' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      url: typeof saved.url === 'string' ? saved.url : '',
      token: typeof saved.token === 'string' ? saved.token : '',
    };
  } catch {
    return { url: '', token: '' };
  }
}

function normalizeSettings(settings: LinkSettings): LinkSettings {
  if (EMBEDDED) return { url: defaultUrl(), token: '' };
  return {
    url: settings.url.trim() || defaultUrl(),
    token: settings.token.trim(),
  };
}

export function useAsvLink() {
  const [telemetry, setTelemetry] = useState<Telemetry>(INITIAL_TELEMETRY);
  const [hasTelemetry, setHasTelemetry] = useState(false);
  const [mode, setMode] = useState<LinkMode>(EMBEDDED ? 'connecting' : 'demo');
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<LinkSettings>(() => loadSettings());
  const socketRef = useRef<WebSocket | null>(null);
  const controlRef = useRef({ throttle: 0, steering: 0, probe: 0, seq: 0 });
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manuallyClosed = useRef(false);

  const closeSocket = useCallback(() => {
    manuallyClosed.current = true;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const connect = useCallback((nextSettings: LinkSettings) => {
    const normalized = normalizeSettings(nextSettings);
    if (!EMBEDDED && !normalized.token) {
      setError('Ingresá el token de acceso del servidor.');
      setMode('error');
      return;
    }

    manuallyClosed.current = false;
    socketRef.current?.close();
    setMode('connecting');
    setError(null);
    const url = new URL(normalized.url);
    if (normalized.token) url.searchParams.set('token', normalized.token);
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.addEventListener('open', () => setMode('live'));
    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'telemetry') {
          setTelemetry({ ...payload, receivedAt: payload.receivedAt || Date.now() });
          setHasTelemetry(true);
        } else if (payload.type === 'state') {
          setGatewayOnline(Boolean(payload.gatewayOnline));
          setArmed(Boolean(payload.armed));
        } else if (payload.type === 'safety-stop') {
          setArmed(false);
          controlRef.current = { throttle: 0, steering: 0, probe: 0, seq: 0 };
          setError(
            payload.reason === 'deadman_timeout'
              ? 'Control desarmado: se activó el tiempo muerto de seguridad.'
              : null,
          );
        } else if (payload.type === 'error') {
          const messages: Record<string, string> = {
            gateway_offline: 'El gateway LoRa está desconectado.',
            control_busy: 'Otro dispositivo tiene el control.',
            not_armed: 'El servidor rechazó el comando: control desarmado.',
          };
          setError(messages[payload.code] || `Error del servidor: ${payload.code}`);
        }
      } catch {
        setError('El servidor envió un mensaje inválido.');
      }
    });
    socket.addEventListener('close', (event) => {
      if (socketRef.current !== socket) return;
      setArmed(false);
      setGatewayOnline(false);
      setHasTelemetry(false);
      if (manuallyClosed.current) return;
      setMode(event.code === 1006 ? 'error' : 'offline');
      setError(EMBEDDED
        ? 'Sin enlace con la ESP32. Revisá la red ASV-San-Roque; la página intentará reconectarse.'
        : event.code === 1006
          ? 'No se pudo autenticar o alcanzar el servidor.'
          : 'Conexión cerrada.');
    });
    socket.addEventListener('error', () => {
      setMode('error');
    });
  }, []);

  useEffect(() => {
    const saved = loadSettings();
    queueMicrotask(() => {
      if (EMBEDDED || (saved.url && saved.token)) connect(saved);
    });
    return closeSocket;
  }, [closeSocket, connect]);

  useEffect(() => {
    if (!EMBEDDED || (mode !== 'error' && mode !== 'offline') || manuallyClosed.current) return;
    reconnectTimer.current = setTimeout(() => connect(loadSettings()), 2000);
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    };
  }, [connect, mode]);

  useEffect(() => {
    if (mode !== 'demo') return;
    const interval = setInterval(() => {
      setTelemetry((current) => {
        const { throttle, steering } = controlRef.current;
        const targetSpeed = armed ? Math.abs(throttle) * 0.075 : 0;
        const speedKmh = current.speedKmh + (targetSpeed - current.speedKmh) * 0.22;
        const headingDeg = (current.headingDeg + (armed ? steering * 0.012 : 0) + 360) % 360;
        const stepKm = speedKmh / 7200;
        const heading = (headingDeg * Math.PI) / 180;
        const lat = current.lat + (Math.cos(heading) * stepKm) / 111;
        const lon = current.lon +
          (Math.sin(heading) * stepKm) / (111 * Math.cos((current.lat * Math.PI) / 180));
        return {
          ...current,
          ts: Date.now(),
          receivedAt: Date.now(),
          lat,
          lon,
          speedKmh,
          headingDeg,
          distanceKm: current.distanceKm + stepKm,
          batteryPct: Math.max(0, current.batteryPct - Math.abs(throttle) * 0.00002),
          rssi: Math.round(-67 + Math.sin(Date.now() / 6000) * 4),
          snr: Number((9.4 + Math.sin(Date.now() / 4200)).toFixed(1)),
        };
      });
    }, 500);
    return () => clearInterval(interval);
  }, [armed, mode]);

  useEffect(() => {
    if (mode !== 'live' || !armed) return;
    const interval = setInterval(() => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      controlRef.current.seq += 1;
      socket.send(
        JSON.stringify({
          type: 'control',
          ...controlRef.current,
          ...motorValues(controlRef.current.throttle, controlRef.current.steering),
          ts: Date.now(),
        }),
      );
    }, 100);
    return () => clearInterval(interval);
  }, [armed, mode]);

  const saveSettings = useCallback(
    (nextSettings: LinkSettings) => {
      const normalized = normalizeSettings(nextSettings);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setSettingsState(normalized);
      connect(normalized);
    },
    [connect],
  );

  const enableDemo = useCallback(() => {
    closeSocket();
    setMode('demo');
    setGatewayOnline(true);
    setArmed(false);
    setHasTelemetry(true);
    setError(null);
  }, [closeSocket]);

  const requestArm = useCallback(
    (nextArmed: boolean) => {
      setError(null);
      controlRef.current = { throttle: 0, steering: 0, probe: 0, seq: 0 };
      if (mode === 'demo') {
        setArmed(nextArmed);
        return;
      }
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'arm', armed: nextArmed }));
      }
    },
    [mode],
  );

  const setControl = useCallback((change: Partial<{ throttle: number; steering: number; probe: number }>) => {
    controlRef.current = { ...controlRef.current, ...change };
  }, []);

  const emergencyStop = useCallback(() => {
    controlRef.current = { throttle: 0, steering: 0, probe: 0, seq: 0 };
    setArmed(false);
    if (mode === 'live' && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, [mode]);

  return {
    telemetry,
    hasTelemetry: mode === 'demo' || hasTelemetry,
    mode,
    gatewayOnline: mode === 'demo' ? true : gatewayOnline,
    armed,
    error,
    settings,
    saveSettings,
    enableDemo,
    requestArm,
    setControl,
    emergencyStop,
  };
}
