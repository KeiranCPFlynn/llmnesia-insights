export const AUTH_COOKIE = 'dash_auth';

/** Gate is only enforced when a password is configured (off by default for local dev). */
export function gateEnabled(): boolean {
  return !!process.env.DASHBOARD_PASSWORD;
}

/** Stable opaque token derived from the password — what we store in the cookie. */
export async function passwordToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`llmnesia:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function expectedToken(): Promise<string> {
  return passwordToken(process.env.DASHBOARD_PASSWORD ?? '');
}
