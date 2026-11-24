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

const MAX_NOTIFICATION_LENGTH = 160;

// OSC 9 (iTerm2/ConEmu) and OSC 99 (Kitty) terminal notifications.
// Control characters are stripped and ConEmu progress reports (`4;...`) ignored.
export function parseOscNotification(oscCode: 9 | 99, payload: string): string | null {
  let raw = payload;
  if (oscCode === 9) {
    if (raw.startsWith('4;')) return null;
  } else {
    const separator = raw.indexOf(';');
    if (separator < 0) return null;
    raw = raw.slice(separator + 1);
  }
  const cleaned = raw
    // eslint-disable-next-line no-control-regex -- intentionally stripping C0/DEL control chars
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, MAX_NOTIFICATION_LENGTH);
  return cleaned || null;
}
