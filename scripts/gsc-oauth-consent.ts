/**
 * One-time OAuth consent for Google Search Console. The Growth Planner reads
 * GSC `searchAnalytics.query` data as your own Google account (not a service
 * account, because adding a service account as a GSC user is a per-property
 * manual step and brittle for multi-site).
 *
 * One refresh token = access to every GSC property the signing-in account
 * already owns or has access to.
 *
 * Prereqs (done once in Google Cloud Console — re-use the same project as the
 * GA4 OAuth client; the consent screen carries over):
 *   - OAuth client ID of type "Desktop app" created (you can reuse the GA4 one
 *     by adding the GSC scope below; or create a separate one for clarity)
 *   - OAuth consent screen PUBLISHED ("In production") so the refresh token
 *     does not expire after 7 days
 *   - Google Search Console API enabled in the GCP project
 *
 * Usage:
 *   1. Put the client id/secret in .env:
 *        GSC_OAUTH_CLIENT_ID=...
 *        GSC_OAUTH_CLIENT_SECRET=...
 *   2. npx tsx scripts/gsc-oauth-consent.ts
 *   3. A browser opens — sign in as the Google account that owns the GSC
 *      properties, approve read-only Search Console access.
 *   4. Copy the printed refresh token into .env as GSC_OAUTH_REFRESH_TOKEN.
 */
import 'dotenv/config';
import http from 'node:http';
import { exec } from 'node:child_process';
import { OAuth2Client } from 'google-auth-library';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function fail(msg: string): never {
  console.error(`\n[gsc-oauth] ${msg}`);
  process.exit(1);
}

const clientId = process.env.GSC_OAUTH_CLIENT_ID;
const clientSecret = process.env.GSC_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  fail('GSC_OAUTH_CLIENT_ID and GSC_OAUTH_CLIENT_SECRET must be set in .env first.');
}

async function main() {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const oauth = new OAuth2Client({ clientId, clientSecret, redirectUri });
  const authUrl = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token even on re-runs
    scope: [SCOPE],
  });

  console.log('\n[gsc-oauth] Opening browser for consent. Sign in as the Google account that owns the GSC properties.');
  console.log('[gsc-oauth] If it does not open, paste this URL manually:\n');
  console.log(authUrl + '\n');
  exec(`open "${authUrl}"`); // macOS

  const code: string = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '', redirectUri);
      const c = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      res.setHeader('Content-Type', 'text/plain');
      if (err) {
        res.end(`Consent failed: ${err}. You can close this tab.`);
        reject(new Error(err));
        return;
      }
      if (!c) {
        res.end('No code in callback. You can close this tab.');
        reject(new Error('no code'));
        return;
      }
      res.end('Consent received. You can close this tab and return to the terminal.');
      resolve(c);
    });
  });

  server.close();

  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) {
    fail(
      'No refresh_token returned. The consent screen is likely still in "Testing" — ' +
        'publish it ("In production") and re-run.',
    );
  }

  console.log('\n========================================================');
  console.log('Add this line to .env:\n');
  console.log(`GSC_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('\n========================================================');
}

main().catch((e) => fail((e as Error).message));
