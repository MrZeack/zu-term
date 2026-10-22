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
