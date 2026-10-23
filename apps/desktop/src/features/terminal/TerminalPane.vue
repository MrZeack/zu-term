<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { UI_DENSITY } from '../../core/ui-density.ts';
import { buildAgentResumeCommand, type AgentState } from '../workspace/agent.ts';
import { parseOsc7, parseZuTermAgent, parseZuTermCommand } from './osc.ts';
import { ptyClient } from './pty-client.ts';
import { terminals } from './terminal-registry.ts';
import { deferUntilNextFrame } from './webgl-startup.ts';
import { THEME_CHANGE_EVENT, terminalTheme, type ThemeName } from '../theme/theme.ts';

const props = defineProps<{
  paneId: string;
  historyId: string | undefined;
  startCwd: string | undefined;
  restoreAgent: AgentState | undefined;
  active: boolean;
  localHost: string | undefined;
  theme: ThemeName;
}>();
const emit = defineEmits<{
  cwd: [path: string];
  size: [cols: number, rows: number];
  title: [title: string];
  command: [command: string | null];
  agent: [agent: AgentState | null];
  exit: [];
  focus: [];
  paste: [text: string];
}>();

const host = useTemplateRef<HTMLDivElement>('host');
const term = new Terminal({
  fontFamily: 'Menlo, "DejaVu Sans Mono", "Liberation Mono", monospace',
  fontSize: UI_DENSITY.terminalFontSize,
  cursorBlink: true,
  // Bounded per pane: up to 32 panes share the webview's memory.
  scrollback: 10_000,
  theme: terminalTheme(props.theme),
});
const fit = new FitAddon();
term.loadAddon(fit);

let ptyId: number | undefined;
let unmounted = false;
let observer: ResizeObserver | undefined;

const report = (error: unknown) => console.error(error);

function updateTerminalTheme(event?: Event) {
  const theme = (event as CustomEvent<ThemeName> | undefined)?.detail;
  term.options.theme = terminalTheme(theme === 'mint' || theme === 'cyan' ? theme : props.theme);
}

onMounted(async () => {
  if (!host.value) return;
  term.open(host.value);
  fit.fit();
  deferUntilNextFrame(
    () => {
      void import('@xterm/addon-webgl')
        .then(({ WebglAddon }) => {
          if (unmounted) return;
          try {
            term.loadAddon(new WebglAddon());
          } catch {
            // WebGL unavailable: xterm keeps its DOM renderer.
          }
        })
        .catch(() => {
          // Loading the optional renderer must never delay the terminal.
        });
    },
    (callback) => window.requestAnimationFrame(callback),
  );

  term.parser.registerOscHandler(7, (payload) => {
    const path = parseOsc7(payload, props.localHost);
    if (path) emit('cwd', path);
    return true;
  });
  term.parser.registerOscHandler(1337, (payload) => {
    const command = parseZuTermCommand(payload);
    if (command !== undefined) {
      emit('command', command);
      return true;
    }
    const agent = parseZuTermAgent(payload);
    if (agent === undefined) return false;
    emit('agent', agent);
    return true;
  });
  term.onTitleChange((title) => emit('title', title));
  term.onData((data) => {
    if (ptyId !== undefined) ptyClient.write(ptyId, data).catch(report);
  });
  term.onResize(({ cols, rows }) => {
    emit('size', cols, rows);
    if (ptyId !== undefined) ptyClient.resize(ptyId, cols, rows).catch(report);
  });
  emit('size', term.cols, term.rows);
  term.textarea?.addEventListener('focus', () => emit('focus'));
  window.addEventListener(THEME_CHANGE_EVENT, updateTerminalTheme);
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
    const id = await ptyClient.spawn(
      props.startCwd,
      props.historyId,
      term.cols,
      term.rows,
      (event) => {
        if (event.event === 'output') term.write(event.data);
        else emit('exit');
      },
    );
    if (unmounted) ptyClient.kill(id).catch(report);
    else {
      ptyId = id;
      const resume = props.restoreAgent && buildAgentResumeCommand(props.restoreAgent);
      if (resume) ptyClient.write(id, `${resume}\n`).catch(report);
    }
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

watch(
  () => props.theme,
  (nextTheme) => {
    term.options.theme = terminalTheme(nextTheme);
  },
);

onBeforeUnmount(() => {
  unmounted = true;
  observer?.disconnect();
  window.removeEventListener(THEME_CHANGE_EVENT, updateTerminalTheme);
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
  padding: 8px 8px 10px;
  background: var(--pane-bg);
}
</style>
