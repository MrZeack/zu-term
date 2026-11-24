import type { PaneAction } from '../context-menu/menu-items.ts';

export type KeyInput = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

// macOS: iTerm2 style. CMD+V stays with the native Edit menu (it already pastes).
const MAC: Record<string, PaneAction> = {
  d: 'split-right',
  'shift+d': 'split-down',
  w: 'close',
  c: 'copy',
  f: 'find',
  k: 'clear',
};

// Linux: Terminator style, always with CTRL+SHIFT so shell keys stay free.
const LINUX: Record<string, PaneAction> = {
  e: 'split-right',
  o: 'split-down',
  w: 'close',
  c: 'copy',
  v: 'paste',
  f: 'find',
  k: 'clear',
};

export function shortcutAction(event: KeyInput, isMac: boolean): PaneAction | null {
  const key = event.key.toLowerCase();
  if (event.altKey) return null;
  if (isMac) {
    if (!event.metaKey || event.ctrlKey) return null;
    return MAC[event.shiftKey ? `shift+${key}` : key] ?? null;
  }
  if (!event.ctrlKey || !event.shiftKey || event.metaKey) return null;
  return LINUX[key] ?? null;
}

export type FontZoomAction = 'increase' | 'decrease' | 'reset';

export function fontZoomAction(event: KeyInput, isMac: boolean): FontZoomAction | null {
  const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!mod || event.altKey) return null;
  if (event.key === '=' || event.key === '+') return 'increase';
  if (event.key === '-' || (isMac && event.key === '_')) return 'decrease';
  if (event.key === '0') return 'reset';
  return null;
}

export function isQuitShortcut(event: KeyInput, isMac: boolean): boolean {
  if (event.altKey && (event.key === 'F4' || event.key === 'f4')) {
    return true;
  }
  if (event.altKey) return false;
  const key = event.key.toLowerCase();
  if (key !== 'q') return false;
  if (isMac) {
    return event.metaKey && !event.ctrlKey;
  }
  // On Linux, bare Ctrl+Q is XON flow control in terminals; require Ctrl+Shift+Q.
  return event.ctrlKey && event.shiftKey && !event.metaKey;
}

export function isCloseWindowShortcut(event: KeyInput, isMac: boolean): boolean {
  const key = event.key.toLowerCase();
  if (key !== 'w') return false;
  if (isMac) {
    return !event.altKey && event.metaKey && !event.ctrlKey && event.shiftKey;
  }
  // On Linux, Ctrl+Shift+W closes the active split; Ctrl+Alt+W closes the window.
  return event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey;
}
