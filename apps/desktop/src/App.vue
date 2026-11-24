<script setup lang="ts">
import { homeDir } from '@tauri-apps/api/path';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { ask } from '@tauri-apps/plugin-dialog';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useErrorStore, useLayoutStore, useWorkspaceOperationStore } from './core/app-stores.ts';
import { UI_DENSITY } from './core/ui-density.ts';
import { configClient, WORKSPACES_UPDATED_EVENT } from './features/config/config-client.ts';
import { createConfigFile, parseConfigFile } from './features/config/config.ts';
import { paneMenuItems } from './features/context-menu/menu-items.ts';
import { showPaneMenu } from './features/context-menu/pane-menu.ts';
import type { ContextMenuPosition } from './features/context-menu/position.ts';
import ErrorArea from './features/errors/ErrorArea.vue';
import { gitClient } from './features/git/git-client.ts';
import { gitBranchMap, sameGitBranches, type GitDirectoryInfo } from './features/git/git.ts';
import LayoutView from './features/layout/LayoutView.vue';
import {
  createPaneActions,
  formatClosePaneConfirmation,
} from './features/pane-actions/pane-actions.ts';
import { paneTitle, shortPath } from './features/pane-header/pane-title.ts';
import { createVisibilityPoller } from './features/polling/window-polling.ts';
import {
  fontZoomAction,
  isCloseWindowShortcut,
  isQuitShortcut,
  shortcutAction,
} from './features/shortcuts/shortcuts.ts';
import StatusBar from './features/status/StatusBar.vue';
import { runProcessesClient } from './features/status/run-processes-client.ts';
import {
  sameRunProcesses,
  splitDirectories,
  type RunProcessInfo,
} from './features/status/run-processes.ts';
import type { StatusPane } from './features/status/status.ts';
import { initialCwd, localHostname } from './features/terminal/pty-client.ts';
import {
  clampFontSize,
  DEFAULT_TERMINAL_FONT_ID,
  DEFAULT_TERMINAL_FONT_SIZE,
  type TerminalFontId,
} from './features/terminal/terminal-font.ts';
import { terminals } from './features/terminal/terminal-registry.ts';
import {
  THEME_CHANGE_EVENT,
  loadTheme,
  nextTheme,
  type ThemeName,
} from './features/theme/theme.ts';
import AppToolbar from './features/toolbar/AppToolbar.vue';
import {
  splitToolbarActions,
  type SplitToolbarAction,
} from './features/toolbar/toolbar-actions.ts';
import CloseConfirmDialog from './features/workspace/CloseConfirmDialog.vue';
import WorkspaceNameDialog from './features/workspace/WorkspaceNameDialog.vue';
import { createWorkspaceController } from './features/workspace/workspace-controller.ts';
import { workspaceLockClient } from './features/workspace/workspace-lock-client.ts';
import { createWorkspaceSession } from './features/workspace/workspace-session.ts';
import {
  createWorkspaceCatalog,
  findWorkspace,
  loadWorkspaceCatalog,
  setActiveWorkspace,
  windowTitleForWorkspace,
  type WorkspaceCatalog,
} from './features/workspace/workspace.ts';

const store = useLayoutStore();
const workspaceOperation = useWorkspaceOperationStore();
const errorStore = useErrorStore();
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
const workspaceDialogMode = ref<'new' | 'save' | 'rename'>('new');
const renamingWorkspaceId = ref<string | null>(null);
const layoutRevision = ref(0);
const terminalSizes = ref<Record<string, { cols: number; rows: number }>>({});
const isMac = navigator.userAgent.includes('Mac');
const splitActions = splitToolbarActions(isMac);
const themeLabel = computed(() => (theme.value === 'cyan' ? 'Cian' : 'Menta'));
const paneCount = computed(() => Object.keys(store.panes).length);
const workspaceError = computed(() => errorStore.latestError?.message);
const activeWorkspaceName = computed(
  () => findWorkspace(workspaceCatalog.value, workspaceCatalog.value.activeId)?.name,
);
const windowTitle = computed(() => windowTitleForWorkspace(activeWorkspaceName.value));

const report = (error: unknown, fallback?: string) => {
  errorStore.report(error, fallback);
};

watch(
  windowTitle,
  (title) => {
    document.title = title;
    void appWindow.setTitle(title).catch(report);
  },
  { immediate: true },
);

