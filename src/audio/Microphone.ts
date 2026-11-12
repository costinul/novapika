/**
 * What the browser says about the microphone for this site: allowed, still to
 * be asked, or blocked. `unknown` when the browser will not say.
 */
export type MicrophoneAccess = 'granted' | 'prompt' | 'denied' | 'unknown';

/**
 * Tell `onAccess` what the browser says about the microphone, now and each
 * time it changes: when the player answers its question, or changes the
 * site's settings.
 */
export async function watchMicrophone(onAccess: (access: MicrophoneAccess) => void): Promise<void> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    onAccess(status.state);
    status.onchange = () => onAccess(status.state);
  } catch {
    onAccess('unknown');
  }
}

/**
 * The headset's microphone, shared: lobby parrots listen to it to copy what
 * the player says, the helper parrot hears the player through it, and it
 * carries the player's voice to the other players. If permission is refused
 * the game plays the same, without mimicry and without being heard.
 */
export class Microphone {
  private asked: Promise<MediaStream | null> | null = null;

  /**
   * Ask for the microphone; call it from a click or button press. Once it
   * has been given it is not asked for again. If it was refused, or the
   * browser's question went unanswered, the next call asks afresh. Resolves
   * null if it is refused or there is none.
   */
  open(): Promise<MediaStream | null> {
    this.asked ??= this.ask().then((stream) => {
      if (!stream) this.asked = null;
      return stream;
    });
    return this.asked;
  }

  private async ask(): Promise<MediaStream | null> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return null;
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      return null;
    }
  }
}
