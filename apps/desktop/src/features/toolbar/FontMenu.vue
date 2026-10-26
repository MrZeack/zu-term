<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import {
  findTerminalFont,
  TERMINAL_FONTS,
  type TerminalFontId,
} from '../terminal/terminal-font.ts';

const props = defineProps<{
  modelValue: TerminalFontId;
}>();

const emit = defineEmits<{
  'update:modelValue': [id: TerminalFontId];
}>();

const open = ref(false);
const menu = useTemplateRef<HTMLDivElement>('menu');
const activeFont = computed(() => findTerminalFont(props.modelValue));

function selectFont(id: TerminalFontId) {
  open.value = false;
  emit('update:modelValue', id);
}

function closeOnOutside(event: PointerEvent) {
  if (!open.value || menu.value?.contains(event.target as Node)) return;
  open.value = false;
}

onMounted(() => document.addEventListener('pointerdown', closeOnOutside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutside));
</script>

<template>
  <div ref="menu" class="font-menu" @keydown.esc="open = false">
    <button
      class="font-trigger"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="`Seleccionar tipografía de terminal (actual ${activeFont.name})`"
      :title="`Tipografía de terminal · ${activeFont.name}`"
      @click="open = !open"
    >
      <span class="font-trigger__icon" aria-hidden="true">Aa</span>
      <span class="font-trigger__copy">
        <small>FUENTE</small>
        <strong>{{ activeFont.name }}</strong>
      </span>
      <span class="font-trigger__arrow" aria-hidden="true">⌄</span>
    </button>
    <div v-if="open" class="font-popover" role="menu" @click.stop>
      <div class="font-popover__header">
        <span>TIPOGRAFÍA</span>
        <small>6 LIBRES + SISTEMA</small>
      </div>
      <div class="font-list">
        <button
          v-for="font in TERMINAL_FONTS"
          :key="font.id"
          class="font-option"
          :class="{ active: font.id === modelValue }"
          type="button"
          role="menuitem"
          @click="selectFont(font.id)"
        >
          <div class="font-option__info">
            <div class="font-option__row">
              <strong class="font-option__name" :style="{ fontFamily: font.family }">{{
                font.name
              }}</strong>
              <span class="font-option__category">{{ font.category }}</span>
            </div>
            <small class="font-option__desc">{{ font.description }}</small>
          </div>
          <span v-if="font.id === modelValue" class="font-option__check" aria-hidden="true">✓</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.font-menu {
  position: relative;
  display: inline-flex;
}

.font-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 110px;
  max-width: 150px;
  padding: 4px 7px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: var(--header-bg);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    transform 140ms ease;
}

.font-trigger:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  transform: translateY(-1px);
}

.font-trigger:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: 2px;
}

.font-trigger__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: serif;
  font-size: 11px;
  font-weight: 700;
  user-select: none;
}

.font-trigger__copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  line-height: 1.1;
}

.font-trigger__copy small {
  color: var(--muted);
  font-size: 7.5px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.font-trigger__copy strong {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-trigger__arrow {
  color: var(--muted);
  font-size: 11px;
  line-height: 1;
}

.font-popover {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 0;
  display: flex;
  flex-direction: column;
  width: 260px;
  padding: 8px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--header-bg);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.4);
}

.font-popover__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 6px 8px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.font-popover__header small {
  color: var(--accent);
  font-size: 7.5px;
  font-weight: 700;
}

.font-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 290px;
  margin-top: 4px;
  overflow-y: auto;
}

.font-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 120ms ease;
}

.font-option:hover,
.font-option.active {
  background: var(--accent-soft);
}

.font-option__info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.font-option__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.font-option__name {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.font-option__category {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--border);
  color: var(--muted);
  font-size: 8px;
  font-weight: 600;
  text-transform: uppercase;
}

.font-option.active .font-option__category {
  background: var(--accent-border);
  color: var(--accent);
}

.font-option__desc {
  color: var(--muted);
  font-size: 9px;
  line-height: 1.2;
}

.font-option__check {
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
}
</style>
