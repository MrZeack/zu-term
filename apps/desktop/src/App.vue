<script setup lang="ts">
import { homeDir } from '@tauri-apps/api/path';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { ask } from '@tauri-apps/plugin-dialog';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useLayoutStore, useWorkspaceOperationStore } from './core/app-stores.ts';
import { APP_NAME, APP_VERSION } from './core/brand.ts';
import { UI_DENSITY } from './core/ui-density.ts';
import { configClient } from './features/config/config-client.ts';
import { createConfigFile, parseConfigFile } from './features/config/config.ts';
import { paneMenuItems } from './features/context-menu/menu-items.ts';
import { showPaneMenu } from './features/context-menu/pane-menu.ts';
import type { ContextMenuPosition } from './features/context-menu/position.ts';
import LayoutView from './features/layout/LayoutView.vue';
import { createPaneActions } from './features/pane-actions/pane-actions.ts';
import { paneTitle, shortPath } from './features/pane-header/pane-title.ts';
import { shortcutAction } from './features/shortcuts/shortcuts.ts';
import StatusBar from './features/status/StatusBar.vue';
import type { StatusPane } from './features/status/status.ts';
import { initialCwd, localHostname } from './features/terminal/pty-client.ts';
import { terminals } from './features/terminal/terminal-registry.ts';
import {
  splitToolbarActions,
  type SplitToolbarAction,
} from './features/toolbar/toolbar-actions.ts';
import FontMenu from './features/toolbar/FontMenu.vue';
import {
  clampFontSize,
  DEFAULT_TERMINAL_FONT_ID,
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  type TerminalFontId,
} from './features/terminal/terminal-font.ts';
import {
  THEME_CHANGE_EVENT,
  loadTheme,
  nextTheme,
  type ThemeName,
} from './features/theme/theme.ts';
import WorkspaceMenu from './features/workspace/WorkspaceMenu.vue';
import WorkspaceNameDialog from './features/workspace/WorkspaceNameDialog.vue';
import { workspaceLockClient } from './features/workspace/workspace-lock-client.ts';
import { createWorkspaceSession } from './features/workspace/workspace-session.ts';
import {
  createWorkspaceCatalog,
  createWorkspaceId,
  createWorkspaceRecord,
  deleteWorkspace as removeWorkspace,
  findWorkspace,
  loadWorkspaceCatalog,
  MAX_WORKSPACES,
  setActiveWorkspace,
  syncActiveWorkspace,
  upsertWorkspace,
  type WorkspaceCatalog,
} from './features/workspace/workspace.ts';

const store = useLayoutStore();
const workspaceOperation = useWorkspaceOperationStore();
const appWindow = getCurrentWindow();
const home = ref<string>();
const localHost = ref<string>();
const ready = ref(false);
const theme = ref<ThemeName>('cyan');
const fontFamily = ref<TerminalFontId>(DEFAULT_TERMINAL_FONT_ID);
const fontSize = ref<number>(DEFAULT_TERMINAL_FONT_SIZE);
const closePromptVisible = ref(false);
const workspaceCatalog = ref<WorkspaceCatalog>(createWorkspaceCatalog());
const workspaceDialogVisible = ref(false);
const workspaceDialogMode = ref<'new' | 'save'>('new');
const workspaceError = ref<string>();
const layoutRevision = ref(0);
const terminalSizes = ref<Record<string, { cols: number; rows: number }>>({});
const isMac = navigator.userAgent.includes('Mac');
const splitActions = splitToolbarActions(isMac);
const themeLabel = computed(() => (theme.value === 'cyan' ? 'Cian' : 'Menta'));
const paneCount = computed(() => Object.keys(store.panes).length);
const activeWorkspaceName = computed(
  () => findWorkspace(workspaceCatalog.value, workspaceCatalog.value.activeId)?.name,
);
const statusPane = computed<StatusPane | undefined>(() => {
  const pane = store.panes[store.activeId];
  if (!pane) return undefined;
  const size = terminalSizes.value[store.activeId];
  return {
    title: paneTitle(pane),
    path: shortPath(pane.cwd, home.value, 160),
    ...(pane.cwd ? { fullPath: pane.cwd } : {}),
    ...(pane.command ? { command: pane.command } : {}),
    ...(pane.agent ? { agent: pane.agent } : {}),
    ...(size ? { cols: size.cols, rows: size.rows } : {}),
  };
});
const workspaceDialogTitle = computed(() =>
  workspaceDialogMode.value === 'new' ? 'Nuevo workspace' : 'Guardar workspace',
);
const workspaceDialogDescription = computed(() =>
  workspaceDialogMode.value === 'new'
    ? 'Crea un espacio para guardar esta distribución y sus agentes.'
    : 'Asigna un nombre al workspace actual para poder restaurarlo después.',
);
const densityStyle = {
  '--toolbar-height': `${UI_DENSITY.toolbarHeight}px`,
  '--toolbar-font-size': `${UI_DENSITY.toolbarFontSize}px`,
};
let allowWindowClose = false;
let unlistenClose: (() => void) | undefined;
let workspaceMutationSuspended = 0;

