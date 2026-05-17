import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE, expectedToken, gateEnabled } from './lib/auth';

export async function middleware(req: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await expectedToken())) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Gate the dashboard pages. /login, /api/* (own auth) and assets are excluded.
  matcher: ['/((?!login|api|_next/static|_next/image|favicon.ico).*)'],
};
