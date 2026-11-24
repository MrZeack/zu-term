import type { Direction, LayoutNode } from './layout-tree.ts';

// Rectangles as fractions (0..1) of the layout container.
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Divider {
  splitId: string;
  direction: Direction;
  position: number; // ratio inside `area`
  area: Rect; // the whole area of the split
}

export interface Geometry {
  panes: { id: string; rect: Rect }[];
  dividers: Divider[];
}

const FULL: Rect = { x: 0, y: 0, width: 1, height: 1 };

export function computeGeometry(root: LayoutNode): Geometry {
  const geometry: Geometry = { panes: [], dividers: [] };

  const visit = (node: LayoutNode, area: Rect) => {
    if (node.kind === 'pane') {
      geometry.panes.push({ id: node.id, rect: area });
      return;
    }
    geometry.dividers.push({
      splitId: node.id,
      direction: node.direction,
      position: node.ratio,
      area,
    });
    if (node.direction === 'row') {
      const firstWidth = area.width * node.ratio;
      visit(node.first, { ...area, width: firstWidth });
      visit(node.second, { ...area, x: area.x + firstWidth, width: area.width - firstWidth });
    } else {
      const firstHeight = area.height * node.ratio;
      visit(node.first, { ...area, height: firstHeight });
      visit(node.second, { ...area, y: area.y + firstHeight, height: area.height - firstHeight });
    }
  };

  visit(root, FULL);
  return geometry;
}

// Pointer position (fractions of the container) → ratio inside the split area.
export function ratioAt(area: Rect, direction: Direction, pointerX: number, pointerY: number) {
  return direction === 'row' ? (pointerX - area.x) / area.width : (pointerY - area.y) / area.height;
}

export type FocusDirection = 'up' | 'down' | 'left' | 'right';

const EPS = 1e-6;

export function findAdjacentPane(
  panes: { id: string; rect: Rect }[],
  activeId: string,
  direction: FocusDirection,
): string | null {
  const current = panes.find((pane) => pane.id === activeId);
  if (!current) return null;
  const { rect: a } = current;
  const aCx = a.x + a.width / 2;
  const aCy = a.y + a.height / 2;

  const candidates: { id: string; overlaps: boolean; primaryGap: number; secondaryDist: number }[] =
    [];

  for (const pane of panes) {
    if (pane.id === activeId) continue;
    const b = pane.rect;
    const bCx = b.x + b.width / 2;
    const bCy = b.y + b.height / 2;

    if (direction === 'left' || direction === 'right') {
      const gap = direction === 'right' ? b.x - (a.x + a.width) : a.x - (b.x + b.width);
      if (gap < -EPS) continue;
      const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      candidates.push({
        id: pane.id,
        overlaps: overlap > EPS,
        primaryGap: Math.max(0, gap),
        secondaryDist: Math.abs(bCy - aCy),
      });
    } else {
      const gap = direction === 'down' ? b.y - (a.y + a.height) : a.y - (b.y + b.height);
      if (gap < -EPS) continue;
      const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      candidates.push({
        id: pane.id,
        overlaps: overlap > EPS,
        primaryGap: Math.max(0, gap),
        secondaryDist: Math.abs(bCx - aCx),
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((c1, c2) => {
    if (c1.overlaps !== c2.overlaps) return c1.overlaps ? -1 : 1;
    if (Math.abs(c1.primaryGap - c2.primaryGap) > EPS) return c1.primaryGap - c2.primaryGap;
    return c1.secondaryDist - c2.secondaryDist;
  });
  return candidates[0]?.id ?? null;
}

export function cyclePaneId(
  panes: { id: string }[],
  activeId: string,
  delta: 1 | -1,
): string | null {
  if (panes.length <= 1) return null;
  const index = panes.findIndex((pane) => pane.id === activeId);
  if (index < 0) return panes[0]?.id ?? null;
  const next = (index + delta + panes.length) % panes.length;
  return panes[next]?.id ?? null;
}
