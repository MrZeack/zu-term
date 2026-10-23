import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOsc7, parseZuTermAgent, parseZuTermCommand } from './osc.ts';

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

test('parseOsc7 accepts the local hostname with or without the macOS .local suffix', () => {
  assert.equal(parseOsc7('file://mac.local/tmp', 'mac'), '/tmp');
  assert.equal(parseOsc7('file://mac/tmp', 'mac.local'), '/tmp');
});

test('parseOsc7 does not trust a different hostname with the same suffix', () => {
  assert.equal(parseOsc7('file://other.local/tmp', 'mac'), null);
});

test('parseOsc7 rejects paths reported for another, empty or localhost host', () => {
  assert.equal(parseOsc7('file://evil.example/tmp', HOST), null);
  assert.equal(parseOsc7('file:///tmp', HOST), null);
  assert.equal(parseOsc7('file://localhost/tmp', HOST), null);
});

test('parseZuTermCommand reads safe command labels and clears them', () => {
  assert.equal(parseZuTermCommand('ZuTermCommand=codex'), 'codex');
  assert.equal(parseZuTermCommand('ZuTermCommand=claude-code'), 'claude-code');
  assert.equal(parseZuTermCommand('ZuTermCommand='), null);
});

test('parseZuTermCommand ignores malformed or unrelated payloads', () => {
  assert.equal(parseZuTermCommand('OtherCommand=codex'), undefined);
  assert.equal(parseZuTermCommand('ZuTermCommand=codex%20--danger'), null);
  assert.equal(parseZuTermCommand('ZuTermCommand=codex\u001b'), null);
});

test('parseZuTermAgent reads a supported agent with or without an explicit ID', () => {
  assert.deepEqual(parseZuTermAgent('ZuTermAgent=codex|codex-123'), {
    provider: 'codex',
    sessionId: 'codex-123',
  });
  assert.deepEqual(parseZuTermAgent('ZuTermAgent=claude'), { provider: 'claude' });
  assert.deepEqual(parseZuTermAgent('ZuTermAgent=kiro|kiro-123'), {
    provider: 'kiro',
    sessionId: 'kiro-123',
  });
  assert.deepEqual(parseZuTermAgent('ZuTermAgent=muse|muse-123'), {
    provider: 'muse',
    sessionId: 'muse-123',
  });
  assert.deepEqual(parseZuTermAgent('ZuTermAgent=antigravity|conversation-123'), {
    provider: 'antigravity',
    sessionId: 'conversation-123',
  });
  assert.equal(parseZuTermAgent('ZuTermAgent='), null);
});

test('parseZuTermAgent rejects unsupported providers and unsafe IDs', () => {
  assert.equal(parseZuTermAgent('OtherAgent=codex|123'), undefined);
  assert.equal(parseZuTermAgent('ZuTermAgent=gemini|123'), null);
  assert.equal(parseZuTermAgent("ZuTermAgent=codex|abc';rm"), null);
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
