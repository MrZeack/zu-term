import { defineStore } from 'pinia';
import { ref } from 'vue';
import { createSessionSnapshot, type SessionSnapshot } from '../session/session.ts';
import {
  closePane,
  paneIds,
  setRatio,
  splitPane,
  type Direction,
  type LayoutNode,
} from './layout-tree.ts';

export interface PaneState {
  id: string;
  startCwd?: string;
  cwd?: string;
  name?: string;
  terminalTitle?: string;
  command?: string;
}

export function createLayoutStore(nextId: () => string) {
  return defineStore('layout', () => {
    const firstId = nextId();
    const root = ref<LayoutNode>({ kind: 'pane', id: firstId });
    const panes = ref<Record<string, PaneState>>({ [firstId]: { id: firstId } });
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
      panes.value[id] = cwd === undefined ? { id } : { id, startCwd: cwd, cwd };
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

    function focus(id: string) {
      if (panes.value[id]) activeId.value = id;
    }

    function resize(splitId: string, ratio: number) {
      root.value = setRatio(root.value, splitId, ratio);
    }

    function snapshot(): SessionSnapshot {
      return createSessionSnapshot(root.value, panes.value, activeId.value);
    }

    function restore(session: SessionSnapshot): boolean {
      const ids = paneIds(session.root);
      if (!ids.length || !ids.includes(session.activeId)) return false;
      if (ids.some((id) => !session.panes[id])) return false;

      root.value = session.root;
      panes.value = Object.fromEntries(
        ids.map((id) => {
          const pane = session.panes[id];
          const restoredPane: PaneState = {
            id,
            ...(pane?.startCwd ? { startCwd: pane.startCwd } : {}),
            ...(pane?.cwd ? { cwd: pane.cwd } : {}),
            ...(pane?.name ? { name: pane.name } : {}),
            ...(pane?.terminalTitle ? { terminalTitle: pane.terminalTitle } : {}),
          };
          return [id, restoredPane];
        }),
      );
      activeId.value = session.activeId;
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
      focus,
      resize,
      snapshot,
      restore,
    };
  });
}
