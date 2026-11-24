import type { ISearchOptions } from '@xterm/addon-search';

export interface SearchFlags {
  caseSensitive: boolean;
  regex: boolean;
  incremental?: boolean;
}

export interface SearchAddonLike {
  findNext(term: string, searchOptions?: ISearchOptions): boolean;
  findPrevious(term: string, searchOptions?: ISearchOptions): boolean;
  clearDecorations(): void;
}

export type SearchOutcome = 'empty' | 'invalid-regex' | 'found' | 'not-found';

export function isValidSearchRegex(pattern: string): boolean {
  if (!pattern) return true;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export function formatSearchCounter(
  query: string,
  resultIndex: number,
  resultCount: number,
  invalidRegex: boolean,
): string {
  if (!query) return '';
  if (invalidRegex) return 'Regex inválida';
  if (resultCount <= 0) return '0/0';
  if (resultIndex < 0) return `${resultCount}+`;
  return `${resultIndex + 1}/${resultCount}`;
}

export function buildSearchOptions({
  caseSensitive,
  regex,
  incremental,
}: SearchFlags): ISearchOptions {
  return {
    caseSensitive,
    regex,
    ...(incremental !== undefined ? { incremental } : {}),
    decorations: {
      matchBackground: '#1e3a4c',
      matchBorder: '#00b7d5',
      matchOverviewRuler: '#00b7d5',
      activeMatchBackground: '#00ca91',
      activeMatchBorder: '#ffffff',
      activeMatchColorOverviewRuler: '#00ca91',
    },
  };
}

export function runTerminalSearch(
  addon: SearchAddonLike,
  query: string,
  direction: 'next' | 'previous',
  flags: SearchFlags,
): SearchOutcome {
  if (!query) {
    addon.clearDecorations();
    return 'empty';
  }
  if (flags.regex && !isValidSearchRegex(query)) {
    addon.clearDecorations();
    return 'invalid-regex';
  }
  const options = buildSearchOptions(flags);
  const found =
    direction === 'next' ? addon.findNext(query, options) : addon.findPrevious(query, options);
  return found ? 'found' : 'not-found';
}
