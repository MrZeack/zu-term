import { Channel, invoke } from '@tauri-apps/api/core';
import { toPtyEvent, type PtyEvent } from './pty-message.ts';

export const ptyClient = {
  spawn(
    cwd: string | undefined,
    historyId: string | undefined,
    cols: number,
    rows: number,
    onEvent: (event: PtyEvent) => void,
  ) {
    const channel = new Channel<unknown>();
    channel.onmessage = (message) => {
      const event = toPtyEvent(message);
      if (event) onEvent(event);
    };
    return invoke<number>('pty_spawn', {
      cwd: cwd ?? null,
      historyId: historyId ?? null,
      cols,
      rows,
      onEvent: channel,
    });
  },
  write: (id: number, data: string) => invoke<void>('pty_write', { id, data }),
  resize: (id: number, cols: number, rows: number) =>
    invoke<void>('pty_resize', { id, cols, rows }),
  kill: (id: number) => invoke<void>('pty_kill', { id }),
};

export const localHostname = () => invoke<string>('local_hostname');
export const initialCwd = () => invoke<string | null>('initial_cwd');
