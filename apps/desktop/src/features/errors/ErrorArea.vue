<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AppError } from './error.store.ts';

const props = defineProps<{
  errors: AppError[];
  visible: boolean;
}>();

const emit = defineEmits<{
  dismiss: [id: string];
  clear: [];
  toggle: [];
}>();

const expanded = ref(false);

const latest = computed(() => props.errors[0]);

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function handleDismissLatest() {
  if (latest.value) {
    emit('dismiss', latest.value.id);
  }
}
</script>

<template>
  <aside
    v-if="visible && errors.length > 0 && latest"
    class="error-area"
    role="alert"
    aria-live="assertive"
    aria-label="Área de mensajes de error"
  >
    <div class="error-bar">
      <div class="error-bar__info">
        <span class="error-icon" aria-hidden="true">⚠</span>
        <span class="error-kicker">ERROR</span>
        <span class="error-message" :title="latest.message">{{ latest.message }}</span>
        <span class="error-time">{{ formatTime(latest.timestamp) }}</span>
        <button
          v-if="errors.length > 1"
          class="error-expand-btn"
          type="button"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Ocultar lista ▲' : `Ver todos (${errors.length}) ▼` }}
        </button>
      </div>
      <div class="error-bar__actions">
        <button
          class="error-action-btn error-action-btn--clear"
          type="button"
          title="Limpiar todos los mensajes de error"
          @click="emit('clear')"
        >
          Limpiar
        </button>
        <button
          class="error-action-btn error-action-btn--minimize"
          type="button"
          aria-label="Minimizar área de errores"
          title="Minimizar área de errores"
          @click="emit('toggle')"
        >
          <span aria-hidden="true">−</span>
        </button>
        <button
          class="error-action-btn error-action-btn--close"
          type="button"
          aria-label="Cerrar"
          title="Descartar este error"
          @click="handleDismissLatest"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>

    <div v-if="expanded && errors.length > 1" class="error-list">
      <div v-for="err in errors" :key="err.id" class="error-list__item">
        <span class="error-list__time">{{ formatTime(err.timestamp) }}</span>
        <span class="error-list__message">{{ err.message }}</span>
        <button
          class="error-list__dismiss"
          type="button"
          aria-label="Descartar error"
          title="Descartar"
          @click="emit('dismiss', err.id)"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.error-area {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--danger, #ff8c8c);
  background: linear-gradient(90deg, rgba(46, 12, 16, 0.98), rgba(28, 9, 12, 0.98));
  color: var(--text);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  font-size: 11px;
  user-select: text;
  z-index: 15;
}

.error-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 32px;
  padding: 4px 10px;
}

.error-bar__info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.error-icon {
  flex: 0 0 auto;
  color: var(--danger, #ff8c8c);
  font-size: 13px;
  font-weight: 800;
}

.error-kicker {
  flex: 0 0 auto;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 140, 140, 0.2);
  color: var(--danger, #ff8c8c);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.error-message {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: #ffdede;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-time {
  flex: 0 0 auto;
  color: var(--muted);
  font-family: Menlo, monospace;
  font-size: 9px;
}

.error-expand-btn {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: 1px solid rgba(255, 140, 140, 0.35);
  border-radius: 4px;
  background: rgba(255, 140, 140, 0.12);
  color: #ffc4c4;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.error-expand-btn:hover {
  background: rgba(255, 140, 140, 0.22);
  color: #ffffff;
}

.error-bar__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.error-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border: 1px solid rgba(255, 140, 140, 0.3);
  border-radius: 4px;
  background: rgba(255, 140, 140, 0.1);
  color: #ffdede;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}

.error-action-btn:hover {
  background: rgba(255, 140, 140, 0.25);
  color: #ffffff;
}

.error-action-btn--close {
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 12px;
}

.error-list {
  max-height: 160px;
  overflow-y: auto;
  border-top: 1px solid rgba(255, 140, 140, 0.2);
  background: rgba(18, 5, 8, 0.95);
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.error-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 4px;
  background: rgba(255, 140, 140, 0.06);
}

.error-list__item:hover {
  background: rgba(255, 140, 140, 0.12);
}

.error-list__time {
  flex: 0 0 auto;
  color: var(--muted);
  font-family: Menlo, monospace;
  font-size: 9px;
}

.error-list__message {
  flex: 1 1 auto;
  color: #ffcccc;
  font-size: 11px;
}

.error-list__dismiss {
  flex: 0 0 auto;
  padding: 0 4px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}

.error-list__dismiss:hover {
  color: var(--danger, #ff8c8c);
}
</style>
