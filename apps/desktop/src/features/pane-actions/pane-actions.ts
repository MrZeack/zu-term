import type { PaneAction } from '../context-menu/menu-items.ts';
import type { Direction } from '../layout/layout-tree.ts';
import { isMultiline, lineCount, sanitizePaste } from '../paste/paste-guard.ts';
import type { AgentProvider, AgentState } from '../workspace/agent.ts';

export interface TerminalHandle {
  getSelection(): string;
  paste(text: string): void;
  clear(): void;
  openSearch?(): void;
  hasForegroundProcess?(): Promise<boolean>;
}

export interface PaneCloseTarget {
  id: string;
  command?: string | undefined;
  agent?: AgentState | undefined;
  hasForegroundProcess?: boolean | undefined;
}

const AGENT_DISPLAY_NAMES: Record<AgentProvider, string> = {
  codex: 'Codex',
  claude: 'Claude',
  kiro: 'Kiro',
  muse: 'Muse',
  antigravity: 'Antigravity',
};

export function paneHasActiveWork(
  pane:
    | {
        command?: string | undefined;
        agent?: AgentState | undefined;
        hasForegroundProcess?: boolean | undefined;
      }
    | undefined,
): boolean {
  if (!pane) return false;
  return Boolean(pane.command?.trim() || pane.hasForegroundProcess);
}

export function formatClosePaneConfirmation(target: {
  command?: string | undefined;
  agent?: AgentState | undefined;
  hasForegroundProcess?: boolean | undefined;
}): {
  title: string;
  message: string;
} {
  const title = 'Cerrar split';
  const hasActiveCommand = Boolean(target.command?.trim());
  if (target.agent && (hasActiveCommand || target.hasForegroundProcess)) {
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

export function listActivePaneWork(
  panes: Record<
    string,
    {
      id: string;
      name?: string | undefined;
      terminalTitle?: string | undefined;
      cwd?: string | undefined;
      command?: string | undefined;
      agent?: AgentState | undefined;
    }
  >,
  foregroundPaneIds: ReadonlySet<string> = new Set(),
): string[] {
  const items: string[] = [];
  for (const [id, pane] of Object.entries(panes)) {
    const hasCommand = Boolean(pane.command?.trim());
    const hasFg = foregroundPaneIds.has(id);
    if (!hasCommand && !hasFg) continue;

    const label = pane.name?.trim() || pane.terminalTitle?.trim() || 'Terminal';
    if (pane.agent) {
      const providerName = AGENT_DISPLAY_NAMES[pane.agent.provider] ?? pane.agent.provider;
      items.push(`${label} · Agente ${providerName}`);
    } else if (hasCommand) {
      items.push(`${label} · ${pane.command!.trim()}`);
    } else {
      items.push(`${label} · Proceso en ejecución`);
    }
  }
  return items;
}

export function activeWorkHeading(count: number): string {
  return count === 1
    ? 'Se interrumpirá 1 proceso activo:'
    : `Se interrumpirán ${count} procesos activos:`;
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
      case 'find':
        terminal(paneId)?.openSearch?.();
        return;
      case 'rename':
        store.startRename(paneId);
        return;
      case 'clear':
        terminal(paneId)?.clear();
        return;
      case 'close': {
        const pane = store.getPane ? store.getPane(paneId) : store.panes?.[paneId];
        const term = terminal(paneId);
        const hasForegroundProcess =
          !pane?.command?.trim() && term?.hasForegroundProcess
            ? await term.hasForegroundProcess().catch(() => false)
            : false;
        const target: PaneCloseTarget = {
          id: paneId,
          command: pane?.command,
          agent: pane?.agent,
          hasForegroundProcess,
        };
        if (confirmClose && paneHasActiveWork(target)) {
          const confirmed = await confirmClose(target);
          if (!confirmed) return;
        }
        if (!store.close(paneId)) await closeWindow();
        return;
      }
    }
  }
  return { run, pasteText };
}
