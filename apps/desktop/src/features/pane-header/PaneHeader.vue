<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue';
import { UI_DENSITY } from '../../core/ui-density.ts';

const props = defineProps<{
  title: string;
  command?: string | undefined;
  path: string;
  active: boolean;
  renaming: boolean;
  draggable?: boolean;
  dragging?: boolean;
}>();
const emit = defineEmits<{
  rename: [name: string];
  startRename: [];
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
      aria-label="Nombre del split"
      draggable="false"
      @keydown.enter.prevent="commit"
      @keydown.esc.prevent="emit('rename', title)"
      @blur="commit"
    />
    <div v-else class="title-row">
      <span v-if="command" class="command-badge">
        <span class="command-dot" aria-hidden="true" />
        {{ command }}
      </span>
      <h2 class="title" :title="title">{{ title }}</h2>
    </div>
    <span class="path" :title="path">{{ path }}</span>
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

.command-dot {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent-alt);
  box-shadow: 0 0 0 2px var(--accent-alt-soft);
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

.pane-close:hover {
  border-color: var(--accent-alt-border);
  color: var(--text);
  background: var(--accent-alt-soft);
}

.pane-close:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: 2px;
}
</style>
