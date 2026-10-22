<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue';

const props = defineProps<{ title: string; path: string; active: boolean; renaming: boolean }>();
const emit = defineEmits<{ rename: [name: string]; startRename: [] }>();

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
    <h2 v-else class="title" :title="title">{{ title }}</h2>
    <span class="path" :title="path">{{ path }}</span>
  </header>
</template>

<style scoped>
.pane-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 6px 12px;
  background: var(--header-bg);
  border-bottom: 2px solid transparent;
  user-select: none;
  min-width: 0;
}

.pane-header.active {
  border-bottom-color: var(--accent);
}

.title,
.title-input {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
}

.title-input {
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 0 6px;
  font-family: inherit;
}

.path {
  color: var(--muted);
  font-size: 12px;
  font-family: Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
  min-width: 0;
}
</style>
