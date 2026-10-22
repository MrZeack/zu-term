import { paneIds, type LayoutNode } from '../layout/layout-tree.ts';
import type { PaneState } from '../layout/layout.store.ts';

export const SESSION_STORAGE_KEY = 'zylo.session.v1';

const MAX_PANES = 32;
const MAX_ID_LENGTH = 96;
const MAX_PATH_LENGTH = 4096;
const MAX_LABEL_LENGTH = 160;

export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedPane {
  id: string;
  startCwd?: string;
  cwd?: string;
  name?: string;
  terminalTitle?: string;
}

export interface SessionSnapshot {
  version: 1;
  root: LayoutNode;
  panes: Record<string, PersistedPane>;
  activeId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number, allowEmpty = false): string | undefined {
  if (typeof value !== 'string' || value.length > maxLength) return undefined;
  if (!allowEmpty && value.length === 0) return undefined;
  return value;
}

function cloneLayout(node: LayoutNode): LayoutNode {
  if (node.kind === 'pane') return { kind: 'pane', id: node.id };
  return {
    kind: 'split',
    id: node.id,
    direction: node.direction,
    ratio: node.ratio,
    first: cloneLayout(node.first),
    second: cloneLayout(node.second),
  };
}

function parseLayout(
  value: unknown,
  usedIds: Set<string>,
  leafIds: Set<string>,
  depth = 0,
): LayoutNode | null {
  if (!isRecord(value) || depth > MAX_PANES) return null;
  const id = boundedString(value.id, MAX_ID_LENGTH);
  if (!id || usedIds.has(id)) return null;
  usedIds.add(id);

  if (value.kind === 'pane') {
    if (leafIds.size >= MAX_PANES) return null;
    leafIds.add(id);
    return { kind: 'pane', id };
  }

  if (value.kind !== 'split' || (value.direction !== 'row' && value.direction !== 'column')) {
    return null;
  }
  if (typeof value.ratio !== 'number' || !Number.isFinite(value.ratio)) return null;
  if (value.ratio < 0.1 || value.ratio > 0.9) return null;

  const first = parseLayout(value.first, usedIds, leafIds, depth + 1);
  const second = parseLayout(value.second, usedIds, leafIds, depth + 1);
  if (!first || !second) return null;
  return { kind: 'split', id, direction: value.direction, ratio: value.ratio, first, second };
}

function parsePane(value: unknown, id: string): PersistedPane | null {
  if (!isRecord(value) || value.id !== id) return null;
  const pane: PersistedPane = { id };
  for (const [key, maxLength] of [
    ['startCwd', MAX_PATH_LENGTH],
    ['cwd', MAX_PATH_LENGTH],
    ['name', MAX_LABEL_LENGTH],
    ['terminalTitle', MAX_LABEL_LENGTH],
  ] as const) {
    if (value[key] === undefined) continue;
    const text = boundedString(value[key], maxLength);
    if (!text) return null;
    pane[key] = text;
  }
  return pane;
}

function parseSnapshot(value: unknown): SessionSnapshot | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.panes)) return null;
  const usedIds = new Set<string>();
  const leafIds = new Set<string>();
  const root = parseLayout(value.root, usedIds, leafIds);
  if (!root || leafIds.size === 0 || leafIds.size > MAX_PANES) return null;

  const paneEntries = Object.entries(value.panes);
  if (paneEntries.length !== leafIds.size) return null;
  const panes: Record<string, PersistedPane> = {};
  for (const [id, paneValue] of paneEntries) {
    if (!leafIds.has(id)) return null;
    const pane = parsePane(paneValue, id);
    if (!pane) return null;
    panes[id] = pane;
  }

  const activeId = boundedString(value.activeId, MAX_ID_LENGTH);
  if (!activeId || !leafIds.has(activeId)) return null;
  return { version: 1, root, panes, activeId };
}

export function createSessionSnapshot(
  root: LayoutNode,
  panes: Record<string, PaneState>,
  activeId: string,
): SessionSnapshot {
  const ids = paneIds(root);
  const persistedPanes: Record<string, PersistedPane> = {};
  for (const id of ids) {
    const pane = panes[id];
    if (!pane) continue;
    const cwd = pane.cwd ?? pane.startCwd;
    persistedPanes[id] = {
      id,
      ...(cwd ? { startCwd: cwd, cwd } : {}),
      ...(pane.name ? { name: pane.name } : {}),
      ...(pane.terminalTitle ? { terminalTitle: pane.terminalTitle } : {}),
    };
  }

  const fallbackActiveId = ids[0] ?? activeId;
  return {
    version: 1,
    root: cloneLayout(root),
    panes: persistedPanes,
    activeId: ids.includes(activeId) ? activeId : fallbackActiveId,
  };
}

export function loadSession(storage: SessionStorage): SessionSnapshot | null {
  let raw: string | null;
  try {
    raw = storage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const snapshot = parseSnapshot(JSON.parse(raw));
    if (snapshot) return snapshot;
  } catch {
    // Corrupt local data should never prevent the terminal from opening.
  }
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // The storage may be read-only or unavailable; there is nothing else to do.
  }
  return null;
}

export function saveSession(storage: SessionStorage, snapshot: SessionSnapshot): boolean {
  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(storage: SessionStorage): void {
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Clearing a best-effort restore marker must not block app shutdown.
  }
}
