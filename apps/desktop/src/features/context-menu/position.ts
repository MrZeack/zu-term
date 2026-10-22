export type ContextMenuPosition = Readonly<{
  x: number;
  y: number;
}>;

export function contextMenuPosition(
  event: Pick<MouseEvent, 'clientX' | 'clientY'>,
): ContextMenuPosition {
  return { x: event.clientX, y: event.clientY };
}
