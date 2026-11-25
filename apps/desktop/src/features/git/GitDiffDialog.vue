<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { diffSummary, parseUnifiedDiff, type DiffFile, type GitDiff } from './git-diff.ts';

const props = defineProps<{
  visible: boolean;
  branch: string;
  path: string;
  loading: boolean;
  error?: string | undefined;
  diff?: GitDiff | undefined;
}>();

const emit = defineEmits<{
  close: [];
  refresh: [];
}>();

const dialog = useTemplateRef<HTMLElement>('dialog');
const body = useTemplateRef<HTMLElement>('body');
const files = computed(() => parseUnifiedDiff(props.diff?.diff ?? ''));
const summary = computed(() => diffSummary(files.value));
const untracked = computed(() => props.diff?.untracked ?? []);
const empty = computed(() => files.value.length === 0 && untracked.value.length === 0);

const STATUS_LABELS: Record<DiffFile['status'], string> = {
  added: 'A',
  deleted: 'D',
  modified: 'M',
  renamed: 'R',
};

function showFile(index: number) {
  body.value
    ?.querySelector(`[data-file="${index}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return;
    await nextTick();
    dialog.value?.focus();
  },
);
</script>

<template>
  <div
    v-if="visible"
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
          <span class="dialog-kicker">⎇ {{ branch }}</span>
          <h2 id="diff-dialog-title" :title="path">{{ path }}</h2>
        </div>
        <span v-if="!loading && !error && !empty" class="diff-summary">
          {{ summary.files }} archivo{{ summary.files === 1 ? '' : 's' }}
          <b class="add">+{{ summary.additions }}</b>
          <b class="del">−{{ summary.deletions }}</b>
        </span>
        <button
          class="diff-action"
          type="button"
          :disabled="loading"
          title="Actualizar"
          @click="emit('refresh')"
        >
          ↻
        </button>
        <button class="diff-action" type="button" title="Cerrar (Esc)" @click="emit('close')">
          ×
        </button>
      </header>

      <p v-if="loading" class="diff-state">Leyendo cambios…</p>
      <p v-else-if="error" class="diff-state diff-error" role="alert">{{ error }}</p>
      <p v-else-if="empty" class="diff-state">Sin cambios: el directorio de trabajo está limpio.</p>
      <div v-else class="diff-content">
        <nav class="diff-files" aria-label="Archivos con cambios">
          <button
            v-for="(file, index) in files"
            :key="`${index}-${file.path}`"
            class="diff-file-link"
            type="button"
            :title="file.oldPath ? `${file.oldPath} → ${file.path}` : file.path"
            @click="showFile(index)"
          >
            <span class="file-status" :class="file.status">{{ STATUS_LABELS[file.status] }}</span>
            <span class="file-name">{{ file.path }}</span>
            <span class="file-counts">
              <b v-if="file.additions" class="add">+{{ file.additions }}</b>
              <b v-if="file.deletions" class="del">−{{ file.deletions }}</b>
            </span>
          </button>
          <template v-if="untracked.length">
            <span class="diff-files-title">Sin seguimiento</span>
            <span
              v-for="name in untracked"
              :key="name"
              class="diff-file-link untracked"
              :title="name"
            >
              <span class="file-status added">?</span>
              <span class="file-name">{{ name }}</span>
            </span>
          </template>
        </nav>
        <div ref="body" class="diff-body">
          <p v-if="diff?.truncated" class="diff-truncated">
            El diff es muy grande: se muestran solo los primeros 2 MB.
          </p>
          <section v-for="(file, index) in files" :key="`${index}-${file.path}`" :data-file="index">
            <h3 class="diff-file-title">
              <span v-if="file.oldPath">{{ file.oldPath }} → </span>{{ file.path }}
            </h3>
            <div class="diff-lines">
              <code
                v-for="(line, lineIndex) in file.lines"
                :key="lineIndex"
                class="diff-line"
                :class="line.kind"
                >{{ line.text || ' ' }}</code
              >
            </div>
            <p v-if="file.lines.length === 0" class="diff-note">Solo cambió el nombre.</p>
          </section>
        </div>
      </div>
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
  width: min(1100px, 100%);
  height: min(760px, 100%);
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
  padding: 14px 16px;
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

.add {
  color: var(--ok);
}

.del {
  color: var(--danger, #ff8c8c);
}

.diff-summary b {
  margin-left: 6px;
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

.diff-content {
  display: flex;
  flex: 1;
  min-height: 0;
}

.diff-files {
  display: flex;
  flex: 0 0 260px;
  flex-direction: column;
  gap: 1px;
  padding: 8px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.diff-files-title {
  margin: 10px 6px 4px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.diff-file-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border: 0;
  border-radius: 6px;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  font-family: Menlo, monospace;
  font-size: 11px;
  text-align: left;
}

.diff-file-link:hover,
.diff-file-link:focus-visible {
  background: var(--accent-soft);
}

.diff-file-link.untracked {
  cursor: default;
  color: var(--muted);
}

.diff-file-link.untracked:hover {
  background: transparent;
}

.file-status {
  flex: 0 0 auto;
  width: 14px;
  font-weight: 800;
  text-align: center;
}

.file-status.added {
  color: var(--ok);
}

.file-status.deleted {
  color: var(--danger, #ff8c8c);
}

.file-status.modified {
  color: var(--warning);
}

.file-status.renamed {
  color: var(--accent);
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  direction: rtl;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-counts {
  display: inline-flex;
  gap: 4px;
  font-size: 10px;
}

.diff-body {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.diff-truncated {
  margin: 0;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--warning);
  font-size: 12px;
}

.diff-file-title {
  position: sticky;
  top: 0;
  margin: 0;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--header-bg);
  font-family: Menlo, monospace;
  font-size: 12px;
}

.diff-lines {
  margin: 0;
  padding: 4px 0 12px;
  background: var(--pane-bg);
  font-family: Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.diff-line {
  display: block;
  padding: 0 14px;
  white-space: pre;
}

.diff-line.add {
  color: var(--ok);
  background: rgba(74, 222, 128, 0.1);
}

.diff-line.del {
  color: var(--danger, #ff8c8c);
  background: rgba(255, 140, 140, 0.1);
}

.diff-line.hunk {
  margin-top: 6px;
  color: var(--accent);
  background: var(--accent-soft);
}

.diff-line.meta {
  color: var(--muted);
  font-style: italic;
}

.diff-note {
  margin: 0;
  padding: 8px 14px 14px;
  color: var(--muted);
  font-size: 12px;
}
</style>
