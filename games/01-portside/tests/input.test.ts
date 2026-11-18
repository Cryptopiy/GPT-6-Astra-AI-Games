import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/game/input';

class MockInputElement {}
class MockTextAreaElement {}
Object.defineProperty(globalThis, 'HTMLInputElement', { value: MockInputElement, configurable: true });
Object.defineProperty(globalThis, 'HTMLTextAreaElement', { value: MockTextAreaElement, configurable: true });

function keyboard() {
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { value: events, configurable: true });
  const actions: string[] = [];
  const input = new Input(code => actions.push(code));
  const send = (type: string, code: string, options: Record<string, unknown> = {}) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...options });
    events.dispatchEvent(event);
    return event;
  };
  return { input, actions, events, send };
}

test('movement taps shorter than a frame are retained, while held input persists', () => {
  const { input, send } = keyboard();
  send('keydown', 'KeyW'); send('keyup', 'KeyW');
  assert.equal(input.sample().forward, 1);
  assert.equal(input.sample().forward, 0);
  send('keydown', 'KeyD');
  assert.equal(input.sample().turn, 1);
  assert.equal(input.sample().turn, 1);
  send('keyup', 'KeyD');
  assert.equal(input.sample().turn, 0);
  input.dispose();
});

test('interaction is one-shot per press and OS key repeat cannot repeatedly enter and exit', () => {
  const { input, send } = keyboard();
  send('keydown', 'KeyE');
  assert.equal(input.sample().interact, true);
  send('keydown', 'KeyE', { repeat: true });
  assert.equal(input.sample().interact, false);
  send('keyup', 'KeyE'); send('keydown', 'KeyE');
  assert.equal(input.sample().interact, true);
  input.dispose();
});

test('losing focus releases all controls; disposed input cannot react to events', () => {
  const { input, send, events, actions } = keyboard();
  send('keydown', 'KeyW'); send('keydown', 'KeyE');
  events.dispatchEvent(new Event('blur'));
  assert.deepEqual(input.sample(), { forward: 0, turn: 0, interact: false, restart: false, brake: false, sprint: false });
  input.dispose();
  send('keydown', 'KeyW'); send('keydown', 'KeyH');
  assert.equal(input.sample().forward, 0);
  assert.equal(actions.length, 0);
});

test('arrow controls prevent scrolling, shortcuts ignore repeat, and browser shortcuts stay intact', () => {
  const { input, send, actions } = keyboard();
  const arrow = send('keydown', 'ArrowUp');
  assert.equal(arrow.defaultPrevented, true);
  assert.equal(input.sample().forward, 1);
  send('keydown', 'KeyH'); send('keydown', 'KeyH', { repeat: true });
  assert.deepEqual(actions, ['KeyH']);
  const browserShortcut = send('keydown', 'KeyR', { ctrlKey: true });
  assert.equal(browserShortcut.defaultPrevented, false);
  assert.equal(input.sample().restart, false);
  input.dispose();
});
