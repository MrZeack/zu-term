import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTheme, nextTheme, themeColors } from './theme.ts';

function storage(values: Record<string, string>): Pick<Storage, 'getItem'> {
  return { getItem: (key) => values[key] ?? null };
}

test('loadTheme accepts only the two supported accent themes', () => {
  assert.equal(loadTheme(storage({ 'zu-term.theme': 'mint' })), 'mint');
  assert.equal(loadTheme(storage({ 'zu-term.theme': 'cyan' })), 'cyan');
  assert.equal(loadTheme(storage({ 'zu-term.theme': 'light' })), 'cyan');
  assert.equal(loadTheme(storage({})), 'cyan');
});

test('the supported themes use the requested primary colors', () => {
  assert.equal(themeColors.cyan.primary, '#00b7d5');
  assert.equal(themeColors.cyan.secondary, '#00ca91');
  assert.equal(themeColors.mint.primary, '#00ca91');
  assert.equal(themeColors.mint.secondary, '#00b7d5');
});

test('nextTheme alternates between cyan and mint', () => {
  assert.equal(nextTheme('cyan'), 'mint');
  assert.equal(nextTheme('mint'), 'cyan');
});
