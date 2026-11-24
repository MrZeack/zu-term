<script setup lang="ts">
import { APP_NAME, APP_VERSION } from '../../core/brand.ts';
import {
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  type TerminalFontId,
} from '../terminal/terminal-font.ts';
import WorkspaceMenu from '../workspace/WorkspaceMenu.vue';
import type { WorkspaceRecord } from '../workspace/workspace.ts';
import FontMenu from './FontMenu.vue';
import type { SplitToolbarAction } from './toolbar-actions.ts';

defineProps<{
  activeWorkspaceId: string | null;
  workspaces: WorkspaceRecord[];
  workspaceError: string | undefined;
  workspaceBusy: boolean;
  workspaceDirty?: boolean;
  fontFamily: TerminalFontId;
  fontSize: number;
  splitActions: SplitToolbarAction[];
  themeLabel: string;
  isMac: boolean;
}>();

const emit = defineEmits<{
  saveWorkspace: [];
  renameWorkspace: [id: string];
  newWorkspace: [];
  selectWorkspace: [id: string];
  deleteWorkspace: [id: string];
  openWorkspaceMenu: [];
  updateFontFamily: [id: TerminalFontId];
  decreaseFontSize: [];
  increaseFontSize: [];
  runSplitAction: [id: SplitToolbarAction['id']];
  toggleTheme: [];
}>();
</script>

<template>
  <header class="app-toolbar" :aria-label="`Barra de herramientas de ${APP_NAME}`">
    <div class="brand" :aria-label="APP_NAME">
      <span class="brand-name">{{ APP_NAME }}</span>
      <span class="brand-version">v{{ APP_VERSION }}</span>
    </div>
    <WorkspaceMenu
      :active-id="activeWorkspaceId"
      :workspaces="workspaces"
      :error="workspaceError"
      :busy="workspaceBusy"
      :dirty="workspaceDirty"
      @save="emit('saveWorkspace')"
      @rename="(id) => emit('renameWorkspace', id)"
      @new="emit('newWorkspace')"
      @select="(id) => emit('selectWorkspace', id)"
      @delete="(id) => emit('deleteWorkspace', id)"
      @open="emit('openWorkspaceMenu')"
    />
    <div class="toolbar-spacer" />
    <FontMenu
      :model-value="fontFamily"
      @update:model-value="(id) => emit('updateFontFamily', id)"
    />
    <div class="font-size-control" role="group" aria-label="Tamaño de fuente de terminal">
      <button
        class="font-size-btn"
        type="button"
        :disabled="fontSize <= MIN_TERMINAL_FONT_SIZE"
        aria-label="Disminuir tamaño de fuente"
        :title="`Disminuir tamaño de fuente (${isMac ? '⌘-' : 'Ctrl+-'})`"
        @click="emit('decreaseFontSize')"
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
        @click="emit('increaseFontSize')"
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
        @click="emit('runSplitAction', action.id)"
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
      @click="emit('toggleTheme')"
    >
      <span class="theme-swatch" aria-hidden="true"><i /><i /></span>
      <span class="theme-copy"
        ><small>ACENTO</small><strong>{{ themeLabel }}</strong></span
      >
      <span class="theme-switch" aria-hidden="true">⇄</span>
    </button>
  </header>
</template>

<style scoped>
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
