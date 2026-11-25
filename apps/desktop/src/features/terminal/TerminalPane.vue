<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import type { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useErrorStore } from '../../core/app-stores.ts';
import { UI_DENSITY } from '../../core/ui-density.ts';
import { linkClient } from '../links/link-client.ts';
import { attachTerminalLinks } from '../links/terminal-links.ts';
import { buildAgentResumeCommand, type AgentState } from '../workspace/agent.ts';
import { parseOsc7, parseOscNotification, parseZuTermAgent, parseZuTermCommand } from './osc.ts';
import { ptyClient } from './pty-client.ts';
import { clampFontSize, resolveFontFamily, waitForFontLoad } from './terminal-font.ts';
import { coalesce, debounce } from './resize-scheduler.ts';
import { terminals } from './terminal-registry.ts';
import { runTerminalSearch } from './terminal-search.ts';
import TerminalSearchBar from './TerminalSearchBar.vue';
import { deferUntilNextFrame, webglAtlasSync, webglBudget } from './webgl-startup.ts';
import { THEME_CHANGE_EVENT, terminalTheme, type ThemeName } from '../theme/theme.ts';

const props = defineProps<{
  paneId: string;
  historyId: string | undefined;
  startCwd: string | undefined;
  restoreAgent: AgentState | undefined;
  active: boolean;
  localHost: string | undefined;
  theme: ThemeName;
  fontFamily?: string | undefined;
  fontSize?: number | undefined;
}>();
const emit = defineEmits<{
  cwd: [path: string];
  size: [cols: number, rows: number];
  title: [title: string];
  command: [command: string | null];
  agent: [agent: AgentState | null];
  attention: [kind: 'bell' | 'notification', message?: string];
  exit: [];
  focus: [];
  paste: [text: string];
}>();

const host = useTemplateRef<HTMLDivElement>('host');
const term = new Terminal({
  fontFamily: resolveFontFamily(props.fontFamily),
  fontSize: props.fontSize ? clampFontSize(props.fontSize) : UI_DENSITY.terminalFontSize,
  cursorBlink: true,
  // Bounded per pane: up to 32 panes share the webview's memory.
  scrollback: 10_000,
  theme: terminalTheme(props.theme),
});
const fit = new FitAddon();
const search = new SearchAddon();
term.loadAddon(fit);
term.loadAddon(search);

const searchVisible = ref(false);
const searchQuery = ref('');
const searchCaseSensitive = ref(false);
const searchRegex = ref(false);
const searchResultIndex = ref(-1);
const searchResultCount = ref(0);
const searchInvalidRegex = ref(false);
const searchFocusToken = ref(0);

function executeSearch(direction: 'next' | 'previous', incremental = false) {
  const outcome = runTerminalSearch(search, searchQuery.value, direction, {
    caseSensitive: searchCaseSensitive.value,
    regex: searchRegex.value,
    incremental,
  });
  searchInvalidRegex.value = outcome === 'invalid-regex';
  if (outcome === 'empty' || outcome === 'invalid-regex') {
    searchResultIndex.value = -1;
    searchResultCount.value = 0;
  }
}

function openSearch() {
  const selection = term.getSelection().trim();
  if (selection && !selection.includes('\n')) {
    searchQuery.value = selection;
  }
  searchVisible.value = true;
  searchFocusToken.value += 1;
  if (searchQuery.value) executeSearch('next', true);
}

function closeSearch() {
  searchVisible.value = false;
  searchInvalidRegex.value = false;
  searchResultIndex.value = -1;
  searchResultCount.value = 0;
  search.clearDecorations();
  term.focus();
}

function updateSearchQuery(value: string) {
  searchQuery.value = value;
  executeSearch('next', true);
}

function toggleSearchCaseSensitive() {
  searchCaseSensitive.value = !searchCaseSensitive.value;
  executeSearch('next');
}

function toggleSearchRegex() {
  searchRegex.value = !searchRegex.value;
  executeSearch('next');
}

let ptyId: number | undefined;
let unmounted = false;
// Folder that relative paths in the output are resolved against.
let currentCwd = props.startCwd;
let links: { dispose(): void } | undefined;
let searchResultsDisposable: { dispose(): void } | undefined;
let observer: ResizeObserver | undefined;
let webgl: WebglAddon | undefined;
let holdsWebglSlot = false;
let atlasRegistration: { dispose(): void } | undefined;

// Disposing the addon makes xterm fall back to its DOM renderer.
function dropWebgl() {
  if (holdsWebglSlot) webglBudget.release();
  holdsWebglSlot = false;
  atlasRegistration?.dispose();
  atlasRegistration = undefined;
  const addon = webgl;
  webgl = undefined;
  addon?.dispose();
}

// While a divider or the window is dragged: one fit per frame, and one PTY
// resize (so one redraw of the program) once the size stops changing.
const PTY_RESIZE_DELAY_MS = 50;
const fitFrame = coalesce(() => fit.fit(), {
  set: (callback) => window.requestAnimationFrame(callback),
  clear: (handle) => window.cancelAnimationFrame(handle),
});
const ptyResize = debounce(
  (cols: number, rows: number) => {
    if (ptyId !== undefined) ptyClient.resize(ptyId, cols, rows).catch(report);
  },
  {
    set: (callback) => window.setTimeout(callback, PTY_RESIZE_DELAY_MS),
    clear: (handle) => window.clearTimeout(handle),
  },
);

