// OSC 7 payload ("file://host/path") → absolute path, or null if invalid.
export function parseOsc7(payload: string): string | null {
  const match = /^file:\/\/[^/]*(\/.*)$/.exec(payload);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
