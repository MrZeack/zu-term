export type FrameScheduler = (callback: () => void) => void;

export function deferUntilNextFrame(run: () => void, schedule: FrameScheduler): void {
  schedule(run);
}
