// Every movement constant lives here. Values are changed live from the
// in-headset debug panel, so always read `.value` at the point of use.

export interface Tunable {
  value: number;
  /** Unit shown in the debug panel. */
  unit: string;
  min: number;
  max: number;
  /** Amount one press of + or - changes the value by. */
  step: number;
  comment: string;
}

export const movementConfig = {
  handRadius: {
    value: 0.05, unit: 'm', min: 0.02, max: 0.15, step: 0.01,
    comment: 'Radius of the claw sphere on each hand. Bigger grabs surfaces from further away.',
  },
  bodyHeight: {
    value: 0.6, unit: 'm', min: 0.3, max: 1.4, step: 0.05,
    comment: 'Distance from the eyes down to the bottom of the body. Smaller puts the ground higher, so hands reach it more easily.',
  },
  bodyRadius: {
    value: 0.3, unit: 'm', min: 0.15, max: 0.5, step: 0.05,
    comment: 'Radius of the body sphere. Keeps the face this far from walls.',
  },
  gravity: {
    value: 9.8, unit: 'm/s2', min: 2, max: 15, step: 0.2,
    comment: 'Downward acceleration when no claw is holding. Lower feels floatier.',
  },
  clawStickDistance: {
    value: 0.04, unit: 'm', min: 0, max: 0.2, step: 0.01,
    comment: 'How far a claw can drift away from a surface before it lets go. Higher makes climbing more forgiving.',
  },
  clawContactMargin: {
    value: 0.01, unit: 'm', min: 0.005, max: 0.05, step: 0.005,
    comment: 'A planted claw stays planted while the surface is within this distance.',
  },
  pushVelocityWindow: {
    value: 0.08, unit: 's', min: 0.02, max: 0.3, step: 0.01,
    comment: 'Time over which push speed is averaged. The body keeps this speed when the claws let go.',
  },
  jumpMultiplier: {
    value: 1.1, unit: 'x', min: 0.5, max: 2, step: 0.05,
    comment: 'Push speed is multiplied by this at the moment the claws let go.',
  },
  maxPushSpeed: {
    value: 6.5, unit: 'm/s', min: 2, max: 12, step: 0.5,
    comment: 'Fastest speed a claw push can give.',
  },
  groundFriction: {
    value: 6, unit: '1/s', min: 0, max: 20, step: 0.5,
    comment: 'How quickly sliding along the ground stops. Higher stops sooner.',
  },
  flapSpeedThreshold: {
    value: 1.5, unit: 'm/s', min: 0.5, max: 4, step: 0.1,
    comment: 'Downward hand speed both hands must exceed for a sweep to count as a flap.',
  },
  flapSyncWindow: {
    value: 150, unit: 'ms', min: 50, max: 400, step: 10,
    comment: 'Both hands must start their down-sweep within this time of each other.',
  },
  maxFlySpeed: {
    value: 8, unit: 'm/s', min: 3, max: 15, step: 0.5,
    comment: 'Comfort cap on flying and falling speed.',
  },
  glideSinkRate: {
    value: 1, unit: 'm/s', min: 0.2, max: 4, step: 0.1,
    comment: 'How fast the player sinks while gliding with arms out and level.',
  },
  catchAbsorbTime: {
    value: 0.2, unit: 's', min: 0.05, max: 0.6, step: 0.05,
    comment: 'Time over which incoming speed is absorbed when a hand catches a surface.',
  },
  flapsPerFullStamina: {
    value: 12, unit: 'flaps', min: 3, max: 40, step: 1,
    comment: 'Number of full-strength flaps a full stamina bar pays for.',
  },
  staminaRefillTime: {
    value: 3, unit: 's', min: 0.5, max: 10, step: 0.5,
    comment: 'Time to refill stamina from empty while standing, perching or hanging.',
  },
  staminaEnabled: {
    value: 1, unit: 'on/off', min: 0, max: 1, step: 1,
    comment: '1 = flapping drains stamina. 0 = unlimited flapping.',
  },
} satisfies Record<string, Tunable>;

export type MovementConfig = typeof movementConfig;

/** Nudge a tunable by one step up (+1) or down (-1), clamped to its range. */
export function nudge(t: Tunable, direction: 1 | -1): void {
  const stepped = Math.round((t.value + direction * t.step) / t.step) * t.step;
  t.value = Number(Math.min(t.max, Math.max(t.min, stepped)).toFixed(4));
}
