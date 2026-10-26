<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { paneIds } from '../layout/layout-tree.ts';
import type { WorkspaceRecord } from './workspace.ts';

const props = defineProps<{
  activeId: string | null;
  workspaces: WorkspaceRecord[];
  error?: string | undefined;
  busy: boolean;
}>();

const emit = defineEmits<{
  save: [];
  new: [];
  select: [id: string];
  delete: [id: string];
  open: [];
}>();

const open = ref(false);
const menu = useTemplateRef<HTMLDivElement>('menu');
const activeName = computed(
  () =>
    props.workspaces.find((workspace) => workspace.id === props.activeId)?.name ?? 'Sin guardar',
);

function toggleOpen() {
  open.value = !open.value;
  if (open.value) {
    emit('open');
  }
}

function closeAnd(action: () => void) {
  open.value = false;
  action();
}

function closeOnOutside(event: PointerEvent) {
  if (!open.value || menu.value?.contains(event.target as Node)) return;
  open.value = false;
}

watch(
  () => props.busy,
  (busy) => {
    if (busy) open.value = false;
  },
);

onMounted(() => document.addEventListener('pointerdown', closeOnOutside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutside));
</script>

<template>
  <div ref="menu" class="workspace-menu" @keydown.esc="open = false">
    <button
      class="workspace-trigger"
      type="button"
      :disabled="busy"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-label="Abrir menú principal de workspaces"
      title="Abrir menú principal de workspaces"
      @click="toggleOpen"
    >
      <span class="workspace-trigger__kicker">WORKSPACE</span>
      <strong>{{ activeName }}</strong>
      <span class="workspace-trigger__arrow" aria-hidden="true">⌄</span>
    </button>
    <div v-if="open" class="workspace-popover" role="menu" @click.stop>
      <div class="workspace-popover__header">
        <span>Workspaces</span>
        <small>{{ workspaces.length }} guardados</small>
      </div>
      <button
        class="workspace-menu__action"
        type="button"
        :disabled="busy"
        @click="closeAnd(() => emit('save'))"
      >
        <span aria-hidden="true">↓</span>
        Guardar workspace
      </button>
      <button
        class="workspace-menu__action"
        type="button"
        :disabled="busy"
        @click="closeAnd(() => emit('new'))"
      >
        <span aria-hidden="true">＋</span>
        Nuevo workspace
      </button>
      <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>
      <div v-if="workspaces.length" class="workspace-list__label">Restaurar workspace</div>
      <div v-if="workspaces.length" class="workspace-list">
        <div v-for="workspace in workspaces" :key="workspace.id" class="workspace-entry">
          <button
            class="workspace-option"
            :class="{ active: workspace.id === activeId }"
            type="button"
            role="menuitem"
            :disabled="busy"
            @click="closeAnd(() => emit('select', workspace.id))"
          >
            <strong>{{ workspace.name }}</strong>
            <small>{{ paneIds(workspace.snapshot.root).length }} splits</small>
          </button>
          <button
            class="workspace-delete"
            type="button"
            :disabled="busy"
            :aria-label="`Eliminar workspace ${workspace.name}`"
            :title="`Eliminar workspace ${workspace.name}`"
            @click="emit('delete', workspace.id)"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
      <p v-else class="workspace-empty">Todavía no hay workspaces guardados.</p>
    </div>
  </div>
</template>

<style scoped>
.workspace-menu {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

.workspace-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 150px;
  padding: 4px 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.workspace-trigger:hover,
.workspace-trigger:focus-visible {
  border-color: var(--border-strong);
  background: var(--header-bg);
}

.workspace-trigger:focus-visible,
.workspace-menu__action:focus-visible,
.workspace-option:focus-visible,
.workspace-delete:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: 2px;
}

.workspace-trigger__kicker,
.workspace-popover__header,
.workspace-popover__header small {
  color: var(--muted);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.workspace-trigger strong {
  max-width: 125px;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-trigger__arrow {
  color: var(--accent);
  font-size: 13px;
}

.workspace-popover {
  position: absolute;
  z-index: 12;
  top: calc(100% + 7px);
  left: 0;
  display: flex;
  flex-direction: column;
  width: 250px;
  padding: 8px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--header-bg);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.34);
}

.workspace-popover__header {
  display: flex;
  justify-content: space-between;
  padding: 5px 7px 8px;
  letter-spacing: 0.12em;
}

.workspace-popover__header small {
  font-size: 8px;
  font-weight: 500;
  letter-spacing: 0;
}

.workspace-menu__action,
.workspace-option,
.workspace-delete {
  border: 0;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.workspace-menu__action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px;
  border-radius: 7px;
  font-size: 11px;
  text-align: left;
}

.workspace-menu__action:hover,
.workspace-option:hover,
.workspace-option.active {
  background: var(--accent-soft);
}

.workspace-menu__action span {
  width: 14px;
  color: var(--accent);
  font-size: 15px;
  text-align: center;
}

.workspace-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
  overflow-y: auto;
}

.workspace-list__label {
  margin: 9px 7px 4px;
  color: var(--muted);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.workspace-entry {
  display: flex;
  align-items: stretch;
  gap: 2px;
}

.workspace-option {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 7px;
  border-radius: 7px;
  text-align: left;
}

.workspace-option strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-option small,
.workspace-empty,
.workspace-error {
  color: var(--muted);
  font-size: 10px;
}

.workspace-delete {
  width: 26px;
  border-radius: 7px;
  color: var(--muted);
  font-size: 15px;
}

.workspace-delete:hover {
  color: var(--text);
  background: var(--accent-alt-soft);
}

.workspace-empty,
.workspace-error {
  margin: 8px 7px 5px;
  line-height: 1.4;
}

.workspace-error {
  color: var(--danger, #ff8c8c);
}

@media (max-width: 680px) {
  .workspace-trigger {
    min-width: 0;
    padding: 6px;
  }

  .workspace-trigger__kicker {
    display: none;
  }

  .workspace-popover {
    left: auto;
    right: 0;
  }
}
</style>
