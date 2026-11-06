// Binary split tree: each split shows `first` and `second` side by side
// (`row`) or stacked (`column`), with `ratio` of the space for `first`.
// Dropping on a pane's edge splits that pane; on its center, swaps both.
// Only `movePaneToEdge` lifts a pane to an edge of the whole layout.
export type Direction = 'row' | 'column';
export type EdgeZone = 'top' | 'right' | 'bottom' | 'left';
export type DropZone = EdgeZone | 'center';

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

function containsPane(node: LayoutNode, paneId: string): boolean {
  return paneIds(node).includes(paneId);
}

function directionForDrop(zone: DropZone): Direction {
  return zone === 'top' || zone === 'bottom' ? 'column' : 'row';
}

function swapPanePositions(node: LayoutNode, firstId: string, secondId: string): LayoutNode {
  if (node.kind === 'pane') {
    if (node.id === firstId) return { kind: 'pane', id: secondId };
    if (node.id === secondId) return { kind: 'pane', id: firstId };
    return node;
  }

  const first = swapPanePositions(node.first, firstId, secondId);
  const second = swapPanePositions(node.second, firstId, secondId);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

function insertPane(
  node: LayoutNode,
  targetId: string,
  direction: Direction,
  pane: LayoutNode,
  zone: DropZone,
  splitId: string,
): LayoutNode {
  if (node.kind === 'pane') {
    if (node.id !== targetId) return node;
    const before = zone === 'top' || zone === 'left';
    return {
      kind: 'split',
      id: splitId,
      direction,
      ratio: 0.5,
      first: before ? pane : node,
      second: before ? node : pane,
    };
  }

  const first = insertPane(node.first, targetId, direction, pane, zone, splitId);
  if (first !== node.first) return { ...node, first };
  const second = insertPane(node.second, targetId, direction, pane, zone, splitId);
  return second === node.second ? node : { ...node, second };
}

export function balanceLinearTree(
  ids: string[],
  direction: Direction,
  allocateId: () => string,
): LayoutNode {
  if (ids.length === 0) throw new Error('Cannot balance empty tree');
  if (ids.length === 1) return { kind: 'pane', id: ids[0]! };

  function buildSubtree(index: number): LayoutNode {
    const remaining = ids.length - index;
    if (remaining === 1) {
      return { kind: 'pane', id: ids[index]! };
    }
    const ratio = 1 / remaining;
    return {
      kind: 'split',
      id: allocateId(),
      direction,
      ratio,
      first: { kind: 'pane', id: ids[index]! },
      second: buildSubtree(index + 1),
    };
  }

  return buildSubtree(0);
}

function isLinearChain(node: LayoutNode, direction: Direction): boolean {
  if (node.kind === 'pane') return true;
  if (node.direction !== direction) return false;
  return isLinearChain(node.first, direction) && isLinearChain(node.second, direction);
}

function hasSplitInDirection(node: LayoutNode, direction: Direction): boolean {
  if (node.kind === 'pane') return false;
  if (node.direction === direction) return true;
  return hasSplitInDirection(node.first, direction) || hasSplitInDirection(node.second, direction);
}

function restoreGridIfPossible(
  withoutPane: LayoutNode,
  targetId: string,
  direction: Direction,
  pane: LayoutNode,
  zone: DropZone,
  allocateId: () => string,
): LayoutNode | null {
  const ids = paneIds(withoutPane);
  if (ids.length === 3 && isLinearChain(withoutPane, direction)) {
    const perpDirection = direction === 'row' ? 'column' : 'row';
    const otherIds = ids.filter((id) => id !== targetId);
    if (otherIds.length === 2) {
      const before = zone === 'top' || zone === 'left';
      const pair: LayoutNode = {
        kind: 'split',
        id: allocateId(),
        direction,
        ratio: 0.5,
        first: before ? pane : { kind: 'pane', id: targetId },
        second: before ? { kind: 'pane', id: targetId } : pane,
      };
      const others: LayoutNode = {
        kind: 'split',
        id: allocateId(),
        direction,
        ratio: 0.5,
        first: { kind: 'pane', id: otherIds[0]! },
        second: { kind: 'pane', id: otherIds[1]! },
      };
      return {
        kind: 'split',
        id: allocateId(),
        direction: perpDirection,
        ratio: 0.5,
        first: others,
        second: pair,
      };
    }
  }
  return null;
}

function idAllocator(splitId: string | (() => string)): () => string {
  if (typeof splitId === 'function') return splitId;
  let counter = 0;
  return () => (counter++ === 0 ? splitId : `${splitId}-${counter}`);
}

export function movePane(
  node: LayoutNode,
  paneId: string,
  targetId: string,
  zone: DropZone,
  splitId: string | (() => string),
): LayoutNode {
  if (paneId === targetId || !containsPane(node, paneId) || !containsPane(node, targetId)) {
    return node;
  }
  if (zone === 'center') return swapPanePositions(node, paneId, targetId);

  const withoutPane = closePane(node, paneId);
  if (!withoutPane) return node;
  const allocateId = idAllocator(splitId);
  const direction = directionForDrop(zone);
  const pane: LayoutNode = { kind: 'pane', id: paneId };
  return (
    restoreGridIfPossible(withoutPane, targetId, direction, pane, zone, allocateId) ??
    insertPane(withoutPane, targetId, direction, pane, zone, allocateId())
  );
}

// Puts the pane along a whole edge of the layout, with half of the space,
// and lines up the other panes in the remaining half.
export function movePaneToEdge(
  node: LayoutNode,
  paneId: string,
  zone: EdgeZone,
  splitId: string | (() => string),
): LayoutNode {
  if (!containsPane(node, paneId)) return node;
  const withoutPane = closePane(node, paneId);
  if (!withoutPane) return node;

  const allocateId = idAllocator(splitId);
  const direction = directionForDrop(zone);
  const perpDirection = direction === 'row' ? 'column' : 'row';
  const before = zone === 'left' || zone === 'top';
  const remainingDirection = hasSplitInDirection(withoutPane, perpDirection)
    ? perpDirection
    : direction;
  const remaining = balanceLinearTree(paneIds(withoutPane), remainingDirection, allocateId);
  const pane: LayoutNode = { kind: 'pane', id: paneId };
  return {
    kind: 'split',
    id: allocateId(),
    direction,
    ratio: 0.5,
    first: before ? pane : remaining,
    second: before ? remaining : pane,
  };
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
