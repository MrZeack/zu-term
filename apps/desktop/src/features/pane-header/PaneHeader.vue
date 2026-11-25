<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { UI_DENSITY } from '../../core/ui-density.ts';
import { formatGitStatus, formatGitStatusTooltip, type GitStatusSummary } from '../git/git.ts';
import type { PaneAttention } from '../layout/layout.store.ts';
import type { AgentSessionTone } from '../workspace/agent.ts';

const props = defineProps<{
  title: string;
  command?: string | undefined;
  agentTone?: AgentSessionTone | undefined;
  path: string;
  branch?: string | undefined;
  gitStatus?: GitStatusSummary | undefined;
  active: boolean;
  renaming: boolean;
  attention?: PaneAttention | undefined;
  canZoom?: boolean;
  zoomed?: boolean;
  draggable?: boolean;
  dragging?: boolean;
}>();
const emit = defineEmits<{
  rename: [name: string];
  startRename: [];
  toggleZoom: [];
  close: [];
  dragstart: [event: DragEvent];
  dragend: [];
}>();

const draft = ref('');
const input = useTemplateRef<HTMLInputElement>('input');
const densityStyle = {
  '--pane-header-height': `${UI_DENSITY.paneHeaderHeight}px`,
  '--pane-title-font-size': `${UI_DENSITY.paneTitleFontSize}px`,
  '--pane-meta-font-size': `${UI_DENSITY.paneMetaFontSize}px`,
};

const gitStatusText = computed(() => formatGitStatus(props.gitStatus));
const branchTooltip = computed(() => {
  if (!props.branch) return '';
  const diff = formatGitStatusTooltip(props.gitStatus);
  return diff ? `Rama git: ${props.branch} (${diff})` : `Rama git: ${props.branch}`;
});
const attentionLabel = computed(() => {
  if (!props.attention) return '';
  if (props.attention.kind === 'done') return 'Listo';
  return 'Aviso';
});
const attentionTooltip = computed(() => {
  if (!props.attention) return '';
  if (props.attention.kind === 'done') {
    return props.attention.message ? `Terminó: ${props.attention.message}` : 'Comando finalizado';
  }
  return props.attention.message || 'Este split requiere atención';
});

watch(
  () => props.renaming,
  async (renaming) => {
    if (!renaming) return;
    draft.value = props.title;
    await nextTick();
    input.value?.select();
  },
);

const commit = () => emit('rename', draft.value);
</script>

<template>
  <header
    class="pane-header"
    :class="{ active, dragging }"
    :style="densityStyle"
    :draggable="draggable"
    title="Arrastra: borde para reorganizar el grupo, centro para intercambiar"
    @dblclick="emit('startRename')"
    @dragstart="emit('dragstart', $event)"
    @dragend="emit('dragend')"
  >
    <input
      v-if="renaming"
      ref="input"
      v-model="draft"
      class="title-input"
      maxlength="80"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      aria-label="Nombre del split"
      draggable="false"
      @keydown.enter.prevent="commit"
      @keydown.esc.prevent="emit('rename', title)"
      @blur="commit"
    />
    <div v-else class="title-row">
      <span v-if="command" class="command-badge" :class="agentTone && `agent-${agentTone}`">
        <span class="command-dot" aria-hidden="true" />
        {{ command }}
      </span>
      <span v-else-if="attention" class="attention-badge" :title="attentionTooltip">
        <span class="attention-dot" aria-hidden="true" />
        {{ attentionLabel }}
      </span>
      <h2 class="title" :title="title">{{ title }}</h2>
      <span v-if="branch" class="branch-badge" :title="branchTooltip">
        <span class="branch-icon" aria-hidden="true">⎇</span>
        <span class="branch-name">{{ branch }}</span>
        <span v-if="gitStatusText" class="branch-status">{{ gitStatusText }}</span>
      </span>
    </div>
    <span class="path" :title="path">{{ path }}</span>
    <button
      v-if="canZoom || zoomed"
      class="pane-zoom"
      :class="{ active: zoomed }"
      type="button"
      :aria-label="zoomed ? 'Restaurar distribución de splits' : 'Maximizar split'"
      :title="
        zoomed
          ? 'Restaurar splits (⌘⇧↵ / Ctrl+Shift+Enter)'
          : 'Maximizar split (⌘⇧↵ / Ctrl+Shift+Enter)'
      "
      draggable="false"
      @click.stop="emit('toggleZoom')"
    >
      <span aria-hidden="true">{{ zoomed ? '⤡' : '⤢' }}</span>
    </button>
    <button
      class="pane-close"
      type="button"
      aria-label="Cerrar split"
      title="Cerrar split"
      draggable="false"
      @click.stop="emit('close')"
    >
      <span aria-hidden="true">×</span>
    </button>
  </header>
</template>

<style scoped>
.pane-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--pane-header-height);
  padding: 4px 8px 5px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border);
  user-select: none;
  min-width: 0;
  cursor: grab;
}

.pane-header.dragging {
  cursor: grabbing;
  opacity: 0.6;
}

.pane-header::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent-alt));
  content: '';
  opacity: 0;
  transition: opacity 140ms ease;
}

.pane-header.active::after {
  opacity: 1;
}

.title,
.title-input {
  margin: 0;
  font-size: var(--pane-title-font-size);
  font-weight: 750;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.command-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  max-width: 42%;
  padding: 3px 6px;
  border: 1px solid var(--accent-alt-border);
  border-radius: 999px;
  color: var(--accent-alt);
  background: var(--accent-alt-soft);
  font-family: Menlo, monospace;
  font-size: var(--pane-meta-font-size);
  font-weight: 700;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-badge.agent-with-id {
  color: var(--agent-with-id);
}

.command-badge.agent-without-id {
  color: var(--agent-without-id);
}

.branch-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  max-width: 42%;
  padding: 2px 6px;
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-soft);
  font-family: Menlo, monospace;
  font-size: var(--pane-meta-font-size);
  font-weight: 700;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-icon {
  font-size: 11px;
  line-height: 1;
  opacity: 0.85;
}

.branch-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-status {
  padding-left: 2px;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.02em;
  opacity: 0.9;
}

.command-dot {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent-alt);
  box-shadow: 0 0 0 2px var(--accent-alt-soft);
}

.attention-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  padding: 2px 6px;
  border: 1px solid rgba(255, 198, 92, 0.45);
  border-radius: 999px;
  color: #ffd479;
  background: rgba(255, 198, 92, 0.14);
  font-family: Menlo, monospace;
  font-size: var(--pane-meta-font-size);
  font-weight: 700;
  white-space: nowrap;
}

.attention-dot {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #ffd479;
  box-shadow: 0 0 0 2px rgba(255, 198, 92, 0.25);
}

.title-input {
  flex: 1;
  color: var(--text);
  background: var(--pane-bg);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 4px 7px;
  font-family: inherit;
}

.path {
  flex: 1;
  color: var(--muted);
  font-size: var(--pane-meta-font-size);
  font-family: Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: ltr;
  text-align: right;
  min-width: 0;
  max-width: 48%;
}

.pane-zoom,
.pane-close {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 15px;
  line-height: 1;
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.pane-zoom {
  font-size: 11px;
}

.pane-zoom.active {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--accent-soft);
}

.pane-zoom:hover,
.pane-close:hover {
  border-color: var(--accent-alt-border);
  color: var(--text);
  background: var(--accent-alt-soft);
}

.pane-zoom:focus-visible,
.pane-close:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: 2px;
}
</style>
