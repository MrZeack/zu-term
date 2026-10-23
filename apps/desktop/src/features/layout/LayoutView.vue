<script setup lang="ts">
// Panes render as a flat keyed list positioned from the split tree, so a split
// never remounts (and kills) an existing terminal.
import { computed, ref, useTemplateRef } from 'vue';
import { useLayoutStore } from '../../core/app-stores.ts';
import PaneHeader from '../pane-header/PaneHeader.vue';
import { paneTitle, shortPath } from '../pane-header/pane-title.ts';
import TerminalPane from '../terminal/TerminalPane.vue';
import { contextMenuPosition, type ContextMenuPosition } from '../context-menu/position.ts';
import type { ThemeName } from '../theme/theme.ts';
import { computeGeometry, ratioAt, type Divider, type Rect } from './layout-geometry.ts';
import { dropZoneAt, type DropZone } from './layout-dnd.ts';
import { movePane } from './layout-tree.ts';

const props = defineProps<{
  home: string | undefined;
  localHost: string | undefined;
  theme: ThemeName;
}>();
const emit = defineEmits<{
  menu: [paneId: string, position: ContextMenuPosition];
  size: [paneId: string, cols: number, rows: number];
  exit: [paneId: string];
  paste: [paneId: string, text: string];
}>();

const PATH_MAX = 60;
const store = useLayoutStore();
const container = useTemplateRef<HTMLDivElement>('container');
const geometry = computed(() => computeGeometry(store.root));
const draggedPaneId = ref<string | null>(null);
const dropTarget = ref<{ paneId: string; zone: DropZone } | null>(null);

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

function openMenu(paneId: string, event: MouseEvent) {
  store.focus(paneId);
  emit('menu', paneId, contextMenuPosition(event));
}

function paneClasses(paneId: string): Record<string, boolean> {
  const zone = dropTarget.value?.paneId === paneId ? dropTarget.value.zone : undefined;
  const classes: Record<string, boolean> = { active: store.activeId === paneId };
  if (zone) {
    classes['drop-target'] = true;
    classes[`drop-${zone}`] = true;
  }
  return classes;
}

function startPaneDrag(paneId: string, event: DragEvent) {
  draggedPaneId.value = paneId;
  dropTarget.value = null;
  store.focus(paneId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-zu-term-pane', paneId);
  }
}

function endPaneDrag() {
  draggedPaneId.value = null;
  dropTarget.value = null;
}

