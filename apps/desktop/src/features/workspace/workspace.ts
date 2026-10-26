import { APP_SLUG } from '../../core/brand.ts';
import { paneIds, type LayoutNode } from '../layout/layout-tree.ts';
import type { PaneState } from '../layout/layout.store.ts';
import { parseAgentState, parseResumableAgent, type AgentState } from './agent.ts';

export const WORKSPACE_STORAGE_KEY = `${APP_SLUG}.workspace.v1`;
export const MAX_WORKSPACES = 24;

const MAX_PANES = 32;
const MAX_ID_LENGTH = 96;
const MAX_PATH_LENGTH = 4096;
const MAX_LABEL_LENGTH = 160;
const MAX_WORKSPACE_NAME_LENGTH = 80;

export interface WorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedPane {
  id: string;
  historyId?: string;
  startCwd?: string;
  cwd?: string;
  name?: string;
  terminalTitle?: string;
  agent?: AgentState;
}

export interface WorkspaceSnapshot {
  version: 1;
  root: LayoutNode;
  panes: Record<string, PersistedPane>;
  activeId: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  snapshot: WorkspaceSnapshot;
  updatedAt: number;
}

export interface WorkspaceCatalog {
  version: 1;
  activeId: string | null;
  workspaces: WorkspaceRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number, allowEmpty = false): string | undefined {
  if (typeof value !== 'string' || value.length > maxLength) return undefined;
  if (!allowEmpty && value.length === 0) return undefined;
  return value;
}

function workspaceName(value: unknown): string | undefined {
  const name = boundedString(value, MAX_WORKSPACE_NAME_LENGTH)?.trim();
  return name || undefined;
}

function safeHistoryId(value: unknown): string | undefined {
  const id = boundedString(value, MAX_ID_LENGTH);
  return id && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(id) ? id : undefined;
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
  if (value.historyId !== undefined) {
    const historyId = safeHistoryId(value.historyId);
    if (!historyId) return null;
    pane.historyId = historyId;
  }
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
  if (value.agent !== undefined) {
    const agent = parseAgentState(value.agent);
    if (!agent) return null;
    // Older catalogs stored agents without an ID; they are not restorable.
    const resumable = parseResumableAgent(agent);
    if (resumable) pane.agent = resumable;
  }
  return pane;
}

function parseSnapshot(value: unknown): WorkspaceSnapshot | null {
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

export function parseWorkspaceCatalog(value: unknown): WorkspaceCatalog | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.workspaces)) return null;
  if (value.workspaces.length > MAX_WORKSPACES) return null;
  const ids = new Set<string>();
  const workspaces: WorkspaceRecord[] = [];
  for (const item of value.workspaces) {
    if (!isRecord(item)) return null;
    const id = boundedString(item.id, MAX_ID_LENGTH);
    const name = workspaceName(item.name);
    const snapshot = parseSnapshot(item.snapshot);
    if (!id || ids.has(id) || !name || !snapshot) return null;
    if (typeof item.updatedAt !== 'number' || !Number.isFinite(item.updatedAt)) return null;
    ids.add(id);
    workspaces.push({ id, name, snapshot, updatedAt: item.updatedAt });
  }
  const activeId = value.activeId === null ? null : boundedString(value.activeId, MAX_ID_LENGTH);
  if (activeId === undefined) return null;
  if (activeId !== null && !ids.has(activeId)) return null;
  return { version: 1, activeId, workspaces };
}

export function createWorkspaceCatalog(): WorkspaceCatalog {
  return { version: 1, activeId: null, workspaces: [] };
}

export function createWorkspaceRecord(
  id: string,
  name: string,
  snapshot: WorkspaceSnapshot,
  updatedAt = Date.now(),
): WorkspaceRecord {
  const normalizedId = boundedString(id, MAX_ID_LENGTH);
  const normalizedName = workspaceName(name);
  if (!normalizedId || !normalizedName) throw new Error('invalid workspace identity');
  return { id: normalizedId, name: normalizedName, snapshot, updatedAt };
}

export function createWorkspaceId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

