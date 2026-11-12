/**
 * The headset's microphone, asked for once and shared: lobby parrots listen
 * to it to copy what the player says, and it carries the player's voice to
 * the other players. If permission is refused the game plays the same,
 * without mimicry and without being heard.
 */
export class Microphone {
  private asked: Promise<MediaStream | null> | null = null;

  /**
   * Ask for the microphone. Asks at most once per visit; call it from a
   * click or button press. Resolves null if it is refused or there is none.
   */
  open(): Promise<MediaStream | null> {
    this.asked ??= (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return null;
        return await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        return null;
      }
    })();
    return this.asked;
  }
}
