export const AGENT_PROVIDERS = ['codex', 'claude', 'kiro', 'muse', 'antigravity'] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export interface AgentState {
  provider: AgentProvider;
  sessionId?: string;
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

export type ResumableAgent = Required<AgentState>;

// Only explicit sessions are relaunched on restore: a pane whose agent has no
// ID starts as a plain shell, so terminal output can never start a new agent.
const resumeCommands: Record<AgentProvider, string[]> = {
  codex: ['codex', 'resume'],
  claude: ['claude', '--resume'],
  kiro: ['kiro-cli', 'chat', '--resume-id'],
  muse: ['muse', 'resume'],
  antigravity: ['agy', '--conversation'],
};

export function isAgentProvider(value: unknown): value is AgentProvider {
  return typeof value === 'string' && (AGENT_PROVIDERS as readonly string[]).includes(value);
}

export function normalizeAgentSessionId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const first = trimmed[0];
  const last = trimmed.at(-1);
  const quoted =
    (first === "'" && last === "'") || (first === '"' && last === '"')
      ? trimmed.slice(1, -1)
      : trimmed;
  return SESSION_ID_PATTERN.test(quoted) ? quoted : undefined;
}

export function isValidAgentSessionId(value: unknown): value is string {
  return normalizeAgentSessionId(value) !== undefined;
}

export function parseAgentState(value: unknown): AgentState | null {
  if (!isRecord(value) || !isAgentProvider(value.provider)) return null;
  if (value.sessionId === undefined) return { provider: value.provider };
  const sessionId = normalizeAgentSessionId(value.sessionId);
  return sessionId ? { provider: value.provider, sessionId } : null;
}

export function parseResumableAgent(value: unknown): ResumableAgent | null {
  const agent = parseAgentState(value);
  return agent?.sessionId ? { provider: agent.provider, sessionId: agent.sessionId } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildAgentResumeCommand(agent: AgentState): string | undefined {
  if (!isAgentProvider(agent.provider)) throw new Error('unsupported agent provider');
  if (agent.sessionId === undefined) return undefined;
  const sessionId = normalizeAgentSessionId(agent.sessionId);
  if (!sessionId) throw new Error('invalid agent session ID');
  return [...resumeCommands[agent.provider], shellQuote(sessionId)].join(' ');
}
