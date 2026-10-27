import type { PaneAction } from '../context-menu/menu-items.ts';

export type KeyInput = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

// macOS: iTerm2 style. CMD+V stays with the native Edit menu (it already pastes).
const MAC: Record<string, PaneAction> = {
  d: 'split-right',
  'shift+d': 'split-down',
  w: 'close',
  c: 'copy',
  k: 'clear',
};

// Linux: Terminator style, always with CTRL+SHIFT so shell keys stay free.
const LINUX: Record<string, PaneAction> = {
  e: 'split-right',
  o: 'split-down',
  w: 'close',
  c: 'copy',
  v: 'paste',
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
  return event.ctrlKey && !event.metaKey;
}

export function isCloseWindowShortcut(event: KeyInput, isMac: boolean): boolean {
  if (event.altKey) return false;
  const key = event.key.toLowerCase();
  if (key !== 'w') return false;
  if (isMac) {
    return event.metaKey && !event.ctrlKey && event.shiftKey;
  }
  return event.ctrlKey && !event.metaKey && event.shiftKey;
}
