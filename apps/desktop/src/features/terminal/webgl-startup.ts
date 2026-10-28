export type FrameScheduler = (callback: () => void) => void;

export function deferUntilNextFrame(run: () => void, schedule: FrameScheduler): void {
  schedule(run);
}

// WebKit keeps about 16 WebGL contexts per page and drops the oldest past
// that; up to 32 panes can be open, so the rest keep xterm's DOM renderer.
export const MAX_WEBGL_TERMINALS = 12;

export function createWebglBudget(max = MAX_WEBGL_TERMINALS) {
  let used = 0;
  return {
    acquire(): boolean {
      if (used >= max) return false;
      used += 1;
      return true;
    },
    release(): void {
      used = Math.max(0, used - 1);
    },
  };
}

export const webglBudget = createWebglBudget();
