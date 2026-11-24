import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fontZoomAction,
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

test('detecta atajos de salida/cierre de aplicación sin colisionar con Ctrl+Q en Linux', () => {
  assert.equal(isQuitShortcut(key('q', { metaKey: true }), true), true);
  assert.equal(isQuitShortcut(key('Q', { metaKey: true }), true), true);
  assert.equal(isQuitShortcut(key('Q', { metaKey: true, shiftKey: true }), true), true);
  assert.equal(isQuitShortcut(key('q', { ctrlKey: true }), true), false);

  // En Linux, Ctrl+Q queda libre para XON/apps TUI; salir usa Ctrl+Shift+Q o Alt+F4.
  assert.equal(isQuitShortcut(key('q', { ctrlKey: true }), false), false);
  assert.equal(isQuitShortcut(key('Q', { ctrlKey: true, shiftKey: true }), false), true);
  assert.equal(isQuitShortcut(key('F4', { altKey: true }), false), true);
  assert.equal(isQuitShortcut(key('F4', { altKey: true }), true), true);

  assert.equal(isQuitShortcut(key('q'), true), false);
  assert.equal(isQuitShortcut(key('q', { metaKey: true, altKey: true }), true), false);
});

test('detecta atajos de cierre de ventana sin sombrear Ctrl+Shift+W de cerrar split en Linux', () => {
  assert.equal(isCloseWindowShortcut(key('w', { metaKey: true, shiftKey: true }), true), true);
  assert.equal(isCloseWindowShortcut(key('W', { metaKey: true, shiftKey: true }), true), true);
  assert.equal(isCloseWindowShortcut(key('w', { metaKey: true }), true), false);

  // En Linux Ctrl+Shift+W cierra el split; cerrar ventana usa Ctrl+Alt+W.
  assert.equal(isCloseWindowShortcut(key('W', { ctrlKey: true, shiftKey: true }), false), false);
  assert.equal(shortcutAction(key('W', { ctrlKey: true, shiftKey: true }), false), 'close');
  assert.equal(isCloseWindowShortcut(key('w', { ctrlKey: true, altKey: true }), false), true);
  assert.equal(isCloseWindowShortcut(key('w'), true), false);
});

test('detecta atajos de zoom de tipografía en macOS y Linux', () => {
  assert.equal(fontZoomAction(key('=', { metaKey: true }), true), 'increase');
  assert.equal(fontZoomAction(key('+', { metaKey: true, shiftKey: true }), true), 'increase');
  assert.equal(fontZoomAction(key('-', { metaKey: true }), true), 'decrease');
  assert.equal(fontZoomAction(key('_', { metaKey: true, shiftKey: true }), true), 'decrease');
  assert.equal(fontZoomAction(key('0', { metaKey: true }), true), 'reset');
  assert.equal(fontZoomAction(key('=', { metaKey: true, altKey: true }), true), null);

  assert.equal(fontZoomAction(key('=', { ctrlKey: true }), false), 'increase');
  assert.equal(fontZoomAction(key('+', { ctrlKey: true, shiftKey: true }), false), 'increase');
  assert.equal(fontZoomAction(key('-', { ctrlKey: true }), false), 'decrease');
  // Ctrl+_ en Linux se deja libre para undo en readline/emacs.
  assert.equal(fontZoomAction(key('_', { ctrlKey: true, shiftKey: true }), false), null);
  assert.equal(fontZoomAction(key('0', { ctrlKey: true }), false), 'reset');
});

test('App.vue escucha zu-term://request-close para desplegar confirmación de cierre', async () => {
  const appSource = await readFile(new URL('../../App.vue', import.meta.url), 'utf8');
  assert.match(appSource, /tauriListen\(['"]zu-term:\/\/request-close['"]/);
  assert.match(appSource, /closePromptVisible\.value\s*=\s*true/);
});
