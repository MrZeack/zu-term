import { invoke } from '@tauri-apps/api/core';

// `false`: the text was not an http(s) URL or an existing path.
export const linkClient = {
  open: (target: string, cwd: string | undefined) =>
    invoke<boolean>('open_link', { target, cwd: cwd ?? null }),
};
