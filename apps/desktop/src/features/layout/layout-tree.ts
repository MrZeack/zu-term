// Binary split tree: each split shows `first` and `second` side by side
// (`row`) or stacked (`column`), with `ratio` of the space for `first`.
export type Direction = 'row' | 'column';

export type LayoutNode =
  | { kind: 'pane'; id: string }
  | {
      kind: 'split';
      id: string;
      direction: Direction;
      ratio: number;
      first: LayoutNode;
      second: LayoutNode;
    };

const MIN_RATIO = 0.1;
const MAX_RATIO = 0.9;

export function splitPane(
  node: LayoutNode,
  paneId: string,
  direction: Direction,
  newPaneId: string,
  splitId: string,
): LayoutNode {
  if (node.kind === 'pane') {
    if (node.id !== paneId) return node;
    return {
      kind: 'split',
      id: splitId,
      direction,
      ratio: 0.5,
      first: node,
      second: { kind: 'pane', id: newPaneId },
    };
  }
  const first = splitPane(node.first, paneId, direction, newPaneId, splitId);
  const second = splitPane(node.second, paneId, direction, newPaneId, splitId);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

export function closePane(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.kind === 'pane') return node.id === paneId ? null : node;
  const first = closePane(node.first, paneId);
  const second = closePane(node.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

export function setRatio(node: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (node.kind === 'pane') return node;
  if (node.id === splitId) {
    return { ...node, ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)) };
  }
  const first = setRatio(node.first, splitId, ratio);
  const second = setRatio(node.second, splitId, ratio);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

export function paneIds(node: LayoutNode): string[] {
  return node.kind === 'pane' ? [node.id] : [...paneIds(node.first), ...paneIds(node.second)];
}
