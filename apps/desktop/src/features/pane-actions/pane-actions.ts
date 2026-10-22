import type { PaneAction } from '../context-menu/menu-items.ts';
import type { Direction } from '../layout/layout-tree.ts';
import { isMultiline, lineCount, sanitizePaste } from '../paste/paste-guard.ts';

export interface TerminalHandle {
  getSelection(): string;
  paste(text: string): void;
  clear(): void;
}

export interface PaneActionDeps {
  store: {
    split(id: string, direction: Direction): string;
    close(id: string): boolean;
    startRename(id: string): void;
  };
  terminal(id: string): TerminalHandle | undefined;
  clipboard: { readText(): Promise<string>; writeText(text: string): Promise<void> };
  confirmPaste(lines: number): Promise<boolean>;
  closeWindow(): Promise<void>;
}

// Single entry point for the context menu, keyboard shortcuts and native paste.
export function createPaneActions({
  store,
  terminal,
  clipboard,
  confirmPaste,
  closeWindow,
}: PaneActionDeps) {
  // Every paste goes through here: sanitized, and multi-line text needs consent.
  async function pasteText(paneId: string, raw: string): Promise<void> {
    const text = sanitizePaste(raw);
    if (!text) return;
    if (isMultiline(text) && !(await confirmPaste(lineCount(text)))) return;
    terminal(paneId)?.paste(text);
  }

  async function run(action: PaneAction, paneId: string): Promise<void> {
    switch (action) {
      case 'split-right':
        store.split(paneId, 'row');
        return;
      case 'split-down':
        store.split(paneId, 'column');
        return;
      case 'copy': {
        const selection = terminal(paneId)?.getSelection() ?? '';
        if (selection) await clipboard.writeText(selection);
        return;
      }
      case 'paste':
        await pasteText(paneId, await clipboard.readText());
        return;
      case 'rename':
        store.startRename(paneId);
        return;
      case 'clear':
        terminal(paneId)?.clear();
        return;
      case 'close':
        if (!store.close(paneId)) await closeWindow();
        return;
    }
  }
  return { run, pasteText };
}
