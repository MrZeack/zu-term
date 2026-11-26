<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import DiffView from './DiffView.vue';
import { parseUnifiedDiff, type GitDiff } from './git-diff.ts';
import {
  computeGraph,
  formatCommitDate,
  refBadges,
  type GitCommit,
  type GitCommitDetail,
  type GraphLine,
} from './git-log.ts';
import { LOCAL_STAGED, LOCAL_UNSTAGED } from './git-view.ts';

const props = defineProps<{
  commits: GitCommit[];
  hasMore: boolean;
  loading: boolean;
  error: string;
  changes?: GitDiff | undefined;
  changesError: string;
  local: { staged: boolean; unstaged: boolean };
  selected: string | null;
  detailLoading: boolean;
  detailError: string;
  detail?: GitCommitDetail | undefined;
}>();

const emit = defineEmits<{
  select: [hash: string];
  loadMore: [];
}>();

const ROW_HEIGHT = 22;
const COLUMN_WIDTH = 12;
const COLORS = [
  '#00b7d5',
  '#00ca91',
  '#facc15',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
  '#60a5fa',
  '#f87171',
];
// gitk: red for work not in the index, green for what is staged.
const LOCAL_COLORS: Record<string, string> = {
  [LOCAL_UNSTAGED]: '#f87171',
  [LOCAL_STAGED]: '#4ade80',
};
const LOCAL_LABELS: Record<string, string> = {
  [LOCAL_UNSTAGED]: 'Cambios sin preparar (no están en el índice)',
  [LOCAL_STAGED]: 'Cambios en el índice, sin commitear',
};

const container = useTemplateRef<HTMLElement>('container');
const list = useTemplateRef<HTMLElement>('list');
const listHeight = ref(180);

