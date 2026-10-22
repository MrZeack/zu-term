import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMultiline, sanitizePaste } from './paste-guard.ts';

test('sanitizePaste strips ESC so pasted text cannot end bracketed paste', () => {
  assert.equal(sanitizePaste('echo hi\x1b[201~rm -rf ~\n'), 'echo hi[201~rm -rf ~\n');
});

test('sanitizePaste removes C0, DEL and C1 controls but keeps tab and newlines', () => {
  assert.equal(sanitizePaste('a\x00b\x07c\x7fd\x9b2Je'), 'abcd2Je');
  assert.equal(sanitizePaste('col1\tcol2\r\nnext\n'), 'col1\tcol2\r\nnext\n');
});

test('sanitizePaste keeps unicode text intact', () => {
  assert.equal(sanitizePaste('cd ~/año/🚀'), 'cd ~/año/🚀');
});

test('isMultiline ignores a single trailing newline', () => {
  assert.equal(isMultiline('ls -la'), false);
  assert.equal(isMultiline('ls -la\n'), false);
  assert.equal(isMultiline('ls -la\r\n'), false);
});

test('isMultiline detects more than one line', () => {
  assert.equal(isMultiline('cd /tmp\nrm -rf x'), true);
  assert.equal(isMultiline('a\r\nb'), true);
  assert.equal(isMultiline('a\rb'), true);
  assert.equal(isMultiline('a\n\n'), true);
});
