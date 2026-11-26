<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import { buildFileTree, hiddenByCollapse } from './file-tree.ts';
import type { DiffFile } from './git-diff.ts';

const props = defineProps<{
  files: DiffFile[];
  untracked?: string[] | undefined;
  truncated?: boolean | undefined;
}>();

const body = useTemplateRef<HTMLElement>('body');
const collapsed = ref(new Set<string>());
const tree = computed(() => buildFileTree(props.files.map((file) => file.path)));
const untrackedTree = computed(() => buildFileTree(props.untracked ?? []));

const STATUS_LABELS: Record<DiffFile['status'], string> = {
  added: 'A',
  deleted: 'D',
  modified: 'M',
  renamed: 'R',
};

function toggle(key: string) {
  const next = new Set(collapsed.value);
  if (!next.delete(key)) next.add(key);
  collapsed.value = next;
}

const visible = (rows: ReturnType<typeof buildFileTree>, scope: string) =>
  rows.filter((row) => !hiddenByCollapse({ ...row, path: `${scope}${row.path}` }, collapsed.value));

function showFile(index: number) {
  body.value
    ?.querySelector(`[data-file="${index}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
</script>

<template>
  <div class="diff-content">
    <nav class="diff-files" aria-label="Archivos con cambios">
      <template v-for="row in visible(tree, 'c:')" :key="`c:${row.path}`">
        <button
          v-if="row.kind === 'folder'"
          class="tree-folder"
          type="button"
          :style="{ paddingLeft: `${6 + row.depth * 12}px` }"
          :aria-expanded="!collapsed.has(`c:${row.path}`)"
          :title="row.path"
          @click="toggle(`c:${row.path}`)"
        >
          <span class="tree-caret" aria-hidden="true">{{
            collapsed.has(`c:${row.path}`) ? '▸' : '▾'
          }}</span>
          <span class="tree-label">{{ row.label }}/</span>
        </button>
        <button
          v-else
          class="diff-file-link"
          type="button"
          :style="{ paddingLeft: `${6 + row.depth * 12}px` }"
          :title="
            files[row.index]?.oldPath ? `${files[row.index]?.oldPath} → ${row.path}` : row.path
          "
          @click="showFile(row.index)"
        >
          <span class="file-status" :class="files[row.index]?.status">{{
            STATUS_LABELS[files[row.index]?.status ?? 'modified']
          }}</span>
          <span class="tree-label">{{ row.label }}</span>
          <span class="file-counts">
            <b v-if="files[row.index]?.additions" class="add">+{{ files[row.index]?.additions }}</b>
            <b v-if="files[row.index]?.deletions" class="del">−{{ files[row.index]?.deletions }}</b>
          </span>
        </button>
      </template>
      <template v-if="untracked?.length">
        <span class="diff-files-title">Sin seguimiento</span>
        <template v-for="row in visible(untrackedTree, 'u:')" :key="`u:${row.path}`">
          <button
            v-if="row.kind === 'folder'"
            class="tree-folder"
            type="button"
            :style="{ paddingLeft: `${6 + row.depth * 12}px` }"
            :aria-expanded="!collapsed.has(`u:${row.path}`)"
            :title="row.path"
            @click="toggle(`u:${row.path}`)"
          >
            <span class="tree-caret" aria-hidden="true">{{
              collapsed.has(`u:${row.path}`) ? '▸' : '▾'
            }}</span>
            <span class="tree-label">{{ row.label }}/</span>
          </button>
          <span
            v-else
            class="diff-file-link untracked"
            :style="{ paddingLeft: `${6 + row.depth * 12}px` }"
            :title="row.path"
          >
            <span class="file-status added">?</span>
            <span class="tree-label">{{ row.label }}</span>
          </span>
        </template>
      </template>
    </nav>
    <div ref="body" class="diff-body">
      <slot />
      <p v-if="truncated" class="diff-truncated">
        El diff es muy grande: se muestran solo los primeros 2 MB.
      </p>
      <section v-for="(file, index) in files" :key="`${index}-${file.path}`" :data-file="index">
        <h3 class="diff-file-title">
          <span v-if="file.oldPath">{{ file.oldPath }} → </span>{{ file.path }}
        </h3>
        <div class="diff-lines">
          <div
            v-for="(line, lineIndex) in file.lines"
            :key="lineIndex"
            class="diff-line"
            :class="line.kind"
          >
            <span class="line-number" aria-hidden="true">{{ line.oldLine ?? '' }}</span>
            <span class="line-number new" aria-hidden="true">{{ line.newLine ?? '' }}</span>
            <code class="line-text">{{ line.text || ' ' }}</code>
          </div>
        </div>
        <p v-if="file.lines.length === 0" class="diff-note">Sin cambios de contenido.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.diff-content {
  display: flex;
  flex: 1;
  min-height: 0;
}

.diff-files {
  display: flex;
  flex: 0 0 280px;
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
  align-items: flex-start;
  gap: 6px;
  padding: 4px 6px;
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
  color: var(--muted);
  cursor: default;
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

.file-status.added,
.add {
  color: var(--ok);
}

.file-status.deleted,
.del {
  color: var(--danger, #ff8c8c);
}

.file-status.modified {
  color: var(--warning);
}

.file-status.renamed {
  color: var(--accent);
}

.tree-folder {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
  font-family: Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
}

.tree-folder:hover,
.tree-folder:focus-visible {
  color: var(--text);
  background: var(--accent-soft);
}

.tree-caret {
  flex: 0 0 auto;
  width: 10px;
}

/* Full names, wrapped instead of cut. */
.tree-label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
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
  width: max-content;
  min-width: 100%;
  padding: 4px 0 12px;
  background: var(--pane-bg);
  font-family: Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.diff-line {
  display: flex;
}

/* Numbers stay in view when the code scrolls sideways. */
.line-number {
  position: sticky;
  left: 0;
  flex: 0 0 44px;
  padding: 0 8px 0 4px;
  color: var(--muted);
  background: var(--pane-bg);
  opacity: 0.75;
  text-align: right;
  user-select: none;
}

.line-number.new {
  left: 44px;
  border-right: 1px solid var(--border);
}

.line-text {
  padding: 0 14px 0 10px;
  font-family: inherit;
  white-space: pre;
}

.diff-line.add {
  background: rgba(74, 222, 128, 0.1);
}

.diff-line.del {
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
