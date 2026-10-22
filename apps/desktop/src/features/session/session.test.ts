import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_STORAGE_KEY,
  clearSession,
  createSessionSnapshot,
  loadSession,
  saveSession,
  type SessionStorage,
} from './session.ts';
import type { PaneState } from '../layout/layout.store.ts';
import type { LayoutNode } from '../layout/layout-tree.ts';

function storage(seed?: string): SessionStorage & { value: string | null } {
  let value = seed ?? null;
  return {
    get value() {
      return value;
    },
    getItem: (key) => (key === SESSION_STORAGE_KEY ? value : null),
    setItem: (key, next) => {
      if (key === SESSION_STORAGE_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === SESSION_STORAGE_KEY) value = null;
    },
  };
}

const root: LayoutNode = {
  kind: 'split',
  id: 'split-1',
  direction: 'row',
  ratio: 0.6,
  first: { kind: 'pane', id: 'pane-1' },
  second: { kind: 'pane', id: 'pane-2' },
};

const panes: Record<string, PaneState> = {
  'pane-1': {
    id: 'pane-1',
    startCwd: '/Users/me/project',
    cwd: '/Users/me/project/src',
    name: 'Frontend',
    terminalTitle: 'zsh',
    command: 'codex',
  },
  'pane-2': { id: 'pane-2', cwd: '/Users/me/project/api' },
};

test('creates a restorable snapshot without transient command state', () => {
  const snapshot = createSessionSnapshot(root, panes, 'pane-2');
  assert.deepEqual(snapshot, {
    version: 1,
    root,
    panes: {
      'pane-1': {
        id: 'pane-1',
        startCwd: '/Users/me/project/src',
        cwd: '/Users/me/project/src',
        name: 'Frontend',
        terminalTitle: 'zsh',
      },
      'pane-2': { id: 'pane-2', startCwd: '/Users/me/project/api', cwd: '/Users/me/project/api' },
    },
    activeId: 'pane-2',
  });
});

test('saves and loads a valid session from storage', () => {
  const target = storage();
  const snapshot = createSessionSnapshot(root, panes, 'pane-1');
  assert.equal(saveSession(target, snapshot), true);
  assert.deepEqual(loadSession(target), snapshot);
});

test('clears a saved session when the user declines restoration', () => {
  const target = storage();
  saveSession(target, createSessionSnapshot(root, panes, 'pane-1'));
  clearSession(target);
  assert.equal(loadSession(target), null);
  assert.equal(target.value, null);
});

test('discards malformed or unsafe persisted sessions', () => {
  const target = storage(
    JSON.stringify({
      version: 1,
      root: { kind: 'pane', id: 'missing' },
      panes: {},
      activeId: 'missing',
    }),
  );
  assert.equal(loadSession(target), null);
  assert.equal(target.value, null);
});

test('ignores storage failures without breaking app startup', () => {
  const failing: SessionStorage = {
    getItem: () => {
      throw new Error('unavailable');
    },
    setItem: () => {
      throw new Error('full');
    },
    removeItem: () => {
      throw new Error('unavailable');
    },
  };
  const snapshot = createSessionSnapshot(root, panes, 'pane-1');
  assert.equal(loadSession(failing), null);
  assert.equal(saveSession(failing, snapshot), false);
});
