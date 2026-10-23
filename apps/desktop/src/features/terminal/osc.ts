import { APP_AGENT_PREFIX, APP_COMMAND_PREFIX } from '../../core/brand.ts';
import { isAgentProvider, normalizeAgentSessionId, type AgentState } from '../workspace/agent.ts';

// OSC 7 payload ("file://host/path") → absolute path, or null if invalid.
// Any program output can emit OSC 7, so only reports for this machine's
// hostname are trusted (our shell integration always sends it). macOS can
// expose the same host as `name` or `name.local` depending on the caller.
function normalizeHostname(host: string): string {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '');
  return normalized.endsWith('.local') ? normalized.slice(0, -'.local'.length) : normalized;
}

export function parseOsc7(payload: string, localHost: string | undefined): string | null {
  const match = /^file:\/\/([^/]*)(\/.*)$/.exec(payload);
  if (!match?.[2] || !localHost) return null;
  const reportedHost = normalizeHostname(match[1] ?? '');
  const trustedHost = normalizeHostname(localHost);
  if (!reportedHost || reportedHost !== trustedHost) {
    return null;
  }
  try {
    return decodeURIComponent(match[2]);
  } catch {
    return null;
  }
}

// Private OSC 1337 payload emitted by shell/osc7.zsh while a command owns the
// prompt. The label is deliberately restricted because it is rendered in the UI.
export function parseZuTermCommand(payload: string): string | null | undefined {
  if (!payload.startsWith(APP_COMMAND_PREFIX)) return undefined;
  const command = payload.slice(APP_COMMAND_PREFIX.length);
  if (!command) return null;
  return /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(command) ? command : null;
}

// Private OSC 1337 payload emitted by shell/osc7.zsh when a supported agent
// starts. The session ID is optional: its absence deliberately means "new".
export function parseZuTermAgent(payload: string): AgentState | null | undefined {
  if (!payload.startsWith(APP_AGENT_PREFIX)) return undefined;
  const value = payload.slice(APP_AGENT_PREFIX.length);
  if (!value) return null;
  const [provider, sessionId, ...extra] = value.split('|');
  if (!isAgentProvider(provider) || extra.length > 0) return null;
  if (sessionId === undefined) return { provider };
  const normalizedSessionId = normalizeAgentSessionId(sessionId);
  return normalizedSessionId ? { provider, sessionId: normalizedSessionId } : null;
}
