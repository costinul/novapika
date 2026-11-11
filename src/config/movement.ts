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
    value: 0.35, unit: 'm', min: 0.15, max: 0.5, step: 0.05,
    comment: 'Radius of the body sphere. Keeps the eyes clear of walls and ceilings.',
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
  perchStickSpeed: {
    value: 0.6, unit: 'm/s', min: 0, max: 2, step: 0.1,
    comment: 'A body slower than this on a walkable surface stops dead, so it can perch on slopes and round branches.',
  },
  handSpeedSmoothing: {
    value: 0.03, unit: 's', min: 0.01, max: 0.15, step: 0.01,
    comment: 'Time over which hand speed is averaged before it is tested for a flap.',
  },
  flapPower: {
    value: 13, unit: 'm/s per m', min: 2, max: 30, step: 1,
    comment: 'Upward speed gained per metre of downstroke. The main "how strong is a flap" value.',
  },
  flapSpeedCap: {
    value: 4, unit: 'm/s', min: 2, max: 8, step: 0.5,
    comment: 'Hand speeds above this give no extra lift.',
  },
  flapForwardPush: {
    value: 2, unit: 'm/s per m', min: 0, max: 8, step: 0.5,
    comment: 'Forward speed gained per metre of downstroke, in the direction the head faces.',
  },
  glideSpeed: {
    value: 5, unit: 'm/s', min: 1, max: 8, step: 0.5,
    comment: 'Forward speed a glide settles at.',
  },
  glideAcceleration: {
    value: 4, unit: 'm/s2', min: 0.5, max: 12, step: 0.5,
    comment: 'How quickly a glide picks up forward speed.',
  },
  glideDrag: {
    value: 0.2, unit: '1/s', min: 0, max: 2, step: 0.05,
    comment: 'How quickly speed above glide speed (from a dive) bleeds away. Lower keeps swoop speed longer.',
  },
  glideLiftRate: {
    value: 6, unit: '1/s', min: 1, max: 15, step: 0.5,
    comment: 'How quickly spreading the arms stops a fall. Higher pulls out of a dive more sharply.',
  },
  diveSpeedKept: {
    value: 0.8, unit: 'x', min: 0, max: 1, step: 0.05,
    comment: 'Share of falling speed turned into forward speed when pulling out of a dive.',
  },
  glideTurnRate: {
    value: 90, unit: 'deg/s', min: 20, max: 240, step: 10,
    comment: 'Turn speed at full bank (hands tilted 45 degrees).',
  },
  wingSpreadDistance: {
    value: 0.45, unit: 'm', min: 0.25, max: 0.8, step: 0.05,
    comment: 'Hands this far out to the sides of the head count as wings fully spread. Lower suits shorter arms.',
  },
  wingTuckDistance: {
    value: 0.2, unit: 'm', min: 0.05, max: 0.4, step: 0.05,
    comment: 'Hands closer to the head than this count as wings tucked in.',
  },
  glideArmsDown: {
    value: 0.55, unit: 'm', min: 0.2, max: 0.9, step: 0.05,
    comment: 'Hands lower than this below the eyes count as arms down, which ends the glide.',
  },
  rollTurnRate: {
    value: 150, unit: 'deg/s', min: 30, max: 360, step: 10,
    comment: 'One-wing roll: how fast the falling path curves toward the tucked wing.',
  },
  rollSpinRate: {
    value: 360, unit: 'deg/s', min: 90, max: 720, step: 30,
    comment: "One-wing roll: how fast the parrot's body spins. The view itself never rolls.",
  },
  rollFallSpeed: {
    value: 5, unit: 'm/s', min: 2, max: 8, step: 0.5,
    comment: 'One-wing roll: fastest fall while spiralling. Lower is gentler and easier to recover.',
  },
  rollForwardSpeed: {
    value: 2.5, unit: 'm/s', min: 0, max: 6, step: 0.5,
    comment: 'One-wing roll: sideways speed kept while spiralling, which gives the spiral its width.',
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
  autoArmReach: {
    value: 1, unit: 'on/off', min: 0, max: 1, step: 1,
    comment: '1 = wing distances and flap speed scale to how far the player can reach, so short arms work as well as long ones.',
  },
  comfortVignette: {
    value: 1, unit: 'on/off', min: 0, max: 1, step: 1,
    comment: '1 = the edges of the view darken at high speed, which eases motion sickness.',
  },
  vignetteStrength: {
    value: 0.55, unit: 'x', min: 0.1, max: 1, step: 0.05,
    comment: 'How dark the edges get at top speed.',
  },
  vignetteFromSpeed: {
    value: 5.5, unit: 'm/s', min: 2, max: 8, step: 0.5,
    comment: 'Speed at which the edges start to darken. Above normal glide speed by default, so only dives and swoops show it.',
  },
  biteReach: {
    value: 0.5, unit: 'm', min: 0.1, max: 1, step: 0.05,
    comment: 'How close a toy must be to the beak to be highlighted and bitten. The ground is about 0.5 m below the beak when standing.',
  },
  carryForward: {
    value: 0.3, unit: 'm', min: 0.15, max: 0.6, step: 0.05,
    comment: 'How far in front of the eyes a carried toy hangs.',
  },
  carryDown: {
    value: 0.2, unit: 'm', min: 0.05, max: 0.5, step: 0.05,
    comment: 'How far below the eyes a carried toy hangs. Raise it if the toy blocks the view.',
  },
  staminaEmptyLift: {
    value: 0.25, unit: 'x', min: 0, max: 1, step: 0.05,
    comment: 'Share of normal lift a flap gives with no stamina left: enough to soften a fall.',
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
