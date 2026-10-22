import type { PaneAction } from '../context-menu/menu-items.ts';

export type SplitToolbarAction = {
  id: Extract<PaneAction, 'split-right' | 'split-down'>;
  label: string;
  shortcut: string;
  direction: 'right' | 'down';
};

export function splitToolbarActions(isMac: boolean): SplitToolbarAction[] {
  return [
    {
      id: 'split-right',
      label: 'Dividir a la derecha',
      shortcut: isMac ? '⌘D' : 'Ctrl⇧E',
      direction: 'right',
    },
    {
      id: 'split-down',
      label: 'Dividir hacia abajo',
      shortcut: isMac ? '⌘⇧D' : 'Ctrl⇧O',
      direction: 'down',
    },
  ];
}
