import type { PaneAction } from '../context-menu/menu-items.ts';
import type { Direction } from '../layout/layout-tree.ts';

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
  closeWindow(): Promise<void>;
}

// Single entry point for the context menu and keyboard shortcuts.
export function createPaneActions({ store, terminal, clipboard, closeWindow }: PaneActionDeps) {
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
      case 'paste': {
        const text = await clipboard.readText();
        if (text) terminal(paneId)?.paste(text);
        return;
      }
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
  return { run };
}
