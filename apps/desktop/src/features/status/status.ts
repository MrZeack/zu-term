import type { AgentState } from '../workspace/agent.ts';

export interface StatusPane {
  title: string;
  path: string;
  fullPath?: string;
  command?: string;
  agent?: AgentState;
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

export function formatTerminalSize(cols: number | undefined, rows: number | undefined): string {
  const validSize = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;
  if (!validSize(cols) || !validSize(rows)) return '—';
  return `${cols} × ${rows}`;
}
