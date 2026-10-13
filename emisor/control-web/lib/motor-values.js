export const MOTOR_NEUTRAL = 2048;

/** @param {number} percent */
function to12Bit(percent) {
  const limited = Math.max(-100, Math.min(100, percent));
  return limited < 0
    ? Math.round(((limited + 100) * MOTOR_NEUTRAL) / 100)
    : MOTOR_NEUTRAL + Math.round((limited * (4095 - MOTOR_NEUTRAL)) / 100);
}

/**
 * @param {number} throttle Avance/reversa, de -100 a 100.
 * @param {number} steering Giro, de -100 a 100.
 */
export function motorValues(throttle, steering) {
  return {
    motorLeft: to12Bit(throttle + steering),
    motorRight: to12Bit(throttle - steering),
  };
}
