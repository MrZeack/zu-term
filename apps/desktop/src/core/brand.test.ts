import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_COMMAND_PREFIX,
  APP_NAME,
  APP_SLUG,
  APP_TERMINAL_ENV,
  APP_WINDOW_PREFIX,
} from './brand.ts';

test('defines the Zu Term identity used by the desktop runtime', () => {
  assert.equal(APP_NAME, 'Zu Term');
  assert.equal(APP_SLUG, 'zu-term');
  assert.equal(APP_TERMINAL_ENV, 'ZU_TERM_TERMINAL');
  assert.equal(APP_COMMAND_PREFIX, 'ZuTermCommand=');
  assert.equal(APP_WINDOW_PREFIX, 'zu-term-window-');
});
