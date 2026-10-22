import type { TerminalHandle } from '../pane-actions/pane-actions.ts';

// Live terminals by pane id, so actions can reach the xterm instance.
const handles = new Map<string, TerminalHandle>();

export const terminals = {
  register: (paneId: string, handle: TerminalHandle) => handles.set(paneId, handle),
  unregister: (paneId: string) => handles.delete(paneId),
  get: (paneId: string) => handles.get(paneId),
};
