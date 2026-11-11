import type { Action } from '../world/actions';

/**
 * All sounds are made in code with the Web Audio API, so there are no audio
 * files to load or license. Nothing plays until `unlock` has been called
 * from a click or button press, as browsers require.
 */
export class Sounds {
  private ctx: AudioContext | null = null;
  private ambience: { leaves: boolean; birds: boolean } | null = null;
  private leaves: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private nextBird = 3;
  private time = 0;

  /** Call from a user gesture (the Enter VR button). */
  unlock(): void {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    this.startLeaves();
  }

  /** Background sound for the current lobby, or null for silence. */
  setAmbience(ambience: { leaves: boolean; birds: boolean } | null): void {
    this.ambience = ambience;
    this.leaves?.source.stop();
    this.leaves = null;
    this.startLeaves();
  }

  /** Call every frame: sways the leaves and lets a distant bird call now and then. */
  update(dt: number): void {
    this.time += dt;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.ambience) return;
    if (this.leaves) {
      // The breeze rises and falls slowly.
      const breeze = 0.02 + 0.015 * Math.sin(this.time * 0.35) + 0.008 * Math.sin(this.time * 0.9);
      this.leaves.gain.gain.setTargetAtTime(breeze, ctx.currentTime, 0.5);
    }
    if (this.ambience.birds && this.time >= this.nextBird) {
      this.nextBird = this.time + 4 + Math.random() * 8;
      const pitch = 1800 + Math.random() * 1600;
      const notes = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < notes; i++) {
        this.tone(pitch, pitch * (1.15 + Math.random() * 0.3), 0.1, 0.025, 'sine', i * 0.16);
      }
    }
  }

  /** Leaves in a breeze: soft filtered noise, looping. */
  private startLeaves(): void {
    const ctx = this.ctx;
    if (!ctx || this.leaves || !this.ambience?.leaves) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise(ctx, 3);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.02;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    this.leaves = { source, gain };
  }

  private noise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
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
      case 'passRing':
        this.tone(1500, 2600, 0.14, 0.14, 'sine');
        break;
      case 'splash':
        this.splash();
        break;
      case 'celebrate':
        // A rising run of whistles.
        [1760, 2217, 2637, 3520].forEach((f, i) => this.tone(f, f * 1.1, 0.16, 0.13, 'sine', 0.25 + i * 0.13));
        break;
    }
  }

  /** A short burst of watery noise. */
  splash(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise(ctx, 0.35);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(5000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
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
