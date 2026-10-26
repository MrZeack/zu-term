import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampFontSize,
  DEFAULT_TERMINAL_FONT_ID,
  DEFAULT_TERMINAL_FONT_SIZE,
  findTerminalFont,
  isTerminalFontId,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  resolveFontFamily,
  TERMINAL_FONTS,
} from './terminal-font.ts';

test('defines at least 6 libre terminal fonts plus system font', () => {
  assert.ok(TERMINAL_FONTS.length >= 7);
  const ids = TERMINAL_FONTS.map((font) => font.id);
  assert.ok(ids.includes('jetbrains-mono'));
  assert.ok(ids.includes('fira-code'));
  assert.ok(ids.includes('ibm-plex-mono'));
  assert.ok(ids.includes('geist-mono'));
  assert.ok(ids.includes('victor-mono'));
  assert.ok(ids.includes('comic-mono'));
  assert.ok(ids.includes('system'));

  for (const font of TERMINAL_FONTS) {
    assert.ok(font.name.length > 0);
    assert.ok(font.family.includes('monospace'));
    assert.ok(font.category.length > 0);
    assert.ok(font.description.length > 0);
  }
});

test('findTerminalFont returns the matching font or falls back to default', () => {
  const jb = findTerminalFont('jetbrains-mono');
  assert.equal(jb.id, 'jetbrains-mono');
  assert.equal(jb.name, 'JetBrains Mono');

  const fira = findTerminalFont('fira-code');
  assert.equal(fira.id, 'fira-code');

  const unknown = findTerminalFont('non-existent-font');
  assert.equal(unknown.id, DEFAULT_TERMINAL_FONT_ID);
});

test('resolveFontFamily returns valid CSS family string', () => {
  assert.match(resolveFontFamily('jetbrains-mono'), /JetBrains Mono/);
  assert.match(resolveFontFamily('fira-code'), /Fira Code/);
  assert.match(resolveFontFamily('comic-mono'), /Comic Mono/);
  assert.match(resolveFontFamily('system'), /Menlo/);
  assert.match(resolveFontFamily('unknown'), /JetBrains Mono/);
});

test('isTerminalFontId validates known font ids', () => {
  assert.equal(isTerminalFontId('jetbrains-mono'), true);
  assert.equal(isTerminalFontId('comic-mono'), true);
  assert.equal(isTerminalFontId('system'), true);
  assert.equal(isTerminalFontId('times-new-roman'), false);
  assert.equal(isTerminalFontId(123), false);
  assert.equal(isTerminalFontId(null), false);
});

test('clampFontSize keeps size within min and max boundaries', () => {
  assert.equal(clampFontSize(12), 12);
  assert.equal(clampFontSize(MIN_TERMINAL_FONT_SIZE - 5), MIN_TERMINAL_FONT_SIZE);
  assert.equal(clampFontSize(MAX_TERMINAL_FONT_SIZE + 10), MAX_TERMINAL_FONT_SIZE);
  assert.equal(clampFontSize(14.7), 15);
  assert.equal(clampFontSize(Number.NaN), DEFAULT_TERMINAL_FONT_SIZE);
  assert.equal(clampFontSize(Number.POSITIVE_INFINITY), DEFAULT_TERMINAL_FONT_SIZE);
});
