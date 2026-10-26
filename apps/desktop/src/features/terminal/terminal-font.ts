import { UI_DENSITY } from '../../core/ui-density.ts';

export interface TerminalFontOption {
  id: string;
  name: string;
  family: string;
  category: string;
  description: string;
}

export const TERMINAL_FONTS: readonly TerminalFontOption[] = [
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    family: "'JetBrains Mono', monospace",
    category: 'Moderno',
    description: 'Diseñada para desarrolladores y alta legibilidad',
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    family: "'Fira Code', monospace",
    category: 'Clásico',
    description: 'Monospace técnica con ligaduras de programación',
  },
  {
    id: 'ibm-plex-mono',
    name: 'IBM Plex Mono',
    family: "'IBM Plex Mono', monospace",
    category: 'Industrial',
    description: 'Estilo grotesk con personalidad de ingeniería',
  },
  {
    id: 'geist-mono',
    name: 'Geist Mono',
    family: "'Geist Mono', monospace",
    category: 'Minimalista',
    description: 'Geometría ultra-limpia diseñada para terminales',
  },
  {
    id: 'victor-mono',
    name: 'Victor Mono',
    family: "'Victor Mono', monospace",
    category: 'Elegante',
    description: 'Proporciones estilizadas con cursiva distintiva',
  },
  {
    id: 'comic-mono',
    name: 'Comic Mono',
    family: "'Comic Mono', monospace",
    category: 'Casual',
    description: 'Monospace legible y divertida inspirada en Comic Shanns',
  },
  {
    id: 'system',
    name: 'Sistema',
    family: 'Menlo, "DejaVu Sans Mono", "Liberation Mono", monospace',
    category: 'Nativo',
    description: 'Fuente monoespaciada predeterminada del sistema',
  },
] as const;

export type TerminalFontId = (typeof TERMINAL_FONTS)[number]['id'];

export const DEFAULT_TERMINAL_FONT_ID: TerminalFontId = 'jetbrains-mono';
export const DEFAULT_TERMINAL_FONT_SIZE = UI_DENSITY.terminalFontSize;
export const MIN_TERMINAL_FONT_SIZE = 9;
export const MAX_TERMINAL_FONT_SIZE = 28;

export function isTerminalFontId(value: unknown): value is TerminalFontId {
  return typeof value === 'string' && TERMINAL_FONTS.some((font) => font.id === value);
}

export function findTerminalFont(id: unknown): TerminalFontOption {
  return TERMINAL_FONTS.find((font) => font.id === id) ?? TERMINAL_FONTS[0]!;
}

export function resolveFontFamily(id: unknown): string {
  return findTerminalFont(id).family;
}

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_TERMINAL_FONT_SIZE;
  const rounded = Math.round(size);
  return Math.max(MIN_TERMINAL_FONT_SIZE, Math.min(MAX_TERMINAL_FONT_SIZE, rounded));
}
