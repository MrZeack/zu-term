export type PtyEvent =
  { event: 'output'; data: Uint8Array } | { event: 'exit'; data: number | null };

// Messages from the `pty_spawn` channel: output is an ArrayBuffer (raw PTY
// bytes; xterm decodes UTF-8 across chunks) and the exit is `{ exit }` JSON.
export function toPtyEvent(message: unknown): PtyEvent | undefined {
  if (message instanceof ArrayBuffer) return { event: 'output', data: new Uint8Array(message) };
  if (ArrayBuffer.isView(message)) {
    const { buffer, byteOffset, byteLength } = message;
    return { event: 'output', data: new Uint8Array(buffer, byteOffset, byteLength) };
  }
  if (Array.isArray(message)) return { event: 'output', data: Uint8Array.from(message) };
  if (typeof message !== 'object' || message === null || !('exit' in message)) return undefined;
  const { exit } = message;
  return exit === null || typeof exit === 'number' ? { event: 'exit', data: exit } : undefined;
}