const gitBranches = ref<Record<string, GitDirectoryInfo>>({});
const statusPane = computed<StatusPane | undefined>(() => {
  const pane = store.panes[store.activeId];
  if (!pane) return undefined;
  const size = terminalSizes.value[store.activeId];
  const paneCwd = pane.cwd ?? pane.startCwd;
  const gitInfo = paneCwd ? gitBranches.value[paneCwd] : undefined;
  return {
    title: paneTitle(pane),
    path: shortPath(pane.cwd, home.value, 160),
    ...(pane.cwd ? { fullPath: pane.cwd } : {}),
    ...(pane.command ? { command: pane.command } : {}),
    ...(pane.agent ? { agent: pane.agent } : {}),
    ...(gitInfo?.branch ? { branch: gitInfo.branch } : {}),
    ...(gitInfo?.status ? { gitStatus: gitInfo.status } : {}),
    ...(size ? { cols: size.cols, rows: size.rows } : {}),
  };
});

const runProcesses = ref<RunProcessInfo[]>([]);
const activeCwds = computed(() => splitDirectories(store.panes));
// A string only changes when the folders do, not on every pane update (e.g.
// a title spinner), so the watcher below does not re-query on those.
const activeCwdsKey = computed(() => activeCwds.value.join('\0'));

async function refreshRunProcesses() {
  const cwds = activeCwds.value;
  let next: RunProcessInfo[] = [];
  if (cwds.length > 0) {
    try {
      next = await runProcessesClient.detect(cwds);
    } catch {
      next = [];
    }
  }
  if (!sameRunProcesses(runProcesses.value, next)) runProcesses.value = next;
}

async function refreshGitBranches() {
  const cwds = activeCwds.value;
  let next: Record<string, GitDirectoryInfo> = {};
  if (cwds.length > 0) {
    try {
      const list = await gitClient.detect(cwds);
      next = gitBranchMap(list);
    } catch {
      next = {};
    }
  }
  if (!sameGitBranches(gitBranches.value, next)) gitBranches.value = next;
}

const statusPoller = createVisibilityPoller({
  intervalMs: 3000,
  isHidden: () => document.hidden,
  tick: async () => {
    await Promise.all([refreshRunProcesses(), refreshGitBranches()]);
  },
});

function onVisibilityChange() {
  statusPoller.onVisibilityChange();
}

watch(
  () => Object.keys(store.panes),
  (liveIds) => {
    const live = new Set(liveIds);
    for (const id of Object.keys(terminalSizes.value)) {
      if (!live.has(id)) delete terminalSizes.value[id];
    }
  },
);

const workspaceDialogInitialName = computed(() => {
  if (workspaceDialogMode.value === 'rename' && renamingWorkspaceId.value) {
    return findWorkspace(workspaceCatalog.value, renamingWorkspaceId.value)?.name ?? '';
  }
  if (workspaceDialogMode.value === 'save') {
    return activeWorkspaceName.value ?? '';
  }
  return '';
});
const workspaceDialogTitle = computed(() => {
  if (workspaceDialogMode.value === 'new') return 'Nuevo workspace';
  if (workspaceDialogMode.value === 'save') return 'Guardar workspace';
  return 'Renombrar workspace';
});
const workspaceDialogDescription = computed(() => {
  if (workspaceDialogMode.value === 'new') {
    return 'Crea un espacio para guardar esta distribución y sus agentes.';
  }
  if (workspaceDialogMode.value === 'save') {
    return 'Asigna un nombre al workspace actual para poder restaurarlo después.';
  }
  return 'Asigna un nuevo nombre a este workspace.';
});
const densityStyle = {
  '--toolbar-height': `${UI_DENSITY.toolbarHeight}px`,
  '--toolbar-font-size': `${UI_DENSITY.toolbarFontSize}px`,
};

let allowWindowClose = false;
let unlistenClose: (() => void) | undefined;
let unlistenRequestClose: UnlistenFn | undefined;
let unlistenWorkspaces: UnlistenFn | undefined;

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
  confirmClose: (target) => {
    const { title, message } = formatClosePaneConfirmation(target);
    return ask(message, {
      title,
      kind: 'warning',
      okLabel: 'Cerrar split',
      cancelLabel: 'Cancelar',
    });
  },
  closeWindow: () => appWindow.close(),
});

