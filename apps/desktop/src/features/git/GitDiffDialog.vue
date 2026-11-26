<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue';
import GitHistory from './GitHistory.vue';
import type { GitView } from './git-view.ts';

const props = defineProps<{
  view: GitView['state'];
  local: { staged: boolean; unstaged: boolean };
  path: string;
}>();

const emit = defineEmits<{
  close: [];
  refresh: [];
  select: [hash: string];
  loadMore: [];
}>();

const dialog = useTemplateRef<HTMLElement>('dialog');

watch(
  () => props.view.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    dialog.value?.focus();
  },
);
</script>

<template>
  <div
    v-if="view.open"
    class="modal-backdrop"
    role="presentation"
    @click.self="emit('close')"
    @keydown.esc.stop="emit('close')"
  >
    <section
      ref="dialog"
      class="diff-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-dialog-title"
      tabindex="-1"
    >
      <header class="diff-header">
        <div class="diff-heading">
          <span class="dialog-kicker">⎇ {{ view.branch }}</span>
          <h2 id="diff-dialog-title" :title="path">{{ path }}</h2>
        </div>
        <span v-if="view.commits.length" class="diff-summary">
          {{ view.commits.length }}{{ view.hasMore ? '+' : '' }} commits
        </span>
        <button
          class="diff-action"
          type="button"
          :disabled="view.loading || view.changesLoading"
          title="Actualizar"
          @click="emit('refresh')"
        >
          ↻
        </button>
        <button class="diff-action" type="button" title="Cerrar (Esc)" @click="emit('close')">
          ×
        </button>
      </header>
      <GitHistory
        :commits="view.commits"
        :has-more="view.hasMore"
        :loading="view.loading || view.changesLoading"
        :error="view.error"
        :changes="view.changes"
        :changes-error="view.changesError"
        :local="local"
        :selected="view.selected"
        :detail-loading="view.detailLoading"
        :detail-error="view.detailError"
        :detail="view.detail"
        @select="(hash) => emit('select', hash)"
        @load-more="emit('loadMore')"
      />
    </section>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  z-index: 10;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 9, 12, 0.72);
  backdrop-filter: blur(6px);
}

.diff-dialog {
  display: flex;
  flex-direction: column;
  width: min(1200px, 100%);
  height: min(820px, 100%);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--header-bg);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.diff-dialog:focus {
  outline: none;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.diff-heading {
  flex: 1;
  min-width: 0;
}

.dialog-kicker {
  color: var(--accent);
  font-family: Menlo, monospace;
  font-size: 11px;
  font-weight: 800;
}

.diff-heading h2 {
  margin: 4px 0 0;
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-summary {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.diff-action {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  color: var(--muted);
  background: var(--pane-bg);
  cursor: pointer;
  font: inherit;
  font-size: 15px;
}

.diff-action:hover:not(:disabled),
.diff-action:focus-visible {
  border-color: var(--accent);
  color: var(--text);
}

.diff-action:disabled {
  cursor: default;
  opacity: 0.5;
}
</style>
