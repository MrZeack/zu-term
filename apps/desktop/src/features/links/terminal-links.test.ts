import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import { attachTerminalLinks } from './terminal-links.ts';

function fakeTerminal(lines: string[]) {
  let provider: ILinkProvider | undefined;
  const options: Record<string, unknown> = {};
  const term = {
    options,
    buffer: {
      active: {
        getLine: (y: number) => {
          const text = lines[y];
          if (text === undefined) return undefined;
          return {
            length: text.length,
            getCell: (x: number) => ({ getChars: () => text[x] ?? '', getWidth: () => 1 }),
          };
        },
      },
    },
    registerLinkProvider(next: ILinkProvider) {
      provider = next;
      return { dispose: () => (provider = undefined) };
    },
  };
  const links = (y: number) =>
    new Promise<ILink[] | undefined>((resolve) => {
      if (provider) provider.provideLinks(y, resolve);
      else resolve(undefined);
    });
  return { term: term as unknown as Terminal, links, options, provider: () => provider };
}

function mouse(type: string, init: Partial<MouseEvent>) {
  return Object.assign(new Event(type, { cancelable: true }), {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...init,
  });
}

function setup(lines: string[]) {
  const fake = fakeTerminal(lines);
  const host = new EventTarget();
  const opened: [string, string | undefined][] = [];
  const handle = attachTerminalLinks(fake.term, host as HTMLElement, {
    cwd: () => '/repo',
    open: async (target, cwd) => {
      opened.push([target, cwd]);
    },
  });
  return { ...fake, host, opened, handle };
}

test('subraya URLs y rutas de la línea con su rango de celdas', async () => {
  const { links } = setup(['ok see src/App.vue and https://a.dev']);
  const found = (await links(1)) ?? [];

  assert.deepEqual(
    found.map((link) => [link.text, link.range.start.x, link.range.end.x]),
    [
      ['src/App.vue', 8, 18],
      ['https://a.dev', 24, 36],
    ],
  );
});

test('Ctrl+clic sobre un enlace lo abre con la carpeta del split y no muestra el menú', async () => {
  const { links, host, opened } = setup(['src/App.vue']);
  const [link] = (await links(1)) ?? [];
  link?.hover?.(mouse('mousemove', {}) as MouseEvent, link.text);

  const down = mouse('mousedown', { ctrlKey: true });
  host.dispatchEvent(down);
  const menu = mouse('contextmenu', { ctrlKey: true });
  host.dispatchEvent(menu);

  assert.deepEqual(opened, [['src/App.vue', '/repo']]);
  assert.equal(down.defaultPrevented, true);
  assert.equal(menu.defaultPrevented, true, 'macOS secondary click must not open the menu');
});

test('si el sistema solo envía contextmenu, también abre el enlace una vez', async () => {
  const { links, host, opened } = setup(['https://a.dev']);
  const [link] = (await links(1)) ?? [];
  link?.hover?.(mouse('mousemove', {}) as MouseEvent, link.text);

  host.dispatchEvent(mouse('contextmenu', { ctrlKey: true, button: 2 }));

  assert.deepEqual(opened, [['https://a.dev', '/repo']]);
});

test('sin Ctrl, fuera de un enlace o con Cmd no abre nada ni bloquea el menú', async () => {
  const { links, host, opened } = setup(['src/App.vue']);
  const outside = mouse('contextmenu', { ctrlKey: true });
  host.dispatchEvent(outside);
  assert.equal(outside.defaultPrevented, false);

  const [link] = (await links(1)) ?? [];
  link?.hover?.(mouse('mousemove', {}) as MouseEvent, link.text);
  host.dispatchEvent(mouse('mousedown', {}));
  host.dispatchEvent(mouse('mousedown', { metaKey: true }));
  link?.activate(mouse('click', {}) as MouseEvent, link.text);
  link?.leave?.(mouse('mousemove', {}) as MouseEvent, link.text);
  host.dispatchEvent(mouse('mousedown', { ctrlKey: true }));

  assert.deepEqual(opened, []);
});

test('los enlaces OSC 8 usan el mismo Ctrl+clic y un clic normal no abre nada', () => {
  const { options, host, opened } = setup([]);
  const handler = options.linkHandler as NonNullable<Terminal['options']['linkHandler']>;

  handler.activate(mouse('click', {}) as MouseEvent, 'https://osc8.dev', {} as never);
  handler.hover?.(mouse('mousemove', {}) as MouseEvent, 'https://osc8.dev', {} as never);
  host.dispatchEvent(mouse('mousedown', { ctrlKey: true }));

  assert.deepEqual(opened, [['https://osc8.dev', '/repo']]);
});

test('dispose retira el proveedor y los listeners', async () => {
  const { host, opened, handle, provider, links } = setup(['src/App.vue']);
  const [link] = (await links(1)) ?? [];
  link?.hover?.(mouse('mousemove', {}) as MouseEvent, link.text);
  handle.dispose();

  host.dispatchEvent(mouse('mousedown', { ctrlKey: true }));
  assert.equal(provider(), undefined);
  assert.deepEqual(opened, []);
});

test('TerminalPane conecta los enlaces con la carpeta actual del split', async () => {
  const source = await readFile(new URL('../terminal/TerminalPane.vue', import.meta.url), 'utf8');

  assert.match(source, /attachTerminalLinks\(term, host\.value,/);
  assert.match(source, /if \(path\) \{\s*currentCwd = path;/);
  assert.match(source, /links\?\.dispose\(\)/);
});
