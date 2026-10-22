<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue';

const props = defineProps<{
  title: string;
  command?: string | undefined;
  path: string;
  active: boolean;
  renaming: boolean;
}>();
const emit = defineEmits<{
  rename: [name: string];
  startRename: [];
  close: [];
}>();

const draft = ref('');
const input = useTemplateRef<HTMLInputElement>('input');

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
  <header class="pane-header" :class="{ active }" @dblclick="emit('startRename')">
    <input
      v-if="renaming"
      ref="input"
      v-model="draft"
      class="title-input"
      maxlength="80"
      aria-label="Nombre del split"
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
  gap: 14px;
  min-height: 42px;
  padding: 7px 12px 8px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border);
  user-select: none;
  min-width: 0;
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
  font-size: 15px;
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
  gap: 6px;
  flex: 0 0 auto;
  max-width: 42%;
  padding: 4px 8px;
  border: 1px solid var(--accent-alt-border);
  border-radius: 999px;
  color: var(--accent-alt);
  background: var(--accent-alt-soft);
  font-family: Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent-alt);
  box-shadow: 0 0 0 3px var(--accent-alt-soft);
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
  font-size: 12px;
  font-family: Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
  min-width: 0;
  max-width: 48%;
}

.pane-close {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 18px;
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
