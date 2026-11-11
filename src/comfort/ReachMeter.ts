/**
 * Works out how long the player's arms are from how far out they reach while
 * playing, so a child and an adult can both spread their wings fully.
 *
 * The result is a scale against a reference adult reach: about 1 for an
 * adult, less for a child. It only ever settles on reaches that were held
 * for a moment, so one tracking glitch cannot stretch it.
 */
export class ReachMeter {
  /** Hand-to-head distance, out to the side, of the reference adult. m */
  static readonly REFERENCE = 0.65;
  static readonly MIN_SCALE = 0.6;
  static readonly MAX_SCALE = 1.15;
  /** Hands nearer the head than this are not spread arms, whoever they belong to. m */
  static readonly MIN_REACH = 0.38;
  /** A reach must be held this long to count. s */
  static readonly HOLD = 0.25;

  /** Longest reach seen so far, m. Zero until the player has spread their arms. */
  reach = 0;
  private candidate = 0;
  private held = 0;

  /** The scale to apply to wing distances. 1 until a reach has been seen. */
  get scale(): number {
    if (this.reach === 0) return 1;
    const scale = this.reach / ReachMeter.REFERENCE;
    return Math.min(ReachMeter.MAX_SCALE, Math.max(ReachMeter.MIN_SCALE, scale));
  }

  /**
   * Feed how far each hand is from the head, measured level (not up or
   * down), in metres.
   */
  update(leftOut: number, rightOut: number, dt: number): void {
    // Both arms must be out: one arm reaching for something says nothing.
    const out = Math.min(leftOut, rightOut);
    if (out <= this.reach || out < ReachMeter.MIN_REACH) {
      this.held = 0;
      this.candidate = 0;
      return;
    }
    // Hold the smallest value seen during the hold, so a brief spike is ignored.
    this.candidate = this.held === 0 ? out : Math.min(this.candidate, out);
    this.held += dt;
    if (this.held >= ReachMeter.HOLD) {
      this.reach = this.candidate;
      this.held = 0;
      this.candidate = 0;
    }
  }
}