const actions = createPaneActions({
  store,
  terminal: terminals.get,
  clipboard: { readText, writeText },
  confirmPaste: (lines) =>
    ask(`Vas a pegar ${lines} líneas; cada una puede ejecutarse como comando.`, {
      title: 'Pegar varias líneas',
      kind: 'warning',
      okLabel: 'Pegar',
      cancelLabel: 'Cancelar',
    }),
  closeWindow: () => appWindow.close(),
});

const report = (error: unknown) => console.error(error);

const session = createWorkspaceSession({
  writeConfig: configClient.write,
  locks: workspaceLockClient,
  onError: (message, error) => {
    workspaceError.value = message;
    if (error !== undefined) report(error);
  },
});

function onKeydown(event: KeyboardEvent) {
  const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (mod && !event.altKey) {
    if (event.key === '=' || event.key === '+') {
      event.preventDefault();
      event.stopPropagation();
      increaseFontSize();
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      event.stopPropagation();
      decreaseFontSize();
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      event.stopPropagation();
      resetFontSize();
      return;
    }
  }

  const action = shortcutAction(event, isMac);
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  actions.run(action, store.activeId).catch(report);
}

function openMenu(paneId: string, position: ContextMenuPosition) {
  const hasSelection = Boolean(terminals.get(paneId)?.getSelection());
  showPaneMenu(
    paneMenuItems({ hasSelection }),
    (action) => {
      actions.run(action, paneId).catch(report);
    },
    position,
  ).catch(report);
}

function persistConfig(
  catalog: WorkspaceCatalog,
  nextTheme: ThemeName,
  nextFontId: TerminalFontId = fontFamily.value,
  nextFontSize: number = fontSize.value,
): Promise<boolean> {
  return session.persist(
    JSON.stringify(createConfigFile(nextTheme, catalog, nextFontId, nextFontSize)),
  );
}

async function setTheme(next: ThemeName) {
  theme.value = next;
  document.documentElement.dataset.theme = next;
  await persistConfig(workspaceCatalog.value, next, fontFamily.value, fontSize.value);
  window.dispatchEvent(new CustomEvent<ThemeName>(THEME_CHANGE_EVENT, { detail: next }));
}

function toggleTheme() {
  void setTheme(nextTheme(theme.value));
}

async function setFontFamily(next: TerminalFontId) {
  fontFamily.value = next;
  await persistConfig(workspaceCatalog.value, theme.value, next, fontSize.value);
}

async function setFontSize(next: number) {
  const clamped = clampFontSize(next);
  if (clamped === fontSize.value) return;
  fontSize.value = clamped;
  await persistConfig(workspaceCatalog.value, theme.value, fontFamily.value, clamped);
}

function increaseFontSize() {
  void setFontSize(fontSize.value + 1);
}

function decreaseFontSize() {
  void setFontSize(fontSize.value - 1);
}

function resetFontSize() {
  void setFontSize(DEFAULT_TERMINAL_FONT_SIZE);
}

function runToolbarAction(action: SplitToolbarAction['id']) {
  actions.run(action, store.activeId).catch(report);
}

function onPaneSize(paneId: string, cols: number, rows: number) {
  terminalSizes.value[paneId] = { cols, rows };
}

