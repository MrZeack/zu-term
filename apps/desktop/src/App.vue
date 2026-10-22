<script setup lang="ts">
import { homeDir } from '@tauri-apps/api/path';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { ask } from '@tauri-apps/plugin-dialog';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useLayoutStore } from './core/app-stores.ts';
import { paneMenuItems } from './features/context-menu/menu-items.ts';
import { showPaneMenu } from './features/context-menu/pane-menu.ts';
import LayoutView from './features/layout/LayoutView.vue';
import { createPaneActions } from './features/pane-actions/pane-actions.ts';
import { paneTitleWithCommand, shortPath } from './features/pane-header/pane-title.ts';
import { clearSession, loadSession, saveSession } from './features/session/session.ts';
import { shortcutAction } from './features/shortcuts/shortcuts.ts';
import { localHostname } from './features/terminal/pty-client.ts';
import { terminals } from './features/terminal/terminal-registry.ts';
import {
  splitToolbarActions,
  type SplitToolbarAction,
} from './features/toolbar/toolbar-actions.ts';
import {
  THEME_CHANGE_EVENT,
  loadTheme,
  nextTheme,
  persistTheme,
  type ThemeName,
} from './features/theme/theme.ts';

const store = useLayoutStore();
const appWindow = getCurrentWindow();
const home = ref<string>();
const localHost = ref<string>();
const ready = ref(false);
const theme = ref<ThemeName>('cyan');
const closePromptVisible = ref(false);
const isMac = navigator.userAgent.includes('Mac');
const splitActions = splitToolbarActions(isMac);
const activePane = computed(() => store.panes[store.activeId]);
const activePaneTitle = computed(() => paneTitleWithCommand(activePane.value ?? {}));
const activePanePath = computed(() => shortPath(activePane.value?.cwd, home.value, 44));
const themeLabel = computed(() => (theme.value === 'cyan' ? 'Cian' : 'Menta'));
let allowWindowClose = false;
let unlistenClose: (() => void) | undefined;

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

function onKeydown(event: KeyboardEvent) {
  const action = shortcutAction(event, isMac);
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  actions.run(action, store.activeId).catch(report);
}

function openMenu(paneId: string) {
  const hasSelection = Boolean(terminals.get(paneId)?.getSelection());
  showPaneMenu(paneMenuItems({ hasSelection }), (action) => {
    actions.run(action, paneId).catch(report);
  }).catch(report);
}

function setTheme(next: ThemeName) {
  theme.value = next;
  document.documentElement.dataset.theme = next;
  persistTheme(window.localStorage, next);
  window.dispatchEvent(new CustomEvent<ThemeName>(THEME_CHANGE_EVENT, { detail: next }));
}

function toggleTheme() {
  setTheme(nextTheme(theme.value));
}

function runToolbarAction(action: SplitToolbarAction['id']) {
  actions.run(action, store.activeId).catch(report);
}

function cancelClose() {
  closePromptVisible.value = false;
}

async function finishClose(restore: boolean) {
  if (restore) saveSession(window.localStorage, store.snapshot());
  else clearSession(window.localStorage);
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
  theme.value = loadTheme(window.localStorage);
  document.documentElement.dataset.theme = theme.value;
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
    [home.value, localHost.value] = await Promise.all([homeDir(), localHostname()]);
    const savedSession = loadSession(window.localStorage);
    if (savedSession) store.restore(savedSession);
    store.init(home.value);
  } catch (error) {
    report(error);
  }
  ready.value = true;
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true);
  unlistenClose?.();
});
</script>

<template>
  <main class="app-shell">
    <header class="app-toolbar" aria-label="Barra de herramientas de Zylo">
      <div class="brand" aria-label="Zylo">
        <span class="brand-mark" aria-hidden="true"><i /><i /></span>
        <span class="brand-name">Zylo</span>
      </div>
      <span class="toolbar-divider" aria-hidden="true" />
      <div v-if="ready" class="active-context" aria-live="polite">
        <span class="context-kicker">ACTIVO</span>
        <strong class="context-title">{{ activePaneTitle }}</strong>
        <span v-if="activePanePath" class="context-path">{{ activePanePath }}</span>
      </div>
      <div class="toolbar-spacer" />
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
      class="layout-view"
      :home="home"
      :local-host="localHost"
      @menu="openMenu"
      @exit="(paneId) => actions.run('close', paneId).catch(report)"
      @paste="(paneId, text) => actions.pasteText(paneId, text).catch(report)"
    />
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
        <span class="dialog-kicker">SALIR DE ZYLO</span>
        <h2 id="close-dialog-title">¿Cerrar la aplicación?</h2>
        <p id="close-dialog-description">
          Puedes guardar la distribución actual y volver a abrir tus terminales en sus últimas
          carpetas.
        </p>
        <div class="close-dialog__actions">
          <button class="dialog-button dialog-button--quiet" type="button" @click="cancelClose">
            Cancelar
          </button>
          <button class="dialog-button" type="button" @click="finishClose(false)">
            Cerrar sin restaurar
          </button>
          <button
            class="dialog-button dialog-button--primary"
            type="button"
            @click="finishClose(true)"
          >
            Cerrar y restaurar sesión
          </button>
        </div>
      </section>
    </div>
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
  gap: 10px;
  flex: 0 0 44px;
  padding: 0 14px;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  user-select: none;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
}

.brand-mark {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  width: 20px;
  height: 20px;
  padding: 3px;
  border: 1px solid var(--accent-border);
  border-radius: 6px;
  background: linear-gradient(145deg, var(--accent-soft), var(--accent-alt-soft));
  transform: skewX(-10deg);
}

.brand-mark i {
  display: block;
  width: 5px;
  height: 12px;
  border-radius: 4px;
  background: var(--accent);
}

.brand-mark i:last-child {
  height: 8px;
  margin-top: 3px;
  background: var(--accent-alt);
}

.brand-name {
  color: var(--text);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--border);
}

.active-context {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  color: var(--muted);
}

.context-kicker {
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.context-title {
  max-width: 220px;
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-path {
  max-width: 260px;
  overflow: hidden;
  color: var(--muted);
  font-family: Menlo, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-actions {
  display: inline-flex;
  gap: 6px;
}

.toolbar-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
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
  font-size: 11px;
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
  min-width: 104px;
  padding: 5px 8px;
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
  width: 7px;
  height: 15px;
  border-radius: 5px;
  background: var(--accent);
}

.theme-swatch i:last-child {
  margin-top: 4px;
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
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.11em;
}

.theme-copy strong {
  font-size: 12px;
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
    padding: 0 12px;
  }

  .toolbar-divider,
  .active-context {
    display: none;
  }

  .toolbar-action__label {
    display: none;
  }

  .toolbar-action {
    padding: 8px;
  }
}
</style>
