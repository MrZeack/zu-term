<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  title: string;
  description: string;
  initialName?: string;
  error?: string | undefined;
}>();

const emit = defineEmits<{
  cancel: [];
  submit: [name: string];
}>();

const draft = ref('');

watch(
  () => props.visible,
  (visible) => {
    if (visible) draft.value = props.initialName ?? '';
  },
);

function submit() {
  const name = draft.value.trim();
  if (name) emit('submit', name);
}
</script>

<template>
  <div v-if="visible" class="workspace-dialog-backdrop" @click.self="emit('cancel')">
    <section
      class="workspace-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-dialog-title"
    >
      <span class="dialog-kicker">WORKSPACE</span>
      <h2 id="workspace-dialog-title">{{ title }}</h2>
      <p>{{ description }}</p>
      <form @submit.prevent="submit">
        <label for="workspace-name">Nombre</label>
        <input
          id="workspace-name"
          v-model="draft"
          maxlength="80"
          autocomplete="off"
          autofocus
          required
        />
        <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>
        <div class="workspace-dialog__actions">
          <button class="dialog-button dialog-button--quiet" type="button" @click="emit('cancel')">
            Cancelar
          </button>
          <button class="dialog-button dialog-button--primary" type="submit">Guardar</button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.workspace-dialog-backdrop {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(4, 9, 12, 0.72);
  backdrop-filter: blur(6px);
}

.workspace-dialog {
  width: min(420px, 100%);
  padding: 22px;
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

.workspace-dialog h2 {
  margin: 8px 0;
  font-size: 20px;
}

.workspace-dialog p {
  margin: 0 0 16px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.workspace-dialog label {
  display: block;
  margin-bottom: 5px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

.workspace-dialog input {
  box-sizing: border-box;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text);
  background: var(--pane-bg);
  font: inherit;
  font-size: 13px;
}

.workspace-dialog input:focus {
  border-color: var(--accent);
  outline: 2px solid var(--accent-alt);
  outline-offset: 1px;
}

.workspace-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
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

.workspace-error {
  color: var(--danger, #ff8c8c) !important;
}
</style>
