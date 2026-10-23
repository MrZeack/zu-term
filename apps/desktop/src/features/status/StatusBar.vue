<script setup lang="ts">
import { UI_DENSITY } from '../../core/ui-density.ts';
import {
  agentStatusLabel,
  formatTerminalSize,
  workspaceStatusLabel,
  type StatusPane,
} from './status.ts';

const props = defineProps<{
  workspaceName: string | undefined;
  pane: StatusPane | undefined;
  paneCount: number;
}>();

const densityStyle = {
  '--status-bar-height': `${UI_DENSITY.statusBarHeight}px`,
  '--status-bar-font-size': `${UI_DENSITY.statusBarFontSize}px`,
};
</script>

<template>
  <footer class="status-bar" role="status" aria-label="Estado de Zu Term" :style="densityStyle">
    <div
      class="status-context"
      :title="props.pane?.fullPath ?? props.pane?.path ?? 'Sin terminal activa'"
    >
      <span class="status-dot" aria-hidden="true" />
      <span class="status-kicker">SPLIT ACTIVO</span>
      <strong v-if="props.pane" class="status-title">{{ props.pane.title }}</strong>
      <span v-if="props.pane?.command" class="status-command">{{ props.pane.command }}</span>
      <span v-if="agentStatusLabel(props.pane?.agent)" class="status-agent">
        {{ agentStatusLabel(props.pane?.agent) }}
      </span>
      <span v-if="props.pane?.path" class="status-path">{{ props.pane.path }}</span>
      <span v-else class="status-empty">Sin terminal activa</span>
    </div>
    <div class="status-metrics">
      <span class="status-item status-workspace" :title="workspaceStatusLabel(props.workspaceName)">
        WS <strong>{{ workspaceStatusLabel(props.workspaceName) }}</strong>
      </span>
      <span class="status-divider" aria-hidden="true" />
      <span class="status-item">
        {{ props.paneCount }} split{{ props.paneCount === 1 ? '' : 's' }}
      </span>
      <span class="status-item status-size">
        {{ formatTerminalSize(props.pane?.cols, props.pane?.rows) }}
      </span>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 var(--status-bar-height);
  min-height: var(--status-bar-height);
  padding: 0 10px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  background: var(--toolbar-bg);
  box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.12);
  font-size: var(--status-bar-font-size);
  user-select: none;
}

.status-context,
.status-metrics {
  display: flex;
  align-items: center;
  min-width: 0;
}

.status-context {
  flex: 1;
  gap: 7px;
  overflow: hidden;
}

.status-metrics {
  flex: 0 0 auto;
  gap: 10px;
}

.status-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent-alt);
  box-shadow: 0 0 0 3px var(--accent-alt-soft);
}

.status-kicker {
  flex: 0 0 auto;
  color: var(--accent-alt);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.status-title {
  max-width: 18%;
  flex: 0 1 auto;
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-command,
.status-agent,
.status-size {
  flex: 0 0 auto;
  color: var(--accent);
  font-family: Menlo, monospace;
  font-size: 9px;
  font-weight: 700;
}

.status-agent {
  color: var(--accent-alt);
}

.status-path {
  min-width: 40px;
  flex: 1 1 auto;
  overflow: hidden;
  color: var(--muted);
  font-family: Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: ltr;
}

.status-empty {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-workspace {
  max-width: 180px;
}

.status-workspace strong {
  color: var(--text);
  font-weight: 700;
}

.status-divider {
  width: 1px;
  height: 12px;
  background: var(--border-strong);
}

.status-size {
  min-width: 58px;
  color: var(--muted);
  text-align: right;
}

@media (max-width: 700px) {
  .status-bar {
    gap: 8px;
    padding: 0 8px;
  }

  .status-kicker,
  .status-agent,
  .status-divider {
    display: none;
  }

  .status-title {
    max-width: 30%;
  }

  .status-workspace {
    max-width: 110px;
  }
}
</style>