async function persistCatalog(next: WorkspaceCatalog): Promise<boolean> {
  if (!(await persistConfig(next, theme.value))) return false;
  workspaceCatalog.value = next;
  workspaceError.value = undefined;
  return true;
}

function persistActiveWorkspaceSnapshot() {
  if (!ready.value || workspaceMutationSuspended > 0) return;
  const next = syncActiveWorkspace(workspaceCatalog.value, store.snapshot());
  if (!next) return;
  void persistCatalog(next);
}

async function saveCurrentWorkspace(name?: string): Promise<boolean> {
  const current = findWorkspace(workspaceCatalog.value, workspaceCatalog.value.activeId);
  if (!current && workspaceCatalog.value.workspaces.length >= MAX_WORKSPACES) {
    workspaceError.value = `Ya existen ${MAX_WORKSPACES} workspaces. Elimina uno antes de guardar otro.`;
    return false;
  }
  const id = current?.id ?? createWorkspaceId();
  const ownsNewLock = !current;
  if (ownsNewLock && !(await session.acquire(id))) return false;
  const workspace = createWorkspaceRecord(
    id,
    name ?? current?.name ?? 'Workspace principal',
    store.snapshot(),
  );
  let next = upsertWorkspace(workspaceCatalog.value, workspace);
  next = setActiveWorkspace(next, id);
  if (await persistCatalog(next)) {
    if (ownsNewLock) await session.claim(id);
    return true;
  }
  if (ownsNewLock) await session.release(id);
  return false;
}

function openWorkspaceDialog(mode: 'new' | 'save') {
  workspaceError.value = undefined;
  workspaceDialogMode.value = mode;
  workspaceDialogVisible.value = true;
}

async function saveWorkspaceFromMenu() {
  if (
    workspaceCatalog.value.activeId &&
    findWorkspace(workspaceCatalog.value, workspaceCatalog.value.activeId)
  ) {
    await saveCurrentWorkspace();
  } else {
    openWorkspaceDialog('save');
  }
}

async function createNewWorkspace(name: string): Promise<boolean> {
  if (workspaceCatalog.value.workspaces.length >= MAX_WORKSPACES) {
    workspaceError.value = `Ya existen ${MAX_WORKSPACES} workspaces. Elimina uno antes de crear otro.`;
    return false;
  }
  if (workspaceCatalog.value.activeId && !(await saveCurrentWorkspace())) return false;
  const id = createWorkspaceId();
  if (!(await session.acquire(id))) return false;
  workspaceMutationSuspended += 1;
  try {
    const previousSnapshot = store.snapshot();
    const cwd = store.panes[store.activeId]?.cwd ?? home.value ?? '/';
    store.reset(cwd);
    layoutRevision.value += 1;
    const workspace = createWorkspaceRecord(id, name, store.snapshot());
    let next = upsertWorkspace(workspaceCatalog.value, workspace);
    next = setActiveWorkspace(next, workspace.id);
    if (await persistCatalog(next)) {
      await session.claim(id);
      return true;
    }
    store.restore(previousSnapshot);
    layoutRevision.value += 1;
    await session.release(id);
    return false;
  } finally {
    workspaceMutationSuspended -= 1;
  }
}

async function submitWorkspaceName(name: string) {
  const saved =
    workspaceDialogMode.value === 'new'
      ? await createNewWorkspace(name)
      : await saveCurrentWorkspace(name);
  if (saved) workspaceDialogVisible.value = false;
}

async function restoreWorkspace(id: string) {
  const workspace = findWorkspace(workspaceCatalog.value, id);
  if (!workspace || workspaceCatalog.value.activeId === id) return;
  if (!workspaceOperation.begin('restore', id)) return;
  if (!(await session.acquire(id))) {
    workspaceOperation.finish();
    return;
  }
  let switched = false;
  try {
    if (workspaceCatalog.value.activeId && !(await saveCurrentWorkspace())) return;
    workspaceMutationSuspended += 1;
    try {
      const previousSnapshot = store.snapshot();
      if (!store.restore(workspace.snapshot)) return;
      const restoredWorkspace = { ...workspace, snapshot: store.snapshot() };
      const next = setActiveWorkspace(
        upsertWorkspace(workspaceCatalog.value, restoredWorkspace),
        id,
      );
      if (!(await persistCatalog(next))) {
        store.restore(previousSnapshot);
        return;
      }
      await session.claim(id);
      switched = true;
      layoutRevision.value += 1;
    } finally {
      workspaceMutationSuspended -= 1;
    }
  } finally {
    if (!switched) await session.release(id);
    workspaceOperation.finish();
  }
}

