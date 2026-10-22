import { Channel, invoke } from '@tauri-apps/api/core';

export type PtyEvent = { event: 'output'; data: string } | { event: 'exit'; data: number | null };

export const ptyClient = {
  spawn(cwd: string | undefined, cols: number, rows: number, onEvent: (event: PtyEvent) => void) {
    const channel = new Channel<PtyEvent>();
    channel.onmessage = onEvent;
    return invoke<number>('pty_spawn', { cwd: cwd ?? null, cols, rows, onEvent: channel });
  },
  write: (id: number, data: string) => invoke<void>('pty_write', { id, data }),
  resize: (id: number, cols: number, rows: number) =>
    invoke<void>('pty_resize', { id, cols, rows }),
  kill: (id: number) => invoke<void>('pty_kill', { id }),
};

export const localHostname = () => invoke<string>('local_hostname');
export const initialCwd = () => invoke<string | null>('initial_cwd');
