export function parseFacebookHandle(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean)[0];
    return seg ? seg.toLowerCase() : null;
  } catch {
    return null;
  }
}
