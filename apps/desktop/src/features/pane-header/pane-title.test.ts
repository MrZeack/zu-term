import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paneTitle, shortPath } from './pane-title.ts';

test('paneTitle prefers the custom name', () => {
  assert.equal(paneTitle({ name: 'agente', terminalTitle: 'vim', cwd: '/x/api' }), 'agente');
});

test('paneTitle falls back to terminal title, cwd folder, then shell', () => {
  assert.equal(paneTitle({ name: '', terminalTitle: 'vim', cwd: '/x/api' }), 'vim');
  assert.equal(paneTitle({ terminalTitle: '  ', cwd: '/x/api' }), 'api');
  assert.equal(paneTitle({ cwd: '/' }), '/');
  assert.equal(paneTitle({}), 'shell');
});

test('shortPath replaces home with ~ only on a path boundary', () => {
  assert.equal(shortPath('/Users/me/code/api', '/Users/me', 40), '~/code/api');
  assert.equal(shortPath('/Users/me', '/Users/me', 40), '~');
  assert.equal(shortPath('/Users/meow/x', '/Users/me', 40), '/Users/meow/x');
});

test('shortPath truncates from the left keeping last segments', () => {
  assert.equal(shortPath('/Users/me/a/very/long/path/project', '/Users/me', 18), '…/path/project');
  assert.equal(shortPath('/a/supercalifragilistic', undefined, 5), '…/supercalifragilistic');
});

test('shortPath of a missing path is empty', () => {
  assert.equal(shortPath(undefined, '/Users/me', 40), '');
});
