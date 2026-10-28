export interface Timer<H> {
  set(callback: () => void): H;
  clear(handle: H): void;
}

// Runs `run` once on the next tick however many times it was requested, e.g.
// one `fit()` per animation frame while a divider is dragged.
export function coalesce<H>(run: () => void, timer: Timer<H>) {
  let handle: H | undefined;
  return {
    schedule() {
      if (handle !== undefined) return;
      handle = timer.set(() => {
        handle = undefined;
        run();
      });
    },
    cancel() {
      if (handle !== undefined) timer.clear(handle);
      handle = undefined;
    },
  };
}

// Runs `run` with the latest arguments once requests stop arriving, e.g. one
// PTY resize (and one redraw of the program) when the drag ends.
export function debounce<A extends unknown[], H>(run: (...args: A) => void, timer: Timer<H>) {
  let handle: H | undefined;
  const cancel = () => {
    if (handle !== undefined) timer.clear(handle);
    handle = undefined;
  };
  return {
    schedule(...args: A) {
      cancel();
      handle = timer.set(() => {
        handle = undefined;
        run(...args);
      });
    },
    cancel,
  };
}
