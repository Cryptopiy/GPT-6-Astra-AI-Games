import type { InputFrame } from './types';

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyR', 'ShiftLeft', 'ShiftRight', 'Escape', 'KeyP', 'KeyH', 'KeyM', 'KeyC']);

export class Input {
  private keys = new Set<string>();
  private actions = new Set<string>();
  constructor(private onAction: (code: string) => void) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.clear);
  }
  private down = (e: KeyboardEvent) => {
    if (!GAME_KEYS.has(e.code) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    if (!e.repeat && !this.keys.has(e.code)) {
      if (['Escape', 'KeyP', 'KeyH', 'KeyM', 'KeyC'].includes(e.code)) this.onAction(e.code);
      else this.actions.add(e.code);
    }
    this.keys.add(e.code);
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  clear = () => { this.keys.clear(); this.actions.clear(); };
  sample(): InputFrame {
    // Preserve taps shorter than a render frame as one simulation tick.
    const has = (...codes: string[]) => codes.some(code => this.keys.has(code) || this.actions.has(code)) ? 1 : 0;
    const result: InputFrame = {
      forward: has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown'),
      turn: has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft'),
      brake: !!has('Space'), sprint: !!has('ShiftLeft', 'ShiftRight'),
      interact: this.actions.has('KeyE'), restart: this.actions.has('KeyR'),
    };
    this.actions.clear();
    return result;
  }
  dispose() {
    this.clear();
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.clear);
  }
}
