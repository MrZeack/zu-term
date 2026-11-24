<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { formatSearchCounter } from './terminal-search.ts';

const props = defineProps<{
  visible: boolean;
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  resultIndex: number;
  resultCount: number;
  invalidRegex: boolean;
  focusToken: number;
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  toggleCaseSensitive: [];
  toggleRegex: [];
  next: [];
  previous: [];
  close: [];
}>();

const input = useTemplateRef<HTMLInputElement>('input');

const counter = computed(() =>
  formatSearchCounter(props.query, props.resultIndex, props.resultCount, props.invalidRegex),
);

async function focusInput() {
  await nextTick();
  input.value?.focus();
  input.value?.select();
}

watch(
  () => [props.visible, props.focusToken] as const,
  ([visible]) => {
    if (visible) void focusInput();
  },
);

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('close');
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) emit('previous');
    else emit('next');
  }
}
</script>

<template>
  <div
    v-if="visible"
    class="search-bar"
    role="search"
    aria-label="Buscar en terminal"
    @mousedown.stop
  >
    <input
      ref="input"
      :value="query"
      class="search-input"
      :class="{ invalid: invalidRegex }"
      type="text"
      placeholder="Buscar en scrollback…"
      aria-label="Texto a buscar"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      @keydown="onKeydown"
    />
    <span v-if="counter" class="search-counter" :class="{ invalid: invalidRegex }">{{
      counter
    }}</span>
    <button
      class="search-btn"
      :class="{ active: caseSensitive }"
      type="button"
      title="Distinguir mayúsculas y minúsculas"
      aria-label="Distinguir mayúsculas y minúsculas"
      :aria-pressed="caseSensitive"
      @click="emit('toggleCaseSensitive')"
    >
      Aa
    </button>
    <button
      class="search-btn"
      :class="{ active: regex }"
      type="button"
      title="Usar expresión regular"
      aria-label="Usar expresión regular"
      :aria-pressed="regex"
      @click="emit('toggleRegex')"
    >
      .*
    </button>
    <button
      class="search-btn"
      type="button"
      title="Coincidencia anterior (Shift+Enter)"
      aria-label="Coincidencia anterior"
      :disabled="!query || invalidRegex"
      @click="emit('previous')"
    >
      ↑
    </button>
    <button
      class="search-btn"
      type="button"
      title="Siguiente coincidencia (Enter)"
      aria-label="Siguiente coincidencia"
      :disabled="!query || invalidRegex"
      @click="emit('next')"
    >
      ↓
    </button>
    <button
      class="search-btn search-close"
      type="button"
      title="Cerrar búsqueda (Esc)"
      aria-label="Cerrar búsqueda"
      @click="emit('close')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.search-bar {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: calc(100% - 24px);
  padding: 4px 6px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--header-bg);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
}

.search-input {
  width: 170px;
  min-width: 80px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  background: var(--pane-bg);
  font-family: Menlo, monospace;
  font-size: 11px;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-input.invalid {
  border-color: var(--danger, #ff8c8c);
}

.search-counter {
  min-width: 34px;
  padding: 0 3px;
  color: var(--muted);
  font-family: Menlo, monospace;
  font-size: 10px;
  text-align: center;
  white-space: nowrap;
}

.search-counter.invalid {
  color: var(--danger, #ff8c8c);
}

.search-btn {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
  font-family: Menlo, monospace;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.search-btn:hover:not(:disabled) {
  color: var(--text);
  background: var(--accent-soft);
}

.search-btn.active {
  border-color: var(--accent-border);
  color: var(--accent);
  background: var(--accent-soft);
}

.search-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.search-close {
  font-size: 14px;
}
</style>
