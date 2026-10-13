export type Telemetry = {
  type: 'telemetry';
  ts: number;
  receivedAt: number;
  lat: number;
  lon: number;
  speedKmh: number;
  distanceKm: number;
  headingDeg: number;
  batteryPct: number;
  voltage: number;
  rssi: number;
  snr: number;
  satellites: number;
  joystickThrottle?: number;
  joystickSteering?: number;
  joystickButton?: boolean;
  controlSource?: string;
  probeCommand?: number;
};

export type LinkMode = 'demo' | 'connecting' | 'live' | 'offline' | 'error';

export type LinkSettings = {
  url: string;
  token: string;
};

export const INITIAL_TELEMETRY: Telemetry = {
  type: 'telemetry',
  ts: Date.now(),
  receivedAt: Date.now(),
  lat: -31.3673581,
  lon: -64.4641370,
  speedKmh: 0,
  distanceKm: 0,
  headingDeg: 127,
  batteryPct: 78,
  voltage: 15.4,
  rssi: -67,
  snr: 9.4,
  satellites: 12,
};
