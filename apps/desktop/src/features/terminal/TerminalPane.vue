<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { parseOsc7 } from './osc.ts';
import { ptyClient } from './pty-client.ts';
import { terminals } from './terminal-registry.ts';

const props = defineProps<{
  paneId: string;
  startCwd: string | undefined;
  active: boolean;
  localHost: string | undefined;
}>();
const emit = defineEmits<{
  cwd: [path: string];
  title: [title: string];
  exit: [];
  focus: [];
  paste: [text: string];
}>();

const host = useTemplateRef<HTMLDivElement>('host');
const term = new Terminal({
  fontFamily: 'Menlo, "DejaVu Sans Mono", "Liberation Mono", monospace',
  fontSize: 13,
  cursorBlink: true,
  scrollback: 100_000,
  theme: { background: '#1b1e25', foreground: '#e6e8ee', cursor: '#50dc8c' },
});
const fit = new FitAddon();
term.loadAddon(fit);

let ptyId: number | undefined;
let unmounted = false;
let observer: ResizeObserver | undefined;

const report = (error: unknown) => console.error(error);

onMounted(async () => {
  if (!host.value) return;
  term.open(host.value);
  try {
    term.loadAddon(new WebglAddon());
  } catch {
    // WebGL unavailable: xterm keeps its DOM renderer.
  }
  fit.fit();

  term.parser.registerOscHandler(7, (payload) => {
    const path = parseOsc7(payload, props.localHost);
    if (path) emit('cwd', path);
    return true;
  });
  term.onTitleChange((title) => emit('title', title));
  term.onData((data) => {
    if (ptyId !== undefined) ptyClient.write(ptyId, data).catch(report);
  });
  term.onResize(({ cols, rows }) => {
    if (ptyId !== undefined) ptyClient.resize(ptyId, cols, rows).catch(report);
  });
  term.textarea?.addEventListener('focus', () => emit('focus'));
  // Native paste (CMD+V / Edit menu) must go through the paste guard, not
  // straight into xterm: intercept it before xterm's own listener.
  host.value.addEventListener(
    'paste',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      emit('paste', event.clipboardData?.getData('text/plain') ?? '');
    },
    true,
  );

  terminals.register(props.paneId, {
    getSelection: () => term.getSelection(),
    paste: (text) => term.paste(text),
    clear: () => term.clear(),
  });
  observer = new ResizeObserver(() => fit.fit());
  observer.observe(host.value);

  try {
    const id = await ptyClient.spawn(props.startCwd, term.cols, term.rows, (event) => {
      if (event.event === 'output') term.write(event.data);
      else emit('exit');
    });
    if (unmounted) ptyClient.kill(id).catch(report);
    else ptyId = id;
  } catch (error) {
    term.write(`\r\nNo se pudo iniciar la shell: ${String(error)}\r\n`);
  }
  if (props.active) term.focus();
});

watch(
  () => props.active,
  (active) => {
    if (active) term.focus();
  },
);

onBeforeUnmount(() => {
  unmounted = true;
  observer?.disconnect();
  terminals.unregister(props.paneId);
  if (ptyId !== undefined) ptyClient.kill(ptyId).catch(report);
  term.dispose();
});
</script>

<template>
  <div ref="host" class="terminal" />
</template>

<style scoped>
.terminal {
  flex: 1;
  min-height: 0;
  padding: 4px 0 0 6px;
  background: var(--pane-bg);
}
</style>
