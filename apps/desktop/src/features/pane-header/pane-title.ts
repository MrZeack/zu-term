export interface TitleSource {
  name?: string | undefined;
  terminalTitle?: string | undefined;
  cwd?: string | undefined;
}

const present = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== '';

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? '/';
}

export function paneTitle({ name, terminalTitle, cwd }: TitleSource): string {
  if (present(name)) return name;
  if (present(terminalTitle)) return terminalTitle;
  if (present(cwd)) return basename(cwd);
  return 'shell';
}

export function shortPath(path: string | undefined, home: string | undefined, maxLength: number) {
  if (!path) return '';
  let shown = path;
  if (home) {
    if (path === home) shown = '~';
    else if (path.startsWith(`${home}/`)) shown = `~${path.slice(home.length)}`;
  }
  if (shown.length <= maxLength) return shown;

  const segments = shown.split('/').filter(Boolean);
  let result = segments.pop() ?? '';
  for (let segment = segments.pop(); segment !== undefined; segment = segments.pop()) {
    const candidate = `${segment}/${result}`;
    if (`…/${candidate}`.length > maxLength) break;
    result = candidate;
  }
  return `…/${result}`;
}
