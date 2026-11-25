<script setup lang="ts">
import { computed } from 'vue';
import { UI_DENSITY } from '../../core/ui-density.ts';
import {
  formatRunProcessesSummary,
  formatRunProcessesTooltip,
  type RunProcessInfo,
} from './run-processes.ts';
import {
  agentStatusLabel,
  formatTerminalSize,
  telemetryIndicator,
  workspaceStatusLabel,
  type StatusPane,
} from './status.ts';
import { formatGitStatus, formatGitStatusTooltip } from '../git/git.ts';

const props = defineProps<{
  workspaceName: string | undefined;
  pane: StatusPane | undefined;
  paneCount: number;
  runProcesses?: RunProcessInfo[] | undefined;
  home?: string | undefined;
  errorCount?: number | undefined;
  telemetryBlocked?: boolean;
}>();

const emit = defineEmits<{
  toggleErrors: [];
  toggleTelemetry: [];
}>();

const densityStyle = {
  '--status-bar-height': `${UI_DENSITY.statusBarHeight}px`,
  '--status-bar-font-size': `${UI_DENSITY.statusBarFontSize}px`,
};

const telemetry = computed(() => telemetryIndicator(props.telemetryBlocked ?? false));
const runLabel = computed(() => formatRunProcessesSummary(props.runProcesses ?? []));
const runTooltip = computed(() => formatRunProcessesTooltip(props.runProcesses ?? [], props.home));
const statusBranchDiff = computed(() => formatGitStatus(props.pane?.gitStatus));
const statusBranchTooltip = computed(() => {
  if (!props.pane?.branch) return '';
  const diff = formatGitStatusTooltip(props.pane.gitStatus);
  return diff ? `Rama git: ${props.pane.branch} (${diff})` : `Rama git: ${props.pane.branch}`;
});
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
      <span v-if="props.pane?.branch" class="status-branch" :title="statusBranchTooltip">
        <span class="status-branch-icon" aria-hidden="true">⎇</span>
        <span class="status-branch-name">{{ props.pane.branch }}</span>
        <span v-if="statusBranchDiff" class="status-branch-diff">{{ statusBranchDiff }}</span>
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
      <template v-if="runLabel">
        <span class="status-divider" aria-hidden="true" />
        <span
          class="status-item status-run"
          :title="runTooltip"
          role="status"
          aria-label="Procesos en segundo plano"
        >
          <span class="status-run-dot" aria-hidden="true" />
          <strong class="status-run-label">{{ runLabel }}</strong>
        </span>
      </template>
      <span class="status-divider" aria-hidden="true" />
      <button
        class="status-item status-telemetry"
        :class="telemetry.tone"
        type="button"
        :title="telemetry.tooltip"
        :aria-pressed="props.telemetryBlocked"
        @click="emit('toggleTelemetry')"
      >
        {{ telemetry.label }}
      </button>
      <span class="status-item status-size">
        {{ formatTerminalSize(props.pane?.cols, props.pane?.rows) }}
      </span>
      <template v-if="props.errorCount">
        <span class="status-divider" aria-hidden="true" />
        <button
          class="status-item status-error"
          type="button"
          :title="`${props.errorCount} error${props.errorCount === 1 ? '' : 'es'} registrados. Clic para mostrar u ocultar.`"
          aria-label="Ver o alternar área de errores"
          @click="emit('toggleErrors')"
        >
          <span class="status-error-dot" aria-hidden="true" />
          <strong class="status-error-label"
            >{{ props.errorCount }} error{{ props.errorCount === 1 ? '' : 'es' }}</strong
          >
        </button>
      </template>
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
.status-branch,
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

.status-branch {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-branch-icon {
  font-size: 10px;
  opacity: 0.85;
}

.status-branch-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-branch-diff {
  padding-left: 2px;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.02em;
  opacity: 0.9;
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

.status-run {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent);
  font-family: Menlo, monospace;
  font-size: 9px;
  font-weight: 700;
  max-width: 420px;
}

.status-run-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-alt-soft);
}

.status-run-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.status-telemetry {
  padding: 1px 6px;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  font-family: Menlo, monospace;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
}

.status-telemetry.warning {
  color: var(--warning);
}

.status-telemetry.ok {
  color: var(--ok);
  border-color: transparent;
}

.status-error {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 6px;
  border: 1px solid rgba(255, 140, 140, 0.4);
  border-radius: 4px;
  background: rgba(255, 140, 140, 0.12);
  color: var(--danger, #ff8c8c);
  font-family: Menlo, monospace;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s ease;
}

.status-error:hover {
  background: rgba(255, 140, 140, 0.24);
  color: #ffffff;
}

.status-error-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--danger, #ff8c8c);
  box-shadow: 0 0 0 2px rgba(255, 140, 140, 0.3);
}

.status-error-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 700px) {
  .status-bar {
    gap: 8px;
    padding: 0 8px;
  }

  .status-kicker,
  .status-agent,
  .status-branch,
  .status-divider {
    display: none;
  }

  .status-title {
    max-width: 30%;
  }

  .status-workspace {
    max-width: 110px;
  }

  .status-run {
    max-width: 130px;
  }
}
</style>
