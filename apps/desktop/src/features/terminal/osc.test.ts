import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOsc7 } from './osc.ts';

test('parseOsc7 extracts and decodes the path of a file URL', () => {
  assert.equal(parseOsc7('file://mac.local/Users/me/my%20app%20100%25'), '/Users/me/my app 100%');
});

test('parseOsc7 accepts an empty host', () => {
  assert.equal(parseOsc7('file:///tmp'), '/tmp');
});

test('parseOsc7 rejects other schemes and malformed input', () => {
  assert.equal(parseOsc7('http://host/path'), null);
  assert.equal(parseOsc7('file://host'), null);
  assert.equal(parseOsc7('file://host/bad%zz'), null);
  assert.equal(parseOsc7(''), null);
});
