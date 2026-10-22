import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOsc7 } from './osc.ts';

const HOST = 'mac.local';

test('parseOsc7 extracts and decodes the path when the host is this machine', () => {
  assert.equal(
    parseOsc7('file://mac.local/Users/me/my%20app%20100%25', HOST),
    '/Users/me/my app 100%',
  );
});

test('parseOsc7 compares the host case-insensitively', () => {
  assert.equal(parseOsc7('file://MAC.LOCAL/tmp', HOST), '/tmp');
});

test('parseOsc7 rejects paths reported for another, empty or localhost host', () => {
  assert.equal(parseOsc7('file://evil.example/tmp', HOST), null);
  assert.equal(parseOsc7('file:///tmp', HOST), null);
  assert.equal(parseOsc7('file://localhost/tmp', HOST), null);
});

test('parseOsc7 rejects everything while the local host is unknown', () => {
  assert.equal(parseOsc7('file://mac.local/tmp', undefined), null);
});

test('parseOsc7 rejects other schemes and malformed input', () => {
  assert.equal(parseOsc7('http://mac.local/path', HOST), null);
  assert.equal(parseOsc7('file://mac.local', HOST), null);
  assert.equal(parseOsc7('file://mac.local/bad%zz', HOST), null);
  assert.equal(parseOsc7('', HOST), null);
});