export function createWorkspaceSnapshot(
  root: LayoutNode,
  panes: Record<string, PaneState>,
  activeId: string,
): WorkspaceSnapshot {
  const ids = paneIds(root);
  const persistedPanes: Record<string, PersistedPane> = {};
  for (const id of ids) {
    const pane = panes[id];
    if (!pane) continue;
    const cwd =
      boundedString(pane.cwd, MAX_PATH_LENGTH) ?? boundedString(pane.startCwd, MAX_PATH_LENGTH);
    const name = boundedString(pane.name, MAX_LABEL_LENGTH);
    const terminalTitle = boundedString(pane.terminalTitle, MAX_LABEL_LENGTH);
    const historyId = safeHistoryId(pane.historyId);
    const agent = pane.agent ? parseResumableAgent(pane.agent) : null;
    persistedPanes[id] = {
      id,
      ...(historyId ? { historyId } : {}),
      ...(cwd ? { startCwd: cwd, cwd } : {}),
      ...(name ? { name } : {}),
      ...(terminalTitle ? { terminalTitle } : {}),
      ...(agent ? { agent } : {}),
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

export function syncActiveWorkspace(
  catalog: WorkspaceCatalog,
  snapshot: WorkspaceSnapshot,
  updatedAt = Date.now(),
): WorkspaceCatalog | null {
  const active = findWorkspace(catalog, catalog.activeId);
  if (!active) return null;
  return upsertWorkspace(catalog, { ...active, snapshot, updatedAt });
}

export function findWorkspace(
  catalog: WorkspaceCatalog,
  id: string | null,
): WorkspaceRecord | undefined {
  return id ? catalog.workspaces.find((workspace) => workspace.id === id) : undefined;
}

export function upsertWorkspace(
  catalog: WorkspaceCatalog,
  workspace: WorkspaceRecord,
): WorkspaceCatalog {
  const index = catalog.workspaces.findIndex(({ id }) => id === workspace.id);
  const workspaces = [...catalog.workspaces];
  if (index === -1) workspaces.push(workspace);
  else workspaces[index] = workspace;
  return { ...catalog, workspaces };
}

export function setActiveWorkspace(catalog: WorkspaceCatalog, id: string | null): WorkspaceCatalog {
  if (id !== null && !catalog.workspaces.some((workspace) => workspace.id === id)) return catalog;
  return { ...catalog, activeId: id };
}

export function deleteWorkspace(catalog: WorkspaceCatalog, id: string): WorkspaceCatalog {
  return {
    ...catalog,
    activeId: catalog.activeId === id ? null : catalog.activeId,
    workspaces: catalog.workspaces.filter((workspace) => workspace.id !== id),
  };
}

export function reconcileWorkspaceCatalog(
  current: WorkspaceCatalog,
  fromDisk: WorkspaceCatalog,
): WorkspaceCatalog {
  const activeId = current.activeId;
  const activeWorkspace = activeId ? findWorkspace(current, activeId) : undefined;

  const workspaces = fromDisk.workspaces.map((diskWorkspace) => {
    if (activeWorkspace && diskWorkspace.id === activeId) {
      if (activeWorkspace.updatedAt >= diskWorkspace.updatedAt) {
        return activeWorkspace;
      }
    }
    return diskWorkspace;
  });

  if (activeWorkspace && !workspaces.some((w) => w.id === activeId)) {
    workspaces.push(activeWorkspace);
  }

  const nextActiveId = activeId && workspaces.some((w) => w.id === activeId) ? activeId : null;

  return {
    version: 1,
    activeId: nextActiveId,
    workspaces,
  };
}

export function loadWorkspaceCatalog(storage: WorkspaceStorage): WorkspaceCatalog | null {
  let raw: string | null;
  try {
    raw = storage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const catalog = parseWorkspaceCatalog(JSON.parse(raw));
    if (catalog) return catalog;
  } catch {
    // Corrupt local data should never prevent the terminal from opening.
  }
  try {
    storage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // The storage may be read-only or unavailable; there is nothing else to do.
  }
  return null;
}

export function saveWorkspaceCatalog(
  storage: WorkspaceStorage,
  catalog: WorkspaceCatalog,
): boolean {
  if (!parseWorkspaceCatalog(catalog)) return false;
  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(catalog));
    return true;
  } catch {
    return false;
  }
}
