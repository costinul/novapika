import type { PlayerView } from '../../shared/api';
import { loadAccount, signIn } from './account';
import type { Account } from './account';

// The sign-in button in the corner of the start screen, and the number pad
// it opens. Pictures and digits only. The code goes in once: the sixth digit
// sends it, a wrong one shakes the pad and clears it.

const CODE_LENGTH = 6;
/** How long a wrong code, or another problem, stays on show before the pad clears. */
const PROBLEM_MS = 900;

/**
 * Wire up the pad that is already in the page. `onAccount` hears who is
 * signed in: once at the start, with whatever this device remembers, and
 * after each sign-in.
 */
export function setUpSignIn(onAccount: (account: Account) => void): void {
  const button = document.querySelector<HTMLButtonElement>('#sign-in')!;
  const pad = document.querySelector<HTMLElement>('#pad')!;
  const slots = [...pad.querySelectorAll<HTMLElement>('#pad-slots span')];
  let code = '';
  let busy = false;

  const signedIn = (player: PlayerView): void => {
    button.dataset.state = 'in';
    button.setAttribute('aria-label', `Signed in as ${player.nickname}. Change player`);
    onAccount({ status: 'in', player });
  };

  const show = (): void => slots.forEach((slot, i) => slot.classList.toggle('filled', i < code.length));
  const clear = (): void => {
    code = '';
    delete pad.dataset.problem;
    show();
  };

  async function send(): Promise<void> {
    busy = true;
    const result = await signIn(code);
    if (result.ok) {
      signedIn(result.player);
      pad.hidden = true;
      clear();
    } else {
      pad.dataset.problem = result.why;
      await new Promise((done) => setTimeout(done, PROBLEM_MS));
      clear();
    }
    busy = false;
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    clear();
    pad.hidden = false;
  });

  pad.addEventListener('click', (event) => {
    // A click on the pad is never a click on the start screen behind it.
    event.stopPropagation();
    const key = (event.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.key;
    if (!key || busy) return;
    if (key === 'close') pad.hidden = true;
    else if (key === 'back') code = code.slice(0, -1);
    else if (code.length < CODE_LENGTH) code += key;
    show();
    if (code.length === CODE_LENGTH) void send();
  });

  void loadAccount().then((account) => {
    if (account.status === 'in') signedIn(account.player);
    else onAccount(account);
  });
}
