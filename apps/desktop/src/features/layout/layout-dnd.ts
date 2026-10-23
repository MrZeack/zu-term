import type { DropZone } from './layout-tree.ts';

export type { DropZone } from './layout-tree.ts';

export interface DropBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const EDGE_ZONE_SIZE = 0.28;

export function dropZoneAt(bounds: DropBounds, clientX: number, clientY: number): DropZone | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;

  const x = (clientX - bounds.left) / bounds.width;
  const y = (clientY - bounds.top) / bounds.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;

  const candidates: { zone: DropZone; distance: number }[] = [];
  if (y <= EDGE_ZONE_SIZE) candidates.push({ zone: 'top', distance: y });
  if (x >= 1 - EDGE_ZONE_SIZE) candidates.push({ zone: 'right', distance: 1 - x });
  if (y >= 1 - EDGE_ZONE_SIZE) candidates.push({ zone: 'bottom', distance: 1 - y });
  if (x <= EDGE_ZONE_SIZE) candidates.push({ zone: 'left', distance: x });

  return candidates.sort((a, b) => a.distance - b.distance)[0]?.zone ?? 'center';
}
