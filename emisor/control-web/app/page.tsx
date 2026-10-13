'use client';

import {
  AlertTriangle,
  BatteryMedium,
  Compass,
  Crosshair,
  Gamepad2,
  Gauge,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  Radio,
  Settings,
  ShieldAlert,
  Signal,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AsvMap } from '@/components/asv-map';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAsvLink } from '@/hooks/use-asv-link';
import { useXboxGamepad } from '@/hooks/use-xbox-gamepad';
import { EMBEDDED } from '@/lib/runtime';

type Point = { x: number; y: number };
const NEUTRAL_CONTROL = { throttle: 0, steering: 0, probe: 0 };

function Joystick({
  label,
  axisLabel,
  axis,
  accent = 'cyan',
  value,
  onChange,
}: {
  label: string;
  axisLabel: string;
  axis: 'vertical' | 'horizontal';
  accent?: 'cyan' | 'orange';
  value: number;
  onChange: (value: number) => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const point: Point = axis === 'vertical' ? { x: 0, y: value } : { x: value, y: 0 };

  const applyValue = useCallback(
    (nextValue: number) => {
      const clamped = Math.max(-100, Math.min(100, Math.round(nextValue)));
      onChange(clamped);
    },
    [onChange],
  );

  const move = useCallback(
    (clientX: number, clientY: number) => {
      const rect = padRef.current?.getBoundingClientRect();
      if (!rect) return;
      const radius = rect.width / 2;
      const limit = radius * 0.58;
      const raw = axis === 'vertical' ? radius - (clientY - rect.top) : clientX - rect.left - radius;
      applyValue((raw * 100) / limit);
    },
    [applyValue, axis],
  );

  return (
    <section className="control-panel" aria-label={label}>
      <div className="control-heading">
        <div>
          <span className="eyebrow">CONTROL</span>
          <h2>{label}</h2>
        </div>
        <output className="axis-readout" aria-live="polite">
          {axisLabel} {value > 0 ? '+' : ''}{value}%
        </output>
      </div>

      <div
        ref={padRef}
        className={`joystick joystick-${accent}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          applyValue(0);
        }}
        onPointerCancel={() => applyValue(0)}
      >
        <input
          className="joystick-a11y"
          type="range"
          min={-100}
          max={100}
          step={5}
          value={value}
          onChange={(event) => applyValue(Number(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === 'Escape') applyValue(0);
          }}
          aria-label={`${label}: ${axisLabel}`}
        />
        <span className="joy-label joy-label-top">AVANTE</span>
        <span className="joy-label joy-label-bottom">REVERSA</span>
        <span className="joy-label joy-label-left">BABOR</span>
        <span className="joy-label joy-label-right">ESTRIBOR</span>
        <span className="joystick-ring" />
        <span
          className="joystick-knob"
          style={{
            transform: `translate(calc(-50% + ${point.x * 0.58}px), calc(-50% + ${-point.y * 0.58}px))`,
          }}
        >
          <span />
        </span>
      </div>
    </section>
  );
}

/** A compact two-axis controller used only inside the mobile map. */
function MobileJoystick({
  throttle,
  steering,
  onChange,
}: {
  throttle: number;
  steering: number;
  onChange: (change: { throttle: number; steering: number }) => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);

  const move = useCallback(
    (clientX: number, clientY: number) => {
      const rect = padRef.current?.getBoundingClientRect();
      if (!rect) return;
      const radius = rect.width / 2;
      const limit = radius * 0.6;
      onChange({
        throttle: Math.max(-100, Math.min(100, Math.round(((radius - (clientY - rect.top)) * 100) / limit))),
        steering: Math.max(-100, Math.min(100, Math.round(((clientX - rect.left - radius) * 100) / limit))),
      });
    },
    [onChange],
  );

  return (
    <div
      ref={padRef}
      className="mobile-joystick"
      role="application"
      aria-label="Joystick de propulsión y dirección"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        onChange(NEUTRAL_CONTROL);
      }}
      onPointerCancel={() => onChange(NEUTRAL_CONTROL)}
    >
      <span className="mobile-joystick-label">JOYSTICK</span>
      <span
        className="mobile-joystick-knob"
        style={{
          transform: `translate(calc(-50% + ${steering * 0.5}px), calc(-50% + ${-throttle * 0.5}px))`,
        }}
      />
    </div>
  );
}

function formatCoordinates(lat: number, lon: number) {
  return `${lat.toFixed(6)}°, ${lon.toFixed(6)}°`;
}

function headingLabel(degrees: number) {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return labels[Math.round(degrees / 45) % 8];
}

export default function Home() {
  const link = useAsvLink();
  const { armed, requestArm, setControl } = link;
  const xbox = useXboxGamepad();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [serverToken, setServerToken] = useState('');
  const [centerSignal, setCenterSignal] = useState(0);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [lastDataAge, setLastDataAge] = useState(0);
  const [manualControlInput, setManualControlInput] = useState(NEUTRAL_CONTROL);
  const xboxWasConnected = useRef(false);

  const controlInput = xbox.connected
    ? { throttle: xbox.throttle, steering: xbox.steering, probe: xbox.probe }
    : manualControlInput;

  useEffect(() => {
    if (xbox.connected) {
      xboxWasConnected.current = true;
      const next = { throttle: xbox.throttle, steering: xbox.steering, probe: xbox.probe };
      setControl(next);
      return;
    }

    if (xboxWasConnected.current) {
      xboxWasConnected.current = false;
      setControl(NEUTRAL_CONTROL);
      const resetFrame = requestAnimationFrame(() => setManualControlInput(NEUTRAL_CONTROL));
      return () => cancelAnimationFrame(resetFrame);
    }
  }, [setControl, xbox.connected, xbox.probe, xbox.steering, xbox.throttle]);

  useEffect(() => {
    const update = () => setLastDataAge(Math.max(0, Math.round((Date.now() - link.telemetry.receivedAt) / 1000)));
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [link.telemetry.receivedAt]);

  useEffect(() => {
    if (!EMBEDDED && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  const modeLabel = {
    demo: 'Modo simulación',
    connecting: 'Conectando…',
    live: EMBEDDED ? 'ESP32 local' : link.gatewayOnline ? 'Gateway conectado' : 'Servidor conectado',
    offline: 'Sin conexión',
    error: 'Error de enlace',
  }[link.mode];
  const modeOk = link.mode === 'demo' || (link.mode === 'live' && link.gatewayOnline);

  const telemetry = [
    { label: 'Velocidad', value: link.hasTelemetry ? link.telemetry.speedKmh.toFixed(1).replace('.', ',') : '--', unit: 'km/h', icon: Gauge },
    { label: 'Distancia', value: link.hasTelemetry ? link.telemetry.distanceKm.toFixed(2).replace('.', ',') : '--', unit: 'km', icon: Navigation },
    { label: 'Rumbo', value: link.hasTelemetry ? `${Math.round(link.telemetry.headingDeg)}°` : '--', unit: link.hasTelemetry ? headingLabel(link.telemetry.headingDeg) : '', icon: Compass },
    { label: 'Batería', value: link.hasTelemetry ? Math.round(link.telemetry.batteryPct).toString() : '--', unit: '%', icon: BatteryMedium },
  ];

  const setManualControl = (change: Partial<typeof controlInput>) => {
    if (xbox.connected || !armed || stopped) return;
    setManualControlInput((current) => ({ ...current, ...change }));
    setControl(change);
  };

  const probeLabel =
    controlInput.probe > 0
      ? `Subiendo ${controlInput.probe}%`
      : controlInput.probe < 0
        ? `Bajando ${Math.abs(controlInput.probe)}%`
        : 'Detenida';

  const openSettings = () => {
    setServerUrl(link.settings.url);
    setServerToken(link.settings.token);
    setSettingsOpen(true);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true"><Navigation /></span>
          <div>
            <p className="eyebrow">ESTACIÓN DE CONTROL</p>
            <h1>ASV · Litoral 01</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className={`connection-pill ${modeOk ? '' : 'connection-offline'}`}
            type="button"
            onClick={openSettings}
            aria-label={`${modeLabel}. Configurar enlace`}
          >
            <span className="status-dot" />
            <span>{modeLabel}</span>
            <strong>{EMBEDDED ? 'LOCAL' : link.mode === 'demo' ? 'DEMO' : link.hasTelemetry ? `${link.telemetry.rssi} dBm` : '--'}</strong>
          </button>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger render={<Button variant="outline" size="icon" className="settings-trigger" onClick={openSettings} />}>
              <Settings /><span className="sr-only">Configurar servidor</span>
            </DialogTrigger>
            <DialogContent className="connection-dialog">
              <DialogHeader>
                <DialogTitle>Conexión al servidor</DialogTitle>
                <DialogDescription>
                  {EMBEDDED
                    ? 'Esta página se conecta automáticamente a la ESP32 por su WiFi local.'
                    : 'Ingresá la dirección WebSocket y el token del panel. El token queda guardado solamente en este dispositivo.'}
                </DialogDescription>
              </DialogHeader>
              {EMBEDDED ? (
                <div className="local-connection-info">
                  <strong>{link.mode === 'live' ? 'Conexión local activa' : 'Buscando la ESP32'}</strong>
                  <span>WiFi ASV-San-Roque · {link.settings.url}</span>
                </div>
              ) : (
                <>
              <label className="dialog-field" htmlFor="asv-server-url">
                <span>Dirección WebSocket</span>
                <Input
                  value={serverUrl}
                  id="asv-server-url"
                  onChange={(event) => setServerUrl(event.target.value)}
                  placeholder="wss://asv.ejemplo.com/ws/control"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </label>
              <label className="dialog-field" htmlFor="asv-server-token">
                <span>Token de acceso</span>
                <Input
                  type="password"
                  id="asv-server-token"
                  value={serverToken}
                  onChange={(event) => setServerToken(event.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                />
              </label>
              <DialogFooter className="connection-dialog-footer">
                <Button variant="ghost" onClick={() => { link.enableDemo(); setSettingsOpen(false); }}>
                  Usar simulación
                </Button>
                <Button onClick={() => { link.saveSettings({ url: serverUrl, token: serverToken }); setSettingsOpen(false); }}>
                  Conectar
                </Button>
              </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <section className="status-strip" aria-label="Estado del enlace">
        <div><Radio /> Canal <strong>433,0 MHz</strong></div>
        <div><Signal /> SNR <strong>{link.hasTelemetry ? `${link.telemetry.snr.toFixed(1).replace('.', ',')} dB` : '--'}</strong></div>
        <div><Crosshair /> GPS <strong>{link.hasTelemetry ? `${link.telemetry.satellites} sat.` : 'sin datos'}</strong></div>
        <div className="status-time">Último dato <strong>{link.hasTelemetry ? lastDataAge < 2 ? 'ahora' : `hace ${lastDataAge} s` : 'sin telemetría'}</strong></div>
      </section>

      <div className="dashboard-grid">
        {link.error && (
          <div className="link-alert" role="alert"><AlertTriangle /><span>{link.error}</span></div>
        )}

        <section className="safety-card" aria-label="Armado del control">
          <div className="arm-copy">
            <ShieldAlert />
            <div>
              <span className="eyebrow">SEGURIDAD</span>
              <strong>{stopped ? 'Parada activada' : armed ? 'Control armado' : 'Control desarmado'}</strong>
            </div>
          </div>
          <Button
            className="arm-action"
            disabled={!stopped && !armed && !modeOk}
            onClick={() => {
              setManualControlInput(NEUTRAL_CONTROL);
              if (stopped) setStopped(false);
              else requestArm(!armed);
            }}
          >
            {stopped ? 'Restablecer' : armed ? 'Desarmar' : 'Armar control'}
          </Button>
        </section>

        <section className={`map-card ${mapExpanded ? 'mobile-map-expanded' : ''}`} aria-label="Posición GPS actual">
          <div className="map-toolbar">
            <div>
              <span className="mobile-map-title">Mapa</span>
              <span className="eyebrow">POSICIÓN GPS</span>
              <p>{link.hasTelemetry ? formatCoordinates(link.telemetry.lat, link.telemetry.lon) : 'Lago San Roque · esperando GPS'}</p>
            </div>
            <button className="map-focus" type="button" aria-label="Centrar embarcación" onClick={() => setCenterSignal((value) => value + 1)}>
              <Crosshair />
            </button>
          </div>
          <AsvMap telemetry={link.telemetry} hasTelemetry={link.hasTelemetry} centerSignal={centerSignal} resizeSignal={mapExpanded} />
          <div className="mobile-map-actions" aria-label="Controles del mapa">
            <button
              type="button"
              aria-label="Centrar embarcación en el mapa"
              onClick={() => setCenterSignal((value) => value + 1)}
            >
              <Crosshair />
            </button>
            <button
              type="button"
              aria-label={mapExpanded ? 'Reducir mapa' : 'Ampliar mapa'}
              aria-pressed={mapExpanded}
              onClick={() => setMapExpanded((value) => !value)}
            >
              {mapExpanded ? <Minimize2 /> : <Maximize2 />}
            </button>
          </div>
          <div className="mobile-map-hud" aria-label="Controles y telemetría rápida">
            <div className="mobile-hud-top">
              <div className="mobile-battery">
                <BatteryMedium />
                <span>Batería</span>
                <strong>{link.hasTelemetry ? `${Math.round(link.telemetry.batteryPct)}%` : '--'}</strong>
              </div>
              <button
                className={`mobile-connection ${modeOk ? '' : 'connection-offline'}`}
                type="button"
                onClick={openSettings}
                aria-label={`${modeLabel}. Configurar enlace`}
              >
                <span className="status-dot" />
                <span>Conexión</span>
                <strong>{EMBEDDED ? 'LOCAL' : link.mode === 'demo' ? 'DEMO' : link.hasTelemetry ? `${link.telemetry.rssi} dBm` : '--'}</strong>
              </button>
            </div>
            <div className={`mobile-control-hud ${xbox.connected || !armed || stopped ? 'mobile-control-locked' : ''}`}>
              <MobileJoystick
                throttle={controlInput.throttle}
                steering={controlInput.steering}
                onChange={setManualControl}
              />
              <span className="mobile-control-caption">
                {xbox.connected ? 'Mando Xbox activo' : 'Propulsión y dirección'}
              </span>
            </div>
            <div className="mobile-navigation-data">
              <div><span>Velocidad</span><strong>{telemetry[0].value} <small>{telemetry[0].unit}</small></strong></div>
              <div><span>Distancia</span><strong>{telemetry[1].value} <small>{telemetry[1].unit}</small></strong></div>
              <div><span>Rumbo</span><strong>{telemetry[2].value} <small>{telemetry[2].unit}</small></strong></div>
              <div><span>Tensión</span><strong>{link.hasTelemetry ? link.telemetry.voltage.toFixed(1).replace('.', ',') : '--'} <small>V</small></strong></div>
            </div>
            <div className="mobile-map-details">
              <span>Canal <strong>433 MHz</strong></span>
              <span>SNR <strong>{link.hasTelemetry ? link.telemetry.snr.toFixed(1).replace('.', ',') : '--'} dB</strong></span>
              <span>GPS <strong>{link.hasTelemetry ? link.telemetry.satellites : '--'} sat.</strong></span>
              <span>Rumbo <strong>{telemetry[2].value} {telemetry[2].unit}</strong></span>
              <span>Tensión <strong>{link.hasTelemetry ? link.telemetry.voltage.toFixed(1).replace('.', ',') : '--'} V</strong></span>
            </div>
          </div>
        </section>

        <section className="telemetry-card" aria-label="Telemetría">
          <div className="section-title-row">
            <div><span className="eyebrow">EN VIVO</span><h2>Telemetría</h2></div>
            <span className="live-badge"><span /> 2 Hz</span>
          </div>
          <div className="telemetry-grid">
            {telemetry.map((item) => (
              <article className="metric" key={item.label}>
                <item.icon />
                <span>{item.label}</span>
                <div><strong>{item.value}</strong> <small>{item.unit}</small></div>
              </article>
            ))}
          </div>
          <div className="battery-row">
            <div className="battery-copy"><BatteryMedium /> Tensión <strong>{link.hasTelemetry ? link.telemetry.voltage.toFixed(1).replace('.', ',') : '--'} V</strong></div>
            <div className="battery-track"><span style={{ width: `${link.hasTelemetry ? link.telemetry.batteryPct : 0}%` }} /></div>
          </div>
        </section>

        <section
          className={`gamepad-card ${xbox.connected ? 'gamepad-connected' : ''}`}
          aria-label="Mando Xbox conectado al navegador"
        >
          <div className="gamepad-heading">
            <div className="arm-copy">
              <Gamepad2 />
              <div>
                <span className="eyebrow">MANDO XBOX</span>
                <strong>
                  {!xbox.supported
                    ? 'Navegador no compatible'
                    : xbox.connected
                      ? 'Conectado y listo'
                      : 'Conectá el mando y presioná un botón'}
                </strong>
              </div>
            </div>
            <span className={`gamepad-badge ${xbox.connected ? 'is-connected' : ''}`}>
              <span /> {xbox.connected ? 'ACTIVO' : 'ESPERANDO'}
            </span>
          </div>

          <div className="gamepad-controls">
            <div className="gamepad-stick-readout">
              <span className="gamepad-control-key">L</span>
              <div>
                <strong>Joystick izquierdo</strong>
                <small>Empuje {controlInput.throttle > 0 ? '+' : ''}{controlInput.throttle}% · Giro {controlInput.steering > 0 ? '+' : ''}{controlInput.steering}%</small>
              </div>
            </div>
            <div className="probe-readout">
              <div className={`trigger-pill ${xbox.lt > 0 ? 'trigger-active' : ''}`}>
                <span>LT</span><strong>Subir</strong><small>{xbox.lt}%</small>
              </div>
              <div className="probe-state">
                <span>SONDA</span>
                <strong>{probeLabel}</strong>
              </div>
              <div className={`trigger-pill ${xbox.rt > 0 ? 'trigger-active' : ''}`}>
                <span>RT</span><strong>Bajar</strong><small>{xbox.rt}%</small>
              </div>
            </div>
          </div>
        </section>

        {!EMBEDDED && <section className="joystick-status-card" aria-label="Joystick físico">
          <div className="arm-copy">
            <Gamepad2 />
            <div>
              <span className="eyebrow">JOYSTICK FÍSICO</span>
              <strong>
                {typeof link.telemetry.joystickThrottle === 'number'
                  ? `${link.telemetry.joystickThrottle > 0 ? '+' : ''}${link.telemetry.joystickThrottle}% empuje`
                  : 'Esperando datos'}
              </strong>
            </div>
          </div>
          <div className="physical-joystick-readout">
            <span>
              Giro{' '}
              <strong>
                {typeof link.telemetry.joystickSteering === 'number'
                  ? `${link.telemetry.joystickSteering > 0 ? '+' : ''}${link.telemetry.joystickSteering}%`
                  : '--'}
              </strong>
            </span>
            <span>Botón <strong>{link.telemetry.joystickButton ? 'pulsado' : 'libre'}</strong></span>
          </div>
        </section>}

        <div className={`controls-grid ${!armed || stopped ? 'controls-locked' : ''} ${xbox.connected ? 'controls-gamepad' : ''}`}>
          <Joystick
            label="Propulsión"
            axisLabel="Empuje"
            axis="vertical"
            accent="cyan"
            value={controlInput.throttle}
            onChange={(throttle) => setManualControl({ throttle })}
          />
          <Joystick
            label="Dirección"
            axisLabel="Giro"
            axis="horizontal"
            accent="orange"
            value={controlInput.steering}
            onChange={(steering) => setManualControl({ steering })}
          />
        </div>

        <Button
          className={`emergency-button ${stopped ? 'emergency-active' : ''}`}
          variant="destructive"
          onClick={() => {
            setStopped(true);
            setManualControlInput(NEUTRAL_CONTROL);
            link.emergencyStop();
          }}
        >
          <ShieldAlert />
          <span><strong>{stopped ? 'PARADA ACTIVADA' : 'PARADA DE EMERGENCIA'}</strong><small>Corta ambos motores</small></span>
        </Button>
      </div>

      <nav className="mobile-nav" aria-label="Navegación principal">
        <button className="active" type="button" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}><Gauge /><span>Control</span></button>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><MapPin /><span>Mapa</span></button>
        <button type="button" onClick={openSettings}><Radio /><span>Enlace</span></button>
      </nav>
    </main>
  );
}