async function deleteWorkspace(id: string) {
  const workspace = findWorkspace(workspaceCatalog.value, id);
  if (!workspace) return;
  const confirmed = await ask(`Se eliminará el workspace “${workspace.name}”.`, {
    title: 'Eliminar workspace',
    kind: 'warning',
    okLabel: 'Eliminar',
    cancelLabel: 'Cancelar',
  });
  if (!confirmed) return;
  const wasActive = workspaceCatalog.value.activeId === id;
  if (!(await persistCatalog(removeWorkspace(workspaceCatalog.value, id)))) return;
  if (wasActive) {
    await session.release(id);
    store.reset(store.panes[store.activeId]?.cwd ?? home.value ?? '/');
    layoutRevision.value += 1;
  }
}

function cancelClose() {
  closePromptVisible.value = false;
}

async function finishClose(restore: boolean) {
  workspaceError.value = undefined;
  if (workspaceOperation.busy) return;
  if (restore) {
    if (!(await saveCurrentWorkspace())) return;
  } else {
    const next = setActiveWorkspace(workspaceCatalog.value, null);
    if (!(await persistCatalog(next))) return;
  }
  if (!(await session.releaseAll())) return;
  closePromptVisible.value = false;
  allowWindowClose = true;
  try {
    await appWindow.close();
  } catch (error) {
    allowWindowClose = false;
    report(error);
  }
}

onMounted(async () => {
  // Capture phase: runs before xterm handles the key.
  window.addEventListener('keydown', onKeydown, true);
  try {
    unlistenClose = await appWindow.onCloseRequested((event) => {
      if (allowWindowClose) return;
      event.preventDefault();
      closePromptVisible.value = true;
    });
  } catch (error) {
    report(error);
  }
  try {
    const [homePath, hostname, launchCwd] = await Promise.all([
      homeDir(),
      localHostname(),
      initialCwd(),
    ]);
    let rawConfig: string | null = null;
    let configRead = true;
    try {
      rawConfig = await configClient.read();
    } catch (error) {
      configRead = false;
      report(error);
    }
    const config = parseConfigFile(rawConfig);
    theme.value = config?.theme ?? loadTheme(window.localStorage);
    fontFamily.value = config?.fontFamily ?? DEFAULT_TERMINAL_FONT_ID;
    fontSize.value = config?.fontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
    document.documentElement.dataset.theme = theme.value;
    home.value = homePath;
    localHost.value = hostname;
    const catalog =
      config?.catalog ?? loadWorkspaceCatalog(window.localStorage) ?? createWorkspaceCatalog();
    const startupCatalog = setActiveWorkspace(catalog, null);
    workspaceCatalog.value = startupCatalog;
    store.init(launchCwd ?? homePath);
    if (configRead && !config) {
      void persistConfig(startupCatalog, theme.value, fontFamily.value, fontSize.value);
    } else if (configRead && catalog.activeId !== null) {
      void persistConfig(startupCatalog, theme.value, fontFamily.value, fontSize.value);
    }
  } catch (error) {
    report(error);
  }
  ready.value = true;
});

watch(
  [() => store.root, () => store.panes, () => store.activeId],
  () => persistActiveWorkspaceSnapshot(),
  { deep: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true);
  unlistenClose?.();
});
</script>

