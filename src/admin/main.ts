import { FREED_FOR_DAYS, PET_CAP, SEEDS_TO_HATCH, TALK_KEPT_DAYS } from '../../shared/api';
import type { AdminPlayerView, HelperView, PetView, PlayerView, RoomView, TalkView } from '../../shared/api';
import { TIER_NAMES, tierOf } from '../../shared/dna';
import type { Dna } from '../../shared/dna';
import { founders } from '../../shared/founders';
import { HELPER_NAME } from '../../shared/helper';
import { LOBBY_NAMES } from '../../shared/net';
import { petPicture } from './petPicture';

// The owner's page, in three pages chosen from a menu: the players, with
// their sign-in codes and pets; letting a present with a pet in it go over a
// lobby; and the helper parrot, with its switch and what was said to it.
// Every call carries the admin password. It is kept for this browser tab
// only, so that the page can be reloaded without typing it again, and is
// gone when the tab is closed or the page is locked.

const gate = document.querySelector<HTMLFormElement>('#gate')!;
const gateError = document.querySelector<HTMLElement>('#gate-error')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const notice = document.querySelector<HTMLElement>('#notice')!;
const list = document.querySelector<HTMLElement>('#players')!;
const helper = document.querySelector<HTMLElement>('#helper')!;
const present = document.querySelector<HTMLElement>('#present')!;
const lockButton = document.querySelector<HTMLButtonElement>('#lock')!;
const menu = document.querySelector<HTMLElement>('#menu')!;
const pages = Array.from(document.querySelectorAll<HTMLElement>('.page'));

/** Where this tab keeps the password while the page is open. */
const KEPT = 'novapika.admin';

/** The password this tab was opened with, if it still has it. */
function kept(): string {
  try {
    return sessionStorage.getItem(KEPT) ?? '';
  } catch {
    return ''; // Storage switched off: the password is typed after every reload.
  }
}

function keep(value: string): void {
  try {
    if (value) sessionStorage.setItem(KEPT, value);
    else sessionStorage.removeItem(KEPT);
  } catch {
    // Storage switched off.
  }
}

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
      'has-present': 'A present is already there. It stays until a player touches it.',
    }[error ?? ''] ?? `The server refused that (${error || response.status}).`,
  );
}

function lock(why: string): void {
  password = '';
  keep('');
  panel.hidden = true;
  lockButton.hidden = true;
  gate.hidden = false;
  gateError.textContent = why;
}

