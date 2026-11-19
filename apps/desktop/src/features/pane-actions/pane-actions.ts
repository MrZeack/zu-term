import type { PaneAction } from '../context-menu/menu-items.ts';
import type { Direction } from '../layout/layout-tree.ts';
import { isMultiline, lineCount, sanitizePaste } from '../paste/paste-guard.ts';
import type { AgentProvider, AgentState } from '../workspace/agent.ts';

export interface TerminalHandle {
  getSelection(): string;
  paste(text: string): void;
  clear(): void;
}

export interface PaneCloseTarget {
  id: string;
  command?: string | undefined;
  agent?: AgentState | undefined;
}

const AGENT_DISPLAY_NAMES: Record<AgentProvider, string> = {
  codex: 'Codex',
  claude: 'Claude',
  kiro: 'Kiro',
  muse: 'Muse',
  antigravity: 'Antigravity',
};

export function paneHasActiveWork(
  pane: { command?: string | undefined; agent?: AgentState | undefined } | undefined,
): boolean {
  if (!pane) return false;
  return Boolean(pane.agent || pane.command?.trim());
}

export function formatClosePaneConfirmation(target: {
  command?: string | undefined;
  agent?: AgentState | undefined;
}): {
  title: string;
  message: string;
} {
  const title = 'Cerrar split';
  if (target.agent) {
    const providerName = AGENT_DISPLAY_NAMES[target.agent.provider] ?? target.agent.provider;
    return {
      title,
      message: `Este split tiene una sesión activa del agente ${providerName}. Si lo cierras, se interrumpirá su ejecución. ¿Deseas cerrarlo?`,
    };
  }
  if (target.command?.trim()) {
    return {
      title,
      message: `El comando “${target.command.trim()}” aún se está ejecutando en este split. Si lo cierras, el proceso se interrumpirá. ¿Deseas cerrarlo?`,
    };
  }
  return {
    title,
    message: 'Hay procesos en ejecución en este split. ¿Deseas cerrarlo de todos modos?',
  };
}

export interface PaneActionDeps {
  store: {
    split(id: string, direction: Direction): string;
    close(id: string): boolean;
    startRename(id: string): void;
    getPane?(
      id: string,
    ): { command?: string | undefined; agent?: AgentState | undefined } | undefined;
    panes?: Record<string, { command?: string | undefined; agent?: AgentState | undefined }>;
  };
  terminal(id: string): TerminalHandle | undefined;
  clipboard: { readText(): Promise<string>; writeText(text: string): Promise<void> };
  confirmPaste(lines: number): Promise<boolean>;
  confirmClose?(target: PaneCloseTarget): Promise<boolean>;
  closeWindow(): Promise<void>;
}

// Single entry point for the context menu, keyboard shortcuts and native paste.
export function createPaneActions({
  store,
  terminal,
  clipboard,
  confirmPaste,
  confirmClose,
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
      case 'close': {
        const pane = store.getPane ? store.getPane(paneId) : store.panes?.[paneId];
        if (confirmClose && paneHasActiveWork(pane)) {
          const confirmed = await confirmClose({
            id: paneId,
            command: pane?.command,
            agent: pane?.agent,
          });
          if (!confirmed) return;
        }
        if (!store.close(paneId)) await closeWindow();
        return;
      }
    }
  }
  return { run, pasteText };
}
