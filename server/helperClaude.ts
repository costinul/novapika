import Anthropic from '@anthropic-ai/sdk';
import { HELPER_NAME, HELPER_PLACES } from '../shared/helper';
import { plain, thinkPrompt } from './helper';
import type { MindDeps, Thought, Verdict } from './helper';
import { CHECKER, PERSONA } from './helperGuide';

// The helper parrot's thinking, and the second look at what it means to say:
// two separate calls to Claude. What a player said reaches Anthropic as text,
// and only here.

/** The model. One name, changed here. */
const MODEL = 'claude-haiku-5-5';
/** How long a call may take before the helper gives up on the phrase. */
const WITHIN = 10_000; // ms
/** Room for a little thinking and a short reply. */
const MAX_TOKENS = 1024;

const REPLY = {
  type: 'object',
  properties: {
    say: { type: 'string', description: `What ${HELPER_NAME} says out loud: one or two short sentences.` },
    action: { type: 'string', enum: ['none', 'follow', 'lead', 'stay'], description: `What ${HELPER_NAME} does as well as speaking.` },
    place: { type: 'string', enum: ['', ...Object.keys(HELPER_PLACES)], description: 'Where to lead to. Empty unless the action is lead.' },
  },
  required: ['say', 'action', 'place'],
  additionalProperties: false,
};

const VERDICT = {
  type: 'object',
  properties: {
    why: { type: 'string', description: 'A few words on what was found.' },
    worry: { type: 'boolean', description: "The child's words are worrying." },
    ok: { type: 'boolean', description: 'The answer may be spoken to the child.' },
  },
  required: ['why', 'worry', 'ok'],
  additionalProperties: false,
};

/**
 * Ask Claude for an answer in a fixed shape. Null if it would not give one:
 * it declined, or was cut off.
 */
async function ask<T>(client: Anthropic, system: string, schema: Record<string, unknown>, content: string): Promise<T | null> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // The instructions never change, so they are kept ready between calls.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason !== 'end_turn') return null;
  for (const block of response.content) if (block.type === 'text') return JSON.parse(block.text) as T;
  return null;
}

/** The real thinking and checking, with this key. */
export function helperClaude(apiKey: string): Pick<MindDeps, 'think' | 'check'> {
  // The timeout is in milliseconds. One more try covers a dropped connection.
  const client = new Anthropic({ apiKey, timeout: WITHIN, maxRetries: 1 });
  return {
    think: (input) => ask<Thought>(client, PERSONA, REPLY, thinkPrompt(input)),
    async check(heard, reply, nicknames) {
      const content = `<nicknames>${nicknames.map(plain).join(', ')}</nicknames>\n<heard>${plain(heard)}</heard>\n<answer>${plain(reply)}</answer>`;
      const verdict = await ask<Verdict>(client, CHECKER, VERDICT, content);
      return verdict ?? { ok: false, worry: false, why: 'no verdict' };
    },
  };
}
