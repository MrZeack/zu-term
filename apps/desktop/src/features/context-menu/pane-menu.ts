import { LogicalPosition } from '@tauri-apps/api/dpi';
import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { MenuEntry, PaneAction } from './menu-items.ts';
import type { ContextMenuPosition } from './position.ts';

// Shows the entries as a native context menu at the cursor.
export async function showPaneMenu(
  entries: MenuEntry[],
  onSelect: (action: PaneAction) => void,
  position: ContextMenuPosition,
): Promise<void> {
  const items = await Promise.all(
    entries.map((entry) =>
      entry.kind === 'separator'
        ? PredefinedMenuItem.new({ item: 'Separator' })
        : MenuItem.new({
            id: entry.id,
            text: entry.label,
            enabled: entry.enabled,
            action: () => onSelect(entry.id),
          }),
    ),
  );
  const menu = await Menu.new({ items });
  await menu.popup(new LogicalPosition(position.x, position.y), getCurrentWindow());
}
