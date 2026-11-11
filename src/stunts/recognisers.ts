import type { MovementState } from '../player/Player';

// Stunts come from the ordinary wing rules; nothing here changes movement.
// Each recogniser only watches how a parrot is moving and says when it has
// seen its stunt. To add a stunt, add a recogniser to `createRecognisers`.

/** What a recogniser is shown each frame. */
export interface StuntSample {
  state: MovementState;
  /** Total speed, m/s. */
  speed: number;
  /** Upward speed, m/s; negative when falling. */
  verticalSpeed: number;
  /** One-wing roll under way: +1 to the left, -1 to the right, 0 none. */
  rolling: -1 | 0 | 1;
  /** Height of the body above whatever is below it, m. */
  clearance: number;
  /** Height above the lobby floor, m. */
  height: number;
  /** A ring was flown through this frame. */
  passedRing: boolean;
}

export interface StuntRecogniser {
  readonly name: string;
  /** Returns true on the frame the stunt is completed. */
  update(sample: StuntSample, dt: number): boolean;
}

const AIRBORNE: ReadonlySet<MovementState> = new Set(['flapping', 'gliding', 'diving', 'falling', 'rolling']);

/** One-wing roll: hold the spiral for a moment. */
class OneWingRoll implements StuntRecogniser {
  readonly name = 'oneWingRoll';
  private held = 0;
  private done = false;

  update(s: StuntSample, dt: number): boolean {
    if (s.rolling === 0) {
      this.held = 0;
      this.done = false;
      return false;
    }
    this.held += dt;
    if (this.done || this.held < 0.7) return false;
    this.done = true;
    return true;
  }
}

/** Barrel roll: roll one way, then quickly swap arms and roll the other way. */
class BarrelRoll implements StuntRecogniser {
  readonly name = 'barrelRoll';
  private direction = 0;
  private held = 0;
  /** Direction of a finished first roll, and how long ago it ended. */
  private first = 0;
  private sinceFirst = Infinity;

  update(s: StuntSample, dt: number): boolean {
    this.sinceFirst += dt;
    if (s.rolling !== this.direction) {
      if (this.direction !== 0 && this.held >= 0.25) {
        this.first = this.direction;
        this.sinceFirst = 0;
      }
      this.direction = s.rolling;
      this.held = 0;
      return false;
    }
    if (s.rolling === 0) return false;
    this.held += dt;
    const swapped = this.first === -s.rolling && this.sinceFirst < 0.7;
    if (swapped && this.held >= 0.25) {
      this.first = 0;
      return true;
    }
    return false;
  }
}

/** Dive bomb: a long fast dive, then spread the wings to pull out. */
class DiveBomb implements StuntRecogniser {
  readonly name = 'diveBomb';
  private dived = 0;
  private sinceDive = Infinity;

  update(s: StuntSample, dt: number): boolean {
    if (s.state === 'diving' && s.verticalSpeed < -5) {
      this.dived += dt;
      this.sinceDive = 0;
      return false;
    }
    this.sinceDive += dt;
    const pulledOut = this.dived >= 0.6 && this.sinceDive < 0.5 && s.state === 'gliding';
    if (pulledOut || this.sinceDive >= 0.5) this.dived = 0;
    return pulledOut;
  }
}

/** Swoop: skim fast and low after a dive. */
class Swoop implements StuntRecogniser {
  readonly name = 'swoop';
  private low = 0;
  private done = false;

  update(s: StuntSample, dt: number): boolean {
    const skimming = s.state === 'gliding' && s.speed > 6.5 && s.clearance < 1.5;
    if (!skimming) {
      this.low = 0;
      this.done = false;
      return false;
    }
    this.low += dt;
    if (this.done || this.low < 0.4) return false;
    this.done = true;
    return true;
  }
}

/** Ring pass: fly through a hanging ring. */
class RingPass implements StuntRecogniser {
  readonly name = 'ringPass';
  update(s: StuntSample): boolean {
    return s.passedRing;
  }
}

/** Perch landing: arrive at speed and come to rest on something off the ground. */
class PerchLanding implements StuntRecogniser {
  readonly name = 'perchLanding';
  private sinceFast = Infinity;
  private wasAirborne = false;

  update(s: StuntSample, dt: number): boolean {
    const airborne = AIRBORNE.has(s.state);
    this.sinceFast = airborne && s.speed > 3 ? 0 : this.sinceFast + dt;
    const landed = this.wasAirborne && !airborne && this.sinceFast < 0.4 && s.height > 1.5;
    this.wasAirborne = airborne;
    return landed;
  }
}

export function createRecognisers(): StuntRecogniser[] {
  return [new OneWingRoll(), new BarrelRoll(), new DiveBomb(), new Swoop(), new RingPass(), new PerchLanding()];
}
