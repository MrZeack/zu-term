import type { GitStatusSummary } from '../git/git.ts';
import type { AgentState } from '../workspace/agent.ts';

export interface StatusPane {
  title: string;
  path: string;
  fullPath?: string;
  command?: string;
  agent?: AgentState;
  branch?: string;
  gitStatus?: GitStatusSummary;
  cols?: number;
  rows?: number;
}

const AGENT_LABELS: Record<AgentState['provider'], string> = {
  codex: 'Codex',
  claude: 'Claude',
  kiro: 'Kiro',
  muse: 'Muse',
  antigravity: 'Antigravity',
};

export function workspaceStatusLabel(name: string | undefined): string {
  const normalized = name?.trim();
  return normalized || 'Sin guardar';
}

export function agentStatusLabel(agent: AgentState | undefined): string | undefined {
  if (!agent) return undefined;
  return `${AGENT_LABELS[agent.provider]} · ${agent.sessionId ? 'resume' : 'nueva'}`;
}

export interface TelemetryIndicator {
  tone: 'warning' | 'ok';
  label: string;
  tooltip: string;
}

// The opt-out variables reach a shell only when it starts.
export function telemetryIndicator(blocked: boolean): TelemetryIndicator {
  return blocked
    ? {
        tone: 'ok',
        label: 'SIN TELEMETRÍA',
        tooltip:
          'Los splits nuevos llevan variables para no enviar telemetría (DO_NOT_TRACK y otras). Los splits abiertos antes conservan su entorno. Clic para desactivarlo.',
      }
    : {
        tone: 'warning',
        label: 'TELEMETRÍA',
        tooltip:
          'Las herramientas de la terminal pueden enviar telemetría. Clic para bloquearla en los splits nuevos de todas las ventanas.',
      };
}

export function formatTerminalSize(cols: number | undefined, rows: number | undefined): string {
  const validSize = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;
  if (!validSize(cols) || !validSize(rows)) return '—';
  return `${cols} × ${rows}`;
}
