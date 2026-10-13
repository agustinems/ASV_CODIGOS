'use client';

import { useEffect, useState } from 'react';

const AXIS_DEADZONE = 0.12;
const TRIGGER_DEADZONE = 0.05;

export type XboxGamepadState = {
  supported: boolean;
  connected: boolean;
  id: string;
  throttle: number;
  steering: number;
  lt: number;
  rt: number;
  probe: number;
};

const INITIAL_STATE: XboxGamepadState = {
  supported: false,
  connected: false,
  id: '',
  throttle: 0,
  steering: 0,
  lt: 0,
  rt: 0,
  probe: 0,
};

function clamp(value: number, minimum = -1, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeAxis(value = 0) {
  const clamped = clamp(value);
  const magnitude = Math.abs(clamped);
  if (magnitude <= AXIS_DEADZONE) return 0;
  return Math.sign(clamped) * ((magnitude - AXIS_DEADZONE) / (1 - AXIS_DEADZONE));
}

function normalizeTrigger(button?: GamepadButton) {
  const value = clamp(button?.value ?? (button?.pressed ? 1 : 0), 0, 1);
  if (value <= TRIGGER_DEADZONE) return 0;
  return (value - TRIGGER_DEADZONE) / (1 - TRIGGER_DEADZONE);
}

function sameState(current: XboxGamepadState, next: XboxGamepadState) {
  return (
    current.supported === next.supported &&
    current.connected === next.connected &&
    current.id === next.id &&
    current.throttle === next.throttle &&
    current.steering === next.steering &&
    current.lt === next.lt &&
    current.rt === next.rt &&
    current.probe === next.probe
  );
}

export function useXboxGamepad() {
  const [state, setState] = useState<XboxGamepadState>(INITIAL_STATE);

  useEffect(() => {
    if (!('getGamepads' in navigator)) return;

    let animationFrame = 0;
    let preferredIndex: number | null = null;

    const poll = () => {
      const pads = Array.from(navigator.getGamepads()).filter(
        (gamepad): gamepad is Gamepad => Boolean(gamepad?.connected),
      );
      const gamepad =
        (preferredIndex === null ? null : navigator.getGamepads()[preferredIndex]) ||
        pads.find((pad) => pad.mapping === 'standard') ||
        pads[0];

      if (!gamepad) {
        const next = { ...INITIAL_STATE, supported: true };
        setState((current) => (sameState(current, next) ? current : next));
      } else {
        preferredIndex = gamepad.index;
        const steering = Math.round(normalizeAxis(gamepad.axes[0]) * 100);
        const throttle = Math.round(-normalizeAxis(gamepad.axes[1]) * 100);
        const lt = Math.round(normalizeTrigger(gamepad.buttons[6]) * 100);
        const rt = Math.round(normalizeTrigger(gamepad.buttons[7]) * 100);
        const next: XboxGamepadState = {
          supported: true,
          connected: true,
          id: gamepad.id,
          throttle,
          steering,
          lt,
          rt,
          // Positivo sube la sonda; negativo la baja. Si se pulsan ambos,
          // la diferencia evita órdenes contradictorias.
          probe: lt - rt,
        };
        setState((current) => (sameState(current, next) ? current : next));
      }

      animationFrame = requestAnimationFrame(poll);
    };

    const onConnected = (event: GamepadEvent) => {
      preferredIndex = event.gamepad.index;
    };
    const onDisconnected = (event: GamepadEvent) => {
      if (preferredIndex === event.gamepad.index) preferredIndex = null;
    };

    window.addEventListener('gamepadconnected', onConnected);
    window.addEventListener('gamepaddisconnected', onDisconnected);
    animationFrame = requestAnimationFrame(poll);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('gamepadconnected', onConnected);
      window.removeEventListener('gamepaddisconnected', onDisconnected);
    };
  }, []);

  return state;
}
