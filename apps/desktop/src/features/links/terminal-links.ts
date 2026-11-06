import type { ILink, Terminal } from '@xterm/xterm';
import { findLinks, lineText, opensLink } from './links.ts';

export interface TerminalLinkDeps {
  cwd: () => string | undefined;
  open: (target: string, cwd: string | undefined) => Promise<unknown>;
}

// Underlines URLs and paths (and OSC 8 hyperlinks) and opens the hovered one
// on Ctrl+click. Opening happens here, not in xterm's `activate`, because on
// macOS Ctrl+click is the secondary click: the context menu must be skipped.
export function attachTerminalLinks(
  term: Terminal,
  host: HTMLElement,
  deps: TerminalLinkDeps,
): { dispose(): void } {
  let hovered: string | undefined;
  let openedByMouseDown = false;
  const hover = (_event: MouseEvent, text: string) => {
    hovered = text;
  };
  const leave = () => {
    hovered = undefined;
  };
  const open = (target: string) => {
    void deps.open(target, deps.cwd()).catch(() => undefined);
  };

  const provider = term.registerLinkProvider({
    provideLinks(y, callback) {
      const line = term.buffer.active.getLine(y - 1);
      if (!line) return callback(undefined);
      const cells = [];
      for (let x = 0; x < line.length; x += 1) {
        const cell = line.getCell(x);
        cells.push({ chars: cell?.getChars() ?? '', width: cell?.getWidth() ?? 1 });
      }
      const { text, columns } = lineText(cells);
      const links: ILink[] = [];
      for (const match of findLinks(text)) {
        const start = columns[match.start];
        const end = columns[match.end - 1];
        if (start === undefined || end === undefined) continue;
        links.push({
          range: { start: { x: start + 1, y }, end: { x: end + 1, y } },
          text: match.text,
          activate: () => undefined,
          hover,
          leave,
        });
      }
      callback(links.length > 0 ? links : undefined);
    },
  });
  // OSC 8 hyperlinks: a plain click does nothing (xterm would otherwise ask
  // and open the URI itself); Ctrl+click goes through the same path.
  term.options.linkHandler = {
    activate: () => undefined,
    hover,
    leave,
    allowNonHttpProtocols: true,
  };

  const onMouseDown = (event: MouseEvent) => {
    openedByMouseDown = false;
    if (!hovered || !opensLink(event)) return;
    event.preventDefault();
    event.stopPropagation();
    openedByMouseDown = true;
    open(hovered);
  };
  const onContextMenu = (event: MouseEvent) => {
    if (!hovered || !event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    // Some systems only send the context menu for Ctrl+click.
    if (!openedByMouseDown) open(hovered);
    openedByMouseDown = false;
  };
  host.addEventListener('mousedown', onMouseDown, true);
  host.addEventListener('contextmenu', onContextMenu, true);

  return {
    dispose() {
      provider.dispose();
      hovered = undefined;
      host.removeEventListener('mousedown', onMouseDown, true);
      host.removeEventListener('contextmenu', onContextMenu, true);
    },
  };
}
