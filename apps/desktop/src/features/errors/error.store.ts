import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface AppError {
  id: string;
  message: string;
  timestamp: number;
}

export const MAX_ERROR_HISTORY = 50;

let errorIdSequence = 0;
function nextErrorId(): string {
  errorIdSequence += 1;
  return `err_${Date.now()}_${errorIdSequence}`;
}

export function createErrorStore() {
  return defineStore('error-notifications', () => {
    const errors = ref<AppError[]>([]);
    const visible = ref(false);

    const hasErrors = computed(() => errors.value.length > 0);
    const errorCount = computed(() => errors.value.length);
    const latestError = computed(() => errors.value[0]);

    function report(errorOrMessage: unknown, fallbackMessage?: string): AppError {
      let message = '';
      if (typeof errorOrMessage === 'string') {
        message = errorOrMessage.trim();
      } else if (errorOrMessage instanceof Error) {
        message = errorOrMessage.message.trim();
      } else if (
        errorOrMessage &&
        typeof errorOrMessage === 'object' &&
        'message' in errorOrMessage &&
        typeof (errorOrMessage as { message: unknown }).message === 'string'
      ) {
        message = (errorOrMessage as { message: string }).message.trim();
      }

      if (!message) {
        message = fallbackMessage?.trim() || 'Ha ocurrido un error inesperado.';
      }

      // Deduplicate identical error within 2 seconds
      const now = Date.now();
      const first = errors.value[0];
      if (first && first.message === message && now - first.timestamp < 2000) {
        first.timestamp = now;
        visible.value = true;
        return first;
      }

      const item: AppError = {
        id: nextErrorId(),
        message,
        timestamp: now,
      };

      errors.value.unshift(item);
      if (errors.value.length > MAX_ERROR_HISTORY) {
        errors.value.length = MAX_ERROR_HISTORY;
      }

      visible.value = true;
      return item;
    }

    function dismiss(id: string): void {
      const index = errors.value.findIndex((e) => e.id === id);
      if (index !== -1) {
        errors.value.splice(index, 1);
      }
      if (errors.value.length === 0) {
        visible.value = false;
      }
    }

    function clear(): void {
      errors.value = [];
      visible.value = false;
    }

    function toggleVisible(): void {
      if (!hasErrors.value) {
        visible.value = false;
        return;
      }
      visible.value = !visible.value;
    }

    function setVisible(val: boolean): void {
      visible.value = val && hasErrors.value;
    }

    return {
      errors,
      visible,
      hasErrors,
      errorCount,
      latestError,
      report,
      dismiss,
      clear,
      toggleVisible,
      setVisible,
    };
  });
}
