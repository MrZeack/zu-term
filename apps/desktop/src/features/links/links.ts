export interface LinkMatch {
  start: number;
  end: number;
  text: string;
}

const URL_PATTERN = /\b(?:https?|file):\/\/[^\s<>"'`]+/g;
// A path starts at the line start or after a space, quote or opening bracket:
// absolute, `~/`, `./` or `../`; relative with a slash; or a bare file name
// with an extension. An optional `:line` or `:line:column` follows.
const PATH_PATTERN =
  /(^|[\s'"`([{<])((?:~|\.{1,2})?\/[\w.@+~-]+(?:\/[\w.@+~-]+)*\/?|[\w@+-][\w.@+-]*(?:\/[\w.@+-]+)+\/?|[\w@+-]+(?:\.[\w@+-]+)*\.[A-Za-z]\w{0,9})((?::\d+){0,2})/g;
const CLOSING = { ')': '(', ']': '[', '}': '{' } as const;

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

// Drops sentence punctuation and closing brackets that the URL did not open.
function trimUrl(url: string): string {
  let text = url;
  for (;;) {
    const last = text.at(-1) ?? '';
    if ('.,;:!?'.includes(last)) text = text.slice(0, -1);
    else if (last in CLOSING) {
      const open = CLOSING[last as keyof typeof CLOSING];
      if (count(text, open) >= count(text, last)) return text;
      text = text.slice(0, -1);
    } else return text;
  }
}

// URLs and file paths in one terminal line, by text position.
export function findLinks(line: string): LinkMatch[] {
  const links: LinkMatch[] = [];
  for (const match of line.matchAll(URL_PATTERN)) {
    const text = trimUrl(match[0]);
    links.push({ start: match.index, end: match.index + text.length, text });
  }
  for (const match of line.matchAll(PATH_PATTERN)) {
    const path = (match[2] ?? '').replace(/\.+$/, '');
    const suffix = path.length === (match[2] ?? '').length ? (match[3] ?? '') : '';
    const start = match.index + (match[1] ?? '').length;
    const text = path + suffix;
    const end = start + text.length;
    if (!links.some((link) => start < link.end && end > link.start)) {
      links.push({ start, end, text });
    }
  }
  return links.sort((a, b) => a.start - b.start);
}

// Text of a buffer line plus the cell column of each UTF-16 code unit, so a
// match in the text maps back to cells despite wide characters and emoji.
export function lineText(cells: Iterable<{ chars: string; width: number }>) {
  let text = '';
  const columns: number[] = [];
  let column = 0;
  for (const cell of cells) {
    if (cell.width > 0) {
      const chars = cell.chars || ' ';
      text += chars;
      for (let i = 0; i < chars.length; i += 1) columns.push(column);
    }
    column += 1;
  }
  return { text, columns };
}

// Ctrl+click on every platform: on macOS that is also the system's secondary
// click, so the terminal skips its context menu over a link.
export function opensLink(event: {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  return event.button === 0 && event.ctrlKey && !event.metaKey && !event.altKey;
}