<template>
  <main class="app-shell" :style="densityStyle">
    <header class="app-toolbar" :aria-label="`Barra de herramientas de ${APP_NAME}`">
      <div class="brand" :aria-label="APP_NAME">
        <span class="brand-name">{{ APP_NAME }}</span>
        <span class="brand-version">v{{ APP_VERSION }}</span>
      </div>
      <WorkspaceMenu
        :active-id="workspaceCatalog.activeId"
        :workspaces="workspaceCatalog.workspaces"
        :error="workspaceError"
        :busy="workspaceOperation.busy"
        @save="saveWorkspaceFromMenu"
        @new="openWorkspaceDialog('new')"
        @select="restoreWorkspace"
        @delete="deleteWorkspace"
      />
      <div class="toolbar-spacer" />
      <FontMenu :model-value="fontFamily" @update:model-value="setFontFamily" />
      <div class="font-size-control" role="group" aria-label="Tamaño de fuente de terminal">
        <button
          class="font-size-btn"
          type="button"
          :disabled="fontSize <= MIN_TERMINAL_FONT_SIZE"
          aria-label="Disminuir tamaño de fuente"
          :title="`Disminuir tamaño de fuente (${isMac ? '⌘-' : 'Ctrl+-'})`"
          @click="decreaseFontSize"
        >
          <span aria-hidden="true">−</span>
        </button>
        <span
          class="font-size-value"
          :title="`Tamaño de fuente: ${fontSize}px (${isMac ? '⌘0' : 'Ctrl+0'} restablecer)`"
        >
          {{ fontSize }}px
        </span>
        <button
          class="font-size-btn"
          type="button"
          :disabled="fontSize >= MAX_TERMINAL_FONT_SIZE"
          aria-label="Aumentar tamaño de fuente"
          :title="`Aumentar tamaño de fuente (${isMac ? '⌘+' : 'Ctrl++'})`"
          @click="increaseFontSize"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <nav class="toolbar-actions" aria-label="Acciones de split">
        <button
          v-for="action in splitActions"
          :key="action.id"
          class="toolbar-action"
          type="button"
          :aria-label="`${action.label} · ${action.shortcut}`"
          :title="`${action.label} · ${action.shortcut}`"
          @click="runToolbarAction(action.id)"
        >
          <span class="split-icon" :class="`split-icon--${action.direction}`" aria-hidden="true" />
          <span class="toolbar-action__label">{{
            action.direction === 'right' ? 'Derecha' : 'Abajo'
          }}</span>
        </button>
      </nav>
      <button
        class="theme-toggle"
        type="button"
        :aria-label="`Cambiar acento de color (actual ${themeLabel})`"
        :title="`Cambiar acento · ${themeLabel}`"
        @click="toggleTheme"
      >
        <span class="theme-swatch" aria-hidden="true"><i /><i /></span>
        <span class="theme-copy"
          ><small>ACENTO</small><strong>{{ themeLabel }}</strong></span
        >
        <span class="theme-switch" aria-hidden="true">⇄</span>
      </button>
    </header>
    <LayoutView
      v-if="ready"
      :key="layoutRevision"
      class="layout-view"
      :home="home"
      :local-host="localHost"
      :theme="theme"
      :font-family="fontFamily"
      :font-size="fontSize"
      @menu="openMenu"
      @size="onPaneSize"
      @exit="(paneId) => actions.run('close', paneId).catch(report)"
      @paste="(paneId, text) => actions.pasteText(paneId, text).catch(report)"
    />
    <StatusBar :workspace-name="activeWorkspaceName" :pane="statusPane" :pane-count="paneCount" />
    <div
      v-if="closePromptVisible"
      class="modal-backdrop"
      role="presentation"
      @click.self="cancelClose"
      @keydown.esc="cancelClose"
    >
      <section
        class="close-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-dialog-title"
        aria-describedby="close-dialog-description"
      >
        <span class="dialog-kicker">SALIR DE {{ APP_NAME.toUpperCase() }}</span>
        <h2 id="close-dialog-title">¿Cerrar la aplicación?</h2>
        <p id="close-dialog-description">
          Puedes guardar el workspace actual y volver a abrir sus splits, carpetas y agentes.
        </p>
        <div class="close-dialog__actions">
          <button class="dialog-button dialog-button--quiet" type="button" @click="cancelClose">
            Cancelar
          </button>
          <button class="dialog-button" type="button" @click="finishClose(false)">
            Cerrar sin guardar workspace
          </button>
          <button
            class="dialog-button dialog-button--primary"
            type="button"
            @click="finishClose(true)"
          >
            Cerrar y guardar workspace
          </button>
          <p v-if="workspaceError" class="workspace-error" role="alert">{{ workspaceError }}</p>
        </div>
      </section>
    </div>
    <WorkspaceNameDialog
      :visible="workspaceDialogVisible"
      :title="workspaceDialogTitle"
      :description="workspaceDialogDescription"
      :error="workspaceError"
      @cancel="workspaceDialogVisible = false"
      @submit="submitWorkspaceName"
    />
  </main>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: radial-gradient(circle at 0 0, var(--accent-soft), transparent 28%), var(--bg);
}

