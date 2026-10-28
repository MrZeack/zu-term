import type { PaneState } from '../layout/layout.store.ts';
import { shortPath } from '../pane-header/pane-title.ts';

export interface RunProcessInfo {
  name: string;
  pid: number;
  projectDir: string;
}

// The current directory of each open split (or where it started). Only these
// exact folders are checked for `.run`/`.runtime`; saved workspaces are not.
export function splitDirectories(panes: Record<string, PaneState>): string[] {
  const directories = new Set<string>();
  for (const pane of Object.values(panes)) {
    const directory = pane.cwd ?? pane.startCwd;
    if (directory) directories.add(directory);
  }
  return [...directories];
}

// Lets the status bar keep its current list when a refresh finds the same
// processes, so the periodic check does not re-render it.
export function sameRunProcesses(a: RunProcessInfo[], b: RunProcessInfo[]): boolean {
  return (
    a.length === b.length &&
    a.every((process, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        process.name === other.name &&
        process.pid === other.pid &&
        process.projectDir === other.projectDir
      );
    })
  );
}

export function formatRunProcessesSummary(processes: RunProcessInfo[]): string | undefined {
  if (!processes || processes.length === 0) {
    return undefined;
  }
  if (processes.length === 1) {
    const first = processes[0];
    if (!first) return undefined;
    return `.run: ${first.name} (${first.pid})`;
  }
  if (processes.length <= 3) {
    const items = processes.map((p) => `${p.name} (${p.pid})`).join(', ');
    return `.run: ${items}`;
  }
  const items = processes
    .slice(0, 2)
    .map((p) => `${p.name} (${p.pid})`)
    .join(', ');
  const remaining = processes.length - 2;
  return `.run: ${items} (+${remaining})`;
}

export function formatRunProcessesTooltip(
  processes: RunProcessInfo[],
  home?: string,
): string | undefined {
  if (!processes || processes.length === 0) {
    return undefined;
  }
  const lines = ['Procesos en .run:'];
  for (const proc of processes) {
    const path = shortPath(proc.projectDir, home, 80);
    lines.push(`• ${proc.name} (PID ${proc.pid}) · ${path}`);
  }
  return lines.join('\n');
}