function onTerminalExit(paneId: string) {
  if (!store.close(paneId)) {
    void appWindow.close();
  }
}

const session = createWorkspaceSession({
  store: configClient,
  locks: workspaceLockClient,
  onError: (message, error) => {
    errorStore.report(error ?? message, message);
  },
});

async function loadDiskCatalog(): Promise<WorkspaceCatalog | null> {
  try {
    const raw = await configClient.read();
    return parseConfigFile(raw)?.catalog ?? null;
  } catch {
    return null;
  }
}

const workspaces = createWorkspaceController({
  store,
  operation: workspaceOperation,
  getCatalog: () => workspaceCatalog.value,
  setCatalog: (next) => {
    workspaceCatalog.value = next;
  },
  getHome: () => home.value,
  onLayoutChanged: () => {
    layoutRevision.value += 1;
  },
  readDiskCatalog: loadDiskCatalog,
  session,
  confirmDelete: (name) =>
    ask(`Se eliminará el workspace “${name}”.`, {
      title: 'Eliminar workspace',
      kind: 'warning',
      okLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
    }),
  onError: (message) => errorStore.report(message),
  clearError: () => errorStore.clear(),
});

function onWindowFocus() {
  void workspaces.reloadWorkspaces();
  void statusPoller.trigger();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && closePromptVisible.value) {
    event.preventDefault();
    event.stopPropagation();
    closePromptVisible.value = false;
    return;
  }

  if (isQuitShortcut(event, isMac) || isCloseWindowShortcut(event, isMac)) {
    event.preventDefault();
    event.stopPropagation();
    closePromptVisible.value = true;
    return;
  }

  const zoom = fontZoomAction(event, isMac);
  if (zoom) {
    event.preventDefault();
    event.stopPropagation();
    if (zoom === 'increase') increaseFontSize();
    else if (zoom === 'decrease') decreaseFontSize();
    else resetFontSize();
    return;
  }

  const action = shortcutAction(event, isMac);
  if (!action) return;
  if (event.target instanceof HTMLInputElement && (action === 'copy' || action === 'paste')) {
    return;
  }
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

function persistSettings(): Promise<boolean> {
  return session.saveSettings({
    theme: theme.value,
    fontFamily: fontFamily.value,
    fontSize: fontSize.value,
  });
}

async function setTheme(next: ThemeName) {
  theme.value = next;
  document.documentElement.dataset.theme = next;
  await persistSettings();
  window.dispatchEvent(new CustomEvent<ThemeName>(THEME_CHANGE_EVENT, { detail: next }));
}

function toggleTheme() {
  void setTheme(nextTheme(theme.value));
}

async function setFontFamily(next: TerminalFontId) {
  fontFamily.value = next;
  await persistSettings();
}

async function setFontSize(next: number) {
  const clamped = clampFontSize(next);
  if (clamped === fontSize.value) return;
  fontSize.value = clamped;
  await persistSettings();
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

function openWorkspaceDialog(mode: 'new' | 'save') {
  renamingWorkspaceId.value = null;
  errorStore.clear();
  workspaceDialogMode.value = mode;
  workspaceDialogVisible.value = true;
}

function startRenameWorkspace(id: string) {
  if (!findWorkspace(workspaceCatalog.value, id)) return;
  renamingWorkspaceId.value = id;
  errorStore.clear();
  workspaceDialogMode.value = 'rename';
  workspaceDialogVisible.value = true;
}

async function saveWorkspaceFromMenu() {
  if (
    workspaceCatalog.value.activeId &&
    findWorkspace(workspaceCatalog.value, workspaceCatalog.value.activeId)
  ) {
    await workspaces.saveCurrentWorkspace();
  } else {
    openWorkspaceDialog('save');
  }
}

async function submitWorkspaceName(name: string) {
  let saved = false;
  if (workspaceDialogMode.value === 'new') {
    saved = await workspaces.createNewWorkspace(name);
  } else if (workspaceDialogMode.value === 'save') {
    saved = await workspaces.saveCurrentWorkspace(name);
  } else if (workspaceDialogMode.value === 'rename' && renamingWorkspaceId.value) {
    saved = await workspaces.renameWorkspace(renamingWorkspaceId.value, name);
  }
  if (saved) {
    workspaceDialogVisible.value = false;
    renamingWorkspaceId.value = null;
  }
}

async function finishClose(saveWorkspace: boolean) {
  if (!(await workspaces.prepareWindowClose(saveWorkspace))) return;
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
    unlistenRequestClose = await tauriListen('zu-term://request-close', () => {
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
      // First run (or an unreadable file): store the migrated localStorage
      // data; the backend never replaces a valid config.
      const initial = createConfigFile(
        theme.value,
        startupCatalog,
        fontFamily.value,
        fontSize.value,
      );
      configClient.importConfig(JSON.stringify(initial)).catch(report);
    }
    ready.value = true;
    try {
      unlistenWorkspaces = await tauriListen(WORKSPACES_UPDATED_EVENT, () => {
        void workspaces.reloadWorkspaces();
      });
    } catch (error) {
      report(error);
    }
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Workspace changes arrive through WORKSPACES_UPDATED_EVENT from the backend.
    statusPoller.start();
  } catch (error) {
    report(error);
  }
});

