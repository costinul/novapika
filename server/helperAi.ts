import { HEARD_RATE, HELPER_NAME } from '../shared/helper';
import type { MindDeps } from './helper';
import { helperClaude } from './helperClaude';

// The outside services the helper parrot's mind uses, and nothing else:
// Workers AI turns a phrase into text, Claude thinks and checks (in
// helperClaude.ts), and OpenAI speaks. What a player said goes to Cloudflare
// as sound and to Anthropic as text. OpenAI is sent only the helper's own
// reply, never a player's words.

/** The models. Each is one name, changed here. */
const HEAR_MODEL = '@cf/openai/whisper-large-v3-turbo';
const SPEAK_MODEL = 'gpt-4o-mini-tts';
const SPEAK_VOICE = 'coral';
const SPEAK_STYLE = 'A small, cheerful, gentle parrot talking to a young child. Bright and warm, a little quick, never loud.';

/** How long each step may take before the helper gives up on the phrase. */
const HEAR_WITHIN = 8000; // ms
const SPEAK_WITHIN = 10_000; // ms

/** Helps the speech-to-text with the words it is likely to hear. */
const HEAR_HINT = `A young child talking to ${HELPER_NAME} the parrot in a game about parrots: flying, flapping, gliding, seeds, millet, eggs, hatching, pets, the nest, the feeder, bells and rings.`;

/** The secrets and bindings the helper needs. Without all three it stays silent. */
export interface HelperEnv {
  AI?: Ai;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

/** Sixteen-bit samples, one channel, wrapped as a WAV file. */
function wav(samples: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + samples.length);
  const view = new DataView(out.buffer);
  const text = (at: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // size of the format block
  view.setUint16(20, 1, true); // plain samples
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, HEARD_RATE, true);
  view.setUint32(28, HEARD_RATE * 2, true); // bytes a second
  view.setUint16(32, 2, true); // bytes a sample
  view.setUint16(34, 16, true); // bits a sample
  text(36, 'data');
  view.setUint32(40, samples.length, true);
  out.set(samples, 44);
  return out;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  // In pieces: too many arguments at once overflow the stack.
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

/** Give up on something that takes too long. */
function within<T>(ms: number, what: string, promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took too long`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** The real hearing, thinking, checking and speaking, or null if a key or binding is missing. */
export function helperAi(env: HelperEnv): Pick<MindDeps, 'hear' | 'think' | 'check' | 'speak'> | null {
  const { AI: ai, ANTHROPIC_API_KEY: claudeKey, OPENAI_API_KEY: speechKey } = env;
  if (!ai || !claudeKey || !speechKey) return null;

  return {
    ...helperClaude(claudeKey),

    async hear(samples) {
      const { text } = await within(
        HEAR_WITHIN,
        'hearing',
        ai.run(HEAR_MODEL, { audio: base64(wav(samples)), language: 'en', vad_filter: true, initial_prompt: HEAR_HINT }),
      );
      return text;
    },

    async speak(text) {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${speechKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: SPEAK_MODEL, voice: SPEAK_VOICE, input: text, instructions: SPEAK_STYLE, response_format: 'mp3' }),
        signal: AbortSignal.timeout(SPEAK_WITHIN),
      });
      if (!response.ok) throw new Error(`speech: status ${response.status}`);
      return response.arrayBuffer();
    },
  };
}
