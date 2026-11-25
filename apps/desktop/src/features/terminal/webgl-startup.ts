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

interface Disposable {
  dispose(): void;
}

export interface AtlasRenderer {
  clearTextureAtlas(): void;
  onRemoveTextureAtlasCanvas(listener: () => void): Disposable;
}

// Panes with the same font and theme share one glyph atlas. When it fills up,
// xterm 6.0 merges its pages and only the pane that merged redraws; the others
// keep stale glyph positions (garbled text, xterm.js #6042, fixed only in
// betas). Rebuilding every pane's glyphs after a merge avoids that.
export function createAtlasSync(schedule: FrameScheduler) {
  const renderers = new Set<AtlasRenderer>();
  let pending = false;
  const rebuild = () => {
    pending = false;
    for (const renderer of renderers) renderer.clearTextureAtlas();
  };
  const request = () => {
    if (pending) return;
    pending = true;
    schedule(rebuild);
  };
  return {
    register(renderer: AtlasRenderer): Disposable {
      renderers.add(renderer);
      const subscription = renderer.onRemoveTextureAtlasCanvas(request);
      return {
        dispose() {
          subscription.dispose();
          renderers.delete(renderer);
        },
      };
    },
  };
}

export const webglAtlasSync = createAtlasSync((callback) => window.requestAnimationFrame(callback));
