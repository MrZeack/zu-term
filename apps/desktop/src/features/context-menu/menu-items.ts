export type PaneAction =
  'split-right' | 'split-down' | 'copy' | 'paste' | 'rename' | 'clear' | 'close';

export type MenuEntry =
  { kind: 'action'; id: PaneAction; label: string; enabled: boolean } | { kind: 'separator' };

const action = (id: PaneAction, label: string, enabled = true): MenuEntry => ({
  kind: 'action',
  id,
  label,
  enabled,
});
const separator: MenuEntry = { kind: 'separator' };

export function paneMenuItems({ hasSelection }: { hasSelection: boolean }): MenuEntry[] {
  return [
    action('split-right', 'Dividir a la derecha'),
    action('split-down', 'Dividir hacia abajo'),
    separator,
    action('copy', 'Copiar', hasSelection),
    action('paste', 'Pegar'),
    separator,
    action('rename', 'Renombrar…'),
    action('clear', 'Limpiar'),
    separator,
    action('close', 'Cerrar split'),
  ];
}
