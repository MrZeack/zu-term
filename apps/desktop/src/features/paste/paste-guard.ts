// Pasted text goes straight to the shell. Control characters (ESC in
// particular) could close bracketed paste and run commands, so they are
// dropped; tab and newlines stay.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

export function sanitizePaste(text: string): string {
  return text.replace(CONTROL_CHARS, '');
}

// More than one line (a single trailing newline does not count).
export function isMultiline(text: string): boolean {
  return /[\r\n]/.test(text.replace(/\r?\n$/, ''));
}

export function lineCount(text: string): number {
  return text.replace(/\r?\n$/, '').split(/\r\n|\r|\n/).length;
}
