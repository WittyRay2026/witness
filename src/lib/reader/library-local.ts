const KEY = "witness-library-ids";

export function readGuestLibrary(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rememberGuestLibrary(videoId: string): void {
  if (typeof window === "undefined") return;
  const next = [videoId, ...readGuestLibrary().filter((id) => id !== videoId)].slice(0, 40);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}
