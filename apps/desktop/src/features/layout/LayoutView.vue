<script setup lang="ts">
// Panes render as a flat keyed list positioned from the split tree, so a split
// never remounts (and kills) an existing terminal.
import { computed, useTemplateRef } from 'vue';
import { useLayoutStore } from '../../core/app-stores.ts';
import PaneHeader from '../pane-header/PaneHeader.vue';
import { paneTitle, shortPath } from '../pane-header/pane-title.ts';
import TerminalPane from '../terminal/TerminalPane.vue';
import { computeGeometry, ratioAt, type Divider, type Rect } from './layout-geometry.ts';

const props = defineProps<{ home: string | undefined }>();
const emit = defineEmits<{ menu: [paneId: string]; exit: [paneId: string] }>();

const PATH_MAX = 60;
const store = useLayoutStore();
const container = useTemplateRef<HTMLDivElement>('container');
const geometry = computed(() => computeGeometry(store.root));

const pct = (n: number) => `${n * 100}%`;
const paneStyle = (rect: Rect) => ({
  left: pct(rect.x),
  top: pct(rect.y),
  width: pct(rect.width),
  height: pct(rect.height),
});

function dividerStyle({ direction, position, area }: Divider) {
  return direction === 'row'
    ? { left: pct(area.x + area.width * position), top: pct(area.y), height: pct(area.height) }
    : { top: pct(area.y + area.height * position), left: pct(area.x), width: pct(area.width) };
}

function startDrag(divider: Divider, down: PointerEvent) {
  const target = down.currentTarget as HTMLElement;
  target.setPointerCapture(down.pointerId);
  const move = (event: PointerEvent) => {
    const box = container.value?.getBoundingClientRect();
    if (!box) return;
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    store.resize(divider.splitId, ratioAt(divider.area, divider.direction, x, y));
  };
  const stop = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', stop);
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', stop);
}

function openMenu(paneId: string) {
  store.focus(paneId);
  emit('menu', paneId);
}
</script>

<template>
  <div ref="container" class="layout">
    <section
      v-for="{ id, rect } in geometry.panes"
      :key="id"
      class="pane"
      :class="{ active: store.activeId === id }"
      :style="paneStyle(rect)"
      @mousedown="store.focus(id)"
      @contextmenu.prevent="openMenu(id)"
    >
      <PaneHeader
        :title="paneTitle(store.panes[id] ?? {})"
        :path="shortPath(store.panes[id]?.cwd, props.home, PATH_MAX)"
        :active="store.activeId === id"
        :renaming="store.renamingId === id"
        @start-rename="store.startRename(id)"
        @rename="(name) => store.rename(id, name)"
      />
      <TerminalPane
        :pane-id="id"
        :start-cwd="store.panes[id]?.startCwd"
        :active="store.activeId === id && store.renamingId !== id"
        @cwd="(path) => store.setCwd(id, path)"
        @title="(title) => store.setTitle(id, title)"
        @focus="store.focus(id)"
        @exit="emit('exit', id)"
      />
    </section>
    <div
      v-for="divider in geometry.dividers"
      :key="divider.splitId"
      class="divider"
      :class="divider.direction"
      :style="dividerStyle(divider)"
      @pointerdown.prevent="(event) => startDrag(divider, event)"
    />
  </div>
</template>

<style scoped>
.layout {
  position: relative;
  width: 100%;
  height: 100%;
}

.pane {
  position: absolute;
  display: flex;
  flex-direction: column;
  padding: 2px;
  min-width: 0;
  min-height: 0;
}

.pane > * {
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
}

.pane > :last-child {
  border-bottom: 1px solid var(--border);
}

.divider {
  position: absolute;
  z-index: 1;
}

.divider.row {
  width: 6px;
  transform: translateX(-3px);
  cursor: col-resize;
}

.divider.column {
  height: 6px;
  transform: translateY(-3px);
  cursor: row-resize;
}

.divider:hover {
  background: var(--accent);
  opacity: 0.4;
}
</style>
