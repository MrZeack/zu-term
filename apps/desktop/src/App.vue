<script setup lang="ts">
import { homeDir } from '@tauri-apps/api/path';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useLayoutStore } from './core/app-stores.ts';
import { paneMenuItems } from './features/context-menu/menu-items.ts';
import { showPaneMenu } from './features/context-menu/pane-menu.ts';
import LayoutView from './features/layout/LayoutView.vue';
import { createPaneActions } from './features/pane-actions/pane-actions.ts';
import { shortcutAction } from './features/shortcuts/shortcuts.ts';
import { terminals } from './features/terminal/terminal-registry.ts';

const store = useLayoutStore();
const home = ref<string>();
const ready = ref(false);
const isMac = navigator.userAgent.includes('Mac');

const actions = createPaneActions({
  store,
  terminal: terminals.get,
  clipboard: { readText, writeText },
  closeWindow: () => getCurrentWindow().close(),
});

const report = (error: unknown) => console.error(error);

function onKeydown(event: KeyboardEvent) {
  const action = shortcutAction(event, isMac);
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  actions.run(action, store.activeId).catch(report);
}

function openMenu(paneId: string) {
  const hasSelection = Boolean(terminals.get(paneId)?.getSelection());
  showPaneMenu(paneMenuItems({ hasSelection }), (action) => {
    actions.run(action, paneId).catch(report);
  }).catch(report);
}

onMounted(async () => {
  // Capture phase: runs before xterm handles the key.
  window.addEventListener('keydown', onKeydown, true);
  try {
    home.value = await homeDir();
    store.init(home.value);
  } catch (error) {
    report(error);
  }
  ready.value = true;
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true));
</script>

<template>
  <LayoutView
    v-if="ready"
    :home="home"
    @menu="openMenu"
    @exit="(paneId) => actions.run('close', paneId).catch(report)"
  />
</template>
