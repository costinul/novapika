/**
 * A trip from one place to another: the view fades to black, the place is
 * swapped, and the view fades back in. If the place cannot be loaded, the
 * view fades back in where the player was.
 */
export class Travel {
  /** How dark the view should be, 0..1. */
  dark = 0;
  private to: string | null = null;
  private swapping = false;

  /**
   * `swap` unloads the place the player is in and loads another, by lobby id.
   * `seconds` is how long each fade takes.
   */
  constructor(
    private readonly swap: (placeId: string) => Promise<void>,
    private readonly seconds = 0.4,
  ) {}

  /** True from the start of a trip until the view is clear again. */
  get busy(): boolean {
    return this.to !== null || this.dark > 0;
  }

  /** Set off for a place. Returns false, and does nothing, during a trip. */
  go(placeId: string): boolean {
    if (this.busy) return false;
    this.to = placeId;
    return true;
  }

  /** Once per drawn frame. */
  update(dt: number): void {
    if (this.to === null) {
      this.dark = Math.max(0, this.dark - dt / this.seconds);
    } else if (!this.swapping) {
      this.dark = Math.min(1, this.dark + dt / this.seconds);
      if (this.dark < 1) return;
      this.swapping = true;
      const over = (): void => {
        this.to = null;
        this.swapping = false;
      };
      this.swap(this.to).then(over, over);
    }
  }
}
