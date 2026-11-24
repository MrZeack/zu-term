export type TimerHandle = ReturnType<typeof setInterval> | number;

export interface VisibilityPollerOptions {
  intervalMs: number;
  isHidden: () => boolean;
  tick: () => Promise<void>;
  setInterval?: (fn: () => void, ms: number) => TimerHandle;
  clearInterval?: (handle: TimerHandle) => void;
}

// Runs periodic background refreshes with an in-flight guard (never stacking
// slow requests) and pauses the timer while the window is hidden.
export function createVisibilityPoller({
  intervalMs,
  isHidden,
  tick,
  setInterval: schedule = (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: cancel = (handle) => globalThis.clearInterval(handle),
}: VisibilityPollerOptions) {
  let timer: TimerHandle | undefined;
  let running = false;
  let inFlight = false;
  let rerunRequested = false;

  async function trigger(): Promise<void> {
    if (inFlight) {
      rerunRequested = true;
      return;
    }
    inFlight = true;
    try {
      do {
        rerunRequested = false;
        await tick();
      } while (rerunRequested && !isHidden());
    } finally {
      inFlight = false;
    }
  }

  function startTimer() {
    if (timer !== undefined) return;
    timer = schedule(() => {
      if (!isHidden()) void trigger();
    }, intervalMs);
  }

  function stopTimer() {
    if (timer === undefined) return;
    cancel(timer);
    timer = undefined;
  }

  function start() {
    running = true;
    if (isHidden()) return;
    void trigger();
    startTimer();
  }

  function onVisibilityChange() {
    if (!running) return;
    if (isHidden()) {
      stopTimer();
    } else {
      void trigger();
      startTimer();
    }
  }

  function stop() {
    running = false;
    rerunRequested = false;
    stopTimer();
  }

  return { start, stop, trigger, onVisibilityChange };
}
