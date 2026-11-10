import type { Action } from '../world/actions';

/**
 * All sounds are made in code with the Web Audio API, so there are no audio
 * files to load or license. Nothing plays until `unlock` has been called
 * from a click or button press, as browsers require.
 */
export class Sounds {
  private ctx: AudioContext | null = null;

  /** Call from a user gesture (the Enter VR button). */
  unlock(): void {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
  }

  onAction(action: Action): void {
    switch (action.type) {
      case 'pickUp':
        this.tone(900, 1500, 0.06, 0.15, 'triangle');
        break;
      case 'drop':
        this.tone(700, 350, 0.09, 0.15, 'triangle');
        break;
      case 'place':
        this.chirp();
        break;
      case 'ring':
        this.bell();
        break;
    }
  }

  /** A bright bell: a few ringing partials that fade over a second. */
  bell(): void {
    for (const [ratio, gain] of [[1, 0.2], [2.01, 0.12], [2.76, 0.08], [4.07, 0.04]] as const) {
      this.tone(880 * ratio, 880 * ratio, 1.2, gain, 'sine');
    }
  }

  /** A happy two-note whistle. */
  chirp(): void {
    this.tone(2200, 3300, 0.09, 0.14, 'sine');
    this.tone(2600, 3900, 0.12, 0.14, 'sine', 0.11);
  }

  /** The little bell inside a bell ball. `strength` is 0..1. */
  jingle(strength: number): void {
    for (const frequency of [3100, 4250, 5300]) {
      this.tone(frequency, frequency, 0.18, 0.05 * strength, 'sine');
    }
  }

  /** One fading tone that slides from one pitch to another. */
  private tone(
    from: number,
    to: number,
    seconds: number,
    gain: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + seconds);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + seconds);
  }
}