const errorStore = useErrorStore();
const report = (error: unknown) => {
  errorStore.report(error);
};

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
          holdsWebglSlot = webglBudget.acquire();
          if (!holdsWebglSlot) return;
          try {
            webgl = new WebglAddon();
            webgl.onContextLoss(dropWebgl);
            term.loadAddon(webgl);
            atlasRegistration = webglAtlasSync.register(webgl);
          } catch {
            // WebGL unavailable: xterm keeps its DOM renderer.
            dropWebgl();
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
    if (path) {
      currentCwd = path;
      emit('cwd', path);
    }
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
  term.parser.registerOscHandler(9, (payload) => {
    const message = parseOscNotification(9, payload);
    if (message) emit('attention', 'notification', message);
    return true;
  });
  term.parser.registerOscHandler(99, (payload) => {
    const message = parseOscNotification(99, payload);
    if (message) emit('attention', 'notification', message);
    return true;
  });
  term.onBell(() => emit('attention', 'bell'));
  term.onTitleChange((title) => emit('title', title));
  term.onData((data) => {
    if (ptyId !== undefined) ptyClient.write(ptyId, data).catch(report);
  });
  term.onResize(({ cols, rows }) => {
    emit('size', cols, rows);
    ptyResize.schedule(cols, rows);
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

  const searchResultsSub = search.onDidChangeResults(({ resultIndex, resultCount }) => {
    searchResultIndex.value = resultIndex;
    searchResultCount.value = resultCount;
  });
  searchResultsDisposable = searchResultsSub;

  terminals.register(props.paneId, {
    getSelection: () => term.getSelection(),
    paste: (text) => term.paste(text),
    clear: () => term.clear(),
    openSearch,
    hasForegroundProcess: () =>
      ptyId === undefined ? Promise.resolve(false) : ptyClient.hasForegroundProcess(ptyId),
  });
  links = attachTerminalLinks(term, host.value, {
    cwd: () => currentCwd,
    open: (target, cwd) => linkClient.open(target, cwd).catch(report),
  });
  observer = new ResizeObserver(() => fitFrame.schedule());
  observer.observe(host.value);

  try {
    const spawnSize = { cols: term.cols, rows: term.rows };
    const id = await ptyClient.spawn(
      props.startCwd,
      props.historyId,
      spawnSize.cols,
      spawnSize.rows,
      (event) => {
        if (event.event === 'output') term.write(event.data);
        else emit('exit');
      },
    );
    if (unmounted) ptyClient.kill(id).catch(report);
    else {
      ptyId = id;
      // Fits made while spawning (layout, fonts) found no PTY to resize.
      if (term.cols !== spawnSize.cols || term.rows !== spawnSize.rows) {
        ptyClient.resize(id, term.cols, term.rows).catch(report);
      }
      const resume = props.restoreAgent && buildAgentResumeCommand(props.restoreAgent);
      if (resume) ptyClient.write(id, `${resume}\n`).catch(report);
    }
  } catch (error) {
    term.write(`\r\nNo se pudo iniciar la shell: ${String(error)}\r\n`);
  }
  if (props.active) term.focus();
  document.fonts?.ready?.then(() => {
    if (!unmounted) fit.fit();
  });
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

let fontLoadSequence = 0;

watch(
  () => props.fontFamily,
  (nextFamily) => {
    const family = resolveFontFamily(nextFamily);
    const size = props.fontSize ? clampFontSize(props.fontSize) : UI_DENSITY.terminalFontSize;
    term.options.fontFamily = family;
    fit.fit();
    const seq = ++fontLoadSequence;
    void waitForFontLoad(family, size).then(() => {
      if (!unmounted && seq === fontLoadSequence) fit.fit();
    });
  },
);

watch(
  () => props.fontSize,
  (nextSize) => {
    if (nextSize) {
      term.options.fontSize = clampFontSize(nextSize);
      fit.fit();
    }
  },
);

onBeforeUnmount(() => {
  unmounted = true;
  observer?.disconnect();
  fitFrame.cancel();
  ptyResize.cancel();
  dropWebgl();
  searchResultsDisposable?.dispose();
  search.dispose();
  links?.dispose();
  window.removeEventListener(THEME_CHANGE_EVENT, updateTerminalTheme);
  terminals.unregister(props.paneId);
  if (ptyId !== undefined) ptyClient.kill(ptyId).catch(report);
  term.dispose();
});
</script>

<template>
  <div class="terminal-wrap">
    <TerminalSearchBar
      :visible="searchVisible"
      :query="searchQuery"
      :case-sensitive="searchCaseSensitive"
      :regex="searchRegex"
      :result-index="searchResultIndex"
      :result-count="searchResultCount"
      :invalid-regex="searchInvalidRegex"
      :focus-token="searchFocusToken"
      @update:query="updateSearchQuery"
      @toggle-case-sensitive="toggleSearchCaseSensitive"
      @toggle-regex="toggleSearchRegex"
      @next="executeSearch('next')"
      @previous="executeSearch('previous')"
      @close="closeSearch"
    />
    <div ref="host" class="terminal" />
  </div>
</template>

<style scoped>
.terminal-wrap {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.terminal {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--pane-bg);
}

.terminal :deep(.xterm) {
  height: 100%;
  box-sizing: border-box;
  padding: 8px 8px 10px;
}
</style>