/** The page the menu has chosen: the one named after the # in the address, or the players. */
function showPage(): string {
  const wanted = location.hash.slice(1);
  const name = pages.some((page) => page.dataset.page === wanted) ? wanted : 'players';
  for (const page of pages) page.hidden = page.dataset.page !== name;
  for (const link of menu.querySelectorAll('a')) {
    if (link.hash === `#${name}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  return name;
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
    dna.sun ? 'glows like a rainbow sun' : dna.glow && 'glows',
    !dna.sun && dna.rainbow && 'rainbow',
    dna.heads > 1 && `${dna.heads} heads`,
    dna.tails > 1 && `${dna.tails} tails`,
    dna.eyeDots > 1 && 'two-dot eyes',
    dna.thirdEye && 'three eyes',
    dna.size < 0.5 && 'very small',
  ].filter(Boolean);
  return has.length > 0 ? has.join(', ') : 'no specials';
}

function petCard(player: PlayerView, pet: PetView): HTMLElement {
  const kind = tierOf(pet.dna);
  const tier = TIER_NAMES[kind];
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
    el('span', { className: `tier ${kind}` }, tier),
    el('p', {}, traits(pet.dna)),
    ...(pet.id === player.followerId ? [el('p', { className: 'follows' }, 'Follows the player')] : []),
    remove,
  );
}

/** A pet that was set free, with a way to bring it back. */
function freedCard(player: PlayerView, pet: PetView): HTMLElement {
  const kind = tierOf(pet.dna);
  const tier = TIER_NAMES[kind];
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
    el('span', { className: `tier ${kind}` }, tier),
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
    ...Object.values(founders).map((f) => el('option', { value: f.id }, `${f.name} (${TIER_NAMES[tierOf(f.dna)]})`)),
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

const roomName = (id: string): string => (LOBBY_NAMES as Record<string, string>)[id] ?? id;

/**
 * One thing a player said to the helper parrot, and what it answered. A
 * phrase it gave no answer to is shown too: one it could not make out, or
 * one it failed on.
 */
function talkCard(talk: TalkView): HTMLElement {
  const unanswered = talk.said === '';
  const heard = talk.heard
    ? el('p', {}, el('strong', {}, `${talk.nickname}: `), talk.heard)
    : el(
        'p',
        { className: 'when' },
        !unanswered ? `${talk.nickname} came near.` : talk.flagged ? `${talk.nickname} said something.` : `${talk.nickname} said something ${HELPER_NAME} could not make out.`,
      );
  return el(
    'li',
    { className: talk.flagged ? 'flagged' : unanswered ? 'unanswered' : '' },
    el('p', { className: 'when' }, `${new Date(talk.at).toLocaleString()} · ${talk.nickname} · ${roomName(talk.lobbyId)}`),
    ...(talk.flagged ? [el('p', { className: 'why' }, `Look at this one: ${talk.flagged}`)] : []),
    heard,
    unanswered
      ? el('p', { className: 'when' }, `${HELPER_NAME} gave its call and did not answer.`)
      : el('p', {}, el('strong', {}, `${HELPER_NAME}: `), talk.said),
  );
}

/** The helper parrot: its switch, and what was said to it this week. */
function showHelper(view: HelperView): void {
  const state = !view.ready
    ? 'Not set up: the server has not been given the keys it needs, so it says and hears nothing.'
    : view.on
      ? 'On: it listens to a player who is close to it and facing it.'
      : 'Off: it says nothing, and no game sends it anything.';
  const flip = el('button', { className: 'quiet', type: 'button' }, view.on ? 'Switch off' : 'Switch on');
  flip.addEventListener('click', () => {
    void attempt(async () => {
      showHelper(await api<HelperView>('POST', '/helper', { on: !view.on }));
      say(`${HELPER_NAME} is switched ${view.on ? 'off' : 'on'}. Lobbies learn of it within half a minute.`);
    });
  });
  const spoken = view.talk.filter((talk) => talk.heard || talk.said === '').length;
  helper.replaceChildren(
    el('header', {}, el('div', {}, el('h2', {}, `${HELPER_NAME}, the helper parrot`), el('p', {}, state)), el('div', { className: 'actions' }, flip)),
    el('h3', {}, `Said in the last ${TALK_KEPT_DAYS} days, as text. No sound is kept.`),
    // Every phrase that reaches the server is listed, answered or not. None listed means none arrived.
    el(
      'p',
      {},
      spoken > 0
        ? `${spoken} of these ${view.talk.length} began with something a player said.`
        : `No phrase from a player has reached ${HELPER_NAME} yet${view.talk.length > 0 ? ': these are its own greetings' : ''}. If a player has spoken to it, their game did not send it: look at the kiki line on the debug panel in the headset.`,
    ),
    view.talk.length > 0 ? el('ul', { className: 'talk' }, ...view.talk.map(talkCard)) : el('p', {}, 'Nothing yet.'),
  );
}

/** A lobby in the list to choose from: who is in it, and whether a present is there already. */
function roomLabel(room: RoomView): string {
  const players = room.players === 1 ? '1 player' : `${room.players} players`;
  return `${roomName(room.id)}: ${players}${room.present ? ', a present is there' : ''}`;
}

/**
 * Letting a present go: a box with one of the fixed pets in it comes down
 * slowly from the sky over a lobby. The first player to touch it gets the pet.
 */
function showRooms(rooms: RoomView[]): void {
  // Keep what was chosen when the list is drawn again.
  const [petBefore, roomBefore] = Array.from(present.querySelectorAll('select'), (select) => select.value);
  const pet = el(
    'select',
    { ariaLabel: 'Pet in the present' },
    ...Object.values(founders).map((f) => el('option', { value: f.id }, `${f.name} (${TIER_NAMES[tierOf(f.dna)]})`)),
  );
  const room = el('select', { ariaLabel: 'Lobby to let it go over' }, ...rooms.map((r) => el('option', { value: r.id }, roomLabel(r))));
  if (petBefore) pet.value = petBefore;
  if (roomBefore) room.value = roomBefore;

  const check = el('button', { className: 'quiet', type: 'button' }, 'Look again');
  check.addEventListener('click', () => {
    void attempt(async () => showRooms((await api<{ rooms: RoomView[] }>('GET', '/rooms')).rooms));
  });
  const form = el('form', {}, pet, room, el('button', {}, 'Drop the present'));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void attempt(async () => {
      const name = founders[pet.value].name;
      const where = roomName(room.value);
      showRooms((await api<{ rooms: RoomView[] }>('POST', `/rooms/${room.value}/present`, { founderId: pet.value })).rooms);
      say(`A present with ${name} in it is coming down in ${where}. The first player to touch it gets ${name}.`);
    });
  });
  present.replaceChildren(
    el(
      'header',
      {},
      el(
        'div',
        {},
        el('h2', {}, 'Drop a present'),
        el('p', {}, 'A box with a pet in it comes down slowly from the sky. The first player to touch it gets the pet, and it follows them. The lobby parrots cannot take it.'),
      ),
      el('div', { className: 'actions' }, check),
    ),
    form,
  );
}

async function refresh(): Promise<void> {
  const [{ players }, view, { rooms }] = await Promise.all([
    api<{ players: AdminPlayerView[] }>('GET', '/players'),
    api<HelperView>('GET', '/helper'),
    api<{ rooms: RoomView[] }>('GET', '/rooms'),
  ]);
  list.replaceChildren(...(players.length > 0 ? players.map(playerCard) : [el('p', {}, 'No players yet.')]));
  showHelper(view);
  showRooms(rooms);
}

/** Open the page with a password: one just typed, or the one this tab kept across a reload. */
function open(given: string): void {
  password = given;
  gateError.textContent = '';
  void attempt(async () => {
    await refresh();
    keep(password);
    gate.hidden = true;
    panel.hidden = false;
    lockButton.hidden = false;
    say();
  }).then(() => {
    // A failure that was not a wrong password is shown at the gate too.
    if (panel.hidden && !gateError.textContent) gateError.textContent = notice.textContent ?? '';
  });
}

gate.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>('#password')!;
  const given = input.value;
  input.value = '';
  open(given);
});

lockButton.addEventListener('click', () => lock(''));

// Choosing from the menu shows that page, with what the server knows now.
window.addEventListener('hashchange', () => {
  showPage();
  if (password) void attempt(refresh);
});
showPage();
if (kept()) open(kept());

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
