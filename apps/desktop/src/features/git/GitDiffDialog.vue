<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import DiffView from './DiffView.vue';
import GitHistory from './GitHistory.vue';
import { diffSummary, parseUnifiedDiff } from './git-diff.ts';
import type { GitView, GitViewTab } from './git-view.ts';

const props = defineProps<{
  view: GitView['state'];
  path: string;
}>();

const emit = defineEmits<{
  close: [];
  refresh: [];
  tab: [tab: GitViewTab];
  select: [hash: string];
  loadMore: [];
}>();

const TABS: { id: GitViewTab; label: string }[] = [
  { id: 'changes', label: 'Cambios' },
  { id: 'history', label: 'Historial' },
];

const dialog = useTemplateRef<HTMLElement>('dialog');
const changes = computed(() => props.view.changes);
const files = computed(() => parseUnifiedDiff(changes.value.diff?.diff ?? ''));
const summary = computed(() => diffSummary(files.value));
const untracked = computed(() => changes.value.diff?.untracked ?? []);
const empty = computed(() => files.value.length === 0 && untracked.value.length === 0);
const busy = computed(() =>
  props.view.tab === 'changes' ? changes.value.loading : props.view.history.loading,
);

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
        <div class="diff-tabs" role="tablist" aria-label="Vista de git">
          <button
            v-for="tab in TABS"
            :key="tab.id"
            class="diff-tab"
            type="button"
            role="tab"
            :aria-selected="view.tab === tab.id"
            @click="emit('tab', tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>
        <span
          v-if="view.tab === 'changes' && !changes.loading && !changes.error && !empty"
          class="diff-summary"
        >
          {{ summary.files }} archivo{{ summary.files === 1 ? '' : 's' }}
          <b class="add">+{{ summary.additions }}</b>
          <b class="del">−{{ summary.deletions }}</b>
        </span>
        <span
          v-else-if="view.tab === 'history' && view.history.commits.length"
          class="diff-summary"
        >
          {{ view.history.commits.length }}{{ view.history.hasMore ? '+' : '' }} commits
        </span>
        <button
          class="diff-action"
          type="button"
          :disabled="busy"
          title="Actualizar"
          @click="emit('refresh')"
        >
          ↻
        </button>
        <button class="diff-action" type="button" title="Cerrar (Esc)" @click="emit('close')">
          ×
        </button>
      </header>

      <template v-if="view.tab === 'changes'">
        <p v-if="changes.loading" class="diff-state">Leyendo cambios…</p>
        <p v-else-if="changes.error" class="diff-state diff-error" role="alert">
          {{ changes.error }}
        </p>
        <p v-else-if="empty" class="diff-state">
          Sin cambios: el directorio de trabajo está limpio.
        </p>
        <DiffView
          v-else
          :files="files"
          :untracked="untracked"
          :truncated="changes.diff?.truncated"
        />
      </template>
      <GitHistory
        v-else
        :commits="view.history.commits"
        :has-more="view.history.hasMore"
        :loading="view.history.loading"
        :error="view.history.error"
        :selected="view.history.selected"
        :detail-loading="view.history.detailLoading"
        :detail-error="view.history.detailError"
        :detail="view.history.detail"
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

.diff-tabs {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--pane-bg);
}

.diff-tab {
  padding: 4px 12px;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.diff-tab[aria-selected='true'] {
  color: var(--text);
  background: var(--accent-soft);
}

.diff-tab:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: 1px;
}

.diff-summary {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.diff-summary b {
  margin-left: 6px;
}

.add {
  color: var(--ok);
}

.del {
  color: var(--danger, #ff8c8c);
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

.diff-state {
  margin: 0;
  padding: 32px 16px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.diff-error {
  color: var(--danger, #ff8c8c);
}
</style>
