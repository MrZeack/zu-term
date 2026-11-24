<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue';
import { APP_NAME } from '../../core/brand.ts';
import { activeWorkHeading } from '../pane-actions/pane-actions.ts';

const props = defineProps<{
  visible: boolean;
  error?: string | undefined;
  activeItems?: string[] | undefined;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [saveWorkspace: boolean];
}>();

const primaryCloseBtn = useTemplateRef<HTMLButtonElement>('primaryCloseBtn');

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void nextTick(() => {
        primaryCloseBtn.value?.focus();
      });
    }
  },
);
</script>

<template>
  <div
    v-if="visible"
    class="modal-backdrop"
    role="presentation"
    @click.self="emit('cancel')"
    @keydown.esc="emit('cancel')"
  >
    <section
      class="close-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-dialog-title"
      aria-describedby="close-dialog-description"
    >
      <span class="dialog-kicker">SALIR DE {{ APP_NAME.toUpperCase() }}</span>
      <h2 id="close-dialog-title">¿Cerrar la aplicación?</h2>
      <p id="close-dialog-description">
        Puedes guardar el workspace actual y volver a abrir sus splits, carpetas y agentes.
      </p>
      <div v-if="activeItems && activeItems.length > 0" class="close-dialog__active" role="status">
        <strong>{{ activeWorkHeading(activeItems.length) }}</strong>
        <ul>
          <li v-for="(item, index) in activeItems" :key="index">{{ item }}</li>
        </ul>
      </div>
      <div class="close-dialog__actions">
        <button class="dialog-button dialog-button--quiet" type="button" @click="emit('cancel')">
          Cancelar
        </button>
        <button class="dialog-button" type="button" @click="emit('confirm', false)">
          Cerrar sin guardar workspace
        </button>
        <button
          ref="primaryCloseBtn"
          class="dialog-button dialog-button--primary"
          type="button"
          @click="emit('confirm', true)"
        >
          Cerrar y guardar workspace
        </button>
        <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>
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
  padding: 20px;
  background: rgba(4, 9, 12, 0.72);
  backdrop-filter: blur(6px);
}

.close-dialog {
  width: min(480px, 100%);
  padding: 24px;
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  background: var(--header-bg);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
}

.dialog-kicker {
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.close-dialog h2 {
  margin: 8px 0 8px;
  font-size: 21px;
}

.close-dialog p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.close-dialog__active {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 198, 92, 0.35);
  border-radius: 10px;
  background: rgba(255, 198, 92, 0.08);
  color: #ffd479;
  font-size: 12px;
  line-height: 1.45;
}

.close-dialog__active ul {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--text);
  font-family: Menlo, monospace;
  font-size: 11px;
}

.close-dialog__active li + li {
  margin-top: 3px;
}

.close-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}

.dialog-button {
  padding: 8px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text);
  background: var(--pane-bg);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.dialog-button:hover,
.dialog-button:focus-visible {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.dialog-button:focus-visible {
  outline: 2px solid var(--accent-alt);
  outline-offset: 2px;
}

.dialog-button--quiet {
  color: var(--muted);
}

.dialog-button--primary {
  border-color: var(--accent);
  color: #031317;
  background: linear-gradient(135deg, var(--accent), var(--accent-alt));
}

.dialog-button--primary:hover,
.dialog-button--primary:focus-visible {
  color: #031317;
  background: linear-gradient(135deg, var(--accent-alt), var(--accent));
}

.workspace-error {
  margin: 10px 0 0;
  color: var(--danger, #ff8c8c) !important;
  font-size: 11px !important;
}
</style>
