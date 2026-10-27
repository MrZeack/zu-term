import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCloseWindowShortcut,
  isQuitShortcut,
  shortcutAction,
  type KeyInput,
} from './shortcuts.ts';

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

test('macOS uses iTerm2-style shortcuts with CMD', () => {
  assert.equal(shortcutAction(key('d', { metaKey: true }), true), 'split-right');
  assert.equal(shortcutAction(key('D', { metaKey: true, shiftKey: true }), true), 'split-down');
  assert.equal(shortcutAction(key('w', { metaKey: true }), true), 'close');
  assert.equal(shortcutAction(key('c', { metaKey: true }), true), 'copy');
  assert.equal(shortcutAction(key('k', { metaKey: true }), true), 'clear');
});

test('macOS leaves CMD+V to the native Edit menu', () => {
  assert.equal(shortcutAction(key('v', { metaKey: true }), true), null);
});

test('Linux uses Terminator-style CTRL+SHIFT shortcuts', () => {
  const mods = { ctrlKey: true, shiftKey: true };
  assert.equal(shortcutAction(key('E', mods), false), 'split-right');
  assert.equal(shortcutAction(key('O', mods), false), 'split-down');
  assert.equal(shortcutAction(key('W', mods), false), 'close');
  assert.equal(shortcutAction(key('C', mods), false), 'copy');
  assert.equal(shortcutAction(key('V', mods), false), 'paste');
});

test('plain typing and shell control keys are not intercepted', () => {
  assert.equal(shortcutAction(key('d'), true), null);
  assert.equal(shortcutAction(key('d', { ctrlKey: true }), false), null);
  assert.equal(shortcutAction(key('c', { ctrlKey: true }), false), null);
  assert.equal(shortcutAction(key('d', { metaKey: true, altKey: true }), true), null);
});

test('detecta atajos de salida/cierre de aplicación (CMD+Q, etc.)', () => {
  assert.equal(isQuitShortcut(key('q', { metaKey: true }), true), true);
  assert.equal(isQuitShortcut(key('Q', { metaKey: true }), true), true);
  assert.equal(isQuitShortcut(key('Q', { metaKey: true, shiftKey: true }), true), true);
  assert.equal(isQuitShortcut(key('q', { ctrlKey: true }), true), false);

  assert.equal(isQuitShortcut(key('q', { ctrlKey: true }), false), true);
  assert.equal(isQuitShortcut(key('Q', { ctrlKey: true, shiftKey: true }), false), true);
  assert.equal(isQuitShortcut(key('F4', { altKey: true }), false), true);
  assert.equal(isQuitShortcut(key('F4', { altKey: true }), true), true);

  assert.equal(isQuitShortcut(key('q'), true), false);
  assert.equal(isQuitShortcut(key('q', { metaKey: true, altKey: true }), true), false);
});

test('detecta atajos de cierre de ventana completa (CMD+SHIFT+W)', () => {
  assert.equal(isCloseWindowShortcut(key('w', { metaKey: true, shiftKey: true }), true), true);
  assert.equal(isCloseWindowShortcut(key('W', { metaKey: true, shiftKey: true }), true), true);
  assert.equal(isCloseWindowShortcut(key('w', { metaKey: true }), true), false);

  assert.equal(isCloseWindowShortcut(key('W', { ctrlKey: true, shiftKey: true }), false), true);
  assert.equal(isCloseWindowShortcut(key('w'), true), false);
});
