/**
 * Turns variable render-frame times into a whole number of fixed simulation
 * steps, so movement and physics behave the same at 72, 90 or 120 fps.
 */
export class FixedStepper {
  private accumulator = 0;

  constructor(
    readonly stepSeconds: number,
    /** Cap on steps per frame so one long hitch cannot snowball. */
    readonly maxStepsPerFrame = 5,
  ) {}

  /** Add a frame's elapsed time; returns how many fixed steps to run now. */
  advance(frameSeconds: number): number {
    this.accumulator += Math.max(0, frameSeconds);
    let steps = Math.floor(this.accumulator / this.stepSeconds + 1e-9);
    if (steps > this.maxStepsPerFrame) {
      steps = this.maxStepsPerFrame;
      this.accumulator = 0;
    } else {
      this.accumulator -= steps * this.stepSeconds;
    }
    return steps;
  }

  /** How far (0..1) the current frame sits between the last step and the next. */
  get alpha(): number {
    return Math.min(1, Math.max(0, this.accumulator / this.stepSeconds));
  }
}
