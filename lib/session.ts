import { cookies } from 'next/headers';
import { AUTH_COOKIE, expectedToken, gateEnabled } from './auth';

/**
 * True when the caller may perform a write: a logged-in browser session, or
 * (for cron/scripts) a matching RUN_SECRET / CRON_SECRET bearer token. When no
 * DASHBOARD_PASSWORD is set the gate is off (local dev) and everything passes.
 */
export async function isAuthorized(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    if (token && (token === process.env.RUN_SECRET || token === process.env.CRON_SECRET)) {
      return true;
    }
  }
  if (!gateEnabled()) return true;
  const jar = await cookies();
  return jar.get(AUTH_COOKIE)?.value === (await expectedToken());
}
