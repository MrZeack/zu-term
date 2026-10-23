export const AGENT_PROVIDERS = ['codex', 'claude', 'kiro', 'muse', 'antigravity'] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export interface AgentState {
  provider: AgentProvider;
  sessionId?: string;
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

const adapters: Record<AgentProvider, { start: string[]; resume: string[] }> = {
  codex: { start: ['codex'], resume: ['codex', 'resume'] },
  claude: { start: ['claude'], resume: ['claude', '--resume'] },
  kiro: { start: ['kiro-cli', 'chat'], resume: ['kiro-cli', 'chat', '--resume-id'] },
  muse: { start: ['muse'], resume: ['muse', 'resume'] },
  antigravity: { start: ['agy'], resume: ['agy', '--conversation'] },
};

export function isAgentProvider(value: unknown): value is AgentProvider {
  return typeof value === 'string' && (AGENT_PROVIDERS as readonly string[]).includes(value);
}

export function isValidAgentSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

export function parseAgentState(value: unknown): AgentState | null {
  if (!isRecord(value) || !isAgentProvider(value.provider)) return null;
  if (value.sessionId === undefined) return { provider: value.provider };
  return isValidAgentSessionId(value.sessionId)
    ? { provider: value.provider, sessionId: value.sessionId }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildAgentCommand(agent: AgentState): string {
  if (!isAgentProvider(agent.provider)) throw new Error('unsupported agent provider');
  if (agent.sessionId !== undefined && !isValidAgentSessionId(agent.sessionId)) {
    throw new Error('invalid agent session ID');
  }
  const command = agent.sessionId
    ? [...adapters[agent.provider].resume, agent.sessionId]
    : adapters[agent.provider].start;
  const [executable, ...args] = command;
  const renderedArgs = agent.sessionId ? [...args.slice(0, -1), shellQuote(agent.sessionId)] : args;
  return [executable, ...renderedArgs].join(' ');
}
