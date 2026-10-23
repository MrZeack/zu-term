import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AgentState } from '../workspace/agent.ts';
import { createWorkspaceSnapshot, type WorkspaceSnapshot } from '../workspace/workspace.ts';
import {
  closePane,
  movePane,
  paneIds,
  setRatio,
  splitPane,
  type Direction,
  type DropZone,
  type LayoutNode,
} from './layout-tree.ts';

export interface PaneState {
  id: string;
  historyId?: string;
  startCwd?: string;
  cwd?: string;
  name?: string;
  terminalTitle?: string;
  command?: string;
  agent?: AgentState;
}

export function createLayoutStore(nextId: () => string) {
  return defineStore('layout', () => {
    const firstId = nextId();
    const historyId = () =>
      `pane-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
    const root = ref<LayoutNode>({ kind: 'pane', id: firstId });
    const panes = ref<Record<string, PaneState>>({
      [firstId]: { id: firstId, historyId: historyId() },
    });
    const activeId = ref(firstId);
    const renamingId = ref<string | null>(null);

    function init(cwd: string) {
      const pane = panes.value[firstId] ?? panes.value[paneIds(root.value)[0] ?? ''];
      if (pane && !pane.cwd && !pane.startCwd) Object.assign(pane, { startCwd: cwd, cwd });
    }

    function split(sourceId: string, direction: Direction): string {
      const usedIds = new Set<string>();
      function collectIds(node: LayoutNode) {
        usedIds.add(node.id);
        if (node.kind === 'split') {
          collectIds(node.first);
          collectIds(node.second);
        }
      }
      collectIds(root.value);
      const allocateId = () => {
        let id = nextId();
        while (usedIds.has(id)) id = nextId();
        usedIds.add(id);
        return id;
      };
      const id = allocateId();
      const cwd = panes.value[sourceId]?.cwd;
      root.value = splitPane(root.value, sourceId, direction, id, allocateId());
      panes.value[id] =
        cwd === undefined
          ? { id, historyId: historyId() }
          : { id, historyId: historyId(), startCwd: cwd, cwd };
      activeId.value = id;
      return id;
    }

    // Returns false when the last pane was closed.
    function close(id: string): boolean {
      const next = closePane(root.value, id);
      if (!next) return false;
      root.value = next;
      delete panes.value[id];
      if (activeId.value === id) activeId.value = paneIds(next)[0] ?? '';
      return true;
    }

    function startRename(id: string) {
      if (panes.value[id]) renamingId.value = id;
    }

    function rename(id: string, name: string) {
      renamingId.value = null;
      const pane = panes.value[id];
      if (!pane) return;
      const trimmed = name.trim();
      if (trimmed) pane.name = trimmed;
      else delete pane.name;
    }

    function setCwd(id: string, cwd: string) {
      const pane = panes.value[id];
      if (pane) pane.cwd = cwd;
    }

    function setTitle(id: string, title: string) {
      const pane = panes.value[id];
      if (pane) pane.terminalTitle = title;
    }

    function setCommand(id: string, command: string | null) {
      const pane = panes.value[id];
      if (!pane) return;
      const trimmed = command?.trim() ?? '';
      if (trimmed) pane.command = trimmed;
      else delete pane.command;
    }

    function setAgent(id: string, agent: AgentState | null) {
      const pane = panes.value[id];
      if (!pane) return;
      if (agent) pane.agent = { ...agent };
      else delete pane.agent;
    }

    function focus(id: string) {
      if (panes.value[id]) activeId.value = id;
    }

    function resize(splitId: string, ratio: number) {
      root.value = setRatio(root.value, splitId, ratio);
    }

    function move(sourceId: string, targetId: string, zone: DropZone): boolean {
      if (sourceId === targetId || !panes.value[sourceId] || !panes.value[targetId]) return false;

      const usedIds = new Set<string>();
      function collectIds(node: LayoutNode) {
        usedIds.add(node.id);
        if (node.kind === 'split') {
          collectIds(node.first);
          collectIds(node.second);
        }
      }
      collectIds(root.value);
      let splitId = nextId();
      while (usedIds.has(splitId)) splitId = nextId();

      const next = movePane(root.value, sourceId, targetId, zone, splitId);
      if (next === root.value) return false;
      root.value = next;
      activeId.value = sourceId;
      return true;
    }

    function reset(cwd: string) {
      root.value = { kind: 'pane', id: firstId };
      panes.value = { [firstId]: { id: firstId, historyId: historyId(), startCwd: cwd, cwd } };
      activeId.value = firstId;
      renamingId.value = null;
    }

    function snapshot(): WorkspaceSnapshot {
      return createWorkspaceSnapshot(root.value, panes.value, activeId.value);
    }

    function restore(workspace: WorkspaceSnapshot): boolean {
      const ids = paneIds(workspace.root);
      if (!ids.length || !ids.includes(workspace.activeId)) return false;
      if (ids.some((id) => !workspace.panes[id])) return false;

      root.value = workspace.root;
      panes.value = Object.fromEntries(
        ids.map((id) => {
          const pane = workspace.panes[id];
          const restoredPane: PaneState = {
            id,
            historyId: pane?.historyId ?? historyId(),
            ...(pane?.startCwd ? { startCwd: pane.startCwd } : {}),
            ...(pane?.cwd ? { cwd: pane.cwd } : {}),
            ...(pane?.name ? { name: pane.name } : {}),
            ...(pane?.terminalTitle ? { terminalTitle: pane.terminalTitle } : {}),
            ...(pane?.agent ? { agent: { ...pane.agent } } : {}),
          };
          return [id, restoredPane];
        }),
      );
      activeId.value = workspace.activeId;
      renamingId.value = null;
      return true;
    }

    return {
      root,
      panes,
      activeId,
      renamingId,
      init,
      split,
      close,
      startRename,
      rename,
      setCwd,
      setTitle,
      setCommand,
      setAgent,
      focus,
      resize,
      move,
      reset,
      snapshot,
      restore,
    };
  });
}
