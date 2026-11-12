import { FREED_FOR_DAYS, PET_CAP, SEEDS_TO_HATCH } from '../../shared/api';
import type { AdminPlayerView, PetView, PlayerView } from '../../shared/api';
import { tierOf } from '../../shared/dna';
import type { Dna } from '../../shared/dna';
import { founders } from '../../shared/founders';
import { petPicture } from './petPicture';

// The owner's page: add players, hand out sign-in codes, and give or remove
// pets. Every call carries the admin password, which is kept only in this
// page's memory and is gone when the page is closed or reloaded.

const gate = document.querySelector<HTMLFormElement>('#gate')!;
const gateError = document.querySelector<HTMLElement>('#gate-error')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const notice = document.querySelector<HTMLElement>('#notice')!;
const list = document.querySelector<HTMLElement>('#players')!;

let password = '';

/** Make an element. Text is always set as text, never as HTML. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

class Problem extends Error {}

/** Call the admin API. Throws a Problem with words for the owner if it fails. */
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method,
      headers: { Authorization: `Bearer ${password}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Problem('The server could not be reached.');
  }
  if (response.ok) return (await response.json()) as T;
  if (response.status === 401) {
    lock('That is not the admin password.');
    throw new Problem('');
  }
  const { error } = (await response.json().catch(() => ({ error: '' }))) as { error?: string };
  throw new Problem(
    {
      'slow-down': 'Too many tries. Wait a minute and try again.',
      'bad-nickname': 'A nickname needs 1 to 20 letters.',
      full: `That player has no room: ${PET_CAP} pets is the most, and an egg counts.`,
    }[error ?? ''] ?? `The server refused that (${error || response.status}).`,
  );
}

function lock(why: string): void {
  password = '';
  panel.hidden = true;
  gate.hidden = false;
  gateError.textContent = why;
}

function say(...parts: (Node | string)[]): void {
  notice.className = '';
  notice.replaceChildren(...parts);
}

/** Run something the owner asked for, and say so if it goes wrong. */
async function attempt(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof Problem)) throw error;
    if (error.message) {
      notice.className = 'problem';
      notice.textContent = error.message;
    }
  }
}

/** A code as the owner should read it out: 123 456. */
const spaced = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;

function sayCode(nickname: string, code: string): void {
  say(`Sign-in code for ${nickname}: `, el('strong', {}, spaced(code)), '. Write it down now. It is not shown again.');
}

function traits(dna: Dna): string {
  const has = [
    dna.glow && 'glows',
    dna.rainbow && 'rainbow',
    dna.heads > 1 && `${dna.heads} heads`,
    dna.tails > 1 && `${dna.tails} tails`,
    dna.eyeDots > 1 && 'two-dot eyes',
  ].filter(Boolean);
  return has.length > 0 ? has.join(', ') : 'no specials';
}

function petCard(player: PlayerView, pet: PetView): HTMLElement {
  const tier = tierOf(pet.dna);
  const remove = el('button', { className: 'danger', type: 'button' }, 'Remove');
  remove.addEventListener('click', () => {
    if (!confirm(`Remove this ${tier} pet from ${player.nickname} for good?`)) return;
    void attempt(async () => {
      await api('DELETE', `/pets/${pet.id}`);
      say(`Removed a ${tier} pet from ${player.nickname}.`);
      await refresh();
    });
  });
  return el(
    'li',
    { className: 'pet' },
    el('img', { src: petPicture(pet.dna), alt: `A ${tier} pet: ${traits(pet.dna)}` }),
    el('span', { className: `tier ${tier}` }, tier),
    el('p', {}, traits(pet.dna)),
    ...(pet.id === player.followerId ? [el('p', { className: 'follows' }, 'Follows the player')] : []),
    remove,
  );
}

/** A pet that was set free, with a way to bring it back. */
function freedCard(player: PlayerView, pet: PetView): HTMLElement {
  const tier = tierOf(pet.dna);
  const restore = el('button', { className: 'quiet', type: 'button' }, 'Bring back');
  restore.addEventListener('click', () => {
    void attempt(async () => {
      await api('POST', `/pets/${pet.id}/restore`);
      say(`Brought a ${tier} pet back to ${player.nickname}.`);
      await refresh();
    });
  });
  return el(
    'li',
    { className: 'pet freed' },
    el('img', { src: petPicture(pet.dna), alt: `A ${tier} pet that was set free: ${traits(pet.dna)}` }),
    el('span', { className: `tier ${tier}` }, tier),
    el('p', {}, traits(pet.dna)),
    restore,
  );
}

/** What else is going on in a player's nest, in words. */
function news(player: AdminPlayerView): string[] {
  const lines: string[] = [];
  if (player.egg) lines.push(`Has an egg, fed ${player.egg.seeds} of ${SEEDS_TO_HATCH} seeds.`);
  if (player.asking) lines.push(`Is waiting for ${player.asking.friend} to answer a request for DNA.`);
  for (const request of player.asked) lines.push(`${request.friend} has asked for the DNA of one of these pets.`);
  return lines;
}

function playerCard(player: AdminPlayerView): HTMLElement {
  const newCode = el('button', { className: 'quiet', type: 'button' }, 'Regenerate code');
  newCode.addEventListener('click', () => {
    if (!confirm(`Give ${player.nickname} a new code? The old code stops working and their headset is signed out.`)) return;
    void attempt(async () => {
      const { code } = await api<{ code: string }>('POST', `/players/${player.id}/code`);
      sayCode(player.nickname, code);
    });
  });

  const remove = el('button', { className: 'danger', type: 'button' }, 'Delete player');
  remove.addEventListener('click', () => {
    const pets = player.pets.length + (player.egg ? 1 : 0) + player.freed.length;
    const warning = `Delete ${player.nickname} for good, with their ${pets} pet${pets === 1 ? '' : 's'}? This cannot be undone.`;
    if (!confirm(warning)) return;
    void attempt(async () => {
      await api('DELETE', `/players/${player.id}`);
      say(`Deleted ${player.nickname}.`);
      await refresh();
    });
  });

  const choice = el(
    'select',
    { ariaLabel: `Pet to give ${player.nickname}` },
    ...Object.values(founders).map((f) => el('option', { value: f.id }, `${f.name} (${tierOf(f.dna)})`)),
  );
  const give = el('form', {}, choice, el('button', {}, 'Give pet'));
  give.addEventListener('submit', (event) => {
    event.preventDefault();
    void attempt(async () => {
      await api('POST', `/players/${player.id}/pets`, { founderId: choice.value });
      say(`Gave ${founders[choice.value].name} to ${player.nickname}.`);
      await refresh();
    });
  });

  return el(
    'section',
    { className: 'player' },
    el(
      'header',
      {},
      el('div', {}, el('h2', {}, player.nickname), el('p', {}, `${player.pets.length} of ${PET_CAP} pets`), ...news(player).map((line) => el('p', {}, line))),
      el('div', { className: 'actions' }, newCode, remove),
    ),
    el('ul', { className: 'pets' }, ...player.pets.map((pet) => petCard(player, pet))),
    give,
    ...(player.freed.length > 0
      ? [
          el('h3', {}, `Set free in the last ${FREED_FOR_DAYS} days`),
          el('ul', { className: 'pets' }, ...player.freed.map((pet) => freedCard(player, pet))),
        ]
      : []),
  );
}

async function refresh(): Promise<void> {
  const { players } = await api<{ players: AdminPlayerView[] }>('GET', '/players');
  list.replaceChildren(...(players.length > 0 ? players.map(playerCard) : [el('p', {}, 'No players yet.')]));
}

gate.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>('#password')!;
  password = input.value;
  input.value = '';
  gateError.textContent = '';
  void attempt(async () => {
    await refresh();
    gate.hidden = true;
    panel.hidden = false;
    say();
  }).then(() => {
    // A failure that was not a wrong password is shown at the gate too.
    if (panel.hidden && !gateError.textContent) gateError.textContent = notice.textContent ?? '';
  });
});

document.querySelector<HTMLFormElement>('#add-player')!.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>('#nickname')!;
  void attempt(async () => {
    const { player, code } = await api<{ player: PlayerView; code: string }>('POST', '/players', {
      nickname: input.value,
    });
    input.value = '';
    sayCode(player.nickname, code);
    await refresh();
  });
});