function zoneAtEvent(event: DragEvent): DropZone | null {
  const element = event.currentTarget as HTMLElement | null;
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return dropZoneAt(
    { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    event.clientX,
    event.clientY,
  );
}

function dragOverPane(paneId: string, event: DragEvent) {
  if (!draggedPaneId.value || draggedPaneId.value === paneId) {
    dropTarget.value = null;
    return;
  }
  const zone = zoneAtEvent(event);
  if (!zone) {
    dropTarget.value = null;
    return;
  }
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropTarget.value = { paneId, zone };
}

function dragLeavePane(paneId: string, event: DragEvent) {
  const element = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget;
  if (element && related && element.contains(related as Node)) return;
  if (dropTarget.value?.paneId === paneId) dropTarget.value = null;
}

function dropPane(targetId: string, event: DragEvent) {
  const sourceId = draggedPaneId.value;
  const zone = zoneAtEvent(event);
  if (sourceId && zone && sourceId !== targetId) store.move(sourceId, targetId, zone);
  endPaneDrag();
}

function paneAtPoint(clientX: number, clientY: number): { paneId: string; zone: DropZone } | null {
  const box = container.value?.getBoundingClientRect();
  if (!box || box.width <= 0 || box.height <= 0) return null;
  const relX = (clientX - box.left) / box.width;
  const relY = (clientY - box.top) / box.height;

  for (const { id, rect } of geometry.value.panes) {
    if (
      relX >= rect.x &&
      relX <= rect.x + rect.width &&
      relY >= rect.y &&
      relY <= rect.y + rect.height
    ) {
      const paneLeft = box.left + rect.x * box.width;
      const paneTop = box.top + rect.y * box.height;
      const paneWidth = rect.width * box.width;
      const paneHeight = rect.height * box.height;
      const zone = dropZoneAt(
        { left: paneLeft, top: paneTop, width: paneWidth, height: paneHeight },
        clientX,
        clientY,
      );
      if (zone) return { paneId: id, zone };
    }
  }
  return null;
}

function dragOverContainer(event: DragEvent) {
  if (!draggedPaneId.value) return;
  const target = paneAtPoint(event.clientX, event.clientY);
  if (!target || target.paneId === draggedPaneId.value) {
    dropTarget.value = null;
    return;
  }
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropTarget.value = target;
}

function dragLeaveContainer(event: DragEvent) {
  const element = container.value;
  const related = event.relatedTarget;
  if (element && related && element.contains(related as Node)) return;
  endPaneDrag();
}

function dropContainer(event: DragEvent) {
  const sourceId = draggedPaneId.value;
  const target = dropTarget.value ?? paneAtPoint(event.clientX, event.clientY);
  if (sourceId && target && sourceId !== target.paneId) {
    store.move(sourceId, target.paneId, target.zone);
  }
  endPaneDrag();
}

const dropPreviewRect = computed<Rect | null>(() => {
  if (!draggedPaneId.value || !dropTarget.value) return null;
  const { paneId: targetId, zone } = dropTarget.value;
  if (draggedPaneId.value === targetId) return null;
  try {
    const previewTree = movePane(store.root, draggedPaneId.value, targetId, zone, 'preview');
    const geom = computeGeometry(previewTree);
    return geom.panes.find((p) => p.id === draggedPaneId.value)?.rect ?? null;
  } catch {
    return null;
  }
});
</script>

<template>
  <div
    ref="container"
    class="layout"
    @dragover.prevent="dragOverContainer"
    @dragleave="dragLeaveContainer"
    @drop.prevent="dropContainer"
  >
    <section
      v-for="{ id, rect } in geometry.panes"
      :key="id"
      class="pane"
      :class="paneClasses(id)"
      :style="paneStyle(rect)"
      @mousedown="store.focus(id)"
      @contextmenu.prevent="openMenu(id, $event)"
      @dragover.prevent="dragOverPane(id, $event)"
      @dragleave="dragLeavePane(id, $event)"
      @drop.prevent="dropPane(id, $event)"
    >
      <PaneHeader
        :title="paneTitle(store.panes[id] ?? {})"
        :command="store.panes[id]?.command"
        :path="shortPath(store.panes[id]?.cwd, props.home, PATH_MAX)"
        :active="store.activeId === id"
        :renaming="store.renamingId === id"
        :draggable="true"
        :dragging="draggedPaneId === id"
        @start-rename="store.startRename(id)"
        @rename="(name) => store.rename(id, name)"
        @close="emit('exit', id)"
        @dragstart="startPaneDrag(id, $event)"
        @dragend="endPaneDrag"
      />
      <TerminalPane
        :pane-id="id"
        :history-id="store.panes[id]?.historyId"
        :start-cwd="store.panes[id]?.startCwd"
        :restore-agent="store.panes[id]?.agent"
        :active="store.activeId === id && store.renamingId !== id"
        :local-host="props.localHost"
        :theme="props.theme"
        @cwd="(path) => store.setCwd(id, path)"
        @size="(cols, rows) => emit('size', id, cols, rows)"
        @title="(title) => store.setTitle(id, title)"
        @command="(command) => store.setCommand(id, command)"
        @agent="(agent) => store.setAgent(id, agent)"
        @focus="store.focus(id)"
        @exit="emit('exit', id)"
        @paste="(text) => emit('paste', id, text)"
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
    <div
      v-if="dropPreviewRect"
      class="drop-preview"
      :class="{ 'drop-center': dropTarget?.zone === 'center' }"
      :style="paneStyle(dropPreviewRect)"
    />
  </div>
</template>

<style scoped>
.layout {
  position: relative;
  width: 100%;
  height: 100%;
}

.drop-preview {
  position: absolute;
  z-index: 10;
  border: 2px solid var(--accent);
  border-radius: 8px;
  background: var(--accent-alt-soft);
  pointer-events: none;
  transition: all 100ms ease;
}

.drop-preview.drop-center {
  border-style: dashed;
  background: var(--accent-soft);
}

.pane {
  position: absolute;
  display: flex;
  flex-direction: column;
  padding: 4px;
  min-width: 0;
  min-height: 0;
}

.pane::after {
  position: absolute;
  z-index: 3;
  display: none;
  border: 2px solid var(--accent);
  border-radius: 8px;
  background: var(--accent-alt-soft);
  content: '';
  pointer-events: none;
}

.pane.drop-target::after {
  display: block;
}

.pane.drop-center::after {
  top: 25%;
  right: 25%;
  bottom: 25%;
  left: 25%;
  border-style: dashed;
  background: var(--accent-soft);
}

.pane.drop-top::after {
  top: 4px;
  right: 4px;
  left: 4px;
  height: calc(50% - 4px);
}

.pane.drop-right::after {
  top: 4px;
  right: 4px;
  bottom: 4px;
  width: calc(50% - 4px);
}

.pane.drop-bottom::after {
  right: 4px;
  bottom: 4px;
  left: 4px;
  height: calc(50% - 4px);
}

.pane.drop-left::after {
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 4px);
}

.pane > * {
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
}

.pane > :last-child {
  border-bottom: 1px solid var(--border);
}

.divider {
  position: absolute;
  z-index: 1;
  border-radius: 999px;
  background: var(--border-strong);
  opacity: 0.7;
  transition:
    background 140ms ease,
    opacity 140ms ease;
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
  background: linear-gradient(var(--accent), var(--accent-alt));
  opacity: 1;
}
</style>
