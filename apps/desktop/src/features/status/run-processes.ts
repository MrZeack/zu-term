import { shortPath } from '../pane-header/pane-title.ts';

export interface RunProcessInfo {
  name: string;
  pid: number;
  projectDir: string;
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
  const names = processes.map((p) => p.name).join(', ');
  return `.run: ${processes.length} activos (${names})`;
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
