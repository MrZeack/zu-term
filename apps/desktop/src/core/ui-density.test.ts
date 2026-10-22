import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI_DENSITY } from './ui-density.ts';

test('uses compact chrome metrics for the toolbar and split headers', () => {
  assert.ok(UI_DENSITY.toolbarHeight < 44);
  assert.ok(UI_DENSITY.paneHeaderHeight < 42);
  assert.ok(UI_DENSITY.toolbarFontSize < 13);
  assert.ok(UI_DENSITY.paneTitleFontSize < 15);
  assert.ok(UI_DENSITY.paneMetaFontSize < 12);
});