.app-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 var(--toolbar-height);
  min-height: var(--toolbar-height);
  padding: 0 10px;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  user-select: none;
  font-size: var(--toolbar-font-size);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.brand-name {
  color: var(--text);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.brand-version {
  color: var(--muted);
  font-family: Menlo, monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.workspace-error {
  margin: 10px 0 0;
  color: var(--danger, #ff8c8c) !important;
  font-size: 11px !important;
}

.toolbar-spacer {
  flex: 1;
}

.font-size-control {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 3px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--header-bg);
}

.font-size-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 6px;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  transition:
    background 120ms ease,
    color 120ms ease;
}

.font-size-btn:hover:not(:disabled) {
  background: var(--accent-soft);
  color: var(--accent);
}

.font-size-btn:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: 1px;
}

.font-size-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.font-size-value {
  min-width: 32px;
  padding: 0 3px;
  color: var(--text);
  font-family: Menlo, monospace;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  user-select: none;
}

.toolbar-actions {
  display: inline-flex;
  gap: 5px;
}

.toolbar-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 6px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--muted);
  background: var(--header-bg);
  cursor: pointer;
  font: inherit;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.toolbar-action:hover {
  border-color: var(--accent);
  color: var(--text);
  background: var(--accent-soft);
  transform: translateY(-1px);
}

.toolbar-action:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: 2px;
}

.toolbar-action__label {
  font-size: 10px;
  font-weight: 700;
}

.split-icon {
  position: relative;
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 1px solid currentColor;
  border-radius: 4px;
}

.split-icon::after {
  position: absolute;
  background: currentColor;
  content: '';
}

.split-icon--right::after {
  top: 2px;
  bottom: 2px;
  left: 50%;
  width: 1px;
}

.split-icon--down::after {
  top: 50%;
  right: 2px;
  left: 2px;
  height: 1px;
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 92px;
  padding: 4px 6px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: var(--header-bg);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    transform 140ms ease;
}

.theme-toggle:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  transform: translateY(-1px);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: 2px;
}

.theme-swatch {
  display: inline-flex;
  gap: 3px;
}

.theme-swatch i {
  width: 6px;
  height: 13px;
  border-radius: 5px;
  background: var(--accent);
}

.theme-swatch i:last-child {
  margin-top: 3px;
  background: var(--accent-alt);
}

.theme-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1;
}

.theme-copy small {
  color: var(--muted);
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.11em;
}

.theme-copy strong {
  font-size: 10px;
}

.theme-switch {
  margin-left: auto;
  color: var(--accent-alt);
  font-size: 14px;
  line-height: 1;
}

.layout-view {
  flex: 1;
  min-height: 0;
}

.modal-backdrop {
  position: fixed;
  z-index: 10;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(4, 9, 12, 0.72);
  backdrop-filter: blur(6px);
}

.close-dialog {
  width: min(480px, 100%);
  padding: 24px;
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  background: var(--header-bg);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
}

.dialog-kicker {
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.close-dialog h2 {
  margin: 8px 0 8px;
  font-size: 21px;
}

.close-dialog p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.close-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}

.dialog-button {
  padding: 8px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text);
  background: var(--pane-bg);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.dialog-button:hover,
.dialog-button:focus-visible {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.dialog-button:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: 2px;
}

.dialog-button--quiet {
  color: var(--muted);
}

.dialog-button--primary {
  border-color: var(--accent);
  color: #031317;
  background: linear-gradient(135deg, var(--accent), var(--accent-alt));
}

.dialog-button--primary:hover,
.dialog-button--primary:focus-visible {
  color: #031317;
  background: linear-gradient(135deg, var(--accent-alt), var(--accent));
}

@media (max-width: 680px) {
  .app-toolbar {
    padding: 0 8px;
  }

  .toolbar-action__label {
    display: none;
  }

  .toolbar-action {
    padding: 6px;
  }
}
</style>
