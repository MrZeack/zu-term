import { defineStore } from 'pinia';
import { ref } from 'vue';
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
}

export function createLayoutStore(nextId: () => string) {
  return defineStore('layout', () => {
    const firstId = nextId();
    const root = ref<LayoutNode>({ kind: 'pane', id: firstId });
    const panes = ref<Record<string, PaneState>>({ [firstId]: { id: firstId } });
    const activeId = ref(firstId);
    const renamingId = ref<string | null>(null);

    function init(cwd: string) {
      const pane = panes.value[firstId];
      if (pane) Object.assign(pane, { startCwd: cwd, cwd });
    }

    function split(sourceId: string, direction: Direction): string {
      const id = nextId();
      const cwd = panes.value[sourceId]?.cwd;
      root.value = splitPane(root.value, sourceId, direction, id, nextId());
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

    function focus(id: string) {
      if (panes.value[id]) activeId.value = id;
    }

    function resize(splitId: string, ratio: number) {
      root.value = setRatio(root.value, splitId, ratio);
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
      focus,
      resize,
    };
  });
}
