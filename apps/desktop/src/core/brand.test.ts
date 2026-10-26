import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  APP_AGENT_PREFIX,
  APP_COMMAND_PREFIX,
  APP_NAME,
  APP_VERSION,
  APP_SLUG,
  APP_TERMINAL_ENV,
  APP_WINDOW_PREFIX,
} from './brand.ts';

test('defines the Zu Term identity used by the desktop runtime', () => {
  assert.equal(APP_NAME, 'Zu Term');
  assert.equal(APP_VERSION, '0.1.2');
  assert.equal(APP_SLUG, 'zu-term');
  assert.equal(APP_TERMINAL_ENV, 'ZU_TERM_TERMINAL');
  assert.equal(APP_COMMAND_PREFIX, 'ZuTermCommand=');
  assert.equal(APP_AGENT_PREFIX, 'ZuTermAgent=');
  assert.equal(APP_WINDOW_PREFIX, 'zu-term-window-');
});

test('keeps the toolbar brand as text without a second visual mark', async () => {
  const appSource = await readFile(new URL('../App.vue', import.meta.url), 'utf8');

  assert.match(appSource, /<span class="brand-name">\{\{ APP_NAME \}\}<\/span>/);
  assert.match(appSource, /class="brand-version">v\{\{ APP_VERSION \}\}<\/span>/);
  assert.doesNotMatch(appSource, /brand-(?:icon|mark)/);
});