const headHash = computed(
  () =>
    props.commits.find((c) => c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD -> ')))?.hash,
);

// Uncommitted work joins the graph above HEAD, as in gitk.
const rows = computed<GitCommit[]>(() => {
  const head = headHash.value ? [headHash.value] : [];
  const local: GitCommit[] = [];
  const pseudo = (hash: string, parents: string[]): GitCommit => ({
    hash,
    parents,
    author: '',
    time: 0,
    refs: [],
    subject: LOCAL_LABELS[hash] ?? '',
  });
  if (props.local.unstaged) {
    local.push(pseudo(LOCAL_UNSTAGED, props.local.staged ? [LOCAL_STAGED] : head));
  }
  if (props.local.staged) local.push(pseudo(LOCAL_STAGED, head));
  return [...local, ...props.commits];
});
const isLocal = (hash: string) => hash in LOCAL_COLORS;

const graph = computed(() => computeGraph(rows.value));
const graphWidth = computed(
  () => Math.max(1, ...graph.value.map((row) => row.width)) * COLUMN_WIDTH + 4,
);
const selectedCommit = computed(() => props.commits.find((c) => c.hash === props.selected));
const detailFiles = computed(() => {
  if (props.selected === LOCAL_STAGED) return parseUnifiedDiff(props.changes?.staged ?? '');
  if (props.selected === LOCAL_UNSTAGED) return parseUnifiedDiff(props.changes?.unstaged ?? '');
  return parseUnifiedDiff(props.detail?.diff ?? '');
});

const x = (column: number) => column * COLUMN_WIDTH + COLUMN_WIDTH / 2 + 2;
const color = (index: number) => COLORS[index % COLORS.length];
const dotColor = (hash: string, index: number) =>
  LOCAL_COLORS[hash] ?? color(graph.value[index]?.color ?? 0);

function linePath(line: GraphLine): string {
  const middle = ROW_HEIGHT / 2;
  const [y1, y2] = line.part === 'top' ? [0, middle] : [middle, ROW_HEIGHT];
  const [x1, x2] = [x(line.from), x(line.to)];
  if (x1 === x2) return `M${x1} ${y1}V${y2}`;
  const bend = (y1 + y2) / 2;
  return `M${x1} ${y1}C${x1} ${bend} ${x2} ${bend} ${x2} ${y2}`;
}

// Up and down move the selection, as in gitk.
async function move(step: number) {
  if (rows.value.length === 0) return;
  const current = rows.value.findIndex((c) => c.hash === props.selected);
  const next = Math.min(rows.value.length - 1, Math.max(0, current + step));
  const target = rows.value[next];
  if (!target || target.hash === props.selected) return;
  emit('select', target.hash);
  await nextTick();
  list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

// Dragging the bar between the list and the diff resizes the list.
function startResize(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement;
  const top = container.value?.getBoundingClientRect().top ?? 0;
  const total = container.value?.clientHeight ?? 0;
  handle.setPointerCapture(event.pointerId);
  const onMove = (move: PointerEvent) => {
    listHeight.value = Math.round(
      Math.min(Math.max(move.clientY - top, ROW_HEIGHT * 3), total * 0.75),
    );
  };
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
}
</script>

<template>
  <div ref="container" class="history">
    <p v-if="error && rows.length === 0" class="history-state history-error" role="alert">
      {{ error }}
    </p>
    <p v-else-if="loading && rows.length === 0" class="history-state">Leyendo historial…</p>
    <p v-else-if="rows.length === 0" class="history-state">El repositorio no tiene commits.</p>
    <template v-else>
      <div
        ref="list"
        class="commit-list"
        role="listbox"
        aria-label="Commits"
        tabindex="0"
        :style="{ height: `${listHeight}px` }"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
      >
        <div
          v-for="(commit, index) in rows"
          :key="commit.hash"
          class="commit-row"
          :class="{ local: isLocal(commit.hash) }"
          role="option"
          :aria-selected="commit.hash === selected"
          @click="emit('select', commit.hash)"
        >
          <svg
            class="commit-graph"
            :width="graphWidth"
            :height="ROW_HEIGHT"
            :viewBox="`0 0 ${graphWidth} ${ROW_HEIGHT}`"
            aria-hidden="true"
          >
            <path
              v-for="(line, lineIndex) in graph[index]?.lines ?? []"
              :key="lineIndex"
              :d="linePath(line)"
              :stroke="color(line.color)"
              stroke-width="2"
              fill="none"
            />
            <circle
              :cx="x(graph[index]?.column ?? 0)"
              :cy="ROW_HEIGHT / 2"
              :r="commit.parents.length > 1 ? 3 : 4"
              :fill="dotColor(commit.hash, index)"
              :stroke="commit.parents.length > 1 ? dotColor(commit.hash, index) : 'none'"
              stroke-width="2"
            />
          </svg>
          <span class="commit-subject">
            <span
              v-for="badge in refBadges(commit.refs)"
              :key="badge.label + badge.kind"
              class="ref-badge"
              :class="badge.kind"
              >{{ badge.label }}</span
            >
            {{ commit.subject }}
          </span>
          <template v-if="!isLocal(commit.hash)">
            <span class="commit-author">{{ commit.author }}</span>
            <span class="commit-date">{{ formatCommitDate(commit.time) }}</span>
          </template>
        </div>
        <button
          v-if="hasMore"
          class="load-more"
          type="button"
          :disabled="loading"
          @click="emit('loadMore')"
        >
          {{ loading ? 'Cargando…' : 'Cargar más commits' }}
        </button>
        <p v-if="error" class="history-error history-inline" role="alert">{{ error }}</p>
        <p v-if="changesError" class="history-error history-inline" role="alert">
          {{ changesError }}
        </p>
      </div>
      <div
        class="history-splitter"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Cambiar el alto de la lista de commits"
        @pointerdown.prevent="startResize"
      />
      <div class="commit-detail">
        <DiffView
          v-if="selected === LOCAL_STAGED || selected === LOCAL_UNSTAGED"
          :files="detailFiles"
          :untracked="selected === LOCAL_UNSTAGED ? changes?.untracked : undefined"
          :truncated="changes?.truncated"
        >
          <header class="commit-meta local-meta">
            <span class="local-dot" :style="{ background: LOCAL_COLORS[selected] }" />
            {{ LOCAL_LABELS[selected] }}
          </header>
        </DiffView>
        <p v-else-if="!selectedCommit" class="history-state">
          Elige un commit para ver sus cambios.
        </p>
        <p v-else-if="detailLoading" class="history-state">Leyendo commit…</p>
        <p v-else-if="detailError" class="history-state history-error" role="alert">
          {{ detailError }}
        </p>
        <DiffView v-else :files="detailFiles" :truncated="detail?.truncated">
          <header class="commit-meta">
            <dl>
              <dt>Commit</dt>
              <dd class="mono">{{ selectedCommit.hash }}</dd>
              <dt>Autor</dt>
              <dd>{{ selectedCommit.author }} · {{ formatCommitDate(selectedCommit.time) }}</dd>
              <template v-if="selectedCommit.parents.length">
                <dt>{{ selectedCommit.parents.length > 1 ? 'Padres' : 'Padre' }}</dt>
                <dd class="mono">
                  <button
                    v-for="parent in selectedCommit.parents"
                    :key="parent"
                    class="parent-link"
                    type="button"
                    @click="emit('select', parent)"
                  >
                    {{ parent.slice(0, 10) }}
                  </button>
                </dd>
              </template>
            </dl>
            <pre class="commit-body">{{ detail?.body.trim() }}</pre>
          </header>
        </DiffView>
      </div>
    </template>
  </div>
</template>

<style scoped>
.history {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.history-state {
  margin: 0;
  padding: 32px 16px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.history-error {
  color: var(--danger, #ff8c8c);
}

.history-inline {
  margin: 0;
  padding: 6px 14px;
  font-size: 12px;
}

.commit-list {
  flex: 0 0 auto;
  overflow: auto;
}

.commit-list:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: -2px;
}

.history-splitter {
  flex: 0 0 5px;
  border-top: 1px solid var(--border-strong);
  background: var(--header-bg);
  cursor: row-resize;
}

.history-splitter:hover {
  background: var(--accent-soft);
}

.commit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
  padding-right: 12px;
  cursor: pointer;
  font-size: 12px;
}

.commit-row:hover {
  background: var(--accent-soft);
}

.commit-row[aria-selected='true'] {
  background: var(--accent-alt-soft);
  box-shadow: inset 2px 0 0 var(--accent-alt);
}

.commit-row.local .commit-subject {
  color: var(--muted);
  font-style: italic;
}

.commit-graph {
  flex: 0 0 auto;
}

.commit-subject {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-badge {
  display: inline-block;
  margin-right: 5px;
  padding: 0 4px;
  border: 1px solid;
  border-radius: 4px;
  font-family: Menlo, monospace;
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
}

.ref-badge.head {
  border-color: var(--ok);
  color: #031317;
  background: var(--ok);
}

.ref-badge.branch {
  border-color: var(--ok);
  color: var(--ok);
}

.ref-badge.remote {
  border-color: var(--accent);
  color: var(--accent);
}

.ref-badge.tag {
  border-color: var(--warning);
  color: var(--warning);
}

.commit-author {
  flex: 0 0 130px;
  overflow: hidden;
  color: var(--muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.commit-date {
  flex: 0 0 auto;
  color: var(--muted);
  font-family: Menlo, monospace;
  font-size: 11px;
}

.load-more {
  display: block;
  margin: 6px auto;
  padding: 4px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  color: var(--text);
  background: var(--pane-bg);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.load-more:hover:not(:disabled) {
  border-color: var(--accent);
}

.commit-detail {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.commit-meta {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}

.local-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.local-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.commit-meta dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 0 0 8px;
}

.commit-meta dt {
  color: var(--muted);
}

.commit-meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.mono {
  font-family: Menlo, monospace;
  font-size: 11px;
}

.parent-link {
  margin-right: 8px;
  padding: 0;
  border: 0;
  color: var(--accent);
  background: none;
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
}

.commit-body {
  margin: 0;
  font-family: Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