function onWindowError(event: ErrorEvent) {
  errorStore.report(event.error ?? event.message);
}

function onUnhandledRejection(event: PromiseRejectionEvent) {
  errorStore.report(event.reason);
}

watch(activeCwdsKey, () => {
  void statusPoller.trigger();
});

onBeforeUnmount(() => {
  statusPoller.stop();
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('focus', onWindowFocus);
  window.removeEventListener('error', onWindowError);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
  unlistenClose?.();
  unlistenRequestClose?.();
  unlistenWorkspaces?.();
});
</script>

<template>
  <main class="app-shell" :style="densityStyle">
    <AppToolbar
      :active-workspace-id="workspaceCatalog.activeId"
      :workspaces="workspaceCatalog.workspaces"
      :workspace-error="workspaceError"
      :workspace-busy="workspaceOperation.busy"
      :font-family="fontFamily"
      :font-size="fontSize"
      :split-actions="splitActions"
      :theme-label="themeLabel"
      :is-mac="isMac"
      @save-workspace="saveWorkspaceFromMenu"
      @rename-workspace="startRenameWorkspace"
      @new-workspace="openWorkspaceDialog('new')"
      @select-workspace="(id) => void workspaces.restoreWorkspace(id)"
      @delete-workspace="(id) => void workspaces.deleteWorkspace(id)"
      @open-workspace-menu="() => void workspaces.reloadWorkspaces()"
      @update-font-family="setFontFamily"
      @decrease-font-size="decreaseFontSize"
      @increase-font-size="increaseFontSize"
      @run-split-action="runToolbarAction"
      @toggle-theme="toggleTheme"
    />
    <ErrorArea
      :errors="errorStore.errors"
      :visible="errorStore.visible"
      @dismiss="errorStore.dismiss"
      @clear="errorStore.clear"
      @toggle="errorStore.toggleVisible"
    />
    <LayoutView
      v-if="ready"
      :key="layoutRevision"
      class="layout-view"
      :home="home"
      :local-host="localHost"
      :theme="theme"
      :font-family="fontFamily"
      :font-size="fontSize"
      :git-branches="gitBranches"
      @menu="openMenu"
      @size="onPaneSize"
      @close="(paneId) => actions.run('close', paneId).catch(report)"
      @exit="(paneId) => onTerminalExit(paneId)"
      @paste="(paneId, text) => actions.pasteText(paneId, text).catch(report)"
    />
    <StatusBar
      :workspace-name="activeWorkspaceName"
      :pane="statusPane"
      :pane-count="paneCount"
      :run-processes="runProcesses"
      :home="home"
      :error-count="errorStore.errorCount"
      @toggle-errors="errorStore.toggleVisible"
    />
    <CloseConfirmDialog
      :visible="closePromptVisible"
      :error="workspaceError"
      @cancel="closePromptVisible = false"
      @confirm="finishClose"
    />
    <WorkspaceNameDialog
      :visible="workspaceDialogVisible"
      :title="workspaceDialogTitle"
      :description="workspaceDialogDescription"
      :initial-name="workspaceDialogInitialName"
      :error="workspaceError"
      @cancel="
        workspaceDialogVisible = false;
        renamingWorkspaceId = null;
      "
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

.layout-view {
  flex: 1;
  min-height: 0;
}
</style>
