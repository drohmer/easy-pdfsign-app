// Safe localStorage wrappers — Safari private mode and some iframes throw
// SecurityError on first access, which would crash the app on boot.

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}
