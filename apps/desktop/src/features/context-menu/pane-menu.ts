import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import type { MenuEntry, PaneAction } from './menu-items.ts';

// Shows the entries as a native context menu at the cursor.
export async function showPaneMenu(
  entries: MenuEntry[],
  onSelect: (action: PaneAction) => void,
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
  await menu.popup();
}
