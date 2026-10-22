// OSC 7 payload ("file://host/path") → absolute path, or null if invalid.
// Any program output can emit OSC 7, so only reports for this machine's
// hostname are trusted (our shell integration always sends it).
export function parseOsc7(payload: string, localHost: string | undefined): string | null {
  const match = /^file:\/\/([^/]*)(\/.*)$/.exec(payload);
  if (!match?.[2] || !localHost) return null;
  if (match[1]?.toLowerCase() !== localHost.toLowerCase()) return null;
  try {
    return decodeURIComponent(match[2]);
  } catch {
    return null;
  }
}
