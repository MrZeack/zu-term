import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { paneIds } from '../layout/layout-tree.ts';
import { createLayoutStore } from '../layout/layout.store.ts';
import { createPaneActions, type TerminalHandle } from './pane-actions.ts';

interface Options {
  selection?: string;
  clipboardText?: string;
  confirm?: boolean;
}

function setup({ selection = '', clipboardText = 'from clipboard', confirm = true }: Options = {}) {
  let counter = 0;
  const store = createLayoutStore(() => `id${++counter}`)();
  store.init('/home/me');
  const calls: string[] = [];
  const terminal: TerminalHandle = {
    getSelection: () => selection,
    paste: (text) => calls.push(`paste:${text}`),
    clear: () => calls.push('clear'),
  };
  const actions = createPaneActions({
    store,
    terminal: () => terminal,
    clipboard: {
      readText: async () => clipboardText,
      writeText: async (text) => void calls.push(`write:${text}`),
    },
    confirmPaste: async (lines) => {
      calls.push(`confirm:${lines}`);
      return confirm;
    },
    closeWindow: async () => void calls.push('close-window'),
  });
  const [first] = paneIds(store.root);
  assert.ok(first);
  return { store, actions, calls, first };
}

beforeEach(() => setActivePinia(createPinia()));

test('split actions add a pane in the requested direction', async () => {
  const { store, actions, first } = setup();
  await actions.run('split-right', first);
  assert.equal(store.root.kind === 'split' && store.root.direction, 'row');
  await actions.run('split-down', first);
  assert.equal(paneIds(store.root).length, 3);
});

test('copy writes the selection to the clipboard, and skips empty selections', async () => {
  const withSelection = setup({ selection: 'ls -la' });
  await withSelection.actions.run('copy', withSelection.first);
  assert.deepEqual(withSelection.calls, ['write:ls -la']);

  const empty = setup();
  await empty.actions.run('copy', empty.first);
  assert.deepEqual(empty.calls, []);
});

test('paste sends clipboard text to the terminal', async () => {
  const { actions, calls, first } = setup();
  await actions.run('paste', first);
  assert.deepEqual(calls, ['paste:from clipboard']);
});

test('paste strips control characters before sending', async () => {
  const { actions, calls, first } = setup({ clipboardText: 'ls\x1b[201~whoami' });
  await actions.run('paste', first);
  assert.deepEqual(calls, ['paste:ls[201~whoami']);
});

test('multi-line paste asks first and pastes only when confirmed', async () => {
  const accepted = setup({ clipboardText: 'cd /tmp\nrm -rf x\n' });
  await accepted.actions.run('paste', accepted.first);
  assert.deepEqual(accepted.calls, ['confirm:2', 'paste:cd /tmp\nrm -rf x\n']);

  const declined = setup({ clipboardText: 'cd /tmp\nrm -rf x', confirm: false });
  await declined.actions.run('paste', declined.first);
  assert.deepEqual(declined.calls, ['confirm:2']);
});

test('pasteText guards text that arrives from a native paste event', async () => {
  const { actions, calls, first } = setup({ confirm: false });
  await actions.pasteText(first, 'echo \x07ok');
  await actions.pasteText(first, 'a\nb');
  await actions.pasteText(first, '');
  assert.deepEqual(calls, ['paste:echo ok', 'confirm:2']);
});

test('clear and rename act on the pane', async () => {
  const { store, actions, calls, first } = setup();
  await actions.run('clear', first);
  await actions.run('rename', first);
  assert.deepEqual(calls, ['clear']);
  assert.equal(store.renamingId, first);
});

test('close removes the pane; closing the last one closes the window', async () => {
  const { store, actions, calls, first } = setup();
  await actions.run('split-right', first);
  await actions.run('close', first);
  assert.equal(paneIds(store.root).length, 1);
  assert.deepEqual(calls, []);
  await actions.run('close', store.activeId);
  assert.deepEqual(calls, ['close-window']);
});
